import { join } from "node:path";
import {
  ListMediaConvertJobsRequest,
  ListMediaProducingJobsRequest,
} from "@alicloud/ice20201109";
import { FirstSuccessfulCandidateEvaluator } from "./application/candidate-evaluator.js";
import {
  CloudDeliveryPipeline,
  ManifestDeliveryPipeline,
  type DeliveryPipeline,
} from "./application/delivery-pipeline.js";
import { DeterministicDirector, PiDirector, type Director } from "./application/director.js";
import { ManifestWriter } from "./application/manifest-writer.js";
import { createOpenAiCompatiblePiFactory } from "./application/pi-agent-factory.js";
import { VideoJobService } from "./application/video-job-service.js";
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
import { MockVideoProvider } from "./providers/mock-video-provider.js";

export function createRuntime(config: AppConfig) {
  const repository = new SqliteVideoJobRepository(join(config.DATA_DIR, "video-jobs.sqlite"));
  const provider = createProvider(config);
  const { deliveryPipeline, deliverySigner } = createDeliveryPipeline(config);
  const workflow = new WorkflowEngine({
    repository,
    director: createDirector(config),
    provider,
    evaluator: new FirstSuccessfulCandidateEvaluator(),
    deliveryPipeline,
    candidatesPerShot: config.SHOT_CANDIDATES,
    pollIntervalMs: config.PROVIDER_POLL_INTERVAL_MS,
    providerTimeoutMs: config.PROVIDER_TIMEOUT_MS,
  });
  const dispatcher = new WorkflowDispatcher(workflow);
  const service = new VideoJobService(repository, dispatcher, {
    candidatesPerShot: config.SHOT_CANDIDATES,
    ...(config.COST_WAN_CNY_PER_SECOND === undefined
      ? {}
      : { wanCnyPerSecond: config.COST_WAN_CNY_PER_SECOND }),
    ...(config.COST_4K_CNY_PER_SECOND === undefined
      ? {}
      : { upscaleCnyPerSecond: config.COST_4K_CNY_PER_SECOND }),
    ...(deliverySigner ? { deliverySigner } : {}),
  });

  return { repository, provider, deliveryPipeline, workflow, dispatcher, service };
}

function createDeliveryPipeline(config: AppConfig): {
  deliveryPipeline: DeliveryPipeline;
  deliverySigner?: MediaDeliverySigner;
} {
  const manifestWriter = new ManifestWriter(config.DATA_DIR);
  if (config.DELIVERY_MODE === "simulation") {
    return { deliveryPipeline: new ManifestDeliveryPipeline(manifestWriter) };
  }
  if (!config.ALIYUN_OSS_BUCKET || config.UPSCALE_PROVIDER !== "aliyun-ims") {
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
  return {
    deliverySigner: assetStore,
    deliveryPipeline: new CloudDeliveryPipeline({
      assetStore,
      masteringProvider: new AliyunImsMasteringProvider(iceClient),
      upscaleProvider: new AliyunImsUpscaleProvider({
        client: iceClient,
        templateId: config.ALIYUN_IMS_TEMPLATE_4K,
      }),
      manifestWriter,
      bucket: config.ALIYUN_OSS_BUCKET,
      endpoint: config.ALIYUN_OSS_ENDPOINT,
      objectPrefix: config.ALIYUN_OSS_PREFIX,
      pollIntervalMs: config.PROVIDER_POLL_INTERVAL_MS,
      timeoutMs: config.PROVIDER_TIMEOUT_MS,
      preflight: createAliyunCloudPreflight(config, iceClient),
    }),
  };
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
