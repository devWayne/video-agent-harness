import { describe, expect, it } from "vitest";
import { createEditorialTimeline, createEditorialTimelineSchema } from "../src/domain/editorial-timeline.js";
import { OpenChatCutEditorialWorkspaceAdapter } from "../src/providers/openchatcut-editorial-workspace-adapter.js";
import type { OpenChatCutToolClient } from "../src/providers/openchatcut-mcp-client.js";

const videoAssetId = "11111111-1111-4111-8111-111111111111";
const audioAssetId = "22222222-2222-4222-8222-222222222222";

describe("OpenChatCut editorial workspace adapter", () => {
  it("stages tracks, bound assets and review markers in one edit session", async () => {
    const client = new FakeOpenChatCutClient();
    const adapter = new OpenChatCutEditorialWorkspaceAdapter({
      clientFactory: () => client,
      editorBaseUrl: "http://127.0.0.1:5199",
    });
    const timeline = createEditorialTimeline(createEditorialTimelineSchema.parse({
      name: "Master",
      tracks: [
        {
          name: "V1 Picture",
          kind: "video",
          role: "picture",
          clips: [{ assetId: videoAssetId, timelineStartFrame: 0, durationFrames: 120 }],
        },
        {
          name: "A2 Voice-over",
          kind: "audio",
          role: "voiceover",
          clips: [{ assetId: audioAssetId, timelineStartFrame: 0, durationFrames: 120 }],
        },
      ],
    }));
    timeline.markers.push({
      id: "33333333-3333-4333-8333-333333333333",
      frame: 72,
      label: "Check logo",
      status: "open",
      createdAt: new Date(0).toISOString(),
    });

    const result = await adapter.syncTimeline({
      projectName: "Bettr commercial",
      projectDescription: "Two-minute brand film",
      timeline,
      approvalMode: "manual",
      assetBindings: {
        [videoAssetId]: "pool-video-1",
        [audioAssetId]: "pool-audio-1",
      },
    });

    expect(result).toMatchObject({
      provider: "openchatcut",
      projectId: "occ-project-1",
      status: "awaiting-review",
      stagedClipCount: 2,
      stagedMarkerCount: 1,
    });
    expect(client.calls.map((call) => call.name)).toEqual([
      "create_project",
      "target_project",
      "begin_edit_session",
      "edit_track",
      "edit_track",
      "edit_item",
      "edit_item",
      "manage_markers",
      "review_edit_session",
    ]);
    expect(client.closed).toBe(true);
  });
});

class FakeOpenChatCutClient implements OpenChatCutToolClient {
  calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  closed = false;

  async callTool(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.calls.push({ name, input });
    if (name === "create_project") {
      return { id: "occ-project-1", editorUrl: "http://127.0.0.1:5199/#/editor/occ-project-1" };
    }
    if (name === "target_project") return { ok: true };
    if (name === "begin_edit_session") return { editSessionId: "edit-1" };
    if (name === "edit_track" && input.action === "list") {
      return { result: [{ id: "track-v1", alias: "V1", trackType: "video" }] };
    }
    if (name === "edit_track" && input.action === "create") {
      return { created: [{ id: "track-a1", alias: "A1", trackType: "audio" }] };
    }
    if (name === "review_edit_session") return { status: "awaiting_review" };
    return { ok: true };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
