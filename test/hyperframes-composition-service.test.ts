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

  it("rejects non-HTTPS media sources", async () => {
    await expect(
      new HyperframesCompositionService().createPreview({
        title: "Unsafe media",
        backgroundVideoUrl: "http://example.com/video.mp4",
      }),
    ).rejects.toThrow("Media URLs must use HTTPS");
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
