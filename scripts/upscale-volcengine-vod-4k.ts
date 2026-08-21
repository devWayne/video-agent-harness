import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { vodOpenapi } from "@volcengine/openapi";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { VolcengineTosOutputStore } from "../src/providers/volcengine-tos-output-store.js";
import {
  VolcengineVodClient,
  createAigcStandard4kRequest,
  type VodApiResponse,
} from "../src/providers/volcengine-vod-upscale-provider.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const args = parseArguments(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}
if (args.confirmPaid !== "YES") {
  throw new Error("This command creates a paid VOD AIGC task; pass --confirm-paid YES");
}
if (!args.input) throw new Error("Missing --input /absolute/path/to/input.mp4");

const environment = z
  .object({
    VOLCENGINE_VOD_ACCESS_KEY_ID: z.string().min(1),
    VOLCENGINE_VOD_SECRET_ACCESS_KEY: z.string().min(1),
    VOLCENGINE_VOD_SESSION_TOKEN: z.string().min(1).optional(),
    VOLCENGINE_VOD_SPACE_NAME: z.string().min(1),
    VOLCENGINE_VOD_REGION: z.string().min(1).default("cn-north-1"),
    VOLCENGINE_VOD_ENDPOINT: z.string().min(1).default("vod.volcengineapi.com"),
    VOLCENGINE_TOS_REGION: z.string().min(1).default("cn-beijing"),
    VOLCENGINE_TOS_ENDPOINT: z.string().min(1).default("tos-cn-beijing.volces.com"),
    VOLCENGINE_VOD_REPAIR_STRENGTH: z.coerce
      .number()
      .pipe(z.union([z.literal(0), z.literal(1), z.literal(2)]))
      .default(0),
    VOLCENGINE_VOD_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(15_000),
    VOD_4K_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
    VOD_4K_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(60 * 60 * 1_000),
  })
  .parse(process.env);

const stateSchema = z.object({
  version: z.literal(1),
  inputPath: z.string(),
  inputSha256: z.string(),
  inputBytes: z.number().int().nonnegative(),
  outputPath: z.string(),
  vid: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  fileId: z.string().min(1).optional(),
  storeUri: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  status: z.enum(["prepared", "uploaded", "submitted", "enhanced", "downloaded"]),
  outputSha256: z.string().optional(),
});

type WorkflowState = z.infer<typeof stateSchema>;

assertFfprobeAvailable();
const inputPath = resolve(args.input);
const inputStats = await stat(inputPath);
if (!inputStats.isFile()) throw new Error(`Input is not a file: ${inputPath}`);
const outputPath = resolve(args.output ?? defaultOutputPath(inputPath));
const statePath = resolve(args.state ?? `${outputPath}.volcengine-vod-4k.json`);
const inputProbe = probeVideo(inputPath);
assertSupportedInput(inputProbe);
const inputSha256 = await sha256File(inputPath);

const loadedState = await loadState(statePath);
let state: WorkflowState;
if (loadedState) {
  if (
    loadedState.inputPath !== inputPath ||
    loadedState.inputSha256 !== inputSha256 ||
    loadedState.inputBytes !== inputStats.size ||
    loadedState.outputPath !== outputPath
  ) {
    throw new Error(
      `State file belongs to a different input/output. Move it aside before starting a new paid task: ${statePath}`,
    );
  }
  state = loadedState;
  console.log(`Resuming VOD 4K workflow from ${state.status}`);
} else {
  state = {
    version: 1,
    inputPath,
    inputSha256,
    inputBytes: inputStats.size,
    outputPath,
    status: "prepared",
  };
  await saveState(statePath, state);
}

const vodService = new vodOpenapi.VodService();
vodService.setAccessKeyId(environment.VOLCENGINE_VOD_ACCESS_KEY_ID);
vodService.setSecretKey(environment.VOLCENGINE_VOD_SECRET_ACCESS_KEY);
if (environment.VOLCENGINE_VOD_SESSION_TOKEN) {
  vodService.setSessionToken(environment.VOLCENGINE_VOD_SESSION_TOKEN);
}
vodService.setRegion(environment.VOLCENGINE_VOD_REGION);

