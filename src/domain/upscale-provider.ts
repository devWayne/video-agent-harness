export type UpscaleTaskStatus = "submitted" | "running" | "succeeded" | "failed";

export interface UpscaleRequest {
  clientRequestId: string;
  /** Provider-readable HTTPS URL. Cloud callers should sign private inputs first. */
  inputUrl: string;
  /** Native storage URI for providers that read the application's object store directly. */
  inputStorageUri?: string;
  /** Native storage URI for providers that can write directly to the requested target. */
  outputStorageUri?: string;
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
  /** Optional cleanup after the application has durably copied an external provider output. */
  finalize?(task: UpscaleTask): Promise<void>;
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
