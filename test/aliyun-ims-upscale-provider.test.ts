import { describe, expect, it, vi } from "vitest";
import {
  AliyunImsUpscaleProvider,
  type IceMediaConvertClient,
} from "../src/providers/aliyun-ims-upscale-provider.js";

describe("AliyunImsUpscaleProvider", () => {
  it("submits the official SR5 4K template with OSS input and output", async () => {
    const submitMediaConvertJob = vi
      .fn<IceMediaConvertClient["submitMediaConvertJob"]>()
      .mockResolvedValue(
        { body: { job: { jobId: "ims-job-1" } } } as unknown as Awaited<
          ReturnType<IceMediaConvertClient["submitMediaConvertJob"]>
        >,
      );
    const client: IceMediaConvertClient = {
      submitMediaConvertJob,
      getMediaConvertJob: vi.fn(),
    };
    const provider = new AliyunImsUpscaleProvider({ client });

    await expect(
      provider.submit({
        clientRequestId: "video-job-1",
        inputUrl: "https://video-bucket.oss-cn-beijing.aliyuncs.com/masters/job-1-1080p.mp4",
        inputStorageUri: "oss://video-bucket/masters/job-1-1080p.mp4",
        outputStorageUri: "oss://video-bucket/deliveries/job-1-4k.mp4",
        target: "4K",
      }),
    ).resolves.toEqual({ provider: "aliyun-ims-sr5", taskId: "ims-job-1", status: "submitted" });

    const request = submitMediaConvertJob.mock.calls[0]![0];
    expect(request.clientToken).toBe("video-job-1");
    expect(JSON.parse(request.config!)).toEqual({
      Inputs: [
        { InputFile: { Type: "OSS", Media: "oss://video-bucket/masters/job-1-1080p.mp4" } },
      ],
      Outputs: [
        {
          OutputFile: { Type: "OSS", Media: "oss://video-bucket/deliveries/job-1-4k.mp4" },
          TemplateId: "S00000004-401070",
          Name: "sr5-4k",
        },
      ],
    });
  });

  it("normalizes a successful IMS result", async () => {
    const client: IceMediaConvertClient = {
      submitMediaConvertJob: vi.fn(),
      getMediaConvertJob: vi.fn().mockResolvedValue({
        body: {
          job: {
            jobId: "ims-job-1",
            state: "Complete",
            outputDetails: [
              {
                status: "Success",
                result: {
                  outputFile: { type: "OSS", media: "oss://bucket/output-4k.mp4" },
                  outFileMeta: {
                    fileBasicInfo: { width: "3840", height: "2160" },
                  },
                },
              },
            ],
          },
        },
      }),
    };
    const provider = new AliyunImsUpscaleProvider({ client });

    await expect(provider.getTask("ims-job-1")).resolves.toEqual({
      provider: "aliyun-ims-sr5",
      taskId: "ims-job-1",
      status: "succeeded",
      outputUrl: "oss://bucket/output-4k.mp4",
      width: 3840,
      height: 2160,
    });
  });
});
