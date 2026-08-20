import { describe, expect, it } from "vitest";
import {
  addCharacterPack,
  addCharacterPackSchema,
  addProjectAsset,
  addProjectAssetSchema,
  createProductionProject,
  createProductionProjectSchema,
} from "../src/domain/production-project.js";

describe("character reference packs", () => {
  it("persists a canonical identity and explicit multi-angle view mapping", () => {
    let project = createProductionProject(createProductionProjectSchema.parse({
      name: "Character design",
      brief: "Create a reusable production identity pack.",
    }));

    for (const [name, view] of [
      ["Lead front", "front"],
      ["Lead profile", "right-profile"],
      ["Lead three-quarter", "right-three-quarter"],
      ["Lead full body", "full-body-front"],
    ] as const) {
      project = addProjectAsset(project, addProjectAssetSchema.parse({
        name,
        mediaType: "image",
        role: "identity-reference",
        source: "image-generation",
        uri: `https://assets.example/${view}.png`,
        tags: [`view:${view}`, "approved"],
      }));
    }

    const [front, profile, threeQuarter, fullBody] = project.assets;
    const referenceAssetIds = project.assets.map((asset) => asset.id);
    project = addCharacterPack(project, addCharacterPackSchema.parse({
      name: "Lead v1",
      designBrief: "Adult lead with one locked wardrobe.",
      canonicalAssetId: front!.id,
      referenceAssetIds,
      referenceViews: [
        { assetId: front!.id, view: "front" },
        { assetId: profile!.id, view: "right-profile" },
        { assetId: threeQuarter!.id, view: "right-three-quarter" },
        { assetId: fullBody!.id, view: "full-body-front" },
      ],
      consistencyNotes: "Lock face, hair, body proportions and wardrobe.",
      negativeConstraints: ["no face mixing", "no wardrobe swap"],
    }));

    expect(project.characterPacks[0]).toMatchObject({
      canonicalAssetId: front!.id,
      referenceAssetIds,
      referenceViews: [
        { assetId: front!.id, view: "front" },
        { assetId: profile!.id, view: "right-profile" },
        { assetId: threeQuarter!.id, view: "right-three-quarter" },
        { assetId: fullBody!.id, view: "full-body-front" },
      ],
    });
  });

  it("rejects canonical and view assets that are not included in the pack", () => {
    const included = "11111111-1111-4111-8111-111111111111";
    const excluded = "22222222-2222-4222-8222-222222222222";

    expect(() => addCharacterPackSchema.parse({
      name: "Broken pack",
      canonicalAssetId: excluded,
      referenceAssetIds: [included],
      referenceViews: [{ assetId: excluded, view: "front" }],
    })).toThrow();
  });
});
