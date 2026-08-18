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
  projectService: runtime.projectService,
  logger: true,
  uiDirectory: resolve(process.cwd(), "web-dist"),
  runtimeInfo: {
    videoProvider: config.VIDEO_PROVIDER,
    videoModel:
      config.GENERATION_PIPELINE === "comfyui-libtv"
        ? config.LIBTV_MODEL_NAME
        : config.BAILIAN_WAN_MODEL,
    generationPipeline: config.GENERATION_PIPELINE,
    deliveryMode: config.DELIVERY_MODE,
    generationResolution: "1080P",
  },
  workspaceInfo: {
    name: "Video Project Control",
    controlSurfaces: [
      {
        id: "comfyui",
        name: "ComfyUI",
        role: "底层生成工作台：MiniMax H3、节点 Workflow、动作与镜头控制",
        status: config.COMFYUI_BASE_URL ? "configured" : "not-configured",
        kind: "external",
        ...(config.COMFYUI_STUDIO_URL || config.COMFYUI_BASE_URL
          ? { url: config.COMFYUI_STUDIO_URL ?? config.COMFYUI_BASE_URL! }
          : {}),
      },
      {
        id: "libtv",
        name: "LibTV",
        role: "创意工作台：无限画布、在线候选生成与人工创意组装",
        status: config.LIBTV_PROJECT_UUID ? "configured" : "not-configured",
        kind: "external",
        ...(config.LIBTV_STUDIO_URL ? { url: config.LIBTV_STUDIO_URL } : {}),
      },
      {
        id: "hyperframes",
        name: "HyperFrames",
        role: "确定性文字动效与包装预览",
        status: "ready",
        kind: "embedded",
        url: "/#post-production",
      },
      {
        id: "delivery",
        name: "4K Delivery",
        role: "OSS、IMS 超分、技术 QC 与归档",
        status: config.DELIVERY_MODE === "cloud" ? "configured" : "disabled",
        kind: "embedded",
        url: "/#delivery",
      },
    ],
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
