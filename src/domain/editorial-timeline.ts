import { randomUUID } from "node:crypto";
import { z } from "zod";

export const editorialTrackKindSchema = z.enum(["video", "audio", "overlay", "caption"]);
export const editorialTrackRoleSchema = z.enum([
  "picture",
  "brand-overlay",
  "captions",
  "original-audio",
  "voiceover",
  "music",
  "sound-effects",
]);

const initialClipSchema = z.object({
  assetId: z.uuid(),
  candidateAssetIds: z.array(z.uuid()).max(30).default([]),
  shotId: z.uuid().optional(),
  timelineStartFrame: z.number().int().min(0),
  durationFrames: z.number().int().min(1),
  sourceInFrame: z.number().int().min(0).default(0),
  playbackRate: z.number().min(0.1).max(8).default(1),
  volumeDb: z.number().min(-96).max(24).optional(),
  fadeInFrames: z.number().int().min(0).default(0),
  fadeOutFrames: z.number().int().min(0).default(0),
  transition: z.enum(["cut", "crossfade", "dip-to-black"]).default("cut"),
});

const initialTrackSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: editorialTrackKindSchema,
  role: editorialTrackRoleSchema,
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  gainDb: z.number().min(-96).max(24).default(0),
  clips: z.array(initialClipSchema).max(500).default([]),
});

export const createEditorialTimelineSchema = z.object({
  name: z.string().trim().min(1).max(160),
  fps: z.number().int().min(12).max(60).default(24),
  width: z.number().int().min(320).max(7680).default(3840),
  height: z.number().int().min(240).max(4320).default(2160),
  tracks: z.array(initialTrackSchema).max(40).optional(),
});

export const replaceEditorialClipSchema = z.object({
  assetId: z.uuid(),
  mode: z.enum(["preserve-slot", "ripple"]).default("preserve-slot"),
  sourceInFrame: z.number().int().min(0).default(0),
  durationFrames: z.number().int().min(1).optional(),
  note: z.string().trim().max(2_000).optional(),
});

export const addEditorialMarkerSchema = z.object({
  frame: z.number().int().min(0),
  durationFrames: z.number().int().min(1).optional(),
  label: z.string().trim().min(1).max(160),
  note: z.string().trim().max(2_000).optional(),
  status: z.enum(["open", "resolved"]).default("open"),
  clipId: z.uuid().optional(),
});

export const lockEditorialTimelineSchema = z.object({
  lockedBy: z.string().trim().min(1).max(160),
  note: z.string().trim().max(2_000).optional(),
});

export const recordEditorialWorkspaceSyncSchema = z.object({
  provider: z.literal("openchatcut"),
  projectId: z.string().trim().min(1).max(200),
  editorUrl: z.url(),
  externalTimelineId: z.string().trim().min(1).max(200).optional(),
  syncStatus: z.enum(["awaiting-review", "applied"]),
  editSessionId: z.string().trim().min(1).max(200),
});

export type CreateEditorialTimelineInput = z.infer<typeof createEditorialTimelineSchema>;
export type ReplaceEditorialClipInput = z.infer<typeof replaceEditorialClipSchema>;
export type AddEditorialMarkerInput = z.infer<typeof addEditorialMarkerSchema>;
export type LockEditorialTimelineInput = z.infer<typeof lockEditorialTimelineSchema>;
export type RecordEditorialWorkspaceSyncInput = z.infer<typeof recordEditorialWorkspaceSyncSchema>;
export type EditorialTrackKind = z.infer<typeof editorialTrackKindSchema>;
export type EditorialTrackRole = z.infer<typeof editorialTrackRoleSchema>;

export interface EditorialClip {
  id: string;
  assetId: string;
  candidateAssetIds: string[];
  shotId?: string;
  timelineStartFrame: number;
  durationFrames: number;
  sourceInFrame: number;
  playbackRate: number;
  volumeDb?: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  transition: "cut" | "crossfade" | "dip-to-black";
  replacementNote?: string;
}

export interface EditorialTrack {
  id: string;
  name: string;
  kind: EditorialTrackKind;
  role: EditorialTrackRole;
  order: number;
  muted: boolean;
  locked: boolean;
  gainDb: number;
  clips: EditorialClip[];
}

export interface EditorialMarker {
  id: string;
  frame: number;
  durationFrames?: number;
  label: string;
  note?: string;
  status: "open" | "resolved";
  clipId?: string;
  createdAt: string;
}

export interface EditorialRevisionLock {
  revision: number;
  lockedAt: string;
  lockedBy: string;
  note?: string;
}

export interface EditorialWorkspaceBinding {
  provider: "openchatcut";
  projectId: string;
  editorUrl: string;
  externalTimelineId?: string;
  syncStatus: "awaiting-review" | "applied";
  editSessionId: string;
  lastSyncedTimelineVersion: number;
  syncedAt: string;
}

