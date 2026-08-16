import { join } from "node:path";
import { FirstSuccessfulCandidateEvaluator } from "./application/candidate-evaluator.js";
import { ManifestComposer } from "./application/composer.js";
import { DeterministicDirector, PiDirector, type Director } from "./application/director.js";
import { createOpenAiCompatiblePiFactory } from "./application/pi-agent-factory.js";
import { VideoJobService } from "./application/video-job-service.js";
import { WorkflowDispatcher } from "./application/workflow-dispatcher.js";
import { WorkflowEngine } from "./application/workflow-engine.js";
import type { AppConfig } from "./config.js";
import type { UpscaleProvider } from "./domain/upscale-provider.js";
import type { VideoProvider } from "./domain/video-provider.js";
import { SqliteVideoJobRepository } from "./infrastructure/sqlite-video-job-repository.js";
import { createAliyunImsClient } from "./providers/aliyun-ims-client.js";
import { AliyunImsUpscaleProvider } from "./providers/aliyun-ims-upscale-provider.js";
import { BailianWanProvider } from "./providers/bailian-wan-provider.js";
import { MockVideoProvider } from "./providers/mock-video-provider.js";

export function createRuntime(config: AppConfig) {
  const repository = new SqliteVideoJobRepository(join(config.DATA_DIR, "video-jobs.sqlite"));
  const provider = createProvider(config);
  const upscaleProvider = createUpscaleProvider(config);
  const workflow = new WorkflowEngine({
    repository,
    director: createDirector(config),
    provider,
    evaluator: new FirstSuccessfulCandidateEvaluator(),
    composer: new ManifestComposer(config.DATA_DIR),
    candidatesPerShot: config.SHOT_CANDIDATES,
    pollIntervalMs: config.PROVIDER_POLL_INTERVAL_MS,
    providerTimeoutMs: config.PROVIDER_TIMEOUT_MS,
  });
  const dispatcher = new WorkflowDispatcher(workflow);
  const service = new VideoJobService(repository, dispatcher);

  return { repository, provider, upscaleProvider, workflow, dispatcher, service };
}

function createUpscaleProvider(config: AppConfig): UpscaleProvider | undefined {
  if (config.UPSCALE_PROVIDER === "none") return undefined;
  return new AliyunImsUpscaleProvider({
    client: createAliyunImsClient({
      region: config.ALIYUN_IMS_REGION,
      ...(config.ALIYUN_IMS_ENDPOINT ? { endpoint: config.ALIYUN_IMS_ENDPOINT } : {}),
    }),
    templateId: config.ALIYUN_IMS_TEMPLATE_4K,
  });
}

function createDirector(config: AppConfig): Director {
  if (config.DIRECTOR_MODE === "deterministic") return new DeterministicDirector();
  if (!config.DIRECTOR_BASE_URL || !config.DIRECTOR_API_KEY) {
    throw new Error("Pi Director configuration was not validated");
  }
  return new PiDirector(
    createOpenAiCompatiblePiFactory({
      baseUrl: config.DIRECTOR_BASE_URL,
      apiKey: config.DIRECTOR_API_KEY,
      modelId: config.DIRECTOR_MODEL,
    }),
  );
}

function createProvider(config: AppConfig): VideoProvider {
  if (config.VIDEO_PROVIDER === "mock") return new MockVideoProvider(config.MOCK_LATENCY_MS);
  if (!config.BAILIAN_BASE_URL || !config.BAILIAN_API_KEY) {
    throw new Error("Bailian provider configuration was not validated");
  }
  return new BailianWanProvider({
    baseUrl: config.BAILIAN_BASE_URL,
    apiKey: config.BAILIAN_API_KEY,
    model: config.BAILIAN_WAN_MODEL,
  });
}
