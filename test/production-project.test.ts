import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FirstSuccessfulCandidateEvaluator } from "../src/application/candidate-evaluator.js";
import { RecipeCandidateGenerationPipeline } from "../src/application/candidate-generation-pipeline.js";
import { ManifestDeliveryPipeline } from "../src/application/delivery-pipeline.js";
import { DeterministicDirector } from "../src/application/director.js";
import { ManifestWriter } from "../src/application/manifest-writer.js";
import { ProductionProjectService } from "../src/application/production-project-service.js";
import { DirectShotRecipePlanner } from "../src/application/shot-recipe-planner.js";
import { VideoJobService } from "../src/application/video-job-service.js";
import { WorkflowDispatcher } from "../src/application/workflow-dispatcher.js";
import { WorkflowEngine } from "../src/application/workflow-engine.js";
import type { ProductionProject } from "../src/domain/production-project.js";
import { buildServer } from "../src/http/server.js";
import { SqliteVideoJobRepository } from "../src/infrastructure/sqlite-video-job-repository.js";
import { DirectVideoStepExecutor } from "../src/providers/direct-video-step-executor.js";
import { MockVideoProvider } from "../src/providers/mock-video-provider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("production project API", () => {
  it("persists project assets, continuity packs, scenes and attached video jobs", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "video-agent-project-"));
    temporaryDirectories.push(dataDirectory);
    const repository = new SqliteVideoJobRepository(":memory:");
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      candidatePipeline: new RecipeCandidateGenerationPipeline(
        new DirectShotRecipePlanner(),
        [new DirectVideoStepExecutor({ provider: new MockVideoProvider(0), pollIntervalMs: 1, timeoutMs: 1_000 })],
        "direct",
      ),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline: new ManifestDeliveryPipeline(new ManifestWriter(dataDirectory)),
      candidatesPerShot: 1,
    });
    const dispatcher = new WorkflowDispatcher(workflow);
    const projectService = new ProductionProjectService(repository, repository);
    const server = buildServer({
      service: new VideoJobService(repository, dispatcher),
      projectService,
    });

    const created = await server.inject({
      method: "POST",
      url: "/v1/projects",
      payload: {
        name: "门口反转短片",
        brief: "人物开门后遇到访客，形成连贯动作与喜剧反转。",
        storySynopsis: "建立人物、访客和室内门口场景的一致性。",
        workbenchBindings: {
          comfyuiProfileId: "h3-ref2va-four-image-identity-control",
          libtvCanvasUuid: "11111111-1111-4111-8111-111111111111",
        },
        generationMode: "paid-providers-approved",
      },
    });
    expect(created.statusCode).toBe(201);
    const projectId = created.json<ProductionProject>().id;

    const assetResponse = await server.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/assets`,
      payload: {
        name: "男主正面身份图",
        mediaType: "image",
        role: "identity-reference",
        uri: "https://assets.example/actor-front.jpg",
        tags: ["male-lead", "front"],
      },
    });
    const assetProject = assetResponse.json<ProductionProject>();
    const assetId = assetProject.assets[0]?.id;
    expect(assetResponse.statusCode).toBe(201);
    expect(assetId).toBeDefined();
    if (!assetId) throw new Error("Expected a project asset");

    const characterResponse = await server.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/character-packs`,
      payload: {
        name: "男主",
        referenceAssetIds: [assetId],
        consistencyNotes: "保持短发、面部比例与白色背心。",
      },
    });
    const characterProject = characterResponse.json<ProductionProject>();
    const characterPackId = characterProject.characterPacks[0]?.id;
    expect(characterPackId).toBeDefined();
    if (!characterPackId) throw new Error("Expected a character pack");

    const scenePackResponse = await server.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/scene-packs`,
      payload: {
        name: "室内门口",
        location: "公寓入户门与客厅",
        lighting: "暖色室内夜景",
        referenceAssetIds: [],
      },
    });
    const scenePackId = scenePackResponse.json<ProductionProject>().scenePacks[0]?.id;
    expect(scenePackId).toBeDefined();
    if (!scenePackId) throw new Error("Expected a scene pack");

    const sceneResponse = await server.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/scenes`,
      payload: {
        title: "访客到来",
        summary: "男主开门、看到访客、迅速关门并说出台词。",
        durationSeconds: 18,
        characterPackIds: [characterPackId],
        scenePackId,
        shotBriefs: ["男主走向门口", "开门看到访客", "迅速关门并说出台词"],
      },
    });
    const sceneId = sceneResponse.json<ProductionProject>().scenes[0]?.id;
    expect(sceneId).toBeDefined();
    if (!sceneId) throw new Error("Expected a story scene");

    const jobResponse = await server.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/video-jobs`,
      payload: {
        sceneId,
        brief: "男主从沙发起身走向门口并打开门",
        durationSeconds: 5,
      },
    });
    expect(jobResponse.statusCode).toBe(202);
    await dispatcher.waitForIdle();

    const detail = await server.inject({ method: "GET", url: `/v1/projects/${projectId}` });
    const detailBody = detail.json<{ project: ProductionProject; jobs: Array<{ request: { projectId: string; sceneId: string } }> }>();
    expect(detailBody.project.videoJobIds).toHaveLength(1);
    expect(detailBody.project.scenes[0]?.videoJobIds).toHaveLength(1);
    expect(detailBody.jobs[0]?.request).toMatchObject({ projectId, sceneId });
    expect((await server.inject({ method: "GET", url: "/v1/projects" })).json<ProductionProject[]>()).toHaveLength(1);

    const otherProject = await server.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "另一个项目", brief: "用于验证跨项目素材隔离。" },
    });
    const crossProjectPack = await server.inject({
      method: "POST",
      url: `/v1/projects/${otherProject.json<ProductionProject>().id}/character-packs`,
      payload: { name: "错误引用", referenceAssetIds: [assetId] },
    });
    expect(crossProjectPack.statusCode).toBe(409);
    expect(crossProjectPack.json<{ code: string }>().code).toBe("PROJECT_CONFLICT");

    await server.close();
    repository.close();
  });

  it("defaults projects to local-only and blocks project video jobs until explicit unlock", async () => {
    const repository = new SqliteVideoJobRepository(":memory:");
    const dataDirectory = await mkdtemp(join(tmpdir(), "local-lock-"));
    temporaryDirectories.push(dataDirectory);
    const workflow = new WorkflowEngine({
      repository,
      director: new DeterministicDirector(),
      candidatePipeline: new RecipeCandidateGenerationPipeline(
        new DirectShotRecipePlanner(),
        [new DirectVideoStepExecutor({ provider: new MockVideoProvider(0), pollIntervalMs: 1, timeoutMs: 1_000 })],
        "direct",
      ),
      evaluator: new FirstSuccessfulCandidateEvaluator(),
      deliveryPipeline: new ManifestDeliveryPipeline(new ManifestWriter(dataDirectory)),
      candidatesPerShot: 1,
    });
    const dispatcher = new WorkflowDispatcher(workflow);
    const server = buildServer({
      service: new VideoJobService(repository, dispatcher),
      projectService: new ProductionProjectService(repository, repository),
    });

    const created = await server.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Local locked", brief: "Local generation only until the user explicitly unlocks it." },
    });
    const project = created.json<ProductionProject>();
    expect(project.generationMode).toBe("local-only");

    const blocked = await server.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/video-jobs`,
      payload: { brief: "This must not reach an online provider", durationSeconds: 5 },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json<{ message: string }>().message).toContain("locked to local generation");

    const unlocked = await server.inject({
      method: "PATCH",
      url: `/v1/projects/${project.id}`,
      payload: { generationMode: "paid-providers-approved" },
    });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.json<ProductionProject>().generationMode).toBe("paid-providers-approved");

    await server.close();
    repository.close();
  });

  it("persists an editorial timeline and invalidates picture lock after replacing one clip", async () => {
    const repository = new SqliteVideoJobRepository(":memory:");
    const service = new ProductionProjectService(repository, repository);
    let project = await service.create({ name: "Editorial test", brief: "Test local candidate replacement." });
    project = (await service.addAsset(project.id, {
      name: "Shot A",
      mediaType: "video",
      role: "accepted-shot",
      uri: "https://assets.example/shot-a.mp4",
    }))!;
    const firstAssetId = project.assets[0]!.id;
    project = (await service.addAsset(project.id, {
      name: "Shot B",
      mediaType: "video",
      role: "final-candidate",
      uri: "https://assets.example/shot-b.mp4",
      parentAssetId: firstAssetId,
    }))!;
    const secondAssetId = project.assets[1]!.id;
    project = (await service.createEditorialTimeline(project.id, {
      name: "Master timeline",
      tracks: [{
        name: "V1 Picture",
        kind: "video",
        role: "picture",
        clips: [{ assetId: firstAssetId, timelineStartFrame: 0, durationFrames: 120 }],
      }],
    }))!;
    const timelineId = project.editorialTimelines[0]!.id;
    const clipId = project.editorialTimelines[0]!.tracks[0]!.clips[0]!.id;
    project = (await service.lockEditorialPicture(project.id, timelineId, { lockedBy: "reviewer" }))!;
    project = (await service.replaceEditorialClip(project.id, timelineId, clipId, {
      assetId: secondAssetId,
      mode: "preserve-slot",
    }))!;

    const persisted = await repository.findProjectById(project.id);
    expect(persisted?.editorialTimelines[0]).toMatchObject({
      pictureRevision: 2,
      pictureLock: { revision: 1, lockedBy: "reviewer" },
      tracks: [{ clips: [{ assetId: secondAssetId, candidateAssetIds: [firstAssetId, secondAssetId] }] }],
    });
    repository.close();
  });
});