export interface EditorialDeliveryRevision {
  assetId: string;
  pictureRevision: number;
  audioRevision: number;
  recordedAt: string;
}

export interface EditorialTimeline {
  id: string;
  version: number;
  name: string;
  fps: number;
  width: number;
  height: number;
  tracks: EditorialTrack[];
  markers: EditorialMarker[];
  pictureRevision: number;
  audioRevision: number;
  pictureLock?: EditorialRevisionLock;
  audioLock?: EditorialRevisionLock;
  delivery?: EditorialDeliveryRevision;
  workspace?: EditorialWorkspaceBinding;
  createdAt: string;
  updatedAt: string;
}

const defaultTracks: ReadonlyArray<Pick<EditorialTrack, "name" | "kind" | "role">> = [
  { name: "V1 Picture", kind: "video", role: "picture" },
  { name: "V2 Brand Overlay", kind: "overlay", role: "brand-overlay" },
  { name: "C1 Captions", kind: "caption", role: "captions" },
  { name: "A1 Original", kind: "audio", role: "original-audio" },
  { name: "A2 Voice-over", kind: "audio", role: "voiceover" },
  { name: "A3 Music", kind: "audio", role: "music" },
  { name: "A4 Sound Effects", kind: "audio", role: "sound-effects" },
];

export function createEditorialTimeline(
  input: CreateEditorialTimelineInput,
  now = new Date(),
): EditorialTimeline {
  const timestamp = now.toISOString();
  const sourceTracks = input.tracks ?? defaultTracks.map((track) => ({ ...track, muted: false, locked: false, gainDb: 0, clips: [] }));
  const tracks = sourceTracks.map((track, order): EditorialTrack => ({
    id: randomUUID(),
    name: track.name,
    kind: track.kind,
    role: track.role,
    order,
    muted: track.muted,
    locked: track.locked,
    gainDb: track.gainDb,
    clips: track.clips.map((clip): EditorialClip => ({
      id: randomUUID(),
      assetId: clip.assetId,
      candidateAssetIds: unique([clip.assetId, ...clip.candidateAssetIds]),
      timelineStartFrame: clip.timelineStartFrame,
      durationFrames: clip.durationFrames,
      sourceInFrame: clip.sourceInFrame,
      playbackRate: clip.playbackRate,
      fadeInFrames: clip.fadeInFrames,
      fadeOutFrames: clip.fadeOutFrames,
      transition: clip.transition,
      ...(clip.shotId ? { shotId: clip.shotId } : {}),
      ...(clip.volumeDb !== undefined ? { volumeDb: clip.volumeDb } : {}),
    })),
  }));
  assertTrackRoles(tracks);
  assertNoOverlappingClips(tracks);
  return {
    id: randomUUID(),
    version: 1,
    name: input.name,
    fps: input.fps,
    width: input.width,
    height: input.height,
    tracks,
    markers: [],
    pictureRevision: 1,
    audioRevision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function replaceEditorialClip(
  timeline: EditorialTimeline,
  clipId: string,
  input: ReplaceEditorialClipInput,
  now = new Date(),
): EditorialTimeline {
  const located = findClip(timeline, clipId);
  if (located.track.locked) throw new EditorialTimelineError("TRACK_LOCKED", "The target track is locked");
  const nextDuration = input.durationFrames ?? located.clip.durationFrames;
  const delta = input.mode === "ripple" ? nextDuration - located.clip.durationFrames : 0;
  const oldEnd = located.clip.timelineStartFrame + located.clip.durationFrames;
  const replacement: EditorialClip = {
    ...located.clip,
    assetId: input.assetId,
    candidateAssetIds: unique([...located.clip.candidateAssetIds, located.clip.assetId, input.assetId]),
    sourceInFrame: input.sourceInFrame,
    durationFrames: nextDuration,
    ...(input.note ? { replacementNote: input.note } : {}),
  };
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id === clipId) return replacement;
      if (delta !== 0 && clip.timelineStartFrame >= oldEnd) {
        return { ...clip, timelineStartFrame: clip.timelineStartFrame + delta };
      }
      return clip;
    }),
  }));
  assertNoOverlappingClips(tracks);
  const markers = delta === 0
    ? timeline.markers
    : timeline.markers.map((marker) => marker.frame >= oldEnd ? { ...marker, frame: marker.frame + delta } : marker);
  const changesPicture = located.track.kind !== "audio" || delta !== 0;
  const changesAudio = located.track.kind === "audio" || delta !== 0;
  return touchTimeline({
    ...timeline,
    tracks,
    markers,
    pictureRevision: timeline.pictureRevision + (changesPicture ? 1 : 0),
    audioRevision: timeline.audioRevision + (changesAudio ? 1 : 0),
  }, now);
}

