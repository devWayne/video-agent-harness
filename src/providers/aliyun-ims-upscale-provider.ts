import {
  GetMediaConvertJobRequest,
  SubmitMediaConvertJobRequest,
  type GetMediaConvertJobResponse,
  type SubmitMediaConvertJobResponse,
} from "@alicloud/ice20201109";
import {
  UpscaleProviderError,
  type SubmittedUpscaleTask,
  type UpscaleProvider,
  type UpscaleRequest,
  type UpscaleTask,
} from "../domain/upscale-provider.js";

export interface IceMediaConvertClient {
  submitMediaConvertJob(request: SubmitMediaConvertJobRequest): Promise<SubmitMediaConvertJobResponse>;
  getMediaConvertJob(request: GetMediaConvertJobRequest): Promise<GetMediaConvertJobResponse>;
}

export interface AliyunImsUpscaleProviderOptions {
  client: IceMediaConvertClient;
  templateId?: string;
}

export class AliyunImsUpscaleProvider implements UpscaleProvider {
  readonly name = "aliyun-ims-sr5";
  readonly #client: IceMediaConvertClient;
  readonly #templateId: string;

  constructor(options: AliyunImsUpscaleProviderOptions) {
    this.#client = options.client;
    this.#templateId = options.templateId ?? "S00000004-401070";
  }

  async submit(request: UpscaleRequest): Promise<SubmittedUpscaleTask> {
    assertOssUrl(request.inputOssUrl, "inputOssUrl");
    assertOssUrl(request.outputOssUrl, "outputOssUrl");
    const config = {
      Inputs: [{ InputFile: { Type: "OSS", Media: request.inputOssUrl } }],
      Outputs: [
        {
          OutputFile: { Type: "OSS", Media: request.outputOssUrl },
          TemplateId: this.#templateId,
          Name: "sr5-4k",
        },
      ],
    };
    const response = await this.#client.submitMediaConvertJob(
      new SubmitMediaConvertJobRequest({
        clientToken: request.clientRequestId,
        config: JSON.stringify(config),
        userData: JSON.stringify({ clientRequestId: request.clientRequestId }),
      }),
    );
    const taskId = response.body?.job?.jobId;
    if (!taskId) {
      throw new UpscaleProviderError(
        "IMS SubmitMediaConvertJob response did not include JobId",
        "INVALID_IMS_SUBMIT_RESPONSE",
        false,
      );
    }
    return { provider: this.name, taskId, status: "submitted" };
  }

  async getTask(taskId: string): Promise<UpscaleTask> {
    const response = await this.#client.getMediaConvertJob(new GetMediaConvertJobRequest({ jobId: taskId }));
    const job = response.body?.job;
    if (!job?.state) {
      throw new UpscaleProviderError(
        "IMS GetMediaConvertJob response did not include Job.State",
        "INVALID_IMS_TASK_RESPONSE",
        false,
      );
    }
    const status = normalizeImsState(job.state);
    const successfulOutput = job.outputDetails?.find((item) => item.status === "Success");
    const outputFile = successfulOutput?.result?.outputFile;
    const outputUrl = outputFile?.url ?? outputFile?.media;
    const fileMeta = successfulOutput?.result?.outFileMeta;
    const videoStream = fileMeta?.videoStreamInfoList?.[0];
    const width = parseDimension(fileMeta?.fileBasicInfo?.width ?? videoStream?.width);
    const height = parseDimension(fileMeta?.fileBasicInfo?.height ?? videoStream?.height);
    return {
      provider: this.name,
      taskId: job.jobId ?? taskId,
      status,
      ...(outputUrl ? { outputUrl } : {}),
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(status === "failed"
        ? {
            errorCode: job.code ?? "IMS_UPSCALE_FAILED",
            errorMessage: job.message ?? "IMS SR5 upscale task failed",
          }
        : {}),
    };
  }
}

function parseDimension(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeImsState(state: string): UpscaleTask["status"] {
  switch (state.toLowerCase()) {
    case "inited":
      return "submitted";
    case "running":
      return "running";
    case "complete":
    case "success":
      return "succeeded";
    case "error":
    case "failed":
    case "cancelled":
    case "canceled":
      return "failed";
    default:
      throw new UpscaleProviderError(
        `Unknown IMS media convert state: ${state}`,
        "UNKNOWN_IMS_TASK_STATE",
        true,
      );
  }
}

function assertOssUrl(value: string, field: string): void {
  if (!value.startsWith("oss://")) {
    throw new UpscaleProviderError(
      `${field} must use the oss:// protocol for IMS media conversion`,
      "INVALID_OSS_URL",
      false,
    );
  }
}
