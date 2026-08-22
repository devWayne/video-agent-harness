import { describe, expect, it } from "vitest";
import { buildCommercialAudioFilter } from "../src/application/commercial-audio-mixer.js";

describe("commercial audio mixer", () => {
  it("builds a deterministic voice-over ducking and loudness filter graph", () => {
    const filter = buildCommercialAudioFilter(60, {
      musicGainDb: -22,
      voiceoverGainDb: 0,
      duckingThreshold: 0.03,
      duckingRatio: 8,
      duckingAttackMs: 20,
      duckingReleaseMs: 500,
      fadeInSeconds: 1.5,
      fadeOutSeconds: 3,
      targetLufs: -16,
      truePeakDb: -1.5,
    });

    expect(filter).toContain("asplit=2[voice_mix][voice_key]");
    expect(filter).toContain("volume=-22dB");
    expect(filter).toContain("afade=t=out:st=57:d=3");
    expect(filter).toContain(
      "sidechaincompress=threshold=0.03:ratio=8:attack=20:release=500",
    );
    expect(filter).toContain("loudnorm=I=-16:TP=-1.5:LRA=11[aout]");
  });
});
