import { resolve } from "node:path";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_321),
  DATA_DIR: z.string().default(".data"),
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
  BAILIAN_WAN_MODEL: z.string().default("wan3.0-video"),
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

  return {
    ...config,
    DATA_DIR: resolve(config.DATA_DIR),
  };
}
