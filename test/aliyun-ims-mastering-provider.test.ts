import { describe, expect, it, vi } from "vitest";
import {
  AliyunImsMasteringProvider,
  type IceMediaProducingClient,
} from "../src/providers/aliyun-ims-mastering-provider.js";

describe("AliyunImsMasteringProvider", () => {
  it("builds a sequential 1080P video and audio timeline", async () => {
    const submitMediaProducingJob = vi
      .fn<IceMediaProducingClient["submitMediaProducingJob"]>()
      .mockResolvedValue(
        { body: { jobId: "master-job-1" } } as unknown as Awaited<
          ReturnType<IceMediaProducingClient["submitMediaProducingJob"]>
        >,
      );
    const provider = new AliyunImsMasteringProvider({
      submitMediaProducingJob,
      getMediaProducingJob: vi.fn(),
    });

    await expect(
      provider.submit({
        clientRequestId: "video-job-1/master",
        clips: [
          {
            mediaUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/shot-1.mp4",
            durationSeconds: 5,
          },
          {
            mediaUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/shot-2.mp4",
            durationSeconds: 7,
          },
        ],
        outputMediaUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/master-1080p.mp4",
      }),
    ).resolves.toEqual({
      provider: "aliyun-ims-mastering",
      taskId: "master-job-1",
      status: "submitted",
    });

    const request = submitMediaProducingJob.mock.calls[0]![0];
    const outputMediaConfig = JSON.parse(request.outputMediaConfig!) as Record<string, unknown>;
    expect(outputMediaConfig).toMatchObject({
      MediaURL: "https://bucket.oss-cn-beijing.aliyuncs.com/master-1080p.mp4",
      Width: 1920,
      Height: 1080,
      Video: { Codec: "H.264", Fps: 30, Profile: "high", Crf: 18 },
    });
    expect(outputMediaConfig).not.toHaveProperty("Bitrate");
    const timeline = JSON.parse(request.timeline!) as {
      VideoTracks: Array<{ VideoTrackClips: Array<Record<string, unknown>> }>;
      AudioTracks: Array<{ AudioTrackClips: Array<Record<string, unknown>> }>;
    };
    expect(timeline.VideoTracks[0]!.VideoTrackClips).toMatchObject([
      { TimelineIn: 0, TimelineOut: 5, In: 0, Out: 5 },
      { TimelineIn: 5, TimelineOut: 12, In: 0, Out: 7 },
    ]);
    for (const clip of timeline.VideoTracks[0]!.VideoTrackClips) {
      expect(clip).not.toHaveProperty("Width");
      expect(clip).not.toHaveProperty("Height");
    }
    expect(timeline.AudioTracks[0]!.AudioTrackClips).toHaveLength(2);
  });

  it("normalizes a successful mastering task", async () => {
    const provider = new AliyunImsMasteringProvider({
      submitMediaProducingJob: vi.fn(),
      getMediaProducingJob: vi.fn().mockResolvedValue({
        body: {
          mediaProducingJob: {
            jobId: "master-job-1",
            status: "Success",
            mediaURL: "https://bucket.oss-cn-beijing.aliyuncs.com/master-1080p.mp4",
          },
        },
      }),
    });

    await expect(provider.getTask("master-job-1")).resolves.toEqual({
      provider: "aliyun-ims-mastering",
      taskId: "master-job-1",
      status: "succeeded",
      outputUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/master-1080p.mp4",
    });
  });

  it("rejects cross-region OSS timelines before a paid job is submitted", async () => {
    const submitMediaProducingJob = vi.fn();
    const provider = new AliyunImsMasteringProvider({
      submitMediaProducingJob,
      getMediaProducingJob: vi.fn(),
    });

    await expect(
      provider.submit({
        clientRequestId: "cross-region/master",
        clips: [
          {
            mediaUrl: "https://bucket.oss-cn-shanghai.aliyuncs.com/shot.mp4",
            durationSeconds: 5,
          },
        ],
        outputMediaUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/master.mp4",
      }),
    ).rejects.toMatchObject({ code: "OSS_REGION_MISMATCH", retryable: false });
    expect(submitMediaProducingJob).not.toHaveBeenCalled();
  });
});
