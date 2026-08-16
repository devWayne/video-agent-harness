import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { lintHyperframeHtml } from "@hyperframes/core/lint";
import {
  createCompositionPreviewSchema,
  type CompositionPreview,
  type CreateCompositionPreviewInput,
} from "../domain/composition-spec.js";

const gsapRuntime = readFileSync(
  createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"),
  "utf8",
);
const hyperframesRuntime = readFileSync(
  createRequire(import.meta.url).resolve("@hyperframes/core/runtime"),
  "utf8",
);

const THEMES = {
  violet: {
    background: "#100d1c",
    surface: "rgba(19, 15, 36, 0.58)",
    foreground: "#f7f4ff",
    secondary: "#d6cef2",
  },
  cinema: {
    background: "#0a0b0d",
    surface: "rgba(8, 9, 12, 0.58)",
    foreground: "#f8f2e8",
    secondary: "#d3c7b7",
  },
  editorial: {
    background: "#e9e2d5",
    surface: "rgba(28, 27, 25, 0.42)",
    foreground: "#fffdf8",
    secondary: "#eee7dc",
  },
} as const;

const MOTIONS = {
  "fade-up": { from: "{ opacity: 0, y: 72 }", stagger: 0.12 },
  "scale-in": { from: "{ opacity: 0, scale: 0.86 }", stagger: 0.09 },
  "slide-left": { from: "{ opacity: 0, x: 130 }", stagger: 0.1 },
} as const;

export class HyperframesCompositionError extends Error {
  readonly code = "INVALID_HYPERFRAMES_COMPOSITION";

  constructor(readonly findings: Array<{ code: string; message: string }>) {
    super("Generated HyperFrames composition did not pass validation");
    this.name = "HyperframesCompositionError";
  }
}

export class HyperframesCompositionService {
  private readonly previews = new Map<string, string>();

  async createPreview(rawInput: unknown): Promise<CompositionPreview> {
    const input = createCompositionPreviewSchema.parse(rawInput);
    const id = `harness-${randomUUID()}`;
    const html = compileCompositionHtml(id, input);
    const lint = await lintHyperframeHtml(html);
    const errors = lint.findings
      .filter((finding) => finding.severity === "error")
      .map(({ code, message }) => ({ code, message }));
    if (errors.length > 0) throw new HyperframesCompositionError(errors);
    this.previews.set(id, inlinePreviewRuntimes(html));
    while (this.previews.size > 20) {
      const oldestId = this.previews.keys().next().value;
      if (!oldestId) break;
      this.previews.delete(oldestId);
    }

    return {
      id,
      previewUrl: `/compositions/previews/${id}.html`,
      durationSeconds: input.durationSeconds,
      width: 1920,
      height: 1080,
      engine: "hyperframes",
      lint: {
        warningCount: lint.warningCount,
        findings: lint.findings
          .filter((finding) => finding.severity === "warning")
          .map(({ code, message }) => ({ code, message })),
      },
    };
  }

  getPreviewHtml(id: string): string | undefined {
    return this.previews.get(id);
  }
}

export function compileCompositionHtml(
  id: string,
  input: CreateCompositionPreviewInput,
): string {
  const theme = THEMES[input.theme];
  const motion = MOTIONS[input.motion];
  const duration = input.durationSeconds;
  const outroStart = Math.max(2, duration - 0.65);
  const background = input.backgroundVideoUrl
    ? `<video id="background-video" class="clip background-media" data-start="0" data-duration="${duration}" data-track-index="0" src="${escapeAttribute(input.backgroundVideoUrl)}" muted playsinline></video>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <title>Video Agent Harness composition</title>
  <script src="/vendor/gsap-3.12.5.min.js"></script>
  <style>
    @font-face { font-family: "Noto Sans SC"; src: local("Noto Sans SC"); font-display: swap; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1920px; height: 1080px; overflow: hidden; background: ${theme.background}; }
    body { font-family: Inter, "Noto Sans SC", system-ui, sans-serif; }
    #stage { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: ${theme.background}; }
    .clip { position: absolute; inset: 0; width: 100%; height: 100%; visibility: hidden; }
    .background-media { object-fit: cover; transform: scale(1.03); }
    .wash { position: absolute; inset: 0; background: linear-gradient(90deg, ${theme.surface} 0%, rgba(8, 9, 13, .25) 58%, rgba(8, 9, 13, .1) 100%); }
    .grain { position: absolute; inset: 0; opacity: .13; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E"); mix-blend-mode: soft-light; }
    #copy-content { position: absolute; left: 132px; right: 220px; bottom: 126px; color: ${theme.foreground}; transform-origin: left bottom; }
    #rule { width: 92px; height: 8px; margin-bottom: 34px; border-radius: 99px; background: ${input.accentColor}; }
    .kicker { margin-bottom: 22px; color: ${input.accentColor}; font-size: 25px; font-weight: 760; letter-spacing: .22em; text-transform: uppercase; }
    h1 { max-width: 1450px; font-size: 104px; font-weight: 820; line-height: 1.03; letter-spacing: -.045em; text-wrap: balance; }
    .subtitle { max-width: 1120px; margin-top: 28px; color: ${theme.secondary}; font-size: 34px; font-weight: 440; line-height: 1.45; letter-spacing: .015em; }
    .signature { position: absolute; right: 66px; bottom: 50px; color: rgba(255,255,255,.58); font-size: 18px; letter-spacing: .14em; }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="${id}" data-start="0" data-width="1920" data-height="1080">
    ${background}
    <div id="title-card" class="clip" data-start="0" data-duration="${duration}" data-track-index="1">
      <div class="wash"></div>
      <div class="grain"></div>
      <div id="copy-content">
        <div id="rule"></div>
        ${input.kicker ? `<div class="kicker copy-line">${escapeHtml(input.kicker)}</div>` : ""}
        <h1 class="copy-line">${escapeHtml(input.title)}</h1>
        ${input.subtitle ? `<p class="subtitle copy-line">${escapeHtml(input.subtitle)}</p>` : ""}
      </div>
      <div class="signature">HYPERFRAMES × HARNESS</div>
    </div>
  </div>
  <script>
    var tl = gsap.timeline({ paused: true });
    gsap.set("#copy-content", ${motion.from});
    gsap.set("#rule", { scaleX: 0, transformOrigin: "left center" });
    tl.to("#copy-content", { opacity: 1, x: 0, y: 0, scale: 1, duration: .82, ease: "power3.out" }, .16);
    tl.to("#rule", { scaleX: 1, duration: .6, ease: "power2.out" }, .28);
    tl.fromTo(".copy-line", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .68, stagger: ${motion.stagger}, ease: "power2.out" }, .38);
    tl.to("#copy-content", { opacity: 0, y: -24, duration: .5, ease: "power2.in" }, ${outroStart});
    tl.to({}, { duration: ${duration} }, 0);
    window.__timelines = window.__timelines || {};
    window.__timelines[${JSON.stringify(id)}] = tl;
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return escaped[character] ?? character;
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function inlinePreviewRuntimes(html: string): string {
  return html.replace(
    '<script src="/vendor/gsap-3.12.5.min.js"></script>',
    () =>
      `<script data-harness-runtime="gsap">${gsapRuntime}</script>\n<script data-harness-runtime="hyperframes">${hyperframesRuntime}</script>`,
  );
}
