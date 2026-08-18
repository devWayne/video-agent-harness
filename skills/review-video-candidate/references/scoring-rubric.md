# Candidate scoring rubric

Score every dimension from 0.0 to 1.0 and attach evidence.

| Dimension | Inspect |
| --- | --- |
| Identity consistency | Face, body, wardrobe, product, environment, and anchor continuity across time and adjacent shots |
| Motion quality | Intended action, physical plausibility, camera path, rhythm, contact, deformation, and motion completion |
| Prompt alignment | Subject, action, camera, composition, environment, light, mood, negatives, and narrative purpose |
| Temporal stability | Flicker, texture crawling, object persistence, geometry, cuts, first/last-frame continuity, and frame defects |
| Technical quality | Duration, dimensions, frame rate, codec, audio, corruption, black/frozen frames, and delivery compatibility |

Stage gates:

- `control-draft`: overall at least `0.50`; motion, prompt alignment, temporal stability and technical quality each at least `0.45`. Identity and appearance drift are warnings unless they make the intended action or next-shot handoff unusable.
- `final-candidate`: overall at least `0.80`; all applicable dimensions, especially identity and technical quality, at least `0.85`; no error-severity issue.
- `delivery`: technical quality at least `0.95`, overall at least `0.90`, and no codec, audio, duration, resolution, corruption, black-frame or archive blocker.

At every stage, all mandatory acceptance criteria owned by that stage must pass. Do not reject a useful action skeleton merely because it lacks final skin, wardrobe, lighting or identity fidelity; attach the issue so the refinement stage can correct it.

Weights and thresholds may be overridden only by a versioned project policy. If an essential reference is unavailable or evidence is contradictory, choose `human-review` rather than guessing.
