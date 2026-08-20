# Structured contracts

Use repository domain types and OpenAPI as the source of truth. At minimum preserve:

- `ProductionPlan`: brief, target audience, story structure, continuity anchors, delivery and cost constraints.
- `CharacterBible` / `SceneBible`: authoritative identity, wardrobe, location, lighting, prop, sound, and rights anchors.
- `ShotIntent`: shot index, duration, narrative purpose, subject, action, camera, environment, lighting, sound, ordered reference roles, negatives, and acceptance criteria.
- `ProductionOperation`: one explicit `control-generation`, `final-render`, `assembly`, or `delivery` command with declared inputs, dependencies, executor and output assets. Evaluation is a separate review gate attached after successful execution; never hide it inside Provider success.
- `ShotRecipe`: approved execution Profile and ordered operations; it contains no hidden creative decisions.
- `GenerationAsset`: immutable ID, role, URI/path, producing executor, task ID, and metadata.
- `EvaluationReport`: stage, normalized scores, evidence, issues, decision, parameter patches, evaluator, and timestamp.
- `AcceptedShotManifest`: selected candidate and complete lineage for every shot.
- `DeliveryManifest`: master, upscale, QC, archive, cost, and download metadata.

Reject natural-language-only handoffs when a structured contract exists. Validate before execution; do not silently fill unknown provider parameters.
