import { z } from "zod";

export const screenDirectionSchema = z.enum([
  "left-to-right",
  "right-to-left",
  "toward-camera",
  "away-from-camera",
  "static",
]);

export type ScreenDirection = z.infer<typeof screenDirectionSchema>;

const continuityStateSchema = z.object({
  previousShotId: z.string().trim().min(1).max(200).optional(),
  firstFrameAssetId: z.string().trim().min(1).max(200).optional(),
  lastFrameAssetId: z.string().trim().min(1).max(200).optional(),
  subjectPose: z.string().trim().min(1).max(1_000),
  subjectPosition: z.string().trim().min(1).max(1_000),
  screenDirection: screenDirectionSchema,
  eyeline: z.string().trim().min(1).max(1_000),
  cameraPosition: z.string().trim().min(1).max(1_000),
  environmentState: z.string().trim().min(1).max(2_000),
});

export const storyProductionPlanSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  logline: z.string().trim().min(1).max(2_000),
  targetDurationSeconds: z.number().positive().max(7_200),
  scenes: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    index: z.number().int().min(0),
    title: z.string().trim().min(1).max(300),
    narrativePurpose: z.string().trim().min(1).max(2_000),
    targetDurationSeconds: z.number().positive().max(1_800),
    continuityAnchors: z.object({
      characterIds: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
      locationKey: z.string().trim().min(1).max(300),
      wardrobeKey: z.string().trim().min(1).max(300),
      visualStyleKey: z.string().trim().min(1).max(300),
      lightingKey: z.string().trim().min(1).max(300),
      audioBedKey: z.string().trim().min(1).max(300).optional(),
    }),
    shots: z.array(z.object({
      id: z.string().trim().min(1).max(200),
      index: z.number().int().min(0),
      narrativePurpose: z.string().trim().min(1).max(2_000),
      action: z.string().trim().min(1).max(2_000),
      camera: z.string().trim().min(1).max(2_000),
      sound: z.string().trim().max(2_000),
      prompt: z.string().trim().min(1).max(8_000),
      generation: z.object({
        profileId: z.string().trim().min(1).max(240),
        durationSeconds: z.number().positive().max(60),
      }),
      selection: z.object({
        sourceInSeconds: z.number().min(0),
        sourceOutSeconds: z.number().positive(),
      }),
      incomingContinuity: continuityStateSchema,
      expectedOutgoingContinuity: continuityStateSchema,
    })).min(1).max(500),
  })).min(1).max(100),
});

/** Stable scene-level facts that should not be reinvented by each shot prompt. */
export interface SceneContinuityAnchors {
  characterIds: string[];
  locationKey: string;
  wardrobeKey: string;
  visualStyleKey: string;
  lightingKey: string;
  audioBedKey?: string;
}

/** The compact state handed from an accepted shot to its successor. */
export interface ShotContinuityState {
  previousShotId?: string;
  firstFrameAssetId?: string;
  lastFrameAssetId?: string;
  subjectPose: string;
  subjectPosition: string;
  screenDirection: ScreenDirection;
  eyeline: string;
  cameraPosition: string;
  environmentState: string;
}

export interface SceneShotPlan {
  id: string;
  index: number;
  narrativePurpose: string;
  action: string;
  camera: string;
  sound: string;
  prompt: string;
  generation: {
    profileId: string;
    durationSeconds: number;
  };
  selection: {
    sourceInSeconds: number;
    sourceOutSeconds: number;
  };
  incomingContinuity: ShotContinuityState;
  expectedOutgoingContinuity: ShotContinuityState;
}

export interface ScenePlan {
  id: string;
  index: number;
  title: string;
  narrativePurpose: string;
  targetDurationSeconds: number;
  continuityAnchors: SceneContinuityAnchors;
  shots: SceneShotPlan[];
}

export interface StoryProductionPlan {
  id: string;
  title: string;
  logline: string;
  targetDurationSeconds: number;
  scenes: ScenePlan[];
}

export function parseStoryProductionPlan(input: unknown): StoryProductionPlan {
  const plan = storyProductionPlanSchema.parse(input) as StoryProductionPlan;
  assertValidStoryProductionPlan(plan);
  return plan;
}

