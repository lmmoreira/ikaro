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

## `batch` processor + `sending_queue`: removed 2026-08-05, reintroduced 2026-08-06 — read this before touching either

The traces pipeline in `config.yaml` has both again, as of 2026-08-06. It didn't always: they were removed on 2026-08-05 over a real, measured CPU-throttling timer-starvation risk, then reintroduced the next day once a *different* bug (Cloud Trace write-quota bursting — see below) turned out to need exactly what was removed. Both halves of this story are real; read both before changing either setting again.

**Why they were removed (2026-08-05):** a wall-clock-timer-driven flush can be silently starved by `run.googleapis.com/cpu-throttling: "true"` — Cloud Run only allocates CPU while a request is actively being handled, so a timer tick that lands in an idle gap simply never runs. A 33-trace staging sample measured ~73% loss with `batch` in place. Full mechanism: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling.

**Why that measurement didn't tell the whole story:** it was taken while the app-side `ParentBasedSampler` bug (found and fixed the next day) was still silently dropping most spans before export was ever attempted. That meant real span arrival at the collector was extremely sparse — long idle/throttled gaps between spans, exactly the condition where a timer-based flush is most likely to land in a throttled gap. The 73% figure was real, but the traffic pattern behind it wasn't representative of steady real traffic.

**Why they came back (2026-08-06):** once the sampler bug and the exporter's `concurrencyLimit` were both fixed (see the two "Follow-up" bullets below), a new, unrelated problem appeared — Cloud Trace's write API has a documented per-project quota of 4,800 requests/60s (80 req/s). With one synchronous export call per span and real traffic flowing, an ordinary burst of ~4 dashboard requests (each fanning out to 15-20+ spans) produced 71 simultaneous export calls in ~300ms — ~237 req/s, nearly 3x the quota — and all 71 spans were lost (no retry on a synchronous per-span design). This is a hard external ceiling; more CPU/memory would not have fixed it. Batching coalesces many small calls into far fewer, larger ones, staying under quota without depending on the timer firing during genuinely idle time — real traffic keeps hitting the batch's *size* threshold long before its `timeout` matters. Verified live over ~34 minutes across two real bursts: one dropped batch (32 spans) ~2 minutes after a fresh deploy (looks like one-time connection/auth warm-up, not steady-state), then zero failures and 37/37 traces fully intact on a second burst ~20 minutes later, once warm. Not proven zero-loss forever, but a clear, repeatable improvement over the no-batch design, which lost spans on two separate occasions under ordinary traffic with no warm-up excuse either time.

**The unmitigated risk that's still there:** `sending_queue: enabled: true` is not a resilience mechanism despite the name — `retry_on_failure` is genuinely rejected as an invalid key by this exporter version (re-confirmed 2026-08-06), so a batch that hits the timeout is dropped permanently, logged as `"Exporting failed. Dropping data."` with a `dropped_items` count, no retry. If failures start recurring under steady traffic (not just after a fresh deploy), the next lever is a smaller `send_batch_size` (less lost per failure), not assuming this is now safe by default.

## Resolved: the majority of production trace loss was a sampling bug, not a CPU/collector issue (2026-08-05)

**TL;DR: `packages/observability/src/otel-tracing.ts`'s `ParentBasedSampler` was silently dropping most spans before they were ever recorded — nothing to do with the collector, CPU throttling, or anything in this directory. Fixed by explicitly overriding `remoteParentNotSampled`/`localParentNotSampled` instead of leaving them at OTel's own `AlwaysOff` default. Verified 0/40 traces missing on real staging traffic after the fix, vs. ~75-89% missing before it.** Full technical writeup, including the exact code and why it was so hard to distinguish from the CPU-throttling bug above: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling.

**Follow-up, same day: fixing the sampler bug uncovered a second, smaller bug.** Once real traffic started actually reaching the exporter, the OTLP exporter's own default `concurrencyLimit` (30 in-flight exports) turned out to be too low — bursts were hitting `Error('Concurrent export limit reached')` (598 times in ~80 minutes on staging). Fixed by passing `concurrencyLimit: 200` explicitly. Also nothing to do with this directory (app-side exporter config, not the collector) — full writeup: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, same section as above.

**Follow-up, same day: a third, unrelated bug — the app was silently emitting metrics against this collector's `metrics:` pipeline, which doesn't exist.** `bootstrapTracing()` never explicitly disabled `@opentelemetry/sdk-node`'s own independent metrics default, so every instance was running a periodic OTLP metrics export loop against this collector's `/v1/metrics` route — which was never registered, since `service.pipelines` here only defines `traces:` (see the "Metrics pipeline stub" comment in `config.yaml`). Every export attempt hit a genuine 404, logged as an ERROR forever. Fixed app-side by passing `metricReaders: []` explicitly — nothing to change in this directory; the metrics pipeline stays deferred until M17-S35 needs it (and per that story's current plan, it may never need this path at all — see `plan/M17-CLOUD-DEPLOY.md`'s M17-S35 notes). Full writeup: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, same section as above.

**Follow-up, next day (2026-08-06): a fourth bug, this time actually in this directory — Cloud Trace's per-project write-API quota (80 req/s), not CPU/network, and it's what brought `batch`/`sending_queue` back.** Once the three fixes above let real, dense traffic reach the exporter, one-call-per-span started bursting past Cloud Trace's documented write quota — 71 spans lost in one ~300ms burst from just 4 ordinary HTTP requests. See the `batch` processor section above for the full writeup and the live A/B evidence for reintroducing batching.

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
7. **If spans are reaching the collector (step 4 confirms receipt) but Cloud Trace still shows gaps, check the collector's own stderr for the exporter's failure signature before assuming CPU/network** — `gcloud logging read '... textPayload:"context deadline exceeded"'` for a raw per-call timeout, or `textPayload:"Dropping data"` for a queue-sender batch getting dropped (the latter includes a `dropped_items` count in its structured payload). A tight cluster of many such lines within a sub-second window, correlated with only a handful of real HTTP requests in the same window, points at Cloud Trace's per-project write-API quota (4,800 req/60s — https://docs.cloud.google.com/trace/docs/quotas) being burst past, not a resource problem — cross-check against real request-log volume in the same window before concluding it's CPU/memory (a coarse, ~60s-resolution Cloud Run container CPU metric cannot confirm or rule out a sub-second spike either way — don't trust it for this).

### What was ruled out along the way (each via a direct live or local test, not inference)

None of these were the cause **of the sampling-bug-era loss investigated below** — kept here so nobody re-spends the effort re-testing them for *that* investigation. Caveat added 2026-08-06: the CPU row's "no effect" result was measured while the sampler bug was still active (see the `batch` processor section above) — sparse span arrival at the time meant this test couldn't have detected a CPU-contention effect either way, since barely any spans were reaching the collector to contend over. It's not evidence CPU is irrelevant under today's real traffic; it just wasn't a useful test for what it was trying to test.

| Hypothesis | Test | Result |
|---|---|---|
| Collector CPU too low (0.1 vCPU) | Bumped to 1 vCPU on the live service | No effect (see caveat above — inconclusive under sampler-bug-era sparse traffic, not re-tested since) |
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
