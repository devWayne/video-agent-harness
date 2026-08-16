export type ProviderTaskStatus = "submitted" | "running" | "succeeded" | "failed";

export interface VideoGenerationRequest {
  clientRequestId: string;
  prompt: string;
  durationSeconds: number;
  resolution: "480P" | "720P" | "1080P";
  ratio: "16:9" | "adaptive";
  generateAudio: boolean;
  referenceUrls: string[];
}

export interface SubmittedProviderTask {
  provider: string;
  taskId: string;
  status: "submitted";
}

export interface ProviderTask {
  provider: string;
  taskId: string;
  status: ProviderTaskStatus;
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface VideoProvider {
  readonly name: string;
  submit(request: VideoGenerationRequest, signal?: AbortSignal): Promise<SubmittedProviderTask>;
  getTask(taskId: string, signal?: AbortSignal): Promise<ProviderTask>;
  cancel?(taskId: string, signal?: AbortSignal): Promise<void>;
}

export class VideoProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VideoProviderError";
  }
}
