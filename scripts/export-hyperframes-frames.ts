import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

interface ExportOptions {
  url: string;
  outputDirectory: string;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  quality: number;
}

interface DevToolsTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface DevToolsMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

class DevToolsClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as DevToolsMessage;
      if (typeof message.id !== "number") return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(message.error.message ?? "Chrome DevTools command failed"));
      } else {
        waiter.resolve(message.result);
      }
    });
  }

  static async connect(url: string): Promise<DevToolsClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveConnection, rejectConnection) => {
      socket.addEventListener("open", () => resolveConnection(), { once: true });
      socket.addEventListener(
        "error",
        () => rejectConnection(new Error("Could not connect to headless Chrome")),
        { once: true },
      );
    });
    return new DevToolsClient(socket);
  }

  async send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = this.nextId++;
    const response = new Promise<unknown>((resolveResponse, rejectResponse) => {
      this.pending.set(id, { resolve: resolveResponse, reject: rejectResponse });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return (await response) as T;
  }

  close(): void {
    this.socket.close();
  }
}

function readOptions(): ExportOptions {
  const values = new Map(
    process.argv.slice(2).map((argument) => {
      const separator = argument.indexOf("=");
      return separator === -1
        ? [argument.replace(/^--/, ""), ""]
        : [argument.slice(0, separator).replace(/^--/, ""), argument.slice(separator + 1)];
    }),
  );
  const url = values.get("url") ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
    throw new Error("--url must be a localhost HyperFrames preview URL");
  }
  const outputDirectory = resolve(values.get("output") ?? "work/hyperframes-frames");
  return {
    url,
    outputDirectory,
    durationSeconds: Number(values.get("duration") ?? 24),
    fps: Number(values.get("fps") ?? 30),
    width: Number(values.get("width") ?? 1920),
    height: Number(values.get("height") ?? 1080),
    quality: Number(values.get("quality") ?? 91),
  };
}

async function waitForTarget(port: number, expectedUrl: string): Promise<DevToolsTarget> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = (await response.json()) as DevToolsTarget[];
      const match = targets.find(
        (target) =>
          target.type === "page" &&
          Boolean(target.webSocketDebuggerUrl) &&
          (target.url === expectedUrl || target.url === "about:blank"),
      );
      if (match) return match;
    } catch {
      // Chrome has not opened the DevTools endpoint yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Timed out waiting for headless Chrome");
}

async function waitForComposition(client: DevToolsClient): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await client.send<{
      result?: { value?: boolean };
    }>("Runtime.evaluate", {
      expression:
        "Boolean(document.fonts && document.fonts.status === 'loaded' && window.__timelines && Object.keys(window.__timelines).length && window.__player && window.__renderReady)",
      returnByValue: true,
    });
    if (response.result?.value) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("HyperFrames composition did not become ready");
}

async function stopChrome(chrome: ChildProcess): Promise<void> {
  if (chrome.exitCode !== null) return;
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveExit) => chrome.once("exit", () => resolveExit())),
    new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ]);
  if (chrome.exitCode === null) chrome.kill("SIGKILL");
}

async function main(): Promise<void> {
  const options = readOptions();
  const frameCount = Math.ceil(options.durationSeconds * options.fps);
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const profileDirectory = await mkdtemp(`${tmpdir()}/harness-hyperframes-chrome-`);
  const remoteDebuggingPort = 9334;
  await mkdir(options.outputDirectory, { recursive: true });

  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${remoteDebuggingPort}`,
      `--user-data-dir=${profileDirectory}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      "--hide-scrollbars",
      `--window-size=${options.width},${options.height}`,
      "--force-device-scale-factor=1",
      options.url,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  let client: DevToolsClient | undefined;
  try {
    const target = await waitForTarget(remoteDebuggingPort, options.url);
    client = await DevToolsClient.connect(target.webSocketDebuggerUrl!);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: options.width,
      height: options.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: options.width,
      screenHeight: options.height,
    });
    await waitForComposition(client);
    await client.send("Runtime.evaluate", {
      expression: `
        document.documentElement.style.width = "${options.width}px";
        document.documentElement.style.height = "${options.height}px";
        document.body.style.width = "${options.width}px";
        document.body.style.height = "${options.height}px";
        document.querySelectorAll(".clip").forEach((element) => { element.style.visibility = "visible"; });
        window.__player.pause();
        window.__player.renderSeek(0, { suppressEvents: true });
      `,
    });
    const compositionState = await client.send<{
      result?: { value?: { timelineCount: number; duration: number; sceneVisibility: string; sceneOpacity: string } };
    }>("Runtime.evaluate", {
      expression: `(() => {
        const timelines = Object.values(window.__timelines);
        const scene = document.querySelector("#story-scene-1");
        return {
          timelineCount: timelines.length,
          duration: timelines[0]?.duration?.() ?? 0,
          sceneVisibility: scene ? getComputedStyle(scene).visibility : "missing",
          sceneOpacity: scene ? getComputedStyle(scene).opacity : "missing",
        };
      })()`,
      returnByValue: true,
    });
    process.stdout.write(`Composition ready ${JSON.stringify(compositionState.result?.value)}\n`);

    const digits = String(frameCount - 1).length;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const seconds = frame / options.fps;
      await client.send("Runtime.evaluate", {
        expression: `window.__player.renderSeek(${seconds}, { suppressEvents: true });`,
      });
      if (frame === Math.min(options.fps, frameCount - 1)) {
        const sampledState = await client.send<{ result?: { value?: unknown } }>("Runtime.evaluate", {
          expression: `(() => {
            const scene = document.querySelector("#story-scene-1");
            const content = scene?.querySelector(".scene-content");
            const title = scene?.querySelector("h1");
            const style = scene ? getComputedStyle(scene) : null;
            return {
              time: Object.values(window.__timelines)[0]?.time?.(),
              scene: style && { display: style.display, visibility: style.visibility, opacity: style.opacity, clipPath: style.clipPath, transform: style.transform, background: style.backgroundImage, rect: scene.getBoundingClientRect().toJSON() },
              content: content && { opacity: getComputedStyle(content).opacity, transform: getComputedStyle(content).transform },
              title: title && { opacity: getComputedStyle(title).opacity, color: getComputedStyle(title).color, rect: title.getBoundingClientRect().toJSON() },
              stage: document.querySelector("#stage")?.getBoundingClientRect().toJSON(),
            };
          })()`,
          returnByValue: true,
        });
        process.stdout.write(`Sampled state ${JSON.stringify(sampledState.result?.value)}\n`);
      }
      const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
        format: "jpeg",
        quality: options.quality,
        fromSurface: true,
        captureBeyondViewport: false,
        optimizeForSpeed: true,
      });
      const frameName = `frame_${String(frame).padStart(digits, "0")}.jpg`;
      await writeFile(resolve(options.outputDirectory, frameName), Buffer.from(screenshot.data, "base64"));
      if (frame === 0 || (frame + 1) % options.fps === 0 || frame + 1 === frameCount) {
        process.stdout.write(`Captured ${frame + 1}/${frameCount} frames\n`);
      }
    }
  } finally {
    client?.close();
    await stopChrome(chrome);
    await rm(profileDirectory, { recursive: true, force: true });
  }
}

await main();
