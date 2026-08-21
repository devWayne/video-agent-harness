import { createHash, createHmac } from "node:crypto";
import {
  UpscaleProviderError,
  type SubmittedUpscaleTask,
  type UpscaleProvider,
  type UpscaleRequest,
  type UpscaleTask,
} from "../domain/upscale-provider.js";

const VOD_SERVICE = "vod";
const VOD_V1_VERSION = "2020-08-01";
const VOD_MEDIA_VERSION = "2023-07-01";
const VOD_EXECUTION_VERSION = "2025-01-01";
const TASK_ID_PREFIX = "volc-vod:";

interface VodResponseMetadata {
  RequestId?: string;
  Error?: { Code?: string; Message?: string };
}

export interface VodApiResponse<T> {
  ResponseMetadata?: VodResponseMetadata;
  Result?: T;
}

interface UrlUploadItem {
  SourceUrl: string;
  Title?: string;
  FileExtension?: string;
}

interface UploadMediaByUrlResult {
  Data?: Array<{ JobId?: string; SourceUrl?: string }>;
}

interface QueryUploadTaskInfoResult {
  Data?: {
    MediaInfoList?: Array<{
      JobId?: string;
      State?: string;
      Vid?: string;
      SourceInfo?: Record<string, unknown>;
    }>;
    NotExistJobIds?: string[];
  };
}

interface StartExecutionResult {
  RunId?: string;
}

interface ExecutionFile {
  Vid?: string;
  FileId?: string;
  StoreUri?: string;
}

interface ExecutionEnhanceOutput {
  Vid?: string;
  FileId?: string;
  StoreUri?: string;
  File?: ExecutionFile;
  Info?: { Width?: number; Height?: number };
  VideoStreamMeta?: { Width?: number; Height?: number };
}

interface GetExecutionResult {
  RunId?: string;
  Status?: string;
  Error?: { Code?: string; Message?: string };
  Output?: {
    Task?: { Enhance?: ExecutionEnhanceOutput };
  };
}

interface PlayInfo {
  FileId?: string;
  Definition?: string;
  MainPlayUrl?: string;
  Width?: number;
  Height?: number;
}

interface GetPlayInfoResult {
  Vid?: string;
  PlayInfoList?: PlayInfo[];
}

interface GetMediaListResult {
  SpaceName?: string;
  MediaInfoList?: unknown[];
}

interface VodTranscodeInfo {
  FileId?: string;
  StoreUri?: string;
  Format?: string;
  Size?: number;
  VideoStreamMeta?: { Width?: number; Height?: number };
}

interface GetMediaInfosResult {
  MediaInfoList?: Array<{
    BasicInfo?: { Vid?: string; SpaceName?: string; PublishStatus?: string };
    TranscodeInfos?: VodTranscodeInfo[];
  }>;
  NotExistVids?: string[];
}

export interface VolcengineVodOutputSigner {
  signRead(storeUri: string, expiresSeconds: number): Promise<string> | string;
}

export interface VolcengineVodApiClient {
  uploadMediaByUrl: (
    request: { SpaceName: string; URLSets: UrlUploadItem[] },
    signal?: AbortSignal,
  ) => Promise<VodApiResponse<UploadMediaByUrlResult>>;
  queryUploadTaskInfo: (
    request: { JobIds: string },
    signal?: AbortSignal,
  ) => Promise<VodApiResponse<QueryUploadTaskInfoResult>>;
  startExecution: (
    request: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<VodApiResponse<StartExecutionResult>>;
  getExecution: (
    request: { RunId: string },
    signal?: AbortSignal,
  ) => Promise<VodApiResponse<GetExecutionResult>>;
  getPlayInfo: (
    request: { Vid: string; Format: string; FileType: string; Ssl: string },
    signal?: AbortSignal,
  ) => Promise<VodApiResponse<GetPlayInfoResult>>;
  updateMediaPublishStatus: (
    request: { Vid: string; Status: "Published" | "Unpublished" },
    signal?: AbortSignal,
  ) => Promise<VodApiResponse<unknown>>;
  getMediaList: (
    request: { SpaceName: string; Offset: string; PageSize: string },
    signal?: AbortSignal,
  ) => Promise<VodApiResponse<GetMediaListResult>>;
  getMediaInfos: (
    request: { Vids: string },
    signal?: AbortSignal,
  ) => Promise<VodApiResponse<GetMediaInfosResult>>;
}

export type VolcengineVodFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface VolcengineVodClientOptions {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: VolcengineVodFetch;
  now?: () => Date;
}

/** Minimal VOD OpenAPI client using the documented Volcengine HMAC-SHA256 signature. */
export class VolcengineVodClient implements VolcengineVodApiClient {
  readonly #accessKeyId: string;
  readonly #secretAccessKey: string;
  readonly #sessionToken: string | undefined;
  readonly #region: string;
  readonly #endpoint: string;
  readonly #timeoutMs: number;
  readonly #fetch: VolcengineVodFetch;
  readonly #now: () => Date;

