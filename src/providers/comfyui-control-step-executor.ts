import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ShotStepExecutionRequest,
  ShotStepExecutionResult,
  ShotStepExecutor,
} from "../application/candidate-generation-pipeline.js";
import { ComfyUiError, type ComfyUiClient } from "./comfyui-client.js";

export interface ComfyUiControlClient {
  submit(
    workflow: Record<string, unknown>,
    clientId: string,
    signal?: AbortSignal,
  ): Promise<string>;
  getPromptState(
    promptId: string,
    signal?: AbortSignal,
  ): ReturnType<ComfyUiClient["getPromptState"]>;
  download(
    file: Parameters<ComfyUiClient["download"]>[0],
    targetPath: string,
    signal?: AbortSignal,
  ): Promise<void>;
  outputUrl(file: Parameters<ComfyUiClient["outputUrl"]>[0]): string;
  systemStats?(signal?: AbortSignal): Promise<unknown>;
}

export interface ComfyUiControlStepExecutorOptions {
  client: ComfyUiControlClient;
  workflowPath: string;
  outputDirectory: string;
  pollIntervalMs: number;
  timeoutMs: number;
  width?: number;
  height?: number;
  framesPerSecond?: number;
}

export class ComfyUiControlStepExecutor implements ShotStepExecutor {
  readonly id = "comfyui-control" as const;

  constructor(private readonly options: ComfyUiControlStepExecutorOptions) {}

  async preflight(signal?: AbortSignal): Promise<void> {
    const source = await readFile(this.options.workflowPath, "utf8");
    const parsed = JSON.parse(source) as unknown;
    if (!isRecord(parsed)) throw new Error("ComfyUI workflow must be a JSON object in API format");
    await this.options.client.systemStats?.(signal);
  }

  async execute(
    request: ShotStepExecutionRequest,
    checkpointTaskId: (taskId: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<ShotStepExecutionResult> {
    let promptId = request.execution.taskId;
    if (!promptId) {
      const workflow = await this.#loadWorkflow(request);
      promptId = await this.options.client.submit(
        workflow,
        `${request.context.job.id}/${request.context.candidateId}`,
        signal,
      );
      await checkpointTaskId(promptId);
    }

    const output = await this.#waitForOutput(promptId, signal);
    const suffix = extname(output.filename) || ".mp4";
    const localPath = join(
      this.options.outputDirectory,
      request.context.job.id,
      `${safeSegment(request.context.candidateId)}-${safeSegment(request.step.id)}${suffix}`,
    );
    await this.options.client.download(output, localPath, signal);

    return {
      taskId: promptId,
      assets: [
        {
          id: `${request.context.candidateId}/${request.step.outputRole}`,
          role: request.step.outputRole,
          mediaType: "video",
          uri: pathToFileURL(localPath).href,
          localPath,
          sourceExecutor: this.id,
          sourceTaskId: promptId,
          metadata: {
            comfyOutputUrl: this.options.client.outputUrl(output),
            workflowPath: this.options.workflowPath,
          },
        },
      ],
    };
  }

  async #loadWorkflow(request: ShotStepExecutionRequest): Promise<Record<string, unknown>> {
    const source = await readFile(this.options.workflowPath, "utf8");
    const parsed = JSON.parse(source) as unknown;
    if (!isRecord(parsed)) throw new Error("ComfyUI workflow must be a JSON object in API format");
    const fps = this.options.framesPerSecond ?? 24;
    return replaceTokens(parsed, {
      HARNESS_PROMPT: request.context.shot.prompt,
      HARNESS_DURATION_SECONDS: request.context.shot.durationSeconds,
      HARNESS_FRAME_COUNT: request.context.shot.durationSeconds * fps + 1,
      HARNESS_FPS: fps,
      HARNESS_WIDTH: this.options.width ?? 1280,
      HARNESS_HEIGHT: this.options.height ?? 720,
      HARNESS_SEED: deterministicSeed(request.context.candidateId),
      HARNESS_CLIENT_REQUEST_ID: `${request.context.job.id}/${request.context.candidateId}`,
    }) as Record<string, unknown>;
  }

  async #waitForOutput(promptId: string, signal?: AbortSignal) {
    const deadline = Date.now() + this.options.timeoutMs;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const state = await this.options.client.getPromptState(promptId, signal);
      if (state.status === "succeeded") return state.file;
      if (state.status === "failed") {
        throw new ComfyUiError(state.error, "COMFYUI_EXECUTION_FAILED", false);
      }
      await delay(this.options.pollIntervalMs, signal);
    }
    throw new ComfyUiError(
      `ComfyUI prompt ${promptId} timed out after ${this.options.timeoutMs}ms`,
      "COMFYUI_TIMEOUT",
      true,
    );
  }
}

function replaceTokens(value: unknown, variables: Record<string, string | number>): unknown {
  if (typeof value === "string") {
    const exact = /^\{\{([A-Z0-9_]+)\}\}$/.exec(value);
    if (exact?.[1] && exact[1] in variables) return variables[exact[1]];
    return Object.entries(variables).reduce(
      (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, String(replacement)),
      value,
    );
  }
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, variables));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceTokens(item, variables)]),
    );
  }
  return value;
}

function deterministicSeed(value: string): number {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("Operation aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
