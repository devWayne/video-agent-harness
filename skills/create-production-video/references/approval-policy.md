# Approval and data policy

## Project generation lock

- Every new project starts with `generationMode: local-only`.
- In `local-only`, Runtime must reject LibTV generation, Seedance, MiniMax cloud, Wan cloud, and any other online or paid video-render request. Local ComfyUI/H3, local image processing, HyperFrames/FFmpeg, OpenChatCut, and manual asset registration remain allowed.
- For configured services other than Seedance and paid 4K/upscale, the Agent may follow the normal project budget and approval policy without asking for the extra local-demo confirmation. Record any mode change and exact provider scope in the private ledger.
- Seedance and paid 4K/upscale may be unlocked only through the separate human confirmations below. Do not infer either authorization from available budget, configured credentials, prior approvals, existing provider bindings, or a request to improve quality.
- The current Runtime `generationMode` is a coarse safety switch. Never treat switching it to `paid-providers-approved` for another service as a Seedance or 4K authorization; require and record the service-specific receipt before either protected call.

## Seedance and 4K local-demo gate

- Before a Seedance video-generation call or a paid IMS/VOD/other 4K-upscale call, produce a representative local H3/demo cut and let the user watch it. An Agent score, technical QC result, contact sheet, configured API key, or prior-project result cannot substitute for that viewing.
- Record the reviewed demo Asset ID/path, review date, reviewer and decision in the private ledger. If the user rejects the demo, keep Seedance and 4K locked and revise locally; this rejection does not add a manual-confirmation requirement to other services.
- Ask separately for Seedance and 4K. They are two independent approvals.
- Before confirmation, state the service/model, purpose, exact input asset, requested duration/resolution, candidate or retry count, estimated cost or pricing uncertainty, and approval expiry/batch scope.
- Never infer an upscale approval from Seedance approval, or Seedance approval from upscale approval. Never infer a later-batch approval from either one.
- TTS, music, local processing and other configured services do not require this extra confirmation unless another active project rule requires it; they still follow credentials, privacy, budget and publication controls.

- Read the active Harness budget and approval policy before a paid generation, upload, model download, or cloud delivery.
- Treat reference media as private unless the project explicitly marks it publishable.
- Upload only the asset required by the current Recipe step.
- Do not place credentials, cookies, signed URLs, internal addresses, ports, local absolute paths, or account identifiers in committed files.
- Record model, Profile, Workflow hash, provider task, cost, and output lineage for every paid candidate.
- Require human review for rights ambiguity, identity-sensitive outputs, policy uncertainty, conflicting quality scores, or final publication.
- Never infer permission to publish from permission to generate.
