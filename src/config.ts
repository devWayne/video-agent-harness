import { resolve } from "node:path";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalNonNegativeNumber = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().min(0).optional(),
);

const optionalHttpUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "Control-surface URLs must use http or https",
  }).optional(),
);

const optionalBoolean = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_321),
  DATA_DIR: z.string().default(".data"),
  HARNESS_API_KEY: optionalNonEmptyString,
  GENERATION_PIPELINE: z.enum(["direct", "comfyui-libtv"]).default("direct"),
  VIDEO_PROVIDER: z.enum(["mock", "bailian", "volcengine"]).default("mock"),
  DIRECT_GENERATION_RESOLUTION: z.enum(["480P", "720P", "1080P"]).optional(),
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).default(25),
  PROVIDER_POLL_INTERVAL_MS: z.coerce.number().int().min(10).default(2_000),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(20 * 60 * 1_000),
  SHOT_CANDIDATES: z.coerce.number().int().min(1).max(3).default(2),
  DIRECTOR_MODE: z.enum(["deterministic", "pi"]).default("deterministic"),
  DIRECTOR_BASE_URL: optionalNonEmptyString,
  DIRECTOR_API_KEY: optionalNonEmptyString,
  DIRECTOR_MODEL: z.string().default("qwen3.7-plus"),
  BAILIAN_REGION: z.string().default("cn-beijing"),
  BAILIAN_WORKSPACE_ID: optionalNonEmptyString,
  BAILIAN_BASE_URL: optionalNonEmptyString,
  BAILIAN_API_KEY: optionalNonEmptyString,
  BAILIAN_WAN_MODEL: z.string().default("wan2.7-t2v"),
  VOICEOVER_PROVIDER: z.enum(["none", "bailian-qwen-audio"]).default("none"),
  BAILIAN_TTS_MODEL: z.literal("qwen-audio-3.0-tts-plus").default("qwen-audio-3.0-tts-plus"),
  BAILIAN_TTS_VOICE: z.string().min(1).default("longanlingxin"),
  BAILIAN_TTS_DEFAULT_INSTRUCTION: z
    .string()
    .min(1)
    .max(128)
    .default(
      "专业商业广告旁白，像真人自然表达，克制而有感染力；卖点清晰，品牌名和结尾口号适度加重，避免夸张播音腔。",
    ),
  BAILIAN_TTS_FORMAT: z.enum(["mp3", "pcm", "wav", "opus"]).default("wav"),
  BAILIAN_TTS_SAMPLE_RATE: z.coerce
    .number()
    .pipe(
      z.union([
        z.literal(8_000),
        z.literal(16_000),
        z.literal(22_050),
        z.literal(24_000),
        z.literal(44_100),
        z.literal(48_000),
      ]),
    )
    .default(48_000),
  BAILIAN_TTS_ENABLE_AIGC_TAG: optionalBoolean.default(true),
  BAILIAN_TTS_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(120_000),
  ARK_BASE_URL: z.string().url().default("https://ark.cn-beijing.volces.com/api/v3"),
  ARK_API_KEY: optionalNonEmptyString,
  ARK_SEEDANCE_MODEL: z.string().default("doubao-seedance-2-5-260628"),
  ARK_WATERMARK: optionalBoolean.default(false),
  COMFYUI_BASE_URL: optionalNonEmptyString,
  COMFYUI_STUDIO_URL: optionalHttpUrl,
  COMFYUI_WORKFLOW_PATH: optionalNonEmptyString,
  COMFYUI_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2_000),
  COMFYUI_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30 * 60 * 1_000),
  LIBTV_CLI_PATH: z.string().min(1).default("libtv"),
  LIBTV_PROJECT_UUID: optionalNonEmptyString,
  LIBTV_STUDIO_URL: optionalHttpUrl,
  LIBTV_MODEL_NAME: z.string().min(1).default("Wan 2.7"),
  LIBTV_MODE_TYPE: z.enum(["video2video", "mixed2video"]).default("video2video"),
  LIBTV_MAX_DURATION_SECONDS: z.coerce.number().int().min(5).max(15).default(10),
  COST_WAN_CNY_PER_SECOND: optionalNonNegativeNumber,
  COST_4K_CNY_PER_SECOND: optionalNonNegativeNumber,
  DELIVERY_MODE: z.enum(["simulation", "cloud"]).default("simulation"),
  UPSCALE_PROVIDER: z.enum(["none", "aliyun-ims", "volcengine-vod"]).default("none"),
  ALIYUN_IMS_REGION: z.string().default("cn-beijing"),
  ALIYUN_IMS_ENDPOINT: optionalNonEmptyString,
  ALIYUN_IMS_TEMPLATE_4K: z.string().default("S00000004-401070"),
  ALIYUN_OSS_REGION: z.string().default("oss-cn-beijing"),
  ALIYUN_OSS_ENDPOINT: z.string().default("oss-cn-beijing.aliyuncs.com"),
  ALIYUN_OSS_BUCKET: optionalNonEmptyString,
  ALIYUN_OSS_PREFIX: z.string().default("video-agent-harness"),
  VOLCENGINE_VOD_ACCESS_KEY_ID: optionalNonEmptyString,
  VOLCENGINE_VOD_SECRET_ACCESS_KEY: optionalNonEmptyString,
  VOLCENGINE_VOD_SESSION_TOKEN: optionalNonEmptyString,
  VOLCENGINE_VOD_SPACE_NAME: optionalNonEmptyString,
  VOLCENGINE_VOD_REGION: z.string().default("cn-north-1"),
  VOLCENGINE_VOD_ENDPOINT: z.string().default("vod.volcengineapi.com"),
  VOLCENGINE_TOS_REGION: z.string().default("cn-beijing"),
  VOLCENGINE_TOS_ENDPOINT: z.string().default("tos-cn-beijing.volces.com"),
  VOLCENGINE_VOD_REPAIR_STRENGTH: z.coerce
    .number()
    .pipe(z.union([z.literal(0), z.literal(1), z.literal(2)]))
    .default(0),
  VOLCENGINE_VOD_SOURCE_URL_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(86_400)
    .default(7_200),
  VOLCENGINE_VOD_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(15_000),
  VOLCENGINE_VOD_OUTPUT_URL_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(86_400)
    .default(3_600),
  MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES: z.string().default(
    ".aliyuncs.com,.volces.com,.volccdn.com,.byteimg.com",
  ),
  MEDIA_IMPORT_MAX_BYTES: z.coerce.number().int().min(1).default(2 * 1024 * 1024 * 1024),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = envSchema.parse(environment);

  if (config.GENERATION_PIPELINE === "direct" && config.VIDEO_PROVIDER === "bailian") {
    const missing = [
      ["BAILIAN_BASE_URL", config.BAILIAN_BASE_URL],
      ["BAILIAN_API_KEY", config.BAILIAN_API_KEY],
    ]
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`VIDEO_PROVIDER=bailian requires ${missing.join(", ")}`);
    }
  }

  if (config.GENERATION_PIPELINE === "direct" && config.VIDEO_PROVIDER === "volcengine") {
    if (!config.ARK_API_KEY) {
      throw new Error("VIDEO_PROVIDER=volcengine requires ARK_API_KEY");
    }
  }

  if (
    config.VOICEOVER_PROVIDER === "bailian-qwen-audio" &&
    (!config.BAILIAN_BASE_URL || !config.BAILIAN_API_KEY)
  ) {
    throw new Error(
      "VOICEOVER_PROVIDER=bailian-qwen-audio requires BAILIAN_BASE_URL, BAILIAN_API_KEY",
    );
  }

  const directGenerationResolution =
    config.DIRECT_GENERATION_RESOLUTION ??
    (config.VIDEO_PROVIDER === "volcengine" ? "720P" : "1080P");
  if (config.VIDEO_PROVIDER === "volcengine" && directGenerationResolution === "1080P") {
    throw new Error("VIDEO_PROVIDER=volcengine requires 480P or 720P direct generation");
  }

  if (config.GENERATION_PIPELINE === "comfyui-libtv") {
    const missing = [
      ["COMFYUI_BASE_URL", config.COMFYUI_BASE_URL],
      ["COMFYUI_WORKFLOW_PATH", config.COMFYUI_WORKFLOW_PATH],
      ["LIBTV_PROJECT_UUID", config.LIBTV_PROJECT_UUID],
    ]
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`GENERATION_PIPELINE=comfyui-libtv requires ${missing.join(", ")}`);
    }
  }

  if (config.DIRECTOR_MODE === "pi" && (!config.DIRECTOR_BASE_URL || !config.DIRECTOR_API_KEY)) {
    throw new Error("DIRECTOR_MODE=pi requires DIRECTOR_BASE_URL, DIRECTOR_API_KEY");
  }

  if (config.DELIVERY_MODE === "cloud") {
    if (!config.ALIYUN_OSS_BUCKET) {
      throw new Error("DELIVERY_MODE=cloud requires ALIYUN_OSS_BUCKET");
    }
    if (config.UPSCALE_PROVIDER === "none") {
      throw new Error(
        "DELIVERY_MODE=cloud requires UPSCALE_PROVIDER=aliyun-ims or volcengine-vod",
      );
    }
    if (config.UPSCALE_PROVIDER === "volcengine-vod") {
      const missing = [
        ["VOLCENGINE_VOD_ACCESS_KEY_ID", config.VOLCENGINE_VOD_ACCESS_KEY_ID],
        ["VOLCENGINE_VOD_SECRET_ACCESS_KEY", config.VOLCENGINE_VOD_SECRET_ACCESS_KEY],
        ["VOLCENGINE_VOD_SPACE_NAME", config.VOLCENGINE_VOD_SPACE_NAME],
      ]
        .filter(([, value]) => value === undefined)
        .map(([name]) => name);
      if (missing.length > 0) {
        throw new Error(`UPSCALE_PROVIDER=volcengine-vod requires ${missing.join(", ")}`);
      }
    }
    const expectedOssRegion = `oss-${config.ALIYUN_IMS_REGION}`;
    if (config.ALIYUN_OSS_REGION !== expectedOssRegion) {
      throw new Error(
        `Cloud delivery requires OSS and IMS in the same region: expected ALIYUN_OSS_REGION=${expectedOssRegion}`,
      );
    }
    const endpoint = config.ALIYUN_OSS_ENDPOINT.includes("://")
      ? new URL(config.ALIYUN_OSS_ENDPOINT)
      : new URL(`https://${config.ALIYUN_OSS_ENDPOINT}`);
    if (endpoint.hostname !== `${expectedOssRegion}.aliyuncs.com`) {
      throw new Error(
        `Cloud delivery requires the public regional OSS endpoint ${expectedOssRegion}.aliyuncs.com`,
      );
    }
  }

  return {
    ...config,
    DATA_DIR: resolve(config.DATA_DIR),
    DIRECT_GENERATION_RESOLUTION: directGenerationResolution,
    ...(config.COMFYUI_WORKFLOW_PATH
      ? { COMFYUI_WORKFLOW_PATH: resolve(config.COMFYUI_WORKFLOW_PATH) }
      : {}),
    MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES: config.MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  };
}
