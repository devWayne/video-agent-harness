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
  createProductionProject,
  createProductionProjectSchema,
  updateProductionProject,
  updateProductionProjectSchema,
  type ProductionProject,
} from "../domain/production-project.js";
import type { ProductionProjectRepository } from "../infrastructure/production-project-repository.js";
import type { VideoJobRepository } from "../infrastructure/video-job-repository.js";

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
