import type {
  GenerationAsset,
  RecipeStepExecution,
  ShotRecipeStep,
} from "../domain/execution-recipe.js";
import type { ShotCandidate, VideoJob, VideoShot } from "../domain/video-job.js";
import type { ShotRecipePlanner } from "./shot-recipe-planner.js";

export interface CandidateGenerationContext {
  job: VideoJob;
  shot: VideoShot;
  candidateId: string;
}

export type CandidateCheckpoint = (candidate: ShotCandidate) => Promise<void>;

export interface CandidateGenerationPipeline {
  readonly name: string;
  preflight(signal?: AbortSignal): Promise<void>;
  initialize(context: CandidateGenerationContext): Promise<ShotCandidate>;
  execute(
    context: CandidateGenerationContext,
    candidate: ShotCandidate,
    checkpoint: CandidateCheckpoint,
    signal?: AbortSignal,
  ): Promise<ShotCandidate>;
}

export interface ShotStepExecutionRequest {
  context: CandidateGenerationContext;
  step: ShotRecipeStep;
  execution: RecipeStepExecution;
  inputAssets: GenerationAsset[];
}

export interface ShotStepExecutionResult {
  taskId?: string;
  assets: GenerationAsset[];
}

export interface ShotStepExecutor {
  readonly id: ShotRecipeStep["executor"];
  preflight?(signal?: AbortSignal): Promise<void>;
  execute(
    request: ShotStepExecutionRequest,
    checkpointTaskId: (taskId: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<ShotStepExecutionResult>;
}

export class RecipeCandidateGenerationPipeline implements CandidateGenerationPipeline {
  readonly name: string;
  readonly #executors: Map<ShotRecipeStep["executor"], ShotStepExecutor>;

  constructor(
    private readonly planner: ShotRecipePlanner,
    executors: ShotStepExecutor[],
    name = "shot-recipe",
  ) {
    this.name = name;
    this.#executors = new Map(executors.map((executor) => [executor.id, executor]));
  }

  async preflight(signal?: AbortSignal): Promise<void> {
    for (const executor of this.#executors.values()) {
      await executor.preflight?.(signal);
    }
  }

  async initialize(context: CandidateGenerationContext): Promise<ShotCandidate> {
    const recipe = await this.planner.createRecipe(context);
    return {
      id: context.candidateId,
      provider: `${this.name}:${recipe.profile}`,
      providerTaskId: recipe.id,
      status: "submitted",
      recipe,
      executions: recipe.steps.map((step) => ({
        stepId: step.id,
        executor: step.executor,
        status: "queued",
        attempt: 0,
        assets: [],
      })),
      assets: [],
    };
  }

  async execute(
    context: CandidateGenerationContext,
    candidate: ShotCandidate,
    checkpoint: CandidateCheckpoint,
    signal?: AbortSignal,
  ): Promise<ShotCandidate> {
    if (!candidate.recipe || !candidate.executions) {
      throw new Error(`Candidate ${candidate.id} has no durable shot recipe`);
    }

    let current = candidate;
    for (const step of candidate.recipe.steps) {
      signal?.throwIfAborted();
      let execution = requireExecution(current, step.id);
      if (execution.status === "succeeded") continue;

      const executor = this.#executors.get(step.executor);
      if (!executor) throw new Error(`No executor registered for ${step.executor}`);

      execution = {
        ...execution,
        status: "running",
        attempt: execution.attempt + 1,
        startedAt: new Date().toISOString(),
      };
      current = replaceExecution(current, execution, { status: "running" });
      await checkpoint(current);

      try {
        const result = await executor.execute(
          {
            context,
            step,
            execution,
            inputAssets: resolveInputAssets(current, step),
          },
          async (taskId) => {
            execution = { ...execution, taskId };
            current = replaceExecution(current, execution, {
              providerTaskId: taskId,
              status: "running",
            });
            await checkpoint(current);
          },
          signal,
        );
        execution = {
          ...execution,
          status: "succeeded",
          completedAt: new Date().toISOString(),
          ...(result.taskId ? { taskId: result.taskId } : {}),
          assets: result.assets,
        };
        current = replaceExecution(current, execution, {
          providerTaskId: result.taskId ?? current.providerTaskId,
          status: "running",
          assets: mergeAssets(current.assets ?? [], result.assets),
        });
        await checkpoint(current);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown recipe step error";
        execution = {
          ...execution,
          status: "failed",
          completedAt: new Date().toISOString(),
          error: errorMessage,
        };
        current = replaceExecution(current, execution, {
          status: "failed",
          error: errorMessage,
        });
        await checkpoint(current);
        return current;
      }
    }

    const finalAsset = (current.assets ?? []).find((asset) => asset.role === "final-video");
    if (!finalAsset) throw new Error(`Candidate ${candidate.id} recipe produced no final video`);
    current = { ...current, status: "succeeded", outputUrl: finalAsset.uri };
    await checkpoint(current);
    return current;
  }
}

function requireExecution(candidate: ShotCandidate, stepId: string): RecipeStepExecution {
  const execution = candidate.executions?.find((item) => item.stepId === stepId);
  if (!execution) throw new Error(`Candidate ${candidate.id} has no execution for step ${stepId}`);
  return execution;
}

function replaceExecution(
  candidate: ShotCandidate,
  execution: RecipeStepExecution,
  patch: Partial<ShotCandidate>,
): ShotCandidate {
  return {
    ...candidate,
    ...patch,
    executions: candidate.executions!.map((item) =>
      item.stepId === execution.stepId ? execution : item,
    ),
  };
}

function resolveInputAssets(candidate: ShotCandidate, step: ShotRecipeStep): GenerationAsset[] {
  const assets = candidate.assets ?? [];
  return step.inputRoles.map((role) => {
    const asset = assets.find((item) => item.role === role);
    if (!asset) throw new Error(`Recipe step ${step.id} is missing required ${role} asset`);
    return asset;
  });
}

function mergeAssets(
  current: GenerationAsset[],
  additions: GenerationAsset[],
): GenerationAsset[] {
  const additionIds = new Set(additions.map((asset) => asset.id));
  return [...current.filter((asset) => !additionIds.has(asset.id)), ...additions];
}
