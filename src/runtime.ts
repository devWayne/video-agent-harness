import { join } from "node:path";
import {
  ListMediaConvertJobsRequest,
  ListMediaProducingJobsRequest,
} from "@alicloud/ice20201109";
import { FirstSuccessfulCandidateEvaluator } from "./application/candidate-evaluator.js";
import { RecipeCandidateGenerationPipeline } from "./application/candidate-generation-pipeline.js";
import {
  CloudDeliveryPipeline,
  ManifestDeliveryPipeline,
  type DeliveryPipeline,
} from "./application/delivery-pipeline.js";
import { DeterministicDirector, PiDirector, type Director } from "./application/director.js";
import {
  ComfyUiLibTvShotRecipePlanner,
  DirectShotRecipePlanner,
} from "./application/shot-recipe-planner.js";
import { ManifestWriter } from "./application/manifest-writer.js";
import { createOpenAiCompatiblePiFactory } from "./application/pi-agent-factory.js";
import { VideoJobService } from "./application/video-job-service.js";
import { ProductionProjectService } from "./application/production-project-service.js";
import { WorkflowDispatcher } from "./application/workflow-dispatcher.js";
import { WorkflowEngine } from "./application/workflow-engine.js";
import type { AppConfig } from "./config.js";
import type { VideoProvider } from "./domain/video-provider.js";
import type { MediaDeliverySigner } from "./domain/media-asset-store.js";
import { MediaAssetStoreError } from "./domain/media-asset-store.js";
import { SqliteVideoJobRepository } from "./infrastructure/sqlite-video-job-repository.js";
import { createAliyunImsClient } from "./providers/aliyun-ims-client.js";
import { AliyunImsMasteringProvider } from "./providers/aliyun-ims-mastering-provider.js";
import { AliyunImsUpscaleProvider } from "./providers/aliyun-ims-upscale-provider.js";
import {
  createAliyunOssClient,
  createLazyAliyunOssClient,
} from "./providers/aliyun-oss-client.js";
import { AliyunOssMediaAssetStore } from "./providers/aliyun-oss-media-asset-store.js";
import { BailianWanProvider } from "./providers/bailian-wan-provider.js";
import { BailianQwenAudioVoiceoverProvider } from "./providers/bailian-qwen-audio-voiceover-provider.js";
import { ComfyUiClient } from "./providers/comfyui-client.js";
import { ComfyUiControlStepExecutor } from "./providers/comfyui-control-step-executor.js";
import { DirectVideoStepExecutor } from "./providers/direct-video-step-executor.js";
import { LibTvCliClient } from "./providers/libtv-cli-client.js";
import { LibTvGenerationStepExecutor } from "./providers/libtv-generation-step-executor.js";
import { MockVideoProvider } from "./providers/mock-video-provider.js";
import { VolcengineSeedanceProvider } from "./providers/volcengine-seedance-provider.js";
import { VolcengineTosOutputStore } from "./providers/volcengine-tos-output-store.js";
import {
  VolcengineVodAigcUpscaleProvider,
  VolcengineVodClient,
} from "./providers/volcengine-vod-upscale-provider.js";

export function createRuntime(config: AppConfig) {
  const repository = new SqliteVideoJobRepository(join(config.DATA_DIR, "video-jobs.sqlite"));
  const provider =
    config.GENERATION_PIPELINE === "direct"
      ? createProvider(config)
      : new MockVideoProvider(config.MOCK_LATENCY_MS);
  const candidatePipeline = createCandidatePipeline(config, provider);
  const { deliveryPipeline, deliverySigner } = createDeliveryPipeline(config);
  const workflow = new WorkflowEngine({
    repository,
    director: createDirector(config),
    candidatePipeline,
    evaluator: new FirstSuccessfulCandidateEvaluator(),
    deliveryPipeline,
    candidatesPerShot: config.SHOT_CANDIDATES,
  });
  const dispatcher = new WorkflowDispatcher(workflow);
  const service = new VideoJobService(repository, dispatcher, {
    candidatesPerShot: config.SHOT_CANDIDATES,
    ...(config.GENERATION_PIPELINE !== "direct" ||
    config.VIDEO_PROVIDER !== "bailian" ||
    config.COST_WAN_CNY_PER_SECOND === undefined
      ? {}
      : { wanCnyPerSecond: config.COST_WAN_CNY_PER_SECOND }),
    ...(config.COST_4K_CNY_PER_SECOND === undefined
      ? {}
      : { upscaleCnyPerSecond: config.COST_4K_CNY_PER_SECOND }),
    ...(deliverySigner ? { deliverySigner } : {}),
  });
  const projectService = new ProductionProjectService(repository, repository);
  const voiceoverProvider = createVoiceoverProvider(config);

  return {
    repository,
    provider,
    candidatePipeline,
    deliveryPipeline,
    workflow,
    dispatcher,
    service,
    projectService,
    voiceoverProvider,
  };
}

