import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { VolcengineSeedanceProvider } from "../src/providers/volcengine-seedance-provider.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const environment = z
  .object({
    ARK_API_KEY: z.string().min(1),
    ARK_BASE_URL: z
      .url()
      .default("https://ark.cn-beijing.volces.com/api/v3"),
    ARK_SEEDANCE_MODEL: z.string().min(1).default("doubao-seedance-2-5-260628"),
    SEEDANCE_SMOKE_PROMPT: z
      .string()
      .min(3)
      .default("清晨薄雾中的湖面，一艘小船缓慢前行，写实电影镜头，自然环境声"),
    SEEDANCE_SMOKE_DURATION_SECONDS: z.coerce.number().int().min(4).max(30).default(4),
    SEEDANCE_SMOKE_RESOLUTION: z.enum(["480P", "720P"]).default("480P"),
    SEEDANCE_SMOKE_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
    SEEDANCE_SMOKE_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(20 * 60 * 1_000),
  })
  .parse(process.env);

const provider = new VolcengineSeedanceProvider({
  baseUrl: environment.ARK_BASE_URL,
  apiKey: environment.ARK_API_KEY,
  model: environment.ARK_SEEDANCE_MODEL,
  watermark: false,
});

console.log(
  `Submitting one paid Seedance smoke task: ${environment.SEEDANCE_SMOKE_DURATION_SECONDS}s ${environment.SEEDANCE_SMOKE_RESOLUTION}`,
);
const submitted = await provider.submit({
  clientRequestId: `seedance-smoke-${Date.now()}`,
  prompt: environment.SEEDANCE_SMOKE_PROMPT,
  durationSeconds: environment.SEEDANCE_SMOKE_DURATION_SECONDS,
  resolution: environment.SEEDANCE_SMOKE_RESOLUTION,
  ratio: "16:9",
  generateAudio: true,
  references: [],
});
console.log(`Seedance task accepted: ${submitted.taskId}`);

const deadline = Date.now() + environment.SEEDANCE_SMOKE_TIMEOUT_MS;
let previousStatus: string | undefined;
while (Date.now() < deadline) {
  const task = await provider.getTask(submitted.taskId);
  if (task.status !== previousStatus) {
    console.log(`Seedance task status: ${task.status}`);
    previousStatus = task.status;
  }
  if (task.status === "succeeded") {
    if (!task.outputUrl) throw new Error("Seedance task succeeded without an output URL");
    console.log(`Seedance smoke succeeded; output host: ${safeHost(task.outputUrl)}`);
    process.exit(0);
  }
  if (task.status === "failed") {
    throw new Error(
      `Seedance smoke failed: ${task.errorCode ?? "UNKNOWN"}: ${task.errorMessage ?? ""}`,
    );
  }
  await delay(environment.SEEDANCE_SMOKE_POLL_INTERVAL_MS);
}

throw new Error(`Seedance smoke timed out after ${environment.SEEDANCE_SMOKE_TIMEOUT_MS}ms`);

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "non-http-provider-output";
  }
}
