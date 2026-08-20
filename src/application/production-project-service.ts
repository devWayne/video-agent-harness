import {
  addCharacterPack,
  addCharacterPackSchema,
  addProjectAsset,
  addProjectAssetSchema,
  addScenePack,
  addScenePackSchema,
  addStoryScene,
  addStorySceneSchema,
  attachVideoJob,
  appendProductionOperation,
  completeProjectOperation,
  createProductionProject,
  createProductionProjectSchema,
  failProjectOperation,
  reviewProjectOperation,
  saveProductionPlan,
  startProjectOperation,
  updateProductionProject,
  updateProductionProjectSchema,
  type ProductionProject,
} from "../domain/production-project.js";
import {
  completeProductionOperationSchema,
  createProductionOperationSchema,
  failProductionOperationSchema,
  operationPassedGate,
  reviewProductionOperationSchema,
  startProductionOperationSchema,
  type ProductionOperation,
  type ProductionOperationKind,
  type ProductionExecutor,
} from "../domain/production-operation.js";
import { parseStoryProductionPlan } from "../domain/story-production.js";
import type { ProductionProjectRepository } from "../infrastructure/production-project-repository.js";
import type { VideoJobRepository } from "../infrastructure/video-job-repository.js";
import { z } from "zod";

const savePlanSchema = z.object({
  agentHost: z.string().trim().min(1).max(160),
  plan: z.unknown(),
});

export interface ProductionOperationMutation {
  project: ProductionProject;
  operation: ProductionOperation;
}

export interface ProductionProjectDetail {
  project: ProductionProject;
  jobs: Awaited<ReturnType<VideoJobRepository["listByProjectId"]>>;
}

export class ProductionProjectService {
  constructor(
    private readonly projects: ProductionProjectRepository,
    private readonly jobs: VideoJobRepository,
  ) {}

  async create(input: unknown): Promise<ProductionProject> {
    const project = createProductionProject(createProductionProjectSchema.parse(input));
    await this.projects.saveProject(project);
    return project;
  }

  async list(): Promise<ProductionProject[]> {
    return this.projects.listProjects();
  }

  async get(id: string): Promise<ProductionProject | undefined> {
    return this.projects.findProjectById(id);
  }

