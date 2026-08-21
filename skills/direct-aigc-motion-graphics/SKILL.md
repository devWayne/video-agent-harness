---
name: direct-aigc-motion-graphics
description: Direct screenshot-, PDF-, dashboard-, infographic-, logo-, and product-UI-based motion graphics with generative video models. Use when an agent must turn flattened visual references into dynamic commercial showcase shots; plan element-level motion, camera choreography, A-to-B transformations, card convergence, data-flow reveals, logo resolves, or multi-shot product explainers; route the result to MiniMax H3 through ComfyUI now or Seedance and another multimodal video Provider later; and diagnose text, number, logo, geometry, or timing failures without defaulting to Remotion or manually rebuilding the entire interface.
---

# Direct AIGC Motion Graphics

Treat the input as visual evidence, not as an editable design file. Direct a generative video model to infer depth and element motion from flattened screenshots while preserving important brand anchors.

## Procedure

1. Inventory every input page or frame. Mark whether it is a flattened screenshot, an editable layered source, a clean logo asset, a data claim, or a motion reference.
2. Read [references/motion-graphics-playbook.md](references/motion-graphics-playbook.md). Choose one visual purpose and no more than three strong motion beats for each 4–6 second shot.
3. Define the start state, transformation, end state, camera behavior, element choreography, timing, visual invariants, and allowed invention. Describe motion rather than repeating visible content.
4. Classify critical content:
   - `semantic`: meaning and layout matter; small visual drift is acceptable.
   - `brand-critical`: exact logo, wordmark, color, or slogan must survive.
   - `data-critical`: exact number, label, chart value, or claim must survive.
5. Select the smallest generative route:
   - One screenshot that comes alive: image-to-video.
   - Exact supplied A→B composition: first/last-frame video.
   - Several screenshots, logos, or visual systems that must blend: reference-to-video.
   - A reference clip whose movement must be borrowed: motion-reference or video-reference mode.
6. For the currently configured local H3 route, invoke `generate-minimax-h3-shot` and use an approved FL2VA Profile for A→B shots or REF2VA for several declared references. Keep every reference role explicit and ordered. Treat the result as optional control evidence, not as an obligatory final-render input.
7. When a Seedance or another multimodal final Provider is available, test both direct authoritative keyframes and the accepted H3 control video on one representative shot. Select the route by final-render evidence; do not scale a weak control plate across the film. Assign each image or video one role and never send an undifferentiated asset pile.
8. For commercial or hero delivery, render three intentional candidates rather than three seed-only duplicates. Read the best-of-three section in [references/motion-graphics-playbook.md](references/motion-graphics-playbook.md). Preserve every candidate and its manifest.
9. Inspect the full timeline, not only the last frame. Use `review-video-candidate` at `control-draft` for H3 evidence and at `final-candidate` for the selected online route. Score endpoint continuity, element motion, temporal coherence, brand/data integrity, and rhythm.
10. Diagnose failures by class: motion, composition, brand, data, temporal coherence, or transition. Change one major cause per retry.
11. Promote only the highest-scoring acceptable candidate. For long-form work, group adjacent atomic shots into bounded Provider segments, give neighboring segments one shared authoritative endpoint, and preserve the atomic-shot-to-segment map. Record the selected candidate and evidence in a selection manifest; never delete the unselected candidates. Preserve the prompt, reference ordering, seed, Provider, task ID, raw candidate, deterministic repairs, review, and retry lesson.

## Flattened-source rule

Do not claim individual UI objects are available when the source is a PNG, JPEG, rendered PDF page, or video frame. Generative models may infer and animate apparent layers, but they do not recover exact original vectors or component semantics.

Prefer AIGC-first execution when expressive motion matters more than pixel-exact intermediate frames. If exact text, digits, charts, or marks are mandatory, use clean supplied assets as references and reserve deterministic overlay repair for only those critical regions. Do not rebuild the whole interface unless the user supplies a layered source or explicitly requests reconstruction.

## Output contract

For every shot, return a structured `AigcMotionGraphicIntent` containing:

- shot ID, duration, aspect ratio, start and optional end frame;
- reference list with one role per asset;
- three or fewer time-coded motion beats;
- camera path and element choreography;
- semantic, brand-critical, and data-critical invariants;
- positive direction and negative constraints;
- requested model route and fallback route;
- candidate policy, variant identity, selection criteria, and selected-candidate record;
- acceptance checks and retry scope.

The intent is Provider-neutral. Provider adapters translate it to H3, Seedance, or another model; the creative Skill does not expose invented API parameters.

## Boundaries

- Use `create-production-video` for the wider script, multi-scene storyboard, continuity, assembly, and delivery lifecycle.
- Use this Skill for display motion and shot-level AIGC direction.
- Use `generate-minimax-h3-shot` for the concrete local ComfyUI/H3 execution Profile.
- Use `review-video-candidate` for evidence-backed acceptance and retry decisions.
- Use deterministic graphics only as a surgical precision layer; do not make Remotion the default generator for flattened screenshots.
