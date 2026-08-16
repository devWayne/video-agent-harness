export interface PersistRemoteMediaRequest {
  sourceUrl: string;
  objectKey: string;
  mediaType: "video" | "audio" | "image";
}

export interface StoredMediaAsset {
  storageUri: string;
  mediaUrl: string;
  objectKey: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface MediaAssetStore {
  readonly name: string;
  persistRemote(
    request: PersistRemoteMediaRequest,
    signal?: AbortSignal,
  ): Promise<StoredMediaAsset>;
}

export class MediaAssetStoreError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MediaAssetStoreError";
  }
}
