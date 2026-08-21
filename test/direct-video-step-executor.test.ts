import { describe, expect, it, vi } from "vitest";
import { DirectShotRecipePlanner } from "../src/application/shot-recipe-planner.js";
import { createVideoJob, createVideoJobSchema, type VideoShot } from "../src/domain/video-job.js";
import type { VideoProvider } from "../src/domain/video-provider.js";
import { DirectVideoStepExecutor } from "../src/providers/direct-video-step-executor.js";

describe("DirectVideoStepExecutor", () => {
  it("uses the configured resolution and attempts provider cancellation after abort", async () => {
    const submit = vi.fn<VideoProvider["submit"]>(async () => ({
      provider: "test-provider",
      taskId: "task-1",
      status: "submitted",
    }));
    const cancel = vi.fn<NonNullable<VideoProvider["cancel"]>>(async () => undefined);
    const provider: VideoProvider = {
      name: "test-provider",
      submit,
      getTask: vi.fn(),
      cancel,
    };
    const context = createContext();
    const step = (await new DirectShotRecipePlanner().createRecipe(context)).steps[0]!;
    const executor = new DirectVideoStepExecutor({
      provider,
      pollIntervalMs: 1,
      timeoutMs: 1_000,
      resolution: "720P",
    });
    const controller = new AbortController();

    await expect(
      executor.execute(
        {
          context,
          step,
          execution: {
            stepId: step.id,
            executor: step.executor,
            status: "running",
            attempt: 1,
            assets: [],
          },
          inputAssets: [],
        },
        async () => controller.abort(),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: "720P" }),
      controller.signal,
    );
    expect(cancel).toHaveBeenCalledWith("task-1");
  });
});

function createContext() {
  const job = createVideoJob(
    createVideoJobSchema.parse({ brief: "火山方舟取消测试视频", durationSeconds: 5 }),
  );
  const shot: VideoShot = {
    id: "shot-01",
    index: 0,
    prompt: "测试镜头",
    durationSeconds: 5,
    status: "generating",
    candidates: [],
  };
  return { job, shot, candidateId: "shot-01-candidate-1" };
}
