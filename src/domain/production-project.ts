import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  completeProductionOperation,
  createProductionOperation,
  failProductionOperation,
  reviewProductionOperation,
  startProductionOperation,
  type CompleteProductionOperationInput,
  type CreateProductionOperationInput,
  type FailProductionOperationInput,
  type ProductionOperation,
  type ReviewProductionOperationInput,
  type StartProductionOperationInput,
} from "./production-operation.js";
import type { StoryProductionPlan } from "./story-production.js";
import type { EditorialTimeline } from "./editorial-timeline.js";

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
  "voiceover-take",
  "voiceover-master",
  "music",
  "sound-effect",
  "subtitle",
  "control-asset",
  "final-candidate",
  "accepted-shot",
  "editorial-preview",
  "assembly-master",
  "delivery-master",
  "other",
]);

export const projectAssetSourceSchema = z.enum([
  "user",
  "image-generation",
  "comfyui",
  "libtv",
  "online-video",
  "hyperframes",
  "editorial-workspace",
  "delivery",
]);

export const characterReferenceViewTypeSchema = z.enum([
  "front",
  "left-profile",
  "right-profile",
  "left-three-quarter",
  "right-three-quarter",
  "back",
  "full-body-front",
  "full-body-back",
  "expression-sheet",
  "wardrobe-detail",
  "turnaround-sheet",
  "other",
]);

export const characterReferenceViewSchema = z.object({
  assetId: z.uuid(),
  view: characterReferenceViewTypeSchema,
  notes: z.string().trim().max(1_000).optional(),
});

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

export const generationModeSchema = z.enum([
  "local-only",
  "paid-providers-approved",
]);

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
  generationMode: generationModeSchema.default("local-only"),
});

export const updateProductionProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    brief: z.string().trim().min(3).max(4_000).optional(),
    storySynopsis: z.string().trim().max(4_000).optional(),
    status: z.enum(["active", "archived"]).optional(),
    deliverySpec: deliverySpecSchema.optional(),
    workbenchBindings: workbenchBindingsSchema.optional(),
    generationMode: generationModeSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one project field is required");

export const addProjectAssetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  mediaType: projectAssetMediaTypeSchema,
  role: projectAssetRoleSchema,
  uri: z.url(),
  source: projectAssetSourceSchema.default("user"),
  tags: z.array(shortText).max(20).default([]),
  notes: optionalLongText,
  parentAssetId: z.uuid().optional(),
});

