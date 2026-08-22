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
    client.readProjectTimeline = {
      name: timeline.name,
      fps: timeline.fps,
      width: timeline.width,
      height: timeline.height,
    };
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
      "read_project",
      "edit_track",
      "edit_track",
      "edit_item",
      "edit_item",
      "manage_markers",
      "review_edit_session",
    ]);
    const itemCalls = client.calls.filter((call) => call.name === "edit_item");
    expect(itemCalls[1]?.input).toMatchObject({
      adds: [{ trackId: "track-2" }],
    });
    expect(client.closed).toBe(true);
  });

  it("preserves real time when an existing OpenChatCut timeline uses another fps", async () => {
    const client = new FakeOpenChatCutClient();
    client.readProjectTimeline = { name: "序列 1", fps: 30, width: 1920, height: 1080 };
    const adapter = new OpenChatCutEditorialWorkspaceAdapter({
      clientFactory: () => client,
      editorBaseUrl: "http://127.0.0.1:5199",
    });
    const timeline = createEditorialTimeline(createEditorialTimelineSchema.parse({
      name: "4K Review",
      fps: 24,
      width: 3840,
      height: 2160,
      tracks: [{
        name: "V1 Picture",
        kind: "video",
        role: "picture",
        clips: [{ assetId: videoAssetId, timelineStartFrame: 24, durationFrames: 48 }],
      }],
    }));

    await adapter.syncTimeline({
      externalProjectId: "occ-project-1",
      projectName: "Bettr commercial",
      projectDescription: "Two-minute brand film",
      timeline,
      approvalMode: "auto",
      assetBindings: { [videoAssetId]: "pool-video-1" },
    });

    expect(client.calls.find((call) => call.name === "manage_timelines")?.input).toMatchObject({
      action: "update",
      name: "4K Review",
      width: 3840,
      height: 2160,
    });
    expect(client.calls.find((call) => call.name === "edit_item")?.input).toMatchObject({
      adds: [{ fromFrame: 30, durationInFrames: 60 }],
    });
  });
});

class FakeOpenChatCutClient implements OpenChatCutToolClient {
  calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  closed = false;
  readProjectTimeline = { name: "Master", fps: 24, width: 1920, height: 1080 };
  tracks: Array<{ id: string; alias: string; trackType: string; name?: string }> = [
    { id: "track-v1", alias: "V1", trackType: "video", name: "V1 Picture" },
  ];

  async callTool(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.calls.push({ name, input });
    if (name === "create_project") {
      return { id: "occ-project-1", editorUrl: "http://127.0.0.1:5199/#/editor/occ-project-1" };
    }
    if (name === "target_project") return { ok: true };
    if (name === "begin_edit_session") return { editSessionId: "edit-1" };
    if (name === "read_project") {
      return { timeline: this.readProjectTimeline };
    }
    if (name === "edit_track" && input.action === "list") {
      return { result: this.tracks };
    }
    if (name === "edit_track" && input.action === "create") {
      const json = JSON.parse(String(input.json)) as { trackType: string; name?: string };
      const created = {
        id: `track-${this.tracks.length + 1}`,
        alias: `${json.trackType === "audio" ? "A" : "V"}${this.tracks.filter((track) => track.trackType === json.trackType).length + 1}`,
        trackType: json.trackType,
        ...(json.name ? { name: json.name } : {}),
      };
      this.tracks.push(created);
      return { created: this.tracks };
    }
    if (name === "review_edit_session") return { status: "awaiting_review" };
    return { ok: true };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
