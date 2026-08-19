# otel-collector sidecar image (M17-S34). Digest-only pin (no tag) — this
# repo's SonarCloud rule docker:S8431 fails the build on a tag+digest form
# (CLAUDE.md's Dependabot Docker digest convention); Dependabot watches this
# directory (see .github/dependabot.yml) for base-image bumps.
#
# Pinned 2026-08-04 to otel/opentelemetry-collector-contrib:0.157.0 — the
# latest stable release as of this story (confirmed via Docker Hub's tags
# API, not the moving `:latest` tag).
FROM otel/opentelemetry-collector-contrib@sha256:c5918f78992ee73b0d6f0e599423ac5ec52dd5d9726733114d6eca53d5a32ed5

# Explicit non-root USER (Snyk IaC hardening). The base image already runs as
# 10001:10001 by default (confirmed empirically via `docker inspect` on this
# exact digest) — Snyk's Dockerfile scan doesn't resolve the parent image's
# own config layer, so it flags a false positive without this line. This is
# a no-op at runtime, not a behavior change.
USER 10001:10001

COPY config.yaml /etc/otelcol-contrib/config.yaml

# Build-time config validation (M17-S34 AC) — a YAML/pipeline typo fails the
# image build here instead of crash-looping the sidecar in staging. Exec
# form required: this base image has no shell (confirmed empirically,
# 2026-08-04 — /bin/sh does not exist), so shell-form RUN would fail
# regardless of the config's own validity.
RUN ["/otelcol-contrib", "validate", "--config", "/etc/otelcol-contrib/config.yaml"]
