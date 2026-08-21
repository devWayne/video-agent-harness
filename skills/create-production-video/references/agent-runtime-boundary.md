# Agent, Runtime, Studio, and Provider boundary

## Agent and Skills

The Agent Host executes `create-production-video` and owns decisions: character art direction and multi-angle approval, story, storyboard, control route, final Provider, interpretation of evidence, retries, acceptance, and human escalation. Specialist Skills supply reusable procedure and parameter policy. Image-generation tools render requested character pixels but do not approve or version the Character Pack.

## Runtime

Runtime is not a second agent. It validates typed commands, invokes Providers, checkpoints asynchronous task IDs, stores immutable assets and evaluations, exposes resumable state, enforces budgets, and writes manifests. It must never mark a visual candidate acceptable without a recorded evaluation decision.

## Studio or creative workspace

The UI is replaceable. Nomi, the compatibility Production Console, or another workspace may read Runtime projections and send operator commands. Show project structure, references, stages, Provider tasks, candidates, reviews, costs, and deliveries. Do not duplicate ComfyUI or LibTV node editors and do not hide authoritative state in browser-only or workspace-private storage.

## Providers

- ComfyUI/H3: local control-draft execution for motion, camera, blocking, scene state, and identity experiments.
- Online final renderer: Seedance, MiniMax cloud, LibTV-selected model, Wan, or another approved Provider. Refine per shot or bounded scene, not the assembled multi-scene master.
- HyperFrames: optional code-native graphics and preview after final-shot acceptance.
- Deterministic media tooling: endpoint restoration, trims, transitions, audio conformation, muxing and technical inspection; it is not an AI upscale Provider.
- Delivery services: storage, mastering, upscale, technical QC, signing, and archive.

Every Provider remains replaceable behind an explicit operation contract.
