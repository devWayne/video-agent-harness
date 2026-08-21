import { z } from "zod";
import {
  VideoProviderError,
  type ProviderTask,
  type SubmittedProviderTask,
  type VideoGenerationRequest,
  type VideoProvider,
} from "../domain/video-provider.js";

const submitResponseSchema = z.looseObject({
  id: z.string().min(1),
});

const taskResponseSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string().min(1),
  content: z
    .looseObject({
      video_url: z.url().optional(),
    })
    .optional(),
  error: z
    .looseObject({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

export interface VolcengineSeedanceProviderOptions {
  baseUrl?: string;
  apiKey: string;
  model?: string;
  watermark?: boolean;
  fetch?: typeof fetch;
}

/** Direct Fire-and-poll adapter for the Volcengine Ark Seedance 2.5 API. */
export class VolcengineSeedanceProvider implements VideoProvider {
  readonly name = "volcengine-seedance";
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #watermark: boolean;
  readonly #fetch: typeof fetch;

  constructor(options: VolcengineSeedanceProviderOptions) {
    this.#baseUrl = (options.baseUrl ?? "https://ark.cn-beijing.volces.com/api/v3").replace(
      /\/$/,
      "",
    );
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? "doubao-seedance-2-5-260628";
    this.#watermark = options.watermark ?? false;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async submit(
    request: VideoGenerationRequest,
    signal?: AbortSignal,
  ): Promise<SubmittedProviderTask> {
    this.#validateRequest(request);

    const response = await this.#request("/contents/generations/tasks", {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify({
        model: this.#model,
        content: [
          { type: "text", text: request.prompt },
          ...request.references.map(toSeedanceContent),
        ],
        generate_audio: request.generateAudio,
        resolution: request.resolution.toLowerCase(),
        ratio: request.ratio,
        duration: request.durationSeconds,
        watermark: this.#watermark,
      }),
      ...(signal ? { signal } : {}),
    });

    const payload = await readJson(response);
    if (!response.ok) throw providerHttpError(response, payload);

    const parsed = submitResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new VideoProviderError(
        "Volcengine submit response did not include a task id",
        "INVALID_SUBMIT_RESPONSE",
        false,
        { cause: parsed.error },
      );
    }

    return { provider: this.name, taskId: parsed.data.id, status: "submitted" };
  }

  async getTask(taskId: string, signal?: AbortSignal): Promise<ProviderTask> {
    const response = await this.#request(
      `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      {
        headers: this.#headers(),
        ...(signal ? { signal } : {}),
      },
    );
    const payload = await readJson(response);
    if (!response.ok) throw providerHttpError(response, payload);

    const parsed = taskResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new VideoProviderError(
        "Volcengine task response did not match the expected asynchronous task shape",
        "INVALID_TASK_RESPONSE",
        false,
        { cause: parsed.error },
      );
    }

    const status = normalizeStatus(parsed.data.status);
    const taskError = terminalTaskError(parsed.data.status, parsed.data.error);
    return {
      provider: this.name,
      taskId: parsed.data.id,
      status,
      ...(parsed.data.content?.video_url ? { outputUrl: parsed.data.content.video_url } : {}),
      ...(taskError ?? {}),
    };
  }

  async cancel(taskId: string, signal?: AbortSignal): Promise<void> {
    const response = await this.#request(
      `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "DELETE",
        headers: this.#headers(),
        ...(signal ? { signal } : {}),
      },
    );
    const payload = await readJson(response);
    if (!response.ok) throw providerHttpError(response, payload);
  }

  #headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.#apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.#fetch(`${this.#baseUrl}${path}`, init);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new VideoProviderError(
        "Volcengine request failed before an HTTP response was received; task acceptance may be unknown",
        "VOLCENGINE_NETWORK_ERROR",
        true,
        { cause: error },
      );
    }
  }

  #validateRequest(request: VideoGenerationRequest): void {
    if (!/^doubao-seedance-2-5(?:-|$)/.test(this.#model)) {
      throw new VideoProviderError(
        `The configured model ${this.#model} is not a verified Doubao Seedance 2.5 model`,
        "SEEDANCE_MODEL_PROFILE_NOT_VERIFIED",
        false,
      );
    }
    if (request.durationSeconds < 4 || request.durationSeconds > 30) {
      throw new VideoProviderError(
        "Seedance 2.5 duration must be between 4 and 30 seconds",
        "SEEDANCE_DURATION_NOT_SUPPORTED",
        false,
      );
    }
    if (request.resolution !== "480P" && request.resolution !== "720P") {
      throw new VideoProviderError(
        "The verified Seedance 2.5 profile supports 480P or 720P output",
        "SEEDANCE_RESOLUTION_NOT_SUPPORTED",
        false,
      );
    }

    const frameRoles = request.references
      .filter((reference) => reference.type === "image")
      .map((reference) => imageRole(reference.purpose));
    if (frameRoles.filter((role) => role === "first_frame").length > 1) {
      throw new VideoProviderError(
        "Seedance accepts at most one first-frame reference",
        "SEEDANCE_TOO_MANY_FIRST_FRAMES",
        false,
      );
    }
    if (frameRoles.filter((role) => role === "last_frame").length > 1) {
      throw new VideoProviderError(
        "Seedance accepts at most one last-frame reference",
        "SEEDANCE_TOO_MANY_LAST_FRAMES",
        false,
      );
    }
  }
}

