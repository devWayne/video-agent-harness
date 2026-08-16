import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { StoredMediaAsset } from "./media-asset-store.js";

export const referenceAssetSchema = z.object({
  type: z.enum(["image", "video", "audio"]),
  url: z.url(),
  purpose: z.string().max(200).optional(),
});

export const createVideoJobSchema = z.object({
  brief: z.string().trim().min(3).max(4_000),
  durationSeconds: z.number().int().min(5).max(60).default(15),
  aspectRatio: z.literal("16:9").default("16:9"),
  outputResolution: z.literal("3840x2160").default("3840x2160"),
  references: z.array(referenceAssetSchema).max(20).default([]),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export type CreateVideoJobInput = z.infer<typeof createVideoJobSchema>;
export type VideoJobStatus =
  | "queued"
  | "planning"
  | "generating"
  | "evaluating"
  | "persisting"
  | "mastering"
  | "upscaling"
  | "composing"
  | "completed"
  | "failed"
  | "cancelled";
export type TerminalVideoJobStatus = "completed" | "failed" | "cancelled";

export type ShotStatus = "queued" | "generating" | "completed" | "failed";
export type CandidateStatus = "submitted" | "running" | "succeeded" | "failed";

export interface ShotPlanItem {
  id: string;
  index: number;
  prompt: string;
  durationSeconds: number;
}

export interface VideoPlan {
  title: string;
  creativeDirection: string;
  shots: ShotPlanItem[];
}

export interface ShotCandidate {
  id: string;
  provider: string;
  providerTaskId: string;
  status: CandidateStatus;
  outputUrl?: string;
  error?: string;
}

export interface VideoShot extends ShotPlanItem {
  status: ShotStatus;
  candidates: ShotCandidate[];
  selectedCandidateId?: string;
}

export interface VideoJobOutput {
  manifestUrl: string;
  deliveryMode: "simulation" | "cloud";
  videoUrl?: string;
  storageUri?: string;
  masterVideoUrl?: string;
  width: 3840;
  height: 2160;
}

export interface DeliveryProviderTask {
  provider: string;
  taskId: string;
  status: "submitted" | "running" | "succeeded" | "failed";
  outputUrl?: string;
  width?: number;
  height?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface SelectedStoredAsset extends StoredMediaAsset {
  shotId: string;
  candidateId: string;
  durationSeconds: number;
}

export interface VideoDeliveryState {
  mode: "simulation" | "cloud";
  assets: SelectedStoredAsset[];
  masterTarget?: StoredMediaAsset;
  masterTask?: DeliveryProviderTask;
  upscaleTarget?: StoredMediaAsset;
  upscaleTask?: DeliveryProviderTask;
}

export interface VideoJobError {
  code: string;
  message: string;
  retryable: boolean;
  stage?: Exclude<VideoJobStatus, "completed" | "failed" | "cancelled">;
}

export interface VideoJobEvent {
  at: string;
  type: "created" | "status_changed" | "retry_requested";
  status: VideoJobStatus;
  message?: string;
}

export interface VideoJobCostEstimate {
  currency: "CNY";
  generationSeconds: number;
  upscaleSeconds: number;
  generationRateCnyPerSecond?: number;
  upscaleRateCnyPerSecond?: number;
  generationCny?: number;
  upscaleCny?: number;
  totalCny?: number;
}

export interface VideoJob {
  id: string;
  request: CreateVideoJobInput;
  status: VideoJobStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  plan?: VideoPlan;
  shots: VideoShot[];
  delivery?: VideoDeliveryState;
  output?: VideoJobOutput;
  error?: VideoJobError;
  attempt?: number;
  events?: VideoJobEvent[];
  costEstimate?: VideoJobCostEstimate;
}

const transitions: Record<VideoJobStatus, readonly VideoJobStatus[]> = {
  queued: ["planning", "cancelled", "failed"],
  planning: ["generating", "cancelled", "failed"],
  generating: ["evaluating", "cancelled", "failed"],
  evaluating: ["persisting", "composing", "cancelled", "failed"],
  persisting: ["mastering", "cancelled", "failed"],
  mastering: ["upscaling", "cancelled", "failed"],
  upscaling: ["completed", "cancelled", "failed"],
  composing: ["completed", "cancelled", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function createVideoJob(input: CreateVideoJobInput, now = new Date()): VideoJob {
  const timestamp = now.toISOString();
  return {
    id: randomUUID(),
    request: input,
    status: "queued",
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    shots: [],
    attempt: 1,
    events: [{ at: timestamp, type: "created", status: "queued" }],
  };
}

export function transitionVideoJob(
  job: VideoJob,
  nextStatus: VideoJobStatus,
  patch: Partial<Omit<VideoJob, "id" | "request" | "status" | "createdAt">> = {},
  now = new Date(),
): VideoJob {
  if (!transitions[job.status].includes(nextStatus)) {
    throw new Error(`Invalid video job transition: ${job.status} -> ${nextStatus}`);
  }

  const timestamp = now.toISOString();
  return {
    ...job,
    ...patch,
    status: nextStatus,
    version: job.version + 1,
    updatedAt: timestamp,
    events: [
      ...(job.events ?? []),
      {
        at: timestamp,
        type: "status_changed",
        status: nextStatus,
        message: `${job.status} -> ${nextStatus}`,
      },
    ],
  };
}

export function isTerminalStatus(status: VideoJobStatus): status is TerminalVideoJobStatus {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function retryFailedVideoJob(job: VideoJob, now = new Date()): VideoJob {
  if (job.status !== "failed" || !job.error?.retryable || !job.error.stage) {
    throw new VideoJobRetryError("Job is not eligible for retry");
  }

  const timestamp = now.toISOString();
  const retryStage = job.error.stage;
  const retried: VideoJob = {
    ...job,
    status: retryStage,
    version: job.version + 1,
    updatedAt: timestamp,
    attempt: (job.attempt ?? 1) + 1,
    events: [
      ...(job.events ?? []),
      {
        at: timestamp,
        type: "retry_requested",
        status: retryStage,
        message: `Retrying from ${retryStage}`,
      },
    ],
  };
  delete retried.error;

  if (retryStage === "generating") {
    retried.shots = retried.shots.map((shot) => {
      if (shot.status === "completed") return shot;
      const candidates = shot.candidates.filter((candidate) => candidate.status !== "failed");
      const retryShot: VideoShot = {
        ...shot,
        status: "generating",
        candidates,
      };
      if (!candidates.some((candidate) => candidate.id === shot.selectedCandidateId)) {
        delete retryShot.selectedCandidateId;
      }
      return retryShot;
    });
  }

  return retried;
}

export class VideoJobRetryError extends Error {
  readonly code = "JOB_NOT_RETRYABLE";

  constructor(message: string) {
    super(message);
    this.name = "VideoJobRetryError";
  }
}
