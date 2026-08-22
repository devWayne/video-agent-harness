import { describe, expect, it } from "vitest";
import {
  assertValidSceneAssembly,
  assertValidStoryProductionPlan,
  type StoryProductionPlan,
} from "../src/domain/story-production.js";

describe("story production hierarchy", () => {
  it("validates shot handoffs inside a scene and the scene assembly timeline", () => {
    const plan = createPlan();
    expect(() => assertValidStoryProductionPlan(plan)).not.toThrow();
    expect(() =>
      assertValidSceneAssembly({
        sceneId: "scene-01",
        durationSeconds: 15,
        clips: plan.scenes[0]!.shots.map((shot) => ({
          shotId: shot.id,
          acceptedAssetId: `${shot.id}/accepted`,
          sourceInSeconds: 0,
          sourceOutSeconds: 5,
          timelineStartSeconds: shot.index * 5,
          transition: shot.index === 0 ? "cut" : "match-cut",
        })),
      }),
    ).not.toThrow();
  });

  it("rejects a successor that does not point to the accepted previous shot", () => {
    const plan = createPlan();
    plan.scenes[0]!.shots[2]!.incomingContinuity.previousShotId = "wrong-shot";
    expect(() => assertValidStoryProductionPlan(plan)).toThrow(
      "Shot shot-03 does not continue from shot-02",
    );
  });

  it("allows a character-free motion-graphics scene", () => {
    const plan = createPlan();
    plan.scenes[0]!.continuityAnchors.characterIds = [];
    plan.scenes[0]!.continuityAnchors.locationKey = "bettr-one-ultrawide-canvas";
    plan.scenes[0]!.continuityAnchors.wardrobeKey = "not-applicable";
    plan.scenes[0]!.continuityAnchors.visualStyleKey = "fintech-motion-graphics";
    expect(() => assertValidStoryProductionPlan(plan)).not.toThrow();
  });
});

function createPlan(): StoryProductionPlan {
  const state = {
    subjectPose: "seated",
    subjectPosition: "center",
    screenDirection: "static" as const,
    eyeline: "camera-right",
    cameraPosition: "eye-level medium close-up",
    environmentState: "apartment interior, door closed",
  };
  return {
    id: "story-01",
    title: "The sound at the door",
    logline: "A man hears a sound, rises and walks to the door.",
    targetDurationSeconds: 15,
    scenes: [
      {
        id: "scene-01",
        index: 0,
        title: "The interruption",
        narrativePurpose: "Turn a quiet portrait into a small physical action beat.",
        targetDurationSeconds: 15,
        continuityAnchors: {
          characterIds: ["character-01"],
          locationKey: "apartment-01",
          wardrobeKey: "gray-sleeveless-shirt",
          visualStyleKey: "realistic-phone-camera",
          lightingKey: "warm-interior",
          audioBedKey: "quiet-room-tone",
        },
        shots: [0, 1, 2].map((index) => ({
          id: `shot-0${index + 1}`,
          index,
          narrativePurpose: ["notice", "stand", "exit"][index]!,
          action: ["turn right", "stand and rotate", "walk through door"][index]!,
          camera: "continuous matched camera",
          sound: "room tone and physical Foley",
          prompt: "identity-preserving continuation",
          generation: { profileId: "h3-fl2va", durationSeconds: 5 },
          selection: { sourceInSeconds: 0, sourceOutSeconds: 5 },
          incomingContinuity: {
            ...state,
            ...(index > 0
              ? {
                  previousShotId: `shot-0${index}`,
                  firstFrameAssetId: `shot-0${index}/tail-frame`,
                }
              : {}),
          },
          expectedOutgoingContinuity: {
            ...state,
            lastFrameAssetId: `shot-0${index + 1}/tail-frame`,
          },
        })),
      },
    ],
  };
}