export const addCharacterPackSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalLongText,
  designBrief: optionalLongText,
  canonicalAssetId: z.uuid().optional(),
  referenceAssetIds: z.array(z.uuid()).max(12).default([]),
  referenceViews: z.array(characterReferenceViewSchema).max(12).default([]),
  consistencyNotes: optionalLongText,
  negativeConstraints: z.array(shortText).max(30).default([]),
}).superRefine((pack, context) => {
  const referenceIds = new Set(pack.referenceAssetIds);
  if (pack.canonicalAssetId && !referenceIds.has(pack.canonicalAssetId)) {
    context.addIssue({
      code: "custom",
      path: ["canonicalAssetId"],
      message: "Canonical asset must be included in referenceAssetIds",
    });
  }
  for (const [index, referenceView] of pack.referenceViews.entries()) {
    if (!referenceIds.has(referenceView.assetId)) {
      context.addIssue({
        code: "custom",
        path: ["referenceViews", index, "assetId"],
        message: "Reference view asset must be included in referenceAssetIds",
      });
    }
  }
  if (new Set(pack.referenceViews.map((view) => view.assetId)).size !== pack.referenceViews.length) {
    context.addIssue({
      code: "custom",
      path: ["referenceViews"],
      message: "Each character reference asset can have only one primary view",
    });
  }
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
export type ProjectAssetSource = z.infer<typeof projectAssetSourceSchema>;
export type CharacterReferenceViewType = z.infer<typeof characterReferenceViewTypeSchema>;
export type CharacterReferenceView = z.infer<typeof characterReferenceViewSchema>;
export type DeliverySpec = z.infer<typeof deliverySpecSchema>;
export type WorkbenchBindings = z.infer<typeof workbenchBindingsSchema>;
export type GenerationMode = z.infer<typeof generationModeSchema>;

export interface ProjectAsset {
  id: string;
  version: number;
  name: string;
  mediaType: ProjectAssetMediaType;
  role: ProjectAssetRole;
  uri: string;
  source: ProjectAssetSource;
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
  designBrief?: string;
  canonicalAssetId?: string;
  referenceAssetIds: string[];
  referenceViews: CharacterReferenceView[];
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
  generationMode: GenerationMode;
  orchestrationMode: "agent-directed";
  agentHost?: string;
  productionPlan?: StoryProductionPlan;
  operations: ProductionOperation[];
  assets: ProjectAsset[];
  characterPacks: CharacterPack[];
  scenePacks: ScenePack[];
  scenes: StoryScene[];
  editorialTimelines: EditorialTimeline[];
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
    generationMode: input.generationMode,
    orchestrationMode: "agent-directed",
    operations: [],
    assets: [],
    characterPacks: [],
    scenePacks: [],
    scenes: [],
    editorialTimelines: [],
    videoJobIds: [],
  };
}

export function saveProductionPlan(
  project: ProductionProject,
  productionPlan: StoryProductionPlan,
  agentHost: string,
  now = new Date(),
): ProductionProject {
  return touchProject({ ...project, productionPlan, agentHost }, now);
}

export function appendProductionOperation(
  project: ProductionProject,
  input: CreateProductionOperationInput,
  now = new Date(),
): ProductionProject {
  return touchProject(
    { ...project, operations: [...project.operations, createProductionOperation(input, now)] },
    now,
  );
}

export function startProjectOperation(
  project: ProductionProject,
  operationId: string,
  input: StartProductionOperationInput,
  now = new Date(),
): ProductionProject {
  return replaceProjectOperation(project, operationId, (operation) =>
    startProductionOperation(operation, input, now), now);
}

export function completeProjectOperation(
  project: ProductionProject,
  operationId: string,
  input: CompleteProductionOperationInput,
  now = new Date(),
): ProductionProject {
  return replaceProjectOperation(project, operationId, (operation) =>
    completeProductionOperation(operation, input, now), now);
}

export function failProjectOperation(
  project: ProductionProject,
  operationId: string,
  input: FailProductionOperationInput,
  now = new Date(),
): ProductionProject {
  return replaceProjectOperation(project, operationId, (operation) =>
    failProductionOperation(operation, input, now), now);
}

export function reviewProjectOperation(
  project: ProductionProject,
  operationId: string,
  input: ReviewProductionOperationInput,
  now = new Date(),
): ProductionProject {
  return replaceProjectOperation(project, operationId, (operation) =>
    reviewProductionOperation(operation, input, now), now);
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
  if (input.generationMode !== undefined) updated.generationMode = input.generationMode;
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
    referenceViews: input.referenceViews,
    negativeConstraints: input.negativeConstraints,
    createdAt: now.toISOString(),
    ...(input.description ? { description: input.description } : {}),
    ...(input.designBrief ? { designBrief: input.designBrief } : {}),
    ...(input.canonicalAssetId ? { canonicalAssetId: input.canonicalAssetId } : {}),
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

export function appendEditorialTimeline(
  project: ProductionProject,
  timeline: EditorialTimeline,
  now = new Date(),
): ProductionProject {
  return touchProject({
    ...project,
    editorialTimelines: [...project.editorialTimelines, timeline],
  }, now);
}

export function replaceEditorialTimeline(
  project: ProductionProject,
  timeline: EditorialTimeline,
  now = new Date(),
): ProductionProject {
  if (!project.editorialTimelines.some((candidate) => candidate.id === timeline.id)) {
    throw new Error(`Editorial timeline ${timeline.id} not found`);
  }
  return touchProject({
    ...project,
    editorialTimelines: project.editorialTimelines.map((candidate) =>
      candidate.id === timeline.id ? timeline : candidate),
  }, now);
}

function touchProject(project: ProductionProject, now: Date): ProductionProject {
  return {
    ...project,
    version: project.version + 1,
    updatedAt: now.toISOString(),
  };
}

function replaceProjectOperation(
  project: ProductionProject,
  operationId: string,
  update: (operation: ProductionOperation) => ProductionOperation,
  now: Date,
): ProductionProject {
  const operation = project.operations.find((item) => item.id === operationId);
  if (!operation) throw new Error(`Production operation ${operationId} not found`);
  return touchProject({
    ...project,
    operations: project.operations.map((item) => item.id === operationId ? update(item) : item),
  }, now);
}
