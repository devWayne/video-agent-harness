# Operations

## Runtime endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health/live` | Confirms that the Node.js process can serve requests. |
| `GET /health/ready` | Executes a SQLite readiness query; returns 503 when storage is unavailable. |
| `GET /metrics` | Prometheus text gauges for the current number of jobs in each state. |
| `GET /openapi.json` | OpenAPI 3.1 contract for the control plane. |
| `GET/POST /v1/projects/{id}/editorial-timelines` | Read or create the authoritative multitrack timeline. |
| `POST /v1/projects/{id}/editorial-timelines/{timelineId}/clips/{clipId}/replace` | Replace one candidate in place or ripple downstream timing. |
| `POST /v1/projects/{id}/editorial-timelines/{timelineId}/locks/{picture|audio}` | Lock one exact picture or audio revision. |
| `POST /v1/projects/{id}/editorial-timelines/{timelineId}/workspace-sync` | Stage a mapped timeline in OpenChatCut through MCP. |
| `GET /v1/music/capabilities` | BigMusic v5.0 parameters and non-secret defaults. |
| `GET /v1/music/usage` | Read-only BigMusic authorization/quota preflight. |
| `POST /v1/music/tracks` | Submit one asynchronous instrumental generation. |
| `GET /v1/music/tracks/{taskId}` | Poll generation state and resolve the provider output. |

Set `HARNESS_API_KEY` in production. Every `/v1/*` route then requires
`Authorization: Bearer <key>`. Health, metrics and OpenAPI endpoints are intended
for an internal ingress or monitoring network.

## Checkpoints and recovery

There are currently two operational paths:

- legacy `/v1/video-jobs`: Runtime automatically executes its configured Recipe and checkpoints step state;
- Agent-directed production: Codex/Skills may use Runtime Providers or recoverable repository CLIs, then must register task IDs, assets, reviews and final hashes in the Project ledger. The new ProductionOperation endpoints currently enforce state and gates but do not dispatch every Provider automatically.

The service checkpoints recipe step task IDs, assets and output locations after
every paid or long-running step:

1. Direct Wan/Seedance candidate submitted, or ComfyUI `prompt_id` submitted;
2. ComfyUI control video downloaded and registered as `motion-reference`;
3. LibTV reference node uploaded and V2V output node created;
4. selected candidate copied to owned OSS;
5. IMS 1080P mastering task submitted;
6. 4K task submitted: IMS SR5, or VOD URL import followed by AIGC Standard 4K;
7. VOD `GetMediaInfos` resolves the 4K `StoreUri`; a short-lived public TOS URL is
   copied back to private OSS and the temporary VOD media is kept unpublished.

The production voice-over CLI uses a separate cue-level receipt. It saves each Qwen Audio request result before moving to the next Cue, downloads the 24-hour temporary output immediately, preserves raw and picture-conformed WAV files, and resumes only missing Cues. Picture-lock, upscale and narration are separate checkpoints; retrying narration must never resubmit the 4K job.

BigMusic is also asynchronous but is intentionally exposed as submit/query API operations instead of being folded into video-job retry state. `QueryUsage` must pass before the first paid request. A successful `QuerySong` provider URL is only a transfer source: download it immediately, verify the actual container with `ffprobe`, register the owned copy as a project asset, and retain the task/request IDs. The provider's `50000001` copyright rejection is terminal and must not be retried unchanged.

Before step 1, cloud mode performs read-only `GetBucketInfo`,
`ListMediaProducingJobs`, and `ListMediaConvertJobs` checks. Missing or
under-scoped Alibaba Cloud credentials therefore fail the job before any paid Wan
generation is submitted. With `UPSCALE_PROVIDER=volcengine-vod`, it additionally
calls read-only `GetMediaList` for the configured VOD space before generation.

On process restart, `resumePending()` enqueues the non-terminal jobs at their
existing state. It polls an existing provider task instead of submitting another
one. ComfyUI resumes by `prompt_id`; LibTV resumes by deterministic canvas node
names and reuses an existing URL. A retryable failure can be continued with:

```bash
curl --request POST http://127.0.0.1:4100/v1/video-jobs/JOB_ID/retry \
  --header "Authorization: Bearer $HARNESS_API_KEY"
```

Failed candidate records are cleared for the affected unfinished shot; successful
candidates and completed shots remain intact.

The completed 4K object remains private. `GET /v1/video-jobs/{id}/download`
returns a 60–3600 second signed URL. Signed query strings are generated on demand
and are never stored in the job payload or manifest.

The VOD output path does not require a playback domain. `GetPlayInfo` remains a
legacy fallback only; the default provider resolves `TranscodeInfos` and signs the
VOD-managed TOS object through `VOLCENGINE_TOS_ENDPOINT`.

## Cost visibility

