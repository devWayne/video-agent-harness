import { randomUUID } from "node:crypto";
import type {
  ProviderTask,
  SubmittedProviderTask,
  VideoGenerationRequest,
  VideoProvider,
} from "../domain/video-provider.js";

interface MockTaskState {
  request: VideoGenerationRequest;
  readyAt: number;
}

export class MockVideoProvider implements VideoProvider {
  readonly name = "mock";
  readonly #tasks = new Map<string, MockTaskState>();

  constructor(private readonly latencyMs = 25) {}

  async submit(request: VideoGenerationRequest): Promise<SubmittedProviderTask> {
    const taskId = randomUUID();
    this.#tasks.set(taskId, { request, readyAt: Date.now() + this.latencyMs });
    return { provider: this.name, taskId, status: "submitted" };
  }

  async getTask(taskId: string): Promise<ProviderTask> {
    const task = this.#tasks.get(taskId);
    if (!task) {
      return {
        provider: this.name,
        taskId,
        status: "failed",
        errorCode: "MOCK_TASK_NOT_FOUND",
        errorMessage: `Mock task ${taskId} was not found`,
      };
    }

    if (Date.now() < task.readyAt) {
      return { provider: this.name, taskId, status: "running" };
    }

    return {
      provider: this.name,
      taskId,
      status: "succeeded",
      outputUrl: `mock://video/${task.request.clientRequestId}/${taskId}.mp4`,
    };
  }
}
