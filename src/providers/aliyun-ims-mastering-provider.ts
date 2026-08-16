import {
  GetMediaProducingJobRequest,
  SubmitMediaProducingJobRequest,
  type GetMediaProducingJobResponse,
  type SubmitMediaProducingJobResponse,
} from "@alicloud/ice20201109";
import {
  MasteringProviderError,
  type MasteringProvider,
  type MasteringRequest,
  type MasteringTask,
  type SubmittedMasteringTask,
} from "../domain/mastering-provider.js";

export interface IceMediaProducingClient {
  submitMediaProducingJob(
    request: SubmitMediaProducingJobRequest,
  ): Promise<SubmitMediaProducingJobResponse>;
  getMediaProducingJob(
    request: GetMediaProducingJobRequest,
  ): Promise<GetMediaProducingJobResponse>;
}

export class AliyunImsMasteringProvider implements MasteringProvider {
  readonly name = "aliyun-ims-mastering";

  constructor(private readonly client: IceMediaProducingClient) {}

  async submit(request: MasteringRequest): Promise<SubmittedMasteringTask> {
    if (request.clips.length === 0) {
      throw new MasteringProviderError("A master requires at least one clip", "EMPTY_TIMELINE", false);
    }
    const outputRegion = ossMediaRegion(request.outputMediaUrl, "outputMediaUrl");
    let cursor = 0;
    const videoTrackClips = request.clips.map((clip) => {
      const clipRegion = ossMediaRegion(clip.mediaUrl, "clip.mediaUrl");
      if (clipRegion !== outputRegion) {
        throw new MasteringProviderError(
          "All IMS mastering inputs and outputs must use the same OSS region",
          "OSS_REGION_MISMATCH",
          false,
        );
      }
      const timelineIn = cursor;
      cursor += clip.durationSeconds;
      return {
        Type: "Video",
        MediaURL: clip.mediaUrl,
        In: 0,
        Out: clip.durationSeconds,
        TimelineIn: timelineIn,
        TimelineOut: cursor,
      };
    });
    const audioTrackClips = videoTrackClips.map(({ MediaURL, In, Out, TimelineIn, TimelineOut }) => ({
      MediaURL,
      In,
      Out,
      TimelineIn,
      TimelineOut,
    }));
    const response = await this.client.submitMediaProducingJob(
      new SubmitMediaProducingJobRequest({
        clientToken: request.clientRequestId.slice(0, 64),
        source: "OpenAPI",
        timeline: JSON.stringify({
          VideoTracks: [{ MainTrack: true, VideoTrackClips: videoTrackClips }],
          AudioTracks: [{ AudioTrackClips: audioTrackClips }],
        }),
        outputMediaTarget: "oss-object",
        outputMediaConfig: JSON.stringify({
          MediaURL: request.outputMediaUrl,
          Width: 1920,
          Height: 1080,
          Video: { Codec: "H.264", Fps: 30, Profile: "high", Crf: 18 },
        }),
        editingProduceConfig: JSON.stringify({
          AutoRegisterInputVodMedia: false,
          AutoRegisterOutputImsMedia: false,
          NeedSnapshot: false,
          NeedSprite: false,
        }),
        userData: JSON.stringify({ clientRequestId: request.clientRequestId }),
      }),
    );
    const taskId = response.body?.jobId;
    if (!taskId) {
      throw new MasteringProviderError(
        "IMS SubmitMediaProducingJob response did not include JobId",
        "INVALID_IMS_MASTER_SUBMIT_RESPONSE",
        false,
      );
    }
    return { provider: this.name, taskId, status: "submitted" };
  }

  async getTask(taskId: string): Promise<MasteringTask> {
    const response = await this.client.getMediaProducingJob(
      new GetMediaProducingJobRequest({ jobId: taskId }),
    );
    const job = response.body?.mediaProducingJob;
    if (!job?.status) {
      throw new MasteringProviderError(
        "IMS GetMediaProducingJob response did not include Status",
        "INVALID_IMS_MASTER_TASK_RESPONSE",
        false,
      );
    }
    const status = normalizeStatus(job.status);
    return {
      provider: this.name,
      taskId: job.jobId ?? taskId,
      status,
      ...(job.mediaURL ? { outputUrl: job.mediaURL } : {}),
      ...(status === "failed"
        ? {
            errorCode: job.code ?? "IMS_MASTERING_FAILED",
            errorMessage: job.message ?? "IMS mastering task failed",
          }
        : {}),
    };
  }
}

function normalizeStatus(status: string): MasteringTask["status"] {
  switch (status.toLowerCase()) {
    case "init":
    case "queuing":
      return "submitted";
    case "processing":
      return "running";
    case "success":
      return "succeeded";
    case "failed":
      return "failed";
    default:
      throw new MasteringProviderError(
        `Unknown IMS mastering status: ${status}`,
        "UNKNOWN_IMS_MASTERING_STATUS",
        true,
      );
  }
}

function ossMediaRegion(value: string, field: string): string {
  const url = new URL(value);
  const match = url.hostname.match(/\.oss-([a-z0-9-]+)\.aliyuncs\.com$/);
  if (url.protocol !== "https:" || !match?.[1]) {
    throw new MasteringProviderError(
      `${field} must be a public regional HTTPS OSS media URL`,
      "INVALID_OSS_MEDIA_URL",
      false,
    );
  }
  return match[1];
}
