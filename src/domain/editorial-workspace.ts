import { z } from "zod";
import type { EditorialTimeline } from "./editorial-timeline.js";

export const syncEditorialWorkspaceSchema = z.object({
  externalProjectId: z.string().trim().min(1).max(200).optional(),
  approvalMode: z.enum(["manual", "auto"]).default("manual"),
  assetBindings: z.record(z.uuid(), z.string().trim().min(1).max(300)),
});

export type SyncEditorialWorkspaceRequest = z.infer<typeof syncEditorialWorkspaceSchema>;

export interface EditorialWorkspaceCapabilities {
  provider: string;
  supportsMultitrack: boolean;
  supportsInPlaceReplacement: boolean;
  supportsMarkers: boolean;
  supportsManualReview: boolean;
  requiresPreimportedAssets: boolean;
}

export interface EditorialWorkspaceSyncInput extends SyncEditorialWorkspaceRequest {
  projectName: string;
  projectDescription: string;
  timeline: EditorialTimeline;
}

export interface EditorialWorkspaceSyncResult {
  provider: "openchatcut";
  projectId: string;
  editorUrl: string;
  editSessionId: string;
  status: "awaiting-review" | "applied";
  timelineVersion: number;
  createdTrackIds: string[];
  stagedClipCount: number;
  stagedMarkerCount: number;
}

export interface EditorialWorkspaceAdapter {
  capabilities(): EditorialWorkspaceCapabilities;
  syncTimeline(input: EditorialWorkspaceSyncInput): Promise<EditorialWorkspaceSyncResult>;
}

export class EditorialWorkspaceError extends Error {
  readonly code = "EDITORIAL_WORKSPACE_ERROR";

  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = "EditorialWorkspaceError";
  }
}
