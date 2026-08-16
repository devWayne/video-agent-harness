import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("cloud delivery configuration", () => {
  it("accepts matching IMS and public OSS regions", () => {
    expect(
      loadConfig({
        DELIVERY_MODE: "cloud",
        UPSCALE_PROVIDER: "aliyun-ims",
        ALIYUN_OSS_BUCKET: "video-bucket",
        ALIYUN_IMS_REGION: "cn-beijing",
        ALIYUN_OSS_REGION: "oss-cn-beijing",
        ALIYUN_OSS_ENDPOINT: "oss-cn-beijing.aliyuncs.com",
      }),
    ).toMatchObject({ ALIYUN_IMS_REGION: "cn-beijing", ALIYUN_OSS_REGION: "oss-cn-beijing" });
  });

  it("rejects an OSS region that differs from IMS", () => {
    expect(() =>
      loadConfig({
        DELIVERY_MODE: "cloud",
        UPSCALE_PROVIDER: "aliyun-ims",
        ALIYUN_OSS_BUCKET: "video-bucket",
        ALIYUN_IMS_REGION: "cn-beijing",
        ALIYUN_OSS_REGION: "oss-cn-shanghai",
        ALIYUN_OSS_ENDPOINT: "oss-cn-shanghai.aliyuncs.com",
      }),
    ).toThrow(/same region/);
  });

  it("rejects custom and accelerated OSS endpoints that IMS cannot consume", () => {
    expect(() =>
      loadConfig({
        DELIVERY_MODE: "cloud",
        UPSCALE_PROVIDER: "aliyun-ims",
        ALIYUN_OSS_BUCKET: "video-bucket",
        ALIYUN_IMS_REGION: "cn-beijing",
        ALIYUN_OSS_REGION: "oss-cn-beijing",
        ALIYUN_OSS_ENDPOINT: "video.example.com",
      }),
    ).toThrow(/public regional OSS endpoint/);
  });
});
