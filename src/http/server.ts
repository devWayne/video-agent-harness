import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
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
import { openApiDocument } from "./openapi.js";

const jobParamsSchema = z.object({ id: z.uuid() });
const projectParamsSchema = z.object({ id: z.uuid() });
const projectOperationParamsSchema = z.object({ id: z.uuid(), operationId: z.uuid() });
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

export interface BuildServerOptions {
  service: VideoJobService;
  projectService?: ProductionProjectService;
  logger?: boolean;
  apiKey?: string;
  uiDirectory?: string;
  runtimeInfo?: {
    videoProvider: "mock" | "bailian";
    videoModel: string;
    generationPipeline?: "direct" | "comfyui-libtv";
    deliveryMode: "simulation" | "cloud";
    generationResolution: "1080P";
  };
  workspaceInfo?: {
    name: string;
    controlSurfaces: Array<{
      id: "comfyui" | "libtv" | "hyperframes" | "delivery";
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
          paths: ["req.headers.authorization", "*.apiKey", "*.BAILIAN_API_KEY"],
          censor: "[REDACTED]",
        },
      }
    : false;
  const server = Fastify({
    logger,
    requestIdHeader: "x-request-id",
  });
  const compositionService = options.compositionService ?? new HyperframesCompositionService();

  if (options.uiDirectory && existsSync(join(options.uiDirectory, "index.html"))) {
    void server.register(fastifyStatic, {
      root: options.uiDirectory,
      prefix: "/",
      decorateReply: true,
    });
    server.get("/", (_request, reply) => reply.sendFile("index.html", options.uiDirectory));
  }

  server.addHook("onRequest", async (request, reply) => {
    if (!options.apiKey || !request.url.startsWith("/v1/")) return;
    const presented = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!presented || !safeEqual(presented, options.apiKey)) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "A valid bearer API key is required" });
    }
  });

  server.get("/health", () => ({ status: "ok" }));
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
      await options.projectService.assertProjectAndScene(projectLink.projectId, projectLink.sceneId);
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
    await options.projectService.assertProjectAndScene(id, body.sceneId);
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
    if (error instanceof HyperframesCompositionError) {
      return reply.code(422).send({
        code: error.code,
        message: error.message,
        findings: error.findings,
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

function safeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
