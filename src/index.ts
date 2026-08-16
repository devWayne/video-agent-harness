import { config as loadDotenv } from "dotenv";
import { loadConfig } from "./config.js";
import { buildServer } from "./http/server.js";
import { createRuntime } from "./runtime.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const config = loadConfig();
const runtime = createRuntime(config);
const server = buildServer({ service: runtime.service, logger: true });

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
