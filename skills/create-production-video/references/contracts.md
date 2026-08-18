# Structured contracts

Use repository domain types and OpenAPI as the source of truth. At minimum preserve:

- `ProductionPlan`: brief, target audience, story structure, continuity anchors, delivery and cost constraints.
- `ShotIntent`: shot index, duration, narrative purpose, subject, action, camera, environment, lighting, sound, references, negatives, and acceptance criteria.
- `ShotRecipe`: approved Profile and ordered execution steps with declared asset roles.
- `GenerationAsset`: immutable ID, role, URI/path, producing executor, task ID, and metadata.
- `EvaluationReport`: normalized score, five dimensions, issues, decision, parameter patches, evaluator, and timestamp.
- `AcceptedShotManifest`: selected candidate and complete lineage for every shot.
- `DeliveryManifest`: master, upscale, QC, archive, cost, and download metadata.

Reject natural-language-only handoffs when a structured contract exists. Validate before execution; do not silently fill unknown provider parameters.
