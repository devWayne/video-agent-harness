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
      template: input.template,
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
  return input.template === "smart-city-story"
    ? compileSmartCityStoryHtml(id, input)
    : compileTitleCardHtml(id, input);
}

function compileTitleCardHtml(
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

function compileSmartCityStoryHtml(
  id: string,
  input: CreateCompositionPreviewInput,
): string {
  const duration = input.durationSeconds;
  const starts = [0, 0.13, 0.32, 0.51, 0.7, 0.875].map((ratio) =>
    Number((duration * ratio).toFixed(3)),
  );
  const sceneDuration = (index: number) =>
    Number(
      (
        (starts[index + 1] ?? duration) - starts[index]! +
        (index < starts.length - 1 ? 0.5 : 0)
      ).toFixed(3),
    );
  const background = input.backgroundVideoUrl
    ? `<video id="story-background" class="clip story-background" data-start="0" data-duration="${duration}" data-track-index="0" src="${escapeAttribute(input.backgroundVideoUrl)}" muted playsinline></video>`
    : "";
  const sceneAttrs = (index: number) =>
    `class="clip story-scene scene-${index + 1}" data-start="${starts[index]!}" data-duration="${sceneDuration(index)}" data-track-index="${index + 1}"`;
  const fadeInAt = (index: number) => Number((starts[index]! + 0.08).toFixed(3));
  const fadeOutAt = (index: number) => Number(((starts[index + 1] ?? duration) - 0.04).toFixed(3));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <title>智慧城市的一天 · Video Agent Harness</title>
  <script src="/vendor/gsap-3.12.5.min.js"></script>
  <style>
    @font-face { font-family: "Noto Sans SC"; src: local("Noto Sans SC"); font-display: swap; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1920px; height: 1080px; overflow: hidden; background: #06101b; }
    body { color: #f7fbff; font-family: Inter, "Noto Sans SC", system-ui, sans-serif; }
    #stage { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #06101b; perspective: 1400px; transform-style: preserve-3d; }
    .clip { position: absolute; inset: 0; width: 100%; height: 100%; visibility: hidden; }
    .story-background { object-fit: cover; filter: saturate(.78) brightness(.58); transform: scale(1.08); }
    .story-scene { overflow: hidden; opacity: 0; isolation: isolate; transform-origin: center; will-change: transform, opacity, clip-path; }
    .story-scene::before { content: ""; position: absolute; inset: -14%; z-index: 1; opacity: .24; background: linear-gradient(rgba(104,224,255,.11) 1px,transparent 1px),linear-gradient(90deg,rgba(104,224,255,.11) 1px,transparent 1px); background-size: 84px 84px; transform: perspective(900px) rotateX(62deg) translateY(330px) scale(1.35); transform-origin: center bottom; }
    .story-scene::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(3,10,18,.02), rgba(3,10,18,.34)); z-index: 2; }
    .scene-content { position: absolute; inset: -3%; z-index: 4; transform-origin: center; will-change: transform; }
    .grain { position: absolute; inset: 0; z-index: 3; opacity: .08; mix-blend-mode: soft-light; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.42'/%3E%3C/svg%3E"); }
    .cinematic-vignette { position: absolute; inset: 0; z-index: 30; pointer-events: none; box-shadow: inset 0 0 190px rgba(0,0,0,.62); background: linear-gradient(180deg,rgba(0,0,0,.18),transparent 18%,transparent 78%,rgba(0,0,0,.25)); }
    .impact-flash { position: absolute; inset: 0; z-index: 27; pointer-events: none; opacity: 0; background: linear-gradient(105deg,transparent 18%,rgba(189,246,255,.72) 47%,rgba(255,255,255,.94) 50%,rgba(81,216,255,.3) 55%,transparent 78%); mix-blend-mode: screen; }
    .transition-blades { position: absolute; inset: -15%; z-index: 25; pointer-events: none; overflow: hidden; transform: rotate(-7deg); }
    .transition-blade { position: absolute; left: -20%; width: 140%; height: 23%; opacity: 0; background: linear-gradient(90deg,transparent,rgba(23,176,220,.1) 12%,rgba(117,237,255,.92) 48%,rgba(255,255,255,.98) 52%,rgba(32,82,124,.92) 57%,transparent 88%); filter: blur(.3px); box-shadow: 0 0 60px rgba(85,226,255,.46); }
    .transition-blade:nth-child(1) { top: 8%; } .transition-blade:nth-child(2) { top: 31%; } .transition-blade:nth-child(3) { top: 54%; } .transition-blade:nth-child(4) { top: 77%; }
    .speed-lines { position: absolute; inset: 0; z-index: 22; pointer-events: none; overflow: hidden; opacity: .55; }
    .speed-line { position: absolute; left: -34%; width: 32%; height: 3px; opacity: 0; border-radius: 99px; background: linear-gradient(90deg,transparent,rgba(183,246,255,.95)); box-shadow: 0 0 16px rgba(104,230,255,.85); }
    .speed-line:nth-child(1) { top: 16%; width: 22%; } .speed-line:nth-child(2) { top: 31%; width: 38%; } .speed-line:nth-child(3) { top: 47%; width: 27%; } .speed-line:nth-child(4) { top: 66%; width: 44%; } .speed-line:nth-child(5) { top: 83%; width: 31%; }
    .eyebrow { color: ${input.accentColor}; font-size: 25px; font-weight: 800; letter-spacing: .2em; }
    .display { max-width: 1360px; font-size: 114px; line-height: 1.02; letter-spacing: -.055em; font-weight: 850; }
    .lead { max-width: 1020px; color: rgba(239,248,255,.75); font-size: 34px; line-height: 1.5; }
    .scene-title { font-size: 62px; line-height: 1.08; letter-spacing: -.035em; font-weight: 830; }
    .scene-copy { color: rgba(235,246,255,.72); font-size: 26px; line-height: 1.5; }
    .time-badge { display: flex; align-items: baseline; gap: 13px; padding: 18px 28px; border: 1px solid rgba(255,255,255,.26); border-radius: 22px; background: rgba(8,18,34,.52); box-shadow: 0 18px 60px rgba(0,0,0,.2); backdrop-filter: blur(18px); }
    .time-badge b { font-size: 48px; letter-spacing: -.04em; }
    .time-badge span { color: rgba(255,255,255,.58); font-size: 17px; font-weight: 750; letter-spacing: .12em; }
    .glass-card { border: 1px solid rgba(255,255,255,.25); border-radius: 28px; background: rgba(7,20,34,.7); box-shadow: 0 30px 90px rgba(0,0,0,.28); backdrop-filter: blur(24px); }
    .card-label { color: rgba(233,245,255,.58); font-size: 18px; font-weight: 720; letter-spacing: .08em; }
    .card-value { margin-top: 8px; font-size: 52px; font-weight: 850; letter-spacing: -.04em; }
    .card-delta { margin-top: 6px; color: ${input.accentColor}; font-size: 19px; font-weight: 760; }
    .status-pill { display: inline-flex; align-items: center; gap: 10px; padding: 11px 16px; border-radius: 999px; color: #dffef5; background: rgba(21,211,161,.15); border: 1px solid rgba(58,239,190,.28); font-size: 16px; font-weight: 750; }
    .status-pill i { width: 9px; height: 9px; border-radius: 50%; background: #44e4b4; box-shadow: 0 0 18px #44e4b4; }
    .top-label { position: absolute; left: 76px; top: 64px; display: flex; align-items: center; gap: 16px; color: rgba(255,255,255,.52); font-size: 17px; font-weight: 760; letter-spacing: .12em; }
    .top-label::before { content: ""; width: 38px; height: 3px; border-radius: 8px; background: ${input.accentColor}; }
    .scene-1 { background: radial-gradient(circle at 72% 40%, rgba(65,220,255,.23), transparent 29%), linear-gradient(135deg,#081623 2%,#12344a 54%,#0b1b2e); }
    .scene-1 .opening-copy { position: absolute; left: 112px; bottom: 154px; display: grid; gap: 26px; }
    .scene-1 .pulse-orb { position: absolute; right: 190px; top: 168px; width: 520px; height: 520px; border: 1px solid rgba(95,230,255,.34); border-radius: 50%; box-shadow: inset 0 0 120px rgba(36,194,255,.12), 0 0 120px rgba(36,194,255,.09); }
    .scene-1 .pulse-orb::before, .scene-1 .pulse-orb::after { content: ""; position: absolute; inset: 70px; border: 1px solid rgba(95,230,255,.27); border-radius: 50%; }
    .scene-1 .pulse-orb::after { inset: 160px; background: rgba(87,224,255,.15); box-shadow: 0 0 90px rgba(87,224,255,.35); }
    .orbit-dot { position: absolute; width: 18px; height: 18px; border-radius: 50%; background: ${input.accentColor}; box-shadow: 0 0 30px ${input.accentColor}; }
    .orbit-dot.a { right: 440px; top: 150px; } .orbit-dot.b { right: 130px; top: 520px; } .orbit-dot.c { right: 630px; top: 580px; }
    .scene-2 { background: radial-gradient(circle at 68% 55%, rgba(51,222,255,.22), transparent 30%), linear-gradient(145deg,rgba(6,31,48,.98),rgba(10,61,76,.94)); }
    .scene-2 .copy { position: absolute; left: 92px; top: 148px; width: 620px; display: grid; gap: 20px; }
    .scene-2 .time-badge { position: absolute; right: 100px; top: 72px; }
    .mobility-map { position: absolute; left: 90px; right: 90px; bottom: 70px; height: 520px; border: 1px solid rgba(132,234,255,.19); border-radius: 40px; overflow: hidden; background: linear-gradient(rgba(80,201,230,.08) 1px, transparent 1px), linear-gradient(90deg,rgba(80,201,230,.08) 1px,transparent 1px), rgba(4,20,32,.56); background-size: 56px 56px; transform: perspective(900px) rotateX(13deg) rotateZ(-1deg); transform-origin: bottom; box-shadow: 0 55px 120px rgba(0,0,0,.34); }
    .route { position: absolute; height: 7px; border-radius: 20px; background: linear-gradient(90deg,transparent,${input.accentColor},#60e7ff); box-shadow: 0 0 24px rgba(83,225,255,.38); transform-origin: left; }
    .route.r1 { left: 80px; top: 300px; width: 1000px; transform: rotate(-9deg); } .route.r2 { left: 390px; top: 120px; width: 790px; transform: rotate(18deg); } .route.r3 { left: 760px; top: 370px; width: 600px; transform: rotate(-24deg); }
    .station { position: absolute; width: 22px; height: 22px; border: 5px solid #d7fbff; border-radius: 50%; background: #0b6075; box-shadow: 0 0 28px #61e9ff; }
    .station.s1 { left: 200px; top: 250px; } .station.s2 { left: 630px; top: 205px; } .station.s3 { left: 1060px; top: 305px; } .station.s4 { left: 1360px; top: 116px; }
    .mobility-kpis { position: absolute; right: 112px; top: 188px; display: flex; gap: 18px; z-index: 6; }
    .mobility-kpis .glass-card { min-width: 220px; padding: 24px; }
    .scene-3 { background: radial-gradient(circle at 24% 58%, rgba(255,178,62,.22), transparent 30%), linear-gradient(130deg,#251b15,#172a36 54%,#0a1927); }
    .factory-lines { position: absolute; inset: 270px 80px 70px; display: flex; align-items: end; gap: 34px; }
    .machine { position: relative; flex: 1; min-height: 270px; border: 1px solid rgba(255,255,255,.14); border-radius: 30px 30px 8px 8px; background: linear-gradient(145deg,rgba(255,255,255,.12),rgba(255,255,255,.025)); box-shadow: inset 0 1px rgba(255,255,255,.18),0 38px 90px rgba(0,0,0,.24); transform-origin: center bottom; }
    .machine::before { content: ""; position: absolute; left: 30px; right: 30px; top: 32px; height: 9px; border-radius: 20px; background: rgba(255,255,255,.1); box-shadow: 0 42px rgba(255,255,255,.07),0 84px rgba(255,255,255,.07); }
    .machine i { position: absolute; left: 30px; right: 30px; bottom: 30px; height: 12px; border-radius: 30px; background: #192430; overflow: hidden; }
    .machine i::after { content: ""; display: block; width: var(--fill); height: 100%; border-radius: inherit; background: linear-gradient(90deg,#ffad45,${input.accentColor}); box-shadow: 0 0 22px ${input.accentColor}; transform-origin: left; }
    .scene-3 .header, .scene-4 .header, .scene-5 .header { position: absolute; left: 90px; right: 90px; top: 112px; display: flex; align-items: start; justify-content: space-between; }
    .scene-3 .header-copy, .scene-4 .header-copy, .scene-5 .header-copy { display: grid; gap: 14px; }
    .factory-card { position: absolute; right: 110px; bottom: 100px; z-index: 7; width: 430px; padding: 30px; }
    .scene-4 { background: radial-gradient(circle at 70% 50%,rgba(44,255,177,.2),transparent 28%), linear-gradient(138deg,#061d22,#0a3639 56%,#09252c); }
    .energy-layout { position: absolute; inset: 300px 90px 70px; display: grid; grid-template-columns: 1.12fr .88fr; gap: 34px; }
    .energy-ring { position: relative; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.14); border-radius: 38px; background: rgba(2,21,27,.48); }
    .energy-ring svg { width: 410px; height: 410px; transform: rotate(-90deg); }
    .energy-ring circle { fill: none; stroke-width: 25; }
    .energy-ring .base { stroke: rgba(255,255,255,.09); } .energy-ring .value { stroke: ${input.accentColor}; stroke-linecap: round; stroke-dasharray: 942; stroke-dashoffset: 220; filter: drop-shadow(0 0 16px ${input.accentColor}); }
    .energy-ring .ring-copy { position: absolute; text-align: center; } .energy-ring .ring-copy b { display: block; font-size: 82px; } .energy-ring .ring-copy span { color: rgba(255,255,255,.58); font-size: 20px; }
    .energy-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .energy-cards .glass-card { padding: 30px; }
    .scene-5 { background: radial-gradient(circle at 50% 50%,rgba(137,91,255,.2),transparent 30%), linear-gradient(140deg,#090e2b,#181148 55%,#071a32); }
    .city-map { position: absolute; left: 82px; bottom: 55px; width: 1120px; height: 650px; opacity: .92; }
    .city-map .district { fill: rgba(112,142,210,.08); stroke: rgba(157,186,255,.22); stroke-width: 3; }
    .city-map .map-route { fill: none; stroke: ${input.accentColor}; stroke-width: 8; stroke-linecap: round; stroke-dasharray: 22 18; filter: drop-shadow(0 0 12px ${input.accentColor}); }
    .city-map .map-node { fill: #fff; stroke: ${input.accentColor}; stroke-width: 9; filter: drop-shadow(0 0 16px ${input.accentColor}); }
    .safety-card { position: absolute; right: 90px; bottom: 104px; width: 520px; padding: 34px; }
    .safety-card .response { display: flex; justify-content: space-between; align-items: end; margin-top: 28px; padding-top: 25px; border-top: 1px solid rgba(255,255,255,.12); }
    .safety-card .response b { font-size: 70px; color: ${input.accentColor}; } .safety-card .response span { padding-bottom: 9px; color: rgba(255,255,255,.6); font-size: 18px; }
    .scene-6 { background: radial-gradient(circle at 50% 42%,rgba(70,224,255,.28),transparent 25%), linear-gradient(140deg,#07121e,#15394b 50%,#0d2235); }
    .finale { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 27px; text-align: center; }
    .finale .display { max-width: 1500px; font-size: 96px; }
    .finale-grid { display: flex; gap: 16px; margin-top: 35px; }
    .finale-grid span { padding: 15px 22px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; color: rgba(240,249,255,.76); background: rgba(255,255,255,.055); font-size: 18px; }
    .signature { position: absolute; right: 62px; bottom: 42px; z-index: 31; color: rgba(255,255,255,.45); font-size: 16px; font-weight: 700; letter-spacing: .15em; }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="${id}" data-start="0" data-width="1920" data-height="1080">
    ${background}
    <section id="story-scene-1" ${sceneAttrs(0)}>
      <div class="grain"></div><div class="scene-content">
        <div class="top-label">URBAN INTELLIGENCE / 01</div>
        <div class="opening-copy">
          <div class="eyebrow reveal">${escapeHtml(input.kicker)}</div>
          <h1 class="display reveal">${escapeHtml(input.title)}</h1>
          <p class="lead reveal">${escapeHtml(input.subtitle)}</p>
        </div>
        <div class="pulse-orb"></div><i class="orbit-dot a"></i><i class="orbit-dot b"></i><i class="orbit-dot c"></i>
      </div>
    </section>
    <section id="story-scene-2" ${sceneAttrs(1)}>
      <div class="grain"></div><div class="scene-content">
        <div class="top-label">MOBILITY / 02</div>
        <div class="copy"><div class="eyebrow reveal">城市交通脉搏</div><h2 class="scene-title reveal">早高峰，不再靠等待</h2><p class="scene-copy reveal">客流、道路和公共运力在同一张实时网络里协同。</p></div>
        <div class="time-badge reveal"><span>AM</span><b>07:30</b></div>
        <div class="mobility-kpis">
          <div class="glass-card metric-card"><div class="card-label">平均通勤</div><div class="card-value">-18%</div><div class="card-delta">全网动态优化</div></div>
          <div class="glass-card metric-card"><div class="card-label">准点率</div><div class="card-value">96.4%</div><div class="card-delta">+7.2% 今日</div></div>
        </div>
        <div class="mobility-map"><i class="route r1"></i><i class="route r2"></i><i class="route r3"></i><i class="station s1"></i><i class="station s2"></i><i class="station s3"></i><i class="station s4"></i></div>
      </div>
    </section>
    <section id="story-scene-3" ${sceneAttrs(2)}>
      <div class="grain"></div><div class="scene-content">
        <div class="top-label">SMART MANUFACTURING / 03</div>
        <div class="header"><div class="header-copy"><div class="eyebrow reveal">智能制造</div><h2 class="scene-title reveal">每一台设备，都在提前思考</h2></div><div class="time-badge reveal"><span>AM</span><b>10:00</b></div></div>
        <div class="factory-lines"><div class="machine metric-card"><i style="--fill:88%"></i></div><div class="machine metric-card" style="min-height:340px"><i style="--fill:96%"></i></div><div class="machine metric-card"><i style="--fill:81%"></i></div><div class="machine metric-card" style="min-height:390px"><i style="--fill:92%"></i></div></div>
        <div class="glass-card factory-card metric-card"><div class="status-pill"><i></i>产线运行稳定</div><div class="card-value">99.2%</div><div class="card-label">预测性维护覆盖率</div></div>
      </div>
    </section>
    <section id="story-scene-4" ${sceneAttrs(3)}>
      <div class="grain"></div><div class="scene-content">
        <div class="top-label">GREEN ENERGY / 04</div>
        <div class="header"><div class="header-copy"><div class="eyebrow reveal">城市能源中枢</div><h2 class="scene-title reveal">让每一度电，去最需要的地方</h2></div><div class="time-badge reveal"><span>PM</span><b>14:00</b></div></div>
        <div class="energy-layout">
          <div class="energy-ring metric-card"><svg viewBox="0 0 360 360"><circle class="base" cx="180" cy="180" r="150"/><circle class="value" cx="180" cy="180" r="150"/></svg><div class="ring-copy"><b>76%</b><span>清洁能源占比</span></div></div>
          <div class="energy-cards"><div class="glass-card metric-card"><div class="card-label">光伏供能</div><div class="card-value">428 MW</div><div class="card-delta">峰值稳定</div></div><div class="glass-card metric-card"><div class="card-label">储能余量</div><div class="card-value">82%</div><div class="card-delta">可调度</div></div><div class="glass-card metric-card"><div class="card-label">今日减排</div><div class="card-value">1,204t</div><div class="card-delta">持续增长</div></div><div class="glass-card metric-card"><div class="card-label">电网健康</div><div class="card-value">优秀</div><div class="card-delta">零重大告警</div></div></div>
        </div>
      </div>
    </section>
    <section id="story-scene-5" ${sceneAttrs(4)}>
      <div class="grain"></div><div class="scene-content">
        <div class="top-label">PUBLIC SAFETY / 05</div>
        <div class="header"><div class="header-copy"><div class="eyebrow reveal">城市安全网络</div><h2 class="scene-title reveal">风险出现之前，响应已经开始</h2></div><div class="time-badge reveal"><span>PM</span><b>20:30</b></div></div>
        <svg class="city-map" viewBox="0 0 1120 650"><path class="district" d="M80 120 L350 54 L500 180 L420 370 L160 430 L54 290 Z"/><path class="district" d="M510 74 L820 52 L1040 210 L890 400 L620 330 L500 180 Z"/><path class="district" d="M160 430 L420 370 L650 590 L260 610 Z"/><path class="district" d="M620 330 L890 400 L1010 590 L650 590 Z"/><path class="map-route" d="M122 270 C300 150 420 310 560 250 S810 160 975 330 S760 535 595 455 S300 520 210 420"/><circle class="map-node" cx="122" cy="270" r="14"/><circle class="map-node" cx="560" cy="250" r="14"/><circle class="map-node" cx="975" cy="330" r="14"/><circle class="map-node" cx="595" cy="455" r="14"/></svg>
        <div class="glass-card safety-card metric-card"><div class="status-pill"><i></i>协同处置完成</div><div class="card-value">多部门实时联动</div><div class="card-label">感知、判断、调度形成同一条决策链</div><div class="response"><b>42s</b><span>平均响应时间</span></div></div>
      </div>
    </section>
    <section id="story-scene-6" ${sceneAttrs(5)}>
      <div class="grain"></div><div class="scene-content finale">
        <div class="eyebrow reveal">CITY PULSE · ALWAYS ON</div>
        <h2 class="display reveal">每一次决策，都提前发生</h2>
        <p class="lead reveal">交通、产业、能源与安全，共同组成一座会思考的城市。</p>
        <div class="finale-grid reveal"><span>城市交通</span><span>智能制造</span><span>绿色能源</span><span>公共安全</span></div>
      </div>
    </section>
    <div class="speed-lines"><i class="speed-line"></i><i class="speed-line"></i><i class="speed-line"></i><i class="speed-line"></i><i class="speed-line"></i></div>
    <div class="transition-blades"><i class="transition-blade"></i><i class="transition-blade"></i><i class="transition-blade"></i><i class="transition-blade"></i></div>
    <div class="impact-flash"></div>
    <div class="cinematic-vignette"></div>
    <div class="signature">HYPERFRAMES × VIDEO AGENT HARNESS</div>
  </div>
  <script>
    var tl = gsap.timeline({ paused: true });
    gsap.set(".story-scene", { opacity: 0 });
    gsap.set("#story-scene-1", { opacity: 1 });
    gsap.set(".transition-blade, .speed-line, .impact-flash", { opacity: 0 });
    ${starts.map((start, index) => {
      const direction = index % 2 === 0 ? 1 : -1;
      const driftEnd = Math.max(start + 1.15, (starts[index + 1] ?? duration) - 0.24);
      return `
    tl.fromTo("#story-scene-${index + 1}", { opacity: ${index === 0 ? 1 : 0}, x: ${direction * 170}, y: ${index % 3 === 0 ? 70 : -42}, scale: 1.16, rotation: ${direction * 1.7}, clipPath: "inset(0 ${direction > 0 ? 0 : 100}% 0 ${direction > 0 ? 100 : 0}%)" }, { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, clipPath: "inset(0 0% 0 0%)", duration: .58, ease: "expo.out", immediateRender: false }, ${Math.max(0, start - 0.08)});
    tl.fromTo("#story-scene-${index + 1} .scene-content", { x: ${direction * -80}, y: 34, scale: 1.13, rotation: ${direction * -.75} }, { x: 0, y: 0, scale: 1, rotation: 0, duration: 1.05, ease: "power4.out", immediateRender: false }, ${start});
    tl.to("#story-scene-${index + 1} .scene-content", { x: ${direction * 34}, y: -18, scale: 1.055, duration: ${Number((driftEnd - start - 1.06).toFixed(3))}, ease: "none" }, ${Number((start + 1.06).toFixed(3))});
    tl.fromTo("#story-scene-${index + 1} .reveal", { opacity: 0, x: ${direction * 64}, y: 34, skewX: ${direction * -5} }, { opacity: 1, x: 0, y: 0, skewX: 0, duration: .58, stagger: .085, ease: "power3.out", immediateRender: false }, ${Number((start + 0.16).toFixed(3))});
    tl.fromTo("#story-scene-${index + 1} .metric-card", { opacity: 0, y: 74, scale: .88, rotationX: -12 }, { opacity: 1, y: 0, scale: 1, rotationX: 0, duration: .54, stagger: .075, ease: "back.out(1.45)", immediateRender: false }, ${Number((start + 0.42).toFixed(3))});
    ${index > 0 ? `tl.fromTo(".transition-blade", { xPercent: -135, opacity: 0 }, { xPercent: 135, opacity: .92, duration: .48, stagger: .035, ease: "power4.inOut", immediateRender: false }, ${Number((start - 0.22).toFixed(3))});
    tl.fromTo(".impact-flash", { opacity: 0 }, { opacity: .85, duration: .09, repeat: 1, yoyo: true, ease: "power4.out", immediateRender: false }, ${Number((start - 0.01).toFixed(3))});` : ""}
    tl.fromTo(".speed-line", { xPercent: -30, opacity: 0 }, { xPercent: 470, opacity: .72, duration: .54, stagger: .035, ease: "power4.in", immediateRender: false }, ${Number((start + 0.02).toFixed(3))});
    ${index < starts.length - 1 ? `tl.to("#story-scene-${index + 1}", { opacity: 0, x: ${direction * -105}, scale: 1.12, rotation: ${direction * -1.2}, duration: .34, ease: "power3.in" }, ${fadeOutAt(index)});` : ""}`;
    }).join("")}
    tl.fromTo(".scene-1 .pulse-orb", { scale: .72, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.4, ease: "power3.out" }, .3);
    tl.to(".scene-1 .pulse-orb", { rotation: 155, scale: 1.08, duration: ${Number((starts[1]! - 1.75).toFixed(3))}, ease: "none" }, 1.7);
    tl.fromTo(".orbit-dot", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: .5, stagger: .16, ease: "back.out(1.8)" }, .8);
    tl.to(".orbit-dot.a", { x: 150, y: 85, duration: 1.65, ease: "power1.inOut" }, 1.15);
    tl.to(".orbit-dot.b", { x: -180, y: -120, duration: 1.8, ease: "power1.inOut" }, 1.05);
    tl.fromTo(".scene-2 .route", { scaleX: 0 }, { scaleX: 1, duration: 1.3, stagger: .16, ease: "power2.out" }, ${Number((starts[1]! + 0.62).toFixed(3))});
    tl.fromTo(".scene-2 .station", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: .42, stagger: .12, ease: "back.out(2)" }, ${Number((starts[1]! + 1.05).toFixed(3))});
    tl.fromTo(".mobility-map", { y: 190, rotationX: 34, scale: .86 }, { y: 0, rotationX: 13, scale: 1, duration: 1.15, ease: "power3.out" }, ${Number((starts[1]! + 0.25).toFixed(3))});
    tl.fromTo(".machine", { y: 300, rotationY: -18, scale: .8 }, { y: 0, rotationY: 0, scale: 1, duration: .85, stagger: .1, ease: "back.out(1.35)" }, ${Number((starts[2]! + 0.34).toFixed(3))});
    tl.fromTo(".machine i", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 1.1, stagger: .12, ease: "power2.out" }, ${Number((starts[2]! + 0.75).toFixed(3))});
    tl.to(".machine", { y: -26, stagger: .09, duration: .7, repeat: 1, yoyo: true, ease: "sine.inOut" }, ${Number((starts[2]! + 2.0).toFixed(3))});
    tl.fromTo(".energy-ring .value", { strokeDashoffset: 942 }, { strokeDashoffset: 220, duration: 1.45, ease: "power2.out" }, ${Number((starts[3]! + 0.55).toFixed(3))});
    tl.fromTo(".energy-ring", { rotationY: -22, scale: .82 }, { rotationY: 0, scale: 1, duration: 1.1, ease: "power3.out" }, ${Number((starts[3]! + 0.25).toFixed(3))});
    tl.to(".energy-ring svg", { rotation: 272, duration: 2.7, ease: "none" }, ${Number((starts[3]! + 0.52).toFixed(3))});
    tl.fromTo(".city-map .map-route", { strokeDashoffset: 900 }, { strokeDashoffset: 0, duration: 1.55, ease: "power2.out" }, ${Number((starts[4]! + 0.55).toFixed(3))});
    tl.fromTo(".city-map .map-node", { scale: 0, transformOrigin: "center" }, { scale: 1, duration: .45, stagger: .14, ease: "back.out(2)" }, ${Number((starts[4]! + 1.0).toFixed(3))});
    tl.fromTo(".city-map", { scale: 1.28, rotation: -4, x: -140, y: 80 }, { scale: 1, rotation: 0, x: 0, y: 0, duration: 1.2, ease: "power4.out" }, ${Number((starts[4]! + 0.15).toFixed(3))});
    tl.fromTo(".finale-grid span", { opacity: 0, scale: .55, y: 35 }, { opacity: 1, scale: 1, y: 0, duration: .45, stagger: .1, ease: "back.out(1.8)" }, ${Number((starts[5]! + 0.72).toFixed(3))});
    ${input.backgroundVideoUrl ? `tl.to("#story-background", { scale: 1.18, x: -42, y: -20, duration: ${duration}, ease: "none" }, 0);` : ""}
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
