import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

const submitSchema = z.looseObject({
  prompt_id: z.string(),
  node_errors: z.record(z.string(), z.unknown()).optional(),
});

export interface ComfyUiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface ComfyOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

export type ComfyPromptState =
  | { status: "running" }
  | { status: "failed"; error: string }
  | { status: "succeeded"; file: ComfyOutputFile };

export class ComfyUiClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: ComfyUiClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async systemStats(signal?: AbortSignal): Promise<unknown> {
    const response = await this.#fetch(
      `${this.#baseUrl}/system_stats`,
      signal ? { signal } : undefined,
    );
    const payload = await readJson(response, "ComfyUI system stats");
    if (!response.ok) {
      throw new ComfyUiError(
        `ComfyUI system stats failed with HTTP ${response.status}`,
        "COMFYUI_PREFLIGHT_FAILED",
        response.status >= 500,
      );
    }
    return payload;
  }

  async submit(
    workflow: Record<string, unknown>,
    clientId: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.#fetch(`${this.#baseUrl}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      ...(signal ? { signal } : {}),
    });
    const payload = await readJson(response, "ComfyUI prompt submission");
    if (!response.ok) {
      throw new ComfyUiError(
        `ComfyUI prompt submission failed with HTTP ${response.status}`,
        "COMFYUI_SUBMIT_FAILED",
        response.status >= 500,
      );
    }
    const parsed = submitSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ComfyUiError(
        "ComfyUI prompt response did not include prompt_id",
        "COMFYUI_INVALID_SUBMIT_RESPONSE",
        false,
        { cause: parsed.error },
      );
    }
    if (parsed.data.node_errors && Object.keys(parsed.data.node_errors).length > 0) {
      throw new ComfyUiError(
        `ComfyUI rejected workflow nodes: ${JSON.stringify(parsed.data.node_errors)}`,
        "COMFYUI_NODE_VALIDATION_FAILED",
        false,
      );
    }
    return parsed.data.prompt_id;
  }

  async getPromptState(promptId: string, signal?: AbortSignal): Promise<ComfyPromptState> {
    const response = await this.#fetch(
      `${this.#baseUrl}/history/${encodeURIComponent(promptId)}`,
      signal ? { signal } : undefined,
    );
    const payload = await readJson(response, "ComfyUI history");
    if (!response.ok) {
      throw new ComfyUiError(
        `ComfyUI history failed with HTTP ${response.status}`,
        "COMFYUI_HISTORY_FAILED",
        response.status >= 500,
      );
    }
    const entry = asRecord(asRecord(payload)?.[promptId]);
    if (!entry) return { status: "running" };

    const status = asRecord(entry.status);
    const statusString = typeof status?.status_str === "string" ? status.status_str : undefined;
    if (statusString === "error") {
      return {
        status: "failed",
        error: (status ? extractComfyError(status) : undefined) ?? `ComfyUI prompt ${promptId} failed`,
      };
    }

    const file = findOutputFile(entry.outputs);
    if (file) return { status: "succeeded", file };
    if (status?.completed === true) {
      return {
        status: "failed",
        error: `ComfyUI prompt ${promptId} completed without a video output`,
      };
    }
    return { status: "running" };
  }

  outputUrl(file: ComfyOutputFile): string {
    const url = new URL(`${this.#baseUrl}/view`);
    url.searchParams.set("filename", file.filename);
    if (file.subfolder) url.searchParams.set("subfolder", file.subfolder);
    if (file.type) url.searchParams.set("type", file.type);
    return url.toString();
  }

  async download(file: ComfyOutputFile, targetPath: string, signal?: AbortSignal): Promise<void> {
    const response = await this.#fetch(
      this.outputUrl(file),
      signal ? { signal } : undefined,
    );
    if (!response.ok || !response.body) {
      throw new ComfyUiError(
        `ComfyUI output download failed with HTTP ${response.status}`,
        "COMFYUI_DOWNLOAD_FAILED",
        response.status >= 500,
      );
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath, { mode: 0o600 }));
  }
}

export class ComfyUiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ComfyUiError";
  }
}

function findOutputFile(value: unknown): ComfyOutputFile | undefined {
  const outputs = asRecord(value);
  if (!outputs) return undefined;
  const candidates: ComfyOutputFile[] = [];
  for (const output of Object.values(outputs)) {
    const record = asRecord(output);
    if (!record) continue;
    for (const key of ["videos", "gifs", "images"]) {
      const entries = record[key];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const file = asRecord(entry);
        if (typeof file?.filename !== "string") continue;
        candidates.push({
          filename: file.filename,
          subfolder: typeof file.subfolder === "string" ? file.subfolder : "",
          type: typeof file.type === "string" ? file.type : "output",
        });
      }
    }
  }
  return (
    candidates.find((file) => /\.(mp4|mov|webm|mkv)$/i.test(file.filename)) ?? candidates[0]
  );
}

function extractComfyError(status: Record<string, unknown>): string | undefined {
  const messages = status.messages;
  if (!Array.isArray(messages)) return undefined;
  for (const message of messages as unknown[]) {
    if (!Array.isArray(message)) continue;
    const tuple = message as unknown[];
    if (tuple[0] === "execution_error") return JSON.stringify(tuple[1]);
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  const text = await response.text();
  try {
    return text.length > 0 ? (JSON.parse(text) as unknown) : {};
  } catch (error) {
    throw new ComfyUiError(
      `${operation} returned non-JSON content`,
      "COMFYUI_NON_JSON_RESPONSE",
      response.status >= 500,
      { cause: error },
    );
  }
}
