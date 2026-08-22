import { describe, expect, it } from "vitest";
import {
  addEditorialMarker,
  addEditorialMarkerSchema,
  createEditorialTimeline,
  createEditorialTimelineSchema,
  editorialTimelineState,
  lockEditorialPicture,
  lockEditorialTimelineSchema,
  replaceEditorialClip,
  replaceEditorialClipSchema,
} from "../src/domain/editorial-timeline.js";

const videoA = "11111111-1111-4111-8111-111111111111";
const videoB = "22222222-2222-4222-8222-222222222222";
const audioA = "33333333-3333-4333-8333-333333333333";

describe("editorial timeline", () => {
  it("keeps rejected candidates and makes a picture lock stale after local replacement", () => {
    const timeline = createTimeline();
    const locked = lockEditorialPicture(
      timeline,
      lockEditorialTimelineSchema.parse({ lockedBy: "Codex", note: "Picture approved" }),
    );
    const clipId = locked.tracks[0]!.clips[0]!.id;
    const replaced = replaceEditorialClip(
      locked,
      clipId,
      replaceEditorialClipSchema.parse({ assetId: videoB, mode: "preserve-slot" }),
    );

    expect(replaced.tracks[0]!.clips[0]).toMatchObject({
      assetId: videoB,
      durationFrames: 120,
      candidateAssetIds: [videoA, videoB],
    });
    expect(replaced.pictureRevision).toBe(2);
    expect(replaced.audioRevision).toBe(1);
    expect(editorialTimelineState(replaced)).toMatchObject({
      pictureLocked: false,
      audioLocked: false,
    });
  });

  it("ripples later picture/audio clips and markers while invalidating both revisions", () => {
    let timeline = createTimeline();
    timeline = addEditorialMarker(
      timeline,
      addEditorialMarkerSchema.parse({ frame: 130, label: "Review beat" }),
    );
    const clipId = timeline.tracks[0]!.clips[0]!.id;
    const replaced = replaceEditorialClip(
      timeline,
      clipId,
      replaceEditorialClipSchema.parse({ assetId: videoB, mode: "ripple", durationFrames: 144 }),
    );

    expect(replaced.tracks[0]!.clips[1]!.timelineStartFrame).toBe(144);
    expect(replaced.tracks[1]!.clips[0]!.timelineStartFrame).toBe(144);
    expect(replaced.markers[0]!.frame).toBe(154);
    expect(replaced.pictureRevision).toBe(2);
    expect(replaced.audioRevision).toBe(2);
  });
});

function createTimeline() {
  return createEditorialTimeline(createEditorialTimelineSchema.parse({
    name: "Commercial master",
    fps: 24,
    width: 3840,
    height: 2160,
    tracks: [
      {
        name: "V1 Picture",
        kind: "video",
        role: "picture",
        clips: [
          { assetId: videoA, timelineStartFrame: 0, durationFrames: 120 },
          { assetId: videoA, timelineStartFrame: 120, durationFrames: 120 },
        ],
      },
      {
        name: "A2 Voice-over",
        kind: "audio",
        role: "voiceover",
        clips: [{ assetId: audioA, timelineStartFrame: 120, durationFrames: 120 }],
      },
    ],
  }));
}
