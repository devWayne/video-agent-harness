import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { BailianQwenAudioVoiceoverProvider } from "../src/providers/bailian-qwen-audio-voiceover-provider.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const arguments_ = parseArguments(process.argv.slice(2));
if (arguments_.help) {
  printUsage();
  process.exit(0);
}
if (arguments_.confirmPaid !== "YES") {
  throw new Error("This command creates paid Qwen Audio tasks; pass --confirm-paid YES");
}
if (!arguments_.manifest) throw new Error("Missing --manifest /absolute/path/to/tts-manifest.json");

const environment = z
  .object({
    BAILIAN_BASE_URL: z.url(),
    BAILIAN_API_KEY: z.string().min(1),
    BAILIAN_TTS_MODEL: z.literal("qwen-audio-3.0-tts-plus").default("qwen-audio-3.0-tts-plus"),
    BAILIAN_TTS_VOICE: z.string().min(1).default("longanlingxin"),
    BAILIAN_TTS_DEFAULT_INSTRUCTION: z.string().min(1),
    BAILIAN_TTS_ENABLE_AIGC_TAG: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(true),
    BAILIAN_TTS_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(120_000),
  })
  .parse(process.env);

const cueSchema = z.strictObject({
  id: z.string().regex(/^S\d{2,}$/),
  enabled: z.boolean(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  startFrame: z.number().int().nonnegative(),
  endFrameInclusive: z.number().int().nonnegative(),
  sourcePages: z.array(z.number().int().positive()).min(1),
  shotIds: z.array(z.string().min(1)).min(1),
  subtitle: z.string().min(1),
  ttsText: z.string().min(1),
  tone: z.string().min(1),
  emphasis: z.array(z.string().min(1)),
});

const manifestSchema = z
  .object({
    version: z.string(),
    sourcePdf: z.string(),
    sourceVideo: z.string(),
    timeline: z.strictObject({
      durationSeconds: z.number().positive(),
      framesPerSecond: z.number().positive(),
      totalFrames: z.number().int().positive(),
    }),
    voiceDirection: z.object({
      persona: z.string().min(1),
      emotionArc: z.string().min(1),
    }),
    cues: z.array(cueSchema).min(1),
  })
  .passthrough();

const manifestPath = resolve(arguments_.manifest);
const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
const outputDirectory = resolve(arguments_.outputDirectory ?? join(dirname(manifestPath), "Qwen-Audio-成片"));
const rawDirectory = join(outputDirectory, "takes-raw");
const conformedDirectory = join(outputDirectory, "takes-conformed");
const receiptPath = join(outputDirectory, "voiceover-render.receipt.json");
const trackPath = resolve(arguments_.track ?? join(outputDirectory, "Bettr-旁白母带-48k-mono.wav"));
const videoPath = arguments_.video ? resolve(arguments_.video) : undefined;
const outputVideoPath = arguments_.outputVideo ? resolve(arguments_.outputVideo) : undefined;

if (outputVideoPath && !videoPath) throw new Error("--output-video requires --video");
if (videoPath && !outputVideoPath) throw new Error("--video requires --output-video");

assertCommandAvailable("ffmpeg");
assertCommandAvailable("ffprobe");
await mkdir(rawDirectory, { recursive: true });
await mkdir(conformedDirectory, { recursive: true });

const provider = new BailianQwenAudioVoiceoverProvider({
  baseUrl: environment.BAILIAN_BASE_URL,
  apiKey: environment.BAILIAN_API_KEY,
  model: environment.BAILIAN_TTS_MODEL,
  defaultVoice: arguments_.voice ?? environment.BAILIAN_TTS_VOICE,
  defaultInstruction: environment.BAILIAN_TTS_DEFAULT_INSTRUCTION,
  defaultFormat: "wav",
  defaultSampleRate: 48_000,
  enableAigcTag: environment.BAILIAN_TTS_ENABLE_AIGC_TAG,
  requestTimeoutMs: environment.BAILIAN_TTS_REQUEST_TIMEOUT_MS,
});

const manifestSha256 = sha256(Buffer.from(await readFile(manifestPath)));
const loadedReceipt = await loadReceipt(receiptPath);
if (loadedReceipt && loadedReceipt.manifestSha256 !== manifestSha256) {
  throw new Error(`Existing receipt belongs to a different manifest: ${receiptPath}`);
}

let receipt: RenderReceipt =
  loadedReceipt ?? {
    version: 1,
    manifestPath,
    manifestSha256,
    provider: provider.name,
    model: provider.model,
    voice: arguments_.voice ?? environment.BAILIAN_TTS_VOICE,
    startedAt: new Date().toISOString(),
    cues: {},
  };

const enabledCues = manifest.cues.filter((cue) => cue.enabled);
for (const [index, cue] of enabledCues.entries()) {
  const rawPath = join(rawDirectory, `${cue.id}.wav`);
  const conformedPath = join(conformedDirectory, `${cue.id}.wav`);
  const existing = receipt.cues[cue.id];
  if (existing?.status === "ready" && (await isFile(rawPath)) && (await isFile(conformedPath))) {
    console.log(`[${index + 1}/${enabledCues.length}] ${cue.id} resume: ready`);
    continue;
  }

  const targetDuration = cue.endSeconds - cue.startSeconds;
  const instruction = buildInstruction(cue, targetDuration);

  console.log(`[${index + 1}/${enabledCues.length}] ${cue.id} synthesizing`);
  const result = await provider.synthesize({
    text: cue.ttsText,
    instruction,
    voice: arguments_.voice ?? environment.BAILIAN_TTS_VOICE,
    format: "wav",
    sampleRate: 48_000,
    volume: 50,
    rate: 1,
    pitch: 1,
    seed: deterministicSeed(manifestSha256, cue.id),
    languageHints: ["zh"],
    enableAigcTag: true,
    ...(cue.ttsText.includes("Bettr")
      ? { hotFix: { replace: [{ source: "Bettr", target: "Better" }] } }
      : {}),
  });
  const audio = await downloadAudio(result.audioUrl);
  await writeFile(rawPath, audio, { mode: 0o600 });
  const rawProbe = probeAudio(rawPath);
  assertProductionWave(rawProbe, cue.id);

  const maximumSpeechDuration = Math.max(0.5, targetDuration - 0.05);
  const tempo = Math.max(1, rawProbe.durationSeconds / maximumSpeechDuration);
  if (tempo > 2) {
    throw new Error(`${cue.id} is ${rawProbe.durationSeconds.toFixed(3)}s and cannot fit ${targetDuration.toFixed(3)}s safely`);
  }
  conformTake(rawPath, conformedPath, targetDuration, tempo);
  const conformedProbe = probeAudio(conformedPath);
  if (Math.abs(conformedProbe.durationSeconds - targetDuration) > 0.02) {
    throw new Error(`${cue.id} conformed duration mismatch: ${conformedProbe.durationSeconds}s`);
  }

  receipt.cues[cue.id] = {
    status: "ready",
    requestId: result.requestId,
    audioId: result.audioId,
    billedCharacters: result.billedCharacters,
    rawPath,
    rawBytes: audio.length,
    rawSha256: sha256(audio),
    rawDurationSeconds: rawProbe.durationSeconds,
    targetDurationSeconds: targetDuration,
    appliedTempo: tempo,
    conformedPath,
    conformedDurationSeconds: conformedProbe.durationSeconds,
  };
  await saveReceipt(receiptPath, receipt);
  console.log(
    `[${index + 1}/${enabledCues.length}] ${cue.id} ready: raw=${rawProbe.durationSeconds.toFixed(3)}s target=${targetDuration.toFixed(3)}s billed=${result.billedCharacters}`,
  );
  if (index < enabledCues.length - 1) await delay(500);
}

assembleTrack(enabledCues, conformedDirectory, trackPath, manifest.timeline.durationSeconds);
const trackProbe = probeAudio(trackPath);
if (
  trackProbe.sampleRate !== 48_000 ||
  trackProbe.channels !== 1 ||
  Math.abs(trackProbe.durationSeconds - manifest.timeline.durationSeconds) > 0.02
) {
  throw new Error(`Final voice-over track failed validation: ${JSON.stringify(trackProbe)}`);
}

if (videoPath && outputVideoPath) {
  const videoStats = await stat(videoPath);
  if (!videoStats.isFile()) throw new Error(`Video input is not a file: ${videoPath}`);
  await mkdir(dirname(outputVideoPath), { recursive: true });
  muxVideo(videoPath, trackPath, outputVideoPath, manifest.timeline.durationSeconds, arguments_.overwrite);
}

const completedAt = new Date().toISOString();
receipt = {
  ...receipt,
  completedAt,
  totalBilledCharacters: Object.values(receipt.cues).reduce(
    (total, cue) => total + cue.billedCharacters,
    0,
  ),
  track: {
    path: trackPath,
    durationSeconds: trackProbe.durationSeconds,
    sampleRate: trackProbe.sampleRate,
    channels: trackProbe.channels,
    sha256: sha256(Buffer.from(await readFile(trackPath))),
  },
  ...(outputVideoPath ? { outputVideoPath } : {}),
};
await saveReceipt(receiptPath, receipt);

console.log(
  JSON.stringify(
    {
      status: "succeeded",
      cues: enabledCues.length,
      totalBilledCharacters: receipt.totalBilledCharacters,
      voice: receipt.voice,
      track: receipt.track,
      outputVideoPath,
      receiptPath,
    },
    null,
    2,
  ),
);

interface ParsedArguments {
  manifest?: string;
  outputDirectory?: string;
  track?: string;
  video?: string;
  outputVideo?: string;
  voice?: string;
  confirmPaid?: string;
  overwrite: boolean;
  help: boolean;
}

interface CueReceipt {
  status: "ready";
  requestId: string;
  audioId: string;
  billedCharacters: number;
  rawPath: string;
  rawBytes: number;
  rawSha256: string;
  rawDurationSeconds: number;
  targetDurationSeconds: number;
  appliedTempo: number;
  conformedPath: string;
  conformedDurationSeconds: number;
}

interface RenderReceipt {
  version: 1;
  manifestPath: string;
  manifestSha256: string;
  provider: string;
  model: string;
  voice: string;
  startedAt: string;
  completedAt?: string;
  totalBilledCharacters?: number;
  cues: Record<string, CueReceipt>;
  track?: {
    path: string;
    durationSeconds: number;
    sampleRate: number;
    channels: number;
    sha256: string;
  };
  outputVideoPath?: string;
}

interface AudioProbe {
  codec: string;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSeconds: number;
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
      case "--manifest":
        parsed.manifest = value;
        break;
      case "--output-dir":
        parsed.outputDirectory = value;
        break;
      case "--track":
        parsed.track = value;
        break;
      case "--video":
        parsed.video = value;
        break;
      case "--output-video":
        parsed.outputVideo = value;
        break;
      case "--voice":
        parsed.voice = value;
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
  npm run voiceover:render-manifest -- \\
    --manifest /absolute/path/tts-manifest.json \\
    --output-dir /absolute/path/voiceover-output \\
    --video /absolute/path/master-4k.mp4 \\
    --output-video /absolute/path/master-4k-voiceover.mp4 \\
    --confirm-paid YES

Options:
  --track PATH       Override the 48 kHz mono WAV master path.
  --voice ID         Override the configured Qwen Audio voice.
  --overwrite        Replace the final muxed video if it already exists.
  --confirm-paid YES Required acknowledgement that real TTS requests may be billed.`);
}

function assertCommandAvailable(command: string): void {
  const result = spawnSync(command, ["-version"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} is required`);
}

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}

