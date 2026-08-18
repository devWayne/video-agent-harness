import { randomUUID } from "node:crypto";
import { z } from "zod";

const shortText = z.string().trim().min(1).max(200);
const optionalLongText = z.string().trim().max(4_000).optional();

export const projectAssetMediaTypeSchema = z.enum([
  "image",
  "video",
  "audio",
  "document",
  "workflow",
]);

export const projectAssetRoleSchema = z.enum([
  "identity-reference",
  "appearance-reference",
  "action-reference",
  "camera-reference",
  "scene-reference",
  "style-reference",
  "voice-reference",
  "music",
  "control-asset",
  "final-candidate",
  "delivery-master",
  "other",
]);

export const deliverySpecSchema = z.object({
  aspectRatio: z.literal("16:9").default("16:9"),
  width: z.literal(3840).default(3840),
  height: z.literal(2160).default(2160),
  fps: z.number().int().min(12).max(60).default(24),
});

export const workbenchBindingsSchema = z.object({
  comfyuiProfileId: z.string().trim().max(200).optional(),
  comfyuiUrl: z.url().optional(),
  libtvCanvasUuid: z.uuid().optional(),
  libtvCanvasUrl: z.url().optional(),
});

export const createProductionProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brief: z.string().trim().min(3).max(4_000),
  storySynopsis: z.string().trim().max(4_000).default(""),
  deliverySpec: deliverySpecSchema.default({
    aspectRatio: "16:9",
    width: 3840,
    height: 2160,
    fps: 24,
  }),
  workbenchBindings: workbenchBindingsSchema.default({}),
});

export const updateProductionProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    brief: z.string().trim().min(3).max(4_000).optional(),
    storySynopsis: z.string().trim().max(4_000).optional(),
    status: z.enum(["active", "archived"]).optional(),
    deliverySpec: deliverySpecSchema.optional(),
    workbenchBindings: workbenchBindingsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one project field is required");

export const addProjectAssetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  mediaType: projectAssetMediaTypeSchema,
  role: projectAssetRoleSchema,
  uri: z.url(),
  source: z.enum(["user", "comfyui", "libtv", "hyperframes", "delivery"]).default("user"),
  tags: z.array(shortText).max(20).default([]),
  notes: optionalLongText,
  parentAssetId: z.uuid().optional(),
});

export const addCharacterPackSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalLongText,
  referenceAssetIds: z.array(z.uuid()).max(12).default([]),
  consistencyNotes: optionalLongText,
  negativeConstraints: z.array(shortText).max(30).default([]),
});

export const addScenePackSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalLongText,
  referenceAssetIds: z.array(z.uuid()).max(20).default([]),
  location: z.string().trim().max(300).default(""),
  lighting: z.string().trim().max(300).default(""),
  continuityNotes: optionalLongText,
});

export const addStorySceneSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(2_000),
  durationSeconds: z.number().int().min(5).max(300),
  characterPackIds: z.array(z.uuid()).max(20).default([]),
  scenePackId: z.uuid().optional(),
  shotBriefs: z.array(z.string().trim().min(1).max(1_000)).max(60).default([]),
});

export type CreateProductionProjectInput = z.infer<typeof createProductionProjectSchema>;
export type UpdateProductionProjectInput = z.infer<typeof updateProductionProjectSchema>;
export type AddProjectAssetInput = z.infer<typeof addProjectAssetSchema>;
export type AddCharacterPackInput = z.infer<typeof addCharacterPackSchema>;
export type AddScenePackInput = z.infer<typeof addScenePackSchema>;
export type AddStorySceneInput = z.infer<typeof addStorySceneSchema>;
export type ProjectAssetMediaType = z.infer<typeof projectAssetMediaTypeSchema>;
export type ProjectAssetRole = z.infer<typeof projectAssetRoleSchema>;
export type DeliverySpec = z.infer<typeof deliverySpecSchema>;
export type WorkbenchBindings = z.infer<typeof workbenchBindingsSchema>;

export interface ProjectAsset {
  id: string;
  version: number;
  name: string;
  mediaType: ProjectAssetMediaType;
  role: ProjectAssetRole;
  uri: string;
  source: "user" | "comfyui" | "libtv" | "hyperframes" | "delivery";
  tags: string[];
  notes?: string;
  parentAssetId?: string;
  createdAt: string;
}

export interface CharacterPack {
  id: string;
  version: number;
  name: string;
  description?: string;
  referenceAssetIds: string[];
  consistencyNotes?: string;
  negativeConstraints: string[];
  createdAt: string;
}

export interface ScenePack {
  id: string;
  version: number;
  name: string;
  description?: string;
  referenceAssetIds: string[];
  location: string;
  lighting: string;
  continuityNotes?: string;
  createdAt: string;
}

export interface StoryScene {
  id: string;
  index: number;
  title: string;
  summary: string;
  durationSeconds: number;
  characterPackIds: string[];
  scenePackId?: string;
  shotBriefs: string[];
  videoJobIds: string[];
  createdAt: string;
}

