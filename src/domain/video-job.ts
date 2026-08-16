import { randomUUID } from "node:crypto";
import { z } from "zod";

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
  | "composing"
  | "completed"
  | "failed"
  | "cancelled";

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
  videoUrl?: string;
  width: 3840;
  height: 2160;
}

export interface VideoJobError {
  code: string;
  message: string;
  retryable: boolean;
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
  output?: VideoJobOutput;
  error?: VideoJobError;
}

const transitions: Record<VideoJobStatus, readonly VideoJobStatus[]> = {
  queued: ["planning", "cancelled", "failed"],
  planning: ["generating", "cancelled", "failed"],
  generating: ["evaluating", "cancelled", "failed"],
  evaluating: ["composing", "cancelled", "failed"],
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

  return {
    ...job,
    ...patch,
    status: nextStatus,
    version: job.version + 1,
    updatedAt: now.toISOString(),
  };
}

export function isTerminalStatus(status: VideoJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function requeueInterruptedVideoJob(job: VideoJob, now = new Date()): VideoJob {
  if (isTerminalStatus(job.status)) throw new Error(`Cannot requeue terminal job ${job.id}`);
  const requeued: VideoJob = {
    ...job,
    status: "queued",
    shots: [],
    version: job.version + 1,
    updatedAt: now.toISOString(),
  };
  delete requeued.plan;
  delete requeued.output;
  delete requeued.error;
  return requeued;
}