async function loadReceipt(path: string): Promise<RenderReceipt | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RenderReceipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function saveReceipt(path: string, receipt: RenderReceipt): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

async function downloadAudio(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Voice-over download failed with HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > 50 * 1024 * 1024) throw new Error("Voice-over download exceeds 50 MiB");
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0 || audio.length > 50 * 1024 * 1024) {
    throw new Error(`Voice-over download has an invalid size: ${audio.length} bytes`);
  }
  return audio;
}

function probeAudio(path: string): AudioProbe {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate,channels,bits_per_sample,duration:format=duration",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`ffprobe failed for ${path}: ${result.stderr.trim()}`);
  const payload = JSON.parse(result.stdout) as {
    streams?: Array<{
      codec_name?: string;
      sample_rate?: string;
      channels?: number;
      bits_per_sample?: number;
      duration?: string;
    }>;
    format?: { duration?: string };
  };
  const stream = payload.streams?.[0];
  if (!stream) throw new Error(`No audio stream in ${path}`);
  return {
    codec: stream.codec_name ?? "unknown",
    sampleRate: Number(stream.sample_rate),
    channels: stream.channels ?? 0,
    bitsPerSample: stream.bits_per_sample ?? 0,
    durationSeconds: Number(stream.duration ?? payload.format?.duration),
  };
}

