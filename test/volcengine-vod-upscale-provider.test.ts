import { describe, expect, it, vi } from "vitest";
import {
  VolcengineVodAigcUpscaleProvider,
  VolcengineVodClient,
  createAigcStandard4kRequest,
  type VolcengineVodApiClient,
  type VolcengineVodFetch,
} from "../src/providers/volcengine-vod-upscale-provider.js";

describe("VolcengineVodAigcUpscaleProvider", () => {
  it("imports a signed master, runs AIGC Standard 4K, and returns the 4K playback URL", async () => {
    const client = testClient();
    vi.mocked(client.uploadMediaByUrl).mockResolvedValue({
      Result: { Data: [{ JobId: "url-job-1" }] },
    });
    vi.mocked(client.queryUploadTaskInfo).mockResolvedValue({
      Result: {
        Data: {
          MediaInfoList: [{ JobId: "url-job-1", State: "success", Vid: "input-vid-1" }],
        },
      },
    });
    vi.mocked(client.startExecution).mockResolvedValue({ Result: { RunId: "run-1" } });
    vi.mocked(client.getExecution).mockResolvedValue({
      Result: {
        RunId: "run-1",
        Status: "Success",
        Output: {
          Task: {
            Enhance: {
              File: { Vid: "input-vid-1", FileId: "file-4k" },
              Info: { Width: 3840, Height: 2160 },
            },
          },
        },
      },
    });
    vi.mocked(client.updateMediaPublishStatus).mockResolvedValue({ Result: {} });
    vi.mocked(client.getPlayInfo).mockResolvedValue({
      Result: {
        Vid: "input-vid-1",
        PlayInfoList: [
          {
            FileId: "file-source",
            Definition: "720p",
            MainPlayUrl: "https://play.volccdn.com/source.mp4",
            Width: 1280,
            Height: 720,
          },
          {
            FileId: "file-4k",
            Definition: "4k",
            MainPlayUrl: "https://play.volccdn.com/output-4k.mp4?auth=temporary",
            Width: 3840,
            Height: 2160,
          },
        ],
      },
    });
    const provider = new VolcengineVodAigcUpscaleProvider({
      client,
      spaceName: "video-agent-space",
    });

    const submitted = await provider.submit({
      clientRequestId: "job-1/upscale-4k",
      inputUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/master.mp4?signature=private",
      inputStorageUri: "oss://bucket/master.mp4",
      outputStorageUri: "oss://bucket/final-4k.mp4",
      target: "4K",
    });
    const enhancing = await provider.getTask(submitted.taskId);
    const succeeded = await provider.getTask(enhancing.taskId);
    await provider.finalize(succeeded);

    expect(client.uploadMediaByUrl).toHaveBeenCalledWith({
      SpaceName: "video-agent-space",
      URLSets: [
        {
          SourceUrl:
            "https://bucket.oss-cn-beijing.aliyuncs.com/master.mp4?signature=private",
          Title: "video-agent-job-1-upscale-4k",
          FileExtension: ".mp4",
        },
      ],
    });
    expect(client.startExecution).toHaveBeenCalledWith(
      createAigcStandard4kRequest("input-vid-1", "video-agent-url-job-1", 0),
    );
    expect(enhancing).toMatchObject({
      provider: "volcengine-vod-aigc-standard-4k",
      status: "running",
    });
    expect(enhancing.taskId).not.toBe(submitted.taskId);
    expect(succeeded).toMatchObject({
      provider: "volcengine-vod-aigc-standard-4k",
      status: "succeeded",
      outputUrl: "https://play.volccdn.com/output-4k.mp4?auth=temporary",
      width: 3840,
      height: 2160,
    });
    expect(client.updateMediaPublishStatus).toHaveBeenNthCalledWith(1, {
      Vid: "input-vid-1",
      Status: "Published",
    });
    expect(client.updateMediaPublishStatus).toHaveBeenNthCalledWith(2, {
      Vid: "input-vid-1",
      Status: "Unpublished",
    });
  });

  it("fails before generation when the configured VOD space is inaccessible", async () => {
    const client = testClient();
    vi.mocked(client.getMediaList).mockResolvedValue({
      ResponseMetadata: {
        Error: { Code: "RequestForbidden.AccessDenied", Message: "space access denied" },
      },
    });
    const provider = new VolcengineVodAigcUpscaleProvider({
      client,
      spaceName: "missing-space",
    });

    await expect(provider.preflight()).rejects.toMatchObject({
      code: "RequestForbidden.AccessDenied",
      retryable: false,
    });
  });

  it("resolves and signs the VOD TOS output without requiring a playback domain", async () => {
    const client = testClient();
    vi.mocked(client.uploadMediaByUrl).mockResolvedValue({
      Result: { Data: [{ JobId: "url-job-2" }] },
    });
    vi.mocked(client.queryUploadTaskInfo).mockResolvedValue({
      Result: {
        Data: {
          MediaInfoList: [{ JobId: "url-job-2", State: "success", Vid: "input-vid-2" }],
        },
      },
    });
    vi.mocked(client.startExecution).mockResolvedValue({ Result: { RunId: "run-2" } });
    vi.mocked(client.getExecution).mockResolvedValue({
      Result: {
        RunId: "run-2",
        Status: "Success",
        Output: { Task: { Enhance: { File: { Vid: "input-vid-2", FileId: "file-4k" } } } },
      },
    });
    vi.mocked(client.getMediaInfos).mockResolvedValue({
      Result: {
        MediaInfoList: [
          {
            BasicInfo: { Vid: "input-vid-2", SpaceName: "video-agent-space" },
            TranscodeInfos: [
              {
                FileId: "file-4k",
                StoreUri: "tos-vod-cn-v-example/output-object",
                Format: "MP4",
                Size: 39_588_562,
                VideoStreamMeta: { Width: 3840, Height: 2160 },
              },
            ],
          },
        ],
      },
    });
    vi.mocked(client.updateMediaPublishStatus).mockResolvedValue({ Result: {} });
    const outputSigner = {
      signRead: vi
        .fn()
        .mockReturnValue("https://tos-vod-cn-v-example.tos-cn-beijing.volces.com/output-object?signed=1"),
    };
    const provider = new VolcengineVodAigcUpscaleProvider({
      client,
      spaceName: "video-agent-space",
      outputSigner,
    });

    const submitted = await provider.submit({
      clientRequestId: "job-2/upscale-4k",
      inputUrl: "https://bucket.example.invalid/master.mp4",
      target: "4K",
    });
    const enhancing = await provider.getTask(submitted.taskId);
    const succeeded = await provider.getTask(enhancing.taskId);
    await provider.finalize(succeeded);

    expect(succeeded).toMatchObject({
      status: "succeeded",
      width: 3840,
      height: 2160,
      outputUrl:
        "https://tos-vod-cn-v-example.tos-cn-beijing.volces.com/output-object?signed=1",
    });
    expect(outputSigner.signRead).toHaveBeenCalledWith(
      "tos-vod-cn-v-example/output-object",
      3_600,
    );
    expect(client.getPlayInfo).not.toHaveBeenCalled();
    expect(client.updateMediaPublishStatus).toHaveBeenCalledOnce();
    expect(client.updateMediaPublishStatus).toHaveBeenCalledWith({
      Vid: "input-vid-2",
      Status: "Unpublished",
    });
  });
});

