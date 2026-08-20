---
name: design-character-reference-pack
description: Design, generate, evaluate, and freeze a production character's canonical appearance and multi-angle image references. Use before storyboarding or video generation when Codex or another creative host must create a new character, derive front/profile/three-quarter/full-body views from an approved identity image, build a reusable Character Pack, or repair downstream identity drift caused by incomplete or contradictory character references.
---

# Design Character Reference Pack

Turn a character brief or authorized user reference into an approved, versioned set of identity and appearance assets. Let the current Agent Host own art direction and approval; use its available image-generation capability to render pixels. Persist accepted assets and their roles through Runtime so later video Providers never depend on chat history.

## Workflow

1. Read the production brief and existing project assets. Define the character's narrative role, adult age range, facial geometry, skin, hair, body proportions, wardrobe, accessories, palette, material, temperament, and prohibited changes.
2. Choose one canonical identity anchor. If the user supplied authorized references, preserve the requested identity scope. Otherwise generate a neutral front-facing canonical portrait first and obtain approval before deriving other views.
3. Use the approved canonical image as the reference for every derived view. Do not generate front, profile, and full-body images as unrelated text-to-image jobs.
4. Produce the minimum production set defined in [references/character-pack-contract.md](references/character-pack-contract.md). Prefer separate high-resolution images; a turnaround sheet is useful for human review but must not be the only machine reference.
5. Compare every candidate with the canonical anchor. Reject identity drift, age changes, face-shape changes, hair silhouette changes, body-proportion changes, wardrobe swaps, accessory loss, asymmetric detail reversal, or inconsistent color/material.
6. Register accepted images as immutable project assets with `source: image-generation`, a correct identity/appearance role, a view tag, generation notes, and `parentAssetId` pointing to the canonical asset for derived views.
7. Create the Runtime `CharacterPack` only from accepted assets. Supply `canonicalAssetId`, `referenceViews`, `consistencyNotes`, and `negativeConstraints`. Never bind rejected candidates into the pack.
8. Freeze the pack before H3 control generation or online final rendering. Create a new pack version when the character design changes; do not silently replace an approved image behind an existing asset ID.

## Generation policy

- Keep the canonical background neutral and uncluttered. Do not let later video scenes leak into the identity references.
- Preserve natural facial asymmetry and distinguishing marks consistently; do not mirror asymmetric details between left and right views.
- Use neutral expression and even lighting for identity views. Put expressive variants in a separate expression sheet.
- Separate identity from motion. H3 or other video references may control pose, action, blocking, and camera, but must not override the Character Pack's face, body, hair, wardrobe, or accessories.
- Generate wardrobe variants as separate versioned packs or explicitly named looks. Never mix two outfits inside one continuity-locked pack.
- For a real person, use only user-provided or otherwise authorized references and preserve the declared scope. Do not infer identity from an unrelated public figure.

## Approval gate

Accept a Character Pack only when:

- the canonical face remains recognizable across front, profile, and three-quarter views;
- head shape, feature spacing, age, skin tone, hair silhouette, body proportions, wardrobe, and accessories agree;
- left/right views preserve intentional asymmetry rather than swapping it;
- full-body images agree with portrait proportions;
- every reference has one explicit view and downstream role;
- no image contains text, watermark, contact-sheet labels, duplicated limbs, or another person's facial traits.

If the pack fails, regenerate only the defective view from the canonical image. Do not restart approved views.

## Output

Return and persist:

1. a concise character design brief;
2. the canonical asset ID;
3. the ordered view-to-asset mapping;
4. identity and wardrobe continuity locks;
5. negative constraints;
6. rejected candidates and reasons when relevant;
7. the resulting Character Pack ID and version.

If the current host lacks image generation, return the complete generation plan and mark execution as waiting; never claim that images were produced.
