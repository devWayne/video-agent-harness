---
name: create-production-video
description: Act as the main creative agent for an end-to-end, multi-shot video production. Use when Codex or another agent host must turn a brief and references into generated multi-angle character designs, approved Character and Scene Packs, script, storyboard, ComfyUI/H3 control drafts, stage-by-stage reviews, online final renders, deterministic HyperFrames assembly, and a traceable delivery; also use when resuming or repairing an existing production from the repository ledger.
---

# Create Production Video

Act as the production's main director. Make creative and retry decisions in this Skill; use the repository Runtime only as an execution toolbox and durable production ledger. Keep every decision and artifact resumable without chat history.

## Operating loop

1. Load the project ledger and read [references/production-state-machine.md](references/production-state-machine.md). Resume from the first incomplete or rejected gate; never recreate accepted work.
2. Normalize the brief, audience, duration, aspect ratio, delivery target, references, rights, budget, and approval policy.
3. Define the characters and visual language before detailed storyboarding. Invoke `design-character-reference-pack` for every recurring principal whose appearance is not already covered by an approved project Character Pack. Use the current host's image-generation capability for pixels; Codex owns the brief, angle plan, comparison, rejection, and final approval.
4. Register approved canonical, profile, three-quarter, full-body, expression, and wardrobe assets in Runtime. Freeze versioned Character Packs; never pass unrelated per-shot portraits as interchangeable identity sources.
5. Design locations, story, sound intent, continuity anchors, and acceptance criteria, then produce a shot-by-shot storyboard. Give each shot one narrative purpose, one continuous action, explicit camera intent, ordered references, sound intent, and a measurable gate.
6. Choose the smallest control route for each shot. Invoke `generate-minimax-h3-shot` only when motion, camera, blocking, scene state, or identity continuity requires a control draft. Simple shots may go directly to final rendering.
7. Ask Runtime to execute the selected control Profile. Inspect the returned control asset with `review-video-candidate` at the relaxed `control-draft` gate. Accept, patch, or rerun only that shot.
8. Ask Runtime to submit each accepted Shot Intent plus the approved Character Pack views and any accepted control asset to the selected online final-render Provider. Treat Seedance, MiniMax cloud, LibTV-selected models, and Wan as replaceable execution routes, not as directors. Use control videos for motion/camera only unless a Provider contract explicitly says otherwise.
9. Inspect every final candidate with `review-video-candidate` at the strict `final-candidate` gate. Compare faces against the canonical and closest-angle Character Pack views. Diagnose whether a defect belongs to character design, planning, control, or final rendering, then retry only the responsible stage.
10. Freeze an `AcceptedShotManifest`. Assemble only accepted final shots. Use HyperFrames for deterministic ordering, trimming, titles, subtitles, graphics, transitions, and brand treatment; do not send the assembled master back through a generative model by default.
11. Run delivery QC and archive the complete lineage. Return the production ID, approved Character Pack versions, accepted-shot manifest, unresolved human-review items, cost summary, and final delivery location.

## Decision ownership

- The Agent Host running this Skill owns creative planning, provider selection, evaluation interpretation, retry decisions, and human escalation.
- Repo-local specialist Skills own reusable domain procedure and safe parameter policy.
- Runtime owns commands, provider invocation, task recovery, immutable assets, lineage, costs, and manifests. Runtime must not invent story or silently accept a candidate.
- Studio is a projection of Runtime state plus an operator console. It does not become a second agent.
- ComfyUI and online model services execute declared jobs. They do not own cross-shot continuity or acceptance decisions.

## Tool Boundary

- Use Codex as the current main Agent Host. Preserve structured contracts so another compatible host can resume later without changing the project data model.
- Use MCP, CLI, or REST/OpenAPI tools exposed by the repository. Never invent provider HTTP calls.
- Ask Runtime to execute and checkpoint operations whenever a typed operation exists. If a development-only Skill must call an external service before the operation exists, record the returned task and asset back into Runtime before continuing.
- Keep API keys, account IDs, project UUIDs, internal addresses, ports, cookies, and local paths out of Skill files and generated manifests intended for Git.
- Pause before a paid run only when the requested budget or approval policy requires it. Otherwise follow the configured Harness policy.

## Routing

- Script, storyboard, character, scene order, or continuity failure: revise this Skill's production records.
- Character identity, hairstyle, body proportion, wardrobe, or missing-angle reference failure: invoke `design-character-reference-pack` and version only the affected Character Pack.
- H3 pose, motion, camera, first/last frame, or control failure: invoke `generate-minimax-h3-shot`.
- Appearance or refinement failure with a sound control asset: regenerate only the selected online final-render step.
- Identity, temporal, prompt, motion, or technical uncertainty: invoke `review-video-candidate`.
- Typography, title timing, data graphics, deterministic transitions, or brand packaging: use HyperFrames after final-shot acceptance.
- Codec, resolution, master, 4K, signing, or archive work: use the Harness delivery pipeline.

Read [references/contracts.md](references/contracts.md) whenever producing or validating structured artifacts. Read [references/agent-runtime-boundary.md](references/agent-runtime-boundary.md) when deciding whether an action belongs in the Skill, Runtime, Studio, or a Provider. Read [references/approval-policy.md](references/approval-policy.md) before any operation that can incur cost, upload private media, or publish a deliverable.
