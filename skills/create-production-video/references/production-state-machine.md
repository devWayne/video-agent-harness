# Production state machine

## Stages

1. `brief`: normalize objective, references, constraints, budget, rights, and delivery target.
2. `storyboard`: create shots, continuity anchors, narration/audio intent, and acceptance criteria.
3. `control`: create H3 motion/control assets from approved Workflow Profiles.
4. `refinement`: create one or more online final-video candidates through LibTV Profiles.
5. `review`: score candidates, diagnose the responsible stage, and accept or retry locally.
6. `assembly`: order accepted shots and add deterministic titles, overlays, transitions, and audio.
7. `delivery`: create the master, optional 4K upscale, technical QC, archive, and signed delivery.

## Durable state rule

Before moving stages, persist the relevant plan, Recipe, execution, assets, evaluation, and cost checkpoint through Harness. A new Agent Host must be able to resume from those records without reading the previous chat.

## Retry routing

- Plan defect → `storyboard`
- Pose, camera, action, timing, or control defect → `control`
- Appearance/refinement defect → `refinement`
- Ambiguous creative judgment → `review` with `human-review`
- Packaging defect → `assembly`
- Technical delivery defect → `delivery`

Never discard accepted shots when retrying one failed shot.