Legacy `costEstimate` records planned video-generation seconds and 4K upscale
seconds. To calculate CNY amounts, copy the current console rates into the runtime
configuration instead of relying on hard-coded prices:

```dotenv
COST_WAN_CNY_PER_SECOND=
COST_4K_CNY_PER_SECOND=
```

The estimate uses `duration × SHOT_CANDIDATES` for generated seconds and the target
duration once for 4K. The cloud provider bill remains the accounting source of
truth.

The estimate covers direct generation and the operator-supplied rate for the selected
4K provider. Cross-cloud storage and egress are not inferred automatically. LibTV
model billing is not yet returned by the CLI adapter, so `comfyui-libtv` jobs must not present
`costEstimate.totalCny` as a complete accounting figure. Add LibTV usage/billing
reconciliation before enforcing enterprise budget policy on this profile.

## Controlled pipeline network boundary

`GENERATION_PIPELINE=comfyui-libtv` adds two data transfers that do not exist in
the direct Profile:

1. ComfyUI output is downloaded over the configured local/LAN URL;
2. the local MP4 is uploaded to LibTV through the official CLI.

No upload is triggered by service startup, health checks or tests. It happens
only after a real video job reaches the `control-pass` and `final-generation`
steps. Use `SHOT_CANDIDATES=1` for the first live validation on a metered link.
Before the first step, the candidate pipeline performs read-only ComfyUI and
LibTV checks; failure stops the job before a Workflow submission or media upload.

## Container deployment

The included image runs as the unprivileged `node` user and persists SQLite and
manifests at `/app/data`:

```bash
docker compose up --build -d
```

This SQLite/dispatcher deployment is deliberately single-replica. Before running
multiple API or worker replicas, implement the existing repository and dispatcher
ports with PostgreSQL and a durable queue; do not share the SQLite file between
containers.

## Cloud credential boundary

- `BAILIAN_API_KEY` authorizes only the models enabled for the configured Beijing Model Studio workspace; this project reuses it for Wan and Qwen Audio, while model permissions and bills remain separate.
- `ARK_API_KEY` only authorizes the configured Volcengine Ark/Seedance model and is never
  returned by `/v1/workspace` or readiness metadata.
- `VOLCENGINE_VOD_ACCESS_KEY_ID` and `VOLCENGINE_VOD_SECRET_ACCESS_KEY` authorize
  VOD OpenAPI and the VOD-managed TOS output independently; the Ark key cannot
  replace them.
- `VOLCENGINE_MUSIC_ACCESS_KEY_ID` and `VOLCENGINE_MUSIC_SECRET_ACCESS_KEY` authorize the independent `imagination/cn-beijing` BigMusic OpenAPI. If omitted, the Runtime reuses the VOD IAM AK/SK, but BigMusic product authorization and IAM permissions must still be opened separately.
- IMS and OSS use the Alibaba Cloud default credential chain.
- Production should attach a least-privilege RAM role or STS identity.
- `OPENCHATCUT_MCP_TOKEN` only protects the separately deployed editorial MCP endpoint; it is redacted from logs and never stored in a project timeline or Git.
- Secrets belong in the deployment secret store, never the image, repository,
  logs or OpenAPI document.

The repository includes a bucket- and prefix-scoped starting policy at
[`ALIYUN_RAM_POLICY.json`](./ALIYUN_RAM_POLICY.json). The IMS APIs do not support
resource-level authorization, so their documented resource must remain `*`.

## Real cloud acceptance

After a local RAM/STS identity is available, run one 5-second candidate through
the full paid pipeline:

```bash
npm run smoke:cloud
```

The command forces Bailian generation, cloud delivery and one candidate per
shot. It first performs the cloud preflight, then verifies the persisted
manifest has no query signatures, IMS reports `3840×2160`, anonymous access to
the final object returns 403, and a signed one-byte range request succeeds. It
writes a non-secret report to `.data/cloud-smoke/cloud-acceptance.json`.

To upload, enhance, download and verify a local file with a resumable state receipt:

```bash
npm run vod:upscale-4k -- \
  --input /absolute/path/input.mp4 \
  --output /absolute/path/output-4k.mp4 \
  --confirm-paid YES
```

The command performs `ffprobe` and VOD space checks before billing, saves `Vid`
and `RunId` atomically, and will not overwrite an existing output without
`--overwrite`. It leaves VOD media unpublished but does not delete stored media.

To validate only the paid URL-import enhancement path with an already-accessible MP4,
set `VOD_4K_SMOKE_SOURCE_URL`, explicitly set `VOD_4K_SMOKE_CONFIRM_PAID=YES`,
and run `npm run smoke:vod-4k`. The script checks the VOD space first, verifies a
reported `3840×2160` output, prints only the signed TOS output host, and keeps the
imported VOD media `Unpublished`.