function createVoiceoverProvider(config: AppConfig) {
  if (config.VOICEOVER_PROVIDER === "none") return undefined;
  if (!config.BAILIAN_BASE_URL || !config.BAILIAN_API_KEY) {
    throw new Error("Bailian voice-over configuration was not validated");
  }
  return new BailianQwenAudioVoiceoverProvider({
    baseUrl: config.BAILIAN_BASE_URL,
    apiKey: config.BAILIAN_API_KEY,
    model: config.BAILIAN_TTS_MODEL,
    defaultVoice: config.BAILIAN_TTS_VOICE,
    defaultInstruction: config.BAILIAN_TTS_DEFAULT_INSTRUCTION,
    defaultFormat: config.BAILIAN_TTS_FORMAT,
    defaultSampleRate: config.BAILIAN_TTS_SAMPLE_RATE,
    enableAigcTag: config.BAILIAN_TTS_ENABLE_AIGC_TAG,
    requestTimeoutMs: config.BAILIAN_TTS_REQUEST_TIMEOUT_MS,
  });
}

function createCandidatePipeline(config: AppConfig, provider: VideoProvider) {
  if (config.GENERATION_PIPELINE === "direct") {
    return new RecipeCandidateGenerationPipeline(
      new DirectShotRecipePlanner(),
      [
        new DirectVideoStepExecutor({
          provider,
          pollIntervalMs: config.PROVIDER_POLL_INTERVAL_MS,
          timeoutMs: config.PROVIDER_TIMEOUT_MS,
          resolution: config.DIRECT_GENERATION_RESOLUTION,
        }),
      ],
      "direct",
    );
  }
  if (!config.COMFYUI_BASE_URL || !config.COMFYUI_WORKFLOW_PATH || !config.LIBTV_PROJECT_UUID) {
    throw new Error("ComfyUI -> LibTV pipeline configuration was not validated");
  }
  const libtvClient = new LibTvCliClient({
    executable: config.LIBTV_CLI_PATH,
    projectUuid: config.LIBTV_PROJECT_UUID,
    workingDirectory: process.cwd(),
  });
  return new RecipeCandidateGenerationPipeline(
    new ComfyUiLibTvShotRecipePlanner(),
    [
      new ComfyUiControlStepExecutor({
        client: new ComfyUiClient({ baseUrl: config.COMFYUI_BASE_URL }),
        workflowPath: config.COMFYUI_WORKFLOW_PATH,
        outputDirectory: join(config.DATA_DIR, "control-assets"),
        pollIntervalMs: config.COMFYUI_POLL_INTERVAL_MS,
        timeoutMs: config.COMFYUI_TIMEOUT_MS,
      }),
      new LibTvGenerationStepExecutor({
        client: libtvClient,
        modelName: config.LIBTV_MODEL_NAME,
        modeType: config.LIBTV_MODE_TYPE,
        resolution: "1080P",
        enableSound: true,
        maximumDurationSeconds: config.LIBTV_MAX_DURATION_SECONDS,
      }),
    ],
    "controlled",
  );
}

function createDeliveryPipeline(config: AppConfig): {
  deliveryPipeline: DeliveryPipeline;
  deliverySigner?: MediaDeliverySigner;
} {
  const manifestWriter = new ManifestWriter(config.DATA_DIR);
  if (config.DELIVERY_MODE === "simulation") {
    return { deliveryPipeline: new ManifestDeliveryPipeline(manifestWriter) };
  }
  if (!config.ALIYUN_OSS_BUCKET || config.UPSCALE_PROVIDER === "none") {
    throw new Error("Cloud delivery configuration was not validated");
  }
  const iceClient = createAliyunImsClient({
    region: config.ALIYUN_IMS_REGION,
    ...(config.ALIYUN_IMS_ENDPOINT ? { endpoint: config.ALIYUN_IMS_ENDPOINT } : {}),
  });
  const ossClient = createLazyAliyunOssClient({
    region: config.ALIYUN_OSS_REGION,
    bucket: config.ALIYUN_OSS_BUCKET,
    endpoint: config.ALIYUN_OSS_ENDPOINT,
  });
  const assetStore = new AliyunOssMediaAssetStore({
    client: ossClient,
    bucket: config.ALIYUN_OSS_BUCKET,
    endpoint: config.ALIYUN_OSS_ENDPOINT,
    allowedSourceHostSuffixes: config.MEDIA_IMPORT_ALLOWED_HOST_SUFFIXES,
    maxBytes: config.MEDIA_IMPORT_MAX_BYTES,
  });
  const aliyunPreflight = createAliyunCloudPreflight(config, iceClient);
  const volcengineVodProvider =
    config.UPSCALE_PROVIDER === "volcengine-vod"
      ? createVolcengineVodUpscaleProvider(config)
      : undefined;
  const upscaleProvider =
    volcengineVodProvider ??
    new AliyunImsUpscaleProvider({
      client: iceClient,
      templateId: config.ALIYUN_IMS_TEMPLATE_4K,
    });
  return {
    deliverySigner: assetStore,
    deliveryPipeline: new CloudDeliveryPipeline({
      assetStore,
      masteringProvider: new AliyunImsMasteringProvider(iceClient),
      upscaleProvider,
      manifestWriter,
      bucket: config.ALIYUN_OSS_BUCKET,
      endpoint: config.ALIYUN_OSS_ENDPOINT,
      objectPrefix: config.ALIYUN_OSS_PREFIX,
      pollIntervalMs: config.PROVIDER_POLL_INTERVAL_MS,
      timeoutMs: config.PROVIDER_TIMEOUT_MS,
      inputSigner: assetStore,
      sourceUrlExpiresSeconds: config.VOLCENGINE_VOD_SOURCE_URL_EXPIRES_SECONDS,
      preflight: async (signal) => {
        await aliyunPreflight(signal);
        await volcengineVodProvider?.preflight(signal);
      },
    }),
  };
}

