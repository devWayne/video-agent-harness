import { z } from "zod";
import {
  VoiceoverProviderError,
  voiceoverRequestSchema,
  voiceoverFormats,
  voiceoverLanguageHints,
  voiceoverSampleRates,
  type VoiceoverCapabilities,
  type VoiceoverProvider,
  type VoiceoverRequest,
  type VoiceoverResult,
} from "../domain/voiceover-provider.js";

const responseSchema = z.looseObject({
  request_id: z.string().min(1),
  code: z.string().optional(),
  message: z.string().optional(),
  output: z.looseObject({
    finish_reason: z.string(),
    audio: z.looseObject({
      url: z.url(),
      id: z.string().min(1),
      expires_at: z.number().int().positive(),
    }),
  }),
  usage: z.looseObject({
    characters: z.number().int().nonnegative(),
  }),
});

export interface BailianQwenAudioVoiceoverProviderOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  defaultVoice?: string;
  defaultInstruction?: string;
  defaultFormat?: "mp3" | "pcm" | "wav" | "opus";
  defaultSampleRate?: 8_000 | 16_000 | 22_050 | 24_000 | 44_100 | 48_000;
  enableAigcTag?: boolean;
  requestTimeoutMs?: number;
  fetch?: typeof fetch;
}

const defaultCommercialInstruction =
  "专业商业广告旁白，像真人自然表达，克制而有感染力；卖点清晰，品牌名和结尾口号适度加重，避免夸张播音腔。";

/** Non-streaming HTTP adapter for commercial voice-over production with Qwen Audio 3.0. */
export class BailianQwenAudioVoiceoverProvider implements VoiceoverProvider {
  readonly name = "bailian-qwen-audio";
  readonly model: string;
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #defaultVoice: string;
  readonly #defaultInstruction: string;
  readonly #defaultFormat: "mp3" | "pcm" | "wav" | "opus";
  readonly #defaultSampleRate: 8_000 | 16_000 | 22_050 | 24_000 | 44_100 | 48_000;
  readonly #enableAigcTag: boolean;
  readonly #requestTimeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: BailianQwenAudioVoiceoverProviderOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.model = options.model ?? "qwen-audio-3.0-tts-plus";
    this.#defaultVoice = options.defaultVoice ?? "longanlingxin";
    this.#defaultInstruction = options.defaultInstruction ?? defaultCommercialInstruction;
    this.#defaultFormat = options.defaultFormat ?? "wav";
    this.#defaultSampleRate = options.defaultSampleRate ?? 48_000;
    this.#enableAigcTag = options.enableAigcTag ?? true;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.#fetch = options.fetch ?? globalThis.fetch;

