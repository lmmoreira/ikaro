# otel-collector sidecar

The only place GCP appears in the observability stack (M17 D9). Backend and
BFF emit OTLP only (`apps/{backend,bff}/src/tracing.ts`, M17-S33); this
collector is what actually talks to Cloud Trace.

## Files

- `Dockerfile` — digest-pinned `otel/opentelemetry-collector-contrib` base image, config baked in, validated at build time.
- `config.yaml` — receivers/processors/exporters/pipeline. See its own comments for the anti-lock-in exporter-swap note.

## Rebuild → deploy path

1. Edit `config.yaml` (or bump the pinned digest in `Dockerfile`).
2. Open a PR touching this directory. `.github/workflows/build-otel-collector.yml`'s `build-and-scan` job (triggered on changes under this directory, or to the workflow file itself) builds, runs `validate`, and Trivy-scans the image on every PR — a broken Dockerfile/config fails the PR, not a post-merge push.
3. Merge to `main`. The same workflow's `push` job (cache-hit rebuild, push-only, `push` events only) pushes the image to GAR tagged `:latest` (plus the commit SHA, for traceability).
4. **Nothing else to do.** The next backend or BFF deploy (`deploy-staging.yml` / `deploy-production.yml`) resolves `ikaro-otel-collector:latest` to its current digest immediately before deploying, and redeploys both containers with that digest. The live sidecar is always pinned to a resolved digest — `:latest` is only a GAR-side lookup convenience, never what's actually running.

There is no manual Terraform edit and no manual `terraform apply` in this loop — see `M17-S34` in `plan/M17-CLOUD-DEPLOY.md` for the full design rationale (including the alternatives that were considered and rejected: a GitHub Actions repo variable, and a hand-maintained tag line in the deploy workflow).

