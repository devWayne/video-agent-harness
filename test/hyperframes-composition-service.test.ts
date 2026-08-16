import { describe, expect, it } from "vitest";
import {
  HyperframesCompositionService,
  compileCompositionHtml,
} from "../src/application/hyperframes-composition-service.js";

describe("HyperframesCompositionService", () => {
  it("compiles a landscape composition that passes the official linter", async () => {
    const service = new HyperframesCompositionService();
    const preview = await service.createPreview({
      title: "杭州，向未来生长",
      subtitle: "科技、人文与城市理想，在此刻交汇",
      kicker: "CITY OF TOMORROW",
      backgroundVideoUrl: "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/hangzhou.mp4",
      durationSeconds: 8,
      theme: "violet",
      motion: "fade-up",
      accentColor: "#8b7cff",
    });

    expect(preview).toMatchObject({
      previewUrl: `/compositions/previews/${preview.id}.html`,
      durationSeconds: 8,
      width: 1920,
      height: 1080,
      engine: "hyperframes",
      template: "title-card",
      lint: { warningCount: 0, findings: [] },
    });
    const previewHtml = service.getPreviewHtml(preview.id);
    expect(previewHtml).toContain(`data-composition-id="${preview.id}"`);
    expect(previewHtml).toContain(`window.__timelines["${preview.id}"] = tl`);
    expect(previewHtml).toContain('data-harness-runtime="gsap"');
    expect(previewHtml).toContain('data-harness-runtime="hyperframes"');
    expect(previewHtml?.match(/<script\b/g)).toHaveLength(3);
  });

  it("escapes authored copy instead of exposing arbitrary HTML or scripts", () => {
    const html = compileCompositionHtml("safe-composition", {
      template: "title-card",
      title: "</h1><script>globalThis.pwned=true</script>",
      subtitle: "A & B",
      kicker: "SAFE",
      durationSeconds: 5,
      theme: "cinema",
      motion: "scale-in",
      accentColor: "#ffaa00",
    });

    expect(html).not.toContain("<script>globalThis.pwned=true</script>");
    expect(html).toContain("&lt;/h1&gt;&lt;script&gt;globalThis.pwned=true&lt;/script&gt;");
    expect(html).toContain("A &amp; B");
  });

  it("compiles a six-scene smart-city story with deterministic information graphics", async () => {
    const service = new HyperframesCompositionService();
    const preview = await service.createPreview({
      template: "smart-city-story",
      title: "智慧城市的一天",
      subtitle: "从第一班地铁到夜间城市守护，数据让每一次决策提前发生。",
      kicker: "CITY PULSE",
      durationSeconds: 24,
      accentColor: "#4de2ff",
    });

    expect(preview).toMatchObject({
      template: "smart-city-story",
      durationSeconds: 24,
      lint: { warningCount: 0, findings: [] },
    });
    const html = service.getPreviewHtml(preview.id);
    expect(html).toContain("早高峰，不再靠等待");
    expect(html).toContain("每一台设备，都在提前思考");
    expect(html).toContain("风险出现之前，响应已经开始");
    expect(html?.match(/class="clip story-scene/g)).toHaveLength(6);
  });

  it("places multiple generated video shots on the HyperFrames base track", async () => {
    const service = new HyperframesCompositionService();
    const preview = await service.createPreview({
      template: "smart-city-story",
      title: "智慧城市的一天",
      durationSeconds: 24,
      backgroundClips: [
        {
          videoUrl: "https://assets.example.invalid/shot-01.mp4",
          startSeconds: 0,
          durationSeconds: 8,
          mediaStartSeconds: 1.5,
        },
        {
          videoUrl: "https://assets.example.invalid/shot-02.mp4",
          startSeconds: 8,
          durationSeconds: 7,
        },
      ],
    });

    const html = service.getPreviewHtml(preview.id);
    expect(html?.match(/class="clip story-background"/g)).toHaveLength(2);
    expect(html).toContain('data-start="0" data-duration="8" data-media-start="1.5"');
    expect(html).toContain('data-start="8" data-duration="7" data-media-start="0"');
    expect(html).toContain('data-track-index="0"');
  });

  it("compiles a kinetic character overlay over a generated AI video", async () => {
    const service = new HyperframesCompositionService();
    const preview = await service.createPreview({
      template: "kinetic-character",
      title: "城市正在学会提前思考",
      subtitle: "人物表演由 Wan 生成，信息图形由 HyperFrames 精确编排。",
      kicker: "CITY PULSE",
      durationSeconds: 10,
      backgroundVideoUrl: "https://assets.example.invalid/operator.mp4",
      accentColor: "#4de2ff",
    });

    expect(preview).toMatchObject({
      template: "kinetic-character",
      durationSeconds: 10,
      lint: { warningCount: 0, findings: [] },
    });
    const html = service.getPreviewHtml(preview.id);
    expect(html).toContain("人物表演由 Wan 生成");
    expect(html).toContain("系统已接管 · 实时协同");
    expect(html).toContain('class="clip character-background"');
  });

  it("rejects non-HTTPS media sources", async () => {
    await expect(
      new HyperframesCompositionService().createPreview({
        title: "Unsafe media",
        backgroundVideoUrl: "http://example.com/video.mp4",
      }),
    ).rejects.toThrow("Media URLs must use HTTPS");
  });

  it("rejects a background clip that extends past the composition", async () => {
    await expect(
      new HyperframesCompositionService().createPreview({
        title: "Too long",
        durationSeconds: 8,
        backgroundClips: [
          {
            videoUrl: "https://assets.example.invalid/shot.mp4",
            startSeconds: 6,
            durationSeconds: 3,
          },
        ],
      }),
    ).rejects.toThrow("Background clip must end within the composition duration");
  });

  it("rejects a smart-city story that is too short for six readable scenes", async () => {
    await expect(
      new HyperframesCompositionService().createPreview({
        template: "smart-city-story",
        title: "Too fast",
        durationSeconds: 8,
      }),
    ).rejects.toThrow("Smart-city story duration must be at least 15 seconds");
  });
});
