import { config as loadDotenv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { BailianQwenAudioVoiceoverProvider } from "../src/providers/bailian-qwen-audio-voiceover-provider.js";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const environment = z
  .object({
    BAILIAN_BASE_URL: z.url(),
    BAILIAN_API_KEY: z.string().min(1),
    BAILIAN_TTS_MODEL: z.literal("qwen-audio-3.0-tts-plus").default("qwen-audio-3.0-tts-plus"),
    BAILIAN_TTS_VOICE: z.string().min(1).default("longanlingxin"),
    BAILIAN_TTS_DEFAULT_INSTRUCTION: z.string().min(1).default(
      "专业商业广告旁白，像真人自然表达，克制而有感染力；卖点清晰，品牌名和结尾口号适度加重，避免夸张播音腔。",
    ),
    TTS_SMOKE_TEXT: z
      .string()
      .min(1)
      .default("每一次出发，都值得更好的抵达。让灵感被看见，让好创意真正发生。"),
    TTS_SMOKE_OUTPUT: z
      .string()
      .min(1)
      .default("artifacts/voiceovers/qwen-audio-3.0-tts-plus-smoke.wav"),
    TTS_SMOKE_CONFIRM_PAID: z.literal("YES"),
  })
  .parse(process.env);

const provider = new BailianQwenAudioVoiceoverProvider({
  baseUrl: environment.BAILIAN_BASE_URL,
  apiKey: environment.BAILIAN_API_KEY,
  model: environment.BAILIAN_TTS_MODEL,
  defaultVoice: environment.BAILIAN_TTS_VOICE,
  defaultInstruction: environment.BAILIAN_TTS_DEFAULT_INSTRUCTION,
  defaultFormat: "wav",
  defaultSampleRate: 48_000,
  enableAigcTag: true,
});

const result = await provider.synthesize({ text: environment.TTS_SMOKE_TEXT });
const downloadResponse = await fetch(result.audioUrl, { signal: AbortSignal.timeout(120_000) });
if (!downloadResponse.ok) {
  throw new Error(`Voice-over download failed with HTTP ${downloadResponse.status}`);
}
const declaredLength = Number(downloadResponse.headers.get("content-length") ?? "0");
if (declaredLength > 50 * 1024 * 1024) {
  throw new Error("Voice-over download exceeded the 50 MiB smoke-test limit");
}
const audio = Buffer.from(await downloadResponse.arrayBuffer());
if (audio.length === 0 || audio.length > 50 * 1024 * 1024) {
  throw new Error(`Voice-over download had an invalid size: ${audio.length} bytes`);
}

const outputPath = resolve(environment.TTS_SMOKE_OUTPUT);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, audio);

process.stdout.write(
  `${JSON.stringify(
    {
      provider: result.provider,
      model: result.model,
      requestId: result.requestId,
      audioId: result.audioId,
      voice: result.voice,
      format: result.format,
      sampleRate: result.sampleRate,
      billedCharacters: result.billedCharacters,
      expiresAt: result.expiresAt,
      bytes: audio.length,
      outputPath,
    },
    null,
    2,
  )}\n`,
);
