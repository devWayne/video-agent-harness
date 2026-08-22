export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Video Agent Harness API",
    version: "0.1.0",
    description: "TypeScript/Node.js control plane for recoverable, production-oriented video jobs.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Workspace" },
    { name: "Voiceovers", description: "Commercial voice-over synthesis and model discovery" },
    { name: "Music", description: "Commercial instrumental background-music generation" },
    { name: "Projects" },
    { name: "Editorial", description: "Harness-owned multitrack timeline, revisions, locks and external workspace sync" },
    { name: "Jobs" },
    { name: "Compositions" },
    { name: "Operations" },
  ],
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
    "/v1/editorial-workspace/capabilities": {
      get: {
        tags: ["Editorial"],
        summary: "Read capabilities of the configured external editorial workspace",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Workspace capabilities" }, "503": { description: "No adapter configured" } },
      },
    },
    "/v1/projects/{id}/editorial-timelines": {
      get: {
        tags: ["Editorial"],
        summary: "List Harness-owned editorial timelines",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "200": { description: "Editorial timelines" }, "404": { $ref: "#/components/responses/NotFound" } },
      },
      post: {
        tags: ["Editorial"],
        summary: "Create a multitrack timeline with picture, overlay, caption, original audio, voice-over, music and SFX lanes",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        responses: { "201": { description: "Timeline created" } },
      },
    },
    "/v1/projects/{id}/editorial-timelines/{timelineId}": {
      get: {
        tags: ["Editorial"],
        summary: "Read a timeline including revisions, locks, candidates and markers",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/ProjectId" },
          { $ref: "#/components/parameters/TimelineId" },
        ],
        responses: { "200": { description: "Editorial timeline" }, "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/v1/projects/{id}/editorial-timelines/{timelineId}/clips/{clipId}/replace": {
      post: {
        tags: ["Editorial"],
        summary: "Replace one active clip while retaining prior candidates and invalidating affected locks",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/ProjectId" },
          { $ref: "#/components/parameters/TimelineId" },
          { $ref: "#/components/parameters/ClipId" },
        ],
        responses: { "200": { description: "Clip replaced" }, "409": { description: "Asset or track conflict" } },
      },
    },
    "/v1/projects/{id}/editorial-timelines/{timelineId}/markers": {
      post: {
        tags: ["Editorial"],
        summary: "Add a frame-accurate review marker",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/ProjectId" },
          { $ref: "#/components/parameters/TimelineId" },
        ],
        responses: { "201": { description: "Marker added" } },
      },
    },
    "/v1/projects/{id}/editorial-timelines/{timelineId}/locks/picture": {
      post: {
        tags: ["Editorial"],
        summary: "Lock the current picture revision",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }, { $ref: "#/components/parameters/TimelineId" }],
        responses: { "200": { description: "Picture revision locked" } },
      },
    },
    "/v1/projects/{id}/editorial-timelines/{timelineId}/locks/audio": {
      post: {
        tags: ["Editorial"],
        summary: "Lock the current audio revision",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }, { $ref: "#/components/parameters/TimelineId" }],
        responses: { "200": { description: "Audio revision locked" } },
      },
    },
    "/v1/projects/{id}/editorial-timelines/{timelineId}/workspace-sync": {
      post: {
        tags: ["Editorial"],
        summary: "Stage the authoritative Harness timeline in OpenChatCut through Streamable HTTP MCP",
        description: "Media must already exist in the OpenChatCut pool; assetBindings maps Harness asset IDs to pool asset IDs. Manual mode returns awaiting-review.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }, { $ref: "#/components/parameters/TimelineId" }],
        responses: { "200": { description: "Workspace sync applied" }, "202": { description: "Workspace sync awaits manual review" }, "503": { description: "Adapter unavailable" } },
      },
    },
    "/v1/voiceovers/capabilities": {
      get: {
        tags: ["Voiceovers"],
        summary: "Discover the configured voice-over model, defaults and supported parameters",
        description:
          "Returns non-secret runtime metadata suitable for building an upstream voice-over form. The current adapter uses Qwen Audio 3.0 TTS Plus over the Beijing non-streaming HTTP API.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Voice-over model capabilities",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VoiceoverCapabilities" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "503": { description: "Voice-over provider is not configured" },
        },
      },
    },
    "/v1/voiceovers": {
      post: {
        tags: ["Voiceovers"],
        summary: "Generate a commercial voice-over with Qwen Audio 3.0 TTS Plus",
        description:
          "Synchronous, non-streaming synthesis. The returned provider URL expires after 24 hours and must be imported into durable project storage before expiration.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateVoiceover" } },
          },
        },
        responses: {
          "201": {
            description: "Voice-over generated",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/VoiceoverResult" } },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "502": { description: "Provider returned a terminal or invalid response" },
          "503": { description: "Provider unavailable, throttled, timed out or not configured" },
        },
      },
    },
    "/v1/music/capabilities": {
      get: {
        tags: ["Music"],
        summary: "Discover the configured BigMusic v5.0 parameters and safety defaults",
        description:
          "Returns non-secret runtime metadata for upstream advertising and introduction-film applications.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Music-generation capabilities",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MusicCapabilities" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "503": { description: "Music provider is not configured" },
        },
      },
    },
    "/v1/music/usage": {
      get: {
        tags: ["Music"],
        summary: "Verify BigMusic authorization and read the current provider quota",
        description:
          "Read-only QueryUsage preflight. It does not generate music or consume generation quota.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "BigMusic authorization and usage items" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "502": { description: "Provider rejected the account or returned an invalid response" },
          "503": { description: "Provider unavailable, timed out or not configured" },
        },
      },
    },
    "/v1/music/tracks": {
      post: {
        tags: ["Music"],
        summary: "Submit an original instrumental background-music task",
        description:
          "Uses Volcengine GenBGMForTime for duration billing or GenBGM for package billing. The adapter prepends a commercial originality guard and always requests BigMusic v5.0.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMusicTrack" } },
          },
        },
        responses: {
          "202": {
            description: "Music-generation task accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SubmittedMusicTask" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "502": { description: "Provider rejected the request, including copyright checks" },
          "503": { description: "Provider unavailable, throttled, timed out or not configured" },
        },
      },
    },
    "/v1/music/tracks/{taskId}": {
      get: {
        tags: ["Music"],
        summary: "Query a BigMusic generation task",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/MusicTaskId" }],
        responses: {
          "200": {
            description: "Current task state and provider output when complete",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MusicTask" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "502": { description: "Provider returned a terminal or invalid response" },
          "503": { description: "Provider unavailable, throttled, timed out or not configured" },
        },
      },
    },
    "/v1/music/tracks/{taskId}/download": {
      get: {
        tags: ["Music"],
        summary: "Resolve the completed provider download URL",
        description:
          "The provider URL is a transfer source, not a durable application asset. Import it into project storage before publication.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/MusicTaskId" }],
        responses: {
          "200": { description: "Provider URL and retention instruction" },
          "409": { description: "Music task has not succeeded" },
          "502": { description: "Provider returned a terminal or invalid response" },
          "503": { description: "Provider unavailable, throttled, timed out or not configured" },
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
        summary: "Update project metadata, delivery spec, workbench bindings or generation mode",
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
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateProjectAsset" } } },
        },
        responses: { "201": { description: "Asset registered" } },
      },
    },
    "/v1/projects/{id}/character-packs": {
      post: {
        tags: ["Projects"],
        summary: "Create a character consistency pack",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/ProjectId" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateCharacterPack" } } },
        },
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
      TimelineId: { name: "timelineId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
      ClipId: { name: "clipId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
      OperationId: { name: "operationId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
      MusicTaskId: {
        name: "taskId",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 200 },
      },
    },
    schemas: {
      VoiceoverHotFixEntry: {
        type: "object",
        additionalProperties: false,
        required: ["source", "target"],
        properties: {
          source: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            description: "Exact source word or phrase to match in the submitted text.",
          },
          target: {
            type: "string",
            minLength: 1,
            maxLength: 300,
            description:
              "Pinyin with tone numbers for pronunciation rules, or replacement text for replace rules.",
          },
        },
      },
      CreateVoiceover: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          text: {
            type: "string",
            minLength: 1,
            maxLength: 20_000,
            description:
              "Text to synthesize. Plain text is recommended for advertising; SSML is accepted only when enableSsml is true.",
            examples: ["每一次出发，都值得更好的抵达。全新品牌名，让灵感即刻发生。"],
          },
          voice: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            default: "longanlingxin",
            description:
              "System, base or custom voice ID bound to qwen-audio-3.0-tts-plus. Discover system voices through the capabilities endpoint.",
          },
          instruction: {
            type: "string",
            minLength: 1,
            maxLength: 128,
            description:
              "Natural-language performance direction. It can control emotion, role, speaking style, dialect and delivery. Omit it to use the configured commercial-ad default.",
            examples: [
              "高端汽车品牌广告旁白，成熟克制，语速稍慢；品牌名清晰加重，结尾坚定但不喊叫。",
            ],
          },
          format: {
            type: "string",
            enum: ["mp3", "pcm", "wav", "opus"],
            default: "wav",
            description: "Audio container/codec. WAV is the production default for later mixing.",
          },
          sampleRate: {
            type: "integer",
            enum: [8000, 16000, 22050, 24000, 44100, 48000],
            default: 48000,
            description: "Output sample rate in Hz.",
          },
          volume: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            default: 50,
            description: "Synthesis volume. Final advertising loudness is handled during mastering.",
          },
          rate: {
            type: "number",
            minimum: 0.5,
            maximum: 2,
            default: 1,
            description: "Speaking-rate multiplier.",
          },
          pitch: {
            type: "number",
            minimum: 0.5,
            maximum: 2,
            default: 1,
            description: "Pitch multiplier.",
          },
          bitRate: {
            type: "integer",
            minimum: 6,
            maximum: 510,
            description: "Encoded bitrate in kbps. Supported only when format is opus.",
          },
          seed: {
            type: "integer",
            minimum: 0,
            maximum: 65535,
            default: 0,
            description:
              "Variation seed. Identical inputs and seed are reproducible only while the upstream model version remains unchanged.",
          },
          languageHints: {
            type: "array",
            minItems: 1,
            maxItems: 1,
            default: ["zh"],
            description:
              "Target language hint. The upstream service currently processes only the first item.",
            items: {
              type: "string",
              enum: [
                "zh",
                "en",
                "fr",
                "de",
                "ja",
                "ko",
                "ru",
                "pt",
                "th",
                "id",
                "vi",
                "es",
                "it",
                "ms",
                "fil",
                "ar",
              ],
            },
          },
          enableSsml: {
            type: "boolean",
            default: false,
            description: "Interpret text as supported SSML instead of plain text.",
          },
          enableAigcTag: {
            type: "boolean",
            default: true,
            description:
              "Embed the provider's invisible AIGC identifier in WAV, MP3 or Opus output. Enabled by default for commercial traceability.",
          },
          aigcPropagator: {
            type: "string",
            maxLength: 200,
            description:
              "Optional ContentPropagator value for the invisible AIGC tag. Requires enableAigcTag=true.",
          },
          aigcPropagateId: {
            type: "string",
            maxLength: 200,
            description:
              "Optional propagation event ID for the invisible AIGC tag. Requires enableAigcTag=true.",
          },
          hotFix: {
            type: "object",
            additionalProperties: false,
            description: "Per-request pronunciation correction and literal text replacement.",
            properties: {
              pronunciation: {
                type: "array",
                maxItems: 100,
                items: { $ref: "#/components/schemas/VoiceoverHotFixEntry" },
              },
              replace: {
                type: "array",
                maxItems: 100,
                items: { $ref: "#/components/schemas/VoiceoverHotFixEntry" },
              },
            },
          },
        },
      },
      VoiceoverResult: {
        type: "object",
        required: [
          "provider",
          "model",
          "requestId",
          "audioUrl",
          "audioId",
          "expiresAt",
          "billedCharacters",
          "voice",
          "format",
          "sampleRate",
        ],
        properties: {
          provider: { type: "string", const: "bailian-qwen-audio" },
          model: { type: "string", const: "qwen-audio-3.0-tts-plus" },
          requestId: { type: "string", description: "Alibaba Model Studio request ID." },
          audioUrl: {
            type: "string",
            format: "uri",
            description: "Temporary provider download URL, normally valid for 24 hours.",
          },
          audioId: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
          billedCharacters: {
            type: "integer",
            minimum: 0,
            description: "Provider-reported billable character count.",
          },
          voice: { type: "string" },
          format: { type: "string", enum: ["mp3", "pcm", "wav", "opus"] },
          sampleRate: {
            type: "integer",
            enum: [8000, 16000, 22050, 24000, 44100, 48000],
          },
        },
      },
      VoiceoverCapabilities: {
        type: "object",
        description:
          "Runtime-discoverable voice-over contract. It contains no API keys or workspace secrets.",
        required: [
          "provider",
          "model",
          "mode",
          "region",
          "temporaryUrlTtlSeconds",
          "defaults",
          "supportedSystemVoices",
          "supportedFormats",
          "supportedSampleRates",
          "supportedLanguageHints",
        ],
        properties: {
          provider: { type: "string", const: "bailian-qwen-audio" },
          model: { type: "string", const: "qwen-audio-3.0-tts-plus" },
          mode: { type: "string", const: "http-non-streaming" },
          region: { type: "string", const: "cn-beijing" },
          temporaryUrlTtlSeconds: { type: "integer", const: 86400 },
          defaults: { type: "object", additionalProperties: true },
          supportedSystemVoices: { type: "array", items: { type: "object" } },
          supportedFormats: {
            type: "array",
            items: { type: "string", enum: ["mp3", "pcm", "wav", "opus"] },
          },
          supportedSampleRates: { type: "array", items: { type: "integer" } },
          supportedLanguageHints: { type: "array", items: { type: "string" } },
          supportsCustomVoiceIds: { type: "boolean" },
          supportsInstruction: { type: "boolean" },
          supportsSsml: { type: "boolean" },
          supportsHotFix: { type: "boolean" },
        },
      },
      MusicSegment: {
        type: "object",
        additionalProperties: false,
        required: ["name", "durationSeconds"],
        properties: {
          name: {
            type: "string",
            enum: ["intro", "verse", "chorus", "inst", "bridge", "outro"],
            description: "BigMusic v5.0 section name.",
          },
          durationSeconds: {
            type: "integer",
            minimum: 5,
            maximum: 120,
            description:
              "Section duration. The sum of all sections must be 30–120 seconds; a single section must itself be 30–120 seconds.",
          },
        },
      },
      MusicImplicitWatermark: {
        type: "object",
        additionalProperties: false,
        required: ["enabled"],
        properties: {
          enabled: { type: "boolean" },
          contentProducer: { type: "string", minLength: 1, maxLength: 200 },
          produceId: { type: "string", minLength: 1, maxLength: 200 },
          contentPropagator: { type: "string", minLength: 1, maxLength: 200 },
          propagateId: { type: "string", minLength: 1, maxLength: 200 },
        },
      },
      CreateMusicTrack: {
        type: "object",
        additionalProperties: false,
        required: ["prompt"],
        properties: {
          prompt: {
            type: "string",
            minLength: 1,
            maxLength: 2000,
            description:
              "Chinese instrumental-music direction. Describe scene, mood, tempo, instrumentation, narrative arc, space for voice-over and the ending. Do not name or imitate artists, songs or film scores.",
            examples: [
              "现代企业科技介绍片，温暖可信、克制高级，95 BPM，钢琴、轻电子节奏与柔和弦乐，给旁白留出中频空间，中段轻微推进，结尾干净自然。",
            ],
          },
          durationSeconds: {
            type: "integer",
            minimum: 30,
            maximum: 120,
            default: 60,
            description:
              "Requested v5.0 duration. Segment totals override a duration in the prompt, which overrides this value.",
          },
          segments: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { $ref: "#/components/schemas/MusicSegment" },
          },
          enablePromptRewrite: {
            type: "boolean",
            default: false,
            description: "Allow BigMusic to rewrite the submitted prompt.",
          },
          storageBucket: {
            type: "string",
            minLength: 3,
            maxLength: 63,
            description: "Optional user-owned Volcengine TOS bucket name.",
          },
          callbackUrl: {
            type: "string",
            format: "uri",
            description: "Optional HTTPS asynchronous callback URL.",
          },
          implicitWatermark: { $ref: "#/components/schemas/MusicImplicitWatermark" },
          aigcWatermark: {
            type: "boolean",
            default: false,
            description: "Enable the provider's explicit AIGC watermark when the delivery policy requires it.",
          },
        },
      },
      SubmittedMusicTask: {
        type: "object",
        required: ["provider", "model", "taskId", "status"],
        properties: {
          provider: { type: "string", const: "volcengine-bigmusic" },
          model: { type: "string", const: "BigMusic-v5.0" },
          taskId: { type: "string" },
          status: { type: "string", const: "submitted" },
          requestId: { type: "string" },
          predictedWaitTimeSeconds: { type: "number", minimum: 0 },
        },
      },
      MusicTask: {
        type: "object",
        required: ["provider", "model", "taskId", "status", "progress"],
        properties: {
          provider: { type: "string", const: "volcengine-bigmusic" },
          model: { type: "string", const: "BigMusic-v5.0" },
          taskId: { type: "string" },
          status: {
            type: "string",
            enum: ["submitted", "running", "succeeded", "failed"],
          },
          progress: { type: "number", minimum: 0, maximum: 100 },
          requestId: { type: "string" },
          audioUrl: {
            type: "string",
            format: "uri",
            description:
              "Provider transfer URL. Download and import it into durable project storage instead of publishing the URL directly.",
          },
          durationSeconds: { type: "number", minimum: 0 },
          prompt: { type: "string" },
          storagePath: { type: "string" },
          styleInfo: { description: "Parsed BigMusic v5.0 StyleInfo metadata." },
          errorCode: { type: "string" },
          errorMessage: { type: "string" },
        },
      },
      MusicCapabilities: {
        type: "object",
        description:
          "Runtime-discoverable BigMusic contract, including durations, segment vocabulary, defaults and copyright-check guidance. Contains no secrets.",
        required: [
          "provider",
          "model",
          "mode",
          "region",
          "billingMode",
          "modelVersion",
          "sourceLanguage",
          "outputFormat",
          "providerUrlTtlSeconds",
          "defaults",
          "duration",
          "copyrightGuard",
        ],
        properties: {
          provider: { type: "string", const: "volcengine-bigmusic" },
          model: { type: "string", const: "BigMusic-v5.0" },
          mode: { type: "string", const: "asynchronous" },
          region: { type: "string", const: "cn-beijing" },
          billingMode: { type: "string", enum: ["duration", "package"] },
          modelVersion: { type: "string", const: "v5.0" },
          sourceLanguage: { type: "string", const: "zh" },
          outputFormat: { type: "string", const: "wav-provider-default" },
          providerUrlTtlSeconds: { type: "integer", const: 31536000 },
          defaults: { type: "object", additionalProperties: true },
          duration: { type: "object", additionalProperties: true },
          supportsCallback: { type: "boolean" },
          supportsCustomTosBucket: { type: "boolean" },
          supportsImplicitWatermark: { type: "boolean" },
          copyrightGuard: { type: "object", additionalProperties: true },
        },
      },
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
          generationMode: {
            type: "string",
            enum: ["local-only", "paid-providers-approved"],
            default: "local-only",
            description: "Hard provider gate. local-only blocks LibTV and online video generation until explicit user approval.",
          },
        },
      },
      CreateProjectAsset: {
        type: "object",
        required: ["name", "mediaType", "role", "uri"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          mediaType: { type: "string", enum: ["image", "video", "audio", "document", "workflow"] },
          role: { type: "string", enum: ["identity-reference", "appearance-reference", "action-reference", "camera-reference", "scene-reference", "style-reference", "voice-reference", "music", "control-asset", "final-candidate", "accepted-shot", "assembly-master", "delivery-master", "other"] },
          uri: { type: "string", format: "uri" },
          source: { type: "string", enum: ["user", "image-generation", "comfyui", "libtv", "online-video", "hyperframes", "delivery"], default: "user" },
          tags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 200 }, default: [] },
          notes: { type: "string", maxLength: 4000 },
          parentAssetId: { type: "string", format: "uuid" },
        },
      },
      CreateCharacterPack: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: "string", maxLength: 4000 },
          designBrief: { type: "string", maxLength: 4000 },
          canonicalAssetId: { type: "string", format: "uuid" },
          referenceAssetIds: { type: "array", maxItems: 12, items: { type: "string", format: "uuid" }, default: [] },
          referenceViews: {
            type: "array",
            maxItems: 12,
            default: [],
            items: {
              type: "object",
              required: ["assetId", "view"],
              properties: {
                assetId: { type: "string", format: "uuid" },
                view: { type: "string", enum: ["front", "left-profile", "right-profile", "left-three-quarter", "right-three-quarter", "back", "full-body-front", "full-body-back", "expression-sheet", "wardrobe-detail", "turnaround-sheet", "other"] },
                notes: { type: "string", maxLength: 1000 },
              },
            },
          },
          consistencyNotes: { type: "string", maxLength: 4000 },
          negativeConstraints: { type: "array", maxItems: 30, items: { type: "string", maxLength: 200 }, default: [] },
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
