import Fastify from "fastify";
import { z, ZodError } from "zod";
import type { VideoJobService } from "../application/video-job-service.js";

const jobParamsSchema = z.object({ id: z.uuid() });

export interface BuildServerOptions {
  service: VideoJobService;
  logger?: boolean;
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

  server.get("/health", () => ({ status: "ok" }));

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

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "Request validation failed",
        issues: error.issues,
      });
    }
    server.log.error(error);
    return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Internal server error" });
  });

  return server;
}
