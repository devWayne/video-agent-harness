import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface CommercialAudioMixOptions {
  videoPath: string;
  voiceoverPath: string;
  musicPath: string;
  outputPath: string;
  musicGainDb?: number;
  voiceoverGainDb?: number;
  duckingThreshold?: number;
  duckingRatio?: number;
  duckingAttackMs?: number;
  duckingReleaseMs?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  targetLufs?: number;
  truePeakDb?: number;
  ffmpegPath?: string;
  ffprobePath?: string;
  overwrite?: boolean;
  signal?: AbortSignal;
}

export interface CommercialAudioMixResult {
  outputPath: string;
  durationSeconds: number;
  targetLufs: number;
  truePeakDb: number;
  musicGainDb: number;
  duckingRatio: number;
}

export async function mixCommercialAudio(
  options: CommercialAudioMixOptions,
): Promise<CommercialAudioMixResult> {
  const videoPath = resolve(options.videoPath);
  const voiceoverPath = resolve(options.voiceoverPath);
  const musicPath = resolve(options.musicPath);
  const outputPath = resolve(options.outputPath);
  await Promise.all([access(videoPath), access(voiceoverPath), access(musicPath)]);

  const ffprobePath = options.ffprobePath ?? "ffprobe";
  const ffmpegPath = options.ffmpegPath ?? "ffmpeg";
  const durationSeconds = await probeDuration(videoPath, ffprobePath, options.signal);
  const mix = normalizeOptions(options, durationSeconds);
  await mkdir(dirname(outputPath), { recursive: true });

  await runProcess(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      options.overwrite ? "-y" : "-n",
      "-i",
      videoPath,
      "-i",
      voiceoverPath,
      "-stream_loop",
      "-1",
      "-i",
      musicPath,
      "-filter_complex",
      buildCommercialAudioFilter(durationSeconds, mix),
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-map_metadata",
      "0",
      "-map_chapters",
      "0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "320k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-t",
      formatNumber(durationSeconds),
      "-movflags",
      "+faststart",
      outputPath,
    ],
    options.signal,
  );

  return {
    outputPath,
    durationSeconds,
    targetLufs: mix.targetLufs,
    truePeakDb: mix.truePeakDb,
    musicGainDb: mix.musicGainDb,
    duckingRatio: mix.duckingRatio,
  };
}

export function buildCommercialAudioFilter(
  durationSeconds: number,
  options: Required<
    Pick<
      CommercialAudioMixOptions,
      | "musicGainDb"
      | "voiceoverGainDb"
      | "duckingThreshold"
      | "duckingRatio"
      | "duckingAttackMs"
      | "duckingReleaseMs"
      | "fadeInSeconds"
      | "fadeOutSeconds"
      | "targetLufs"
      | "truePeakDb"
    >
  >,
): string {
  const duration = formatNumber(durationSeconds);
  const fadeOutStart = formatNumber(Math.max(0, durationSeconds - options.fadeOutSeconds));
  return [
    `[1:a]aresample=48000,volume=${formatNumber(options.voiceoverGainDb)}dB,apad=whole_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS,asplit=2[voice_mix][voice_key]`,
    `[2:a]aresample=48000,volume=${formatNumber(options.musicGainDb)}dB,afade=t=in:st=0:d=${formatNumber(options.fadeInSeconds)},afade=t=out:st=${fadeOutStart}:d=${formatNumber(options.fadeOutSeconds)},atrim=duration=${duration},asetpts=PTS-STARTPTS[music]`,
    `[music][voice_key]sidechaincompress=threshold=${formatNumber(options.duckingThreshold)}:ratio=${formatNumber(options.duckingRatio)}:attack=${formatNumber(options.duckingAttackMs)}:release=${formatNumber(options.duckingReleaseMs)}[ducked]`,
    `[ducked][voice_mix]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,loudnorm=I=${formatNumber(options.targetLufs)}:TP=${formatNumber(options.truePeakDb)}:LRA=11[aout]`,
  ].join(";");
}

async function probeDuration(
  videoPath: string,
  ffprobePath: string,
  signal?: AbortSignal,
): Promise<number> {
  const output = await runProcess(
    ffprobePath,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ],
    signal,
    true,
  );
  const duration = Number.parseFloat(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe returned an invalid video duration: ${output.trim()}`);
  }
  return duration;
}

function normalizeOptions(options: CommercialAudioMixOptions, durationSeconds: number) {
  const value = {
    musicGainDb: options.musicGainDb ?? -22,
    voiceoverGainDb: options.voiceoverGainDb ?? 0,
    duckingThreshold: options.duckingThreshold ?? 0.03,
    duckingRatio: options.duckingRatio ?? 8,
    duckingAttackMs: options.duckingAttackMs ?? 20,
    duckingReleaseMs: options.duckingReleaseMs ?? 500,
    fadeInSeconds: options.fadeInSeconds ?? 1.5,
    fadeOutSeconds: options.fadeOutSeconds ?? 3,
    targetLufs: options.targetLufs ?? -16,
    truePeakDb: options.truePeakDb ?? -1.5,
  };
  if (value.musicGainDb < -60 || value.musicGainDb > 0) {
    throw new Error("musicGainDb must be between -60 and 0 dB");
  }
  if (value.voiceoverGainDb < -24 || value.voiceoverGainDb > 12) {
    throw new Error("voiceoverGainDb must be between -24 and 12 dB");
  }
  if (value.duckingThreshold <= 0 || value.duckingThreshold > 1) {
    throw new Error("duckingThreshold must be greater than 0 and at most 1");
  }
  if (value.duckingRatio < 1 || value.duckingRatio > 20) {
    throw new Error("duckingRatio must be between 1 and 20");
  }
  if (value.fadeInSeconds < 0 || value.fadeOutSeconds < 0) {
    throw new Error("fade durations cannot be negative");
  }
  if (value.fadeInSeconds + value.fadeOutSeconds > durationSeconds) {
    throw new Error("fade-in and fade-out durations cannot exceed the video duration");
  }
  return value;
}

function formatNumber(value: number): string {
  return Number.parseFloat(value.toFixed(6)).toString();
}

function runProcess(
  executable: string,
  argumentsList: string[],
  signal?: AbortSignal,
  captureStdout = false,
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, argumentsList, {
      stdio: ["ignore", captureStdout ? "pipe" : "inherit", "pipe"],
      ...(signal ? { signal } : {}),
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectPromise);
    child.once("close", (code) => {
      if (code === 0) return resolvePromise(stdout);
      rejectPromise(
        new Error(`${executable} exited with code ${code ?? "unknown"}: ${stderr.trim()}`),
      );
    });
  });
}
