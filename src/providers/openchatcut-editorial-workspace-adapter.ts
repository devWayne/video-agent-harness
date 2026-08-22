import {
  EditorialWorkspaceError,
  type EditorialWorkspaceAdapter,
  type EditorialWorkspaceSyncInput,
  type EditorialWorkspaceSyncResult,
} from "../domain/editorial-workspace.js";
import type { EditorialTrack, EditorialTrackKind } from "../domain/editorial-timeline.js";
import type { OpenChatCutToolClient } from "./openchatcut-mcp-client.js";

export interface OpenChatCutEditorialWorkspaceAdapterOptions {
  clientFactory: () => OpenChatCutToolClient;
  editorBaseUrl: string;
}

interface OpenChatCutTrack {
  id: string;
  name?: string;
  alias?: string;
  trackType?: string;
}

interface OpenChatCutTimeline {
  fps: number;
  width?: number;
  height?: number;
  name?: string;
}

export class OpenChatCutEditorialWorkspaceAdapter implements EditorialWorkspaceAdapter {
  constructor(private readonly options: OpenChatCutEditorialWorkspaceAdapterOptions) {}

  capabilities() {
    return {
      provider: "openchatcut",
      supportsMultitrack: true,
      supportsInPlaceReplacement: true,
      supportsMarkers: true,
      supportsManualReview: true,
      requiresPreimportedAssets: true,
    } as const;
  }

  async syncTimeline(input: EditorialWorkspaceSyncInput): Promise<EditorialWorkspaceSyncResult> {
    assertEveryAssetIsBound(input);
    const client = this.options.clientFactory();
    try {
      const project = input.externalProjectId
        ? await this.targetProject(client, input.externalProjectId)
        : await this.createProject(client, input);
      const projectId = input.externalProjectId ?? requiredString(project, "projectId", "id");
      const editorUrl = optionalString(project, "editorUrl")
        ?? `${this.options.editorBaseUrl.replace(/\/$/, "")}/#/editor/${encodeURIComponent(projectId)}`;
      if (!input.externalProjectId) await this.targetProject(client, projectId);

      const begun = await client.callTool("begin_edit_session", {
        clientName: "Video Agent Harness",
        approvalMode: input.approvalMode,
      });
      const editSessionId = requiredString(begun, "editSessionId", "id");
      const externalTimeline = parseActiveTimeline(await client.callTool("read_project", {
        editSessionId,
      }));
      const externalFps = externalTimeline?.fps ?? input.timeline.fps;
      if (externalTimeline && (
        externalTimeline.name !== input.timeline.name
        || externalTimeline.width !== input.timeline.width
        || externalTimeline.height !== input.timeline.height
      )) {
        await client.callTool("manage_timelines", {
          action: "update",
          editSessionId,
          name: input.timeline.name,
          width: input.timeline.width,
          height: input.timeline.height,
          fit: "contain",
        });
      }
      const existingTracks = parseTracks(await client.callTool("edit_track", {
        action: "list",
        editSessionId,
      }));
      const { mapping, createdTrackIds } = await this.ensureTracks(client, input.timeline.tracks, existingTracks, editSessionId);

      let stagedClipCount = 0;
      for (const track of input.timeline.tracks) {
        if (track.clips.length === 0) continue;
        const trackId = mapping.get(track.id);
        if (!trackId) throw new EditorialWorkspaceError(`OpenChatCut track mapping missing for ${track.name}`);
        const adds = track.clips.map((clip) => ({
          type: openChatCutMediaType(track.kind),
          assetId: input.assetBindings[clip.assetId],
          trackId,
          fromFrame: convertFrame(clip.timelineStartFrame, input.timeline.fps, externalFps),
          durationInFrames: Math.max(1, convertFrame(clip.durationFrames, input.timeline.fps, externalFps)),
        }));
        await client.callTool("edit_item", { adds, editSessionId });
        stagedClipCount += adds.length;
      }

      if (input.timeline.markers.length > 0) {
        await client.callTool("manage_markers", {
          action: "create",
          markers: input.timeline.markers.map((marker) => ({
            fromFrame: convertFrame(marker.frame, input.timeline.fps, externalFps),
            durationFrames: convertFrame(marker.durationFrames ?? 0, input.timeline.fps, externalFps),
            note: marker.note ? `${marker.label}: ${marker.note}` : marker.label,
            color: marker.status === "resolved" ? "green" : "yellow",
            scope: "project",
          })),
          editSessionId,
        });
      }

      const reviewed = await client.callTool("review_edit_session", {
        editSessionId,
        summary: `Sync Harness timeline ${input.timeline.name} v${input.timeline.version}: ${stagedClipCount} clips, ${input.timeline.markers.length} markers`,
      });
      const rawStatus = optionalString(reviewed, "status") ?? "awaiting_review";
      const status = rawStatus === "applied" ? "applied" : "awaiting-review";
      return {
        provider: "openchatcut",
        projectId,
        editorUrl,
        editSessionId,
        status,
        timelineVersion: input.timeline.version,
        createdTrackIds,
        stagedClipCount,
        stagedMarkerCount: input.timeline.markers.length,
      };
    } finally {
      await client.close();
    }
  }

