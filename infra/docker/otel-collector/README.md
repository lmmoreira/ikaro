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

The traces pipeline in `config.yaml` has neither. Both are timer/async-worker patterns, and this collector runs as a sidecar on the same `cpu-throttling: true` Cloud Run instance as the app — a flush that depends on a background timer or queue worker can be silently starved the same way the app-side `BatchSpanProcessor` was, just in a different container. Before "helpfully" re-adding batching for throughput: read `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling — timer/async work can be silently starved (sidecars included) first — it documents the ~73% trace-loss measurement that led to removing it, and the always-allocated-CPU alternative that was considered and rejected on cost.

## Local validation

```bash
docker build -t otel-collector-check -f infra/docker/otel-collector/Dockerfile infra/docker/otel-collector
```

A broken `config.yaml` fails this build with a clear error (proven during M17-S34 implementation — a config referencing an undefined processor fails with `service::pipelines::traces: references processor "..." which is not configured`, exit code 1).
