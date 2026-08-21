import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudDeliveryPipeline } from "../src/application/delivery-pipeline.js";
import { ManifestWriter } from "../src/application/manifest-writer.js";
import type { MasteringProvider } from "../src/domain/mastering-provider.js";
import type {
  MediaAssetStore,
  PersistRemoteMediaRequest,
} from "../src/domain/media-asset-store.js";
import type { UpscaleProvider } from "../src/domain/upscale-provider.js";
import type { VideoJob } from "../src/domain/video-job.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("CloudDeliveryPipeline", () => {
  it("persists selections, creates a 1080P master, and upscales it to 4K", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-cloud-delivery-"));
    temporaryDirectories.push(dataDirectory);
    const persistRemote = vi.fn(async (request: PersistRemoteMediaRequest) => ({
      storageUri: `oss://bucket/${request.objectKey}`,
      mediaUrl: `https://bucket.oss-cn-beijing.aliyuncs.com/${request.objectKey}`,
      objectKey: request.objectKey,
      contentType: "video/mp4",
    }));
    const submitMaster = vi.fn(async () => ({
      provider: "test-mastering",
      taskId: "master-1",
      status: "submitted" as const,
    }));
    const submitUpscale = vi.fn(async () => ({
      provider: "test-upscale",
      taskId: "upscale-1",
      status: "submitted" as const,
    }));
    const assetStore: MediaAssetStore = {
      name: "test-oss",
      persistRemote,
    };
    const masteringProvider: MasteringProvider = {
      name: "test-mastering",
      submit: submitMaster,
      getTask: vi.fn(async () => ({
        provider: "test-mastering",
        taskId: "master-1",
        status: "succeeded" as const,
        outputUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/root/job-1/masters/master-1080p.mp4",
      })),
    };
    const upscaleProvider: UpscaleProvider = {
      name: "test-upscale",
      submit: submitUpscale,
      getTask: vi.fn(async () => ({
        provider: "test-upscale",
        taskId: "upscale-1",
        status: "succeeded" as const,
        outputUrl: "oss://bucket/root/job-1/deliveries/final-4k.mp4",
      })),
    };
    const pipeline = new CloudDeliveryPipeline({
      assetStore,
      masteringProvider,
      upscaleProvider,
      manifestWriter: new ManifestWriter(dataDirectory),
      bucket: "bucket",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      objectPrefix: "root",
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });
    const stages: string[] = [];

    const output = await pipeline.deliver(testJob(), async (stage) => {
      stages.push(stage);
    });

    expect(stages).toEqual([
      "persisting",
      "persisting",
      "persisting",
      "mastering",
      "mastering",
      "mastering",
      "upscaling",
      "upscaling",
      "upscaling",
    ]);
    expect(output).toMatchObject({
      deliveryMode: "cloud",
      storageUri: "oss://bucket/root/job-1/deliveries/final-4k.mp4",
      videoUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/root/job-1/deliveries/final-4k.mp4",
      width: 3840,
      height: 2160,
    });
    expect(persistRemote).toHaveBeenCalledTimes(2);
    expect(submitMaster).toHaveBeenCalledWith(
      expect.objectContaining({
        outputMediaUrl:
          "https://bucket.oss-cn-beijing.aliyuncs.com/root/job-1/masters/master-1080p.mp4",
      }),
    );
    expect(submitUpscale).toHaveBeenCalledWith({
      clientRequestId: "job-1/upscale-4k",
      inputUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/root/job-1/masters/master-1080p.mp4",
      inputStorageUri: "oss://bucket/root/job-1/masters/master-1080p.mp4",
      outputStorageUri: "oss://bucket/root/job-1/deliveries/final-4k.mp4",
      target: "4K",
    });
  });

  it("continues existing cloud tasks from persisted delivery checkpoints", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-cloud-resume-"));
    temporaryDirectories.push(dataDirectory);
    const submitMaster = vi.fn<MasteringProvider["submit"]>();
    const getMaster = vi.fn<MasteringProvider["getTask"]>();
    const submitUpscale = vi.fn<UpscaleProvider["submit"]>();
    const getUpscale = vi.fn<UpscaleProvider["getTask"]>(async () => ({
      provider: "test-upscale",
      taskId: "upscale-existing",
      status: "succeeded",
    }));
    const persistRemote = vi.fn<MediaAssetStore["persistRemote"]>();
    const job = testJob();
    job.status = "upscaling";
    job.delivery = {
      mode: "cloud",
      assets: job.shots.map((shot, index) => ({
        storageUri: `oss://bucket/root/job-1/shots/${shot.id}/candidate-${index + 1}.mp4`,
        mediaUrl: `https://bucket.oss-cn-beijing.aliyuncs.com/root/job-1/shots/${shot.id}/candidate-${index + 1}.mp4`,
        objectKey: `root/job-1/shots/${shot.id}/candidate-${index + 1}.mp4`,
        shotId: shot.id,
        candidateId: `candidate-${index + 1}`,
        durationSeconds: shot.durationSeconds,
      })),
      masterTarget: {
        storageUri: "oss://bucket/root/job-1/masters/master-1080p.mp4",
        mediaUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/root/job-1/masters/master-1080p.mp4",
        objectKey: "root/job-1/masters/master-1080p.mp4",
      },
      masterTask: { provider: "test-mastering", taskId: "master-existing", status: "succeeded" },
      upscaleTarget: {
        storageUri: "oss://bucket/root/job-1/deliveries/final-4k.mp4",
        mediaUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/root/job-1/deliveries/final-4k.mp4",
        objectKey: "root/job-1/deliveries/final-4k.mp4",
      },
      upscaleTask: {
        provider: "test-upscale",
        taskId: "upscale-existing",
        status: "submitted",
      },
    };
    const pipeline = new CloudDeliveryPipeline({
      assetStore: { name: "test-oss", persistRemote },
      masteringProvider: { name: "test-mastering", submit: submitMaster, getTask: getMaster },
      upscaleProvider: { name: "test-upscale", submit: submitUpscale, getTask: getUpscale },
      manifestWriter: new ManifestWriter(dataDirectory),
      bucket: "bucket",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      objectPrefix: "root",
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });

    await pipeline.deliver(job, async () => undefined);

    expect(persistRemote).not.toHaveBeenCalled();
    expect(submitMaster).not.toHaveBeenCalled();
    expect(getMaster).not.toHaveBeenCalled();
    expect(submitUpscale).not.toHaveBeenCalled();
    expect(getUpscale).toHaveBeenCalledWith("upscale-existing");
  });

  it("checkpoints provider task transitions and copies an external 4K output back to private OSS", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-vod-delivery-"));
    temporaryDirectories.push(dataDirectory);
    const persistRemote = vi.fn(async (request: PersistRemoteMediaRequest) => ({
      storageUri: `oss://bucket/${request.objectKey}`,
      mediaUrl: `https://bucket.oss-cn-beijing.aliyuncs.com/${request.objectKey}`,
      objectKey: request.objectKey,
      contentType: "video/mp4",
    }));
    const getUpscale = vi
      .fn<UpscaleProvider["getTask"]>()
      .mockResolvedValueOnce({
        provider: "volcengine-vod-aigc-standard-4k",
        taskId: "enhance-1",
        status: "running",
      })
      .mockResolvedValueOnce({
        provider: "volcengine-vod-aigc-standard-4k",
        taskId: "enhance-1",
        status: "succeeded",
        outputUrl: "https://play.volccdn.com/output-4k.mp4?auth=temporary",
        width: 3840,
        height: 2160,
      });
    const submitUpscale = vi.fn<UpscaleProvider["submit"]>(async () => ({
      provider: "volcengine-vod-aigc-standard-4k",
      taskId: "import-1",
      status: "submitted",
    }));
    const finalize = vi.fn<NonNullable<UpscaleProvider["finalize"]>>(async () => undefined);
    const pipeline = new CloudDeliveryPipeline({
      assetStore: { name: "test-oss", persistRemote },
      inputSigner: {
        signRead: vi.fn(async () => ({
          url: "https://bucket.oss-cn-beijing.aliyuncs.com/master.mp4?signature=private",
          expiresAt: "2026-08-22T03:00:00.000Z",
        })),
      },
      sourceUrlExpiresSeconds: 7_200,
      masteringProvider: {
        name: "test-mastering",
        submit: vi.fn<MasteringProvider["submit"]>(async () => ({
          provider: "test-mastering",
          taskId: "master-1",
          status: "submitted",
        })),
        getTask: vi.fn<MasteringProvider["getTask"]>(async () => ({
          provider: "test-mastering",
          taskId: "master-1",
          status: "succeeded",
        })),
      },
      upscaleProvider: {
        name: "volcengine-vod-aigc-standard-4k",
        submit: submitUpscale,
        getTask: getUpscale,
        finalize,
      },
      manifestWriter: new ManifestWriter(dataDirectory),
      bucket: "bucket",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      objectPrefix: "root",
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });
    const taskIds: string[] = [];
    let sawDurableOutput = false;
    let sawFinalized = false;
    let persistedVolatileOutputUrl = false;

    const output = await pipeline.deliver(testJob(), async (stage, delivery) => {
      if (stage !== "upscaling") return;
      if (delivery.upscaleTask) taskIds.push(delivery.upscaleTask.taskId);
      sawDurableOutput ||= delivery.upscaleOutput !== undefined;
      sawFinalized ||= delivery.upscaleFinalized === true;
      persistedVolatileOutputUrl ||= delivery.upscaleTask?.outputUrl !== undefined;
    });

    expect(taskIds).toContain("import-1");
    expect(taskIds).toContain("enhance-1");
    expect(sawDurableOutput).toBe(true);
    expect(sawFinalized).toBe(true);
    expect(persistedVolatileOutputUrl).toBe(false);
    expect(getUpscale).toHaveBeenNthCalledWith(1, "import-1");
    expect(getUpscale).toHaveBeenNthCalledWith(2, "enhance-1");
    expect(submitUpscale).toHaveBeenCalledWith(
      expect.objectContaining({
        inputUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/master.mp4?signature=private",
      }),
    );
    expect(persistRemote).toHaveBeenLastCalledWith(
      {
        sourceUrl: "https://play.volccdn.com/output-4k.mp4?auth=temporary",
        objectKey: "root/job-1/deliveries/final-4k.mp4",
        mediaType: "video",
      },
      undefined,
    );
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(output).toMatchObject({
      storageUri: "oss://bucket/root/job-1/deliveries/final-4k.mp4",
      videoUrl: "https://bucket.oss-cn-beijing.aliyuncs.com/root/job-1/deliveries/final-4k.mp4",
    });
  });
});

function testJob(): VideoJob {
  return {
    id: "job-1",
    request: {
      brief: "测试视频",
      durationSeconds: 10,
      aspectRatio: "16:9",
      outputResolution: "3840x2160",
      references: [],
    },
    status: "evaluating",
    version: 1,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    shots: [
      {
        id: "shot-1",
        index: 0,
        prompt: "镜头一",
        durationSeconds: 5,
        status: "completed",
        selectedCandidateId: "candidate-1",
        candidates: [
          {
            id: "candidate-1",
            provider: "wan",
            providerTaskId: "wan-1",
            status: "succeeded",
            outputUrl: "https://provider.oss-cn-beijing.aliyuncs.com/one.mp4",
          },
        ],
      },
      {
        id: "shot-2",
        index: 1,
        prompt: "镜头二",
        durationSeconds: 5,
        status: "completed",
        selectedCandidateId: "candidate-2",
        candidates: [
          {
            id: "candidate-2",
            provider: "wan",
            providerTaskId: "wan-2",
            status: "succeeded",
            outputUrl: "https://provider.oss-cn-beijing.aliyuncs.com/two.mp4",
          },
        ],
      },
    ],
  };
}