function createVolcengineVodUpscaleProvider(
  config: AppConfig,
): VolcengineVodAigcUpscaleProvider {
  if (
    !config.VOLCENGINE_VOD_ACCESS_KEY_ID ||
    !config.VOLCENGINE_VOD_SECRET_ACCESS_KEY ||
    !config.VOLCENGINE_VOD_SPACE_NAME
  ) {
    throw new Error("Volcengine VOD configuration was not validated");
  }
  return new VolcengineVodAigcUpscaleProvider({
    client: new VolcengineVodClient({
      accessKeyId: config.VOLCENGINE_VOD_ACCESS_KEY_ID,
      secretAccessKey: config.VOLCENGINE_VOD_SECRET_ACCESS_KEY,
      ...(config.VOLCENGINE_VOD_SESSION_TOKEN
        ? { sessionToken: config.VOLCENGINE_VOD_SESSION_TOKEN }
        : {}),
      region: config.VOLCENGINE_VOD_REGION,
      endpoint: config.VOLCENGINE_VOD_ENDPOINT,
      timeoutMs: config.VOLCENGINE_VOD_REQUEST_TIMEOUT_MS,
    }),
    spaceName: config.VOLCENGINE_VOD_SPACE_NAME,
    repairStrength: config.VOLCENGINE_VOD_REPAIR_STRENGTH,
    outputSigner: new VolcengineTosOutputStore({
      accessKeyId: config.VOLCENGINE_VOD_ACCESS_KEY_ID,
      secretAccessKey: config.VOLCENGINE_VOD_SECRET_ACCESS_KEY,
      ...(config.VOLCENGINE_VOD_SESSION_TOKEN
        ? { sessionToken: config.VOLCENGINE_VOD_SESSION_TOKEN }
        : {}),
      region: config.VOLCENGINE_TOS_REGION,
      endpoint: config.VOLCENGINE_TOS_ENDPOINT,
    }),
    outputUrlExpiresSeconds: config.VOLCENGINE_VOD_OUTPUT_URL_EXPIRES_SECONDS,
  });
}

function createAliyunCloudPreflight(
  config: AppConfig,
  iceClient: ReturnType<typeof createAliyunImsClient>,
): (signal?: AbortSignal) => Promise<void> {
  return async (signal) => {
    signal?.throwIfAborted();
    try {
      const ossClient = await createAliyunOssClient({
        region: config.ALIYUN_OSS_REGION,
        bucket: config.ALIYUN_OSS_BUCKET!,
        endpoint: config.ALIYUN_OSS_ENDPOINT,
      });
      await Promise.all([
        ossClient.getBucketInfo(config.ALIYUN_OSS_BUCKET!),
        iceClient.listMediaProducingJobs(new ListMediaProducingJobsRequest({ maxResults: 1 })),
        iceClient.listMediaConvertJobs(new ListMediaConvertJobsRequest({ pageSize: 1 })),
      ]);
      signal?.throwIfAborted();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new MediaAssetStoreError(
        "Alibaba Cloud delivery preflight failed before paid video generation",
        "ALIYUN_CLOUD_PREFLIGHT_FAILED",
        true,
        { cause: error },
      );
    }
  };
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
    config.GENERATION_PIPELINE === "comfyui-libtv"
      ? config.LIBTV_MAX_DURATION_SECONDS
      : 15,
  );
}

function createProvider(config: AppConfig): VideoProvider {
  if (config.VIDEO_PROVIDER === "mock") return new MockVideoProvider(config.MOCK_LATENCY_MS);
  if (config.VIDEO_PROVIDER === "bailian") {
    if (!config.BAILIAN_BASE_URL || !config.BAILIAN_API_KEY) {
      throw new Error("Bailian provider configuration was not validated");
    }
    return new BailianWanProvider({
      baseUrl: config.BAILIAN_BASE_URL,
      apiKey: config.BAILIAN_API_KEY,
      model: config.BAILIAN_WAN_MODEL,
    });
  }
  if (!config.ARK_API_KEY) {
    throw new Error("Volcengine provider configuration was not validated");
  }
  return new VolcengineSeedanceProvider({
    baseUrl: config.ARK_BASE_URL,
    apiKey: config.ARK_API_KEY,
    model: config.ARK_SEEDANCE_MODEL,
    watermark: config.ARK_WATERMARK,
  });
}
