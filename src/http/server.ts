import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import {
  VideoJobDownloadError,
  type VideoJobService,
} from "../application/video-job-service.js";
import {
  ProductionProjectConflictError,
  ProductionProjectNotFoundError,
  type ProductionProjectService,
} from "../application/production-project-service.js";
import {
  HyperframesCompositionError,
  HyperframesCompositionService,
} from "../application/hyperframes-composition-service.js";
import { VideoJobRetryError } from "../domain/video-job.js";
import { ProductionOperationTransitionError } from "../domain/production-operation.js";
import { EditorialTimelineError } from "../domain/editorial-timeline.js";
import { EditorialWorkspaceError } from "../domain/editorial-workspace.js";
import {
  VoiceoverProviderError,
  voiceoverRequestSchema,
  type VoiceoverProvider,
} from "../domain/voiceover-provider.js";
import {
  MusicProviderError,
  musicTrackRequestSchema,
  type MusicProvider,
} from "../domain/music-provider.js";
import { openApiDocument } from "./openapi.js";

const jobParamsSchema = z.object({ id: z.uuid() });
const projectParamsSchema = z.object({ id: z.uuid() });
const projectOperationParamsSchema = z.object({ id: z.uuid(), operationId: z.uuid() });
const editorialTimelineParamsSchema = z.object({ id: z.uuid(), timelineId: z.uuid() });
const editorialClipParamsSchema = z.object({ id: z.uuid(), timelineId: z.uuid(), clipId: z.uuid() });
const projectJobInputSchema = z
  .object({ projectId: z.uuid().optional(), sceneId: z.uuid().optional() })
  .passthrough();
const recentJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const compositionPreviewParamsSchema = z.object({
  id: z.string().regex(/^harness-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
});
const downloadQuerySchema = z.object({
  expiresSeconds: z.coerce.number().int().min(60).max(3_600).default(900),
});
const musicTaskParamsSchema = z.object({
  taskId: z.string().trim().min(1).max(200),
});

export interface BuildServerOptions {
  service: VideoJobService;
  projectService?: ProductionProjectService;
  voiceoverProvider?: VoiceoverProvider;
  musicProvider?: MusicProvider;
  logger?: boolean;
  apiKey?: string;
  editorialWorkspaceApprovalMode?: "manual" | "auto";
  runtimeInfo?: {
    videoProvider: "mock" | "bailian" | "volcengine";
    videoModel: string;
    generationPipeline?: "direct" | "comfyui-libtv";
    deliveryMode: "simulation" | "cloud";
    generationResolution: "480P" | "720P" | "1080P";
    voiceoverProvider?: "none" | "bailian-qwen-audio";
    voiceoverModel?: string;
    musicProvider?: "none" | "volcengine-bigmusic";
    musicModel?: string;
  };
  workspaceInfo?: {
    name: string;
    controlSurfaces: Array<{
      id: "comfyui" | "libtv" | "editorial-workspace" | "hyperframes" | "delivery";
      name: string;
      role: string;
      status: "ready" | "configured" | "not-configured" | "disabled";
      kind: "external" | "embedded";
      url?: string;
    }>;
  };
  compositionService?: HyperframesCompositionService;
}

export function buildServer(options: BuildServerOptions) {
  const logger = options.logger
    ? {
        ...(process.env.NODE_ENV === "production"
          ? {}
          : { transport: { target: "pino-pretty", options: { colorize: true } } }),
        redact: {
          paths: [
            "req.headers.authorization",
            "*.apiKey",
            "*.BAILIAN_API_KEY",
            "*.ARK_API_KEY",
            "*.VOLCENGINE_MUSIC_ACCESS_KEY_ID",
            "*.VOLCENGINE_MUSIC_SECRET_ACCESS_KEY",
            "*.VOLCENGINE_MUSIC_SESSION_TOKEN",
            "*.OPENCHATCUT_MCP_TOKEN",
          ],
          censor: "[REDACTED]",
        },
      }
    : false;
  const server = Fastify({
    logger,
    requestIdHeader: "x-request-id",
  });
  const compositionService = options.compositionService ?? new HyperframesCompositionService();

  server.addHook("onRequest", async (request, reply) => {
    if (!options.apiKey || !request.url.startsWith("/v1/")) return;
    const presented = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!presented || !safeEqual(presented, options.apiKey)) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "A valid bearer API key is required" });
    }
  });

  server.get("/health", () => ({ status: "ok" }));
  server.get("/", () => ({
    service: "video-agent-harness",
    mode: "headless-production-control-plane",
    api: "/openapi.json",
    health: "/health/ready",
  }));
  server.get("/health/live", () => ({ status: "ok" }));
  server.get("/health/ready", async (_request, reply) => {
    const ready = await options.service.readiness();
    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      ...(options.runtimeInfo ? { runtime: options.runtimeInfo } : {}),
    });
  });
  server.get("/openapi.json", () => openApiDocument);
  server.get("/v1/workspace", () => ({
    runtime: options.runtimeInfo,
    workspace: options.workspaceInfo ?? { name: "Video Production", controlSurfaces: [] },
  }));

  server.get("/v1/voiceovers/capabilities", async (_request, reply) => {
    if (!options.voiceoverProvider) return voiceoverServiceUnavailable(reply);
    return reply.send(options.voiceoverProvider.capabilities());
  });

  server.post("/v1/voiceovers", async (request, reply) => {
    if (!options.voiceoverProvider) return voiceoverServiceUnavailable(reply);
    const input = voiceoverRequestSchema.parse(request.body);
    const result = await options.voiceoverProvider.synthesize(input);
    return reply.code(201).send(result);
  });

  server.get("/v1/music/capabilities", async (_request, reply) => {
    if (!options.musicProvider) return musicServiceUnavailable(reply);
    return reply.send(options.musicProvider.capabilities());
  });

  server.get("/v1/music/usage", async (_request, reply) => {
    if (!options.musicProvider) return musicServiceUnavailable(reply);
    return reply.send({ items: await options.musicProvider.preflight() });
  });

  server.post("/v1/music/tracks", async (request, reply) => {
    if (!options.musicProvider) return musicServiceUnavailable(reply);
    const input = musicTrackRequestSchema.parse(request.body);
    return reply.code(202).send(await options.musicProvider.submit(input));
  });

  server.get("/v1/music/tracks/:taskId", async (request, reply) => {
    if (!options.musicProvider) return musicServiceUnavailable(reply);
    const { taskId } = musicTaskParamsSchema.parse(request.params);
    return reply.send(await options.musicProvider.getTask(taskId));
  });

  server.get("/v1/music/tracks/:taskId/download", async (request, reply) => {
    if (!options.musicProvider) return musicServiceUnavailable(reply);
    const { taskId } = musicTaskParamsSchema.parse(request.params);
    const task = await options.musicProvider.getTask(taskId);
    if (task.status !== "succeeded" || !task.audioUrl) {
      return reply.code(409).send({
        code: "MUSIC_TRACK_NOT_READY",
        message: "The generated music track is not ready for download",
        task,
      });
    }
    return reply.send({
      provider: task.provider,
      taskId: task.taskId,
      audioUrl: task.audioUrl,
      providerUrlTtlSeconds: options.musicProvider.capabilities().providerUrlTtlSeconds,
      retentionInstruction:
        "Download and import this provider URL into durable project storage; do not use it directly in a published application.",
    });
  });

  server.get("/v1/projects", async (_request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    return reply.send(await options.projectService.list());
  });

  server.post("/v1/projects", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    return reply.code(201).send(await options.projectService.create(request.body));
  });

  server.get("/v1/projects/:id", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const detail = await options.projectService.getDetail(id);
    if (!detail) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(detail);
  });

  server.get("/v1/editorial-workspace/capabilities", async (_request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const capabilities = options.projectService.editorialWorkspaceCapabilities();
    if (!capabilities) return editorialWorkspaceUnavailable(reply);
    return reply.send(capabilities);
  });

  server.get("/v1/projects/:id/editorial-timelines", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const timelines = await options.projectService.listEditorialTimelines(id);
    if (!timelines) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(timelines);
  });

  server.post("/v1/projects/:id/editorial-timelines", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const project = await options.projectService.createEditorialTimeline(id, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.code(201).send(project);
  });

  server.get("/v1/projects/:id/editorial-timelines/:timelineId", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, timelineId } = editorialTimelineParamsSchema.parse(request.params);
    const timeline = await options.projectService.getEditorialTimeline(id, timelineId);
    if (!timeline) return reply.code(404).send({ code: "TIMELINE_NOT_FOUND", message: "Editorial timeline not found" });
    return reply.send(timeline);
  });

  server.post("/v1/projects/:id/editorial-timelines/:timelineId/clips/:clipId/replace", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, timelineId, clipId } = editorialClipParamsSchema.parse(request.params);
    const project = await options.projectService.replaceEditorialClip(id, timelineId, clipId, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(project);
  });

  server.post("/v1/projects/:id/editorial-timelines/:timelineId/markers", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, timelineId } = editorialTimelineParamsSchema.parse(request.params);
    const project = await options.projectService.addEditorialMarker(id, timelineId, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.code(201).send(project);
  });

  server.post("/v1/projects/:id/editorial-timelines/:timelineId/locks/picture", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, timelineId } = editorialTimelineParamsSchema.parse(request.params);
    const project = await options.projectService.lockEditorialPicture(id, timelineId, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(project);
  });

  server.post("/v1/projects/:id/editorial-timelines/:timelineId/locks/audio", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, timelineId } = editorialTimelineParamsSchema.parse(request.params);
    const project = await options.projectService.lockEditorialAudio(id, timelineId, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(project);
  });

  server.post("/v1/projects/:id/editorial-timelines/:timelineId/workspace-sync", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, timelineId } = editorialTimelineParamsSchema.parse(request.params);
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body)
      ? request.body as Record<string, unknown>
      : {};
    const result = await options.projectService.syncEditorialTimeline(id, timelineId, {
      approvalMode: options.editorialWorkspaceApprovalMode ?? "manual",
      ...body,
    });
    if (!result) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.code(result.sync.status === "applied" ? 200 : 202).send(result);
  });

  server.patch("/v1/projects/:id", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const project = await options.projectService.update(id, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(project);
  });

  server.post("/v1/projects/:id/assets", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const project = await options.projectService.addAsset(id, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.code(201).send(project);
  });

  server.post("/v1/projects/:id/character-packs", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const project = await options.projectService.addCharacterPack(id, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.code(201).send(project);
  });

  server.post("/v1/projects/:id/scene-packs", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const project = await options.projectService.addScenePack(id, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.code(201).send(project);
  });

  server.post("/v1/projects/:id/scenes", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const project = await options.projectService.addScene(id, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.code(201).send(project);
  });

  server.put("/v1/projects/:id/production-plan", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const project = await options.projectService.savePlan(id, request.body);
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(project);
  });

  server.post("/v1/projects/:id/operations", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const result = await options.projectService.createOperation(id, request.body);
    if (!result) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.code(201).send(result);
  });

  server.post("/v1/projects/:id/operations/:operationId/start", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, operationId } = projectOperationParamsSchema.parse(request.params);
    const result = await options.projectService.startOperation(id, operationId, request.body ?? {});
    if (!result) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(result);
  });

  server.post("/v1/projects/:id/operations/:operationId/complete", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, operationId } = projectOperationParamsSchema.parse(request.params);
    const result = await options.projectService.completeOperation(id, operationId, request.body);
    if (!result) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(result);
  });

  server.post("/v1/projects/:id/operations/:operationId/fail", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, operationId } = projectOperationParamsSchema.parse(request.params);
    const result = await options.projectService.failOperation(id, operationId, request.body);
    if (!result) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(result);
  });

  server.post("/v1/projects/:id/operations/:operationId/review", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id, operationId } = projectOperationParamsSchema.parse(request.params);
    const result = await options.projectService.reviewOperation(id, operationId, request.body);
    if (!result) return reply.code(404).send({ code: "PROJECT_NOT_FOUND", message: "Production project not found" });
    return reply.send(result);
  });

  server.get("/v1/video-jobs", async (request, reply) => {
    const { limit } = recentJobsQuerySchema.parse(request.query);
    return reply.send(await options.service.listRecent(limit));
  });
  server.get("/compositions/previews/:id.html", async (request, reply) => {
    const { id } = compositionPreviewParamsSchema.parse(request.params);
    const html = compositionService.getPreviewHtml(id);
    if (!html) return reply.code(404).send({ code: "COMPOSITION_NOT_FOUND", message: "Composition preview not found" });
    return reply
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff")
      .type("text/html; charset=utf-8")
      .send(html);
  });
  server.get("/metrics", async (_request, reply) => {
    const counts = await options.service.statistics();
    const lines = [
      "# HELP video_agent_harness_jobs Current video jobs by status.",
      "# TYPE video_agent_harness_jobs gauge",
      ...Object.entries(counts).map(
        ([status, count]) => `video_agent_harness_jobs{status="${status}"} ${count}`,
      ),
    ];
    return reply.type("text/plain; version=0.0.4; charset=utf-8").send(`${lines.join("\n")}\n`);
  });

  server.post("/v1/video-jobs", async (request, reply) => {
    const projectLink = projectJobInputSchema.parse(request.body);
    if (projectLink.projectId) {
      if (!options.projectService) return projectServiceUnavailable(reply);
      await options.projectService.assertVideoJobAllowed(projectLink.projectId, projectLink.sceneId);
    }
    const job = await options.service.create(request.body);
    if (job.request.projectId && options.projectService) {
      await options.projectService.attachJob(job.request.projectId, job.id, job.request.sceneId);
    }
    return reply.code(202).send(job);
  });

  server.post("/v1/projects/:id/video-jobs", async (request, reply) => {
    if (!options.projectService) return projectServiceUnavailable(reply);
    const { id } = projectParamsSchema.parse(request.params);
    const body = projectJobInputSchema.parse(request.body);
    await options.projectService.assertVideoJobAllowed(id, body.sceneId);
    const job = await options.service.create({ ...body, projectId: id });
    await options.projectService.attachJob(id, job.id, job.request.sceneId);
    return reply.code(202).send(job);
  });

  server.post("/v1/compositions/preview", async (request, reply) => {
    const preview = await compositionService.createPreview(request.body);
    return reply.code(201).send(preview);
  });

  server.get("/v1/video-jobs/:id", async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const job = await options.service.get(id);
    if (!job) return reply.code(404).send({ code: "JOB_NOT_FOUND", message: "Video job not found" });
    return reply.send(job);
  });

  server.post("/v1/video-jobs/:id/cancel", async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const job = await options.service.cancel(id);
    if (!job) return reply.code(404).send({ code: "JOB_NOT_FOUND", message: "Video job not found" });
    return reply.send(job);
  });

  server.post("/v1/video-jobs/:id/retry", async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const job = await options.service.retry(id);
    if (!job) return reply.code(404).send({ code: "JOB_NOT_FOUND", message: "Video job not found" });
    return reply.code(202).send(job);
  });

  server.get("/v1/video-jobs/:id/download", async (request, reply) => {
    const { id } = jobParamsSchema.parse(request.params);
    const { expiresSeconds } = downloadQuerySchema.parse(request.query);
    const signed = await options.service.createDownloadUrl(id, expiresSeconds);
    if (!signed) return reply.code(404).send({ code: "JOB_NOT_FOUND", message: "Video job not found" });
    return reply.send(signed);
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "Request validation failed",
        issues: error.issues,
      });
    }
    if (error instanceof VideoJobRetryError) {
      return reply.code(409).send({ code: error.code, message: error.message });
    }
    if (error instanceof VideoJobDownloadError) {
      return reply.code(409).send({ code: error.code, message: error.message });
    }
    if (error instanceof ProductionProjectNotFoundError) {
      return reply.code(404).send({ code: error.code, message: error.message });
    }
    if (error instanceof ProductionProjectConflictError) {
      return reply.code(409).send({ code: error.code, message: error.message });
    }
    if (error instanceof ProductionOperationTransitionError) {
      return reply.code(409).send({ code: error.code, message: error.message });
    }
    if (error instanceof EditorialTimelineError) {
      return reply.code(error.code === "TIMELINE_NOT_FOUND" || error.code === "CLIP_NOT_FOUND" ? 404 : 409).send({
        code: error.code,
        message: error.message,
      });
    }
    if (error instanceof EditorialWorkspaceError) {
      return reply.code(error.retryable ? 503 : 502).send({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (error instanceof HyperframesCompositionError) {
      return reply.code(422).send({
        code: error.code,
        message: error.message,
        findings: error.findings,
      });
    }
    if (error instanceof VoiceoverProviderError) {
      return reply.code(error.retryable ? 503 : 502).send({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (error instanceof MusicProviderError) {
      return reply.code(error.retryable ? 503 : 502).send({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    server.log.error(error);
    return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Internal server error" });
  });

  return server;
}

function projectServiceUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: "PROJECT_SERVICE_UNAVAILABLE",
    message: "Production project service is not configured",
  });
}

function voiceoverServiceUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: "VOICEOVER_SERVICE_UNAVAILABLE",
    message: "Voice-over synthesis is not configured",
  });
}

function musicServiceUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: "MUSIC_SERVICE_UNAVAILABLE",
    message: "AI background-music generation is not configured",
  });
}

function editorialWorkspaceUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: "EDITORIAL_WORKSPACE_UNAVAILABLE",
    message: "Editorial workspace adapter is not configured",
  });
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
