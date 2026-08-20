# Production state machine

## Stages

1. `brief`: normalize objective, references, constraints, budget, rights, and delivery target.
2. `design`: establish story, Character Bible, Scene Bible, visual language, sound, and continuity anchors.
3. `storyboard`: create atomic Shot Intents with ordered references and acceptance criteria.
4. `control`: create optional H3 control drafts from approved Workflow Profiles.
5. `control-review`: accept the motion/camera/blocking skeleton or rerun only the control operation.
6. `final-render`: create online final-video candidates from the Shot Intent and accepted references.
7. `final-review`: score final candidates, diagnose the responsible stage, and accept or retry locally.
8. `assembly`: order accepted final shots and add deterministic titles, overlays, transitions, and audio.
9. `delivery`: create the master, optional 4K upscale, technical QC, archive, and signed delivery.

## Durable state rule

Before moving stages, persist the relevant plan, operation, provider task, asset, evaluation, decision, and cost checkpoint through Runtime. A new Agent Host must be able to resume from those records without reading the previous chat.

## Retry routing

- Story or continuity defect → `design` or `storyboard`
- Pose, camera, action, timing, or control defect → `control`
- Appearance/refinement defect with a sound control draft → `final-render`
- Ambiguous creative judgment → the current review stage with `human-review`
- Packaging defect → `assembly`
- Technical delivery defect → `delivery`

Never discard accepted shots when retrying one failed shot.
