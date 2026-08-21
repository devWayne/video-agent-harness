---
name: review-video-candidate
description: Evaluate a generated control draft, final-render candidate, assembled picture master, or delivery master against its ShotIntent, continuity anchors, reference assets, narration clock, brand invariants, and technical requirements. Use when comparing H3 versus direct-keyframe routes, accepting or retrying Seedance/LibTV/Wan results, checking multi-segment continuity, reviewing 4K/audio delivery, or creating a structured quality report for the Harness.
---

# Review Video Candidate

Return a structured, evidence-based `EvaluationReport`. Do not accept a clip merely because generation succeeded.

## Procedure

1. Load the evaluation stage (`control-draft`, `final-candidate`, or `delivery`), ShotIntent, continuity anchors, references, Recipe, execution metadata, and candidate video.
2. Confirm the candidate is readable and inspect the full timeline when practical, plus representative samples, beginning, segment boundaries, and end. Use technical probes for duration, dimensions, frame rate, codec, audio, corruption, black/frozen frames, and stream synchronization.
3. Read [references/scoring-rubric.md](references/scoring-rubric.md), select the matching stage gate, and score identity consistency, motion quality, prompt alignment, temporal stability, and technical quality.
4. Record observable issues with severity and evidence. Separate control-stage defects, final-render defects, deterministic post-production defects, upscale defects, and audio/subtitle timing defects. Keep raw Provider output findings separate from repaired-master findings.
5. Choose exactly one decision: `accept`, `revise-control`, `regenerate-final`, or `human-review`.
6. Suggest only bounded patches supported by the selected Workflow/Profile contract. Never fabricate a node path or provider parameter.
7. Submit the structured report to Harness and preserve evaluator identity, model/version when available, timestamp, and evidence references.

## Decision rules

- `accept`: mandatory criteria for the active stage pass. A control draft may be accepted with non-blocking appearance or identity warnings when its motion skeleton remains useful.
- `revise-control`: pose, camera, action, rhythm, depth, framing, or first/last-frame evidence is wrong.
- `regenerate-final`: control evidence is sound but appearance, detail, lighting, or online refinement is wrong.
- `human-review`: rights, identity sensitivity, creative ambiguity, conflicting scores, or publication judgment cannot be resolved mechanically.

Use deterministic technical checks before multimodal judgment. A VLM score is evidence, not durable workflow state; Harness owns the report, retry counters, budget, and acceptance decision.

Never apply the final-candidate identity and visual-fidelity thresholds to an H3 control draft. The control stage answers whether the action, camera, blocking, timing and spatial handoff are usable; LibTV or another final-generation stage owns appearance fidelity unless the active control Profile explicitly declares identity as a hard constraint.

For a route A/B, evaluate the outputs from the final renderer rather than selecting H3 merely because its draft looks more controlled. Prefer direct keyframes when the control-video route introduces deformation or suppresses motion quality. At delivery, verify the picture hash lineage, 4K dimensions, unchanged duration/frame rate, audio sample rate/channels, narration window alignment, and final mux—not only subjective appearance.
