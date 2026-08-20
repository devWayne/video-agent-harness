export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Video Agent Harness API",
    version: "0.1.0",
    description: "TypeScript/Node.js control plane for recoverable, production-oriented video jobs.",
  },
  servers: [{ url: "/" }],
  tags: [{ name: "Workspace" }, { name: "Projects" }, { name: "Jobs" }, { name: "Compositions" }, { name: "Operations" }],
  paths: {
    "/v1/workspace": {
      get: {
        tags: ["Workspace"],
        summary: "Read the agent-neutral production workspace and control-surface links",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Runtime profile and non-secret control-surface metadata" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/health/live": {
      get: {
        tags: ["Operations"],
        summary: "Process liveness",
        responses: { "200": { description: "Process is alive" } },
      },
    },
    "/v1/projects": {
      get: {
        tags: ["Projects"],
        summary: "List production projects",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Projects ordered by last update" } },
      },
      post: {
        tags: ["Projects"],
        summary: "Create a project-level production workspace",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateProductionProject" } } },
        },
        responses: { "201": { description: "Project created" } },
      },
    },
    "/v1/projects/{id}": {
      get: {
        tags: ["Projects"],
        summary: "Get a project with its video jobs",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "200": { description: "Project detail" }, "404": { $ref: "#/components/responses/NotFound" } },
      },
      patch: {
        tags: ["Projects"],
        summary: "Update project metadata, delivery spec or workbench bindings",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "200": { description: "Updated project" } },
      },
    },
    "/v1/projects/{id}/assets": {
      post: {
        tags: ["Projects"],
        summary: "Register a versioned project asset",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "201": { description: "Asset registered" } },
      },
    },
    "/v1/projects/{id}/character-packs": {
      post: {
        tags: ["Projects"],
        summary: "Create a character consistency pack",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "201": { description: "Character pack created" } },
      },
    },
    "/v1/projects/{id}/scene-packs": {
      post: {
        tags: ["Projects"],
        summary: "Create a scene continuity pack",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "201": { description: "Scene pack created" } },
      },
    },
    "/v1/projects/{id}/scenes": {
      post: {
        tags: ["Projects"],
        summary: "Add a story scene and its shot briefs",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "201": { description: "Story scene created" } },
      },
    },
    "/v1/projects/{id}/production-plan": {
      put: {
        tags: ["Projects"],
        summary: "Persist the structured story, scene, shot and continuity plan authored by the main Agent",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SaveProductionPlan" } } },
        },
        responses: { "200": { description: "Production plan saved" }, "409": { description: "Plan references project data that does not exist" } },
      },
    },
    "/v1/projects/{id}/operations": {
      post: {
        tags: ["Projects", "Operations"],
        summary: "Declare one Agent-directed execution operation without granting Runtime creative authority",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateProductionOperation" } } },
        },
        responses: { "201": { description: "Operation recorded" }, "409": { description: "An input, dependency or stage gate is invalid" } },
      },
    },
    "/v1/projects/{id}/operations/{operationId}/start": {
      post: {
        tags: ["Operations"],
        summary: "Checkpoint provider execution start",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }, { $ref: "#/components/parameters/OperationId" }],
        responses: { "200": { description: "Operation started" }, "409": { description: "Transition or dependency conflict" } },
      },
    },
    "/v1/projects/{id}/operations/{operationId}/complete": {
      post: {
        tags: ["Operations"],
        summary: "Checkpoint output assets and move an operation to its explicit review gate",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }, { $ref: "#/components/parameters/OperationId" }],
        responses: { "200": { description: "Operation completed and waiting for review" }, "409": { description: "Transition or asset conflict" } },
      },
    },
    "/v1/projects/{id}/operations/{operationId}/fail": {
      post: {
        tags: ["Operations"],
        summary: "Record a typed execution failure without making a retry decision",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }, { $ref: "#/components/parameters/OperationId" }],
        responses: { "200": { description: "Failure recorded" }, "409": { description: "Transition conflict" } },
      },
    },
    "/v1/projects/{id}/operations/{operationId}/review": {
      post: {
        tags: ["Operations"],
        summary: "Persist a Codex or human review decision for a generated artifact",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }, { $ref: "#/components/parameters/OperationId" }],
        responses: { "200": { description: "Review decision recorded" }, "409": { description: "Operation is not reviewable at this gate" } },
      },
    },
    "/v1/projects/{id}/video-jobs": {
      post: {
        tags: ["Projects", "Jobs"],
        summary: "Create and attach a video job to a project or story scene",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "202": { description: "Project video job accepted" } },
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
      get: {
        tags: ["Jobs"],
        summary: "List recent video jobs",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Recent jobs" } },
      },
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
    "/v1/compositions/preview": {
      post: {
        tags: ["Compositions"],
        summary: "Compile and lint a safe HyperFrames preview composition",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateCompositionPreview" } },
          },
        },
        responses: {
          "201": { description: "Compiled HyperFrames HTML and preview metadata" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "422": { description: "Generated composition failed HyperFrames lint" },
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
      ProjectId: { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
      OperationId: { name: "operationId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
    },
    schemas: {
      CreateProductionProject: {
        type: "object",
        required: ["name", "brief"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          brief: { type: "string", minLength: 3, maxLength: 4000 },
          storySynopsis: { type: "string", maxLength: 4000, default: "" },
          deliverySpec: {
            type: "object",
            properties: {
              aspectRatio: { type: "string", const: "16:9" },
              width: { type: "integer", const: 3840 },
              height: { type: "integer", const: 2160 },
              fps: { type: "integer", minimum: 12, maximum: 60, default: 24 },
            },
          },
          workbenchBindings: {
            type: "object",
            properties: {
              comfyuiProfileId: { type: "string", maxLength: 200 },
              comfyuiUrl: { type: "string", format: "uri" },
              libtvCanvasUuid: { type: "string", format: "uuid" },
              libtvCanvasUrl: { type: "string", format: "uri" },
            },
          },
        },
      },
      SaveProductionPlan: {
        type: "object",
        required: ["agentHost", "plan"],
        properties: {
          agentHost: { type: "string", description: "Replaceable Agent Host, for example Codex GPT or Claude Code" },
          plan: { type: "object", description: "Structured StoryProductionPlan with scenes, shots and continuity state" },
        },
      },
      CreateProductionOperation: {
        type: "object",
        required: ["kind", "executor"],
        properties: {
          kind: { type: "string", enum: ["control-generation", "final-render", "assembly", "delivery"] },
          executor: { type: "string", enum: ["comfyui", "libtv", "online-video", "hyperframes", "delivery", "manual"] },
          shotId: { type: "string" },
          sceneId: { type: "string" },
          profileId: { type: "string" },
          prompt: { type: "string" },
          inputAssetIds: { type: "array", items: { type: "string", format: "uuid" }, default: [] },
          dependsOnOperationIds: { type: "array", items: { type: "string", format: "uuid" }, default: [] },
          parameters: { type: "object", additionalProperties: true, default: {} },
          requiresReview: { type: "boolean", default: true },
        },
      },
      ReferenceAsset: {
        type: "object",
        required: ["type", "url"],
        properties: {
          type: { type: "string", enum: ["image", "video", "audio"] },
          url: { type: "string", format: "uri" },
          assetId: { type: "string", format: "uuid" },
          purpose: { type: "string", maxLength: 200 },
        },
      },
      CreateVideoJob: {
        type: "object",
        required: ["brief"],
        properties: {
          projectId: { type: "string", format: "uuid" },
          sceneId: { type: "string", format: "uuid" },
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
      CreateCompositionPreview: {
        type: "object",
        required: ["title"],
        properties: {
          template: { type: "string", enum: ["title-card", "smart-city-story", "kinetic-character"], default: "title-card" },
          title: { type: "string", minLength: 1, maxLength: 100 },
          subtitle: { type: "string", maxLength: 220, default: "" },
          kicker: { type: "string", maxLength: 48, default: "VIDEO AGENT HARNESS" },
          backgroundVideoUrl: { type: "string", format: "uri", pattern: "^https://" },
          backgroundClips: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              required: ["videoUrl", "startSeconds", "durationSeconds"],
              properties: {
                videoUrl: { type: "string", format: "uri", pattern: "^https://" },
                startSeconds: { type: "number", minimum: 0, maximum: 30 },
                durationSeconds: { type: "number", exclusiveMinimum: 0, maximum: 30 },
                mediaStartSeconds: { type: "number", minimum: 0, maximum: 3600, default: 0 },
              },
            },
          },
          durationSeconds: { type: "number", minimum: 3, maximum: 30, default: 8 },
          theme: { type: "string", enum: ["violet", "cinema", "editorial"], default: "violet" },
          motion: { type: "string", enum: ["fade-up", "scale-in", "slide-left"], default: "fade-up" },
          accentColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#8b7cff" },
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