export function addEditorialMarker(
  timeline: EditorialTimeline,
  input: AddEditorialMarkerInput,
  now = new Date(),
): EditorialTimeline {
  if (input.clipId && !timeline.tracks.some((track) => track.clips.some((clip) => clip.id === input.clipId))) {
    throw new EditorialTimelineError("CLIP_NOT_FOUND", "Marker clip does not exist on this timeline");
  }
  const marker: EditorialMarker = {
    id: randomUUID(),
    frame: input.frame,
    label: input.label,
    status: input.status,
    createdAt: now.toISOString(),
    ...(input.durationFrames !== undefined ? { durationFrames: input.durationFrames } : {}),
    ...(input.note ? { note: input.note } : {}),
    ...(input.clipId ? { clipId: input.clipId } : {}),
  };
  return touchTimeline({ ...timeline, markers: [...timeline.markers, marker] }, now);
}

export function lockEditorialPicture(
  timeline: EditorialTimeline,
  input: LockEditorialTimelineInput,
  now = new Date(),
): EditorialTimeline {
  return touchTimeline({
    ...timeline,
    pictureLock: revisionLock(timeline.pictureRevision, input, now),
  }, now);
}

export function lockEditorialAudio(
  timeline: EditorialTimeline,
  input: LockEditorialTimelineInput,
  now = new Date(),
): EditorialTimeline {
  return touchTimeline({
    ...timeline,
    audioLock: revisionLock(timeline.audioRevision, input, now),
  }, now);
}

export function recordEditorialWorkspaceSync(
  timeline: EditorialTimeline,
  input: RecordEditorialWorkspaceSyncInput,
  now = new Date(),
): EditorialTimeline {
  const nextVersion = timeline.version + 1;
  const workspace: EditorialWorkspaceBinding = {
    provider: input.provider,
    projectId: input.projectId,
    editorUrl: input.editorUrl,
    syncStatus: input.syncStatus,
    editSessionId: input.editSessionId,
    lastSyncedTimelineVersion: nextVersion,
    syncedAt: now.toISOString(),
    ...(input.externalTimelineId ? { externalTimelineId: input.externalTimelineId } : {}),
  };
  return { ...timeline, version: nextVersion, workspace, updatedAt: now.toISOString() };
}

export function editorialTimelineState(timeline: EditorialTimeline) {
  return {
    pictureLocked: timeline.pictureLock?.revision === timeline.pictureRevision,
    audioLocked: timeline.audioLock?.revision === timeline.audioRevision,
    deliveryCurrent:
      timeline.delivery?.pictureRevision === timeline.pictureRevision
      && timeline.delivery.audioRevision === timeline.audioRevision,
  };
}

export class EditorialTimelineError extends Error {
  constructor(readonly code: "TIMELINE_NOT_FOUND" | "CLIP_NOT_FOUND" | "TRACK_LOCKED" | "INVALID_TIMELINE", message: string) {
    super(message);
    this.name = "EditorialTimelineError";
  }
}

function findClip(timeline: EditorialTimeline, clipId: string): { track: EditorialTrack; clip: EditorialClip } {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { track, clip };
  }
  throw new EditorialTimelineError("CLIP_NOT_FOUND", `Editorial clip ${clipId} was not found`);
}

function revisionLock(revision: number, input: LockEditorialTimelineInput, now: Date): EditorialRevisionLock {
  return {
    revision,
    lockedAt: now.toISOString(),
    lockedBy: input.lockedBy,
    ...(input.note ? { note: input.note } : {}),
  };
}

function touchTimeline(timeline: EditorialTimeline, now: Date): EditorialTimeline {
  return { ...timeline, version: timeline.version + 1, updatedAt: now.toISOString() };
}

function assertTrackRoles(tracks: EditorialTrack[]): void {
  for (const track of tracks) {
    const audioRole = ["original-audio", "voiceover", "music", "sound-effects"].includes(track.role);
    if ((track.kind === "audio") !== audioRole) {
      throw new EditorialTimelineError("INVALID_TIMELINE", `Track ${track.name} has an incompatible kind and role`);
    }
  }
}

function assertNoOverlappingClips(tracks: EditorialTrack[]): void {
  for (const track of tracks) {
    const clips = [...track.clips].sort((left, right) => left.timelineStartFrame - right.timelineStartFrame);
    for (let index = 1; index < clips.length; index += 1) {
      const previous = clips[index - 1]!;
      const current = clips[index]!;
      if (previous.timelineStartFrame + previous.durationFrames > current.timelineStartFrame) {
        throw new EditorialTimelineError("INVALID_TIMELINE", `Track ${track.name} contains overlapping clips`);
      }
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
