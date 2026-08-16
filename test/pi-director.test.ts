import type { Agent } from "@earendil-works/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { PiDirector } from "../src/application/director.js";

describe("PiDirector", () => {
  it("turns a Pi tool call into a validated 16:9 production plan", async () => {
    const abort = vi.fn();
    const prompt = vi.fn();
    const director = new PiDirector((tools) => {
      prompt.mockImplementation(async (message: string) => {
        expect(message).toContain("画幅：16:9 横屏");
        expect(message).toContain("最终交付：3840×2160");
        await tools[0]!.execute("tool-call-1", {
          title: "城市苏醒",
          creativeDirection: "冷色清晨逐渐转为暖色日出",
          shots: [
            { prompt: "城市天际线在蓝调清晨中苏醒，缓慢推进", durationSeconds: 5 },
            { prompt: "阳光穿过街道，人物向镜头方向自然行走", durationSeconds: 10 },
          ],
        });
      });
      return { prompt, abort } as unknown as Agent;
    });

    await expect(
      director.createPlan({
        brief: "制作一条电影感城市品牌短片",
        durationSeconds: 15,
        aspectRatio: "16:9",
        outputResolution: "3840x2160",
        references: [],
      }),
    ).resolves.toMatchObject({
      title: "城市苏醒",
      shots: [
        { id: "shot-01", index: 0, durationSeconds: 5 },
        { id: "shot-02", index: 1, durationSeconds: 10 },
      ],
    });
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("rejects a tool plan whose shot durations do not equal the requested duration", async () => {
    const director = new PiDirector((tools) =>
      ({
        abort: vi.fn(),
        prompt: async () => {
          await tools[0]!.execute("tool-call-1", {
            title: "无效计划",
            creativeDirection: "测试",
            shots: [{ prompt: "一个过短的镜头计划", durationSeconds: 5 }],
          });
        },
      }) as unknown as Agent,
    );

    await expect(
      director.createPlan({
        brief: "制作一条 10 秒横屏短片",
        durationSeconds: 10,
        aspectRatio: "16:9",
        outputResolution: "3840x2160",
        references: [],
      }),
    ).rejects.toThrow("Shot durations total 5s, expected 10s");
  });
});
