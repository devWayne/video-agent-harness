export type UpscaleTaskStatus = "submitted" | "running" | "succeeded" | "failed";

export interface UpscaleRequest {
  clientRequestId: string;
  inputOssUrl: string;
  outputOssUrl: string;
  target: "4K";
}

export interface SubmittedUpscaleTask {
  provider: string;
  taskId: string;
  status: "submitted";
}

export interface UpscaleTask {
  provider: string;
  taskId: string;
  status: UpscaleTaskStatus;
  outputUrl?: string;
  width?: number;
  height?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface UpscaleProvider {
  readonly name: string;
  submit(request: UpscaleRequest): Promise<SubmittedUpscaleTask>;
  getTask(taskId: string): Promise<UpscaleTask>;
}

export class UpscaleProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "UpscaleProviderError";
  }
}
