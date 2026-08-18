import type {
  ShotStepExecutionRequest,
  ShotStepExecutionResult,
  ShotStepExecutor,
} from "../application/candidate-generation-pipeline.js";
import { VideoProviderError, type ProviderTask, type VideoProvider } from "../domain/video-provider.js";

export interface DirectVideoStepExecutorOptions {
  provider: VideoProvider;
  pollIntervalMs: number;
  timeoutMs: number;
}

export class DirectVideoStepExecutor implements ShotStepExecutor {
  readonly id = "video-provider" as const;

  constructor(private readonly options: DirectVideoStepExecutorOptions) {}

  async execute(
    request: ShotStepExecutionRequest,
    checkpointTaskId: (taskId: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<ShotStepExecutionResult> {
    let taskId = request.execution.taskId;
    if (!taskId) {
      const submitted = await this.options.provider.submit(
        {
          clientRequestId: `${request.context.job.id}/${request.context.candidateId}`,
          prompt: request.context.shot.prompt,
          durationSeconds: request.context.shot.durationSeconds,
          resolution: "1080P",
          ratio: "16:9",
          generateAudio: true,
          references: request.context.job.request.references,
        },
        signal,
      );
      taskId = submitted.taskId;
      await checkpointTaskId(taskId);
    }

    const task = await this.#waitForTask(taskId, signal);
    if (task.status !== "succeeded" || !task.outputUrl) {
      throw new VideoProviderError(
        task.errorMessage ?? `Provider task ${taskId} failed without an output URL`,
        task.errorCode ?? "VIDEO_PROVIDER_TASK_FAILED",
        false,
      );
    }

    return {
      taskId,
      assets: [
        {
          id: `${request.context.candidateId}/final-video`,
          role: "final-video",
          mediaType: "video",
          uri: task.outputUrl,
          sourceExecutor: this.id,
          sourceTaskId: taskId,
          metadata: { provider: task.provider },
        },
      ],
    };
  }

  async #waitForTask(taskId: string, signal?: AbortSignal): Promise<ProviderTask> {
    const deadline = Date.now() + this.options.timeoutMs;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const task = await this.options.provider.getTask(taskId, signal);
      if (task.status === "succeeded" || task.status === "failed") return task;
      await delay(this.options.pollIntervalMs, signal);
    }
    throw new VideoProviderError(
      `Provider task ${taskId} timed out after ${this.options.timeoutMs}ms`,
      "PROVIDER_TIMEOUT",
      true,
    );
  }
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
