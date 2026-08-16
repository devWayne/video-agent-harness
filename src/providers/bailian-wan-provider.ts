import { z } from "zod";
import {
  VideoProviderError,
  type ProviderTask,
  type SubmittedProviderTask,
  type VideoGenerationRequest,
  type VideoProvider,
} from "../domain/video-provider.js";

const submitResponseSchema = z.looseObject({
  request_id: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  output: z.looseObject({
    task_id: z.string(),
    task_status: z.string().optional(),
  }),
});

const taskResponseSchema = z.looseObject({
  request_id: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  output: z.looseObject({
    task_id: z.string(),
    task_status: z.string(),
    video_url: z.string().optional(),
    results: z
      .array(
        z.looseObject({
          url: z.string().optional(),
          video_url: z.string().optional(),
        }),
      )
      .optional(),
    code: z.string().optional(),
    message: z.string().optional(),
  }),
});

export interface BailianWanProviderOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

export class BailianWanProvider implements VideoProvider {
  readonly name = "bailian-wan";
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;

  constructor(options: BailianWanProviderOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? "wan2.7-t2v";
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async submit(
    request: VideoGenerationRequest,
    signal?: AbortSignal,
  ): Promise<SubmittedProviderTask> {
    if (!/^wan2\.7-t2v(?:-|$)/.test(this.#model)) {
      throw new VideoProviderError(
        `The configured model ${this.#model} does not have a verified request profile`,
        "WAN_MODEL_PROFILE_NOT_VERIFIED",
        false,
      );
    }
    if (request.durationSeconds < 2 || request.durationSeconds > 15) {
      throw new VideoProviderError(
        "Wan 2.7 text-to-video duration must be between 2 and 15 seconds",
        "WAN_T2V_DURATION_NOT_SUPPORTED",
        false,
      );
    }
    if (request.resolution !== "720P" && request.resolution !== "1080P") {
      throw new VideoProviderError(
        "Wan 2.7 text-to-video supports 720P or 1080P",
        "WAN_T2V_RESOLUTION_NOT_SUPPORTED",
        false,
      );
    }
    if (request.ratio !== "16:9") {
      throw new VideoProviderError(
        "The verified Wan 2.7 production profile only supports 16:9",
        "WAN_T2V_RATIO_NOT_SUPPORTED",
        false,
      );
    }
    if (!request.generateAudio) {
      throw new VideoProviderError(
        "Wan 2.7 generates matching audio when audio_url is omitted and has no verified silent-output switch",
        "WAN_SILENT_OUTPUT_NOT_SUPPORTED",
        false,
      );
    }
    const unsupportedReferences = request.references.filter(
      (reference) => reference.type !== "audio",
    );
    if (unsupportedReferences.length > 0) {
      throw new VideoProviderError(
        "Wan 2.7 text-to-video accepts text and one optional audio reference; use an I2V/R2V provider for image or video references",
        "WAN_T2V_REFERENCE_TYPE_NOT_SUPPORTED",
        false,
      );
    }
    const audioReferences = request.references.filter((reference) => reference.type === "audio");
    if (audioReferences.length > 1) {
      throw new VideoProviderError(
        "Wan 2.7 text-to-video accepts at most one audio reference",
        "WAN_T2V_TOO_MANY_AUDIO_REFERENCES",
        false,
      );
    }
    const audioReference = audioReferences[0];

    const response = await this.#fetch(
      `${this.#baseUrl}/services/aigc/video-generation/video-synthesis`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify({
          model: this.#model,
          input: {
            prompt: request.prompt,
            ...(audioReference ? { audio_url: audioReference.url } : {}),
          },
          parameters: {
            resolution: request.resolution,
            ratio: request.ratio,
            duration: request.durationSeconds,
          },
        }),
        ...(signal ? { signal } : {}),
      },
    );

    const payload = await readJson(response);
    if (!response.ok) throw providerHttpError(response, payload);

    const parsed = submitResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new VideoProviderError(
        "Bailian submit response did not include output.task_id",
        "INVALID_SUBMIT_RESPONSE",
        false,
        { cause: parsed.error },
      );
    }

    return { provider: this.name, taskId: parsed.data.output.task_id, status: "submitted" };
  }

  async getTask(taskId: string, signal?: AbortSignal): Promise<ProviderTask> {
    const response = await this.#fetch(`${this.#baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${this.#apiKey}` },
      ...(signal ? { signal } : {}),
    });
    const payload = await readJson(response);
    if (!response.ok) throw providerHttpError(response, payload);

    const parsed = taskResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new VideoProviderError(
        "Bailian task response did not match the expected asynchronous task shape",
        "INVALID_TASK_RESPONSE",
        false,
        { cause: parsed.error },
      );
    }

    const output = parsed.data.output;
    const normalizedStatus = normalizeStatus(output.task_status);
    const firstResult = output.results?.[0];
    const outputUrl = output.video_url ?? firstResult?.video_url ?? firstResult?.url;

    return {
      provider: this.name,
      taskId: output.task_id,
      status: normalizedStatus,
      ...(outputUrl ? { outputUrl } : {}),
      ...(normalizedStatus === "failed"
        ? {
            errorCode: output.code ?? parsed.data.code ?? "BAILIAN_TASK_FAILED",
            errorMessage: output.message ?? parsed.data.message ?? "Bailian video task failed",
          }
        : {}),
    };
  }
}

function normalizeStatus(status: string): ProviderTask["status"] {
  switch (status.toUpperCase()) {
    case "PENDING":
      return "submitted";
    case "RUNNING":
      return "running";
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
    case "CANCELED":
    case "CANCELLED":
      return "failed";
    default:
      throw new VideoProviderError(
        `Unknown Bailian task status: ${status}`,
        "UNKNOWN_TASK_STATUS",
        true,
      );
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new VideoProviderError(
      `Bailian returned a non-JSON response with status ${response.status}`,
      "NON_JSON_RESPONSE",
      response.status >= 500,
      { cause: error },
    );
  }
}

function providerHttpError(response: Response, payload: unknown): VideoProviderError {
  const errorPayload = z
    .looseObject({ code: z.string().optional(), message: z.string().optional() })
    .safeParse(payload);
  const code = errorPayload.success ? errorPayload.data.code : undefined;
  const message = errorPayload.success ? errorPayload.data.message : undefined;
  return new VideoProviderError(
    message ?? `Bailian request failed with HTTP ${response.status}`,
    code ?? `BAILIAN_HTTP_${response.status}`,
    response.status === 408 || response.status === 429 || response.status >= 500,
  );
}
