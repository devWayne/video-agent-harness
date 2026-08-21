---
name: generate-minimax-h3-shot
description: Plan and execute one controlled MiniMax H3 video shot through an approved ComfyUI Workflow Profile. Use when a ShotIntent needs an H3 motion, pose, camera, depth, first/last-frame, or character-reference asset; when diagnosing a failed H3 control pass; or when choosing safe parameters for the local GPU without manually rebuilding the ComfyUI graph.
---

# Generate MiniMax H3 Shot

Convert one `ShotIntent` into a reproducible H3 control asset. Operate only on approved Workflow Profiles and declared parameter slots.

## Procedure

1. Read the complete `ShotIntent` and assign every reference a single declared role.
2. Read [references/scene-routing.md](references/scene-routing.md) and choose the smallest H3 capability that satisfies the shot. Read [references/ref2va-control.md](references/ref2va-control.md) whenever multi-image identity or scene-state control is required.
3. Query ComfyUI node and model capabilities through the configured MCP when the selected Profile or live schema is unknown. Do not assume node names or parameter ranges.
4. Select an approved Profile from the Harness registry. Never construct or download an unknown production graph during a paid run.
5. Produce a typed parameter patch for only the Profile's exposed fields: prompt, negative prompt, references, frame count, dimensions, seed, and explicitly approved sampler controls.
6. Validate the patch against [references/profile-contract.md](references/profile-contract.md), local VRAM policy, shot duration, and output role.
7. Submit execution through Harness. Preserve Workflow hash, Profile version, model files, seed, parameters, task ID, and output asset.
8. Run local control-stage checks. Return the asset first as `control-draft`. Promote it to `motion-reference` only after a representative final-model A/B shows that the control-video route improves the shot; do not claim it is the final delivery video.

For REF2VA, upload and record every reference before patching the Workflow. Keep the ordered mapping between `<Picture N>` prompt tags, ComfyUI input filenames, Character Pack roles, and the output Manifest. Reinject original identity images into every shot; use an accepted prior-shot frame only as a state reference.

## Failure routing

- Subject identity or appearance drifts before motion begins: correct references, role assignment, or identity Profile.
- Identity drifts after several tail-frame handoffs: switch to REF2VA, reinject the original Character Pack on every shot, and demote the tail frame to scene-state evidence.
- Pose, action, camera, or timing fails: revise only the control Profile or exposed H3 parameters.
- H3 control is correct but a Seedance, LibTV-selected model, MiniMax online model, or another final renderer looks worse than the direct-keyframe route: keep H3 as draft evidence, leave this Skill, and route the final shot directly from authoritative keyframes.
- Node missing, model missing, out of memory, schema mismatch, or corrupt output: diagnose through ComfyUI MCP and do not widen production permissions automatically.

Keep local addresses, ports, model paths, credentials, and private asset paths out of this Skill. Resolve them from ignored local configuration and Harness runtime metadata.
