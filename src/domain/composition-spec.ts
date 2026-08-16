import { z } from "zod";

const optionalHttpsUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Media URLs must use HTTPS")
    .optional(),
);

const backgroundClipSchema = z.object({
  videoUrl: z
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Media URLs must use HTTPS"),
  startSeconds: z.number().min(0).max(30),
  durationSeconds: z.number().positive().max(30),
  mediaStartSeconds: z.number().min(0).max(3_600).default(0),
});

export const createCompositionPreviewSchema = z.object({
  template: z.enum(["title-card", "smart-city-story"]).default("title-card"),
  title: z.string().trim().min(1).max(100),
  subtitle: z.string().trim().max(220).default(""),
  kicker: z.string().trim().max(48).default("VIDEO AGENT HARNESS"),
  backgroundVideoUrl: optionalHttpsUrl,
  backgroundClips: z.array(backgroundClipSchema).max(12).optional(),
  durationSeconds: z.number().min(3).max(30).default(8),
  theme: z.enum(["violet", "cinema", "editorial"]).default("violet"),
  motion: z.enum(["fade-up", "scale-in", "slide-left"]).default("fade-up"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Accent color must be a six-digit hex color")
    .default("#8b7cff"),
}).superRefine((input, context) => {
  if (input.backgroundVideoUrl && (input.backgroundClips?.length ?? 0) > 0) {
    context.addIssue({
      code: "custom",
      path: ["backgroundClips"],
      message: "Use either backgroundVideoUrl or backgroundClips, not both",
    });
  }
  input.backgroundClips?.forEach((clip, index) => {
    if (clip.startSeconds + clip.durationSeconds > input.durationSeconds + 0.001) {
      context.addIssue({
        code: "custom",
        path: ["backgroundClips", index, "durationSeconds"],
        message: "Background clip must end within the composition duration",
      });
    }
  });
  if (input.template === "smart-city-story" && input.durationSeconds < 15) {
    context.addIssue({
      code: "custom",
      path: ["durationSeconds"],
      message: "Smart-city story duration must be at least 15 seconds",
    });
  }
});

export type CreateCompositionPreviewInput = z.infer<typeof createCompositionPreviewSchema>;
export type CompositionTemplate = CreateCompositionPreviewInput["template"];

export interface CompositionPreview {
  id: string;
  previewUrl: string;
  durationSeconds: number;
  width: 1920;
  height: 1080;
  engine: "hyperframes";
  template: CompositionTemplate;
  lint: {
    warningCount: number;
    findings: Array<{ code: string; message: string }>;
  };
}
