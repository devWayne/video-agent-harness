---
name: create-production-video
description: Direct an end-to-end controlled video production from a creative brief and reference assets through script, storyboard, H3 control generation, LibTV refinement, candidate review, post-production, and delivery. Use when creating or continuing a multi-shot production, deciding which specialist Skill or provider owns a stage, recovering a failed production run, or preparing a traceable final deliverable.
---

# Create Production Video

Operate as the creative director of the repository's agent-neutral Harness. Keep durable state in Harness APIs and manifests; never rely on chat history as the project record.

## Workflow

1. Read the brief, references, target duration, aspect ratio, delivery format, budget, and approval constraints.
2. Read [references/production-state-machine.md](references/production-state-machine.md) before creating or resuming a run.
3. Create a structured script and storyboard. Preserve character, location, product, style, motion, sound, and negative constraints as named continuity anchors.
4. Submit or resume the production through the Harness API. Do not call providers directly when a Harness operation exists.
5. For each shot, invoke `generate-minimax-h3-shot` to produce an approved motion/control asset. Do not configure raw ComfyUI nodes in this top-level Skill.
6. Send the accepted control asset through the configured LibTV generation Profile when the Shot Recipe requests online refinement.
7. Invoke `review-video-candidate` for every final candidate. Apply its stage-specific retry decision through Harness rather than restarting the entire production.
8. Accept only candidates whose structured evaluation meets the project gate. Preserve Recipe, execution, asset, evaluation, cost, and model-version lineage.
9. Assemble accepted shots through LibTV Assembly or HyperFrames as declared by the production plan, then run delivery and technical QC.
10. Return the production ID, accepted-shot manifest, unresolved review items, cost summary, and final delivery location.

## Tool Boundary

- Treat Codex, Claude Code, and other AI applications as replaceable Agent Hosts.
- Use MCP, CLI, or REST/OpenAPI tools exposed by the repository. Never invent provider HTTP calls.
- Keep API keys, account IDs, project UUIDs, internal addresses, ports, cookies, and local paths out of Skill files and generated manifests intended for Git.
- Pause before a paid run only when the requested budget or approval policy requires it. Otherwise follow the configured Harness policy.

## Routing

- Script, storyboard, scene order, or continuity failure: revise this Skill's production plan.
- H3 pose, motion, camera, first/last frame, or control failure: invoke `generate-minimax-h3-shot`.
- LibTV appearance or refinement failure with a sound control asset: regenerate only the final-generation step.
- Identity, temporal, prompt, motion, or technical uncertainty: invoke `review-video-candidate`.
- Typography, title timing, data graphics, or deterministic packaging: use HyperFrames.
- Codec, resolution, master, 4K, signing, or archive work: use the Harness delivery pipeline.

Read [references/contracts.md](references/contracts.md) when producing or validating structured artifacts. Read [references/approval-policy.md](references/approval-policy.md) before any operation that can incur cost, upload private media, or publish a deliverable.
