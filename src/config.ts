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

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_321),
  DATA_DIR: z.string().default(".data"),
  HARNESS_API_KEY: optionalNonEmptyString,
  VIDEO_PROVIDER: z.enum(["mock", "bailian"]).default("mock"),
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
  COST_WAN_CNY_PER_SECOND: optionalNonNegativeNumber,
  COST_4K_CNY_PER_SECOND: optionalNonNegativeNumber,
  DELIVERY_MODE: z.enum(["simulation", "cloud"]).default("simulation"),
  UPSCALE_PROVIDER: z.enum(["none", "aliyun-ims"]).default("none"),
  ALIYUN_IMS_REGION: z.string().default("cn-beijing"),
  ALIYUN_IMS_ENDPOINT: optionalNonEmptyString,
  ALIYUN_IMS_TEMPLATE_4K: z.string().default("S00000004-401070"),
  ALIYUN_OSS_REGION: z.string().default("oss-cn-beijing"),
  ALIYUN_OSS_ENDPOINT: z.string().default("oss-cn-beijing.aliyuncs.com"),
  ALIYUN_OSS_BUCKET: optionalNonEmptyString,
  ALIYUN_OSS_PREFIX: z.string().default("video-agent-harness"),
  MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES: z.string().default(".aliyuncs.com"),
  MEDIA_IMPORT_MAX_BYTES: z.coerce.number().int().min(1).default(2 * 1024 * 1024 * 1024),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = envSchema.parse(environment);

  if (config.VIDEO_PROVIDER === "bailian") {
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

  if (config.DIRECTOR_MODE === "pi" && (!config.DIRECTOR_BASE_URL || !config.DIRECTOR_API_KEY)) {
    throw new Error("DIRECTOR_MODE=pi requires DIRECTOR_BASE_URL, DIRECTOR_API_KEY");
  }

  if (config.DELIVERY_MODE === "cloud") {
    if (!config.ALIYUN_OSS_BUCKET) {
      throw new Error("DELIVERY_MODE=cloud requires ALIYUN_OSS_BUCKET");
    }
    if (config.UPSCALE_PROVIDER !== "aliyun-ims") {
      throw new Error("DELIVERY_MODE=cloud requires UPSCALE_PROVIDER=aliyun-ims");
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
    MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES: config.MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  };
}
