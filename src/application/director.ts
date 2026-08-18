import type { Agent, AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { CreateVideoJobInput, VideoPlan } from "../domain/video-job.js";

export interface Director {
  createPlan(input: CreateVideoJobInput, signal?: AbortSignal): Promise<VideoPlan>;
}

export class DeterministicDirector implements Director {
  async createPlan(input: CreateVideoJobInput): Promise<VideoPlan> {
    const shotCount = Math.ceil(input.durationSeconds / 10);
    const baseDuration = Math.floor(input.durationSeconds / shotCount);
    const extraSeconds = input.durationSeconds % shotCount;
    const shots = Array.from({ length: shotCount }, (_, index) => {
      const durationSeconds = baseDuration + (index < extraSeconds ? 1 : 0);
      return {
        id: `shot-${String(index + 1).padStart(2, "0")}`,
        index,
        durationSeconds,
        prompt: [
          input.brief,
          `镜头 ${index + 1}/${shotCount}，时长 ${durationSeconds} 秒。`,
          "16:9 横屏，电影级构图，主体和美术风格与前后镜头一致，运动自然，避免文字与水印。",
        ].join(" "),
      };
    });

    return {
      title: input.brief.slice(0, 80),
      creativeDirection: "连贯、克制、生产级横屏短片",
      shots,
    };
  }
}

const submitPlanParameters = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 100 }),
  creativeDirection: Type.String({ minLength: 1, maxLength: 500 }),
  shots: Type.Array(
    Type.Object({
      prompt: Type.String({ minLength: 3, maxLength: 4_000 }),
      durationSeconds: Type.Integer({ minimum: 5, maximum: 15 }),
    }),
    { minItems: 1, maxItems: 12 },
  ),
});

export type PiPlanningAgentFactory = (tools: AgentTool[]) => Agent;

export class PiDirector implements Director {
  constructor(
    private readonly createAgent: PiPlanningAgentFactory,
    private readonly maximumShotDurationSeconds = 15,
  ) {}

  async createPlan(input: CreateVideoJobInput, signal?: AbortSignal): Promise<VideoPlan> {
    let submittedPlan: VideoPlan | undefined;
    const submitPlanTool: AgentTool<typeof submitPlanParameters> = {
      name: "submit_video_plan",
      label: "提交视频分镜",
      description: "提交最终的视频创意方向和逐镜头生成计划。所有时长之和必须等于目标总时长。",
      parameters: submitPlanParameters,
      executionMode: "sequential",
      execute: async (_toolCallId, parameters) => {
        const totalDuration = parameters.shots.reduce(
          (total, shot) => total + shot.durationSeconds,
          0,
        );
        if (totalDuration !== input.durationSeconds) {
          throw new Error(
            `Shot durations total ${totalDuration}s, expected ${input.durationSeconds}s`,
          );
        }
        const overlong = parameters.shots.find(
          (shot) => shot.durationSeconds > this.maximumShotDurationSeconds,
        );
        if (overlong) {
          throw new Error(
            `Shot duration ${overlong.durationSeconds}s exceeds the active recipe maximum of ${this.maximumShotDurationSeconds}s`,
          );
        }

        submittedPlan = {
          title: parameters.title,
          creativeDirection: parameters.creativeDirection,
          shots: parameters.shots.map((shot, index) => ({
            id: `shot-${String(index + 1).padStart(2, "0")}`,
            index,
            prompt: shot.prompt,
            durationSeconds: shot.durationSeconds,
          })),
        };

        return {
          content: [{ type: "text", text: "视频计划已通过结构校验并提交。" }],
          details: { shotCount: parameters.shots.length, totalDuration },
          terminate: true,
        };
      },
    };

    const agent = this.createAgent([submitPlanTool]);
    if (signal) signal.addEventListener("abort", () => agent.abort(), { once: true });
    await agent.prompt(buildDirectorPrompt(input, this.maximumShotDurationSeconds));
    if (!submittedPlan) throw new Error("Pi Director finished without submitting a video plan");
    return submittedPlan;
  }
}

function buildDirectorPrompt(
  input: CreateVideoJobInput,
  maximumShotDurationSeconds: number,
): string {
  return [
    "请把下面的创作需求规划为可直接用于视频生成模型的分镜。",
    `创作 Brief：${input.brief}`,
    `总时长：${input.durationSeconds} 秒`,
    "画幅：16:9 横屏",
    "最终交付：3840×2160；生成素材按 1080P 设计。",
    `参考素材：${input.references.length} 个`,
    `要求：角色、场景、美术和光线连续；单镜头 5–${maximumShotDurationSeconds} 秒；不要在画面中生成字幕或水印。`,
    "必须调用 submit_video_plan 工具提交最终方案，不要只输出自然语言。",
  ].join("\n");
}
