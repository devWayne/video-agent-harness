# Production state machine

## Stages

1. `brief`: normalize objective, references, constraints, budget, rights, and delivery target.
2. `character-design`: define each recurring character, generate a canonical identity plus required angles, review candidates, and freeze approved Character Pack versions.
3. `design`: establish story, Scene Bible, visual language, sound, and continuity anchors from approved Character Packs.
4. `storyboard`: create atomic Shot Intents with ordered references, narration/subtitle timing, acceptance criteria, and authoritative boundary states. For UI, dashboards, information graphics, and flattened PDF/screenshots, also create Provider-neutral AIGC motion-graphics intents before selecting H3 or an online model.
5. `route-test`: for a new content type, compare a representative direct-keyframe final render with a control-video final render. Record why one route is selected. Skip only when an approved project Profile already has current evidence.
6. `control`: create optional H3 control drafts from approved Workflow Profiles.
7. `control-review`: accept the motion/camera/blocking skeleton or rerun only the control operation.
8. `final-render`: create online final-video candidates or bounded multi-shot segments from the Shot Intent, authoritative source frames, approved Character Pack views, and accepted control references.
9. `final-review`: score final candidates against canonical references and source invariants, diagnose the responsible stage, and accept or retry locally.
10. `picture-lock`: assemble accepted renders, restore exact endpoints or critical overlays, trim transitions, and freeze the visual clock.
11. `delivery`: upscale the picture-locked master once, generate and conform narration cues, mix/mux audio and subtitles, run technical QC, archive, and sign delivery.

## Durable state rule

Before moving stages, persist the relevant plan, operation, provider task, asset, evaluation, decision, and cost checkpoint through Runtime. A new Agent Host must be able to resume from those records without reading the previous chat.

## Retry routing

- Character appearance or incomplete reference coverage → `character-design`
- Story or continuity defect → `design` or `storyboard`
- Pose, camera, action, timing, or control defect → `control`
- Control draft is usable but harms the online final result → `route-test`, then choose `direct-keyframes`
- Appearance/refinement defect with a sound control draft → `final-render`
- Ambiguous creative judgment → the current review stage with `human-review`
- Packaging defect → `picture-lock`
- Narration or subtitle defect → retry only the affected Cue or deterministic finishing step
- Technical delivery defect → `delivery`

Never discard accepted shots when retrying one failed shot.
