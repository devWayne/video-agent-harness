import {
  isTerminalStatus,
  transitionVideoJob,
  type ShotCandidate,
  type VideoDeliveryState,
  type VideoJob,
  type VideoShot,
} from "../domain/video-job.js";
import { MasteringProviderError } from "../domain/mastering-provider.js";
import { MediaAssetStoreError } from "../domain/media-asset-store.js";
import { UpscaleProviderError } from "../domain/upscale-provider.js";
import {
  VideoProviderError,
  type ProviderTask,
  type VideoProvider,
} from "../domain/video-provider.js";
import type { VideoJobRepository } from "../infrastructure/video-job-repository.js";
import type { CandidateEvaluator } from "./candidate-evaluator.js";
import type { DeliveryPipeline, DeliveryStage } from "./delivery-pipeline.js";
import type { Director } from "./director.js";

export interface WorkflowEngineOptions {
  repository: VideoJobRepository;
  director: Director;
  provider: VideoProvider;
  evaluator: CandidateEvaluator;
  deliveryPipeline: DeliveryPipeline;
  candidatesPerShot: number;
  pollIntervalMs: number;
  providerTimeoutMs: number;
}

export class WorkflowEngine {
  readonly #repository: VideoJobRepository;
  readonly #director: Director;
  readonly #provider: VideoProvider;
  readonly #evaluator: CandidateEvaluator;
  readonly #deliveryPipeline: DeliveryPipeline;
  readonly #candidatesPerShot: number;
  readonly #pollIntervalMs: number;
  readonly #providerTimeoutMs: number;

  constructor(options: WorkflowEngineOptions) {
    this.#repository = options.repository;
    this.#director = options.director;
    this.#provider = options.provider;
    this.#evaluator = options.evaluator;
    this.#deliveryPipeline = options.deliveryPipeline;
    this.#candidatesPerShot = options.candidatesPerShot;
    this.#pollIntervalMs = options.pollIntervalMs;
    this.#providerTimeoutMs = options.providerTimeoutMs;
  }

