import { describe, expect, it, vi } from "vitest";
import { BailianWanProvider } from "../src/providers/bailian-wan-provider.js";

describe("BailianWanProvider", () => {
  it("submits a Wan 3.0 asynchronous 16:9 1080P task", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ output: { task_id: "task-123", task_status: "PENDING" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new BailianWanProvider({
      baseUrl: "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/",
      apiKey: "secret-for-test",
      model: "wan3.0-video",
      fetch: fetchMock,
    });

    const task = await provider.submit({
      clientRequestId: "job-1/shot-1/candidate-1",
      prompt: "电影感城市夜景",
      durationSeconds: 5,
      resolution: "1080P",
      ratio: "16:9",
      generateAudio: true,
      referenceUrls: [],
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
      model: "wan3.0-video",
      input: { prompt: "电影感城市夜景" },
      parameters: { resolution: "1080P", ratio: "16:9", duration: 5, audio: true },
    });
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