const vodClient = new VolcengineVodClient({
  accessKeyId: environment.VOLCENGINE_VOD_ACCESS_KEY_ID,
  secretAccessKey: environment.VOLCENGINE_VOD_SECRET_ACCESS_KEY,
  ...(environment.VOLCENGINE_VOD_SESSION_TOKEN
    ? { sessionToken: environment.VOLCENGINE_VOD_SESSION_TOKEN }
    : {}),
  region: environment.VOLCENGINE_VOD_REGION,
  endpoint: environment.VOLCENGINE_VOD_ENDPOINT,
  timeoutMs: environment.VOLCENGINE_VOD_REQUEST_TIMEOUT_MS,
});
const tosStore = new VolcengineTosOutputStore({
  accessKeyId: environment.VOLCENGINE_VOD_ACCESS_KEY_ID,
  secretAccessKey: environment.VOLCENGINE_VOD_SECRET_ACCESS_KEY,
  ...(environment.VOLCENGINE_VOD_SESSION_TOKEN
    ? { sessionToken: environment.VOLCENGINE_VOD_SESSION_TOKEN }
    : {}),
  region: environment.VOLCENGINE_TOS_REGION,
  endpoint: environment.VOLCENGINE_TOS_ENDPOINT,
});

requireVodResult(
  await vodClient.getMediaList({
    SpaceName: environment.VOLCENGINE_VOD_SPACE_NAME,
    Offset: "0",
    PageSize: "1",
  }),
  "GetMediaList",
);
console.log(`VOD preflight passed for space ${environment.VOLCENGINE_VOD_SPACE_NAME}`);