  constructor(options: VolcengineVodClientOptions) {
    this.#accessKeyId = options.accessKeyId;
    this.#secretAccessKey = options.secretAccessKey;
    this.#sessionToken = options.sessionToken;
    this.#region = options.region ?? "cn-north-1";
    this.#endpoint = normalizeEndpoint(options.endpoint ?? "vod.volcengineapi.com");
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#now = options.now ?? (() => new Date());
  }

  uploadMediaByUrl(
    request: { SpaceName: string; URLSets: UrlUploadItem[] },
    signal?: AbortSignal,
  ): Promise<VodApiResponse<UploadMediaByUrlResult>> {
    return this.#request(
      "UploadMediaByUrl",
      VOD_V1_VERSION,
      "GET",
      { SpaceName: request.SpaceName, URLSets: JSON.stringify(request.URLSets) },
      signal,
    );
  }

  queryUploadTaskInfo(
    request: { JobIds: string },
    signal?: AbortSignal,
  ): Promise<VodApiResponse<QueryUploadTaskInfoResult>> {
    return this.#request("QueryUploadTaskInfo", VOD_V1_VERSION, "GET", request, signal);
  }

  startExecution(
    request: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<VodApiResponse<StartExecutionResult>> {
    return this.#request("StartExecution", VOD_EXECUTION_VERSION, "POST", request, signal);
  }

  getExecution(
    request: { RunId: string },
    signal?: AbortSignal,
  ): Promise<VodApiResponse<GetExecutionResult>> {
    return this.#request("GetExecution", VOD_EXECUTION_VERSION, "GET", request, signal);
  }

  getPlayInfo(
    request: { Vid: string; Format: string; FileType: string; Ssl: string },
    signal?: AbortSignal,
  ): Promise<VodApiResponse<GetPlayInfoResult>> {
    return this.#request("GetPlayInfo", VOD_V1_VERSION, "GET", request, signal);
  }

  updateMediaPublishStatus(
    request: { Vid: string; Status: "Published" | "Unpublished" },
    signal?: AbortSignal,
  ): Promise<VodApiResponse<unknown>> {
    return this.#request("UpdateMediaPublishStatus", VOD_V1_VERSION, "GET", request, signal);
  }

  getMediaList(
    request: { SpaceName: string; Offset: string; PageSize: string },
    signal?: AbortSignal,
  ): Promise<VodApiResponse<GetMediaListResult>> {
    return this.#request("GetMediaList", VOD_V1_VERSION, "GET", request, signal);
  }

  getMediaInfos(
    request: { Vids: string },
    signal?: AbortSignal,
  ): Promise<VodApiResponse<GetMediaInfosResult>> {
    return this.#request("GetMediaInfos", VOD_MEDIA_VERSION, "GET", request, signal);
  }

  async #request<T>(
    action: string,
    version: string,
    method: "GET" | "POST",
    requestData: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<VodApiResponse<T>> {
    const body = method === "POST" ? JSON.stringify(requestData) : "";
    const query = method === "GET" ? { Action: action, Version: version, ...requestData } : { Action: action, Version: version };
    const queryString = canonicalQuery(query);
    const headers: Record<string, string> = {};
    if (method === "POST") headers["content-type"] = "application/json; charset=utf-8";
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
      service: VOD_SERVICE,
      date: this.#now(),
    });
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await this.#fetch(`${this.#endpoint}/?${queryString}`, {
        method,
        headers: signedHeaders,
        ...(body ? { body } : {}),
        redirect: "error",
        signal: combinedSignal,
      });
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted();
      throw new UpscaleProviderError(
        `Volcengine VOD ${action} request failed`,
        "VOD_REQUEST_FAILED",
        true,
        { cause: error },
      );
    }

    const text = await response.text();
    let payload: VodApiResponse<T>;
    try {
      payload = JSON.parse(text) as VodApiResponse<T>;
    } catch (error) {
      throw new UpscaleProviderError(
        `Volcengine VOD ${action} returned a non-JSON response (HTTP ${response.status})`,
        "INVALID_VOD_RESPONSE",
        response.status >= 500,
        { cause: error },
      );
    }
    if (!response.ok && !payload.ResponseMetadata?.Error) {
      throw new UpscaleProviderError(
        `Volcengine VOD ${action} failed with HTTP ${response.status}`,
        `VOD_HTTP_${response.status}`,
        response.status === 408 || response.status === 429 || response.status >= 500,
      );
    }
    return payload;
  }
}

