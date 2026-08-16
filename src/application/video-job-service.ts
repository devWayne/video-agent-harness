import {
  createVideoJob,
  createVideoJobSchema,
  isTerminalStatus,
  retryFailedVideoJob,
  transitionVideoJob,
  type CreateVideoJobInput,
  type VideoJob,
  type VideoJobCostEstimate,
  type VideoJobStatus,
} from "../domain/video-job.js";
import type { VideoJobRepository } from "../infrastructure/video-job-repository.js";
import type { MediaDeliverySigner, SignedMediaUrl } from "../domain/media-asset-store.js";
import type { WorkflowDispatcher } from "./workflow-dispatcher.js";

export class VideoJobService {
  constructor(
    private readonly repository: VideoJobRepository,
    private readonly dispatcher: WorkflowDispatcher,
    private readonly options: VideoJobServiceOptions = { candidatesPerShot: 1 },
  ) {}

  async create(input: unknown): Promise<VideoJob> {
    const parsed = createVideoJobSchema.parse(input);
    if (parsed.idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(parsed.idempotencyKey);
      if (existing) return existing;
    }

    const job = {
      ...createVideoJob(parsed),
      costEstimate: estimateCost(parsed.durationSeconds, this.options),
    };
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
    this.dispatcher.cancel(id);
    return cancelled;
  }

  async retry(id: string): Promise<VideoJob | undefined> {
    const job = await this.repository.findById(id);
    if (!job) return undefined;
    const retried = retryFailedVideoJob(job);
    await this.repository.save(retried);
    this.dispatcher.enqueue(retried.id);
    return retried;
  }

  async readiness(): Promise<boolean> {
    return this.repository.isReady();
  }

  async statistics(): Promise<Record<VideoJobStatus, number>> {
    return this.repository.countByStatus();
  }

  async createDownloadUrl(
    id: string,
    expiresSeconds: number,
  ): Promise<SignedMediaUrl | undefined> {
    const job = await this.repository.findById(id);
    if (!job) return undefined;
    if (job.status !== "completed" || !job.output?.storageUri || !this.options.deliverySigner) {
      throw new VideoJobDownloadError("A downloadable cloud delivery is not available");
    }
    return this.options.deliverySigner.signRead(job.output.storageUri, expiresSeconds);
  }

  async resumePending(): Promise<number> {
    const jobs = await this.repository.listByStatus([
      "queued",
      "planning",
      "generating",
      "evaluating",
      "persisting",
      "mastering",
      "upscaling",
      "composing",
    ]);
    for (const job of jobs) {
      this.dispatcher.enqueue(job.id);
    }
    return jobs.length;
  }
}

export type { CreateVideoJobInput };

export interface VideoJobServiceOptions {
  candidatesPerShot: number;
  wanCnyPerSecond?: number;
  upscaleCnyPerSecond?: number;
  deliverySigner?: MediaDeliverySigner;
}

export class VideoJobDownloadError extends Error {
  readonly code = "DELIVERY_NOT_AVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "VideoJobDownloadError";
  }
}

function estimateCost(
  durationSeconds: number,
  options: VideoJobServiceOptions,
): VideoJobCostEstimate {
  const generationSeconds = durationSeconds * options.candidatesPerShot;
  const upscaleSeconds = durationSeconds;
  const estimate: VideoJobCostEstimate = {
    currency: "CNY",
    generationSeconds,
    upscaleSeconds,
  };
  if (options.wanCnyPerSecond !== undefined) {
    estimate.generationRateCnyPerSecond = options.wanCnyPerSecond;
    estimate.generationCny = generationSeconds * options.wanCnyPerSecond;
  }
  if (options.upscaleCnyPerSecond !== undefined) {
    estimate.upscaleRateCnyPerSecond = options.upscaleCnyPerSecond;
    estimate.upscaleCny = upscaleSeconds * options.upscaleCnyPerSecond;
  }
  if (estimate.generationCny !== undefined || estimate.upscaleCny !== undefined) {
    estimate.totalCny = (estimate.generationCny ?? 0) + (estimate.upscaleCny ?? 0);
  }
  return estimate;
}
