export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Video Agent Harness API",
    version: "0.1.0",
    description: "TypeScript/Node.js control plane for recoverable, production-oriented video jobs.",
  },
  servers: [{ url: "/" }],
  tags: [{ name: "Jobs" }, { name: "Operations" }],
  paths: {
    "/health/live": {
      get: {
        tags: ["Operations"],
        summary: "Process liveness",
        responses: { "200": { description: "Process is alive" } },
      },
    },
    "/health/ready": {
      get: {
        tags: ["Operations"],
        summary: "Storage readiness",
        responses: {
          "200": { description: "Ready to serve jobs" },
          "503": { description: "A required dependency is unavailable" },
        },
      },
    },
    "/metrics": {
      get: {
        tags: ["Operations"],
        summary: "Prometheus-compatible current job gauges",
        responses: { "200": { description: "Metrics in Prometheus text format" } },
      },
    },
    "/v1/video-jobs": {
      post: {
        tags: ["Jobs"],
        summary: "Create a video production job",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateVideoJob" } },
          },
        },
        responses: {
          "202": {
            description: "Accepted",
            content: { "application/json": { schema: { $ref: "#/components/schemas/VideoJob" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/v1/video-jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "Get a job and its checkpoints",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: {
          "200": {
            description: "Job",
            content: { "application/json": { schema: { $ref: "#/components/schemas/VideoJob" } } },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/v1/video-jobs/{id}/cancel": {
      post: {
        tags: ["Jobs"],
        summary: "Cancel a non-terminal job",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: { "200": { description: "Cancelled or already terminal" } },
      },
    },
    "/v1/video-jobs/{id}/retry": {
      post: {
        tags: ["Jobs"],
        summary: "Retry a retryable failed job from its last durable checkpoint",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: {
          "202": { description: "Retry accepted" },
          "409": { description: "Job is not retryable" },
        },
      },
    },
    "/v1/video-jobs/{id}/download": {
      get: {
        tags: ["Jobs"],
        summary: "Create a short-lived signed URL for the private 4K delivery",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/JobId" },
          {
            name: "expiresSeconds",
            in: "query",
            schema: { type: "integer", minimum: 60, maximum: 3600, default: 900 },
          },
        ],
        responses: {
          "200": { description: "Signed URL and expiration time" },
          "409": { description: "Cloud delivery is not complete" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API key" },
    },
    parameters: {
      JobId: { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
    },
    schemas: {
      ReferenceAsset: {
        type: "object",
        required: ["type", "url"],
        properties: {
          type: { type: "string", enum: ["image", "video", "audio"] },
          url: { type: "string", format: "uri" },
          purpose: { type: "string", maxLength: 200 },
        },
      },
      CreateVideoJob: {
        type: "object",
        required: ["brief"],
        properties: {
          brief: { type: "string", minLength: 3, maxLength: 4000 },
          durationSeconds: { type: "integer", minimum: 5, maximum: 60, default: 15 },
          aspectRatio: { type: "string", const: "16:9", default: "16:9" },
          outputResolution: { type: "string", const: "3840x2160", default: "3840x2160" },
          references: {
            type: "array",
            maxItems: 20,
            items: { $ref: "#/components/schemas/ReferenceAsset" },
            default: [],
          },
          idempotencyKey: { type: "string", minLength: 1, maxLength: 200 },
        },
      },
      VideoJob: {
        type: "object",
        required: ["id", "request", "status", "version", "createdAt", "updatedAt", "shots"],
        properties: {
          id: { type: "string", format: "uuid" },
          request: { $ref: "#/components/schemas/CreateVideoJob" },
          status: {
            type: "string",
            enum: [
              "queued",
              "planning",
              "generating",
              "evaluating",
              "persisting",
              "mastering",
              "upscaling",
              "composing",
              "completed",
              "failed",
              "cancelled",
            ],
          },
          version: { type: "integer" },
          attempt: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          shots: { type: "array", items: { type: "object", additionalProperties: true } },
          delivery: { type: "object", additionalProperties: true },
          output: { type: "object", additionalProperties: true },
          error: { type: "object", additionalProperties: true },
          events: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
      Error: {
        type: "object",
        required: ["code", "message"],
        properties: { code: { type: "string" }, message: { type: "string" } },
      },
    },
    responses: {
      BadRequest: {
        description: "Invalid request",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Unauthorized: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "Job not found",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
} as const;
