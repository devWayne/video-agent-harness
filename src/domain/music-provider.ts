import { z } from "zod";

export const musicSegmentNames = [
  "intro",
  "verse",
  "chorus",
  "inst",
  "bridge",
  "outro",
] as const;

const musicSegmentSchema = z.strictObject({
  name: z.enum(musicSegmentNames),
  durationSeconds: z.number().int().min(5).max(120),
});

const implicitWatermarkSchema = z.strictObject({
  enabled: z.boolean(),
  contentProducer: z.string().trim().min(1).max(200).optional(),
  produceId: z.string().trim().min(1).max(200).optional(),
  contentPropagator: z.string().trim().min(1).max(200).optional(),
  propagateId: z.string().trim().min(1).max(200).optional(),
});

export const musicTrackRequestSchema = z
  .strictObject({
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .refine((value) => /[\u3400-\u9fff]/u.test(value), {
        message: "Volcengine BigMusic prompts must contain Chinese text",
      }),
    durationSeconds: z.number().int().min(30).max(120).optional(),
    segments: z.array(musicSegmentSchema).min(1).max(12).optional(),
    enablePromptRewrite: z.boolean().optional(),
    storageBucket: z.string().trim().min(3).max(63).optional(),
    callbackUrl: z
      .url()
      .refine((value) => new URL(value).protocol === "https:", {
        message: "callbackUrl must use HTTPS",
      })
      .optional(),
    implicitWatermark: implicitWatermarkSchema.optional(),
    aigcWatermark: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (!value.segments) return;
    const total = value.segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
    if (total < 30 || total > 120) {
      context.addIssue({
        code: "custom",
        path: ["segments"],
        message: "The total segment duration must be between 30 and 120 seconds",
      });
    }
    if (value.segments.length === 1 && value.segments[0]!.durationSeconds < 30) {
      context.addIssue({
        code: "custom",
        path: ["segments", 0, "durationSeconds"],
        message: "A single v5.0 segment must be between 30 and 120 seconds",
      });
    }
  });

export type MusicTrackRequest = z.infer<typeof musicTrackRequestSchema>;

export interface SubmittedMusicTask {
  provider: string;
  model: string;
  taskId: string;
  status: "submitted";
  requestId?: string;
  predictedWaitTimeSeconds?: number;
}

export type MusicTaskStatus = "submitted" | "running" | "succeeded" | "failed";

export interface MusicTask {
  provider: string;
  model: string;
  taskId: string;
  status: MusicTaskStatus;
  progress: number;
  requestId?: string;
  audioUrl?: string;
  durationSeconds?: number;
  prompt?: string;
  storagePath?: string;
  styleInfo?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface MusicUsageItem {
  productName: string;
  authorizationStatus?: "production" | "trial" | "unknown";
  startsAt?: string;
  endsAt?: string;
  musicQuota?: number;
  musicUsed?: number;
}

export interface MusicCapabilities {
  provider: string;
  model: string;
  mode: "asynchronous";
  region: "cn-beijing";
  billingMode: "duration" | "package";
  modelVersion: "v5.0";
  sourceLanguage: "zh";
  outputFormat: "wav-provider-default";
  providerUrlTtlSeconds: number;
  defaults: {
    durationSeconds: number;
    enablePromptRewrite: boolean;
    aigcWatermark: boolean;
    commercialSafetyPrefix: string;
  };
  duration: {
    minimumSeconds: number;
    maximumSeconds: number;
    segmentMinimumSeconds: number;
    supportedSegmentNames: readonly string[];
    precedence: readonly string[];
  };
  supportsCallback: boolean;
  supportsCustomTosBucket: boolean;
  supportsImplicitWatermark: boolean;
  copyrightGuard: {
    providerCheckEnabled: true;
    rejectionCode: "50000001";
    guidance: readonly string[];
  };
}

export interface MusicProvider {
  readonly name: string;
  readonly model: string;
  capabilities(): MusicCapabilities;
  preflight(signal?: AbortSignal): Promise<MusicUsageItem[]>;
  submit(request: MusicTrackRequest, signal?: AbortSignal): Promise<SubmittedMusicTask>;
  getTask(taskId: string, signal?: AbortSignal): Promise<MusicTask>;
}

export class MusicProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MusicProviderError";
  }
}