function assertProductionWave(probe: AudioProbe, cueId: string): void {
  if (
    probe.codec !== "pcm_s16le" ||
    probe.sampleRate !== 48_000 ||
    probe.channels !== 1 ||
    probe.bitsPerSample !== 16 ||
    !Number.isFinite(probe.durationSeconds) ||
    probe.durationSeconds <= 0
  ) {
    throw new Error(`${cueId} did not return 48 kHz PCM 16-bit mono WAV: ${JSON.stringify(probe)}`);
  }
}

function conformTake(input: string, output: string, duration: number, tempo: number): void {
  const filter = [
    ...(tempo > 1.000_001 ? [`atempo=${tempo.toFixed(6)}`] : []),
    "apad",
    "loudnorm=I=-18:LRA=7:TP=-1.5",
  ].join(",");
  runFfmpeg([
    "-y",
    "-i",
    input,
    "-af",
    filter,
    "-t",
    duration.toFixed(6),
    "-ar",
    "48000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    output,
  ]);
}

function assembleTrack(
  cues: Array<z.infer<typeof cueSchema>>,
  inputDirectory: string,
  output: string,
  duration: number,
): void {
  const inputs = cues.flatMap((cue) => ["-i", join(inputDirectory, `${cue.id}.wav`)]);
  const delayed = cues.map(
    (cue, index) => `[${index}:a]adelay=${Math.round(cue.startSeconds * 1_000)}[a${index}]`,
  );
  const mixInputs = cues.map((_, index) => `[a${index}]`).join("");
  const filter = [
    ...delayed,
    `${mixInputs}amix=inputs=${cues.length}:duration=longest:dropout_transition=0:normalize=0,apad,loudnorm=I=-16:LRA=7:TP=-1.0[out]`,
  ].join(";");
  runFfmpeg([
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-t",
    duration.toFixed(6),
    "-ar",
    "48000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    output,
  ]);
}

