import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { EditorialWorkspaceError } from "../domain/editorial-workspace.js";

export interface OpenChatCutToolClient {
  callTool(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

export interface OpenChatCutMcpClientOptions {
  mcpUrl: string;
  bearerToken?: string;
}

export class OpenChatCutMcpClient implements OpenChatCutToolClient {
  readonly #client = new Client({ name: "video-agent-harness", version: "0.1.0" });
  readonly #transport: StreamableHTTPClientTransport;
  #connected = false;

  constructor(options: OpenChatCutMcpClientOptions) {
    this.#transport = new StreamableHTTPClientTransport(new URL(options.mcpUrl), {
      ...(options.bearerToken
        ? { requestInit: { headers: { authorization: `Bearer ${options.bearerToken}` } } }
        : {}),
    });
  }

  async callTool(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.#connected) {
      await this.#client.connect(this.#transport as unknown as Transport);
      this.#connected = true;
    }
    const result = await this.#client.callTool({ name, arguments: input });
    if (result.isError) {
      throw new EditorialWorkspaceError(`OpenChatCut tool ${name} failed: ${toolMessage(result)}`, true);
    }
    if (result.structuredContent && typeof result.structuredContent === "object") {
      return result.structuredContent as Record<string, unknown>;
    }
    const text = textContent(result.content);
    if (!text) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : { result: parsed };
    } catch {
      return { result: text };
    }
  }

  async close(): Promise<void> {
    if (!this.#connected) return;
    await this.#client.close();
    this.#connected = false;
  }
}

function toolMessage(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const text = textContent(result.content);
  return text ?? "unknown MCP error";
}

function textContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const item of content) {
    if (item && typeof item === "object" && (item as { type?: unknown }).type === "text") {
      const text = (item as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  return undefined;
}
