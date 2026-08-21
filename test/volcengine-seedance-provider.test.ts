import { describe, expect, it, vi } from "vitest";
import { VolcengineSeedanceProvider } from "../src/providers/volcengine-seedance-provider.js";

describe("VolcengineSeedanceProvider", () => {
  it("submits a Seedance 2.5 task with multimodal references", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "cgt-20260822-abc" }), { status: 200 }),
    );
    const provider = createProvider(fetchMock);

    await expect(
      provider.submit({
        clientRequestId: "job-1/shot-1/candidate-1",
        prompt: "一镜到底的产品广告",
        durationSeconds: 12,
        resolution: "720P",
        ratio: "16:9",
        generateAudio: true,
        references: [
          {
            type: "image",
            url: "https://assets.example.invalid/start.png",
            purpose: "first-frame",
          },
          { type: "image", url: "https://assets.example.invalid/product.png" },
          { type: "video", url: "https://assets.example.invalid/motion.mp4" },
          { type: "audio", url: "https://assets.example.invalid/music.mp3" },
        ],
      }),
    ).resolves.toEqual({
      provider: "volcengine-seedance",
      taskId: "cgt-20260822-abc",
      status: "submitted",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer secret-for-test",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      model: "doubao-seedance-2-5-260628",
      content: [
        { type: "text", text: "一镜到底的产品广告" },
        {
          type: "image_url",
          image_url: { url: "https://assets.example.invalid/start.png" },
          role: "first_frame",
        },
        {
          type: "image_url",
          image_url: { url: "https://assets.example.invalid/product.png" },
          role: "reference_image",
        },
        {
          type: "video_url",
          video_url: { url: "https://assets.example.invalid/motion.mp4" },
          role: "reference_video",
        },
        {
          type: "audio_url",
          audio_url: { url: "https://assets.example.invalid/music.mp3" },
          role: "reference_audio",
        },
      ],
      generate_audio: true,
      resolution: "720p",
      ratio: "16:9",
      duration: 12,
      watermark: false,
    });
  });

  it("rejects an unverified model, duration, resolution, and duplicate frame roles", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const baseRequest = {
      clientRequestId: "job-1/shot-1/candidate-1",
      prompt: "Production shot",
      durationSeconds: 5,
      resolution: "720P" as const,
      ratio: "16:9" as const,
      generateAudio: true,
      references: [],
    };

    await expect(
      createProvider(fetchMock, { model: "doubao-seedance-2-0-260128" }).submit(baseRequest),
    ).rejects.toMatchObject({ code: "SEEDANCE_MODEL_PROFILE_NOT_VERIFIED" });
    await expect(
      createProvider(fetchMock).submit({ ...baseRequest, durationSeconds: 31 }),
    ).rejects.toMatchObject({ code: "SEEDANCE_DURATION_NOT_SUPPORTED" });
    await expect(
      createProvider(fetchMock).submit({ ...baseRequest, resolution: "1080P" }),
    ).rejects.toMatchObject({ code: "SEEDANCE_RESOLUTION_NOT_SUPPORTED" });
    await expect(
      createProvider(fetchMock).submit({
        ...baseRequest,
        references: [
          { type: "image", url: "https://assets.example.invalid/one.png", purpose: "first_frame" },
          { type: "image", url: "https://assets.example.invalid/two.png", purpose: "first frame" },
        ],
      }),
    ).rejects.toMatchObject({ code: "SEEDANCE_TOO_MANY_FIRST_FRAMES" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes queued, successful, failed, and expired task results", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: "cgt-1", status: "queued" }))
      .mockResolvedValueOnce(
        response({
          id: "cgt-1",
          status: "succeeded",
          content: {
            video_url:
              "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/result.mp4?signature=secret",
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          id: "cgt-2",
          status: "failed",
          error: { code: "OutputVideoSensitiveContentDetected", message: "Sensitive output" },
        }),
      )
      .mockResolvedValueOnce(response({ id: "cgt-3", status: "expired" }));
    const provider = createProvider(fetchMock);

    await expect(provider.getTask("cgt-1")).resolves.toMatchObject({ status: "submitted" });
    await expect(provider.getTask("cgt-1")).resolves.toMatchObject({
      status: "succeeded",
      outputUrl:
        "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/result.mp4?signature=secret",
    });
    await expect(provider.getTask("cgt-2")).resolves.toMatchObject({
      status: "failed",
      errorCode: "OutputVideoSensitiveContentDetected",
      errorMessage: "Sensitive output",
    });
    await expect(provider.getTask("cgt-3")).resolves.toMatchObject({
      status: "failed",
      errorCode: "VOLCENGINE_TASK_EXPIRED",
    });
  });

  it("normalizes retryable HTTP errors and can cancel a task", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: "QuotaExceeded", message: "Queue is full" } }),
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = createProvider(fetchMock);

    await expect(provider.getTask("cgt-busy")).rejects.toMatchObject({
      code: "QuotaExceeded",
      message: "Queue is full",
      retryable: true,
    });
    await expect(provider.cancel("cgt-queued")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/cgt-queued",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });
});

function createProvider(
  fetchMock: typeof fetch,
  overrides: { model?: string } = {},
): VolcengineSeedanceProvider {
  return new VolcengineSeedanceProvider({
    apiKey: "secret-for-test",
    fetch: fetchMock,
    ...overrides,
  });
}

function response(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}
