# Approval and data policy

## Project generation lock

- Every new project starts with `generationMode: local-only`.
- In `local-only`, Runtime must reject LibTV generation, Seedance, MiniMax cloud, Wan cloud, and any other online or paid video-render request. Local ComfyUI/H3, local image processing, HyperFrames/FFmpeg, OpenChatCut, and manual asset registration remain allowed.
- Unlock only after the user explicitly authorizes paid rendering for the current project. Do not infer authorization from available budget, configured credentials, prior approvals, existing provider bindings, or a request to improve quality.
- Record the authorization date, provider/model scope, budget scope, and approving user in the private project ledger, then set `generationMode: paid-providers-approved` through Runtime.
- Authorization for one project, provider, stage, or candidate batch does not authorize any other scope. The user may relock the project at any time.

- Read the active Harness budget and approval policy before a paid generation, upload, model download, or cloud delivery.
- Treat reference media as private unless the project explicitly marks it publishable.
- Upload only the asset required by the current Recipe step.
- Do not place credentials, cookies, signed URLs, internal addresses, ports, local absolute paths, or account identifiers in committed files.
- Record model, Profile, Workflow hash, provider task, cost, and output lineage for every paid candidate.
- Require human review for rights ambiguity, identity-sensitive outputs, policy uncertainty, conflicting quality scores, or final publication.
- Never infer permission to publish from permission to generate.
