# GitHub Workflows & Collaboration Guidelines - Ikaro

## Overview

Ikaro follows **Trunk-Based Development (TBD)** to ensure high velocity and professional code quality. This document defines the rules for branching, commits, and Pull Requests.

---

## 1. Branching Strategy

We use a single long-lived branch: `main`. (The repo's default branch is `main`; "main" is not used.)

### **Feature Branches**
- **Life Span:** Maximum 24-48 hours.
- **Naming Convention:** `feat/UC-xxx-short-description` or `fix/issue-xxx`.
- **Scope:** One branch = One small, verifiable change (e.g., a single Use Case step).

### **Trunk-Based Development Rules**
1. **Pull Frequently:** Always rebase your branch against `main` before pushing.
2. **Small Batches:** If a feature is large, use **Feature Flags** to merge partial code into `main` without breaking production.
3. **Delete Branches:** After merging, delete the feature branch immediately.

---

## 2. Commit Conventions

We follow **Conventional Commits** to ensure a readable and automated changelog.

**Format:** `<type>(<scope>): <description>`

### **Types:**
- `feat`: A new feature (e.g., `feat(booking): implement guest request UC-001`).
- `fix`: A bug fix.
- `docs`: Documentation only changes.
- `style`: Changes that do not affect the meaning of the code (white-space, formatting).
- `refactor`: A code change that neither fixes a bug nor adds a feature.
- `test`: Adding missing tests or correcting existing tests.
- `chore`: Changes to the build process or auxiliary tools.

---

## 3. Pull Request (PR) Standards

A PR is a request to merge code into `main`. It must meet the following criteria:

### **The PR Template**
Every PR must include:
- **Description:** What was changed and WHY.
- **Related Use Cases:** Link to the specific UC-xxx from `docs/04-USE_CASES.md`.
- **Verification:** Proof that the code works (e.g., screenshots of tests passing, logs).
- **Checklist:**
  - [ ] Lint & Type-check passed.
  - [ ] Unit tests added/updated.
  - [ ] Integration tests added/updated (for adapters).
  - [ ] Tenant isolation verified.

### **The "Zero Failure" Rule**
A PR cannot be merged if any check in the CI pipeline fails. This includes:
- **SonarCloud:** No new "Code Smells" or "Security Hotspots".
- **Snyk:** No new vulnerabilities in dependencies.
- **Test Coverage:** Must stay above 80% for the changed modules.

---

## 4. Code Review Guidelines

- **Focus on the Domain:** Does the code correctly implement the business logic defined in `02-DOMAIN_MODEL.md`?
- **Security First:** Is there any potential for tenant data leaks?
- **Architecture:** Does the code respect the Hexagonal layers (Domain → Application → Adapter)?
- **Aesthetics:** Is the code idiomatic, clean, and well-named?

---

## 5. Automated Gates (CI Pipeline)

Every push to a branch triggers:
1. **Linting:** Prettier & ESLint check.
2. **Static Analysis:** `tsc` (TypeScript) verification.
3. **Tests:** Execution of the full Test Pyramid (Unit → Integration).
4. **Security:** Snyk scan for vulnerabilities and Gitleaks scan for secrets.
5. **Quality Gate:** SonarCloud analysis must be "GREEN".

---

## 6. Release Management

- **Continuous Deployment:** Merges to `main` are automatically deployed to **Staging**.
- **Production Promotion:** Staging is promoted to **Production** after a final automated smoke test and (optional) manual sign-off.

---

## 7. CI Implementation Conventions

### Action version pinning (supply-chain security)

All GitHub Actions — including GitHub-owned ones (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact`) — must be pinned to an **immutable full commit SHA**, never a floating tag (`@v4`, `@main`). Established for third-party actions in AUD-009; extended to all actions in AUD-024.

```yaml
# ❌ Wrong — tag is mutable
- uses: actions/checkout@v4

# ✅ Correct — immutable SHA with tag comment for readability
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
```

**Current SHAs** (update the table when bumping action versions):

| Action | SHA | Tag |
|--------|-----|-----|
| `actions/checkout` | `34e114876b0b11c390a56381ad16ebd13914f8d5` | v4 |
| `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4 |
| `actions/download-artifact` | `d3f86a106a0bac45b974a628896c90dbdf5c8093` | v4 |
| `pnpm/action-setup` | `a3252b78c470c02df07e9d59298aecedc3ccdd6d` | v3.0.0 |
| `SonarSource/sonarqube-scan-action` | `59db25f34e16620e48ab4bb9e4a5dce155cb5432` | v8.0.0 |
| `aquasecurity/trivy-action` | `ed142fd0673e97e23eac54620cfb913e5ce36c25` | v0.36.0 |

To look up the SHA for any action: `gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq '.object.sha'`

---

### Node / pnpm version — single source of truth

| Where | What it pins |
|-------|-------------|
| `.nvmrc` | Node version (`22`) — read by nvm, asdf, Volta locally |
| `package.json` `"packageManager"` field | pnpm version (`pnpm@11.1.1`) — enforced by Corepack locally |
| `pnpm/action-setup` `version:` | pnpm version in CI (must match `packageManager`) |

All CI workflows use `node-version-file: '.nvmrc'` — never `node-version: '22'`. A Node version bump touches `.nvmrc` only; the workflows pick it up automatically.

---

### Docker image builds — Buildx + GHA layer cache

All `docker build` calls in CI use Docker Buildx with GitHub Actions cache to avoid rebuilding from scratch on every run:

```yaml
- name: Set up Docker Buildx
  run: docker buildx create --use --driver docker-container

- name: Build image
  run: |
    docker buildx build \
      --cache-from type=gha,scope=<service-name> \
      --cache-to type=gha,scope=<service-name>,mode=max \
      --load \
      -f apps/<service>/Dockerfile \
      -t ikaro-<service>:tag \
      .
```

The `scope` parameter is **mandatory** in matrix jobs. Without it, the three Trivy matrix runners (backend/bff/web) compete for the same cache key and evict each other every run.

`--load` exports the built image back to the local Docker daemon so subsequent steps (Trivy scan, env-leak check, boot smoke test) can use it.

---

### SonarCloud coverage — generate once, reuse via artifacts

Coverage must be generated **once** per PR, not re-run by the Sonar job:

1. Test jobs (`backend-unit`, `bff-unit`, `web-unit`) run `test:cov` and upload `lcov.info` via `actions/upload-artifact`
2. The `sonar` job declares `needs: [backend-unit, bff-unit, web-unit]` and downloads those artifacts via `actions/download-artifact`
3. The `sonar` job only runs `test:cov` for packages not covered by those sibling jobs (`@ikaro/observability`, `@ikaro/env-validation`)

Never add a Sonar job that re-runs all `test:cov` suites from scratch — see `docs/CI_TRAPS.md § CI workflow configuration traps`.

The quality gate is enforced by `sonar.qualitygate.wait=true` in `sonar-project.properties` — the scanner waits for the gate result and exits non-zero on ERROR, failing the CI job. The `main-sonar.yml` workflow **must** override this with `-Dsonar.qualitygate.wait=false` because branch-mode scans return `NONE` (not ERROR/OK), which `wait=true` incorrectly treats as a failure.

---

### Trivy vulnerability scanning — two-tier strategy

| Scan | File | Trigger | `ignore-unfixed` | `exit-code` | Purpose |
|------|------|---------|-----------------|-------------|---------|
| PR gate | `pr-security.yml` | Every PR | `true` | `1` | Block merge on fixable CVEs only |
| Weekly report | `security-weekly.yml` | Monday 08:00 UTC | `false` | `0` | Surface unfixed CVEs in GitHub Security tab (SARIF) |

Never remove `ignore-unfixed: true` from the PR scan — authors cannot patch CVEs with no upstream fix, so any unfixed CVE would permanently block all PRs.

The weekly scan uploads findings via `github/codeql-action/upload-sarif` to the **GitHub Security tab**, not as a blocking check. The `security-events: write` permission required for this upload must be scoped to the **job level**, not the workflow level (least privilege).

---

### Manual/throwaway workflow triggers — `workflow_dispatch` only works from the default branch

`workflow_dispatch` can only be dispatched (via UI, API, or `gh workflow run`) once the workflow file exists on the repository's **default branch** (`main`). A workflow file that only exists on a feature branch cannot be manually triggered yet, even though GitHub still runs it via other event triggers on that branch.

For a throwaway/smoke-test workflow that needs to run and be verified **before** merging (e.g. testing new GitHub Environments, secrets, or WIF bindings on a feature branch), trigger on `push` scoped to that exact branch instead:

```yaml
on:
  push:
    branches: [feat/my-throwaway-test-branch]
  workflow_dispatch: # free re-runs later, if the branch ever merges
```

Established in M17-S08's WIF smoke-test workflow (`pull_request` + `push: branches: ['**']`) and confirmed again in M17-S23 (`push: branches: [<branch>]`) — both needed to verify GitHub-side configuration from a branch before it was safe or appropriate to merge to `main`.

### Repository Secrets vs. Variables — GCP/WIF identifiers default to Secrets

For GCP identifiers used in CI (WIF provider resource paths, service-account emails, project IDs/numbers, region/registry host strings), the project's convention is:

- **Secrets:** WIF provider resource names (`WIF_PROVIDER_*`) and CI service-account emails (`TF_DEPLOYER_SA_*`, `APP_DEPLOYER_SA_*`, `TF_PLANNER_SA_*`). None of these are bearer credentials by themselves — WIF trust is scoped to `repository == lmmoreira/ikaro` plus branch/environment claims regardless of who can read the value — but Secrets auto-redact in every log line, which is free hygiene against a future workflow accidentally echoing one during debugging. Matches Google's own `google-github-actions/auth@v2` reference examples, and this repo's own M17-S08 smoke test (which used temporary repo secrets for the same values, citing public-repo log redaction).
- **Variables:** everything else non-identity-shaped — project IDs (`GCP_PROJECT_*`), region (`GCP_REGION`), registry host (`GAR_HOST`). These are already committed in plaintext elsewhere in this repo (`terraform.tfvars`, `plan/M17-CLOUD-DEPLOY.md`), so there's no hygiene benefit to hiding them, and being readable in logs helps debugging.
- **Scope: repo-level, not environment-scoped**, for any value a PR-triggered `terraform plan`/`tf-planner` job needs — that job intentionally declares no `environment:` (so plans can run on every PR without an approval gate), and an environment-scoped secret/variable is invisible to a job that doesn't declare that environment. Established in M17-S23.

---

**Status:** Phase 2 - Technical Architecture  
**Validated:** Aligned with CI/CD and Testing Strategies.
