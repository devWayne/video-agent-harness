import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { VideoJob, VideoJobStatus } from "../domain/video-job.js";
import type { VideoJobRepository } from "./video-job-repository.js";

interface JobRow {
  payload: string;
}

interface StatusCountRow {
  status: VideoJobStatus;
  count: number;
}

const videoJobStatuses: readonly VideoJobStatus[] = [
  "queued",
  "planning",
  "generating",
  "evaluating",
  "persisting",
  "mastering",
  "upscaling",
  "composing",
  "completed",
  "failed",
  "cancelled",
];

export class SqliteVideoJobRepository implements VideoJobRepository {
  readonly #database: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });

    this.#database = new DatabaseSync(filename);
    this.#database.exec("PRAGMA journal_mode = WAL;");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS video_jobs_status_idx ON video_jobs(status);
    `);
  }

  async save(job: VideoJob): Promise<void> {
    this.#database
      .prepare(`
        INSERT INTO video_jobs (id, idempotency_key, status, updated_at, payload)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          idempotency_key = excluded.idempotency_key,
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload = excluded.payload
      `)
      .run(
        job.id,
        job.request.idempotencyKey ?? null,
        job.status,
        job.updatedAt,
        JSON.stringify(job),
      );
  }

  async findById(id: string): Promise<VideoJob | undefined> {
    const row = this.#database
      .prepare("SELECT payload FROM video_jobs WHERE id = ?")
      .get(id) as JobRow | undefined;
    return row ? (JSON.parse(row.payload) as VideoJob) : undefined;
  }

  async findByIdempotencyKey(key: string): Promise<VideoJob | undefined> {
    const row = this.#database
      .prepare("SELECT payload FROM video_jobs WHERE idempotency_key = ?")
      .get(key) as JobRow | undefined;
    return row ? (JSON.parse(row.payload) as VideoJob) : undefined;
  }

  async listByStatus(statuses: readonly VideoJobStatus[]): Promise<VideoJob[]> {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => "?").join(", ");
    const rows = this.#database
      .prepare(`SELECT payload FROM video_jobs WHERE status IN (${placeholders}) ORDER BY updated_at`)
      .all(...statuses) as unknown as JobRow[];
    return rows.map((row) => JSON.parse(row.payload) as VideoJob);
  }

  async isReady(): Promise<boolean> {
    const row = this.#database.prepare("SELECT 1 AS ready").get() as { ready: number } | undefined;
    return row?.ready === 1;
  }

  async countByStatus(): Promise<Record<VideoJobStatus, number>> {
    const counts = Object.fromEntries(videoJobStatuses.map((status) => [status, 0])) as Record<
      VideoJobStatus,
      number
    >;
    const rows = this.#database
      .prepare("SELECT status, COUNT(*) AS count FROM video_jobs GROUP BY status")
      .all() as unknown as StatusCountRow[];
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  }

  close(): void {
    this.#database.close();
  }
}
