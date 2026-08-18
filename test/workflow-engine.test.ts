import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSuccessfulCandidateEvaluator } from "../src/application/candidate-evaluator.js";
import { RecipeCandidateGenerationPipeline } from "../src/application/candidate-generation-pipeline.js";
import { ManifestDeliveryPipeline } from "../src/application/delivery-pipeline.js";
import type { DeliveryPipeline } from "../src/application/delivery-pipeline.js";
import { DeterministicDirector } from "../src/application/director.js";
import { DirectShotRecipePlanner } from "../src/application/shot-recipe-planner.js";
import { ManifestWriter } from "../src/application/manifest-writer.js";
import { WorkflowEngine } from "../src/application/workflow-engine.js";
import { createVideoJob, createVideoJobSchema } from "../src/domain/video-job.js";
import type { VideoProvider } from "../src/domain/video-provider.js";
import { SqliteVideoJobRepository } from "../src/infrastructure/sqlite-video-job-repository.js";
import { MockVideoProvider } from "../src/providers/mock-video-provider.js";
import { DirectVideoStepExecutor } from "../src/providers/direct-video-step-executor.js";

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
      candidatePipeline: directPipeline(new MockVideoProvider(0)),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline: new ManifestDeliveryPipeline(new ManifestWriter(dataDirectory)),
      candidatesPerShot: 2,
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
    expect(
      completed?.shots.every((shot) =>
        shot.candidates.some(
          (candidate) =>
            candidate.id === shot.selectedCandidateId &&
            candidate.evaluation?.decision === "accept",
        ),
      ),
    ).toBe(true);
    expect(completed?.output).toMatchObject({
      deliveryMode: "simulation",
      width: 3840,
      height: 2160,
    });
    expect(completed?.delivery?.mode).toBe("simulation");
    const manifest = JSON.parse(
      await readFile(fileURLToPath(completed!.output!.manifestUrl), "utf8"),
    ) as { schemaVersion: number; canvas: { width: number; height: number }; shots: unknown[] };
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.canvas).toEqual({ width: 3840, height: 2160, aspectRatio: "16:9" });
    expect(manifest.shots).toHaveLength(2);
    repository.close();
  });

  it("resumes a submitted provider task without paying for a duplicate generation", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-harness-resume-"));
    temporaryDirectories.push(dataDirectory);
    const repository = new SqliteVideoJobRepository(":memory:");
    let submitCalls = 0;
    let getTaskCalls = 0;
    const provider: VideoProvider = {
      name: "recoverable-provider",
      submit: async () => {
        submitCalls += 1;
        return { provider: "recoverable-provider", taskId: "unexpected", status: "submitted" };
      },
      getTask: async (taskId) => {
        getTaskCalls += 1;
        return {
          provider: "recoverable-provider",
          taskId,
          status: "succeeded",
          outputUrl: "https://provider.example/resumed.mp4",
        };
      },
    };
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      candidatePipeline: directPipeline(provider),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline: new ManifestDeliveryPipeline(new ManifestWriter(dataDirectory)),
      candidatesPerShot: 1,
    });
    const created = createVideoJob(
      createVideoJobSchema.parse({ brief: "断点恢复测试视频", durationSeconds: 5 }),
    );
    await repository.save({
      ...created,
      status: "generating",
      plan: {
        title: "断点恢复",
        creativeDirection: "测试",
        shots: [{ id: "shot-01", index: 0, prompt: "镜头", durationSeconds: 5 }],
      },
      shots: [
        {
          id: "shot-01",
          index: 0,
          prompt: "镜头",
          durationSeconds: 5,
          status: "generating",
          candidates: [
            {
              id: "shot-01-candidate-1",
              provider: "direct:direct",
              providerTaskId: "existing-task",
              status: "running",
              recipe: {
                id: "shot-01-candidate-1/direct",
                profile: "direct",
                steps: [
                  {
                    id: "final-generation",
                    kind: "direct-generation",
                    executor: "video-provider",
                    dependsOn: [],
                    inputRoles: [],
                    outputRole: "final-video",
                  },
                ],
              },
              executions: [
                {
                  stepId: "final-generation",
                  executor: "video-provider",
                  status: "running",
                  attempt: 1,
                  taskId: "existing-task",
                  assets: [],
                },
              ],
              assets: [],
            },
          ],
        },
      ],
    });

    await workflow.run(created.id);

    expect(submitCalls).toBe(0);
    expect(getTaskCalls).toBe(1);
    expect((await repository.findById(created.id))?.status).toBe("completed");
    repository.close();
  });

  it("fails before paid generation when cloud delivery preflight is unavailable", async () => {
    const repository = new SqliteVideoJobRepository(":memory:");
    const submit = vi.fn<VideoProvider["submit"]>();
    const deliveryPipeline: DeliveryPipeline = {
      preflight: async () => {
        throw new Error("cloud identity unavailable");
      },
      deliver: vi.fn(),
    };
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      candidatePipeline: directPipeline({ name: "paid-provider", submit, getTask: vi.fn() }),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline,
      candidatesPerShot: 1,
    });
    const job = createVideoJob(
      createVideoJobSchema.parse({ brief: "云凭据预检测试视频", durationSeconds: 5 }),
    );
    await repository.save(job);

    await workflow.run(job.id);

    expect(submit).not.toHaveBeenCalled();
    expect(await repository.findById(job.id)).toMatchObject({
      status: "failed",
      error: { code: "WORKFLOW_FAILED", stage: "queued" },
    });
    repository.close();
  });
});

function directPipeline(provider: VideoProvider) {
  return new RecipeCandidateGenerationPipeline(
    new DirectShotRecipePlanner(),
    [new DirectVideoStepExecutor({ provider, pollIntervalMs: 1, timeoutMs: 1_000 })],
    "direct",
  );
}