export interface VolcengineVodAigcUpscaleProviderOptions {
  client: VolcengineVodApiClient;
  spaceName: string;
  repairStrength?: 0 | 1 | 2;
  outputSigner?: VolcengineVodOutputSigner;
  outputUrlExpiresSeconds?: number;
}

export class VolcengineVodAigcUpscaleProvider implements UpscaleProvider {
  readonly name = "volcengine-vod-aigc-standard-4k";
  readonly #client: VolcengineVodApiClient;
  readonly #spaceName: string;
  readonly #repairStrength: 0 | 1 | 2;
  readonly #outputSigner: VolcengineVodOutputSigner | undefined;
  readonly #outputUrlExpiresSeconds: number;

  constructor(options: VolcengineVodAigcUpscaleProviderOptions) {
    this.#client = options.client;
    this.#spaceName = options.spaceName;
    this.#repairStrength = options.repairStrength ?? 0;
    this.#outputSigner = options.outputSigner;
    this.#outputUrlExpiresSeconds = options.outputUrlExpiresSeconds ?? 3_600;
  }

  async preflight(signal?: AbortSignal): Promise<void> {
    const response = await this.#client.getMediaList(
      { SpaceName: this.#spaceName, Offset: "0", PageSize: "1" },
      signal,
    );
    const result = requireVodResult(response, "GetMediaList");
    if (result.SpaceName && result.SpaceName !== this.#spaceName) {
      throw new UpscaleProviderError(
        `VOD preflight returned space ${result.SpaceName}, expected ${this.#spaceName}`,
        "VOD_SPACE_MISMATCH",
        false,
      );
    }
  }