    if (this.model !== "qwen-audio-3.0-tts-plus") {
      throw new VoiceoverProviderError(
        `The configured model ${this.model} is not the verified Qwen Audio 3.0 Plus profile`,
        "QWEN_AUDIO_MODEL_PROFILE_NOT_VERIFIED",
        false,
      );
    }
  }

  capabilities(): VoiceoverCapabilities {
    return {
      provider: this.name,
      model: this.model,
      mode: "http-non-streaming",
      region: "cn-beijing",
      temporaryUrlTtlSeconds: 86_400,
      defaults: {
        voice: this.#defaultVoice,
        instruction: this.#defaultInstruction,
        format: this.#defaultFormat,
        sampleRate: this.#defaultSampleRate,
        volume: 50,
        rate: 1,
        pitch: 1,
        languageHints: ["zh"],
        enableAigcTag: this.#enableAigcTag,
      },
      supportedSystemVoices: [
        {
          id: "longanlingxin",
          name: "龙安灵心",
          description: "25 岁女性，知心温暖音，适合品牌叙事和生活方式广告",
          languages: ["zh", "en"],
        },
        {
          id: "longanlufeng",
          name: "龙安鲁风",
          description: "25 岁男性，明亮开朗音，适合产品发布和年轻化广告",
          languages: ["zh", "en"],
        },
      ],
      supportedFormats: voiceoverFormats,
      supportedSampleRates: voiceoverSampleRates,
      supportedLanguageHints: voiceoverLanguageHints,
      supportsCustomVoiceIds: true,
      supportsInstruction: true,
      supportsSsml: true,
      supportsHotFix: true,
    };
  }

  async synthesize(
    request: VoiceoverRequest,
    signal?: AbortSignal,
  ): Promise<VoiceoverResult> {
    const input = voiceoverRequestSchema.parse(request);
    const voice = input.voice ?? this.#defaultVoice;
    const format = input.format ?? this.#defaultFormat;
    const sampleRate = input.sampleRate ?? this.#defaultSampleRate;
    const enableAigcTag = input.enableAigcTag ?? this.#enableAigcTag;
    const timeoutSignal = AbortSignal.timeout(this.#requestTimeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await this.#fetch(
        `${this.#baseUrl}/services/audio/tts/SpeechSynthesizer`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            input: {
              text: input.text,
              voice,
              format,
              sample_rate: sampleRate,
              volume: input.volume ?? 50,
              rate: input.rate ?? 1,
              pitch: input.pitch ?? 1,
              seed: input.seed ?? 0,
              language_hints: input.languageHints ?? ["zh"],
              instruction: input.instruction ?? this.#defaultInstruction,
              enable_ssml: input.enableSsml ?? false,
              enable_aigc_tag: enableAigcTag,
              ...(input.bitRate === undefined ? {} : { bit_rate: input.bitRate }),
              ...(input.aigcPropagator === undefined
                ? {}
                : { aigc_propagator: input.aigcPropagator }),
              ...(input.aigcPropagateId === undefined
                ? {}
                : { aigc_propagate_id: input.aigcPropagateId }),
              ...(input.hotFix
                ? {
                    hot_fix: {
                      ...(input.hotFix.pronunciation
                        ? {
                            pronunciation: input.hotFix.pronunciation.map(({ source, target }) => ({
                              [source]: target,
                            })),
                          }
                        : {}),
                      ...(input.hotFix.replace
                        ? {
                            replace: input.hotFix.replace.map(({ source, target }) => ({
                              [source]: target,
                            })),
                          }
                        : {}),
                    },
                  }
                : {}),
            },
          }),
          signal: requestSignal,
        },
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new VoiceoverProviderError(
        "Bailian voice-over request failed before a response was received",
        "BAILIAN_TTS_NETWORK_ERROR",
        true,
        { cause: error },
      );
    }

    const payload = await readJson(response);
    if (!response.ok) throw providerHttpError(response, payload);

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.output.finish_reason !== "stop") {
      throw new VoiceoverProviderError(
        "Bailian voice-over response did not contain a completed audio result",
        "INVALID_TTS_RESPONSE",
        false,
        { cause: parsed.success ? undefined : parsed.error },
      );
    }

    return {
      provider: this.name,
      model: this.model,
      requestId: parsed.data.request_id,
      audioUrl: parsed.data.output.audio.url,
      audioId: parsed.data.output.audio.id,
      expiresAt: new Date(parsed.data.output.audio.expires_at * 1_000).toISOString(),
      billedCharacters: parsed.data.usage.characters,
      voice,
      format,
      sampleRate,
    };
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new VoiceoverProviderError(
      `Bailian voice-over endpoint returned non-JSON with HTTP ${response.status}`,
      "BAILIAN_TTS_NON_JSON_RESPONSE",
      response.status >= 500,
      { cause: error },
    );
  }
}

function providerHttpError(response: Response, payload: unknown): VoiceoverProviderError {
  const parsed = z
    .looseObject({ code: z.string().optional(), message: z.string().optional() })
    .safeParse(payload);
  return new VoiceoverProviderError(
    parsed.success && parsed.data.message
      ? parsed.data.message
      : `Bailian voice-over request failed with HTTP ${response.status}`,
    parsed.success && parsed.data.code ? parsed.data.code : `BAILIAN_TTS_HTTP_${response.status}`,
    response.status === 408 || response.status === 429 || response.status >= 500,
  );
}
