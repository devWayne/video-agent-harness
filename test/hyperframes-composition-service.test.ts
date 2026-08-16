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

  it("rejects non-HTTPS media sources", async () => {
    await expect(
      new HyperframesCompositionService().createPreview({
        title: "Unsafe media",
        backgroundVideoUrl: "http://example.com/video.mp4",
      }),
    ).rejects.toThrow("Media URLs must use HTTPS");
  });
});
