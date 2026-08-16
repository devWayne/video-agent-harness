import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  AliyunOssMediaAssetStore,
  type OssStreamClient,
} from "../src/providers/aliyun-oss-media-asset-store.js";

describe("AliyunOssMediaAssetStore", () => {
  it("streams an allowed provider URL into a private OSS object", async () => {
    const putStream = vi.fn<OssStreamClient["putStream"]>(async (_key, stream) => {
      stream.resume();
      await once(stream, "end");
      return {};
    });
    const store = new AliyunOssMediaAssetStore({
      client: { putStream },
      bucket: "video-bucket",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "4" },
        }),
      ),
    });

    await expect(
      store.persistRemote({
        sourceUrl: "https://dashscope-output.oss-cn-beijing.aliyuncs.com/result.mp4?signature=x",
        objectKey: "jobs/job-1/shots/shot-1/candidate-1.mp4",
        mediaType: "video",
      }),
    ).resolves.toEqual({
      storageUri: "oss://video-bucket/jobs/job-1/shots/shot-1/candidate-1.mp4",
      mediaUrl:
        "https://video-bucket.oss-cn-beijing.aliyuncs.com/jobs/job-1/shots/shot-1/candidate-1.mp4",
      objectKey: "jobs/job-1/shots/shot-1/candidate-1.mp4",
      contentType: "video/mp4",
      sizeBytes: 4,
    });
    expect(putStream).toHaveBeenCalledOnce();
    expect(putStream.mock.calls[0]![2]).toMatchObject({
      contentLength: 4,
      mime: "video/mp4",
      headers: { "x-oss-object-acl": "private" },
    });
  });

  it("rejects a remote host outside the provider allowlist", async () => {
    const store = new AliyunOssMediaAssetStore({
      client: { putStream: vi.fn() },
      bucket: "video-bucket",
      endpoint: "oss-cn-beijing.aliyuncs.com",
    });

    await expect(
      store.persistRemote({
        sourceUrl: "https://127.0.0.1/private.mp4",
        objectKey: "jobs/job-1/private.mp4",
        mediaType: "video",
      }),
    ).rejects.toMatchObject({ code: "REMOTE_MEDIA_HOST_NOT_ALLOWED" });
  });

  it("signs only objects in the configured private delivery bucket", async () => {
    const signatureUrl = vi.fn(() => "https://signed.example/final.mp4?signature=secret");
    const store = new AliyunOssMediaAssetStore({
      client: { putStream: vi.fn(), signatureUrl },
      bucket: "video-bucket",
      endpoint: "oss-cn-beijing.aliyuncs.com",
    });

    const signed = await store.signRead(
      "oss://video-bucket/jobs/job-1/deliveries/final-4k.mp4",
      900,
    );

    expect(signed.url).toContain("signature=secret");
    expect(signatureUrl).toHaveBeenCalledWith("jobs/job-1/deliveries/final-4k.mp4", {
      expires: 900,
      method: "GET",
    });
    await expect(
      store.signRead("oss://another-bucket/private.mp4", 900),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_URI" });
  });
});
