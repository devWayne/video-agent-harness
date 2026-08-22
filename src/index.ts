import { config as loadDotenv } from "dotenv";
import { loadConfig } from "./config.js";
import { buildServer } from "./http/server.js";
import { createRuntime } from "./runtime.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const config = loadConfig();
const runtime = createRuntime(config);
const server = buildServer({
  service: runtime.service,
  projectService: runtime.projectService,
  ...(runtime.voiceoverProvider ? { voiceoverProvider: runtime.voiceoverProvider } : {}),
  ...(runtime.musicProvider ? { musicProvider: runtime.musicProvider } : {}),
  logger: true,
  editorialWorkspaceApprovalMode: config.OPENCHATCUT_APPROVAL_MODE,
  runtimeInfo: {
    videoProvider: config.VIDEO_PROVIDER,
    videoModel: activeVideoModel(config),
    generationPipeline: config.GENERATION_PIPELINE,
    deliveryMode: config.DELIVERY_MODE,
    generationResolution:
      config.GENERATION_PIPELINE === "comfyui-libtv"
        ? "1080P"
        : config.DIRECT_GENERATION_RESOLUTION,
    voiceoverProvider: config.VOICEOVER_PROVIDER,
    ...(config.VOICEOVER_PROVIDER === "bailian-qwen-audio"
      ? { voiceoverModel: config.BAILIAN_TTS_MODEL }
      : {}),
    musicProvider: config.MUSIC_PROVIDER,
    ...(config.MUSIC_PROVIDER === "volcengine-bigmusic"
      ? { musicModel: "BigMusic-v5.0" }
      : {}),
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
        id: "editorial-workspace",
        name: "OpenChatCut",
        role: "可替换的多轨看片与人工精修工作区；Harness 仍保存版本、锁版和交付事实",
        status: config.EDITORIAL_WORKSPACE_PROVIDER === "openchatcut" ? "configured" : "not-configured",
        kind: "external",
        ...(config.EDITORIAL_WORKSPACE_PROVIDER === "openchatcut"
          ? { url: config.OPENCHATCUT_EDITOR_URL }
          : {}),
      },
      {
        id: "hyperframes",
        name: "HyperFrames",
        role: "确定性文字动效与包装预览",
        status: "ready",
        kind: "embedded",
      },
      {
        id: "delivery",
        name: "4K Delivery",
        role: "OSS、IMS 超分、技术 QC 与归档",
        status: config.DELIVERY_MODE === "cloud" ? "configured" : "disabled",
        kind: "embedded",
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

function activeVideoModel(configuration: typeof config): string {
  if (configuration.GENERATION_PIPELINE === "comfyui-libtv") {
    return configuration.LIBTV_MODEL_NAME;
  }
  if (configuration.VIDEO_PROVIDER === "volcengine") return configuration.ARK_SEEDANCE_MODEL;
  if (configuration.VIDEO_PROVIDER === "bailian") return configuration.BAILIAN_WAN_MODEL;
  return "mock-video";
}