  async submit(request: UpscaleRequest): Promise<SubmittedUpscaleTask> {
    assertHttpUrl(request.inputUrl);
    const safeName = request.clientRequestId.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 80);
    const response = await this.#client.uploadMediaByUrl({
      SpaceName: this.#spaceName,
      URLSets: [
        {
          SourceUrl: request.inputUrl,
          Title: `video-agent-${safeName}`,
          FileExtension: ".mp4",
        },
      ],
    });
    const result = requireVodResult(response, "UploadMediaByUrl");
    const jobId = result.Data?.[0]?.JobId;
    if (!jobId) {
      throw new UpscaleProviderError(
        "VOD UploadMediaByUrl response did not include JobId",
        "INVALID_VOD_UPLOAD_RESPONSE",
        false,
      );
    }
    return {
      provider: this.name,
      taskId: encodeTaskId({ version: 1, stage: "import", jobId }),
      status: "submitted",
    };
  }

  async getTask(taskId: string): Promise<UpscaleTask> {
    const state = decodeTaskId(taskId);
    return state.stage === "import"
      ? this.#getImportTask(state)
      : this.#getEnhanceTask(state);
  }

  async finalize(task: UpscaleTask): Promise<void> {
    const state = decodeTaskId(task.taskId);
    if (state.stage !== "enhance") return;
    await this.#setPublishStatus(state.vid, "Unpublished");
  }

  async #getImportTask(state: ImportTaskState): Promise<UpscaleTask> {
    const response = await this.#client.queryUploadTaskInfo({ JobIds: state.jobId });
    const result = requireVodResult(response, "QueryUploadTaskInfo");
    if (result.Data?.NotExistJobIds?.includes(state.jobId)) {
      return failedTask(this.name, encodeTaskId(state), "VOD_UPLOAD_JOB_NOT_FOUND", "VOD URL import task was not found");
    }
    const item = result.Data?.MediaInfoList?.find((candidate) => candidate.JobId === state.jobId);
    if (!item?.State) {
      throw new UpscaleProviderError(
        "VOD QueryUploadTaskInfo response did not include the requested task state",
        "INVALID_VOD_UPLOAD_TASK_RESPONSE",
        true,
      );
    }
    const status = item.State.toLowerCase();
    if (["initial", "waiting", "pending", "queued", "uploading", "processing", "running"].includes(status)) {
      return { provider: this.name, taskId: encodeTaskId(state), status: "running" };
    }
    if (["failed", "failure", "error", "cancelled", "canceled"].includes(status)) {
      return failedTask(
        this.name,
        encodeTaskId(state),
        sourceInfoString(item.SourceInfo, "Code") ?? "VOD_URL_IMPORT_FAILED",
        sourceInfoString(item.SourceInfo, "Message") ?? "VOD URL import failed",
      );
    }
    if (!["success", "succeeded", "complete", "completed"].includes(status)) {
      throw new UpscaleProviderError(
        `Unknown VOD URL import state: ${item.State}`,
        "UNKNOWN_VOD_UPLOAD_STATE",
        true,
      );
    }
    if (!item.Vid) {
      throw new UpscaleProviderError(
        "Successful VOD URL import did not include Vid",
        "INVALID_VOD_UPLOAD_TASK_RESPONSE",
        true,
      );
    }

    const startResponse = await this.#client.startExecution(
      createAigcStandard4kRequest(item.Vid, `video-agent-${state.jobId}`, this.#repairStrength),
    );
    const startResult = requireVodResult(startResponse, "StartExecution");
    if (!startResult.RunId) {
      throw new UpscaleProviderError(
        "VOD StartExecution response did not include RunId",
        "INVALID_VOD_EXECUTION_RESPONSE",
        false,
      );
    }
    return {
      provider: this.name,
      taskId: encodeTaskId({ version: 1, stage: "enhance", runId: startResult.RunId, vid: item.Vid }),
      status: "running",
    };
  }

  async #getEnhanceTask(state: EnhanceTaskState): Promise<UpscaleTask> {
    const response = await this.#client.getExecution({ RunId: state.runId });
    const result = requireVodResult(response, "GetExecution");
    if (!result.Status) {
      throw new UpscaleProviderError(
        "VOD GetExecution response did not include Status",
        "INVALID_VOD_EXECUTION_RESPONSE",
        true,
      );
    }
    const status = result.Status.toLowerCase();
    if (["pending", "submitted", "queued", "running", "processing"].includes(status)) {
      return { provider: this.name, taskId: encodeTaskId(state), status: "running" };
    }
    if (["failed", "failure", "error", "cancelled", "canceled"].includes(status)) {
      return failedTask(
        this.name,
        encodeTaskId(state),
        result.Error?.Code ?? "VOD_AIGC_4K_FAILED",
        result.Error?.Message ?? "VOD AIGC Standard 4K enhancement failed",
      );
    }
    if (!["success", "succeeded", "complete", "completed"].includes(status)) {
      throw new UpscaleProviderError(
        `Unknown VOD execution state: ${result.Status}`,
        "UNKNOWN_VOD_EXECUTION_STATE",
        true,
      );
    }

    const enhance = result.Output?.Task?.Enhance;
    const outputVid = enhance?.File?.Vid ?? enhance?.Vid ?? state.vid;
    const fileId = enhance?.File?.FileId ?? enhance?.FileId;
    const nextState: EnhanceTaskState = { ...state, vid: outputVid };

    if (this.#outputSigner) {
      const resolved = await this.#resolveEnhancedFile(outputVid, fileId, enhance);
      if (!resolved) {
        return { provider: this.name, taskId: encodeTaskId(nextState), status: "running" };
      }
      if (resolved.width !== 3840 || resolved.height !== 2160) {
        return failedTask(
          this.name,
          encodeTaskId(nextState),
          "VOD_4K_DIMENSIONS_MISMATCH",
          `VOD AIGC output was ${resolved.width}x${resolved.height}, expected 3840x2160`,
        );
      }
      const outputUrl = await this.#outputSigner.signRead(
        resolved.storeUri,
        this.#outputUrlExpiresSeconds,
      );
      return {
        provider: this.name,
        taskId: encodeTaskId(nextState),
        status: "succeeded",
        outputUrl,
        width: resolved.width,
        height: resolved.height,
      };
    }

    try {
      await this.#setPublishStatus(outputVid, "Published");
      const playResponse = await this.#client.getPlayInfo({
        Vid: outputVid,
        Format: "mp4",
        FileType: "video",
        Ssl: "1",
      });
      const playResult = requireVodResult(playResponse, "GetPlayInfo");
      const output = select4kOutput(playResult.PlayInfoList ?? [], fileId);
      if (!output?.MainPlayUrl) {
        await this.#setPublishStatus(outputVid, "Unpublished");
        return { provider: this.name, taskId: encodeTaskId(nextState), status: "running" };
      }
      const width = output.Width ?? enhance?.Info?.Width ?? enhance?.VideoStreamMeta?.Width;
      const height = output.Height ?? enhance?.Info?.Height ?? enhance?.VideoStreamMeta?.Height;
      if (width === undefined || height === undefined) {
        await this.#setPublishStatus(outputVid, "Unpublished");
        return { provider: this.name, taskId: encodeTaskId(nextState), status: "running" };
      }
      if (width !== 3840 || height !== 2160) {
        await this.#setPublishStatus(outputVid, "Unpublished");
        return failedTask(
          this.name,
          encodeTaskId(nextState),
          "VOD_4K_DIMENSIONS_MISMATCH",
          `VOD AIGC output was ${width}x${height}, expected 3840x2160`,
        );
      }
      return {
        provider: this.name,
        taskId: encodeTaskId(nextState),
        status: "succeeded",
        outputUrl: output.MainPlayUrl,
        width,
        height,
      };
    } catch (error) {
      if (error instanceof UpscaleProviderError && error.retryable) {
        await this.#setPublishStatus(outputVid, "Unpublished");
        return { provider: this.name, taskId: encodeTaskId(nextState), status: "running" };
      }
      throw error;
    }
  }

  async #resolveEnhancedFile(
    vid: string,
    fileId: string | undefined,
    enhance: ExecutionEnhanceOutput | undefined,
  ): Promise<{ storeUri: string; width: number; height: number } | undefined> {
    const executionStoreUri = enhance?.File?.StoreUri ?? enhance?.StoreUri;
    const executionWidth = enhance?.Info?.Width ?? enhance?.VideoStreamMeta?.Width;
    const executionHeight = enhance?.Info?.Height ?? enhance?.VideoStreamMeta?.Height;
    if (executionStoreUri && executionWidth !== undefined && executionHeight !== undefined) {
      return {
        storeUri: executionStoreUri,
        width: executionWidth,
        height: executionHeight,
      };
    }

    const response = await this.#client.getMediaInfos({ Vids: vid });
    const media = requireVodResult(response, "GetMediaInfos").MediaInfoList?.find(
      (item) => item.BasicInfo?.Vid === vid,
    );
    const transcodes = media?.TranscodeInfos ?? [];
    const preferred = fileId
      ? transcodes.find((item) => item.FileId === fileId)
      : undefined;
    const output =
      preferred ??
      transcodes.find(
        (item) =>
          item.VideoStreamMeta?.Width === 3840 && item.VideoStreamMeta?.Height === 2160,
      );
    const storeUri = output?.StoreUri ?? executionStoreUri;
    const width = output?.VideoStreamMeta?.Width ?? executionWidth;
    const height = output?.VideoStreamMeta?.Height ?? executionHeight;
    if (!storeUri || width === undefined || height === undefined) return undefined;
    return { storeUri, width, height };
  }

  async #setPublishStatus(vid: string, status: "Published" | "Unpublished"): Promise<void> {
    const response = await this.#client.updateMediaPublishStatus({ Vid: vid, Status: status });
    assertVodSuccess(response, "UpdateMediaPublishStatus");
  }
}

