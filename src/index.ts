import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { buildServer } from "./http/server.js";
import { createRuntime } from "./runtime.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const config = loadConfig();
const runtime = createRuntime(config);
const server = buildServer({
  service: runtime.service,
  logger: true,
  uiDirectory: resolve(process.cwd(), "web-dist"),
  runtimeInfo: {
    videoProvider: config.VIDEO_PROVIDER,
    videoModel: config.BAILIAN_WAN_MODEL,
    deliveryMode: config.DELIVERY_MODE,
    generationResolution: "1080P",
  },
  ...(config.HARNESS_API_KEY ? { apiKey: config.HARNESS_API_KEY } : {}),
});

await runtime.service.resumePending();
await server.listen({ host: config.HOST, port: config.PORT });

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await server.close();
  await runtime.dispatcher.waitForIdle();
  runtime.repository.close();
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
