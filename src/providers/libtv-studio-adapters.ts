import type { LibTvCanvasClient } from "./libtv-cli-client.js";

export class LibTvScriptAdapter {
  constructor(private readonly client: LibTvCanvasClient) {}

  async createScriptAndStoryboard(input: {
    nodeName: string;
    prompt: string;
    textModelName: string;
    imageModelName: string;
    signal?: AbortSignal;
  }): Promise<{ script: unknown; storyboard: unknown }> {
    const script = await this.client.runJson(
      [
        "node",
        "create",
        input.nodeName,
        "--type",
        "script",
        ...this.client.projectArgs(),
        "--prompt",
        input.prompt,
        "--set",
        `model=${input.textModelName}`,
        "--run",
      ],
      input.signal,
    );
    const storyboard = await this.client.runJson(
      [
        "script",
        "storyboard",
        input.nodeName,
        ...this.client.projectArgs(),
        "--set",
        `model=${input.imageModelName}`,
        "--set",
        "aspectRatio=16:9",
      ],
      input.signal,
    );
    return { script, storyboard };
  }
}

export class LibTvAssemblyAdapter {
  constructor(private readonly client: LibTvCanvasClient) {}

  async assembleInCanvas(input: {
    nodeName: string;
    sourceVideoNodes: string[];
    signal?: AbortSignal;
  }): Promise<unknown> {
    if (input.sourceVideoNodes.length === 0) {
      throw new Error("LibTV assembly requires at least one source video node");
    }
    return this.client.runJson(
      [
        "node",
        "create",
        input.nodeName,
        "--type",
        "video-clip",
        ...this.client.projectArgs(),
        ...input.sourceVideoNodes.flatMap((node) => ["--left", node]),
        "--run",
      ],
      input.signal,
    );
  }
}