export interface SceneAssemblyClip {
  shotId: string;
  acceptedAssetId: string;
  sourceInSeconds: number;
  sourceOutSeconds: number;
  timelineStartSeconds: number;
  transition: "cut" | "match-cut" | "audio-led-cut";
}

export interface SceneAssemblyManifest {
  sceneId: string;
  durationSeconds: number;
  clips: SceneAssemblyClip[];
}

export function assertValidStoryProductionPlan(plan: StoryProductionPlan): void {
  if (plan.scenes.length === 0) throw new Error("Story production plan must contain a scene");
  assertUnique(plan.scenes.map((scene) => scene.id), "scene");

  let storyDuration = 0;
  const shotIds: string[] = [];
  for (const [sceneOffset, scene] of plan.scenes.entries()) {
    if (scene.index !== sceneOffset) {
      throw new Error(`Scene ${scene.id} index ${scene.index} is not sequential`);
    }
    if (scene.shots.length === 0) throw new Error(`Scene ${scene.id} must contain a shot`);
    if (scene.continuityAnchors.characterIds.length === 0) {
      throw new Error(`Scene ${scene.id} must declare at least one character continuity anchor`);
    }

    let selectedDuration = 0;
    for (const [shotOffset, shot] of scene.shots.entries()) {
      shotIds.push(shot.id);
      if (shot.index !== shotOffset) {
        throw new Error(`Shot ${shot.id} index ${shot.index} is not sequential within ${scene.id}`);
      }
      if (shot.generation.durationSeconds <= 0) {
        throw new Error(`Shot ${shot.id} generation duration must be positive`);
      }
      const { sourceInSeconds, sourceOutSeconds } = shot.selection;
      if (sourceInSeconds < 0 || sourceOutSeconds <= sourceInSeconds) {
        throw new Error(`Shot ${shot.id} has an invalid selected source interval`);
      }
      if (sourceOutSeconds > shot.generation.durationSeconds + 0.001) {
        throw new Error(`Shot ${shot.id} selection exceeds its generated duration`);
      }
      if (shotOffset > 0) {
        const previous = scene.shots[shotOffset - 1]!;
        if (shot.incomingContinuity.previousShotId !== previous.id) {
          throw new Error(`Shot ${shot.id} does not continue from ${previous.id}`);
        }
        if (!shot.incomingContinuity.firstFrameAssetId) {
          throw new Error(`Shot ${shot.id} must declare the incoming first-frame asset`);
        }
      }
      selectedDuration += sourceOutSeconds - sourceInSeconds;
    }
    if (Math.abs(selectedDuration - scene.targetDurationSeconds) > 0.05) {
      throw new Error(
        `Scene ${scene.id} selected duration ${selectedDuration.toFixed(3)} does not match target ${scene.targetDurationSeconds.toFixed(3)}`,
      );
    }
    storyDuration += scene.targetDurationSeconds;
  }

  assertUnique(shotIds, "shot");
  if (Math.abs(storyDuration - plan.targetDurationSeconds) > 0.05) {
    throw new Error(
      `Story selected duration ${storyDuration.toFixed(3)} does not match target ${plan.targetDurationSeconds.toFixed(3)}`,
    );
  }
}

export function assertValidSceneAssembly(manifest: SceneAssemblyManifest): void {
  if (manifest.clips.length === 0) throw new Error("Scene assembly must contain a clip");
  assertUnique(manifest.clips.map((clip) => clip.shotId), "assembled shot");

  let expectedStart = 0;
  for (const clip of manifest.clips) {
    if (clip.sourceInSeconds < 0 || clip.sourceOutSeconds <= clip.sourceInSeconds) {
      throw new Error(`Assembly clip ${clip.shotId} has an invalid source interval`);
    }
    if (Math.abs(clip.timelineStartSeconds - expectedStart) > 0.05) {
      throw new Error(`Assembly clip ${clip.shotId} does not start at ${expectedStart.toFixed(3)}`);
    }
    expectedStart += clip.sourceOutSeconds - clip.sourceInSeconds;
  }
  if (Math.abs(expectedStart - manifest.durationSeconds) > 0.05) {
    throw new Error(
      `Assembly duration ${expectedStart.toFixed(3)} does not match ${manifest.durationSeconds.toFixed(3)}`,
    );
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} id`);
}
