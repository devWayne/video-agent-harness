import { TosClient } from "@volcengine/tos-sdk";
import type { VolcengineVodOutputSigner } from "./volcengine-vod-upscale-provider.js";

export interface VolcengineTosOutputStoreOptions {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
  endpoint?: string;
}

export interface VolcengineTosObjectMetadata {
  size?: number;
  contentType?: string;
  etag?: string;
}

/** Signs and downloads VOD-managed TOS outputs through the public TOS endpoint. */
export class VolcengineTosOutputStore implements VolcengineVodOutputSigner {
  readonly #client: TosClient;

  constructor(options: VolcengineTosOutputStoreOptions) {
    this.#client = new TosClient({
      accessKeyId: options.accessKeyId,
      accessKeySecret: options.secretAccessKey,
      ...(options.sessionToken ? { stsToken: options.sessionToken } : {}),
      region: options.region ?? "cn-beijing",
      endpoint: normalizeTosEndpoint(options.endpoint ?? "tos-cn-beijing.volces.com"),
    });
  }

  signRead(storeUri: string, expiresSeconds: number): string {
    const { bucket, key } = parseVolcengineVodStoreUri(storeUri);
    return this.#client.getPreSignedUrl({
      bucket,
      key,
      method: "GET",
      expires: expiresSeconds,
    });
  }

  async head(storeUri: string): Promise<VolcengineTosObjectMetadata> {
    const { bucket, key } = parseVolcengineVodStoreUri(storeUri);
    const response = await this.#client.headObject({ bucket, key });
    const size = parsePositiveInteger(response.headers?.["content-length"]);
    const contentType = response.headers?.["content-type"];
    const etag = response.data?.etag;
    return {
      ...(size === undefined ? {} : { size }),
      ...(contentType === undefined ? {} : { contentType }),
      ...(etag === undefined ? {} : { etag }),
    };
  }

  async downloadToFile(storeUri: string, filePath: string): Promise<void> {
    const { bucket, key } = parseVolcengineVodStoreUri(storeUri);
    await this.#client.getObjectToFile({ bucket, key, filePath });
  }
}

export function parseVolcengineVodStoreUri(storeUri: string): {
  bucket: string;
  key: string;
} {
  const normalized = storeUri.trim().replace(/^tos:\/\//, "");
  const slash = normalized.indexOf("/");
  if (slash <= 0 || slash === normalized.length - 1) {
    throw new Error("VOD StoreUri must use bucket/object-key format");
  }
  const bucket = normalized.slice(0, slash);
  const key = normalized.slice(slash + 1);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("VOD StoreUri contains an invalid TOS bucket name");
  }
  if (key.includes("\0")) throw new Error("VOD StoreUri contains an invalid object key");
  return { bucket, key };
}

function normalizeTosEndpoint(endpoint: string): string {
  const url = new URL(endpoint.includes("://") ? endpoint : `https://${endpoint}`);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VOLCENGINE_TOS_ENDPOINT must be an HTTPS origin without a path or query");
  }
  return url.host;
}

function parsePositiveInteger(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
