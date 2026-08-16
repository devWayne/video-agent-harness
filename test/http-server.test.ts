import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FirstSuccessfulCandidateEvaluator } from "../src/application/candidate-evaluator.js";
import { ManifestDeliveryPipeline } from "../src/application/delivery-pipeline.js";
import { DeterministicDirector } from "../src/application/director.js";
import { ManifestWriter } from "../src/application/manifest-writer.js";
import { VideoJobService } from "../src/application/video-job-service.js";
import { WorkflowDispatcher } from "../src/application/workflow-dispatcher.js";
import { WorkflowEngine } from "../src/application/workflow-engine.js";
import { buildServer } from "../src/http/server.js";
import { SqliteVideoJobRepository } from "../src/infrastructure/sqlite-video-job-repository.js";
import { MockVideoProvider } from "../src/providers/mock-video-provider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("video job HTTP API", () => {
  it("creates an idempotent job and exposes its completed state", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-api-"));
    temporaryDirectories.push(dataDirectory);
    const repository = new SqliteVideoJobRepository(":memory:");
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      provider: new MockVideoProvider(0),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline: new ManifestDeliveryPipeline(new ManifestWriter(dataDirectory)),
      candidatesPerShot: 2,
      pollIntervalMs: 1,
      providerTimeoutMs: 1_000,
    });
    const dispatcher = new WorkflowDispatcher(workflow);
    const service = new VideoJobService(repository, dispatcher);
    const server = buildServer({ service });
    const body = {
      brief: "雨夜里一间温暖的独立书店",
      durationSeconds: 10,
      idempotencyKey: "campaign-42",
    };

    const created = await server.inject({ method: "POST", url: "/v1/video-jobs", payload: body });
    expect(created.statusCode).toBe(202);
    const createdJob = created.json<{ id: string }>();
    const duplicate = await server.inject({ method: "POST", url: "/v1/video-jobs", payload: body });
    expect(duplicate.json<{ id: string }>().id).toBe(createdJob.id);

    await dispatcher.waitForIdle();
    const fetched = await server.inject({ method: "GET", url: `/v1/video-jobs/${createdJob.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<{ status: string }>().status).toBe("completed");
    await server.close();
    repository.close();
  });
});