function muxVideo(
  video: string,
  audio: string,
  output: string,
  duration: number,
  overwrite: boolean,
): void {
  const overwriteFlag = overwrite ? "-y" : "-n";
  runFfmpeg([
    overwriteFlag,
    "-i",
    video,
    "-i",
    audio,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-t",
    duration.toFixed(6),
    "-movflags",
    "+faststart",
    output,
  ]);
}

function runFfmpeg(arguments_: string[]): void {
  const result = spawnSync("ffmpeg", arguments_, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr.slice(-4_000)}`);
  }
}

function deterministicSeed(manifestHash: string, cueId: string): number {
  return Number.parseInt(createHash("sha256").update(`${manifestHash}:${cueId}`).digest("hex").slice(0, 4), 16);
}

function buildInstruction(cue: z.infer<typeof cueSchema>, targetDuration: number): string {
  const emphasis = cue.emphasis.length > 0 ? `重读${cue.emphasis.join("、")}。` : "";
  const brandPronunciation = cue.ttsText.includes("Bettr")
    ? "Bettr按英文better发音。"
    : cue.ttsText.includes("AI")
      ? "AI逐字母朗读。"
      : "";
  const instruction =
    `专业商业广告旁白，成熟自然、克制有感染力。语气：${cue.tone}。` +
    emphasis +
    `约${targetDuration.toFixed(1)}秒读完，只读正文。` +
    brandPronunciation;
  if (instruction.length > 128) {
    throw new Error(`${cue.id} instruction exceeds the verified 128-character API limit`);
  }
  return instruction;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve_) => setTimeout(resolve_, milliseconds));
}
