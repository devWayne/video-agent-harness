import { z } from "zod";

export const voiceoverFormats = ["mp3", "pcm", "wav", "opus"] as const;
export const voiceoverSampleRates = [8_000, 16_000, 22_050, 24_000, 44_100, 48_000] as const;
export const voiceoverLanguageHints = [
  "zh",
  "en",
  "fr",
  "de",
  "ja",
  "ko",
  "ru",
  "pt",
  "th",
  "id",
  "vi",
  "es",
  "it",
  "ms",
  "fil",
  "ar",
] as const;

const hotFixEntrySchema = z.strictObject({
  source: z.string().trim().min(1).max(100),
  target: z.string().trim().min(1).max(300),
});

export const voiceoverRequestSchema = z
  .strictObject({
    text: z.string().trim().min(1).max(20_000),
    voice: z.string().trim().min(1).max(200).optional(),
    instruction: z.string().trim().min(1).max(128).optional(),
    format: z.enum(voiceoverFormats).optional(),
    sampleRate: z.union(voiceoverSampleRates.map((value) => z.literal(value))).optional(),
    volume: z.number().int().min(0).max(100).optional(),
    rate: z.number().min(0.5).max(2).optional(),
    pitch: z.number().min(0.5).max(2).optional(),
    bitRate: z.number().int().min(6).max(510).optional(),
    seed: z.number().int().min(0).max(65_535).optional(),
    languageHints: z.array(z.enum(voiceoverLanguageHints)).min(1).max(1).optional(),
    enableSsml: z.boolean().optional(),
    enableAigcTag: z.boolean().optional(),
    aigcPropagator: z.string().trim().min(1).max(200).optional(),
    aigcPropagateId: z.string().trim().min(1).max(200).optional(),
    hotFix: z
      .strictObject({
        pronunciation: z.array(hotFixEntrySchema).max(100).optional(),
        replace: z.array(hotFixEntrySchema).max(100).optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.bitRate !== undefined && value.format !== "opus") {
      context.addIssue({
        code: "custom",
        path: ["bitRate"],
        message: "bitRate is only supported when format is opus",
      });
    }
    if (
      value.enableAigcTag === false &&
      (value.aigcPropagator !== undefined || value.aigcPropagateId !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["enableAigcTag"],
        message: "AIGC propagator fields require enableAigcTag to be true",
      });
    }
  });

export type VoiceoverRequest = z.infer<typeof voiceoverRequestSchema>;

export interface VoiceoverResult {
  provider: string;
  model: string;
  requestId: string;
  audioUrl: string;
  audioId: string;
  expiresAt: string;
  billedCharacters: number;
  voice: string;
  format: (typeof voiceoverFormats)[number];
  sampleRate: (typeof voiceoverSampleRates)[number];
}

export interface VoiceoverCapabilities {
  provider: string;
  model: string;
  mode: "http-non-streaming";
  region: string;
  temporaryUrlTtlSeconds: number;
  defaults: {
    voice: string;
    instruction: string;
    format: (typeof voiceoverFormats)[number];
    sampleRate: (typeof voiceoverSampleRates)[number];
    volume: number;
    rate: number;
    pitch: number;
    languageHints: string[];
    enableAigcTag: boolean;
  };
  supportedSystemVoices: Array<{
    id: string;
    name: string;
    description: string;
    languages: string[];
  }>;
  supportedFormats: readonly string[];
  supportedSampleRates: readonly number[];
  supportedLanguageHints: readonly string[];
  supportsCustomVoiceIds: boolean;
  supportsInstruction: boolean;
  supportsSsml: boolean;
  supportsHotFix: boolean;
}

export interface VoiceoverProvider {
  readonly name: string;
  readonly model: string;
  capabilities(): VoiceoverCapabilities;
  synthesize(request: VoiceoverRequest, signal?: AbortSignal): Promise<VoiceoverResult>;
}

export class VoiceoverProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VoiceoverProviderError";
  }
}