  async run(jobId: string, signal?: AbortSignal): Promise<void> {
    try {
      let job = await this.#requireRunnableJob(jobId);
      if (isTerminalStatus(job.status)) return;

      if (job.status === "queued") {
        job = transitionVideoJob(job, "planning");
        await this.#repository.save(job);
      }

      if (job.status === "planning") {
        const plan = await this.#director.createPlan(job.request, signal);
        const shots: VideoShot[] = plan.shots.map((shot) => ({
          ...shot,
          status: "queued",
          candidates: [],
        }));
        job = transitionVideoJob(job, "generating", { plan, shots });
        await this.#repository.save(job);
      }

      if (job.status === "generating") {
        for (const shot of job.shots) {
          await this.#completeShot(jobId, shot.id, signal);
        }

        job = await this.#requireRunnableJob(jobId);
        job = transitionVideoJob(job, "evaluating");
        await this.#repository.save(job);
      }

      job = await this.#requireRunnableJob(jobId);
      if (!isDeliveryStatus(job.status)) return;
      const output = await this.#deliveryPipeline.deliver(
        job,
        (stage, delivery) => this.#checkpointDelivery(jobId, stage, delivery),
        signal,
      );
      job = await this.#requireRunnableJob(jobId);
      job = transitionVideoJob(job, "completed", {
        output,
      });
      await this.#repository.save(job);
    } catch (error) {
      await this.#failJob(jobId, error);
    }
  }

  async #completeShot(
    jobId: string,
    shotId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    let job = await this.#requireRunnableJob(jobId);
    let shot = this.#findShot(job, shotId);
    if (shot.status === "completed") return;
    if (shot.status === "queued") {
      job = await this.#replaceShot(job, { ...shot, status: "generating" });
      shot = this.#findShot(job, shotId);
    }

    for (let candidateIndex = 0; candidateIndex < this.#candidatesPerShot; candidateIndex += 1) {
      const candidateId = `${shot.id}-candidate-${candidateIndex + 1}`;
      job = await this.#requireRunnableJob(jobId);
      shot = this.#findShot(job, shotId);
      if (shot.candidates.some((candidate) => candidate.id === candidateId)) continue;

      const submitted = await this.#submitCandidate(job, shot, candidateId, signal);
      await this.#replaceShot(job, {
        ...shot,
        candidates: [...shot.candidates, submitted],
      });
    }

    job = await this.#requireRunnableJob(jobId);
    shot = this.#findShot(job, shotId);
    for (const current of shot.candidates) {
      if (current.status === "succeeded" || current.status === "failed") continue;
      const result = await this.#waitForProviderTask(current.providerTaskId, signal);
      const completed: ShotCandidate =
        result.status === "succeeded" && result.outputUrl
          ? {
              ...current,
              provider: result.provider,
              providerTaskId: result.taskId,
              status: "succeeded",
              outputUrl: result.outputUrl,
            }
          : {
              ...current,
              provider: result.provider,
              providerTaskId: result.taskId,
              status: "failed",
              error: result.errorMessage ?? "Provider task failed without an error message",
            };
      job = await this.#requireRunnableJob(jobId);
      shot = this.#findShot(job, shotId);
      await this.#replaceShot(job, {
        ...shot,
        candidates: shot.candidates.map((candidate) =>
          candidate.id === completed.id ? completed : candidate,
        ),
      });
    }

    job = await this.#requireRunnableJob(jobId);
    shot = this.#findShot(job, shotId);
    const successful = shot.candidates.filter((candidate) => candidate.status === "succeeded");
    if (successful.length === 0) {
      throw new VideoProviderError(
        `Every candidate failed for shot ${shot.id}`,
        "ALL_CANDIDATES_FAILED",
        true,
      );
    }

    const selectedCandidateId =
      shot.selectedCandidateId ?? (await this.#evaluator.select(shot));
    await this.#replaceShot(job, {
      ...shot,
      selectedCandidateId,
      status: "completed",
    });
  }

  async #submitCandidate(
    job: VideoJob,
    shot: VideoShot,
    candidateId: string,
    signal?: AbortSignal,
  ): Promise<ShotCandidate> {
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
    return {
      id: candidateId,
      provider: submitted.provider,
      providerTaskId: submitted.taskId,
      status: submitted.status,
    };
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

  async #checkpointDelivery(
    jobId: string,
    stage: DeliveryStage,
    delivery: VideoDeliveryState,
  ): Promise<void> {
    const job = await this.#requireRunnableJob(jobId);
    const currentRank = deliveryStageRank(job.status);
    const nextRank = deliveryStageRank(stage);
    const updated =
      currentRank >= nextRank
        ? {
            ...job,
            delivery,
            version: job.version + 1,
            updatedAt: new Date().toISOString(),
          }
        : transitionVideoJob(job, stage, { delivery });
    await this.#repository.save(updated);
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
    const operationalError = getOperationalError(error);
    const failed = transitionVideoJob(job, "failed", {
      error: {
        code: operationalError?.code ?? "WORKFLOW_FAILED",
        message: error instanceof Error ? error.message : "Unknown workflow error",
        retryable: operationalError?.retryable ?? false,
        stage: job.status,
      },
    });
    await this.#repository.save(failed);
  }
}

function isDeliveryStatus(status: VideoJob["status"]): boolean {
  return ["evaluating", "persisting", "mastering", "upscaling", "composing"].includes(status);
}

function deliveryStageRank(status: VideoJob["status"]): number {
  switch (status) {
    case "evaluating":
      return 0;
    case "persisting":
      return 1;
    case "mastering":
      return 2;
    case "upscaling":
    case "composing":
      return 3;
    default:
      return -1;
  }
}

function getOperationalError(
  error: unknown,
): { code: string; retryable: boolean } | undefined {
  if (
    error instanceof VideoProviderError ||
    error instanceof MediaAssetStoreError ||
    error instanceof MasteringProviderError ||
    error instanceof UpscaleProviderError
  ) {
    return error;
  }
  return undefined;
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