export interface SignVolcengineRequestInput {
  method: string;
  pathname: string;
  query: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
  date: Date;
}

export function signVolcengineRequest(input: SignVolcengineRequestInput): Record<string, string> {
  const headers = { ...(input.headers ?? {}) };
  const dateTime = input.date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  headers["x-date"] = dateTime;
  if (input.sessionToken) headers["x-security-token"] = input.sessionToken;
  if (input.body) headers["x-content-sha256"] = sha256(input.body);

  const signable = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .filter(([key]) => !["authorization", "content-type", "content-length", "user-agent", "expect"].includes(key))
    .sort(([left], [right]) => compareStrings(left, right));
  const canonicalHeaders = signable.map(([key, value]) => `${key}:${value}`).join("\n");
  const signedHeaderNames = signable.map(([key]) => key).join(";");
  const bodyHash = input.body ? sha256(input.body) : sha256("");
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.pathname,
    canonicalQuery(input.query),
    `${canonicalHeaders}\n`,
    signedHeaderNames,
    bodyHash,
  ].join("\n");
  const shortDate = dateTime.slice(0, 8);
  const scope = `${shortDate}/${input.region}/${input.service}/request`;
  const stringToSign = ["HMAC-SHA256", dateTime, scope, sha256(canonicalRequest)].join("\n");
  const dateKey = hmac(input.secretAccessKey, shortDate);
  const regionKey = hmac(dateKey, input.region);
  const serviceKey = hmac(regionKey, input.service);
  const signingKey = hmac(serviceKey, "request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  headers.authorization = `HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;
  return headers;
}

