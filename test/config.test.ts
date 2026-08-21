import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("cloud delivery configuration", () => {
  it("reuses the Beijing Bailian workspace credentials for Qwen Audio voice-over", () => {
    expect(() =>
      loadConfig({ VOICEOVER_PROVIDER: "bailian-qwen-audio" }),
    ).toThrow(/BAILIAN_BASE_URL, BAILIAN_API_KEY/);

    expect(
      loadConfig({
        VOICEOVER_PROVIDER: "bailian-qwen-audio",
        BAILIAN_BASE_URL: "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1",
        BAILIAN_API_KEY: "secret-for-test",
      }),
    ).toMatchObject({
      VOICEOVER_PROVIDER: "bailian-qwen-audio",
      BAILIAN_TTS_MODEL: "qwen-audio-3.0-tts-plus",
      BAILIAN_TTS_VOICE: "longanlingxin",
      BAILIAN_TTS_FORMAT: "wav",
      BAILIAN_TTS_SAMPLE_RATE: 48_000,
      BAILIAN_TTS_ENABLE_AIGC_TAG: true,
    });
  });

  it("requires an Ark key and selects safe Seedance 2.5 defaults", () => {
    expect(() =>
      loadConfig({ GENERATION_PIPELINE: "direct", VIDEO_PROVIDER: "volcengine" }),
    ).toThrow(/ARK_API_KEY/);

    expect(
      loadConfig({
        GENERATION_PIPELINE: "direct",
        VIDEO_PROVIDER: "volcengine",
        ARK_API_KEY: "secret-for-test",
      }),
    ).toMatchObject({
      ARK_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
      ARK_SEEDANCE_MODEL: "doubao-seedance-2-5-260628",
      ARK_WATERMARK: false,
      DIRECT_GENERATION_RESOLUTION: "720P",
      MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES: [
        ".aliyuncs.com",
        ".volces.com",
        ".volccdn.com",
        ".byteimg.com",
      ],
    });
  });

  it("rejects 1080P for the verified Seedance 2.5 direct profile", () => {
    expect(() =>
      loadConfig({
        GENERATION_PIPELINE: "direct",
        VIDEO_PROVIDER: "volcengine",
        ARK_API_KEY: "secret-for-test",
        DIRECT_GENERATION_RESOLUTION: "1080P",
      }),
    ).toThrow(/480P or 720P/);
  });

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

  it("accepts Volcengine VOD AIGC Standard 4K credentials and defaults", () => {
    expect(
      loadConfig({
        DELIVERY_MODE: "cloud",
        UPSCALE_PROVIDER: "volcengine-vod",
        ALIYUN_OSS_BUCKET: "video-bucket",
        VOLCENGINE_VOD_ACCESS_KEY_ID: "test-ak",
        VOLCENGINE_VOD_SECRET_ACCESS_KEY: "test-sk",
        VOLCENGINE_VOD_SPACE_NAME: "video-agent-space",
      }),
    ).toMatchObject({
      UPSCALE_PROVIDER: "volcengine-vod",
      VOLCENGINE_VOD_REGION: "cn-north-1",
      VOLCENGINE_VOD_ENDPOINT: "vod.volcengineapi.com",
      VOLCENGINE_TOS_REGION: "cn-beijing",
      VOLCENGINE_TOS_ENDPOINT: "tos-cn-beijing.volces.com",
      VOLCENGINE_VOD_REPAIR_STRENGTH: 0,
      VOLCENGINE_VOD_SOURCE_URL_EXPIRES_SECONDS: 7200,
      VOLCENGINE_VOD_OUTPUT_URL_EXPIRES_SECONDS: 3600,
    });
  });

  it("requires a separate VOD AK/SK and space for the Volcengine upscaler", () => {
    expect(() =>
      loadConfig({
        DELIVERY_MODE: "cloud",
        UPSCALE_PROVIDER: "volcengine-vod",
        ALIYUN_OSS_BUCKET: "video-bucket",
      }),
    ).toThrow(
      /VOLCENGINE_VOD_ACCESS_KEY_ID, VOLCENGINE_VOD_SECRET_ACCESS_KEY, VOLCENGINE_VOD_SPACE_NAME/,
    );
  });
});
