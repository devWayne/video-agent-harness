---
name: create-production-video
description: Act as the main creative agent for an end-to-end, multi-shot video production. Use when Codex or another agent host must turn a brief, PDF, screenshots, video, or character references into a script, storyboard, optional ComfyUI/H3 control drafts, direct or controlled online final renders, evidence-backed reviews, deterministic picture lock, voice-over, 4K delivery, and a traceable archive; also use when resuming or repairing an existing production from the repository ledger.
---

# Create Production Video

Act as the production's main director. Make creative and retry decisions in this Skill; use the repository Runtime only as an execution toolbox and durable production ledger. Keep every decision and artifact resumable without chat history.

## Operating loop

1. Load the project ledger and read [references/production-state-machine.md](references/production-state-machine.md). Resume from the first incomplete or rejected gate; never recreate accepted work. For advertising, product explainers, flattened decks, or long-form motion graphics, also read [references/commercial-brand-film.md](references/commercial-brand-film.md).
2. Normalize the brief, audience, duration, aspect ratio, delivery target, references, rights, budget, and approval policy.
3. Define the characters and visual language before detailed storyboarding. Invoke `design-character-reference-pack` for every recurring principal whose appearance is not already covered by an approved project Character Pack. Use the current host's image-generation capability for pixels; Codex owns the brief, angle plan, comparison, rejection, and final approval.
4. Register approved canonical, profile, three-quarter, full-body, expression, and wardrobe assets in Runtime. Freeze versioned Character Packs; never pass unrelated per-shot portraits as interchangeable identity sources.
5. Design locations, story, narration, sound intent, continuity anchors, and acceptance criteria, then produce a shot-by-shot storyboard. Give each shot one narrative purpose, one continuous action, explicit camera intent, ordered references, sound intent, and a measurable gate. Bind narration and subtitle cues to timeline windows before final generation when timing affects the visuals. Invoke `direct-aigc-motion-graphics` for flattened screenshots, PDF pages, dashboards, data graphics, UI showcases, system diagrams, card convergence, or logo resolves; it owns the shot-level generative motion grammar, not a deterministic animation framework.
6. Choose the smallest route for each shot. H3 control is optional, not a mandatory stage. For a new content type, compare one representative `direct-keyframes` final render with one `control-video` final render before scaling. Invoke `generate-minimax-h3-shot` only when motion, camera, blocking, scene state, identity continuity, or an AIGC motion-graphics intent benefits from a local control draft and the final-render A/B proves that the draft does not degrade quality.
7. Ask Runtime to execute the selected control Profile. When the Production Plan requires commercial best-of-three, generate three intentionally different candidates per shot, preserve all candidates and manifests, and use `review-video-candidate` at the relaxed `control-draft` gate to select one. Accept, patch, or rerun only that shot; never delete unselected candidates.
8. Ask Runtime to submit each accepted Shot Intent plus the approved Character Pack views, authoritative source frames, and any accepted control asset to the selected online final-render Provider. Treat Seedance, MiniMax cloud, LibTV-selected models, and Wan as replaceable execution routes, not as directors. Use control videos for motion/camera only unless a Provider contract explicitly says otherwise. For long-form work, group adjacent atomic shots into bounded Provider segments only after the storyboard exists; preserve the atomic-shot-to-segment mapping and share an authoritative boundary state between neighboring segments.
9. Inspect every final candidate with `review-video-candidate` at the strict `final-candidate` gate. Compare faces against the canonical and closest-angle Character Pack views. Diagnose whether a defect belongs to character design, planning, control, or final rendering, then retry only the responsible stage.
10. Freeze an `AcceptedShotManifest` plus candidate-selection evidence. Assemble only the selected accepted candidate for each shot while retaining every non-selected candidate. Use the approved deterministic post-production route for ordering, endpoint restoration, trimming, titles, subtitles, transitions, mix, and brand treatment. Use HyperFrames when code-native graphics are needed; use FFmpeg/ffprobe for media engineering and QC. Do not send the assembled multi-scene master back through a generative model by default.
11. Lock picture before expensive delivery. Upscale the accepted picture master once, generate narration as independently recoverable time-coded cues, conform audio to the picture clock, mix and mux without regenerating the visuals, then run final technical QC. Archive the complete lineage and a sanitized `ProductionRunRecord`. Return the production ID, approved packs, accepted-shot manifest, unresolved human-review items, cost summary, and final delivery location.

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
- H3 pose, motion, camera, first/last frame, or control failure: invoke `generate-minimax-h3-shot`. If the accepted control still degrades the online final renderer, route the shot directly from authoritative keyframes instead of repeatedly polishing the wrong intermediate.
- Flattened UI, data visualization, product interface, card convergence, system transformation, or logo-reveal direction: invoke `direct-aigc-motion-graphics`, then route its Provider-neutral intent to H3 now or Seedance when configured.
- Appearance or refinement failure with a sound control asset: regenerate only the selected online final-render step.
- Identity, temporal, prompt, motion, or technical uncertainty: invoke `review-video-candidate`.
- Expressive UI/data motion from flattened references: keep it generative through `direct-aigc-motion-graphics`. Exact typography, title timing, critical numbers, final logo holds, deterministic transitions, or brand packaging: repair or assemble them after final-shot acceptance.
- Narration timing or delivery: keep one Cue per recoverable request, preserve raw and conformed takes, and record model, voice, seed, billed units, hashes, and timing.
- Codec, picture lock, resolution, 4K, mix, signing, or archive work: use the Harness delivery pipeline or its approved recoverable CLI. Upscale only the locked master.

Read [references/contracts.md](references/contracts.md) whenever producing or validating structured artifacts. Read [references/agent-runtime-boundary.md](references/agent-runtime-boundary.md) when deciding whether an action belongs in the Skill, Runtime, Studio, or a Provider. Read [references/approval-policy.md](references/approval-policy.md) before any operation that can incur cost, upload private media, or publish a deliverable. Use [assets/production-run-record.template.json](assets/production-run-record.template.json) for a non-secret run summary; do not copy private paths or signed URLs into it.
