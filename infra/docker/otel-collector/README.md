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

The traces pipeline in `config.yaml` has neither. Both are timer/async-worker patterns, and this collector runs as a sidecar on the same `run.googleapis.com/cpu-throttling: "true"` Cloud Run instance as the app — a flush that depends on a background timer or queue worker can be silently starved the same way the app-side `BatchSpanProcessor` was, just in a different container. Before "helpfully" re-adding batching for throughput: read `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling — timer/async work can be silently starved (sidecars included) first. **This fix is real and worth keeping, but it was never the dominant cause of the trace loss investigated below — that turned out to be a completely different bug, in sampling. Read on.**

## Resolved: the majority of production trace loss was a sampling bug, not a CPU/collector issue (2026-08-05)

**TL;DR: `packages/observability/src/otel-tracing.ts`'s `ParentBasedSampler` was silently dropping most spans before they were ever recorded — nothing to do with the collector, CPU throttling, or anything in this directory. Fixed by explicitly overriding `remoteParentNotSampled`/`localParentNotSampled` instead of leaving them at OTel's own `AlwaysOff` default. Verified 0/40 traces missing on real staging traffic after the fix, vs. ~75-89% missing before it.** Full technical writeup, including the exact code and why it was so hard to distinguish from the CPU-throttling bug above: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling.

**Follow-up, same day: fixing the sampler bug uncovered a second, smaller bug.** Once real traffic started actually reaching the exporter, the OTLP exporter's own default `concurrencyLimit` (30 in-flight exports) turned out to be too low — bursts were hitting `Error('Concurrent export limit reached')` (598 times in ~80 minutes on staging). Fixed by passing `concurrencyLimit: 200` explicitly. Also nothing to do with this directory (app-side exporter config, not the collector) — full writeup: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, same section as above.

**Follow-up, same day: a third, unrelated bug — the app was silently emitting metrics against this collector's `metrics:` pipeline, which doesn't exist.** `bootstrapTracing()` never explicitly disabled `@opentelemetry/sdk-node`'s own independent metrics default, so every instance was running a periodic OTLP metrics export loop against this collector's `/v1/metrics` route — which was never registered, since `service.pipelines` here only defines `traces:` (see the "Metrics pipeline stub" comment in `config.yaml`). Every export attempt hit a genuine 404, logged as an ERROR forever. Fixed app-side by passing `metricReaders: []` explicitly — nothing to change in this directory; the metrics pipeline stays deferred until M17-S35 needs it (and per that story's current plan, it may never need this path at all — see `plan/M17-CLOUD-DEPLOY.md`'s M17-S35 notes). Full writeup: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, same section as above.

This section is kept as a **methodology playbook** — the live-debugging techniques below are reusable for any future "telemetry is silently missing" investigation, on this pipeline or any other.

### How to measure trace loss yourself

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
   (the `^@^` prefix changes gcloud's list delimiter from `,` to `@`, because the array syntax `[googlecloud,debug]` otherwise collides with `--args`' own comma-separated parsing). The debug exporter prints full span data straight into Cloud Logging — search `textPayload:"<traceId>"` on the revision to see whether the collector ever received a given trace at all.
5. **If step 4 shows the collector never received the span at all, check the *app's* own diagnostic channel next — not just the collector's.** The collector's Go-side `service.telemetry.logs.level` (settable the same way as step 4's `--args`) is a *different* logger from the app's own `@opentelemetry/api` `diag` channel, which this repo hardcodes to `WARN` in `otel-tracing.ts`. Bumping the app's `diag` to `DEBUG` requires an actual code change and image rebuild (no CLI override exists for this one) — but it's what actually surfaced this bug: OTel's own internal `"Recording is off, propagating context in a non-recording span"` message, which only appears at `DEBUG`, pointed straight at `Tracer.js`'s `shouldSample()` making a `NOT_RECORD` decision.
6. **For any live code-level diagnostic that needs a real image (not just a CLI override), you don't need the full CI/PR pipeline.** Build and push a throwaway-tagged image directly, then point the live service at it:
   ```bash
   docker build -t <registry>/ikaro-backend:diag-test -f apps/backend/Dockerfile .
   docker push <registry>/ikaro-backend:diag-test
   gcloud run services update ikaro-backend --region=<region> --project=<project> \
     --container=app --image=<registry>/ikaro-backend@sha256:<digest-from-push>
   ```
   This skips lint/tests/Trivy/PR review — acceptable for a throwaway diagnostic build you're about to discard, never for anything that stays deployed. **Every manual override in this playbook (image, CPU, memory, env vars, args) must be reverted to the Terraform-declared baseline once the real fix lands through the normal branch/PR/CI path** — none of it is reflected in Terraform, and it will show up as drift on the next `terraform plan` otherwise.

### What was ruled out along the way (each via a direct live or local test, not inference)

None of these were the cause — kept here so nobody re-spends the effort re-testing them:

| Hypothesis | Test | Result |
|---|---|---|
| Collector CPU too low (0.1 vCPU) | Bumped to 1 vCPU on the live service | No effect |
| Collector memory too low (128Mi) | Bumped to 512Mi | No effect |
| Cloud Trace indexing lag | Rechecked identical trace IDs 10+ min later | Identical result — not lag |
| Wrong trace ID being checked (Cloud Run infra ID vs. app's real OTel ID) | Compared the app's own structured-log `traceId` field against Cloud Run's `httpRequest` log `trace` field for the same request | Identical — not a mismatch |
| `OTEL_TRACES_SAMPLER=always_on` env var | Checked `sdk.js` source: `sampler: this._configuration?.sampler ?? createSamplerFromEnv()` — an explicit code-level `sampler` (which this codebase always provides) means `createSamplerFromEnv()`, and therefore this env var, is never consulted at all | Structurally excluded — wouldn't have worked even if tried |
| VPC egress routing Cloud Trace calls through a throughput-limited NAT/connector | Checked Terraform: `ikaro-backend` uses `vpc_egress = "PRIVATE_RANGES_ONLY"` | Structurally excluded — public-internet calls bypass the VPC connector entirely |
| Cloud Run CPU throttling starving the *app's own* post-response export call (not just the collector's) | Disabled `cpu-throttling` entirely on `ikaro-backend`; confirmed via the collector's debug exporter that backend's own child spans still never arrived even fully un-throttled | No effect |
| `@opentelemetry/instrumentation-http` ending spans on the response `close` event, which doesn't fire per-request on a reused keep-alive connection (a real, documented class of bug in that package) | (a) Raw Node `http` server + real instrumentation, 15 requests over one reused keep-alive connection: 30/30 spans exported. (b) The full real app stack, run locally — real NestJS/Express, real `dev-login`-authenticated BFF→backend calls, real keep-alive reuse: every span exported, zero loss | Disproven, twice |

### The diagnostic sequence that actually found it

1. The local-repro result above (zero loss with the exact same traffic pattern that loses 75-89% in production) proved the bug wasn't in this codebase's OTel usage or the Node/Express/NestJS request lifecycle — it had to be something about how production requests specifically reached the app.
2. Bumping the app's own `diag` channel to `DEBUG` (step 5 above) surfaced `"Recording is off, propagating context in a non-recording span"` — traced to `ParentBasedSampler`'s `shouldSample()` returning `NOT_RECORD`.
3. **Diagnostic test 1 (confirms sampling is the mechanism, not the fix to keep):** swapped the sampler to `new AlwaysOnSampler()` on `ikaro-backend` only. Loss dropped from ~80% to ~21% — a dramatic, immediate confirmation, even though this specific service leg wasn't the whole chain.
4. Same swap on `ikaro-bff` too: loss dropped to ~5%, closing almost the entire gap.
5. **The real fix** (see `docs/ENGINEERING_RULES.md` for the exact code): explicit `remoteParentNotSampled`/`localParentNotSampled` overrides instead of `AlwaysOnSampler` — preserves prod's `OTEL_TRACES_SAMPLER_ARG=0.1` cost control instead of forcing 100% sampling everywhere. **0/40 traces missing** on the final live A/B.

## Local validation

```bash
docker build -t otel-collector-check -f infra/docker/otel-collector/Dockerfile infra/docker/otel-collector
```

A broken `config.yaml` fails this build with a clear error (proven during M17-S34 implementation — a config referencing an undefined processor fails with `service::pipelines::traces: references processor "..." which is not configured`, exit code 1).