export function createAigcStandard4kRequest(
  vid: string,
  clientToken: string,
  repairStrength: 0 | 1 | 2 = 0,
): Record<string, unknown> {
  return {
    Input: { Type: "Vid", Vid: vid },
    Operation: {
      Type: "Task",
      Task: {
        Type: "Enhance",
        Enhance: {
          Type: "Moe",
          MoeEnhance: {
            Config: "aigc",
            Target: { Res: "4k" },
            VideoStrategy: { RepairStrength: repairStrength, EnhanceLevel: "Standard" },
          },
        },
      },
    },
    Control: { ClientToken: clientToken.slice(0, 64) },
  };
}

type ImportTaskState = { version: 1; stage: "import"; jobId: string };
type EnhanceTaskState = { version: 1; stage: "enhance"; runId: string; vid: string };
type VolcengineVodTaskState = ImportTaskState | EnhanceTaskState;

function encodeTaskId(state: VolcengineVodTaskState): string {
  return `${TASK_ID_PREFIX}${Buffer.from(JSON.stringify(state)).toString("base64url")}`;
}

function decodeTaskId(taskId: string): VolcengineVodTaskState {
  if (!taskId.startsWith(TASK_ID_PREFIX)) {
    throw new UpscaleProviderError("Invalid Volcengine VOD task ID", "INVALID_VOD_TASK_ID", false);
  }
  try {
    const state = JSON.parse(Buffer.from(taskId.slice(TASK_ID_PREFIX.length), "base64url").toString("utf8")) as Partial<VolcengineVodTaskState>;
    if (state.version !== 1) throw new Error("unsupported version");
    if (state.stage === "import" && typeof state.jobId === "string" && state.jobId.length > 0) return state as ImportTaskState;
    if (state.stage === "enhance" && typeof state.runId === "string" && typeof state.vid === "string" && state.runId.length > 0 && state.vid.length > 0) return state as EnhanceTaskState;
    throw new Error("invalid task state");
  } catch (error) {
    throw new UpscaleProviderError("Invalid Volcengine VOD task ID", "INVALID_VOD_TASK_ID", false, { cause: error });
  }
}

