export type MasteringTaskStatus = "submitted" | "running" | "succeeded" | "failed";

export interface MasteringClip {
  mediaUrl: string;
  durationSeconds: number;
}

export interface MasteringRequest {
  clientRequestId: string;
  clips: MasteringClip[];
  outputMediaUrl: string;
}

export interface SubmittedMasteringTask {
  provider: string;
  taskId: string;
  status: "submitted";
}

export interface MasteringTask {
  provider: string;
  taskId: string;
  status: MasteringTaskStatus;
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface MasteringProvider {
  readonly name: string;
  submit(request: MasteringRequest): Promise<SubmittedMasteringTask>;
  getTask(taskId: string): Promise<MasteringTask>;
}

export class MasteringProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MasteringProviderError";
  }
}
