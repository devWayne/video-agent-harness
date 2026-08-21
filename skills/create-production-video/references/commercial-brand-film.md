# Commercial brand-film production pattern

Use this pattern for multi-shot advertising, product explainers, flattened PDF decks, dashboards, and other brand-critical motion films.

## Route test before scale

Do not assume a control video improves the final renderer. Test one representative shot through both:

- `direct-keyframes`: authoritative source frames plus motion direction;
- `control-video`: an accepted H3 control draft plus authoritative appearance references.

Compare both at the final-render stage. Select the route that best preserves endpoints, motion, temporal stability, brand/data invariants, and cost. If the control draft injects deformation or weak motion, do not propagate it through the whole film.

## Long-form chunking

Design atomic Shot Intents first. Then group adjacent shots into bounded Provider segments only when they form one continuous transformation and fit the Provider duration limit.

- Give each segment a semantic start, milestones, and authoritative end state.
- Make adjacent segments share an approved boundary frame or source page.
- Prefer an original design frame over a recursively generated tail frame.
- Keep the retry scope small enough that one bad segment does not invalidate the film.
- Preserve the mapping from atomic shots to Provider segment and final timeline range.

## Endpoint and precision repair

Use the generative model for depth, choreography, camera, rhythm, and light. Use deterministic post-production for exact endpoints, logos, claims, subtitles, frame timing, trims, transitions, audio conformation, and codecs.

When endpoint fidelity is mandatory, restore the supplied clean frame at the beginning or end of the accepted generated segment and hold it long enough for the next segment to inherit the same state. Record the repair separately from the raw generated candidate.

## Cloud-input compliance

Run a source audit before upload. Preserve originals immutably. When a Provider rejects incidental photorealistic faces or private elements that are not essential to the story, create a local, layout-preserving sanitized derivative and record its parent asset and transformation. Never describe this as bypassing moderation; the derivative must still comply with the Provider policy.

## Picture lock, audio, and upscale

1. Accept all final segments and create a picture-locked master.
2. Run technical QC before expensive enhancement.
3. Upscale the locked master once, never every candidate.
4. Generate narration as independent time-coded cues, preserve raw and conformed takes, and align them to the picture clock.
5. Add subtitles, music, mix, and final mux without re-running the visual generator.
6. Verify duration, resolution, frame rate, codecs, audio format, black/frozen frames, hashes, and archive completeness.

FFmpeg/ffprobe may perform deterministic editing, mixing, muxing, and inspection. They must not be reported as the AI upscale service.

## Minimum run record

Copy `../assets/production-run-record.template.json` and fill only non-secret facts. Keep credentials, signed URLs, private hosts, absolute local paths, and customer-sensitive prompts out of committed records.