function select4kOutput(outputs: PlayInfo[], preferredFileId?: string): PlayInfo | undefined {
  const playable = outputs.filter((item) => item.MainPlayUrl);
  const preferred = preferredFileId
    ? playable.find((item) => item.FileId === preferredFileId && is4kOutput(item))
    : undefined;
  if (preferred) return preferred;
  const exact4k = playable.find((item) => is4kOutput(item));
  if (exact4k) return exact4k;
  return playable
    .filter((item) => (item.Width ?? 0) >= 3840 && (item.Height ?? 0) >= 2160)
    .sort((left, right) => (right.Width ?? 0) * (right.Height ?? 0) - (left.Width ?? 0) * (left.Height ?? 0))[0];
}

function assertVodSuccess(response: VodApiResponse<unknown>, action: string): void {
  const error = response.ResponseMetadata?.Error;
  if (!error) return;
  const code = error.Code ?? "VOD_API_ERROR";
  throw new UpscaleProviderError(
    `Volcengine VOD ${action} failed: ${error.Message ?? code}`,
    code,
    isRetryableVodError(code),
  );
}

function requireVodResult<T>(response: VodApiResponse<T>, action: string): T {
  assertVodSuccess(response, action);
  if (response.Result === undefined) {
    throw new UpscaleProviderError(
      `Volcengine VOD ${action} response did not include Result`,
      "INVALID_VOD_RESPONSE",
      true,
    );
  }
  return response.Result;
}

function isRetryableVodError(code: string): boolean {
  return /(?:Internal|Timeout|Throttl|FlowLimit|ServiceUnavailable|ResourceNotFound)/i.test(code);
}

function failedTask(
  provider: string,
  taskId: string,
  errorCode: string,
  errorMessage: string,
): UpscaleTask {
  return { provider, taskId, status: "failed", errorCode, errorMessage };
}

function sourceInfoString(sourceInfo: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = sourceInfo?.[key] ?? sourceInfo?.[key.toLowerCase()];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function assertHttpUrl(value: string): void {
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch (error) {
    throw new UpscaleProviderError("VOD inputUrl must be a valid URL", "INVALID_VOD_INPUT_URL", false, { cause: error });
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new UpscaleProviderError("VOD inputUrl must use http or https", "INVALID_VOD_INPUT_URL", false);
  }
}

function normalizeEndpoint(endpoint: string): string {
  const url = new URL(endpoint.includes("://") ? endpoint : `https://${endpoint}`);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VOLCENGINE_VOD_ENDPOINT must be an HTTPS origin without a path or query");
  }
  return url.origin;
}

function canonicalQuery(values: Record<string, unknown>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([left], [right]) => compareStrings(left, right))
    .flatMap(([key, value]) => {
      const items = Array.isArray(value)
        ? (value as unknown[]).map((item) => String(item)).sort()
        : [String(value)];
      return items.map((item) => `${uriEscape(key)}=${uriEscape(item)}`);
    })
    .join("&");
}

function uriEscape(value: string): string {
  return encodeURIComponent(value).replace(/\*/g, "%2A");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function is4kOutput(output: PlayInfo): boolean {
  return (
    (output.Width === 3840 && output.Height === 2160) ||
    output.Definition?.toLowerCase().includes("4k") === true
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