  private createProject(client: OpenChatCutToolClient, input: EditorialWorkspaceSyncInput) {
    return client.callTool("create_project", {
      name: input.projectName,
      description: input.projectDescription,
      compositionWidth: input.timeline.width,
      compositionHeight: input.timeline.height,
      fps: input.timeline.fps,
      editorBaseUrl: this.options.editorBaseUrl,
    });
  }

  private targetProject(client: OpenChatCutToolClient, projectId: string) {
    return client.callTool("target_project", {
      projectId,
      editorBaseUrl: this.options.editorBaseUrl,
    });
  }

  private async ensureTracks(
    client: OpenChatCutToolClient,
    tracks: EditorialTrack[],
    existing: OpenChatCutTrack[],
    editSessionId: string,
  ): Promise<{ mapping: Map<string, string>; createdTrackIds: string[] }> {
    const mapping = new Map<string, string>();
    const createdTrackIds: string[] = [];
    const available = [...existing];
    for (const track of tracks) {
      const sameName = available.find((candidate) => candidate.name === track.name);
      const compatible = sameName ?? available.find((candidate) =>
        ![...mapping.values()].includes(candidate.id) && compatibleTrackType(candidate, track.kind));
      if (compatible) {
        mapping.set(track.id, compatible.id);
        continue;
      }
      const created = await client.callTool("edit_track", {
        action: "create",
        json: JSON.stringify({
          trackType: openChatCutTrackType(track.kind),
          name: track.name,
          role: track.role,
        }),
        editSessionId,
      });
      const createdTracks = parseTracks(created);
      const createdTrack = createdTracks.find((candidate) => candidate.name === track.name)
        ?? createdTracks.find((candidate) =>
          !available.some((existingTrack) => existingTrack.id === candidate.id)
          && compatibleTrackType(candidate, track.kind))
        ?? createdTracks.at(-1);
      if (!createdTrack) throw new EditorialWorkspaceError(`OpenChatCut did not return the created track ${track.name}`);
      mapping.set(track.id, createdTrack.id);
      createdTrackIds.push(createdTrack.id);
      available.push(createdTrack);
    }
    return { mapping, createdTrackIds };
  }
}

function assertEveryAssetIsBound(input: EditorialWorkspaceSyncInput): void {
  const missing = input.timeline.tracks
    .flatMap((track) => track.clips.map((clip) => clip.assetId))
    .filter((assetId) => !input.assetBindings[assetId]);
  if (missing.length > 0) {
    throw new EditorialWorkspaceError(
      `OpenChatCut assetBindings is missing ${[...new Set(missing)].join(", ")}; import media first and bind Harness asset IDs to pool asset IDs`,
    );
  }
}

function parseTracks(value: Record<string, unknown>): OpenChatCutTrack[] {
  const candidate = Array.isArray(value.result)
    ? value.result
    : Array.isArray(value.tracks)
      ? value.tracks
      : Array.isArray(value.created)
        ? value.created
        : [];
  return candidate.filter((item): item is OpenChatCutTrack =>
    Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"));
}

function parseActiveTimeline(value: Record<string, unknown>): OpenChatCutTimeline | undefined {
  const candidate = value.timeline;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const timeline = candidate as Record<string, unknown>;
  if (typeof timeline.fps !== "number" || !Number.isFinite(timeline.fps) || timeline.fps <= 0) return undefined;
  return {
    fps: timeline.fps,
    ...(typeof timeline.width === "number" ? { width: timeline.width } : {}),
    ...(typeof timeline.height === "number" ? { height: timeline.height } : {}),
    ...(typeof timeline.name === "string" ? { name: timeline.name } : {}),
  };
}

function convertFrame(frame: number, sourceFps: number, targetFps: number): number {
  return Math.round(frame * targetFps / sourceFps);
}

function requiredString(value: Record<string, unknown>, ...keys: string[]): string {
  const result = optionalString(value, ...keys);
  if (!result) throw new EditorialWorkspaceError(`OpenChatCut response is missing ${keys.join("/")}`);
  return result;
}

function optionalString(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key]) return value[key];
    const result = value.result;
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const nested = (result as Record<string, unknown>)[key];
      if (typeof nested === "string" && nested) return nested;
    }
  }
  return undefined;
}

function openChatCutTrackType(kind: EditorialTrackKind): "video" | "audio" | "caption" {
  if (kind === "audio") return "audio";
  if (kind === "caption") return "caption";
  return "video";
}

function openChatCutMediaType(kind: EditorialTrackKind): "video" | "audio" | "image" {
  if (kind === "audio") return "audio";
  if (kind === "overlay" || kind === "caption") return "image";
  return "video";
}

function compatibleTrackType(track: OpenChatCutTrack, kind: EditorialTrackKind): boolean {
  const expected = openChatCutTrackType(kind);
  if (track.trackType) return track.trackType === expected;
  if (track.alias) {
    if (expected === "audio") return track.alias.startsWith("A");
    if (expected === "caption") return track.alias.startsWith("C");
    return track.alias.startsWith("V");
  }
  return false;
}
