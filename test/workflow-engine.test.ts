import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FirstSuccessfulCandidateEvaluator } from "../src/application/candidate-evaluator.js";
import { ManifestComposer } from "../src/application/composer.js";
import { DeterministicDirector } from "../src/application/director.js";
import { WorkflowEngine } from "../src/application/workflow-engine.js";
import { createVideoJob, createVideoJobSchema } from "../src/domain/video-job.js";
import { SqliteVideoJobRepository } from "../src/infrastructure/sqlite-video-job-repository.js";
import { MockVideoProvider } from "../src/providers/mock-video-provider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("WorkflowEngine", () => {
  it("runs a brief through planning, two candidates per shot, and a 4K manifest", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-harness-"));
    temporaryDirectories.push(dataDirectory);
    const repository = new SqliteVideoJobRepository(":memory:");
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      provider: new MockVideoProvider(0),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      composer: new ManifestComposer(dataDirectory),
      candidatesPerShot: 2,
      pollIntervalMs: 1,
      providerTimeoutMs: 1_000,
    });
    const job = createVideoJob(
      createVideoJobSchema.parse({ brief: "一辆复古跑车沿海岸公路驶向日落", durationSeconds: 15 }),
    );
    await repository.save(job);

    await workflow.run(job.id);

    const completed = await repository.findById(job.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.shots).toHaveLength(2);
    expect(completed?.shots.every((shot) => shot.candidates.length === 2)).toBe(true);
    expect(completed?.shots.every((shot) => shot.selectedCandidateId)).toBe(true);
    expect(completed?.output).toMatchObject({ width: 3840, height: 2160 });
    const manifest = JSON.parse(
      await readFile(fileURLToPath(completed!.output!.manifestUrl), "utf8"),
    ) as { canvas: { width: number; height: number }; shots: unknown[] };
    expect(manifest.canvas).toEqual({ width: 3840, height: 2160, aspectRatio: "16:9" });
    expect(manifest.shots).toHaveLength(2);
    repository.close();
  });
});