try {
  if (!state.vid) {
    console.log(`Uploading ${basename(inputPath)} to VOD`);
    let lastProgressBucket = -1;
    const upload = await vodService.UploadMedia({
      SpaceName: environment.VOLCENGINE_VOD_SPACE_NAME,
      FilePath: inputPath,
      FileExtension: extname(inputPath) || ".mp4",
      checkpoint: `${statePath}.vod-upload-checkpoint.json`,
      onProgress: (progress) => {
        const bucket = Math.floor(progress * 10);
        if (bucket !== lastProgressBucket) {
          lastProgressBucket = bucket;
          console.log(`VOD upload progress ${Math.min(100, bucket * 10)}%`);
        }
      },
    });
    assertSdkResponse(upload, "UploadMedia");
    const vid = upload.Result?.Data?.Vid;
    if (!vid) throw new Error("VOD UploadMedia response did not include Vid");
    state = { ...state, vid, status: "uploaded" };
    await saveState(statePath, state);
    console.log(`VOD upload completed; Vid=${vid}`);
  }

  if (!state.runId) {
    const vid = state.vid;
    if (!vid) throw new Error("Workflow state lost its uploaded Vid");
    const clientToken = `harmony-4k-${state.inputSha256.slice(0, 48)}`;
    const start = requireVodResult(
      await vodClient.startExecution(
        createAigcStandard4kRequest(
          vid,
          clientToken,
          environment.VOLCENGINE_VOD_REPAIR_STRENGTH,
        ),
      ),
      "StartExecution",
    );
    if (!start.RunId) throw new Error("VOD StartExecution response did not include RunId");
    state = { ...state, runId: start.RunId, status: "submitted" };
    await saveState(statePath, state);
    console.log(`AIGC Standard 4K submitted; RunId=${start.RunId}`);
  }

  const runId = state.runId;
  const vid = state.vid;
  if (!runId || !vid) throw new Error("Workflow state is missing Vid or RunId");
  if (!state.storeUri || !state.fileId || !state.width || !state.height) {
    const deadline = Date.now() + environment.VOD_4K_TIMEOUT_MS;
    let previousStatus: string | undefined;
    let completed = false;
    let executionFileId: string | undefined;
    while (Date.now() < deadline) {
      const execution = requireVodResult(
        await vodClient.getExecution({ RunId: runId }),
        "GetExecution",
      );
      const status = execution.Status?.toLowerCase();
      if (!status) throw new Error("VOD GetExecution response did not include Status");
      if (status !== previousStatus) {
        console.log(`AIGC Standard 4K status: ${execution.Status}`);
        previousStatus = status;
      }
      if (["failed", "failure", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error(
          `VOD AIGC 4K failed: ${execution.Error?.Code ?? "UNKNOWN"}: ${execution.Error?.Message ?? ""}`,
        );
      }
      if (["success", "succeeded", "complete", "completed"].includes(status)) {
        const enhance = execution.Output?.Task?.Enhance;
        executionFileId = enhance?.File?.FileId ?? enhance?.FileId;
        completed = true;
        break;
      }
      await delay(environment.VOD_4K_POLL_INTERVAL_MS);
    }
    if (!completed) {
      throw new Error(`VOD AIGC 4K timed out after ${environment.VOD_4K_TIMEOUT_MS}ms`);
    }

    let output:
      | {
          FileId?: string;
          StoreUri?: string;
          VideoStreamMeta?: { Width?: number; Height?: number };
        }
      | undefined;
    while (Date.now() < deadline && !output) {
      const media = requireVodResult(
        await vodClient.getMediaInfos({ Vids: vid }),
        "GetMediaInfos",
      );
      const transcodes = media.MediaInfoList?.find(
        (item) => item.BasicInfo?.Vid === vid,
      )?.TranscodeInfos;
      output =
        (executionFileId
          ? transcodes?.find((item) => item.FileId === executionFileId)
          : undefined) ??
        transcodes?.find(
          (item) =>
            item.VideoStreamMeta?.Width === 3840 && item.VideoStreamMeta?.Height === 2160,
        );
      if (!output) await delay(environment.VOD_4K_POLL_INTERVAL_MS);
    }
    if (!output?.FileId || !output.StoreUri) {
      throw new Error("GetMediaInfos did not return a downloadable 3840x2160 transcode");
    }
    state = {
      ...state,
      fileId: output.FileId,
      storeUri: output.StoreUri,
      width: output.VideoStreamMeta?.Width,
      height: output.VideoStreamMeta?.Height,
      status: "enhanced",
    };
    await saveState(statePath, state);
  }

  if (state.width !== 3840 || state.height !== 2160) {
    throw new Error(`Unexpected VOD output dimensions: ${state.width}x${state.height}`);
  }
  const storeUri = state.storeUri;
  if (!storeUri) throw new Error("Workflow state is missing the output StoreUri");
  const remote = await tosStore.head(storeUri);
  if (remote.contentType && remote.contentType !== "video/mp4") {
    throw new Error(`Unexpected VOD output content type: ${remote.contentType}`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const existingOutput = await stat(outputPath).catch(() => undefined);
  if (existingOutput && state.status !== "downloaded" && !args.overwrite) {
    throw new Error(`Output already exists; pass --overwrite to replace it: ${outputPath}`);
  }
  if (!existingOutput || state.status !== "downloaded" || args.overwrite) {
    console.log(`Downloading ${remote.size ?? "unknown"} bytes from VOD-managed TOS`);
    await tosStore.downloadToFile(storeUri, outputPath);
  }
  const outputProbe = probeVideo(outputPath);
  if (outputProbe.width !== 3840 || outputProbe.height !== 2160) {
    throw new Error(
      `Downloaded output failed 4K verification: ${outputProbe.width}x${outputProbe.height}`,
    );
  }
  const outputSha256 = await sha256File(outputPath);
  state = { ...state, status: "downloaded", outputSha256 };
  await saveState(statePath, state);
  console.log(
    JSON.stringify(
      {
        status: "succeeded",
        input: {
          path: inputPath,
          width: inputProbe.width,
          height: inputProbe.height,
          durationSeconds: inputProbe.durationSeconds,
          bytes: inputStats.size,
          sha256: inputSha256,
        },
        output: {
          path: outputPath,
          width: outputProbe.width,
          height: outputProbe.height,
          durationSeconds: outputProbe.durationSeconds,
          bytes: outputProbe.bytes,
          codec: outputProbe.codec,
          framesPerSecond: outputProbe.framesPerSecond,
          sha256: outputSha256,
        },
        vod: { vid: state.vid, runId: state.runId, fileId: state.fileId },
        statePath,
      },
      null,
      2,
    ),
  );
} finally {
  if (state.vid) {
    try {
      requireVodResultOrEmpty(
        await vodClient.updateMediaPublishStatus({ Vid: state.vid, Status: "Unpublished" }),
        "UpdateMediaPublishStatus",
      );
      console.log("VOD media is Unpublished; stored media and billing records are retained");
    } catch (error) {
      console.warn(`Unable to restore VOD media to Unpublished: ${errorMessage(error)}`);
    }
  }
}

interface ParsedArguments {
  input?: string;
  output?: string;
  state?: string;
  confirmPaid?: string;
  overwrite: boolean;
  help: boolean;
}

function parseArguments(argv: string[]): ParsedArguments {
  const parsed: ParsedArguments = { overwrite: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--overwrite") {
      parsed.overwrite = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${argument}`);
    switch (argument) {
      case "--input":
        parsed.input = value;
        break;
      case "--output":
        parsed.output = value;
        break;
      case "--state":
        parsed.state = value;
        break;
      case "--confirm-paid":
        parsed.confirmPaid = value;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
    index += 1;
  }
  return parsed;
}

function printUsage(): void {
  console.log(`Usage:
  npm run vod:upscale-4k -- \\
    --input /absolute/path/input.mp4 \\
    --output /absolute/path/output-4k.mp4 \\
    --confirm-paid YES

Options:
  --state PATH       Override the resumable state file path.
  --overwrite        Replace an existing output file after the paid task succeeds.
  --confirm-paid YES Required acknowledgement that one real AIGC 4K task may be billed.`);
}

function defaultOutputPath(inputPath: string): string {
  const extension = extname(inputPath) || ".mp4";
  return `${inputPath.slice(0, inputPath.length - extname(inputPath).length)}-4k${extension}`;
}

async function loadState(statePath: string): Promise<WorkflowState | undefined> {
  try {
    return stateSchema.parse(JSON.parse(await readFile(statePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Unable to read workflow state ${statePath}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

async function saveState(statePath: string, state: WorkflowState): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, statePath);
}

function assertSdkResponse(
  response: { ResponseMetadata?: { Error?: { Code?: string; Message?: string } } },
  action: string,
): void {
  const error = response.ResponseMetadata?.Error;
  if (error) throw new Error(`VOD ${action} failed: ${error.Code ?? "UNKNOWN"}: ${error.Message ?? ""}`);
}

function requireVodResult<T>(response: VodApiResponse<T>, action: string): T {
  assertSdkResponse(response, action);
  if (response.Result === undefined) throw new Error(`VOD ${action} response did not include Result`);
  return response.Result;
}

function requireVodResultOrEmpty(response: VodApiResponse<unknown>, action: string): void {
  assertSdkResponse(response, action);
}

interface VideoProbe {
  width: number;
  height: number;
  durationSeconds: number;
  bytes: number;
  codec?: string;
  framesPerSecond?: number;
}

function assertFfprobeAvailable(): void {
  const result = spawnSync("ffprobe", ["-version"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("ffprobe is required before starting a paid task");
}

function probeVideo(filePath: string): VideoProbe {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,avg_frame_rate,duration:format=duration,size",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
  }
  const payload = z
    .object({
      streams: z
        .array(
          z.object({
            codec_name: z.string().optional(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            avg_frame_rate: z.string().optional(),
            duration: z.string().optional(),
          }),
        )
        .min(1),
      format: z.object({ duration: z.string(), size: z.string() }),
    })
    .parse(JSON.parse(result.stdout));
  const stream = payload.streams[0]!;
  const framesPerSecond = parseFrameRate(stream.avg_frame_rate);
  return {
    width: stream.width,
    height: stream.height,
    durationSeconds: Number(stream.duration ?? payload.format.duration),
    bytes: Number(payload.format.size),
    ...(stream.codec_name ? { codec: stream.codec_name } : {}),
    ...(framesPerSecond === undefined ? {} : { framesPerSecond }),
  };
}

function assertSupportedInput(probe: VideoProbe): void {
  if (probe.width > 1920 || probe.height > 1080) {
    throw new Error(
      `AIGC Standard 4K input must not exceed 1920x1080; received ${probe.width}x${probe.height}`,
    );
  }
  const ratio = probe.width / probe.height;
  if (Math.abs(ratio - 16 / 9) > 0.01) {
    throw new Error(`This 4K profile requires a 16:9 input; received ${probe.width}x${probe.height}`);
  }
}

function parseFrameRate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!numerator || !denominator) return undefined;
  return numerator / denominator;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
    stream.on("end", resolveHash);
    stream.on("error", rejectHash);
  });
  return hash.digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
