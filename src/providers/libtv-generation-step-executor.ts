import type {
  ShotStepExecutionRequest,
  ShotStepExecutionResult,
  ShotStepExecutor,
} from "../application/candidate-generation-pipeline.js";
import { findMediaUrl, LibTvCliError, type LibTvCanvasClient } from "./libtv-cli-client.js";

export interface LibTvGenerationStepExecutorOptions {
  client: LibTvCanvasClient;
  modelName: string;
  modeType?: "video2video" | "mixed2video";
  resolution?: "720P" | "1080P";
  enableSound?: boolean;
  maximumDurationSeconds?: number;
}

/** Uses only the official LibTV CLI: local control video -> resource node -> V2V node. */
export class LibTvGenerationStepExecutor implements ShotStepExecutor {
  readonly id = "libtv-generation" as const;

  constructor(private readonly options: LibTvGenerationStepExecutorOptions) {}

  async preflight(signal?: AbortSignal): Promise<void> {
    await this.options.client.listNodes(signal);
    await this.options.client.runJson(["model", this.options.modelName], signal);
  }

  async execute(
    request: ShotStepExecutionRequest,
    checkpointTaskId: (taskId: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<ShotStepExecutionResult> {
    const maximumDuration = this.options.maximumDurationSeconds ?? 10;
    if (request.context.shot.durationSeconds > maximumDuration) {
      throw new LibTvCliError(
        `${this.options.modelName} recipe supports at most ${maximumDuration}s per shot`,
        "LIBTV_MODEL_DURATION_NOT_SUPPORTED",
        false,
      );
    }
    const reference = request.inputAssets.find((asset) => asset.role === "motion-reference");
    if (!reference?.localPath) {
      throw new LibTvCliError(
        "LibTV video-reference generation requires a local ComfyUI control asset",
        "LIBTV_LOCAL_REFERENCE_REQUIRED",
        false,
      );
    }

    const baseName = safeName(request.context.candidateId);
    const referenceNodeName = `Harness ${baseName} motion reference`;
    const outputNodeName = `Harness ${baseName} final video`;
    const modeType = this.options.modeType ?? "video2video";
    if (!request.execution.taskId) await checkpointTaskId(outputNodeName);

    let referenceNode = await this.options.client.findNode(referenceNodeName, signal);
    if (!referenceNode) {
      await this.options.client.uploadVideo(referenceNodeName, reference.localPath, signal);
      referenceNode = await this.options.client.findNode(referenceNodeName, signal);
    }
    if (!referenceNode) {
      throw new LibTvCliError(
        `Uploaded LibTV reference node ${referenceNodeName} was not found`,
        "LIBTV_REFERENCE_NODE_MISSING",
        true,
      );
    }

    let outputNode = await this.options.client.findNode(outputNodeName, signal);
    let result: unknown;
    if (!outputNode) {
      result = await this.options.client.runJson(
        [
          "node",
          "create",
          outputNodeName,
          "--type",
          "video",
          ...this.options.client.projectArgs(),
          "--left",
          referenceNodeName,
          "--prompt",
          buildReferencePrompt(request.context.shot.prompt, referenceNodeName),
          "--set",
          `model=${this.options.modelName}`,
          "--set",
          `modeType=${modeType}`,
          "--set",
          "ratio=16:9",
          "--set",
          `resolution=${this.options.resolution ?? "1080P"}`,
          "--set",
          `duration=${request.context.shot.durationSeconds}`,
          ...(modeType === "video2video"
            ? [
                "--set",
                `enableSound=${this.options.enableSound === false ? "off" : "on"}`,
              ]
            : []),
          "--run",
        ],
        signal,
      );
    } else {
      const existing = await this.options.client.getNode(outputNode.nodeKey, signal);
      const existingUrl = findMediaUrl(existing);
      if (existingUrl) return resultFor(request, outputNodeName, existingUrl, modeType);
      result = await this.options.client.runJson(
        ["node", outputNode.nodeKey, ...this.options.client.projectArgs(), "--run"],
        signal,
      );
    }

    outputNode = await this.options.client.findNode(outputNodeName, signal);
    const refreshed = outputNode
      ? await this.options.client.getNode(outputNode.nodeKey, signal)
      : undefined;
    const outputUrl = findMediaUrl(refreshed) ?? findMediaUrl(result);
    if (!outputUrl) {
      throw new LibTvCliError(
        `LibTV node ${outputNodeName} completed without a video URL`,
        "LIBTV_OUTPUT_URL_MISSING",
        true,
      );
    }
    return resultFor(request, outputNodeName, outputUrl, modeType);
  }
}

function resultFor(
  request: ShotStepExecutionRequest,
  taskId: string,
  outputUrl: string,
  modeType: "video2video" | "mixed2video",
): ShotStepExecutionResult {
  return {
    taskId,
    assets: [
      {
        id: `${request.context.candidateId}/final-video`,
        role: "final-video",
        mediaType: "video",
        uri: outputUrl,
        sourceExecutor: "libtv-generation",
        sourceTaskId: taskId,
        metadata: {
          referenceRole: "motion-reference",
          modeType,
        },
      },
    ],
  };
}

function buildReferencePrompt(prompt: string, referenceNodeName: string): string {
  return [
    prompt,
    `以 {{Node "${referenceNodeName}"}} 为动作、镜头轨迹、构图和节奏参考。`,
    "保持角色与美术设定，提高材质、光影、时序稳定性和商业成片质量。",
  ].join(" ");
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
}
