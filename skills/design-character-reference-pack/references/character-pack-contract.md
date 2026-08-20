# Character Pack contract

## Minimum production set

For a recurring principal character, generate and approve:

| View | Purpose |
| --- | --- |
| `front` | Canonical face geometry, feature spacing, skin and hair anchor |
| `left-profile` or `right-profile` | Nose, lips, chin, ear and skull silhouette |
| `left-three-quarter` or `right-three-quarter` | Bridge between frontal and profile identity |
| `full-body-front` | Height impression, body proportions, wardrobe and footwear |

Add the following when the story needs them:

- the opposite profile and three-quarter view for frequent head turns;
- `back` or `full-body-back` for entrances, exits, pursuit, over-shoulder shots, or distinctive rear wardrobe details;
- `expression-sheet` for dialogue-heavy acting;
- `wardrobe-detail` for branded, historical, fantasy, uniform, or accessory-sensitive clothing;
- `turnaround-sheet` for human comparison only, alongside separate machine references.

## Runtime mapping

Register each approved image as a `ProjectAsset`:

```json
{
  "mediaType": "image",
  "role": "identity-reference",
  "source": "image-generation",
  "tags": ["character:<key>", "view:front", "approved"],
  "parentAssetId": "<canonical asset for derived views>"
}
```

Create the Character Pack with an ordered view mapping:

```json
{
  "name": "Lead v1",
  "designBrief": "Adult lead with locked facial geometry, body proportions and wardrobe.",
  "canonicalAssetId": "<front asset UUID>",
  "referenceAssetIds": ["<front>", "<profile>", "<three-quarter>", "<full-body>"],
  "referenceViews": [
    { "assetId": "<front>", "view": "front" },
    { "assetId": "<profile>", "view": "right-profile" },
    { "assetId": "<three-quarter>", "view": "right-three-quarter" },
    { "assetId": "<full-body>", "view": "full-body-front" }
  ],
  "consistencyNotes": "Lock face, hair silhouette, body proportions, wardrobe and accessories.",
  "negativeConstraints": ["no face mixing", "no wardrobe swap", "no age drift"]
}
```

Use `appearance-reference` instead of `identity-reference` only for assets that control clothing, makeup, material, or styling without owning the person's identity.

## Downstream selection

- H3 control draft: pass only the smallest set needed by the approved Profile; keep identity and action references in separate slots.
- Seedance/MiniMax final render: bind the canonical identity plus angles relevant to the planned pose, and pass an accepted H3 clip only as motion/camera control.
- LibTV: upload the same immutable asset versions and record their returned asset IDs in the project operation; do not treat the canvas as the source of truth.
- Evaluation: compare candidates with the canonical image and the angle closest to the candidate's visible head orientation.
