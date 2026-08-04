# otel-collector sidecar image (M17-S34). Digest-only pin (no tag) — this
# repo's SonarCloud rule docker:S8431 fails the build on a tag+digest form
# (CLAUDE.md's Dependabot Docker digest convention); Dependabot watches this
# directory (see .github/dependabot.yml) for base-image bumps.
#
# Pinned 2026-08-04 to otel/opentelemetry-collector-contrib:0.157.0 — the
# latest stable release as of this story (confirmed via Docker Hub's tags
# API, not the moving `:latest` tag).
FROM otel/opentelemetry-collector-contrib@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6

COPY config.yaml /etc/otelcol-contrib/config.yaml

# Build-time config validation (M17-S34 AC) — a YAML/pipeline typo fails the
# image build here instead of crash-looping the sidecar in staging. Exec
# form required: this base image has no shell (confirmed empirically,
# 2026-08-04 — /bin/sh does not exist), so shell-form RUN would fail
# regardless of the config's own validity.
RUN ["/otelcol-contrib", "validate", "--config", "/etc/otelcol-contrib/config.yaml"]