If you want the new collector image live *immediately*, without waiting for the next unrelated backend/BFF deploy, trigger `deploy-staging.yml` manually via `workflow_dispatch` (or `deploy-production.yml`'s equivalent promotion flow) after step 3 completes.

## No `batch` processor, no async `sending_queue` — deliberate, not an oversight

The traces pipeline in `config.yaml` has neither. Both are timer/async-worker patterns, and this collector runs as a sidecar on the same `run.googleapis.com/cpu-throttling: "true"` Cloud Run instance as the app — a flush that depends on a background timer or queue worker can be silently starved the same way the app-side `BatchSpanProcessor` was, just in a different container. Before "helpfully" re-adding batching for throughput: read `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling — timer/async work can be silently starved (sidecars included) first — it documents the ~73% trace-loss measurement that led to removing it, and the always-allocated-CPU alternative that was considered and rejected on cost. **That fix is real and still correct to keep — but read the section below before assuming it solved trace reliability. It didn't.**

## Known unresolved issue: most production traces are still lost (as of 2026-08-05)

**Status: the fix above (sync export, no batch/queue) is deployed, validated, and worth keeping — it closes a real, proven bug. It is not sufficient. ~75-85% of real traces in staging still never reach Cloud Trace, essentially unchanged from the ~73% baseline that motivated the fix in the first place.** This was discovered in a live follow-up investigation the same day PR #324 (the sync-export fix) merged, using real staging traffic. If you're picking this up fresh, start here rather than re-deriving the below.

### How to measure it yourself

1. Generate real traffic against staging (through the actual web app, or `dev-login` locally — see below).
2. Pull the request-log trace IDs for the window: `gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name=("ikaro-backend" OR "ikaro-bff") logName="projects/<project>/logs/run.googleapis.com%2Frequests" timestamp>="<start>" timestamp<="<end>"' --format=json`, extract each entry's `trace` field.
3. For each trace ID, check the Cloud Trace API directly — **not the Console UI**, which can misleadingly read like lag: `curl -H "Authorization: Bearer $(gcloud auth print-access-token)" https://cloudtrace.googleapis.com/v1/projects/<project>/traces/<traceId>`. A `404` here, rechecked 10+ minutes later with an identical result, is real loss, not indexing lag.
4. To see what the collector itself actually received (ground truth, independent of whether export to Cloud Trace succeeded), redeploy with a `debug` exporter added alongside `googlecloud` — no image rebuild needed, this can be done live via `gcloud run services update`'s per-container `--args` override:
   ```bash
   gcloud run services update ikaro-backend --region=<region> --project=<project> \
     --container=otel-collector \
     --command=/otelcol-contrib \
     --args="^@^--config=/etc/otelcol-contrib/config.yaml@--set=exporters.debug.verbosity=detailed@--set=service.pipelines.traces.exporters=[googlecloud,debug]"
   ```
   (the `^@^` prefix changes gcloud's list delimiter from `,` to `@`, because the array syntax `[googlecloud,debug]` otherwise collides with `--args`' own comma-separated parsing). The debug exporter prints full span data straight into Cloud Logging — search `textPayload:"<traceId>"` on the revision to see whether the collector ever received a given trace at all. **Remember to revert CPU/memory/args back to baseline afterward** — none of this is meant to be permanent, and it isn't reflected in Terraform.

### What's been ruled out (each via a direct live or local test, not inference)

| Hypothesis | Test | Result |
|---|---|---|
| Collector CPU too low (0.1 vCPU) | Bumped to 1 vCPU on the live service | No effect |
| Collector memory too low (128Mi) | Bumped to 512Mi | No effect |
| Cloud Trace indexing lag | Rechecked identical trace IDs 10+ min later | Identical result — not lag |
| Wrong trace ID being checked (Cloud Run infra ID vs. app's real OTel ID) | Compared the app's own structured-log `traceId` field against Cloud Run's `httpRequest` log `trace` field for the same request | Identical — not a mismatch |
| Under-sampling (effective rate < 1.0) | Forced `OTEL_TRACES_SAMPLER_ARG=1.0` explicitly on **both** `ikaro-backend` and `ikaro-bff` | No effect |
| VPC egress routing Cloud Trace calls through a throughput-limited NAT/connector | Checked Terraform: `ikaro-backend` uses `vpc_egress = "PRIVATE_RANGES_ONLY"` | Structurally excluded — public-internet calls bypass the VPC connector entirely |
| Cloud Run CPU throttling starving the *app's own* post-response export call (not just the collector's) | Disabled `cpu-throttling` entirely on `ikaro-backend`; confirmed via the collector's debug exporter that backend's own child spans still never arrived even fully un-throttled | No effect |
| `@opentelemetry/instrumentation-http` ending spans on the response `close` event, which doesn't fire per-request on a reused keep-alive connection (a real, documented class of bug in that package) | (a) Raw Node `http` server + real instrumentation, 15 requests over one reused keep-alive connection: 30/30 spans exported. (b) **The full real app stack, run locally** — real NestJS/Express, real `dev-login`-authenticated BFF→backend calls, real keep-alive reuse: every span exported, zero loss, under the exact traffic pattern that loses 75-85% in production | Disproven, twice |

### The one result that actually narrows it down

Running the real application locally (both `apps/backend` and `apps/bff`, `OTEL_SDK_DISABLED=false`, pointed at a local `otel-collector` with a `debug` exporter, authenticated via the BFF's dev-only `POST /v1/auth/dev-login`) and sending real traffic through the same BFF→backend call path that loses spans in production: **zero spans lost.** This means the bug is not in this codebase's OTel usage, not in the Node/Express/NestJS request lifecycle, and not something more collector-side config tuning is likely to fix — it's specific to the live Cloud Run environment in a way not yet isolated.

### Recommended next steps, in order

1. **Build a minimal, isolated synthetic Cloud Run service** — a tiny app that does nothing but generate spans in a loop, deployed with the same collector-sidecar setup as `ikaro-backend`. If loss reproduces there too, the cause is something about Cloud Run generically (gVisor sandboxing, its internal proxy/networking for multi-container services, etc.), not anything specific to this repo's services. If it *doesn't* reproduce, that's a strong signal the cause is in some configuration difference between the synthetic service and the real ones (VPC settings, ingress mode, specific library versions) not yet varied.
2. **If step 1 isolates it as Cloud-Run-generic:** this stops being something further local debugging can solve — file with Google Cloud Support with the reproduction.
3. **Otherwise:** keep narrowing by varying whatever configuration differs between the synthetic repro and the real services.

Don't re-litigate anything in the ruled-out table above without new evidence — all of it was tested directly, not guessed.

## Local validation

```bash
docker build -t otel-collector-check -f infra/docker/otel-collector/Dockerfile infra/docker/otel-collector
```

A broken `config.yaml` fails this build with a clear error (proven during M17-S34 implementation — a config referencing an undefined processor fails with `service::pipelines::traces: references processor "..." which is not configured`, exit code 1).