  async getDetail(id: string): Promise<ProductionProjectDetail | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    return { project, jobs: await this.jobs.listByProjectId(id) };
  }

  async update(id: string, input: unknown): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const updated = updateProductionProject(project, updateProductionProjectSchema.parse(input));
    await this.projects.saveProject(updated);
    return updated;
  }

  async addAsset(id: string, input: unknown): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const parsed = addProjectAssetSchema.parse(input);
    if (parsed.parentAssetId && !project.assets.some((asset) => asset.id === parsed.parentAssetId)) {
      throw new ProductionProjectConflictError("Parent asset does not belong to this project");
    }
    const updated = addProjectAsset(project, parsed);
    await this.projects.saveProject(updated);
    return updated;
  }

  async addCharacterPack(id: string, input: unknown): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const parsed = addCharacterPackSchema.parse(input);
    assertAssetsBelongToProject(project, parsed.referenceAssetIds);
    const updated = addCharacterPack(project, parsed);
    await this.projects.saveProject(updated);
    return updated;
  }

  async addScenePack(id: string, input: unknown): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const parsed = addScenePackSchema.parse(input);
    assertAssetsBelongToProject(project, parsed.referenceAssetIds);
    const updated = addScenePack(project, parsed);
    await this.projects.saveProject(updated);
    return updated;
  }

  async addScene(id: string, input: unknown): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const parsed = addStorySceneSchema.parse(input);
    const characterIds = new Set(project.characterPacks.map((pack) => pack.id));
    if (parsed.characterPackIds.some((packId) => !characterIds.has(packId))) {
      throw new ProductionProjectConflictError("Character pack does not belong to this project");
    }
    if (parsed.scenePackId && !project.scenePacks.some((pack) => pack.id === parsed.scenePackId)) {
      throw new ProductionProjectConflictError("Scene pack does not belong to this project");
    }
    const updated = addStoryScene(project, parsed);
    await this.projects.saveProject(updated);
    return updated;
  }

  async savePlan(id: string, input: unknown): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const parsed = savePlanSchema.parse(input);
    const productionPlan = parseStoryProductionPlan(parsed.plan);
    assertPlanReferencesProject(project, productionPlan);
    const updated = saveProductionPlan(project, productionPlan, parsed.agentHost);
    await this.projects.saveProject(updated);
    return updated;
  }

  async createOperation(id: string, input: unknown): Promise<ProductionOperationMutation | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const parsed = createProductionOperationSchema.parse(input);
    assertOperationTarget(
      project,
      parsed.kind,
      parsed.executor,
      parsed.requiresReview,
      parsed.shotId,
      parsed.sceneId,
    );
    assertAssetsBelongToProject(project, parsed.inputAssetIds);
    assertDependenciesPassed(project, parsed.dependsOnOperationIds);
    assertProductionGate(project, parsed.kind, parsed.inputAssetIds, parsed.dependsOnOperationIds);
    const updated = appendProductionOperation(project, parsed);
    await this.projects.saveProject(updated);
    return { project: updated, operation: updated.operations.at(-1)! };
  }

  async startOperation(
    id: string,
    operationId: string,
    input: unknown,
  ): Promise<ProductionOperationMutation | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const operation = requireOperation(project, operationId);
    assertDependenciesPassed(project, operation.dependsOnOperationIds);
    const updated = startProjectOperation(project, operationId, startProductionOperationSchema.parse(input));
    await this.projects.saveProject(updated);
    return { project: updated, operation: requireOperation(updated, operationId) };
  }

  async completeOperation(
    id: string,
    operationId: string,
    input: unknown,
  ): Promise<ProductionOperationMutation | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const operation = requireOperation(project, operationId);
    const parsed = completeProductionOperationSchema.parse(input);
    assertAssetsBelongToProject(project, parsed.outputAssetIds);
    assertOutputAssetRoles(project, operation.kind, parsed.outputAssetIds);
    const updated = completeProjectOperation(project, operationId, parsed);
    await this.projects.saveProject(updated);
    return { project: updated, operation: requireOperation(updated, operationId) };
  }

  async failOperation(
    id: string,
    operationId: string,
    input: unknown,
  ): Promise<ProductionOperationMutation | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    requireOperation(project, operationId);
    const updated = failProjectOperation(project, operationId, failProductionOperationSchema.parse(input));
    await this.projects.saveProject(updated);
    return { project: updated, operation: requireOperation(updated, operationId) };
  }

  async reviewOperation(
    id: string,
    operationId: string,
    input: unknown,
  ): Promise<ProductionOperationMutation | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    requireOperation(project, operationId);
    const parsed = reviewProductionOperationSchema.parse(input);
    assertAssetsBelongToProject(
      project,
      parsed.evidence.flatMap((evidence) => evidence.assetId ? [evidence.assetId] : []),
    );
    const updated = reviewProjectOperation(project, operationId, parsed);
    await this.projects.saveProject(updated);
    return { project: updated, operation: requireOperation(updated, operationId) };
  }

  async assertProjectAndScene(id: string, sceneId?: string): Promise<ProductionProject> {
    const project = await this.projects.findProjectById(id);
    if (!project) throw new ProductionProjectNotFoundError();
    if (sceneId && !project.scenes.some((scene) => scene.id === sceneId)) {
      throw new ProductionProjectConflictError("Scene does not belong to this project");
    }
    return project;
  }

  async attachJob(id: string, jobId: string, sceneId?: string): Promise<ProductionProject> {
    const project = await this.assertProjectAndScene(id, sceneId);
    const updated = attachVideoJob(project, jobId, sceneId);
    await this.projects.saveProject(updated);
    return updated;
  }
}

export class ProductionProjectNotFoundError extends Error {
  readonly code = "PROJECT_NOT_FOUND";

  constructor() {
    super("Production project not found");
    this.name = "ProductionProjectNotFoundError";
  }
}

export class ProductionProjectConflictError extends Error {
  readonly code = "PROJECT_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ProductionProjectConflictError";
  }
}

function assertAssetsBelongToProject(project: ProductionProject, assetIds: string[]): void {
  const projectAssetIds = new Set(project.assets.map((asset) => asset.id));
  if (assetIds.some((assetId) => !projectAssetIds.has(assetId))) {
    throw new ProductionProjectConflictError("Reference asset does not belong to this project");
  }
}

function assertPlanReferencesProject(
  project: ProductionProject,
  plan: NonNullable<ProductionProject["productionPlan"]>,
): void {
  const characterIds = new Set(project.characterPacks.map((pack) => pack.id));
  const unknownCharacter = plan.scenes
    .flatMap((scene) => scene.continuityAnchors.characterIds)
    .find((id) => !characterIds.has(id));
  if (unknownCharacter) {
    throw new ProductionProjectConflictError(
      `Production plan character ${unknownCharacter} does not belong to this project`,
    );
  }
}

