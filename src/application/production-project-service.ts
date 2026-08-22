import {
  addCharacterPack,
  addCharacterPackSchema,
  addProjectAsset,
  addProjectAssetSchema,
  addScenePack,
  addScenePackSchema,
  addStoryScene,
  addStorySceneSchema,
  appendEditorialTimeline,
  attachVideoJob,
  appendProductionOperation,
  completeProjectOperation,
  createProductionProject,
  createProductionProjectSchema,
  failProjectOperation,
  reviewProjectOperation,
  replaceEditorialTimeline as replaceProjectEditorialTimeline,
  saveProductionPlan,
  startProjectOperation,
  updateProductionProject,
  updateProductionProjectSchema,
  type ProductionProject,
} from "../domain/production-project.js";
import {
  addEditorialMarker,
  addEditorialMarkerSchema,
  createEditorialTimeline,
  createEditorialTimelineSchema,
  lockEditorialAudio,
  lockEditorialPicture,
  lockEditorialTimelineSchema,
  recordEditorialWorkspaceSync,
  replaceEditorialClip,
  replaceEditorialClipSchema,
  type EditorialTimeline,
  type EditorialTrackKind,
} from "../domain/editorial-timeline.js";
import {
  syncEditorialWorkspaceSchema,
  type EditorialWorkspaceAdapter,
  type EditorialWorkspaceSyncResult,
} from "../domain/editorial-workspace.js";
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
    private readonly editorialWorkspace?: EditorialWorkspaceAdapter,
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
    assertCharacterReferenceAssets(project, parsed.referenceAssetIds);
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

  editorialWorkspaceCapabilities() {
    return this.editorialWorkspace?.capabilities();
  }

  async listEditorialTimelines(id: string): Promise<EditorialTimeline[] | undefined> {
    const project = await this.projects.findProjectById(id);
    return project?.editorialTimelines;
  }

  async getEditorialTimeline(id: string, timelineId: string): Promise<EditorialTimeline | undefined> {
    const project = await this.projects.findProjectById(id);
    return project?.editorialTimelines.find((timeline) => timeline.id === timelineId);
  }

  async createEditorialTimeline(id: string, input: unknown): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const timeline = createEditorialTimeline(createEditorialTimelineSchema.parse(input));
    assertEditorialAssets(project, timeline);
    const updated = appendEditorialTimeline(project, timeline);
    await this.projects.saveProject(updated);
    return updated;
  }

  async replaceEditorialClip(
    id: string,
    timelineId: string,
    clipId: string,
    input: unknown,
  ): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const timeline = requireEditorialTimeline(project, timelineId);
    const parsed = replaceEditorialClipSchema.parse(input);
    const track = timeline.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === clipId));
    if (!track) throw new ProductionProjectConflictError("Editorial clip does not belong to this timeline");
    assertEditorialAsset(project, parsed.assetId, track.kind);
    const updatedTimeline = replaceEditorialClip(timeline, clipId, parsed);
    const updated = replaceProjectEditorialTimeline(project, updatedTimeline);
    await this.projects.saveProject(updated);
    return updated;
  }

  async addEditorialMarker(
    id: string,
    timelineId: string,
    input: unknown,
  ): Promise<ProductionProject | undefined> {
    return this.updateEditorialTimeline(id, timelineId, (timeline) =>
      addEditorialMarker(timeline, addEditorialMarkerSchema.parse(input)));
  }

  async lockEditorialPicture(
    id: string,
    timelineId: string,
    input: unknown,
  ): Promise<ProductionProject | undefined> {
    return this.updateEditorialTimeline(id, timelineId, (timeline) =>
      lockEditorialPicture(timeline, lockEditorialTimelineSchema.parse(input)));
  }

  async lockEditorialAudio(
    id: string,
    timelineId: string,
    input: unknown,
  ): Promise<ProductionProject | undefined> {
    return this.updateEditorialTimeline(id, timelineId, (timeline) =>
      lockEditorialAudio(timeline, lockEditorialTimelineSchema.parse(input)));
  }

  async syncEditorialTimeline(
    id: string,
    timelineId: string,
    input: unknown,
  ): Promise<{ project: ProductionProject; sync: EditorialWorkspaceSyncResult } | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    if (!this.editorialWorkspace) {
      throw new ProductionProjectConflictError("Editorial workspace adapter is not configured");
    }
    const timeline = requireEditorialTimeline(project, timelineId);
    const parsed = syncEditorialWorkspaceSchema.parse(input);
    const sync = await this.editorialWorkspace.syncTimeline({
      ...parsed,
      projectName: project.name,
      projectDescription: project.brief,
      timeline,
    });
    const syncedTimeline = recordEditorialWorkspaceSync(timeline, {
      provider: "openchatcut",
      projectId: sync.projectId,
      editorUrl: sync.editorUrl,
      syncStatus: sync.status,
      editSessionId: sync.editSessionId,
    });
    const updated = replaceProjectEditorialTimeline(project, syncedTimeline);
    await this.projects.saveProject(updated);
    return { project: updated, sync };
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

  private async updateEditorialTimeline(
    id: string,
    timelineId: string,
    update: (timeline: EditorialTimeline) => EditorialTimeline,
  ): Promise<ProductionProject | undefined> {
    const project = await this.projects.findProjectById(id);
    if (!project) return undefined;
    const updated = replaceProjectEditorialTimeline(project, update(requireEditorialTimeline(project, timelineId)));
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

function requireEditorialTimeline(project: ProductionProject, timelineId: string): EditorialTimeline {
  const timeline = project.editorialTimelines.find((candidate) => candidate.id === timelineId);
  if (!timeline) throw new ProductionProjectConflictError("Editorial timeline does not belong to this project");
  return timeline;
}

function assertEditorialAssets(project: ProductionProject, timeline: EditorialTimeline): void {
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      assertEditorialAsset(project, clip.assetId, track.kind);
      for (const candidateAssetId of clip.candidateAssetIds) {
        assertEditorialAsset(project, candidateAssetId, track.kind);
      }
    }
  }
}

function assertEditorialAsset(
  project: ProductionProject,
  assetId: string,
  trackKind: EditorialTrackKind,
): void {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new ProductionProjectConflictError("Editorial asset does not belong to this project");
  const compatible = trackKind === "audio"
    ? asset.mediaType === "audio"
    : trackKind === "caption"
      ? ["document", "image"].includes(asset.mediaType)
      : ["video", "image"].includes(asset.mediaType);
  if (!compatible) {
    throw new ProductionProjectConflictError(
      `Asset ${assetId} (${asset.mediaType}) is not compatible with a ${trackKind} track`,
    );
  }
}

function assertCharacterReferenceAssets(project: ProductionProject, assetIds: string[]): void {
  const invalid = project.assets.find(
    (asset) => assetIds.includes(asset.id)
      && (asset.mediaType !== "image"
        || !["identity-reference", "appearance-reference"].includes(asset.role)),
  );
  if (invalid) {
    throw new ProductionProjectConflictError(
      `Character reference asset ${invalid.id} must be an identity-reference or appearance-reference image`,
    );
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
