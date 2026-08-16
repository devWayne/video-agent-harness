import { randomUUID } from "node:crypto";
import {
  isTerminalStatus,
  transitionVideoJob,
  type ShotCandidate,
  type VideoJob,
  type VideoShot,
} from "../domain/video-job.js";
import {
  VideoProviderError,
  type ProviderTask,
  type VideoProvider,
} from "../domain/video-provider.js";
import type { VideoJobRepository } from "../infrastructure/video-job-repository.js";
import type { CandidateEvaluator } from "./candidate-evaluator.js";
import type { Composer } from "./composer.js";
import type { Director } from "./director.js";

export interface WorkflowEngineOptions {
  repository: VideoJobRepository;
  director: Director;
  provider: VideoProvider;
  evaluator: CandidateEvaluator;
  composer: Composer;
  candidatesPerShot: number;
  pollIntervalMs: number;
  providerTimeoutMs: number;
}

export class WorkflowEngine {
  readonly #repository: VideoJobRepository;
  readonly #director: Director;
  readonly #provider: VideoProvider;
  readonly #evaluator: CandidateEvaluator;
  readonly #composer: Composer;
  readonly #candidatesPerShot: number;
  readonly #pollIntervalMs: number;
  readonly #providerTimeoutMs: number;

  constructor(options: WorkflowEngineOptions) {
    this.#repository = options.repository;
    this.#director = options.director;
    this.#provider = options.provider;
    this.#evaluator = options.evaluator;
    this.#composer = options.composer;
    this.#candidatesPerShot = options.candidatesPerShot;
    this.#pollIntervalMs = options.pollIntervalMs;
    this.#providerTimeoutMs = options.providerTimeoutMs;
  }

  async run(jobId: string, signal?: AbortSignal): Promise<void> {
    try {
      let job = await this.#requireRunnableJob(jobId);
      if (job.status !== "queued") return;

      job = transitionVideoJob(job, "planning");
      await this.#repository.save(job);
      const plan = await this.#director.createPlan(job.request, signal);
      const shots: VideoShot[] = plan.shots.map((shot) => ({
        ...shot,
        status: "queued",
        candidates: [],
      }));
      job = transitionVideoJob(job, "generating", { plan, shots });
      await this.#repository.save(job);

      for (const shot of job.shots) {
        job = await this.#requireRunnableJob(jobId);
        const currentShot = this.#findShot(job, shot.id);
        const generatingShot: VideoShot = { ...currentShot, status: "generating" };
        job = await this.#replaceShot(job, generatingShot);

        const candidates = await Promise.all(
          Array.from({ length: this.#candidatesPerShot }, (_, candidateIndex) =>
            this.#generateCandidate(job, generatingShot, candidateIndex, signal),
          ),
        );
        const evaluatedShot: VideoShot = { ...generatingShot, candidates };
        const successful = candidates.filter((candidate) => candidate.status === "succeeded");
        if (successful.length === 0) {
          throw new VideoProviderError(
            `Every candidate failed for shot ${shot.id}`,
            "ALL_CANDIDATES_FAILED",
            true,
          );
        }

        evaluatedShot.selectedCandidateId = await this.#evaluator.select(evaluatedShot);
        evaluatedShot.status = "completed";
        job = await this.#replaceShot(job, evaluatedShot);
      }

      job = await this.#requireRunnableJob(jobId);
      job = transitionVideoJob(job, "evaluating");
      await this.#repository.save(job);
      job = transitionVideoJob(job, "composing");
      await this.#repository.save(job);
      const output = await this.#composer.compose(job);
      job = transitionVideoJob(job, "completed", {
        output,
      });
      await this.#repository.save(job);
    } catch (error) {
      await this.#failJob(jobId, error);
    }
  }

  async #generateCandidate(
    job: VideoJob,
    shot: VideoShot,
    candidateIndex: number,
    signal?: AbortSignal,
  ): Promise<ShotCandidate> {
    const candidateId = `${shot.id}-candidate-${candidateIndex + 1}`;
    try {
      const submitted = await this.#provider.submit(
        {
          clientRequestId: `${job.id}/${candidateId}`,
          prompt: shot.prompt,
          durationSeconds: shot.durationSeconds,
          resolution: "1080P",
          ratio: "16:9",
          generateAudio: true,
          referenceUrls: job.request.references.map((reference) => reference.url),
        },
        signal,
      );
      const result = await this.#waitForProviderTask(submitted.taskId, signal);
      if (result.status !== "succeeded" || !result.outputUrl) {
        return {
          id: candidateId,
          provider: result.provider,
          providerTaskId: result.taskId,
          status: "failed",
          error: result.errorMessage ?? "Provider task failed without an error message",
        };
      }

      return {
        id: candidateId,
        provider: result.provider,
        providerTaskId: result.taskId,
        status: "succeeded",
        outputUrl: result.outputUrl,
      };
    } catch (error) {
      return {
        id: candidateId,
        provider: this.#provider.name,
        providerTaskId: randomUUID(),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown provider error",
      };
    }
  }

  async #waitForProviderTask(taskId: string, signal?: AbortSignal): Promise<ProviderTask> {
    const deadline = Date.now() + this.#providerTimeoutMs;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const task = await this.#provider.getTask(taskId, signal);
      if (task.status === "succeeded" || task.status === "failed") return task;
      await delay(this.#pollIntervalMs, signal);
    }

    throw new VideoProviderError(
      `Provider task ${taskId} timed out after ${this.#providerTimeoutMs}ms`,
      "PROVIDER_TIMEOUT",
      true,
    );
  }

  async #replaceShot(job: VideoJob, replacement: VideoShot): Promise<VideoJob> {
    const updated: VideoJob = {
      ...job,
      shots: job.shots.map((shot) => (shot.id === replacement.id ? replacement : shot)),
      version: job.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.#repository.save(updated);
    return updated;
  }

  #findShot(job: VideoJob, shotId: string): VideoShot {
    const shot = job.shots.find((item) => item.id === shotId);
    if (!shot) throw new Error(`Shot ${shotId} was not found in job ${job.id}`);
    return shot;
  }

  async #requireRunnableJob(jobId: string): Promise<VideoJob> {
    const job = await this.#repository.findById(jobId);
    if (!job) throw new Error(`Video job ${jobId} was not found`);
    if (job.status === "cancelled") throw new DOMException("Video job was cancelled", "AbortError");
    return job;
  }

  async #failJob(jobId: string, error: unknown): Promise<void> {
    const job = await this.#repository.findById(jobId);
    if (!job || isTerminalStatus(job.status)) return;
    const providerError = error instanceof VideoProviderError ? error : undefined;
    const failed = transitionVideoJob(job, "failed", {
      error: {
        code: providerError?.code ?? "WORKFLOW_FAILED",
        message: error instanceof Error ? error.message : "Unknown workflow error",
        retryable: providerError?.retryable ?? false,
      },
    });
    await this.#repository.save(failed);
  }
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("Operation aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
