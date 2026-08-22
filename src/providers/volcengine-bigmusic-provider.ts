import { z } from "zod";
import {
  MusicProviderError,
  musicSegmentNames,
  musicTrackRequestSchema,
  type MusicCapabilities,
  type MusicProvider,
  type MusicTask,
  type MusicTrackRequest,
  type MusicUsageItem,
  type SubmittedMusicTask,
} from "../domain/music-provider.js";
import { signVolcengineRequest } from "./volcengine-vod-upscale-provider.js";

const SERVICE = "imagination";
const API_VERSION = "2024-08-12";
const MODEL_VERSION = "v5.0";
const PROVIDER_URL_TTL_SECONDS = 365 * 24 * 60 * 60;

export const defaultCommercialMusicSafetyPrefix =
  "原创、无人声、非罐头背景纯音乐，不模仿任何现有歌曲、歌手、乐队或影视配乐；";

const responseMetadataSchema = z
  .looseObject({
    RequestId: z.string().optional(),
    Error: z
      .looseObject({ Code: z.string().optional(), Message: z.string().optional() })
      .nullable()
      .optional(),
  })
  .optional();

const submitResponseSchema = z.looseObject({
  Code: z.number().int(),
  Message: z.string().optional(),
  Result: z
    .looseObject({
      TaskID: z.string().min(1),
      PredictedWaitTime: z.number().nonnegative().optional(),
    })
    .nullable()
    .optional(),
  ResponseMetadata: responseMetadataSchema,
});

const songDetailSchema = z.looseObject({
  AudioUrl: z.string().min(1).optional(),
  Duration: z.number().nonnegative().optional(),
  Prompt: z.string().optional(),
  TosPath: z.string().optional(),
  StyleInfo: z.string().optional(),
});

