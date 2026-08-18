import type { ShotRecipe } from "../domain/execution-recipe.js";
import { assertValidShotRecipe } from "../domain/execution-recipe.js";
import type { VideoJob, VideoShot } from "../domain/video-job.js";

export interface ShotRecipePlanningContext {
  job: VideoJob;
  shot: VideoShot;
  candidateId: string;
}

export interface ShotRecipePlanner {
  createRecipe(context: ShotRecipePlanningContext): Promise<ShotRecipe>;
}

export class DirectShotRecipePlanner implements ShotRecipePlanner {
  async createRecipe(context: ShotRecipePlanningContext): Promise<ShotRecipe> {
    return checked({
      id: `${context.candidateId}/direct`,
      profile: "direct",
      steps: [
        {
          id: "final-generation",
          kind: "direct-generation",
          executor: "video-provider",
          dependsOn: [],
          inputRoles: [],
          outputRole: "final-video",
        },
      ],
    });
  }
}

export class ComfyUiLibTvShotRecipePlanner implements ShotRecipePlanner {
  async createRecipe(context: ShotRecipePlanningContext): Promise<ShotRecipe> {
    return checked({
      id: `${context.candidateId}/comfyui-libtv`,
      profile: "comfyui-libtv",
      steps: [
        {
          id: "control-pass",
          kind: "control-generation",
          executor: "comfyui-control",
          dependsOn: [],
          inputRoles: [],
          outputRole: "motion-reference",
          parameters: {
            purpose: "Generate the motion, camera, composition and timing skeleton",
          },
        },
        {
          id: "final-generation",
          kind: "final-generation",
          executor: "libtv-generation",
          dependsOn: ["control-pass"],
          inputRoles: ["motion-reference"],
          outputRole: "final-video",
          parameters: {
            modeType: "video2video",
            preserve: ["motion", "camera", "composition", "timing"],
          },
        },
      ],
    });
  }
}

function checked(recipe: ShotRecipe): ShotRecipe {
  assertValidShotRecipe(recipe);
  return recipe;
}
