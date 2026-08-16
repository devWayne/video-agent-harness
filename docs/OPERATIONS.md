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

The service checkpoints provider task IDs and output locations after every paid or
long-running step:

1. Wan candidate task submitted;
2. selected candidate copied to owned OSS;
3. IMS 1080P mastering task submitted;
4. IMS SR5 4K task submitted.

On process restart, `resumePending()` enqueues the non-terminal jobs at their
existing state. It polls an existing provider task instead of submitting another
one. A retryable failure can be continued with:

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
