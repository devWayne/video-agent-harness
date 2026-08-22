import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { loadConfig } from "../src/config.js";
import { MusicProviderError } from "../src/domain/music-provider.js";
import { VolcengineBigMusicProvider } from "../src/providers/volcengine-bigmusic-provider.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const config = loadConfig();
const accessKeyId =
  config.VOLCENGINE_MUSIC_ACCESS_KEY_ID ?? config.VOLCENGINE_VOD_ACCESS_KEY_ID;
const secretAccessKey =
  config.VOLCENGINE_MUSIC_SECRET_ACCESS_KEY ?? config.VOLCENGINE_VOD_SECRET_ACCESS_KEY;
const sessionToken =
  config.VOLCENGINE_MUSIC_SESSION_TOKEN ?? config.VOLCENGINE_VOD_SESSION_TOKEN;
if (!accessKeyId || !secretAccessKey) {
  throw new Error(
    "Set VOLCENGINE_MUSIC_ACCESS_KEY_ID/SECRET_ACCESS_KEY or reuse the configured VOLCENGINE_VOD_* AK/SK",
  );
}

const provider = new VolcengineBigMusicProvider({
  accessKeyId,
  secretAccessKey,
  ...(sessionToken ? { sessionToken } : {}),
  endpoint: config.VOLCENGINE_MUSIC_ENDPOINT,
  region: config.VOLCENGINE_MUSIC_REGION,
  billingMode: config.VOLCENGINE_MUSIC_BILLING_MODE,
  defaultDurationSeconds: config.VOLCENGINE_MUSIC_DEFAULT_DURATION_SECONDS,
  enablePromptRewrite: config.VOLCENGINE_MUSIC_ENABLE_INPUT_REWRITE,
  aigcWatermark: config.VOLCENGINE_MUSIC_AIGC_WATERMARK,
  commercialSafetyPrefix: config.VOLCENGINE_MUSIC_COMMERCIAL_SAFETY_PREFIX,
  requestTimeoutMs: config.VOLCENGINE_MUSIC_REQUEST_TIMEOUT_MS,
});

const argumentsMap = parseArguments(process.argv.slice(2));
let usage;
try {
  usage = await provider.preflight();
} catch (error) {
  if (error instanceof MusicProviderError) {
    const canProceedWithoutPackageQuota =
      argumentsMap.generate &&
      config.VOLCENGINE_MUSIC_BILLING_MODE === "duration" &&
      error.code === "APINoSource";
    if (canProceedWithoutPackageQuota) {
      console.warn(
        JSON.stringify(
          {
            provider: provider.name,
            ok: true,
            warning:
              "No prepaid music quota was found; proceeding with the explicitly requested postpaid duration generation.",
            code: error.code,
            chargedGeneration: false,
            proceedingToPaidGeneration: true,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(
        JSON.stringify(
          {
            provider: provider.name,
            ok: false,
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            chargedGeneration: false,
          },
          null,
          2,
        ),
      );
      process.exit(2);
    }
  } else {
    throw error;
  }
}
if (usage) {
  console.log(JSON.stringify({ provider: provider.name, model: provider.model, usage }, null, 2));
}

if (!argumentsMap.generate) process.exit(0);

const submitted = await provider.submit({
  prompt:
    argumentsMap.prompt ??
    "现代企业科技介绍片，温暖可信、克制高级，95 BPM，钢琴、轻电子节奏与柔和弦乐，给旁白留出中频空间，中段轻微推进，结尾干净自然。",
  durationSeconds: argumentsMap.durationSeconds ?? 60,
  segments: [
    { name: "intro", durationSeconds: 10 },
    { name: "verse", durationSeconds: (argumentsMap.durationSeconds ?? 60) - 25 },
    { name: "outro", durationSeconds: 15 },
  ],
  implicitWatermark: {
    enabled: true,
    contentProducer: "Harmony",
    produceId: `harmony-${Date.now()}`,
  },
});
console.log(JSON.stringify(submitted, null, 2));

const deadline = Date.now() + 10 * 60 * 1_000;
while (Date.now() < deadline) {
  const task = await provider.getTask(submitted.taskId);
  console.log(JSON.stringify(task, null, 2));
  if (task.status === "failed") process.exit(2);
  if (task.status === "succeeded") {
    if (argumentsMap.output && task.audioUrl) {
      const outputPath = resolve(argumentsMap.output);
      const response = await fetch(task.audioUrl, { redirect: "error" });
      if (!response.ok) throw new Error(`Music download failed with HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
      console.log(JSON.stringify({ outputPath, bytes: bytes.byteLength }, null, 2));
    }
    process.exit(0);
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
}

throw new Error(`Timed out waiting for BigMusic task ${submitted.taskId}`);

function parseArguments(values: string[]): {
  generate: boolean;
  prompt?: string;
  durationSeconds?: number;
  output?: string;
} {
  const result: {
    generate: boolean;
    prompt?: string;
    durationSeconds?: number;
    output?: string;
  } = { generate: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (value === "--generate") {
      result.generate = true;
      continue;
    }
    const next = values[index + 1];
    if (value === "--prompt" && next) {
      result.prompt = next;
      index += 1;
      continue;
    }
    if (value === "--duration" && next) {
      const duration = Number.parseInt(next, 10);
      if (!Number.isInteger(duration) || duration < 30 || duration > 120) {
        throw new Error("--duration must be an integer between 30 and 120");
      }
      result.durationSeconds = duration;
      index += 1;
      continue;
    }
    if (value === "--output" && next) {
      result.output = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${value}`);
  }
  return result;
}
