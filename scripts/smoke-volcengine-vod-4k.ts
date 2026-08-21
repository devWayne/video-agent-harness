import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import type { UpscaleTask } from "../src/domain/upscale-provider.js";
import { VolcengineTosOutputStore } from "../src/providers/volcengine-tos-output-store.js";
import {
  VolcengineVodAigcUpscaleProvider,
  VolcengineVodClient,
} from "../src/providers/volcengine-vod-upscale-provider.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const environment = z
  .object({
    VOLCENGINE_VOD_ACCESS_KEY_ID: z.string().min(1),
    VOLCENGINE_VOD_SECRET_ACCESS_KEY: z.string().min(1),
    VOLCENGINE_VOD_SESSION_TOKEN: z.string().min(1).optional(),
    VOLCENGINE_VOD_SPACE_NAME: z.string().min(1),
    VOLCENGINE_VOD_REGION: z.string().min(1).default("cn-north-1"),
    VOLCENGINE_VOD_ENDPOINT: z.string().min(1).default("vod.volcengineapi.com"),
    VOLCENGINE_TOS_REGION: z.string().min(1).default("cn-beijing"),
    VOLCENGINE_TOS_ENDPOINT: z.string().min(1).default("tos-cn-beijing.volces.com"),
    VOLCENGINE_VOD_OUTPUT_URL_EXPIRES_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86_400)
      .default(3_600),
    VOD_4K_SMOKE_SOURCE_URL: z.url(),
    VOD_4K_SMOKE_CONFIRM_PAID: z.literal("YES"),
    VOD_4K_SMOKE_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
    VOD_4K_SMOKE_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(60 * 60 * 1_000),
  })
  .parse(process.env);

const provider = new VolcengineVodAigcUpscaleProvider({
  client: new VolcengineVodClient({
    accessKeyId: environment.VOLCENGINE_VOD_ACCESS_KEY_ID,
    secretAccessKey: environment.VOLCENGINE_VOD_SECRET_ACCESS_KEY,
    ...(environment.VOLCENGINE_VOD_SESSION_TOKEN
      ? { sessionToken: environment.VOLCENGINE_VOD_SESSION_TOKEN }
      : {}),
    region: environment.VOLCENGINE_VOD_REGION,
    endpoint: environment.VOLCENGINE_VOD_ENDPOINT,
  }),
  spaceName: environment.VOLCENGINE_VOD_SPACE_NAME,
  outputSigner: new VolcengineTosOutputStore({
    accessKeyId: environment.VOLCENGINE_VOD_ACCESS_KEY_ID,
    secretAccessKey: environment.VOLCENGINE_VOD_SECRET_ACCESS_KEY,
    ...(environment.VOLCENGINE_VOD_SESSION_TOKEN
      ? { sessionToken: environment.VOLCENGINE_VOD_SESSION_TOKEN }
      : {}),
    region: environment.VOLCENGINE_TOS_REGION,
    endpoint: environment.VOLCENGINE_TOS_ENDPOINT,
  }),
  outputUrlExpiresSeconds: environment.VOLCENGINE_VOD_OUTPUT_URL_EXPIRES_SECONDS,
});

console.log("Checking VOD credentials and space before starting a paid 4K task");
await provider.preflight();
console.log("VOD preflight succeeded; submitting AIGC Standard 4K enhancement");

let task: UpscaleTask = await provider.submit({
  clientRequestId: `vod-4k-smoke-${Date.now()}`,
  inputUrl: environment.VOD_4K_SMOKE_SOURCE_URL,
  target: "4K",
});
let previousStatus: string | undefined;
const deadline = Date.now() + environment.VOD_4K_SMOKE_TIMEOUT_MS;

while (Date.now() < deadline) {
  task = await provider.getTask(task.taskId);
  if (task.status !== previousStatus) {
    console.log(`VOD 4K task status: ${task.status}`);
    previousStatus = task.status;
  }
  if (task.status === "succeeded") {
    try {
      if (!task.outputUrl || task.width !== 3840 || task.height !== 2160) {
        throw new Error("VOD task succeeded without a verified 3840x2160 output");
      }
      console.log(`VOD AIGC Standard 4K succeeded; output host: ${new URL(task.outputUrl).host}`);
      process.exitCode = 0;
    } finally {
      await provider.finalize(task);
      console.log("Temporary VOD media returned to Unpublished status");
    }
    break;
  }
  if (task.status === "failed") {
    throw new Error(
      `VOD 4K smoke failed: ${task.errorCode ?? "UNKNOWN"}: ${task.errorMessage ?? ""}`,
    );
  }
  await delay(environment.VOD_4K_SMOKE_POLL_INTERVAL_MS);
}

if (task.status !== "succeeded") {
  throw new Error(`VOD 4K smoke timed out after ${environment.VOD_4K_SMOKE_TIMEOUT_MS}ms`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
