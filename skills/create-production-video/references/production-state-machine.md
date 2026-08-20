# Production state machine

## Stages

1. `brief`: normalize objective, references, constraints, budget, rights, and delivery target.
2. `character-design`: define each recurring character, generate a canonical identity plus required angles, review candidates, and freeze approved Character Pack versions.
3. `design`: establish story, Scene Bible, visual language, sound, and continuity anchors from approved Character Packs.
4. `storyboard`: create atomic Shot Intents with ordered references and acceptance criteria.
5. `control`: create optional H3 control drafts from approved Workflow Profiles.
6. `control-review`: accept the motion/camera/blocking skeleton or rerun only the control operation.
7. `final-render`: create online final-video candidates from the Shot Intent, approved Character Pack views, and accepted control references.
8. `final-review`: score final candidates against canonical and closest-angle identity views, diagnose the responsible stage, and accept or retry locally.
9. `assembly`: order accepted final shots and add deterministic titles, overlays, transitions, and audio.
10. `delivery`: create the master, optional 4K upscale, technical QC, archive, and signed delivery.

## Durable state rule

Before moving stages, persist the relevant plan, operation, provider task, asset, evaluation, decision, and cost checkpoint through Runtime. A new Agent Host must be able to resume from those records without reading the previous chat.

## Retry routing

- Character appearance or incomplete reference coverage → `character-design`
- Story or continuity defect → `design` or `storyboard`
- Pose, camera, action, timing, or control defect → `control`
- Appearance/refinement defect with a sound control draft → `final-render`
- Ambiguous creative judgment → the current review stage with `human-review`
- Packaging defect → `assembly`
- Technical delivery defect → `delivery`

Never discard accepted shots when retrying one failed shot.
