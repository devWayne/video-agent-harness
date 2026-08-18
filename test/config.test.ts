import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("cloud delivery configuration", () => {
  it("requires every endpoint needed by the ComfyUI to LibTV recipe", () => {
    expect(() => loadConfig({ GENERATION_PIPELINE: "comfyui-libtv" })).toThrow(
      /COMFYUI_BASE_URL, COMFYUI_WORKFLOW_PATH, LIBTV_PROJECT_UUID/,
    );
    expect(
      loadConfig({
        GENERATION_PIPELINE: "comfyui-libtv",
        COMFYUI_BASE_URL: "http://comfyui.test:8188",
        COMFYUI_WORKFLOW_PATH: "./workflows/h3-api.json",
        LIBTV_PROJECT_UUID: "11111111-2222-3333-4444-555555555555",
      }),
    ).toMatchObject({
      GENERATION_PIPELINE: "comfyui-libtv",
      LIBTV_MODEL_NAME: "Wan 2.7",
      LIBTV_MODE_TYPE: "video2video",
      LIBTV_MAX_DURATION_SECONDS: 10,
    });
  });

  it("allows only browser-safe control-surface links", () => {
    expect(() => loadConfig({ COMFYUI_STUDIO_URL: "javascript:alert(1)" })).toThrow(
      /http or https/,
    );
    expect(loadConfig({ LIBTV_STUDIO_URL: "https://www.liblib.tv/project/example" })).toMatchObject({
      LIBTV_STUDIO_URL: "https://www.liblib.tv/project/example",
    });
  });

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
