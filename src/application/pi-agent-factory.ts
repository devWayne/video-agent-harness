import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { PiPlanningAgentFactory } from "./director.js";

export interface OpenAiCompatiblePiFactoryOptions {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export function createOpenAiCompatiblePiFactory(
  options: OpenAiCompatiblePiFactoryOptions,
): PiPlanningAgentFactory {
  const providerId = "video-director";
  const model: Model<"openai-completions"> = {
    id: options.modelId,
    name: options.modelId,
    api: "openai-completions",
    provider: providerId,
    baseUrl: options.baseUrl.replace(/\/$/, ""),
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  };
  const provider = createProvider({
    id: providerId,
    name: "Video Director",
    baseUrl: model.baseUrl,
    auth: { apiKey: envApiKeyAuth("Video Director API Key", ["DIRECTOR_API_KEY"]) },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);

  return (tools: AgentTool[]) =>
    new Agent({
      initialState: {
        systemPrompt:
          "你是一名生产级短视频导演。你必须使用工具提交结构化分镜，并保证总时长、画幅、角色连续性和可生成性。",
        model,
        thinkingLevel: "medium",
        tools,
      },
      streamFn: models.streamSimple.bind(models),
      getApiKey: () => options.apiKey,
      toolExecution: "sequential",
    });
}
