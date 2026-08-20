import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { VideoJob, VideoJobStatus } from "../domain/video-job.js";
import type { ProductionProject } from "../domain/production-project.js";
import type { ProductionProjectRepository } from "./production-project-repository.js";
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

export class SqliteVideoJobRepository implements VideoJobRepository, ProductionProjectRepository {
  readonly #database: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });

    this.#database = new DatabaseSync(filename);
    this.#database.exec("PRAGMA journal_mode = WAL;");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE,
        project_id TEXT,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS video_jobs_status_idx ON video_jobs(status);
      CREATE TABLE IF NOT EXISTS production_projects (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS production_projects_updated_idx ON production_projects(updated_at);
    `);
    const columns = this.#database.prepare("PRAGMA table_info(video_jobs)").all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "project_id")) {
      this.#database.exec("ALTER TABLE video_jobs ADD COLUMN project_id TEXT;");
    }
    this.#database.exec("CREATE INDEX IF NOT EXISTS video_jobs_project_idx ON video_jobs(project_id, updated_at);");
  }

  async save(job: VideoJob): Promise<void> {
    this.#database
      .prepare(`
        INSERT INTO video_jobs (id, idempotency_key, project_id, status, updated_at, payload)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          idempotency_key = excluded.idempotency_key,
          project_id = excluded.project_id,
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload = excluded.payload
      `)
      .run(
        job.id,
        job.request.idempotencyKey ?? null,
        job.request.projectId ?? null,
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

  async listByProjectId(projectId: string): Promise<VideoJob[]> {
    const rows = this.#database
      .prepare("SELECT payload FROM video_jobs WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId) as unknown as JobRow[];
    return rows.map((row) => JSON.parse(row.payload) as VideoJob);
  }

  async listRecent(limit: number): Promise<VideoJob[]> {
    const rows = this.#database
      .prepare("SELECT payload FROM video_jobs ORDER BY updated_at DESC LIMIT ?")
      .all(limit) as unknown as JobRow[];
    return rows.map((row) => JSON.parse(row.payload) as VideoJob);
  }

  async saveProject(project: ProductionProject): Promise<void> {
    this.#database
      .prepare(`
        INSERT INTO production_projects (id, status, updated_at, payload)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload = excluded.payload
      `)
      .run(project.id, project.status, project.updatedAt, JSON.stringify(project));
  }

  async findProjectById(id: string): Promise<ProductionProject | undefined> {
    const row = this.#database
      .prepare("SELECT payload FROM production_projects WHERE id = ?")
      .get(id) as JobRow | undefined;
    return row ? hydrateProductionProject(JSON.parse(row.payload) as ProductionProject) : undefined;
  }

  async listProjects(): Promise<ProductionProject[]> {
    const rows = this.#database
      .prepare("SELECT payload FROM production_projects ORDER BY updated_at DESC")
      .all() as unknown as JobRow[];
    return rows.map((row) => hydrateProductionProject(JSON.parse(row.payload) as ProductionProject));
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

function hydrateProductionProject(project: ProductionProject): ProductionProject {
  return {
    ...project,
    orchestrationMode: "agent-directed",
    operations: project.operations ?? [],
  };
}