const queryResponseSchema = z.looseObject({
  Code: z.number().int(),
  Message: z.string().optional(),
  Result: z
    .looseObject({
      TaskID: z.string().min(1),
      Status: z.number().int().min(0).max(3),
      Progress: z.number().min(0).max(100).optional(),
      FailureReason: z
        .looseObject({
          Code: z.union([z.string(), z.number()]).optional(),
          Msg: z.string().optional(),
        })
        .nullable()
        .optional(),
      SongDetail: songDetailSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
  ResponseMetadata: responseMetadataSchema,
});

const usageResponseSchema = z.looseObject({
  Code: z.number().int(),
  Message: z.string().optional(),
  Result: z
    .looseObject({
      Data: z
        .array(
          z.looseObject({
            Stauts: z.number().int().optional(),
            Status: z.number().int().optional(),
            StartTime: z.number().int().optional(),
            EndTime: z.number().int().optional(),
            MusicQuota: z.number().nonnegative().optional(),
            MusicUsed: z.number().nonnegative().optional(),
            ProductName: z.string().optional(),
          }),
        )
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  ResponseMetadata: responseMetadataSchema,
});

export interface VolcengineBigMusicProviderOptions {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  endpoint?: string;
  region?: string;
  billingMode?: "duration" | "package";
  defaultDurationSeconds?: number;
  enablePromptRewrite?: boolean;
  aigcWatermark?: boolean;
  commercialSafetyPrefix?: string;
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** Fire-and-poll adapter for Volcengine BigMusic v5.0 instrumental generation. */
export class VolcengineBigMusicProvider implements MusicProvider {
  readonly name = "volcengine-bigmusic";
  readonly model = "BigMusic-v5.0";
  readonly #accessKeyId: string;
  readonly #secretAccessKey: string;
  readonly #sessionToken: string | undefined;
  readonly #endpoint: string;
  readonly #region: string;
  readonly #billingMode: "duration" | "package";
  readonly #defaultDurationSeconds: number;
  readonly #enablePromptRewrite: boolean;
  readonly #aigcWatermark: boolean;
  readonly #commercialSafetyPrefix: string;
  readonly #requestTimeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;

  constructor(options: VolcengineBigMusicProviderOptions) {
    this.#accessKeyId = options.accessKeyId;
    this.#secretAccessKey = options.secretAccessKey;
    this.#sessionToken = options.sessionToken;
    this.#endpoint = normalizeEndpoint(options.endpoint ?? "https://open.volcengineapi.com");
    this.#region = options.region ?? "cn-beijing";
    this.#billingMode = options.billingMode ?? "duration";
    this.#defaultDurationSeconds = options.defaultDurationSeconds ?? 60;
    this.#enablePromptRewrite = options.enablePromptRewrite ?? false;
    this.#aigcWatermark = options.aigcWatermark ?? false;
    this.#commercialSafetyPrefix =
      options.commercialSafetyPrefix ?? defaultCommercialMusicSafetyPrefix;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? (() => new Date());

    if (this.#region !== "cn-beijing") {
      throw new MusicProviderError(
        "Volcengine BigMusic is verified only in cn-beijing",
        "BIGMUSIC_REGION_NOT_SUPPORTED",
        false,
      );
    }
    if (this.#defaultDurationSeconds < 30 || this.#defaultDurationSeconds > 120) {
      throw new MusicProviderError(
        "BigMusic v5.0 default duration must be between 30 and 120 seconds",
        "BIGMUSIC_DURATION_NOT_SUPPORTED",
        false,
      );
    }
  }

  capabilities(): MusicCapabilities {
    return {
      provider: this.name,
      model: this.model,
      mode: "asynchronous",
      region: "cn-beijing",
      billingMode: this.#billingMode,
      modelVersion: MODEL_VERSION,
      sourceLanguage: "zh",
      outputFormat: "wav-provider-default",
      providerUrlTtlSeconds: PROVIDER_URL_TTL_SECONDS,
      defaults: {
        durationSeconds: this.#defaultDurationSeconds,
        enablePromptRewrite: this.#enablePromptRewrite,
        aigcWatermark: this.#aigcWatermark,
        commercialSafetyPrefix: this.#commercialSafetyPrefix,
      },
      duration: {
        minimumSeconds: 30,
        maximumSeconds: 120,
        segmentMinimumSeconds: 5,
        supportedSegmentNames: musicSegmentNames,
        precedence: ["segments total", "duration in prompt", "durationSeconds"],
      },
      supportsCallback: true,
      supportsCustomTosBucket: true,
      supportsImplicitWatermark: true,
      copyrightGuard: {
        providerCheckEnabled: true,
        rejectionCode: "50000001",
        guidance: [
          "Use a detailed original Chinese prompt with scene, mood, tempo and instruments.",
          "Do not name or imitate artists, songs, bands or film scores.",
          "Keep request IDs, prompts, provider receipts and the original downloaded file.",
        ],
      },
    };
  }

  async preflight(signal?: AbortSignal): Promise<MusicUsageItem[]> {
    const payload = await this.#request("QueryUsage", "GET", undefined, signal);
    const parsed = usageResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw invalidResponse("QueryUsage", parsed.error);
    }
    assertSuccess("QueryUsage", parsed.data);
    return (parsed.data.Result?.Data ?? []).map((item) => {
      const status = item.Status ?? item.Stauts;
      return {
        productName: item.ProductName ?? "BigMusic",
        authorizationStatus:
          status === 1 ? "production" : status === 2 ? "trial" : "unknown",
        ...(item.StartTime ? { startsAt: toIsoDate(item.StartTime) } : {}),
        ...(item.EndTime ? { endsAt: toIsoDate(item.EndTime) } : {}),
        ...(item.MusicQuota === undefined ? {} : { musicQuota: item.MusicQuota }),
        ...(item.MusicUsed === undefined ? {} : { musicUsed: item.MusicUsed }),
      };
    });
  }

  async submit(
    request: MusicTrackRequest,
    signal?: AbortSignal,
  ): Promise<SubmittedMusicTask> {
    const input = musicTrackRequestSchema.parse(request);
    const action = this.#billingMode === "duration" ? "GenBGMForTime" : "GenBGM";
    const payload = await this.#request(
      action,
      "POST",
      {
        Text: `${this.#commercialSafetyPrefix}${input.prompt}`,
        Duration: input.durationSeconds ?? this.#defaultDurationSeconds,
        EnableInputRewrite: input.enablePromptRewrite ?? this.#enablePromptRewrite,
        Version: MODEL_VERSION,
        AigcWatermark: input.aigcWatermark ?? this.#aigcWatermark,
        ...(input.segments
          ? {
              Segments: input.segments.map((segment) => ({
                Name: segment.name,
                Duration: segment.durationSeconds,
              })),
            }
          : {}),
        ...(input.storageBucket ? { TosBucket: input.storageBucket } : {}),
        ...(input.callbackUrl ? { CallbackURL: input.callbackUrl } : {}),
        ...(input.implicitWatermark
          ? {
              ImplicitWaterMark: {
                Enable: input.implicitWatermark.enabled,
                ...(input.implicitWatermark.contentProducer
                  ? { ContentProducer: input.implicitWatermark.contentProducer }
                  : {}),
                ...(input.implicitWatermark.produceId
                  ? { ProduceId: input.implicitWatermark.produceId }
                  : {}),
                ...(input.implicitWatermark.contentPropagator
                  ? { ContentPropagator: input.implicitWatermark.contentPropagator }
                  : {}),
                ...(input.implicitWatermark.propagateId
                  ? { PropagateId: input.implicitWatermark.propagateId }
                  : {}),
              },
            }
          : {}),
      },
      signal,
    );
    const parsed = submitResponseSchema.safeParse(payload);
    if (!parsed.success) throw invalidResponse(action, parsed.error);
    assertSuccess(action, parsed.data);
    if (!parsed.data.Result?.TaskID) {
      throw invalidResponse(action, new Error("TaskID is missing"));
    }
    return {
      provider: this.name,
      model: this.model,
      taskId: parsed.data.Result.TaskID,
      status: "submitted",
      ...(parsed.data.ResponseMetadata?.RequestId
        ? { requestId: parsed.data.ResponseMetadata.RequestId }
        : {}),
      ...(parsed.data.Result.PredictedWaitTime === undefined
        ? {}
        : { predictedWaitTimeSeconds: parsed.data.Result.PredictedWaitTime }),
    };
  }

  async getTask(taskId: string, signal?: AbortSignal): Promise<MusicTask> {
    const safeTaskId = z.string().trim().min(1).max(200).parse(taskId);
    const payload = await this.#request("QuerySong", "POST", { TaskID: safeTaskId }, signal);
    const parsed = queryResponseSchema.safeParse(payload);
    if (!parsed.success) throw invalidResponse("QuerySong", parsed.error);
    assertSuccess("QuerySong", parsed.data);
    const result = parsed.data.Result;
    if (!result) throw invalidResponse("QuerySong", new Error("Result is missing"));

    const detail = result.SongDetail ?? undefined;
    const failure = result.FailureReason ?? undefined;
    return {
      provider: this.name,
      model: this.model,
      taskId: result.TaskID,
      status: normalizeStatus(result.Status),
      progress: result.Progress ?? (result.Status >= 2 ? 100 : 0),
      ...(parsed.data.ResponseMetadata?.RequestId
        ? { requestId: parsed.data.ResponseMetadata.RequestId }
        : {}),
      ...(detail?.AudioUrl ? { audioUrl: detail.AudioUrl } : {}),
      ...(detail?.Duration === undefined ? {} : { durationSeconds: detail.Duration }),
      ...(detail?.Prompt ? { prompt: detail.Prompt } : {}),
      ...(detail?.TosPath ? { storagePath: detail.TosPath } : {}),
      ...(detail?.StyleInfo ? { styleInfo: parseStyleInfo(detail.StyleInfo) } : {}),
      ...(failure?.Code === undefined ? {} : { errorCode: String(failure.Code) }),
      ...(failure?.Msg ? { errorMessage: failure.Msg } : {}),
    };
  }

  async #request(
    action: string,
    method: "GET" | "POST",
    bodyValue: Record<string, unknown> | undefined,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const query = { Action: action, Version: API_VERSION };
    const body = bodyValue ? JSON.stringify(bodyValue) : "";
    const headers: Record<string, string> = {};
    if (body) headers["content-type"] = "application/json; charset=utf-8";
    const signedHeaders = signVolcengineRequest({
      method,
      pathname: "/",
      query,
      headers,
      body,
      accessKeyId: this.#accessKeyId,
      secretAccessKey: this.#secretAccessKey,
      ...(this.#sessionToken ? { sessionToken: this.#sessionToken } : {}),
      region: this.#region,
      service: SERVICE,
      date: this.#now(),
    });
    const timeoutSignal = AbortSignal.timeout(this.#requestTimeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await this.#fetch(`${this.#endpoint}/?${canonicalQuery(query)}`, {
        method,
        headers: signedHeaders,
        ...(body ? { body } : {}),
        redirect: "error",
        signal: requestSignal,
      });
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted();
      throw new MusicProviderError(
        `Volcengine BigMusic ${action} request failed before a response was received`,
        "BIGMUSIC_NETWORK_ERROR",
        true,
        { cause: error },
      );
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? (JSON.parse(text) as unknown) : {};
    } catch (error) {
      throw new MusicProviderError(
        `Volcengine BigMusic ${action} returned non-JSON with HTTP ${response.status}`,
        "INVALID_BIGMUSIC_RESPONSE",
        response.status >= 500,
        { cause: error },
      );
    }
    if (!response.ok) {
      const errorInfo = readErrorInfo(payload);
      throw new MusicProviderError(
        errorInfo.message ?? `Volcengine BigMusic ${action} failed with HTTP ${response.status}`,
        errorInfo.code ?? `BIGMUSIC_HTTP_${response.status}`,
        isRetryable(errorInfo.code ?? String(response.status)),
      );
    }
    return payload;
  }
}

function assertSuccess(
  action: string,
  response: {
    Code: number;
    Message?: string | undefined;
    ResponseMetadata?: {
      Error?:
        | { Code?: string | undefined; Message?: string | undefined }
        | null
        | undefined;
    } | undefined;
  },
): void {
  const metadataError = response.ResponseMetadata?.Error;
  if (response.Code === 0 && !metadataError) return;
  const code = metadataError?.Code ?? String(response.Code);
  throw new MusicProviderError(
    metadataError?.Message ?? response.Message ?? `Volcengine BigMusic ${action} failed`,
    code,
    isRetryable(code),
  );
}

function invalidResponse(action: string, cause: unknown): MusicProviderError {
  return new MusicProviderError(
    `Volcengine BigMusic ${action} response did not match the documented shape`,
    "INVALID_BIGMUSIC_RESPONSE",
    false,
    { cause },
  );
}

function normalizeStatus(status: number): MusicTask["status"] {
  switch (status) {
    case 0:
      return "submitted";
    case 1:
      return "running";
    case 2:
      return "succeeded";
    case 3:
      return "failed";
    default:
      throw new MusicProviderError(
        `Unknown Volcengine BigMusic task status: ${status}`,
        "UNKNOWN_BIGMUSIC_TASK_STATUS",
        true,
      );
  }
}

function readErrorInfo(payload: unknown): { code?: string; message?: string } {
  const parsed = z
    .looseObject({
      Code: z.union([z.string(), z.number()]).optional(),
      Message: z.string().optional(),
      ResponseMetadata: z
        .looseObject({
          Error: z
            .looseObject({ Code: z.string().optional(), Message: z.string().optional() })
            .nullable()
            .optional(),
        })
        .optional(),
    })
    .safeParse(payload);
  if (!parsed.success) return {};
  return {
    ...(parsed.data.ResponseMetadata?.Error?.Code
      ? { code: parsed.data.ResponseMetadata.Error.Code }
      : parsed.data.Code === undefined
        ? {}
        : { code: String(parsed.data.Code) }),
    ...(parsed.data.ResponseMetadata?.Error?.Message
      ? { message: parsed.data.ResponseMetadata.Error.Message }
      : parsed.data.Message
        ? { message: parsed.data.Message }
        : {}),
  };
}

function isRetryable(code: string): boolean {
  if (["50000001", "300061"].includes(code)) return false;
  return /(?:Internal|Timeout|Throttl|FlowLimit|ServiceUnavailable|TooMany|^5\d{2}$)/i.test(
    code,
  );
}

function parseStyleInfo(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function toIsoDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1_000).toISOString();
}

function normalizeEndpoint(endpoint: string): string {
  const url = new URL(endpoint.includes("://") ? endpoint : `https://${endpoint}`);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VOLCENGINE_MUSIC_ENDPOINT must be an HTTPS origin without a path or query");
  }
  return url.origin;
}

function canonicalQuery(values: Record<string, string>): string {
  return Object.entries(values)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}
