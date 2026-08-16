import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import {
  VideoJobDownloadError,
  type VideoJobService,
} from "../application/video-job-service.js";
import { VideoJobRetryError } from "../domain/video-job.js";
import { openApiDocument } from "./openapi.js";

const jobParamsSchema = z.object({ id: z.uuid() });
const downloadQuerySchema = z.object({
  expiresSeconds: z.coerce.number().int().min(60).max(3_600).default(900),
});

export interface BuildServerOptions {
  service: VideoJobService;
  logger?: boolean;
  apiKey?: string;
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
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready" });
  });
  server.get("/openapi.json", () => openApiDocument);
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
    const job = await options.service.create(request.body);
    return reply.code(202).send(job);
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
    server.log.error(error);
    return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Internal server error" });
  });

  return server;
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
