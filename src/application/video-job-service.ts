import {
  createVideoJob,
  createVideoJobSchema,
  isTerminalStatus,
  requeueInterruptedVideoJob,
  transitionVideoJob,
  type CreateVideoJobInput,
  type VideoJob,
} from "../domain/video-job.js";
import type { VideoJobRepository } from "../infrastructure/video-job-repository.js";
import type { WorkflowDispatcher } from "./workflow-dispatcher.js";

export class VideoJobService {
  constructor(
    private readonly repository: VideoJobRepository,
    private readonly dispatcher: WorkflowDispatcher,
  ) {}

  async create(input: unknown): Promise<VideoJob> {
    const parsed = createVideoJobSchema.parse(input);
    if (parsed.idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(parsed.idempotencyKey);
      if (existing) return existing;
    }

    const job = createVideoJob(parsed);
    await this.repository.save(job);
    this.dispatcher.enqueue(job.id);
    return job;
  }

  async get(id: string): Promise<VideoJob | undefined> {
    return this.repository.findById(id);
  }

  async cancel(id: string): Promise<VideoJob | undefined> {
    const job = await this.repository.findById(id);
    if (!job || isTerminalStatus(job.status)) return job;
    const cancelled = transitionVideoJob(job, "cancelled");
    await this.repository.save(cancelled);
    return cancelled;
  }

  async resumePending(): Promise<number> {
    const jobs = await this.repository.listByStatus([
      "queued",
      "planning",
      "generating",
      "evaluating",
      "composing",
    ]);
    for (const job of jobs) {
      const queued = job.status === "queued" ? job : requeueInterruptedVideoJob(job);
      if (queued !== job) await this.repository.save(queued);
      this.dispatcher.enqueue(queued.id);
    }
    return jobs.length;
  }
}

export type { CreateVideoJobInput };
