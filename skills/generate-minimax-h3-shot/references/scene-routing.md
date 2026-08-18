# H3 scene routing

Choose capability by required control, not by novelty:

- Text-to-video: establishing or atmospheric shots without a locked identity.
- Image-to-video: one stable character, product, environment, or key composition.
- First/last-frame: a shot with an explicit beginning and destination composition.
- Reference-video or motion-transfer: action, camera, rhythm, blocking, or choreography is the primary constraint.
- Multi-reference: identity, wardrobe, product, or environment must remain anchored by separate references.
- Video editing: the input clip is already close and only a localized transformation is required.

Separate semantic Prompt intent from control evidence. A reference image controls appearance; a reference video controls motion/camera unless the Profile explicitly supports another role. Do not ask one asset to control conflicting properties.

For a multi-shot character scene, prefer REF2VA when identity is the hard constraint. Inject the original Character Pack into every shot and use the previous accepted frame only for pose, blocking, camera, environment, lighting, or object state. Prefer FL2VA when exact start/end compositions are more important than multi-reference identity.

Assign `modelAffinity` by checkpoint family and execute same-model shots in batches. Do not alternate REF2VA and FL2VA for adjacent shots when their order can be scheduled independently.
