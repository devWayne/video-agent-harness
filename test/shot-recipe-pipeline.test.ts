import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RecipeCandidateGenerationPipeline,
  type CandidateGenerationContext,
  type ShotStepExecutor,
} from "../src/application/candidate-generation-pipeline.js";
import { ComfyUiLibTvShotRecipePlanner } from "../src/application/shot-recipe-planner.js";
import { createVideoJob, createVideoJobSchema, type VideoShot } from "../src/domain/video-job.js";
import {
  ComfyUiControlStepExecutor,
  type ComfyUiControlClient,
} from "../src/providers/comfyui-control-step-executor.js";
import {
  LibTvGenerationStepExecutor,
} from "../src/providers/libtv-generation-step-executor.js";
import type {
  LibTvCanvasClient,
  LibTvNodeSummary,
} from "../src/providers/libtv-cli-client.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("ComfyUI -> LibTV shot recipe", () => {
  it("persists the control asset and passes it to the final-generation step", async () => {
    const planner = new ComfyUiLibTvShotRecipePlanner();
    const control = vi.fn<ShotStepExecutor["execute"]>(async (request) => ({
      taskId: "comfy-prompt-1",
      assets: [
        {
          id: `${request.context.candidateId}/motion-reference`,
          role: "motion-reference",
          mediaType: "video",
          uri: "file:///tmp/control.mp4",
          localPath: "/tmp/control.mp4",
          sourceExecutor: "comfyui-control",
        },
      ],
    }));
    const final = vi.fn<ShotStepExecutor["execute"]>(async (request) => {
      expect(request.inputAssets).toMatchObject([
        { role: "motion-reference", localPath: "/tmp/control.mp4" },
      ]);
      return {
        taskId: "libtv-final-node",
        assets: [
          {
            id: `${request.context.candidateId}/final-video`,
            role: "final-video",
            mediaType: "video",
            uri: "https://libtv.example/final.mp4",
            sourceExecutor: "libtv-generation",
          },
        ],
      };
    });
    const pipeline = new RecipeCandidateGenerationPipeline(
      planner,
      [
        { id: "comfyui-control", execute: control },
        { id: "libtv-generation", execute: final },
      ],
      "controlled",
    );
    const context = createContext();
    const initialized = await pipeline.initialize(context);
    const checkpoints: string[] = [];
    const completed = await pipeline.execute(context, initialized, async (candidate) => {
      checkpoints.push(candidate.status);
    });

    expect(completed).toMatchObject({
      status: "succeeded",
      outputUrl: "https://libtv.example/final.mp4",
      recipe: { profile: "comfyui-libtv" },
      executions: [
        { stepId: "control-pass", status: "succeeded" },
        { stepId: "final-generation", status: "succeeded" },
      ],
    });
    expect(control).toHaveBeenCalledOnce();
    expect(final).toHaveBeenCalledOnce();
    expect(checkpoints.at(-1)).toBe("succeeded");
  });

  it("materializes typed Harness tokens in a ComfyUI API workflow", async () => {
    const directory = await mkdtemp(join(tmpdir(), "comfy-recipe-"));
    temporaryDirectories.push(directory);
    const workflowPath = join(directory, "workflow.json");
    await writeFile(
      workflowPath,
      JSON.stringify({
        "1": {
          class_type: "HarnessTest",
          inputs: {
            prompt: "{{HARNESS_PROMPT}}",
            frames: "{{HARNESS_FRAME_COUNT}}",
            width: "{{HARNESS_WIDTH}}",
          },
        },
      }),
    );
    let submittedWorkflow: Record<string, unknown> | undefined;
    const client: ComfyUiControlClient = {
      submit: async (workflow) => {
        submittedWorkflow = workflow;
        return "prompt-1";
      },
      getPromptState: async () => ({
        status: "succeeded",
        file: { filename: "control.mp4", subfolder: "", type: "output" },
      }),
      download: async (_file, target) => {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, "video");
      },
      outputUrl: () => "http://comfyui.test/view?filename=control.mp4",
    };
    const executor = new ComfyUiControlStepExecutor({
      client,
      workflowPath,
      outputDirectory: join(directory, "downloads"),
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });
    const context = createContext();
    const recipe = await new ComfyUiLibTvShotRecipePlanner().createRecipe(context);
    const result = await executor.execute(
      {
        context,
        step: recipe.steps[0]!,
        execution: {
          stepId: "control-pass",
          executor: "comfyui-control",
          status: "running",
          attempt: 1,
          assets: [],
        },
        inputAssets: [],
      },
      vi.fn(),
    );

    expect(submittedWorkflow).toMatchObject({
      "1": { inputs: { prompt: context.shot.prompt, frames: 121, width: 1280 } },
    });
    expect(result.assets[0]).toMatchObject({
      role: "motion-reference",
      sourceExecutor: "comfyui-control",
    });
  });

  it("uploads the ComfyUI video and creates a LibTV video2video node", async () => {
    const nodes: LibTvNodeSummary[] = [];
    const runJson = vi.fn<LibTvCanvasClient["runJson"]>(async (args) => {
      const outputName = args[2]!;
      nodes.push({
        nodeKey: "final-node-key",
        name: outputName,
        type: "video",
        raw: { nodeKey: "final-node-key", name: outputName },
      });
      return { nodeKey: "final-node-key", data: { url: ["https://libtv.example/final.mp4"] } };
    });
    const uploadVideo = vi.fn<LibTvCanvasClient["uploadVideo"]>(async (name) => {
      nodes.push({ nodeKey: "reference-key", name, type: "video", raw: { name } });
      return { nodeKey: "reference-key", name };
    });
    const client: LibTvCanvasClient = {
      runJson,
      listNodes: async () => nodes,
      findNode: async (name) => nodes.find((node) => node.name === name),
      getNode: async (node) =>
        node === "final-node-key"
          ? { nodeKey: node, data: { url: ["https://libtv.example/final.mp4"] } }
          : { nodeKey: node },
      uploadVideo,
      projectArgs: () => ["--project", "project-uuid"],
    };
    const context = createContext();
    const recipe = await new ComfyUiLibTvShotRecipePlanner().createRecipe(context);
    const executor = new LibTvGenerationStepExecutor({
      client,
      modelName: "Wan 2.7",
      modeType: "video2video",
    });
    const result = await executor.execute(
      {
        context,
        step: recipe.steps[1]!,
        execution: {
          stepId: "final-generation",
          executor: "libtv-generation",
          status: "running",
          attempt: 1,
          assets: [],
        },
        inputAssets: [
          {
            id: "motion",
            role: "motion-reference",
            mediaType: "video",
            uri: "file:///tmp/control.mp4",
            localPath: "/tmp/control.mp4",
            sourceExecutor: "comfyui-control",
          },
        ],
      },
      vi.fn(),
    );

    expect(uploadVideo).toHaveBeenCalledWith(
      expect.stringContaining("motion reference"),
      "/tmp/control.mp4",
      undefined,
    );
    expect(runJson.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "--type",
        "video",
        "model=Wan 2.7",
        "modeType=video2video",
        "resolution=1080P",
      ]),
    );
    expect(result.assets[0]?.uri).toBe("https://libtv.example/final.mp4");
  });
});

function createContext(): CandidateGenerationContext {
  const job = createVideoJob(
    createVideoJobSchema.parse({ brief: "动态人物品牌短片", durationSeconds: 5 }),
  );
  const shot: VideoShot = {
    id: "shot-01",
    index: 0,
    prompt: "人物向前奔跑，镜头快速跟随并环绕",
    durationSeconds: 5,
    status: "generating",
    candidates: [],
  };
  return { job, shot, candidateId: "shot-01-candidate-1" };
}
