import { describe, expect, it } from "vitest";
import {
  ProductionProjectConflictError,
  ProductionProjectService,
} from "../src/application/production-project-service.js";
import { SqliteVideoJobRepository } from "../src/infrastructure/sqlite-video-job-repository.js";

describe("agent-directed production ledger", () => {
  it("persists an Agent-authored plan and enforces review gates between operations", async () => {
    const repository = new SqliteVideoJobRepository(":memory:");
    const service = new ProductionProjectService(repository, repository);
    let project = await service.create({
      name: "Agent directed story",
      brief: "Create a controlled multi-shot story with explicit review gates.",
    });
    project = (await service.addAsset(project.id, {
      name: "Lead identity",
      mediaType: "image",
      role: "identity-reference",
      uri: "https://assets.example/lead.jpg",
    }))!;
    const identityAssetId = project.assets[0]!.id;
    project = (await service.addCharacterPack(project.id, {
      name: "Lead",
      referenceAssetIds: [identityAssetId],
    }))!;
    const characterId = project.characterPacks[0]!.id;

    project = (await service.savePlan(project.id, {
      agentHost: "Codex GPT",
      plan: {
        id: "story-1",
        title: "The Door",
        logline: "A visitor creates a comic reversal.",
        targetDurationSeconds: 5,
        scenes: [{
          id: "scene-1",
          index: 0,
          title: "Visitor",
          narrativePurpose: "Set up and resolve the reversal.",
          targetDurationSeconds: 5,
          continuityAnchors: {
            characterIds: [characterId],
            locationKey: "apartment-door",
            wardrobeKey: "white-vest",
            visualStyleKey: "natural-comedy",
            lightingKey: "warm-interior",
          },
          shots: [{
            id: "shot-1",
            index: 0,
            narrativePurpose: "The lead opens and closes the door.",
            action: "Open the door, react, then close it.",
            camera: "Medium handheld push-in.",
            sound: "Door and dialogue.",
            prompt: "The same lead opens the apartment door and reacts.",
            generation: { profileId: "h3-control-v1", durationSeconds: 5 },
            selection: { sourceInSeconds: 0, sourceOutSeconds: 5 },
            incomingContinuity: continuity(),
            expectedOutgoingContinuity: continuity(),
          }],
        }],
      },
    }))!;
    expect(project.agentHost).toBe("Codex GPT");
    expect(project.productionPlan?.scenes[0]?.shots[0]?.id).toBe("shot-1");

    await expect(service.createOperation(project.id, {
      kind: "assembly",
      executor: "hyperframes",
    })).rejects.toThrow(ProductionProjectConflictError);

    const controlMutation = (await service.createOperation(project.id, {
      kind: "control-generation",
      executor: "comfyui",
      shotId: "shot-1",
      profileId: "h3-control-v1",
      inputAssetIds: [identityAssetId],
    }))!;
    const controlId = controlMutation.operation.id;
    await service.startOperation(project.id, controlId, { providerTaskId: "comfy-prompt-1" });
    project = (await service.addAsset(project.id, {
      name: "Shot 1 motion control",
      mediaType: "video",
      role: "control-asset",
      source: "comfyui",
      uri: "https://assets.example/shot-1-control.mp4",
    }))!;
    const controlAssetId = project.assets.at(-1)!.id;
    await service.completeOperation(project.id, controlId, {
      providerTaskId: "comfy-prompt-1",
      outputAssetIds: [controlAssetId],
    });

    await expect(service.createOperation(project.id, {
      kind: "final-render",
      executor: "online-video",
      shotId: "shot-1",
      inputAssetIds: [controlAssetId],
      dependsOnOperationIds: [controlId],
    })).rejects.toThrow(ProductionProjectConflictError);

    await service.reviewOperation(project.id, controlId, {
      gate: "control-draft",
      decision: "accept",
      overallScore: 0.72,
      reviewedBy: { type: "agent", name: "Codex GPT" },
    });
    const finalMutation = (await service.createOperation(project.id, {
      kind: "final-render",
      executor: "online-video",
      shotId: "shot-1",
      profileId: "seedance-2.5",
      inputAssetIds: [controlAssetId],
      dependsOnOperationIds: [controlId],
    }))!;
    const finalId = finalMutation.operation.id;
    await service.startOperation(project.id, finalId, { providerTaskId: "cloud-task-1" });
    project = (await service.addAsset(project.id, {
      name: "Shot 1 final candidate",
      mediaType: "video",
      role: "final-candidate",
      source: "online-video",
      uri: "https://assets.example/shot-1-final.mp4",
    }))!;
    const finalAssetId = project.assets.at(-1)!.id;
    await service.completeOperation(project.id, finalId, {
      providerTaskId: "cloud-task-1",
      outputAssetIds: [finalAssetId],
    });
    await service.reviewOperation(project.id, finalId, {
      gate: "final-candidate",
      decision: "accept",
      overallScore: 0.93,
      dimensions: { identity: 0.96, motion: 0.9 },
      reviewedBy: { type: "agent", name: "Codex GPT" },
    });

    const assembly = await service.createOperation(project.id, {
      kind: "assembly",
      executor: "hyperframes",
      inputAssetIds: [finalAssetId],
      dependsOnOperationIds: [finalId],
    });
    expect(assembly?.operation).toMatchObject({
      kind: "assembly",
      status: "queued",
      reviewStatus: "not-ready",
    });
    const assemblyId = assembly!.operation.id;
    await service.startOperation(project.id, assemblyId, {});
    project = (await service.addAsset(project.id, {
      name: "Story assembly master",
      mediaType: "video",
      role: "assembly-master",
      source: "hyperframes",
      uri: "https://assets.example/story-master.mp4",
    }))!;
    const assemblyAssetId = project.assets.at(-1)!.id;
    await service.completeOperation(project.id, assemblyId, { outputAssetIds: [assemblyAssetId] });
    await service.reviewOperation(project.id, assemblyId, {
      gate: "delivery",
      decision: "accept",
      overallScore: 1,
      reviewedBy: { type: "agent", name: "Codex GPT" },
    });

    const delivery = await service.createOperation(project.id, {
      kind: "delivery",
      executor: "delivery",
      inputAssetIds: [assemblyAssetId],
      dependsOnOperationIds: [assemblyId],
    });
    expect(delivery?.operation.kind).toBe("delivery");
    repository.close();
  });
});

function continuity() {
  return {
    subjectPose: "standing",
    subjectPosition: "center",
    screenDirection: "toward-camera" as const,
    eyeline: "camera level",
    cameraPosition: "medium shot",
    environmentState: "door closed",
  };
}
