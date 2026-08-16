import { Readable, Transform, type TransformCallback } from "node:stream";
import {
  MediaAssetStoreError,
  type MediaAssetStore,
  type PersistRemoteMediaRequest,
  type StoredMediaAsset,
} from "../domain/media-asset-store.js";

export interface OssStreamClient {
  putStream(
    objectKey: string,
    stream: NodeJS.ReadableStream,
    options: { contentLength?: number; mime: string; timeout: number; headers?: object },
  ): Promise<unknown>;
}

export interface AliyunOssMediaAssetStoreOptions {
  client: OssStreamClient;
  bucket: string;
  endpoint: string;
  allowedSourceHostSuffixes?: string[];
  maxBytes?: number;
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
}

export class AliyunOssMediaAssetStore implements MediaAssetStore {
  readonly name = "aliyun-oss";
  readonly #client: OssStreamClient;
  readonly #bucket: string;
  readonly #endpointHost: string;
  readonly #allowedSourceHostSuffixes: string[];
  readonly #maxBytes: number;
  readonly #requestTimeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: AliyunOssMediaAssetStoreOptions) {
    this.#client = options.client;
    this.#bucket = options.bucket;
    this.#endpointHost = endpointHost(options.endpoint);
    this.#allowedSourceHostSuffixes = options.allowedSourceHostSuffixes ?? [".aliyuncs.com"];
    this.#maxBytes = options.maxBytes ?? 2 * 1024 * 1024 * 1024;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 30 * 60 * 1_000;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async persistRemote(
    request: PersistRemoteMediaRequest,
    signal?: AbortSignal,
  ): Promise<StoredMediaAsset> {
    assertObjectKey(request.objectKey);
    const source = new URL(request.sourceUrl);
    if (source.protocol !== "https:" || !this.#isAllowedHost(source.hostname)) {
      throw new MediaAssetStoreError(
        `Remote media host is not allowed: ${source.hostname}`,
        "REMOTE_MEDIA_HOST_NOT_ALLOWED",
        false,
      );
    }

    const response = await this.#fetch(source, {
      redirect: "error",
      ...(signal ? { signal } : {}),
    });
    if (!response.ok || !response.body) {
      throw new MediaAssetStoreError(
        `Remote media download failed with HTTP ${response.status}`,
        `REMOTE_MEDIA_HTTP_${response.status}`,
        response.status === 408 || response.status === 429 || response.status >= 500,
      );
    }

    const contentLength = parseContentLength(response.headers.get("content-length"));
    if (contentLength !== undefined && contentLength > this.#maxBytes) {
      throw new MediaAssetStoreError(
        `Remote media exceeds the ${this.#maxBytes} byte limit`,
        "REMOTE_MEDIA_TOO_LARGE",
        false,
      );
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0] ?? "video/mp4";
    const limiter = new ByteLimitTransform(this.#maxBytes);
    const stream = Readable.fromWeb(response.body).pipe(limiter);

    try {
      await this.#client.putStream(request.objectKey, stream, {
        ...(contentLength === undefined ? {} : { contentLength }),
        mime: contentType,
        timeout: this.#requestTimeoutMs,
        headers: { "x-oss-object-acl": "private" },
      });
    } catch (error) {
      if (error instanceof MediaAssetStoreError) throw error;
      throw new MediaAssetStoreError(
        "Failed to persist provider media to OSS",
        "OSS_UPLOAD_FAILED",
        true,
        { cause: error },
      );
    }

    const encodedKey = request.objectKey.split("/").map(encodeURIComponent).join("/");
    return {
      storageUri: `oss://${this.#bucket}/${request.objectKey}`,
      mediaUrl: `https://${this.#bucket}.${this.#endpointHost}/${encodedKey}`,
      objectKey: request.objectKey,
      contentType,
      sizeBytes: limiter.bytesRead,
    };
  }

  #isAllowedHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return this.#allowedSourceHostSuffixes.some((suffix) => {
      const allowed = suffix.toLowerCase();
      return normalized === allowed.replace(/^\./, "") || normalized.endsWith(allowed);
    });
  }
}

class ByteLimitTransform extends Transform {
  bytesRead = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytesRead += chunk.length;
    if (this.bytesRead > this.maxBytes) {
      callback(
        new MediaAssetStoreError(
          `Remote media exceeds the ${this.maxBytes} byte limit`,
          "REMOTE_MEDIA_TOO_LARGE",
          false,
        ),
      );
      return;
    }
    callback(null, chunk);
  }
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function endpointHost(endpoint: string): string {
  const withScheme = endpoint.includes("://") ? endpoint : `https://${endpoint}`;
  return new URL(withScheme).host;
}

function assertObjectKey(objectKey: string): void {
  if (
    objectKey.length === 0 ||
    objectKey.startsWith("/") ||
    objectKey.includes("..") ||
    objectKey.includes("\\")
  ) {
    throw new MediaAssetStoreError("Invalid OSS object key", "INVALID_OBJECT_KEY", false);
  }
}
