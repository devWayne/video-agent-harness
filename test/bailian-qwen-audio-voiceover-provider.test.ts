import { describe, expect, it, vi } from "vitest";
import { BailianQwenAudioVoiceoverProvider } from "../src/providers/bailian-qwen-audio-voiceover-provider.js";

describe("BailianQwenAudioVoiceoverProvider", () => {
  it("synthesizes a documented 48 kHz commercial WAV request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: "tts-request-1",
          output: {
            finish_reason: "stop",
            audio: {
              url: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/voice.wav",
              id: "audio-1",
              expires_at: 1_800_000_000,
            },
          },
          usage: { characters: 24 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new BailianQwenAudioVoiceoverProvider({
      baseUrl: "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/",
      apiKey: "test-secret",
      fetch: fetchMock,
    });

    await expect(
      provider.synthesize({
        text: "每一次出发，都值得更好的抵达。",
        instruction: "成熟克制的商业广告旁白，结尾坚定。",
        hotFix: {
          pronunciation: [{ source: "出发", target: "chu1 fa1" }],
          replace: [{ source: "品牌名", target: "Harmony" }],
        },
      }),
    ).resolves.toMatchObject({
      provider: "bailian-qwen-audio",
      model: "qwen-audio-3.0-tts-plus",
      requestId: "tts-request-1",
      audioId: "audio-1",
      billedCharacters: 24,
      voice: "longanlingxin",
      format: "wav",
      sampleRate: 48_000,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
    );
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-secret" });
    expect(JSON.parse(init!.body as string)).toEqual({
      model: "qwen-audio-3.0-tts-plus",
      input: {
        text: "每一次出发，都值得更好的抵达。",
        voice: "longanlingxin",
        format: "wav",
        sample_rate: 48_000,
        volume: 50,
        rate: 1,
        pitch: 1,
        seed: 0,
        language_hints: ["zh"],
        instruction: "成熟克制的商业广告旁白，结尾坚定。",
        enable_ssml: false,
        enable_aigc_tag: true,
        hot_fix: {
          pronunciation: [{ 出发: "chu1 fa1" }],
          replace: [{ 品牌名: "Harmony" }],
        },
      },
    });
  });

  it("exposes non-secret model capabilities for upstream applications", () => {
    const provider = new BailianQwenAudioVoiceoverProvider({
      baseUrl: "https://workspace.example/api/v1",
      apiKey: "test-secret",
    });

    expect(provider.capabilities()).toMatchObject({
      provider: "bailian-qwen-audio",
      model: "qwen-audio-3.0-tts-plus",
      mode: "http-non-streaming",
      region: "cn-beijing",
      temporaryUrlTtlSeconds: 86_400,
      defaults: {
        voice: "longanlingxin",
        format: "wav",
        sampleRate: 48_000,
        enableAigcTag: true,
      },
      supportedSystemVoices: [
        { id: "longanlingxin" },
        { id: "longanlufeng" },
      ],
    });
  });

  it("rejects model-parameter combinations the HTTP profile does not support", async () => {
    const provider = new BailianQwenAudioVoiceoverProvider({
      baseUrl: "https://workspace.example/api/v1",
      apiKey: "test-secret",
      fetch: vi.fn(),
    });

    await expect(
      provider.synthesize({ text: "测试", format: "wav", bitRate: 128 }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects instructions longer than the upstream 128-character limit before billing", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new BailianQwenAudioVoiceoverProvider({
      baseUrl: "https://workspace.example/api/v1",
      apiKey: "test-secret",
      fetch: fetchMock,
    });

    await expect(
      provider.synthesize({ text: "测试", instruction: "长".repeat(129) }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes provider throttling into a retryable error", async () => {
    const provider = new BailianQwenAudioVoiceoverProvider({
      baseUrl: "https://workspace.example/api/v1",
      apiKey: "test-secret",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ code: "Throttling", message: "Try later" }), {
          status: 429,
        }),
      ),
    });

    await expect(provider.synthesize({ text: "测试" })).rejects.toMatchObject({
      code: "Throttling",
      retryable: true,
    });
  });
});
