# otel-collector sidecar

The only place GCP appears in the observability stack (M17 D9). Backend and
BFF emit OTLP only (`apps/{backend,bff}/src/tracing.ts`, M17-S33); this
collector is what actually talks to Cloud Trace.

## Files

- `Dockerfile` — digest-pinned `otel/opentelemetry-collector-contrib` base image, config baked in, validated at build time.
- `config.yaml` — receivers/processors/exporters/pipeline. See its own comments for the anti-lock-in exporter-swap note.

## Rebuild → deploy path

1. Edit `config.yaml` (or bump the pinned digest in `Dockerfile`).
2. Push to `main`. `.github/workflows/build-otel-collector.yml` (triggered only on changes under this directory) runs `validate`, builds, and pushes the image to GAR tagged `:latest` (plus the commit SHA, for traceability).
3. **Nothing else to do.** The next backend or BFF deploy (`deploy-staging.yml` / `deploy-production.yml`) resolves `ikaro-otel-collector:latest` to its current digest immediately before deploying, and redeploys both containers with that digest. The live sidecar is always pinned to a resolved digest — `:latest` is only a GAR-side lookup convenience, never what's actually running.

There is no manual Terraform edit and no manual `terraform apply` in this loop — see `M17-S34` in `plan/M17-CLOUD-DEPLOY.md` for the full design rationale (including the alternatives that were considered and rejected: a GitHub Actions repo variable, and a hand-maintained tag line in the deploy workflow).

If you want the new collector image live *immediately*, without waiting for the next unrelated backend/BFF deploy, trigger `deploy-staging.yml` manually via `workflow_dispatch` (or `deploy-production.yml`'s equivalent promotion flow) after step 2 completes.

## Local validation

```bash
docker build -t otel-collector-check -f infra/docker/otel-collector/Dockerfile infra/docker/otel-collector
```

A broken `config.yaml` fails this build with a clear error (proven during M17-S34 implementation — a config referencing an undefined processor fails with `service::pipelines::traces: references processor "..." which is not configured`, exit code 1).