export interface ProductionProject {
  id: string;
  name: string;
  brief: string;
  storySynopsis: string;
  status: "active" | "archived";
  version: number;
  createdAt: string;
  updatedAt: string;
  deliverySpec: DeliverySpec;
  workbenchBindings: WorkbenchBindings;
  assets: ProjectAsset[];
  characterPacks: CharacterPack[];
  scenePacks: ScenePack[];
  scenes: StoryScene[];
  videoJobIds: string[];
}

export function createProductionProject(
  input: CreateProductionProjectInput,
  now = new Date(),
): ProductionProject {
  const timestamp = now.toISOString();
  return {
    id: randomUUID(),
    name: input.name,
    brief: input.brief,
    storySynopsis: input.storySynopsis,
    status: "active",
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deliverySpec: input.deliverySpec,
    workbenchBindings: input.workbenchBindings,
    assets: [],
    characterPacks: [],
    scenePacks: [],
    scenes: [],
    videoJobIds: [],
  };
}

export function updateProductionProject(
  project: ProductionProject,
  input: UpdateProductionProjectInput,
  now = new Date(),
): ProductionProject {
  const updated = { ...project };
  if (input.name !== undefined) updated.name = input.name;
  if (input.brief !== undefined) updated.brief = input.brief;
  if (input.storySynopsis !== undefined) updated.storySynopsis = input.storySynopsis;
  if (input.status !== undefined) updated.status = input.status;
  if (input.deliverySpec !== undefined) updated.deliverySpec = input.deliverySpec;
  if (input.workbenchBindings !== undefined) updated.workbenchBindings = input.workbenchBindings;
  return touchProject(updated, now);
}

export function addProjectAsset(
  project: ProductionProject,
  input: AddProjectAssetInput,
  now = new Date(),
): ProductionProject {
  const createdAt = now.toISOString();
  const version = input.parentAssetId
    ? Math.max(
        0,
        ...project.assets
          .filter((asset) => asset.id === input.parentAssetId || asset.parentAssetId === input.parentAssetId)
          .map((asset) => asset.version),
      ) + 1
    : 1;
  const asset: ProjectAsset = {
    id: randomUUID(),
    version,
    name: input.name,
    mediaType: input.mediaType,
    role: input.role,
    uri: input.uri,
    source: input.source,
    tags: input.tags,
    createdAt,
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.parentAssetId ? { parentAssetId: input.parentAssetId } : {}),
  };
  return touchProject({ ...project, assets: [...project.assets, asset] }, now);
}

export function addCharacterPack(
  project: ProductionProject,
  input: AddCharacterPackInput,
  now = new Date(),
): ProductionProject {
  const pack: CharacterPack = {
    id: randomUUID(),
    version: 1,
    name: input.name,
    referenceAssetIds: input.referenceAssetIds,
    negativeConstraints: input.negativeConstraints,
    createdAt: now.toISOString(),
    ...(input.description ? { description: input.description } : {}),
    ...(input.consistencyNotes ? { consistencyNotes: input.consistencyNotes } : {}),
  };
  return touchProject({ ...project, characterPacks: [...project.characterPacks, pack] }, now);
}

export function addScenePack(
  project: ProductionProject,
  input: AddScenePackInput,
  now = new Date(),
): ProductionProject {
  const pack: ScenePack = {
    id: randomUUID(),
    version: 1,
    name: input.name,
    referenceAssetIds: input.referenceAssetIds,
    location: input.location,
    lighting: input.lighting,
    createdAt: now.toISOString(),
    ...(input.description ? { description: input.description } : {}),
    ...(input.continuityNotes ? { continuityNotes: input.continuityNotes } : {}),
  };
  return touchProject({ ...project, scenePacks: [...project.scenePacks, pack] }, now);
}

export function addStoryScene(
  project: ProductionProject,
  input: AddStorySceneInput,
  now = new Date(),
): ProductionProject {
  const scene: StoryScene = {
    id: randomUUID(),
    index: project.scenes.length,
    title: input.title,
    summary: input.summary,
    durationSeconds: input.durationSeconds,
    characterPackIds: input.characterPackIds,
    shotBriefs: input.shotBriefs,
    videoJobIds: [],
    createdAt: now.toISOString(),
    ...(input.scenePackId ? { scenePackId: input.scenePackId } : {}),
  };
  return touchProject({ ...project, scenes: [...project.scenes, scene] }, now);
}

export function attachVideoJob(
  project: ProductionProject,
  jobId: string,
  sceneId: string | undefined,
  now = new Date(),
): ProductionProject {
  const videoJobIds = project.videoJobIds.includes(jobId)
    ? project.videoJobIds
    : [...project.videoJobIds, jobId];
  const scenes = sceneId
    ? project.scenes.map((scene) =>
        scene.id === sceneId && !scene.videoJobIds.includes(jobId)
          ? { ...scene, videoJobIds: [...scene.videoJobIds, jobId] }
          : scene,
      )
    : project.scenes;
  return touchProject({ ...project, videoJobIds, scenes }, now);
}

function touchProject(project: ProductionProject, now: Date): ProductionProject {
  return {
    ...project,
    version: project.version + 1,
    updatedAt: now.toISOString(),
  };
}
