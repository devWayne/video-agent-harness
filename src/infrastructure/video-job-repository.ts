import type { VideoJob, VideoJobStatus } from "../domain/video-job.js";

export interface VideoJobRepository {
  save(job: VideoJob): Promise<void>;
  findById(id: string): Promise<VideoJob | undefined>;
  findByIdempotencyKey(key: string): Promise<VideoJob | undefined>;
  listByStatus(statuses: readonly VideoJobStatus[]): Promise<VideoJob[]>;
  isReady(): Promise<boolean>;
  countByStatus(): Promise<Record<VideoJobStatus, number>>;
}
