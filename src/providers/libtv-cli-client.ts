import { spawn } from "node:child_process";

export interface LibTvCliClientOptions {
  executable: string;
  projectUuid: string;
  workingDirectory: string;
  maxOutputBytes?: number;
}

export interface LibTvNodeSummary {
  nodeKey: string;
  name?: string;
  type?: string;
  raw: Record<string, unknown>;
}

export interface LibTvCanvasClient {
  runJson(args: string[], signal?: AbortSignal): Promise<unknown>;
  listNodes(signal?: AbortSignal): Promise<LibTvNodeSummary[]>;
  findNode(name: string, signal?: AbortSignal): Promise<LibTvNodeSummary | undefined>;
  getNode(node: string, signal?: AbortSignal): Promise<Record<string, unknown>>;
  uploadVideo(
    name: string,
    filePath: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
  projectArgs(): string[];
}

export class LibTvCliClient implements LibTvCanvasClient {
  readonly #maxOutputBytes: number;

  constructor(private readonly options: LibTvCliClientOptions) {
    this.#maxOutputBytes = options.maxOutputBytes ?? 8 * 1024 * 1024;
  }

  async runJson(args: string[], signal?: AbortSignal): Promise<unknown> {
    const result = await runProcess(
      this.options.executable,
      args,
      this.options.workingDirectory,
      this.#maxOutputBytes,
      signal,
    );
    try {
      return JSON.parse(result.stdout) as unknown;
    } catch (error) {
      throw new LibTvCliError(
        `LibTV CLI returned non-JSON output for: ${args.slice(0, 3).join(" ")}`,
        "LIBTV_INVALID_JSON",
        false,
        result.stderr,
        { cause: error },
      );
    }
  }

  async listNodes(signal?: AbortSignal): Promise<LibTvNodeSummary[]> {
    const payload = await this.runJson(
      ["node", "list", "-p", this.options.projectUuid],
      signal,
    );
    const record = asRecord(payload);
    const nodes = Array.isArray(record?.nodes) ? record.nodes : [];
    return nodes.flatMap((node) => {
      const raw = asRecord(node);
      const nodeKey = stringValue(raw?.nodeKey) ?? stringValue(raw?.id);
      if (!raw || !nodeKey) return [];
      const name = nodeName(raw);
      const type = stringValue(raw.type);
      return [
        {
          nodeKey,
          ...(name ? { name } : {}),
          ...(type ? { type } : {}),
          raw,
        },
      ];
    });
  }

  async findNode(name: string, signal?: AbortSignal): Promise<LibTvNodeSummary | undefined> {
    const nodes = await this.listNodes(signal);
    return nodes.find((node) => node.name === name);
  }

  async getNode(node: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const payload = await this.runJson(
      ["node", node, "-p", this.options.projectUuid],
      signal,
    );
    const record = asRecord(payload);
    if (!record) throw new LibTvCliError("LibTV node result was not an object", "LIBTV_NODE_INVALID", false);
    return record;
  }

  async uploadVideo(name: string, filePath: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const payload = await this.runJson(
      [
        "upload",
        name,
        "--file",
        filePath,
        "--type",
        "video",
        "--project",
        this.options.projectUuid,
      ],
      signal,
    );
    const record = asRecord(payload);
    if (!record) throw new LibTvCliError("LibTV upload result was not an object", "LIBTV_UPLOAD_INVALID", false);
    return record;
  }

  projectArgs(): string[] {
    return ["--project", this.options.projectUuid];
  }
}

export class LibTvCliError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly stderr?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LibTvCliError";
  }
}

export function findMediaUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaUrl(item);
      if (found && /\.(mp4|mov|webm|m3u8)(?:\?|$)/i.test(found)) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of ["videoUrl", "outputUrl", "url"]) {
    const found = findMediaUrl(record[key]);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findMediaUrl(nested);
    if (found && /\.(mp4|mov|webm|m3u8)(?:\?|$)/i.test(found)) return found;
  }
  return undefined;
}

function runProcess(
  executable: string,
  args: string[],
  workingDirectory: string,
  maxOutputBytes: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: workingDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      ...(signal ? { signal } : {}),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;

    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGTERM");
        reject(
          new LibTvCliError(
            `LibTV CLI output exceeded ${maxOutputBytes} bytes`,
            "LIBTV_OUTPUT_LIMIT",
            false,
          ),
        );
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", (error) => {
      reject(
        new LibTvCliError(
          `Unable to start LibTV CLI at ${executable}`,
          "LIBTV_CLI_START_FAILED",
          false,
          undefined,
          { cause: error },
        ),
      );
    });
    child.once("close", (code) => {
      const stdoutText = Buffer.concat(stdout).toString("utf8").trim();
      const stderrText = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(
          new LibTvCliError(
            `LibTV CLI exited with code ${code ?? "unknown"}`,
            "LIBTV_COMMAND_FAILED",
            true,
            stderrText,
          ),
        );
        return;
      }
      resolve({ stdout: stdoutText, stderr: stderrText });
    });
  });
}

function nodeName(node: Record<string, unknown>): string | undefined {
  return (
    stringValue(node.name) ??
    stringValue(node.label) ??
    stringValue(asRecord(node.data)?.name) ??
    stringValue(asRecord(node.data)?.label)
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
