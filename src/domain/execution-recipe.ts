export type GenerationAssetRole =
  | "motion-reference"
  | "pose-reference"
  | "camera-reference"
  | "depth-reference"
  | "first-frame"
  | "last-frame"
  | "style-reference"
  | "final-video";

export type RecipeExecutor = "video-provider" | "comfyui-control" | "libtv-generation";

export type RecipeStepKind =
  | "direct-generation"
  | "control-generation"
  | "final-generation";

/**
 * A ShotRecipe is the durable execution graph for one candidate. Providers are
 * deliberately steps in the graph rather than mutually exclusive job modes.
 */
export interface ShotRecipe {
  id: string;
  profile: "direct" | "comfyui-libtv";
  steps: ShotRecipeStep[];
}

export interface ShotRecipeStep {
  id: string;
  kind: RecipeStepKind;
  executor: RecipeExecutor;
  dependsOn: string[];
  inputRoles: GenerationAssetRole[];
  outputRole: GenerationAssetRole;
  parameters?: Record<string, unknown>;
}

export interface GenerationAsset {
  id: string;
  role: GenerationAssetRole;
  mediaType: "image" | "video" | "audio";
  uri: string;
  localPath?: string;
  sourceExecutor: RecipeExecutor;
  sourceTaskId?: string;
  metadata?: Record<string, unknown>;
}

export type RecipeStepStatus = "queued" | "running" | "succeeded" | "failed";

export interface RecipeStepExecution {
  stepId: string;
  executor: RecipeExecutor;
  status: RecipeStepStatus;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  taskId?: string;
  assets: GenerationAsset[];
  error?: string;
}

export interface QualityDimensions {
  identityConsistency: number;
  motionQuality: number;
  promptAlignment: number;
  temporalStability: number;
  technicalQuality: number;
}

export interface QualityIssue {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  targetStepId?: string;
}

export interface ParameterPatch {
  targetStepId: string;
  path: string;
  value: unknown;
  reason: string;
}

export type EvaluationStage = "control-draft" | "final-candidate" | "delivery";

export interface EvaluationReport {
  stage: EvaluationStage;
  evaluator: string;
  overallScore: number;
  dimensions: QualityDimensions;
  issues: QualityIssue[];
  decision: "accept" | "revise-control" | "regenerate-final" | "human-review";
  suggestedChanges: ParameterPatch[];
  evaluatedAt: string;
}

export function assertValidShotRecipe(recipe: ShotRecipe): void {
  const ids = new Set(recipe.steps.map((step) => step.id));
  if (ids.size !== recipe.steps.length) {
    throw new Error(`Shot recipe ${recipe.id} contains duplicate step ids`);
  }

  const producedRoles = new Set<GenerationAssetRole>();
  for (const step of recipe.steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`Shot recipe step ${step.id} depends on missing step ${dependency}`);
      }
    }
    for (const inputRole of step.inputRoles) {
      if (!producedRoles.has(inputRole)) {
        throw new Error(
          `Shot recipe step ${step.id} requires ${inputRole} before it has been produced`,
        );
      }
    }
    producedRoles.add(step.outputRole);
  }

  if (!producedRoles.has("final-video")) {
    throw new Error(`Shot recipe ${recipe.id} does not produce a final-video asset`);
  }
}
