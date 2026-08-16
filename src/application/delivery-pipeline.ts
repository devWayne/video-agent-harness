import type {
  MasteringProvider,
  MasteringTask,
} from "../domain/mastering-provider.js";
import type { MediaAssetStore, StoredMediaAsset } from "../domain/media-asset-store.js";
import type {
  UpscaleProvider,
  UpscaleTask,
} from "../domain/upscale-provider.js";
import type {
  VideoDeliveryState,
  VideoJob,
  VideoJobOutput,
  VideoJobStatus,
} from "../domain/video-job.js";
import { MasteringProviderError } from "../domain/mastering-provider.js";
import { UpscaleProviderError } from "../domain/upscale-provider.js";
import type { ManifestWriter } from "./manifest-writer.js";

export type DeliveryStage = Extract<VideoJobStatus, "persisting" | "mastering" | "upscaling">;
export type DeliveryCheckpoint = (
  stage: DeliveryStage,
  delivery: VideoDeliveryState,
) => Promise<void>;

export interface DeliveryPipeline {
  deliver(
    job: VideoJob,
    checkpoint: DeliveryCheckpoint,
    signal?: AbortSignal,
  ): Promise<VideoJobOutput>;
}

export class ManifestDeliveryPipeline implements DeliveryPipeline {
  constructor(private readonly manifestWriter: ManifestWriter) {}

  async deliver(job: VideoJob, checkpoint: DeliveryCheckpoint): Promise<VideoJobOutput> {
    const delivery: VideoDeliveryState =
      job.delivery?.mode === "simulation" ? job.delivery : { mode: "simulation", assets: [] };
    await checkpoint("persisting", delivery);
    await checkpoint("mastering", delivery);
    await checkpoint("upscaling", delivery);
    return {
      manifestUrl: await this.manifestWriter.write(job, delivery),
      deliveryMode: "simulation",
      width: 3840,
      height: 2160,
    };
  }
}

export interface CloudDeliveryPipelineOptions {
  assetStore: MediaAssetStore;
  masteringProvider: MasteringProvider;
  upscaleProvider: UpscaleProvider;
  manifestWriter: ManifestWriter;
  bucket: string;
  endpoint: string;
  objectPrefix: string;
  pollIntervalMs: number;
  timeoutMs: number;
}

export class CloudDeliveryPipeline implements DeliveryPipeline {
  readonly #assetStore: MediaAssetStore;
  readonly #masteringProvider: MasteringProvider;
  readonly #upscaleProvider: UpscaleProvider;
  readonly #manifestWriter: ManifestWriter;
  readonly #locations: OssDeliveryLocations;
  readonly #pollIntervalMs: number;
  readonly #timeoutMs: number;

