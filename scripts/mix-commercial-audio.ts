import { mixCommercialAudio } from "../src/application/commercial-audio-mixer.js";

const argumentsMap = parseArguments(process.argv.slice(2));
if (!argumentsMap.video || !argumentsMap.voiceover || !argumentsMap.music || !argumentsMap.output) {
  throw new Error(
    "Usage: npm run audio:mix -- --video master.mp4 --voiceover voice.wav --music bgm.wav --output final.mp4",
  );
}

const result = await mixCommercialAudio({
  videoPath: argumentsMap.video,
  voiceoverPath: argumentsMap.voiceover,
  musicPath: argumentsMap.music,
  outputPath: argumentsMap.output,
  ...(argumentsMap.musicGainDb === undefined
    ? {}
    : { musicGainDb: argumentsMap.musicGainDb }),
  ...(argumentsMap.voiceoverGainDb === undefined
    ? {}
    : { voiceoverGainDb: argumentsMap.voiceoverGainDb }),
  ...(argumentsMap.targetLufs === undefined ? {} : { targetLufs: argumentsMap.targetLufs }),
  ...(argumentsMap.overwrite ? { overwrite: true } : {}),
});

console.log(JSON.stringify(result, null, 2));

function parseArguments(values: string[]): {
  video?: string;
  voiceover?: string;
  music?: string;
  output?: string;
  musicGainDb?: number;
  voiceoverGainDb?: number;
  targetLufs?: number;
  overwrite: boolean;
} {
  const result: ReturnTypeWithoutRecursion = { overwrite: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index]!;
    if (flag === "--overwrite") {
      result.overwrite = true;
      continue;
    }
    const next = values[index + 1];
    if (["--video", "--voiceover", "--music", "--output"].includes(flag) && next) {
      if (flag === "--video") result.video = next;
      if (flag === "--voiceover") result.voiceover = next;
      if (flag === "--music") result.music = next;
      if (flag === "--output") result.output = next;
      index += 1;
      continue;
    }
    if (
      ["--music-gain-db", "--voiceover-gain-db", "--target-lufs"].includes(flag) &&
      next
    ) {
      const parsed = Number.parseFloat(next);
      if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a number`);
      if (flag === "--music-gain-db") result.musicGainDb = parsed;
      if (flag === "--voiceover-gain-db") result.voiceoverGainDb = parsed;
      if (flag === "--target-lufs") result.targetLufs = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  return result;
}

type ReturnTypeWithoutRecursion = {
  video?: string;
  voiceover?: string;
  music?: string;
  output?: string;
  musicGainDb?: number;
  voiceoverGainDb?: number;
  targetLufs?: number;
  overwrite: boolean;
};
