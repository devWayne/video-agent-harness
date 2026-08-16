import { describe, expect, it, vi } from "vitest";
import { BailianWanProvider } from "../src/providers/bailian-wan-provider.js";

describe("BailianWanProvider", () => {
  it("submits a documented Wan 2.7 asynchronous 16:9 1080P task", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ output: { task_id: "task-123", task_status: "PENDING" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new BailianWanProvider({
      baseUrl: "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/",
      apiKey: "secret-for-test",
      model: "wan2.7-t2v",
      fetch: fetchMock,
    });

    const task = await provider.submit({
      clientRequestId: "job-1/shot-1/candidate-1",
      prompt: "电影感城市夜景",
      durationSeconds: 5,
      resolution: "1080P",
      ratio: "16:9",
      generateAudio: true,
      references: [
        { type: "audio", url: "https://assets.example.invalid/narration.mp3" },
      ],
    });

    expect(task).toEqual({ provider: "bailian-wan", taskId: "task-123", status: "submitted" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
    );
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer secret-for-test",
      "X-DashScope-Async": "enable",
    });
    expect(typeof init?.body).toBe("string");
    expect(JSON.parse(init!.body as string)).toEqual({
      model: "wan2.7-t2v",
      input: {
        prompt: "电影感城市夜景",
        audio_url: "https://assets.example.invalid/narration.mp3",
      },
      parameters: { resolution: "1080P", ratio: "16:9", duration: 5 },
    });
  });

  it("rejects an image reference instead of sending an invalid T2V request", async () => {
    const provider = new BailianWanProvider({
      baseUrl: "https://workspace.example/api/v1",
      apiKey: "secret-for-test",
      model: "wan2.7-t2v",
      fetch: vi.fn(),
    });

    await expect(
      provider.submit({
        clientRequestId: "job-1/shot-1/candidate-1",
        prompt: "电影感城市夜景",
        durationSeconds: 5,
        resolution: "1080P",
        ratio: "16:9",
        generateAudio: true,
        references: [{ type: "image", url: "https://assets.example.invalid/frame.png" }],
      }),
    ).rejects.toMatchObject({ code: "WAN_T2V_REFERENCE_TYPE_NOT_SUPPORTED" });
  });

  it("rejects unverified duration and resolution values before submission", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new BailianWanProvider({
      baseUrl: "https://workspace.example/api/v1",
      apiKey: "secret-for-test",
      model: "wan2.7-t2v",
      fetch: fetchMock,
    });
    const baseRequest = {
      clientRequestId: "job-1/shot-1/candidate-1",
      prompt: "Production shot",
      ratio: "16:9" as const,
      generateAudio: true,
      references: [],
    };

    await expect(
      provider.submit({ ...baseRequest, durationSeconds: 16, resolution: "1080P" }),
    ).rejects.toMatchObject({ code: "WAN_T2V_DURATION_NOT_SUPPORTED" });
    await expect(
      provider.submit({ ...baseRequest, durationSeconds: 5, resolution: "480P" }),
    ).rejects.toMatchObject({ code: "WAN_T2V_RESOLUTION_NOT_SUPPORTED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes a successful task result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: {
            task_id: "task-123",
            task_status: "SUCCEEDED",
            video_url: "https://example.invalid/video.mp4",
          },
        }),
        { status: 200 },
      ),
    );
    const provider = new BailianWanProvider({
      baseUrl: "https://workspace.example/api/v1",
      apiKey: "secret-for-test",
      fetch: fetchMock,
    });

    await expect(provider.getTask("task-123")).resolves.toEqual({
      provider: "bailian-wan",
      taskId: "task-123",
      status: "succeeded",
      outputUrl: "https://example.invalid/video.mp4",
    });
  });
});