  constructor(options: CloudDeliveryPipelineOptions) {
    this.#assetStore = options.assetStore;
    this.#masteringProvider = options.masteringProvider;
    this.#upscaleProvider = options.upscaleProvider;
    this.#manifestWriter = options.manifestWriter;
    this.#locations = new OssDeliveryLocations(
      options.bucket,
      options.endpoint,
      options.objectPrefix,
    );
    this.#pollIntervalMs = options.pollIntervalMs;
    this.#timeoutMs = options.timeoutMs;
  }

  async deliver(
    job: VideoJob,
    checkpoint: DeliveryCheckpoint,
    signal?: AbortSignal,
  ): Promise<VideoJobOutput> {
    let delivery: VideoDeliveryState =
      job.delivery?.mode === "cloud" ? job.delivery : { mode: "cloud", assets: [] };
    await checkpoint("persisting", delivery);
    const selections = selectedCandidates(job);
    for (const selection of selections) {
      if (delivery.assets.some((asset) => asset.candidateId === selection.candidateId)) continue;
      const stored = await this.#assetStore.persistRemote(
          {
            sourceUrl: selection.sourceUrl,
            objectKey: this.#locations.candidateKey(
              job.id,
              selection.shotId,
              selection.candidateId,
            ),
            mediaType: "video",
          },
          signal,
        );
      delivery = {
        ...delivery,
        assets: [
          ...delivery.assets,
          {
            ...stored,
            shotId: selection.shotId,
            candidateId: selection.candidateId,
            durationSeconds: selection.durationSeconds,
          },
        ],
      };
      await checkpoint("persisting", delivery);
    }

    const masterTarget =
      delivery.masterTarget ?? this.#locations.asset(`${job.id}/masters/master-1080p.mp4`);
    delivery = { ...delivery, masterTarget };
    await checkpoint("mastering", delivery);
    let master = delivery.masterTask;
    if (!master) {
      master = await this.#masteringProvider.submit({
        clientRequestId: `${job.id}/master`,
        clips: delivery.assets.map((asset) => ({
          mediaUrl: asset.mediaUrl,
          durationSeconds: asset.durationSeconds,
        })),
        outputMediaUrl: masterTarget.mediaUrl,
      });
      delivery = { ...delivery, masterTask: master };
      await checkpoint("mastering", delivery);
    }
    if (master.status === "submitted" || master.status === "running") {
      master = await this.#waitForMaster(master.taskId, signal);
    }
    delivery = { ...delivery, masterTask: master };
    await checkpoint("mastering", delivery);
    if (master.status !== "succeeded") {
      throw new MasteringProviderError(
        master.errorMessage ?? "Mastering task failed",
        master.errorCode ?? "MASTERING_FAILED",
        false,
      );
    }

    const upscaleTarget =
      delivery.upscaleTarget ?? this.#locations.asset(`${job.id}/deliveries/final-4k.mp4`);
    delivery = { ...delivery, upscaleTarget };
    await checkpoint("upscaling", delivery);
    let upscale = delivery.upscaleTask;
    if (!upscale) {
      upscale = await this.#upscaleProvider.submit({
        clientRequestId: `${job.id}/upscale-4k`,
        inputOssUrl: masterTarget.storageUri,
        outputOssUrl: upscaleTarget.storageUri,
        target: "4K",
      });
      delivery = { ...delivery, upscaleTask: upscale };
      await checkpoint("upscaling", delivery);
    }
    if (upscale.status === "submitted" || upscale.status === "running") {
      upscale = await this.#waitForUpscale(upscale.taskId, signal);
    }
    delivery = { ...delivery, upscaleTask: upscale };
    await checkpoint("upscaling", delivery);
    if (upscale.status !== "succeeded") {
      throw new UpscaleProviderError(
        upscale.errorMessage ?? "Upscale task failed",
        upscale.errorCode ?? "UPSCALE_FAILED",
        false,
      );
    }

    return {
      manifestUrl: await this.#manifestWriter.write(job, delivery),
      deliveryMode: "cloud",
      videoUrl: upscaleTarget.mediaUrl,
      storageUri: upscaleTarget.storageUri,
      masterVideoUrl: masterTarget.mediaUrl,
      width: 3840,
      height: 2160,
    };
  }

  async #waitForMaster(taskId: string, signal?: AbortSignal): Promise<MasteringTask> {
    return waitForTask(
      () => this.#masteringProvider.getTask(taskId),
      this.#pollIntervalMs,
      this.#timeoutMs,
      () =>
        new MasteringProviderError(
          `Mastering task ${taskId} timed out after ${this.#timeoutMs}ms`,
          "MASTERING_TIMEOUT",
          true,
        ),
      signal,
    );
  }

  async #waitForUpscale(taskId: string, signal?: AbortSignal): Promise<UpscaleTask> {
    return waitForTask(
      () => this.#upscaleProvider.getTask(taskId),
      this.#pollIntervalMs,
      this.#timeoutMs,
      () =>
        new UpscaleProviderError(
          `Upscale task ${taskId} timed out after ${this.#timeoutMs}ms`,
          "UPSCALE_TIMEOUT",
          true,
        ),
      signal,
    );
  }
}

class OssDeliveryLocations {
  readonly #endpointHost: string;
  readonly #prefix: string;

  constructor(
    private readonly bucket: string,
    endpoint: string,
    objectPrefix: string,
  ) {
    const normalizedEndpoint = endpoint.includes("://") ? endpoint : `https://${endpoint}`;
    this.#endpointHost = new URL(normalizedEndpoint).host;
    this.#prefix = objectPrefix.replace(/^\/+|\/+$/g, "");
  }

  candidateKey(jobId: string, shotId: string, candidateId: string): string {
    return this.#key(`${jobId}/shots/${shotId}/${candidateId}.mp4`);
  }

  asset(path: string): StoredMediaAsset {
    const objectKey = this.#key(path);
    const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
    return {
      storageUri: `oss://${this.bucket}/${objectKey}`,
      mediaUrl: `https://${this.bucket}.${this.#endpointHost}/${encodedKey}`,
      objectKey,
      contentType: "video/mp4",
    };
  }

  #key(path: string): string {
    return this.#prefix.length > 0 ? `${this.#prefix}/${path}` : path;
  }
}

function selectedCandidates(job: VideoJob): Array<{
  shotId: string;
  candidateId: string;
  durationSeconds: number;
  sourceUrl: string;
}> {
  return job.shots.map((shot) => {
    const selected = shot.candidates.find((item) => item.id === shot.selectedCandidateId);
    if (!selected?.outputUrl) throw new Error(`Shot ${shot.id} has no selected provider output`);
    return {
      shotId: shot.id,
      candidateId: selected.id,
      durationSeconds: shot.durationSeconds,
      sourceUrl: selected.outputUrl,
    };
  });
}

async function waitForTask<T extends { status: string }>(
  getTask: () => Promise<T>,
  pollIntervalMs: number,
  timeoutMs: number,
  timeoutError: () => Error,
  signal?: AbortSignal,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    const task = await getTask();
    if (task.status === "succeeded" || task.status === "failed") return task;
    await delay(pollIntervalMs, signal);
  }
  throw timeoutError();
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("Operation aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
