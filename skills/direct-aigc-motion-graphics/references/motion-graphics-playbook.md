# AIGC motion-graphics playbook

## Shot grammar

Build each short shot from a small sequence of visible state changes:

1. `separate`: cards, dots, panels, or particles exist as distinct objects with depth.
2. `organize`: objects travel along readable curved paths, align, stack, connect, or transform.
3. `resolve`: the final hierarchy becomes legible and holds long enough to understand.

Use one main action per beat. Prefer physical verbs with consequences: detach, lift, orbit, thread, funnel, stack, unfold, lock, pulse, dissolve, condense, assemble, or crystallize. Avoid vague phrases such as “make it dynamic” or “cinematic animation.”

## Camera grammar

- Use a push-in to move from system overview to one decisive detail.
- Use a pull-back to reveal how scattered elements form a larger system.
- Use an orbit only when the layout can plausibly support depth.
- Use a lateral track for pipelines and cause-to-effect explanations.
- Use a controlled dive-through for dense data or network transitions.
- Keep one primary camera movement per beat. Do not stack pan, orbit, zoom, and roll without a clear reason.

## Common commercial patterns

### Card convergence

Start with cards at different depths. Lift them independently, accelerate along staggered curved paths, and converge into a central engine or final stack. Preserve spacing and avoid collision mush.

### Dashboard activation

Reveal rows, counters, charts, and connectors in causal order. Let pulses travel through the system. Use a shallow camera drift while screen-space geometry stays stable.

### System transformation

Use the first frame as the source state and the last frame as the target state. Specify which components detach, which paths carry them, and what physically locks them into the target.

### Data-to-number resolve

Funnel particles or cards into a stable numeric result. Treat the number as data-critical. Hold the supplied end frame or repair the exact digits after generation; do not trust hallucinated typography during the full transition.

### Logo resolve

Condense geometry or particles toward a clean logo reference. Treat the supplied mark as brand-critical. Prefer ending on the supplied logo frame and allow a deterministic final hold if the generated intermediate wordmark mutates.

## Model routing heuristics

- Use H3 FL2VA when both start and end compositions are supplied and the local control draft must land on the target state.
- Use H3 REF2VA when multiple references each have a distinct role and the installed Workflow Profile exposes that capability.
- Use a Seedance-style multimodal reference route for several screenshots or a reference video that describes movement, once the active Provider contract confirms those inputs.
- Use a motion-reference clip when the desired camera or choreography is easier to show than to describe.
- Split one long sequence into adjacent 4–6 second shots when it contains more than three strong visual beats.

Before scaling a route to many shots, compare one representative final render from authoritative keyframes with one final render refined from the H3 control video. A good control draft can still be a poor final-render input if it contributes deformation, weak texture, or flat motion.

## Long-form continuity

- Design atomic shots first, then group neighboring shots into Provider-sized segments.
- Give each segment one continuous physical transformation and no more milestones than the Provider can resolve.
- Make neighboring segments share an authoritative source page, approved keyframe, or clean endpoint.
- Prefer the original clean boundary over a recursively generated tail frame.
- Keep the raw model output and deterministic endpoint-restored output as separate assets.
- Record exact trim, hold, overlap, and transition duration so audio and subtitles use the same picture clock.

## Precision policy

Generative video is responsible for depth, physical transformation, visual energy, camera, lighting, and expressive timing. It is not the source of truth for exact typography or business data.

For each critical item choose one policy before generation:

- `reference-lock`: provide the clean asset and demand preservation.
- `endpoint-lock`: bind the supplied image as the first or final frame.
- `endpoint-restore`: after accepting the generative motion, restore and hold the exact supplied source frame at a segment boundary.
- `surgical-overlay`: replace only the affected logo, text, or number region after motion is accepted.
- `semantic-only`: accept approximate internal detail because only the visual idea matters.

## Review checklist

- Do elements move independently, or does the whole screenshot behave like a flat slide?
- Is there a readable cause-and-effect path?
- Does the camera movement add information rather than merely zoom?
- Is the final state recognizable and held long enough?
- Did important text, numbers, marks, or lines mutate?
- Did motion become liquid morphing where discrete assembly was required?
- Can the failure be fixed with one narrower prompt, a better endpoint, a different reference role, or a surgical overlay?

Record the answer and the successful prompt pattern in the production ledger after each accepted or rejected candidate.

The first checklist item is a hard gate for MG work. Whole-frame `zoompan`, crop drift, `xfade`, blur, page slide, or Ken Burns movement does not count as element motion. If that is all a candidate contains, classify it as an animatic and return to H3 generation or selective layer reconstruction, even when codec, duration, endpoints, text and logo all pass technical QC.

## Best-of-three commercial policy

Generate three candidates that explore different directorial choices while sharing identical source frames, endpoint constraints, duration, resolution and acceptance rules:

- `v1-structural`: stable camera, explicit causal transformation, clean object separation, highest endpoint priority.
- `v2-kinetic`: stronger depth, stagger, trajectory speed, parallax and one decisive camera acceleration.
- `v3-premium`: restrained slow-fast-slow timing, refined light, glass-like depth and premium brand-film polish.

Do not call three random seeds three designs. Change the motion treatment deliberately and record each prompt and seed.

Score every candidate on a 100-point scale:

- endpoint accuracy and adjacent-shot continuity: 30;
- element-level motion and readable causality: 25;
- temporal coherence and absence of destructive morphing: 20;
- brand, typography and data integrity: 15;
- rhythm and aesthetic quality: 10.

Select the highest-scoring candidate that clears required gates. Preserve all candidates, manifests, contact sheets, scores and rejection reasons. Assembly consumes a selection manifest, never a filename guessed from directory order.
