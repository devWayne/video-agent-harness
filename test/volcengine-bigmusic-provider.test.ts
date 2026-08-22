import { describe, expect, it, vi } from "vitest";
import {
  VolcengineBigMusicProvider,
  defaultCommercialMusicSafetyPrefix,
} from "../src/providers/volcengine-bigmusic-provider.js";

describe("VolcengineBigMusicProvider", () => {
  it("submits and queries a signed v5.0 commercial instrumental task", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          Code: 0,
          Message: "success",
          Result: { TaskID: "music-task-1", PredictedWaitTime: 4 },
          ResponseMetadata: {
            RequestId: "request-submit-1",
            Action: "GenBGMForTime",
            Version: "2024-08-12",
            Service: "imagination",
            Region: "cn-beijing",
            Error: null,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Code: 0,
          Message: "success",
          Result: {
            TaskID: "music-task-1",
            Status: 2,
            Progress: 100,
            FailureReason: null,
            SongDetail: {
              AudioUrl: "https://v1-default.douyinvod.com/generated.wav",
              Duration: 60.01,
              Prompt: "企业科技介绍片",
              TosPath: "tos-bucket/generated.wav",
              StyleInfo: '{"duration":60,"style_tags":{"lang":["Instrumental/Non-vocal"]}}',
            },
          },
          ResponseMetadata: { RequestId: "request-query-1", Error: null },
        }),
      );
    const provider = new VolcengineBigMusicProvider({
      accessKeyId: "test-ak",
      secretAccessKey: "test-sk",
      fetch: fetchMock,
      now: () => new Date("2026-08-22T08:00:00.000Z"),
    });

    await expect(
      provider.submit({
        prompt:
          "现代企业科技介绍片，温暖可信，95 BPM，钢琴、轻电子与柔和弦乐，给旁白留出中频空间。",
        durationSeconds: 60,
        segments: [
          { name: "intro", durationSeconds: 10 },
          { name: "verse", durationSeconds: 35 },
          { name: "outro", durationSeconds: 15 },
        ],
        implicitWatermark: {
          enabled: true,
          contentProducer: "Harmony",
          produceId: "campaign-42",
        },
      }),
    ).resolves.toMatchObject({
      provider: "volcengine-bigmusic",
      model: "BigMusic-v5.0",
      taskId: "music-task-1",
      status: "submitted",
      requestId: "request-submit-1",
      predictedWaitTimeSeconds: 4,
    });

    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!;
    expect(fetchInputUrl(submitUrl)).toBe(
      "https://open.volcengineapi.com/?Action=GenBGMForTime&Version=2024-08-12",
    );
    expect(submitInit?.headers).toMatchObject({
      "content-type": "application/json; charset=utf-8",
      "x-date": "20260822T080000Z",
    });
    const authorization = (submitInit?.headers as Record<string, string>).authorization;
    expect(authorization).toContain(
      "Credential=test-ak/20260822/cn-beijing/imagination/request",
    );
    expect(authorization).not.toContain("test-sk");
    expect(JSON.parse(requestBodyText(submitInit?.body))).toEqual({
      Text: `${defaultCommercialMusicSafetyPrefix}现代企业科技介绍片，温暖可信，95 BPM，钢琴、轻电子与柔和弦乐，给旁白留出中频空间。`,
      Duration: 60,
      EnableInputRewrite: false,
      Version: "v5.0",
      AigcWatermark: false,
      Segments: [
        { Name: "intro", Duration: 10 },
        { Name: "verse", Duration: 35 },
        { Name: "outro", Duration: 15 },
      ],
      ImplicitWaterMark: {
        Enable: true,
        ContentProducer: "Harmony",
        ProduceId: "campaign-42",
      },
    });

    await expect(provider.getTask("music-task-1")).resolves.toMatchObject({
      taskId: "music-task-1",
      status: "succeeded",
      progress: 100,
      audioUrl: "https://v1-default.douyinvod.com/generated.wav",
      durationSeconds: 60.01,
      storagePath: "tos-bucket/generated.wav",
      styleInfo: {
        duration: 60,
        style_tags: { lang: ["Instrumental/Non-vocal"] },
      },
    });
    expect(fetchInputUrl(fetchMock.mock.calls[1]![0])).toBe(
      "https://open.volcengineapi.com/?Action=QuerySong&Version=2024-08-12",
    );
    expect(JSON.parse(requestBodyText(fetchMock.mock.calls[1]![1]?.body))).toEqual({
      TaskID: "music-task-1",
    });
  });

  it("performs a read-only authorization and quota preflight", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        Code: 0,
        Message: "success",
        Result: {
          Data: [
            {
              Stauts: 1,
              StartTime: 1_800_000_000,
              EndTime: 1_900_000_000,
              MusicQuota: 10_000,
              MusicUsed: 26,
              ProductName: "BigMusic",
            },
          ],
        },
        ResponseMetadata: { Error: null },
      }),
    );
    const provider = new VolcengineBigMusicProvider({
      accessKeyId: "test-ak",
      secretAccessKey: "test-sk",
      fetch: fetchMock,
    });

    await expect(provider.preflight()).resolves.toMatchObject([
      {
        productName: "BigMusic",
        authorizationStatus: "production",
        musicQuota: 10_000,
        musicUsed: 26,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(fetchInputUrl(url)).toBe(
      "https://open.volcengineapi.com/?Action=QueryUsage&Version=2024-08-12",
    );
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
  });

  it("accepts an empty quota result for duration-billed accounts", async () => {
    const provider = new VolcengineBigMusicProvider({
      accessKeyId: "test-ak",
      secretAccessKey: "test-sk",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          Code: 0,
          Message: "Success",
          Result: { Data: null },
          ResponseMetadata: { Error: null },
        }),
      ),
    });

    await expect(provider.preflight()).resolves.toEqual([]);
  });

  it("rejects invalid v5.0 segment totals before any paid request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new VolcengineBigMusicProvider({
      accessKeyId: "test-ak",
      secretAccessKey: "test-sk",
      fetch: fetchMock,
    });

    await expect(
      provider.submit({
        prompt: "企业介绍片背景音乐",
        segments: [{ name: "intro", durationSeconds: 20 }],
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes provider copyright rejection as a terminal error", async () => {
    const provider = new VolcengineBigMusicProvider({
      accessKeyId: "test-ak",
      secretAccessKey: "test-sk",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          Code: 50_000_001,
          Message: "copyright check failed",
          ResponseMetadata: { Error: null },
        }),
      ),
    });

    await expect(
      provider.submit({ prompt: "现代企业介绍片背景纯音乐" }),
    ).rejects.toMatchObject({
      code: "50000001",
      retryable: false,
    });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function fetchInputUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function requestBodyText(body: RequestInit["body"]): string {
  if (typeof body === "string") return body;
  throw new Error("Expected a string request body in this test");
}
