# Vision

> Current baseline: 2026-08-22

## Product definition

Build an Agent-directed, provider-neutral production system for commercial 16:9 video. Codex or another compatible Agent Host reads repository Skills and owns creative planning, route selection, review, retry, and acceptance. The TypeScript/Node.js Harness owns typed capabilities, durable state, asset lineage, recovery, cost evidence, and delivery gates. Creative workspaces and model UIs are replaceable surfaces.

## Proven production slice

The first full commercial proof is no longer a one-Prompt demo:

```text
PDF / images / reference video
  → script, narration timing and atomic storyboard
  → route A/B: direct keyframes vs optional H3 control
  → bounded Seedance 2.5 final-render segments
  → Codex/human review and deterministic picture lock
  → one VOD AIGC Standard 4K enhancement
  → Qwen Audio cue-level narration and final mux
  → sidechain-ducked commercial music and audio lock
  → technical QC, hashes, receipts and local archive
```

Bettr validated 28 source pages, 27 atomic shots, 9 cloud segments, a 118.333-second 720P picture lock, 3840×2160 enhancement, 29 narration Cues, 119.86 seconds of generated commercial music, and a sidechain-ducked 4K H.264/AAC delivery.

## Product principles

- No fixed Provider is the director. Seedance, H3, LibTV-selected models, Wan, VOD, IMS, Qwen Audio and HyperFrames are replaceable executors.
- H3 control is optional. Scale it only when a representative final-render A/B proves it improves the active final model.
- Design atomic shots before grouping them into Provider-duration segments.
- Keep an authoritative clean boundary state between adjacent segments.
- Separate raw generative output, deterministic repairs, picture lock, upscale, audio and final delivery assets.
- Upscale the accepted picture master once; never upscale every candidate.
- Generate narration as recoverable time-coded Cues, not one irreversible long request.
- Provider success is not quality acceptance. Codex/human review remains explicit until an independent evaluation service is proven.
- Keep private media, credentials, signed URLs, internal hosts, local paths and workspace state out of Git.

## Harness boundary

Harness is the combination of repository Skills, TypeScript contracts, Provider adapters, recovery rules, quality gates and production ledger. It is not a second creative Agent and not a replacement for ComfyUI or LibTV editors.

The new `ProductionOperation` API currently provides state transitions, dependencies and review gates. It does not yet auto-dispatch every verified Provider; recoverable scripts may execute missing operations, but their results must be recorded back into the project ledger or a sanitized run record.

## Editorial workspace boundary

The built-in React UI has been removed. Harness exposes a headless API and an authoritative `EditorialTimeline`; OpenChatCut is the first replaceable multitrack workspace adapter. Runtime Project/Plan/Asset/Operation/Review/Timeline data remains the source of truth.

## Next acceptance slice

1. Register Seedance batch segments, H3 Profiles, VOD upscale and Qwen Audio Cue production as project-level recoverable Operations.
2. Register the newly typed narration, music, SFX, subtitle and editorial-preview asset roles in a complete production ledger.
3. Persist Codex/human route A/B and final review evidence in Runtime for a complete production.
4. Validate one real OpenChatCut sync with preimported media, manual proposal approval and Runtime version write-back.
5. Validate one real H3→LibTV V2V shot before deciding whether it deserves a standard route.
6. Add an interchangeable visual evaluation adapter without coupling the system to Codex.