function toSeedanceContent(reference: VideoGenerationRequest["references"][number]) {
  switch (reference.type) {
    case "image":
      return {
        type: "image_url",
        image_url: { url: reference.url },
        role: imageRole(reference.purpose),
      };
    case "video":
      return {
        type: "video_url",
        video_url: { url: reference.url },
        role: "reference_video",
      };
    case "audio":
      return {
        type: "audio_url",
        audio_url: { url: reference.url },
        role: "reference_audio",
      };
  }
}

function imageRole(purpose?: string): "first_frame" | "last_frame" | "reference_image" {
  const normalized = purpose?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "first_frame") return "first_frame";
  if (normalized === "last_frame") return "last_frame";
  return "reference_image";
}

function normalizeStatus(status: string): ProviderTask["status"] {
  switch (status.toLowerCase()) {
    case "queued":
      return "submitted";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
    case "cancelled":
    case "canceled":
    case "expired":
      return "failed";
    default:
      throw new VideoProviderError(
        `Unknown Volcengine task status: ${status}`,
        "UNKNOWN_TASK_STATUS",
        true,
      );
  }
}

function terminalTaskError(
  status: string,
  error?: { code?: string | undefined; message?: string | undefined },
): Pick<ProviderTask, "errorCode" | "errorMessage"> | undefined {
  switch (status.toLowerCase()) {
    case "failed":
      return {
        errorCode: error?.code ?? "VOLCENGINE_TASK_FAILED",
        errorMessage: error?.message ?? "Volcengine video task failed",
      };
    case "cancelled":
    case "canceled":
      return {
        errorCode: "VOLCENGINE_TASK_CANCELLED",
        errorMessage: "Volcengine video task was cancelled",
      };
    case "expired":
      return {
        errorCode: "VOLCENGINE_TASK_EXPIRED",
        errorMessage: "Volcengine video task expired before completion",
      };
    default:
      return undefined;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new VideoProviderError(
      `Volcengine returned a non-JSON response with status ${response.status}`,
      "NON_JSON_RESPONSE",
      response.status >= 500,
      { cause: error },
    );
  }
}

function providerHttpError(response: Response, payload: unknown): VideoProviderError {
  const errorPayload = z
    .looseObject({
      code: z.string().optional(),
      message: z.string().optional(),
      error: z
        .looseObject({ code: z.string().optional(), message: z.string().optional() })
        .optional(),
    })
    .safeParse(payload);
  const code = errorPayload.success
    ? (errorPayload.data.error?.code ?? errorPayload.data.code)
    : undefined;
  const message = errorPayload.success
    ? (errorPayload.data.error?.message ?? errorPayload.data.message)
    : undefined;
  return new VideoProviderError(
    message ?? `Volcengine request failed with HTTP ${response.status}`,
    code ?? `VOLCENGINE_HTTP_${response.status}`,
    response.status === 408 || response.status === 429 || response.status >= 500,
  );
}
