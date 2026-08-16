import { setTimeout as delay } from "node:timers/promises";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { BailianWanProvider } from "../src/providers/bailian-wan-provider.js";

loadEnv({ path: ".env.local", quiet: true });

const smokeConfigSchema = z.object({
  BAILIAN_BASE_URL: z.url(),
  BAILIAN_API_KEY: z.string().min(1),
  BAILIAN_WAN_MODEL: z.string().min(1).default("wan2.7-t2v"),
  WAN_SMOKE_RESOLUTION: z.enum(["480P", "720P", "1080P"]).default("720P"),
  WAN_SMOKE_DURATION_SECONDS: z.coerce.number().int().min(2).max(30).default(2),
  WAN_SMOKE_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(10 * 60 * 1_000),
  WAN_SMOKE_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(8_000),
});

const environment = smokeConfigSchema.parse(process.env);
const provider = new BailianWanProvider({
  baseUrl: environment.BAILIAN_BASE_URL,
  apiKey: environment.BAILIAN_API_KEY,
  model: environment.BAILIAN_WAN_MODEL,
});

console.log(
  `Submitting ${environment.BAILIAN_WAN_MODEL} smoke task: ${environment.WAN_SMOKE_DURATION_SECONDS}s, ${environment.WAN_SMOKE_RESOLUTION}, 16:9, audio disabled`,
);
const submitted = await provider.submit({
  clientRequestId: `smoke-${Date.now()}`,
  prompt:
    "清晨海面上的金色日出，微风掠过海浪，电影感广角镜头缓慢向前推进，自然光，高细节",
  durationSeconds: environment.WAN_SMOKE_DURATION_SECONDS,
  ratio: "16:9",
  resolution: environment.WAN_SMOKE_RESOLUTION,
  generateAudio: false,
  referenceUrls: [],
});

console.log(`Wan task accepted: ${submitted.taskId}`);
const deadline = Date.now() + environment.WAN_SMOKE_TIMEOUT_MS;
let previousStatus = submitted.status as string;

while (Date.now() < deadline) {
  await delay(environment.WAN_SMOKE_POLL_INTERVAL_MS);
  const task = await provider.getTask(submitted.taskId);
  if (task.status !== previousStatus) {
    console.log(`Wan task status: ${task.status}`);
    previousStatus = task.status;
  }
  if (task.status === "succeeded") {
    if (!task.outputUrl) throw new Error("Wan task succeeded without an output URL");
    console.log(`Wan smoke succeeded; output host: ${safeHost(task.outputUrl)}`);
    process.exit(0);
  }
  if (task.status === "failed") {
    throw new Error(`Wan smoke failed: ${task.errorCode ?? "UNKNOWN"}: ${task.errorMessage ?? ""}`);
  }
}

throw new Error(`Wan smoke timed out after ${environment.WAN_SMOKE_TIMEOUT_MS}ms`);

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "non-http-provider-output";
  }
}
