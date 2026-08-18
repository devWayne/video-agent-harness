# H3 REF2VA four-image control

Use `h3-ref2va-four-image-identity-control` when identity must survive across independently generated shots. Treat the four references as typed evidence, not as an unordered gallery.

## Role patterns

- One character: use three original identity angles and one prior-shot state image.
- Two characters: use two original images for the primary character, one identity image for the secondary character, and one prior-shot state image.
- Keep identity images authoritative. Use the prior-shot image only for pose, blocking, camera, environment, lighting, and door/object state.
- Inject original Character Pack images into every shot. Never rely on recursive tail-frame chaining for identity.

Prompt every slot explicitly with `<Picture 1>` through `<Picture 4>`. State which pictures show the same character and which picture is only a scene-state reference.

## Fragile API contract

`MiniMaxH3ReferenceToVideo` requires `audio_vae` even when no audio reference is supplied. Dynamic reference inputs use dot-expanded keys:

```text
ref_images.ref_image_0
ref_images.ref_image_1
ref_images.ref_image_2
ref_images.ref_image_3
```

Do not send `ref_images` as a JSON array. ComfyUI can accept the malformed graph while silently ignoring the references and returning a cached result. For a real validation run, confirm that both the REF2VA node and sampler executed rather than appearing in the cached-node list.

## Local resource policy

- Use 864×480, 124 frames, 24fps, 20 steps, `res_multistep`, `normal`, and `ref_image_size=match`.
- Do not use `ref_image_size=max` on the 16GB GPU.
- Four images have been validated without OOM; do not raise the count without a separate incremental memory test.
- Keep Turbo LoRA disabled until it has its own quality regression.
- Batch REF2VA shots together and FL2VA shots together. Do not alternate checkpoints shot by shot.

## Draft review

At control-draft stage, accept when identity, blocking, action, camera direction, and scene-state handoff are readable. Preserve strict facial micro-detail, typography, speech correctness, and final visual fidelity for the final-candidate quality gate unless the shot explicitly requires them now.
