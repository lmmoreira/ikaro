# CI/CD Pipeline

This document describes the workflow topology that exists in the repository. Workflow YAML under `.github/workflows/` is authoritative for triggers, permissions, and job implementation; this guide explains how those workflows fit together.

## Pull-request validation

Two workflows provide the main PR gates:

- `.github/workflows/pr-quality.yml` — formatting, linting, architecture/policy checks, dependency and security analysis, and other static quality gates.
- `.github/workflows/pr-tests.yml` — package builds and the applicable unit, component, integration, and E2E suites.

Additional path-scoped validation:

- `.github/workflows/build-otel-collector.yml` builds, validates, and scans the custom collector image when its Docker/configuration surface changes.
- `.github/workflows/infra-deploy.yml` and `.github/workflows/foundation-deploy.yml` own Terraform planning/deployment concerns for their separate roots.

The exact job list can evolve; do not duplicate it in milestone plans. Read the workflow being changed and follow `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`.

## Local pre-push validation

`git push` runs the repository's `ci:fast` hook. Do not bypass it with `--no-verify`. For the project-specific PR preparation and review sequence, use the procedures in `.copilot/context.md` §9 and `scripts/pre-pr.sh`.

## Staging deployment

`.github/workflows/deploy-staging.yml` is the application staging pipeline. Its implemented sequence is:

1. build immutable application images;
2. scan the images;
3. push them to Artifact Registry;
4. execute the migration Cloud Run job and wait for success;
5. deploy the application services;
6. run smoke/health verification.

Migration failure blocks deployment. Applications never run schema synchronization at startup.

## Production promotion and rollback

- `.github/workflows/deploy-production.yml` promotes reviewed artifacts to production through the protected production workflow.
- `.github/workflows/rollback-production.yml` performs the explicit production traffic rollback procedure.

Production is a promotion of known artifacts, not an independent rebuild. After a manual Cloud Run diagnostic deployment, verify that traffic points to the latest revision; see `infra/terraform/README.md` § Gotchas.

## Foundation and environment infrastructure

Foundation and environment Terraform use separate roots and states:

- `.github/workflows/foundation-deploy.yml` — project-level/shared prerequisites.
- `.github/workflows/infra-deploy.yml` — environment infrastructure.

They do not exchange Terraform outputs automatically. Apply ordering and manually bridged values are documented in `infra/terraform/README.md`, which is authoritative for infrastructure deployment mechanics.

## Scheduled maintenance

`.github/workflows/weekly-jobs.yml` contains repository maintenance that is intentionally time-based rather than part of every PR.

## SonarCloud and coverage

SonarCloud enforces the quality gate, including at least 80% coverage on changed code. Local aggregate coverage percentages are useful diagnostics but do not replace the differential gate. Test strategy and suite ownership live in `docs/08-TESTING_STRATEGY.md`.

## Security model

- Prefer GitHub OIDC/workload identity over long-lived cloud service-account keys.
- Keep workflow `permissions:` minimal per job.
- Pin third-party actions according to `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`.
- Image and dependency findings must be fixed at their maintained source rather than hidden through workflow exclusions.
- Terraform security scanning must target the real roots under `infra/terraform/`.

## Canonical references

- Workflow implementation: `.github/workflows/*.yml`
- Workflow authoring rules: `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`
- Testing: `docs/08-TESTING_STRATEGY.md`
- Release operations: `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md`
- Terraform deployment and gotchas: `infra/terraform/README.md`
- CI failure patterns: `docs/CI_TRAPS.md`