describe("VolcengineVodClient", () => {
  it("signs read-only VOD preflight requests without exposing the secret", async () => {
    const fetchSpy = vi.fn<VolcengineVodFetch>(
      async () =>
        new Response(
          JSON.stringify({
            ResponseMetadata: { RequestId: "request-1" },
            Result: { SpaceName: "video-agent-space", MediaInfoList: [] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const client = new VolcengineVodClient({
      accessKeyId: "test-ak",
      secretAccessKey: "test-secret-that-must-not-appear",
      fetchImpl: fetchSpy,
      now: () => new Date("2026-08-22T01:02:03.000Z"),
    });

    await client.getMediaList({ SpaceName: "video-agent-space", Offset: "0", PageSize: "1" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      "https://vod.volcengineapi.com/?Action=GetMediaList&Offset=0&PageSize=1&SpaceName=video-agent-space&Version=2020-08-01",
    );
    expect(init).toMatchObject({ method: "GET", redirect: "error" });
    if (!init?.headers || init.headers instanceof Headers || Array.isArray(init.headers)) {
      throw new Error("Expected plain request headers");
    }
    const headers = init.headers;
    expect(headers["x-date"]).toBe("20260822T010203Z");
    expect(headers.authorization).toMatch(
      /^HMAC-SHA256 Credential=test-ak\/20260822\/cn-north-1\/vod\/request, SignedHeaders=x-date, Signature=[a-f0-9]{64}$/,
    );
    expect(JSON.stringify({ url, init })).not.toContain("test-secret-that-must-not-appear");
  });
});

function testClient(): VolcengineVodApiClient {
  return {
    uploadMediaByUrl: vi.fn(),
    queryUploadTaskInfo: vi.fn(),
    startExecution: vi.fn(),
    getExecution: vi.fn(),
    getPlayInfo: vi.fn(),
    updateMediaPublishStatus: vi.fn(),
    getMediaList: vi.fn(),
    getMediaInfos: vi.fn(),
  };
}