function assertOperationTarget(
  project: ProductionProject,
  kind: ProductionOperationKind,
  executor: ProductionExecutor,
  requiresReview: boolean,
  shotId?: string,
  sceneId?: string,
): void {
  if (!project.productionPlan) {
    throw new ProductionProjectConflictError("Save a structured production plan before creating operations");
  }
  const planScenes = project.productionPlan.scenes;
  const shot = planScenes.flatMap((scene) => scene.shots).find((item) => item.id === shotId);
  const scene = planScenes.find((item) => item.id === sceneId);
  if ((kind === "control-generation" || kind === "final-render") && !shot) {
    throw new ProductionProjectConflictError(`${kind} requires a shotId from the production plan`);
  }
  if (shotId && !shot) throw new ProductionProjectConflictError("Shot does not belong to this production plan");
  if (sceneId && !scene) throw new ProductionProjectConflictError("Scene does not belong to this production plan");
  if (shotId && sceneId && !scene?.shots.some((item) => item.id === shotId)) {
    throw new ProductionProjectConflictError("Shot does not belong to the declared scene");
  }
  if (!requiresReview) {
    throw new ProductionProjectConflictError("Every production-stage operation requires an explicit review gate");
  }

  const allowed: Record<ProductionOperationKind, ProductionExecutor[]> = {
    "control-generation": ["comfyui", "manual"],
    "final-render": ["libtv", "online-video", "manual"],
    assembly: ["hyperframes", "libtv", "manual"],
    delivery: ["delivery", "manual"],
  };
  if (!allowed[kind].includes(executor)) {
    throw new ProductionProjectConflictError(`Executor ${executor} cannot execute ${kind}`);
  }
}

function assertDependenciesPassed(project: ProductionProject, dependencyIds: string[]): void {
  for (const id of dependencyIds) {
    const operation = requireOperation(project, id);
    if (!operationPassedGate(operation)) {
      throw new ProductionProjectConflictError(`Dependency operation ${id} has not passed its gate`);
    }
  }
}

function assertProductionGate(
  project: ProductionProject,
  kind: ProductionOperationKind,
  inputAssetIds: string[],
  dependencyIds: string[],
): void {
  if (kind === "assembly") {
    const shotIds = project.productionPlan?.scenes.flatMap((scene) => scene.shots.map((shot) => shot.id)) ?? [];
    const acceptedFinals = project.operations.filter(
      (operation) => operation.kind === "final-render" && operationPassedGate(operation),
    );
    const selectedFinals = acceptedFinals.filter(
      (operation) => operation.outputAssetIds.some((assetId) => inputAssetIds.includes(assetId))
        && dependencyIds.includes(operation.id),
    );
    const missing = shotIds.find((shotId) => !selectedFinals.some((operation) => operation.shotId === shotId));
    if (missing) {
      throw new ProductionProjectConflictError(
        `Assembly must depend on and consume an accepted final render for shot ${missing}`,
      );
    }
  }
  if (kind === "delivery") {
    const acceptedAssembly = project.operations.find(
      (operation) => operation.kind === "assembly"
        && operationPassedGate(operation)
        && dependencyIds.includes(operation.id)
        && operation.outputAssetIds.some((assetId) => inputAssetIds.includes(assetId)),
    );
    if (!acceptedAssembly) {
      throw new ProductionProjectConflictError(
        "Delivery must depend on and consume an accepted assembly operation",
      );
    }
  }
}

function assertOutputAssetRoles(
  project: ProductionProject,
  kind: ProductionOperationKind,
  outputAssetIds: string[],
): void {
  const expectedRoles: Record<ProductionOperationKind, ProductionProject["assets"][number]["role"]> = {
    "control-generation": "control-asset",
    "final-render": "final-candidate",
    assembly: "assembly-master",
    delivery: "delivery-master",
  };
  const expectedRole = expectedRoles[kind];
  const wrongRole = project.assets.find(
    (asset) => outputAssetIds.includes(asset.id) && asset.role !== expectedRole,
  );
  if (wrongRole) {
    throw new ProductionProjectConflictError(
      `${kind} output asset ${wrongRole.id} must use role ${expectedRole}`,
    );
  }
}

function requireOperation(project: ProductionProject, operationId: string): ProductionOperation {
  const operation = project.operations.find((item) => item.id === operationId);
  if (!operation) throw new ProductionProjectConflictError("Operation does not belong to this project");
  return operation;
}
