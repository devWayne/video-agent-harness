# Operations

## Runtime endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health/live` | Confirms that the Node.js process can serve requests. |
| `GET /health/ready` | Executes a SQLite readiness query; returns 503 when storage is unavailable. |
| `GET /metrics` | Prometheus text gauges for the current number of jobs in each state. |
| `GET /openapi.json` | OpenAPI 3.1 contract for the control plane. |

Set `HARNESS_API_KEY` in production. Every `/v1/*` route then requires
`Authorization: Bearer <key>`. Health, metrics and OpenAPI endpoints are intended
for an internal ingress or monitoring network.

## Checkpoints and recovery

The service checkpoints recipe step task IDs, assets and output locations after
every paid or long-running step:

1. Direct Wan candidate submitted, or ComfyUI `prompt_id` submitted;
2. ComfyUI control video downloaded and registered as `motion-reference`;
3. LibTV reference node uploaded and V2V output node created;
4. selected candidate copied to owned OSS;
5. IMS 1080P mastering task submitted;
6. IMS SR5 4K task submitted.

Before step 1, cloud mode performs read-only `GetBucketInfo`,
`ListMediaProducingJobs`, and `ListMediaConvertJobs` checks. Missing or
under-scoped Alibaba Cloud credentials therefore fail the job before any paid Wan
generation is submitted.

On process restart, `resumePending()` enqueues the non-terminal jobs at their
existing state. It polls an existing provider task instead of submitting another
one. ComfyUI resumes by `prompt_id`; LibTV resumes by deterministic canvas node
names and reuses an existing URL. A retryable failure can be continued with:

```bash
curl --request POST http://127.0.0.1:3321/v1/video-jobs/JOB_ID/retry \
  --header "Authorization: Bearer $HARNESS_API_KEY"
```

Failed candidate records are cleared for the affected unfinished shot; successful
candidates and completed shots remain intact.

The completed 4K object remains private. `GET /v1/video-jobs/{id}/download`
returns a 60–3600 second signed URL. Signed query strings are generated on demand
and are never stored in the job payload or manifest.

## Cost visibility

`costEstimate` always records planned Wan generation seconds and 4K upscale
seconds. To calculate CNY amounts, copy the current console rates into the runtime
configuration instead of relying on hard-coded prices:

```dotenv
COST_WAN_CNY_PER_SECOND=
COST_4K_CNY_PER_SECOND=
```

The estimate uses `duration × SHOT_CANDIDATES` for generated seconds and the target
duration once for 4K. The cloud provider bill remains the accounting source of
truth.

The current estimate covers Bailian generation and IMS only. LibTV model billing
is not yet returned by the CLI adapter, so `comfyui-libtv` jobs must not present
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

- `BAILIAN_API_KEY` only authorizes the configured Wan model.
- IMS and OSS use the Alibaba Cloud default credential chain.
- Production should attach a least-privilege RAM role or STS identity.
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
