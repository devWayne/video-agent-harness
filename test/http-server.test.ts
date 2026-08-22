import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FirstSuccessfulCandidateEvaluator } from "../src/application/candidate-evaluator.js";
import { RecipeCandidateGenerationPipeline } from "../src/application/candidate-generation-pipeline.js";
import { ManifestDeliveryPipeline } from "../src/application/delivery-pipeline.js";
import { DeterministicDirector } from "../src/application/director.js";
import { DirectShotRecipePlanner } from "../src/application/shot-recipe-planner.js";
import { ManifestWriter } from "../src/application/manifest-writer.js";
import { VideoJobService } from "../src/application/video-job-service.js";
import { WorkflowDispatcher } from "../src/application/workflow-dispatcher.js";
import { WorkflowEngine } from "../src/application/workflow-engine.js";
import { buildServer } from "../src/http/server.js";
import { SqliteVideoJobRepository } from "../src/infrastructure/sqlite-video-job-repository.js";
import { MockVideoProvider } from "../src/providers/mock-video-provider.js";
import { DirectVideoStepExecutor } from "../src/providers/direct-video-step-executor.js";
import type { VideoProvider } from "../src/domain/video-provider.js";
import type { VoiceoverProvider } from "../src/domain/voiceover-provider.js";
import type { MusicProvider } from "../src/domain/music-provider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("video job HTTP API", () => {
  it("creates an idempotent job and exposes its completed state", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-api-"));
    temporaryDirectories.push(dataDirectory);
    const repository = new SqliteVideoJobRepository(":memory:");
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      candidatePipeline: directPipeline(new MockVideoProvider(0)),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline: new ManifestDeliveryPipeline(new ManifestWriter(dataDirectory)),
      candidatesPerShot: 2,
    });
    const dispatcher = new WorkflowDispatcher(workflow);
    const service = new VideoJobService(repository, dispatcher, {
      candidatesPerShot: 2,
      wanCnyPerSecond: 0.25,
      upscaleCnyPerSecond: 0.1,
    });
    const server = buildServer({
      service,
      voiceoverProvider: stubVoiceoverProvider(),
      musicProvider: stubMusicProvider(),
      runtimeInfo: {
        videoProvider: "mock",
        videoModel: "mock-video-v1",
        generationPipeline: "direct",
        deliveryMode: "simulation",
        generationResolution: "1080P",
      },
      workspaceInfo: {
        name: "Test Production",
        controlSurfaces: [
          {
            id: "comfyui",
            name: "ComfyUI",
            role: "H3 control",
            status: "configured",
            kind: "external",
            url: "http://comfyui.test:8188",
          },
        ],
      },
    });
    const body = {
      brief: "雨夜里一间温暖的独立书店",
      durationSeconds: 10,
      idempotencyKey: "campaign-42",
    };

    const created = await server.inject({ method: "POST", url: "/v1/video-jobs", payload: body });
    expect(created.statusCode).toBe(202);
    const createdJob = created.json<{ id: string }>();
    expect(created.json<{ costEstimate: { totalCny: number } }>().costEstimate.totalCny).toBe(6);
    const duplicate = await server.inject({ method: "POST", url: "/v1/video-jobs", payload: body });
    expect(duplicate.json<{ id: string }>().id).toBe(createdJob.id);

    await dispatcher.waitForIdle();
    const fetched = await server.inject({ method: "GET", url: `/v1/video-jobs/${createdJob.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<{ status: string }>().status).toBe("completed");
    expect((await server.inject({ method: "GET", url: "/health/ready" })).statusCode).toBe(200);
    expect((await server.inject({ method: "GET", url: "/" })).json()).toMatchObject({
      service: "video-agent-harness",
      mode: "headless-production-control-plane",
    });
    expect((await server.inject({ method: "GET", url: "/v1/workspace" })).json()).toMatchObject({
      workspace: {
        name: "Test Production",
        controlSurfaces: [{ id: "comfyui", status: "configured" }],
      },
    });
    expect((await server.inject({ method: "GET", url: "/metrics" })).body).toContain(
      'video_agent_harness_jobs{status="completed"} 1',
    );
    expect((await server.inject({ method: "GET", url: "/openapi.json" })).json()).toMatchObject({
      openapi: "3.1.0",
      info: { title: "Video Agent Harness API" },
      paths: {
        "/v1/voiceovers": { post: { tags: ["Voiceovers"] } },
        "/v1/voiceovers/capabilities": { get: { tags: ["Voiceovers"] } },
        "/v1/music/tracks": { post: { tags: ["Music"] } },
        "/v1/music/tracks/{taskId}": { get: { tags: ["Music"] } },
        "/v1/projects/{id}/editorial-timelines": {
          get: { tags: ["Editorial"] },
          post: { tags: ["Editorial"] },
        },
        "/v1/projects/{id}/editorial-timelines/{timelineId}/workspace-sync": {
          post: { tags: ["Editorial"] },
        },
      },
    });
    expect(
      (await server.inject({ method: "GET", url: "/v1/voiceovers/capabilities" })).json(),
    ).toMatchObject({
      provider: "bailian-qwen-audio",
      model: "qwen-audio-3.0-tts-plus",
      defaults: { voice: "longanlingxin", sampleRate: 48_000 },
    });
    const voiceover = await server.inject({
      method: "POST",
      url: "/v1/voiceovers",
      payload: { text: "每一次出发，都值得更好的抵达。" },
    });
    expect(voiceover.statusCode).toBe(201);
    expect(voiceover.json()).toMatchObject({
      provider: "bailian-qwen-audio",
      model: "qwen-audio-3.0-tts-plus",
      audioId: "audio-test",
    });
    expect(
      (await server.inject({ method: "GET", url: "/v1/music/capabilities" })).json(),
    ).toMatchObject({
      provider: "volcengine-bigmusic",
      model: "BigMusic-v5.0",
      defaults: { durationSeconds: 60 },
    });
    expect((await server.inject({ method: "GET", url: "/v1/music/usage" })).json()).toEqual({
      items: [{ productName: "BigMusic", authorizationStatus: "trial" }],
    });
    const music = await server.inject({
      method: "POST",
      url: "/v1/music/tracks",
      payload: { prompt: "现代企业介绍片背景纯音乐", durationSeconds: 60 },
    });
    expect(music.statusCode).toBe(202);
    expect(music.json()).toMatchObject({
      provider: "volcengine-bigmusic",
      taskId: "music-task-test",
      status: "submitted",
    });
    const musicTask = await server.inject({
      method: "GET",
      url: "/v1/music/tracks/music-task-test",
    });
    expect(musicTask.json()).toMatchObject({
      status: "succeeded",
      audioUrl: "https://example.invalid/music.wav",
    });
    const musicDownload = await server.inject({
      method: "GET",
      url: "/v1/music/tracks/music-task-test/download",
    });
    expect(musicDownload.json()).toMatchObject({
      taskId: "music-task-test",
      audioUrl: "https://example.invalid/music.wav",
      providerUrlTtlSeconds: 31_536_000,
    });
    const composition = await server.inject({
      method: "POST",
      url: "/v1/compositions/preview",
      payload: {
        title: "杭州，向未来生长",
        subtitle: "一条可确定性预览的品牌片标题",
        durationSeconds: 8,
        theme: "violet",
        motion: "fade-up",
      },
    });
    expect(composition.statusCode).toBe(201);
    const compositionBody = composition.json<{ previewUrl: string }>();
    expect(compositionBody).toMatchObject({
      engine: "hyperframes",
      width: 1920,
      height: 1080,
      lint: { warningCount: 0 },
    });
    const compositionHtml = await server.inject({ method: "GET", url: compositionBody.previewUrl });
    expect(compositionHtml.statusCode).toBe(200);
    expect(compositionHtml.headers["content-type"]).toContain("text/html");
    expect(compositionHtml.body).toContain("window.__timelines");
    await server.close();
    repository.close();
  });

  it("protects job routes with a constant-time bearer key when configured", async () => {
    const repository = new SqliteVideoJobRepository(":memory:");
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      candidatePipeline: directPipeline(new MockVideoProvider(0)),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline: new ManifestDeliveryPipeline(new ManifestWriter(tmpdir())),
      candidatesPerShot: 1,
    });
    const dispatcher = new WorkflowDispatcher(workflow);
    const server = buildServer({
      service: new VideoJobService(repository, dispatcher),
      apiKey: "test-secret",
    });

    const unauthorized = await server.inject({ method: "GET", url: "/v1/video-jobs/not-a-uuid" });
    expect(unauthorized.statusCode).toBe(401);
    const authorized = await server.inject({
      method: "GET",
      url: "/v1/video-jobs/not-a-uuid",
      headers: { authorization: "Bearer test-secret" },
    });
    expect(authorized.statusCode).toBe(400);
    expect((await server.inject({ method: "GET", url: "/health/live" })).statusCode).toBe(200);
    await server.close();
    repository.close();
  });

  it("retries a retryable failed generation from its checkpoint", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-api-retry-"));
    temporaryDirectories.push(dataDirectory);
    const repository = new SqliteVideoJobRepository(":memory:");
    let submitCount = 0;
    const provider: VideoProvider = {
      name: "flaky-provider",
      submit: async () => {
        submitCount += 1;
        return { provider: "flaky-provider", taskId: `task-${submitCount}`, status: "submitted" };
      },
      getTask: async (taskId) =>
        taskId === "task-1"
          ? {
              provider: "flaky-provider",
              taskId,
              status: "failed",
              errorMessage: "temporary capacity failure",
            }
          : {
              provider: "flaky-provider",
              taskId,
              status: "succeeded",
              outputUrl: "https://provider.example/recovered.mp4",
            },
    };
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      candidatePipeline: directPipeline(provider),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline: new ManifestDeliveryPipeline(new ManifestWriter(dataDirectory)),
      candidatesPerShot: 1,
    });
    const dispatcher = new WorkflowDispatcher(workflow);
    const server = buildServer({ service: new VideoJobService(repository, dispatcher) });
    const created = await server.inject({
      method: "POST",
      url: "/v1/video-jobs",
      payload: { brief: "可恢复的失败任务", durationSeconds: 5 },
    });
    const jobId = created.json<{ id: string }>().id;
    await dispatcher.waitForIdle();
    expect((await repository.findById(jobId))?.status).toBe("failed");

    const retried = await server.inject({ method: "POST", url: `/v1/video-jobs/${jobId}/retry` });
    expect(retried.statusCode).toBe(202);
    await dispatcher.waitForIdle();
    const completed = await repository.findById(jobId);
    expect(completed?.status).toBe("completed");
    expect(completed?.attempt).toBe(2);
    expect(submitCount).toBe(2);
    await server.close();
    repository.close();
  });
});

function directPipeline(provider: VideoProvider) {
  return new RecipeCandidateGenerationPipeline(
    new DirectShotRecipePlanner(),
    [new DirectVideoStepExecutor({ provider, pollIntervalMs: 1, timeoutMs: 1_000 })],
    "direct",
  );
}

function stubVoiceoverProvider(): VoiceoverProvider {
  return {
    name: "bailian-qwen-audio",
    model: "qwen-audio-3.0-tts-plus",
    capabilities: () => ({
      provider: "bailian-qwen-audio",
      model: "qwen-audio-3.0-tts-plus",
      mode: "http-non-streaming",
      region: "cn-beijing",
      temporaryUrlTtlSeconds: 86_400,
      defaults: {
        voice: "longanlingxin",
        instruction: "商业广告旁白",
        format: "wav",
        sampleRate: 48_000,
        volume: 50,
        rate: 1,
        pitch: 1,
        languageHints: ["zh"],
        enableAigcTag: true,
      },
      supportedSystemVoices: [],
      supportedFormats: ["mp3", "pcm", "wav", "opus"],
      supportedSampleRates: [8_000, 16_000, 22_050, 24_000, 44_100, 48_000],
      supportedLanguageHints: ["zh", "en"],
      supportsCustomVoiceIds: true,
      supportsInstruction: true,
      supportsSsml: true,
      supportsHotFix: true,
    }),
    synthesize: async (request) => ({
      provider: "bailian-qwen-audio",
      model: "qwen-audio-3.0-tts-plus",
      requestId: "request-test",
      audioUrl: "https://example.invalid/voice.wav",
      audioId: "audio-test",
      expiresAt: "2026-08-23T00:00:00.000Z",
      billedCharacters: 24,
      voice: request.voice ?? "longanlingxin",
      format: request.format ?? "wav",
      sampleRate: request.sampleRate ?? 48_000,
    }),
  };
}

function stubMusicProvider(): MusicProvider {
  return {
    name: "volcengine-bigmusic",
    model: "BigMusic-v5.0",
    capabilities: () => ({
      provider: "volcengine-bigmusic",
      model: "BigMusic-v5.0",
      mode: "asynchronous",
      region: "cn-beijing",
      billingMode: "duration",
      modelVersion: "v5.0",
      sourceLanguage: "zh",
      outputFormat: "wav-provider-default",
      providerUrlTtlSeconds: 31_536_000,
      defaults: {
        durationSeconds: 60,
        enablePromptRewrite: false,
        aigcWatermark: false,
        commercialSafetyPrefix: "原创、无人声；",
      },
      duration: {
        minimumSeconds: 30,
        maximumSeconds: 120,
        segmentMinimumSeconds: 5,
        supportedSegmentNames: ["intro", "verse", "chorus", "inst", "bridge", "outro"],
        precedence: ["segments total", "duration in prompt", "durationSeconds"],
      },
      supportsCallback: true,
      supportsCustomTosBucket: true,
      supportsImplicitWatermark: true,
      copyrightGuard: {
        providerCheckEnabled: true,
        rejectionCode: "50000001",
        guidance: ["Do not imitate existing music."],
      },
    }),
    preflight: async () => [{ productName: "BigMusic", authorizationStatus: "trial" }],
    submit: async () => ({
      provider: "volcengine-bigmusic",
      model: "BigMusic-v5.0",
      taskId: "music-task-test",
      status: "submitted",
      requestId: "request-music-test",
    }),
    getTask: async (taskId) => ({
      provider: "volcengine-bigmusic",
      model: "BigMusic-v5.0",
      taskId,
      status: "succeeded",
      progress: 100,
      audioUrl: "https://example.invalid/music.wav",
      durationSeconds: 60,
    }),
  };
}
