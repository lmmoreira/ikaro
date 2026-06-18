# M01 — CI Quality Gates

**Phase:** Local Development (GitHub Actions — free tier, no cloud deploys)  
**Goal:** Every pull request is automatically validated before merge. No human reviewer needs to catch lint errors, type errors, failing tests, or leaked secrets — the pipeline does it.  
**Depends on:** M00  
**Blocks:** M15 (deploy pipelines build on top of these gates)

---

## Stories

---

### M01-S01 — PR lint, format, and type-check workflow ✅ Done

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § PR gates, `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`

**Description:**  
Create the GitHub Actions workflow that runs on every pull request targeting `main`. It must enforce ESLint (zero warnings), Prettier formatting check, and TypeScript `tsc --noEmit` across all workspaces. A single failure blocks the merge.

**What to create:**
- `.github/workflows/pr-quality.yml` — triggers on `pull_request` targeting `main`
- Jobs (run in parallel where possible):
  - `lint` — `pnpm lint` (ESLint zero warnings across all apps)
  - `format` — `pnpm prettier --check .` (formatting check, not auto-fix)
  - `type-check` — `pnpm type-check` (`tsc --noEmit` all workspaces)
- Use `actions/setup-node@v4` with Node 20 and pnpm 9 cache

**Acceptance criteria:**
- [ ] Workflow triggers on PR open, push to PR branch, and PR reopen
- [ ] A PR with an ESLint error fails the `lint` job and blocks merge
- [ ] A PR with an unformatted file fails the `format` job and blocks merge
- [ ] A PR with a TypeScript error fails the `type-check` job and blocks merge
- [ ] pnpm cache is enabled (`cache: 'pnpm'`) — second run is significantly faster
- [ ] Workflow name appears as a required status check in GitHub branch protection

**Dependencies:** M00-S02

---

### M01-S02 — Unit and integration test workflow ✅ Done

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § test stages, `docs/08-TESTING_STRATEGY.md` § tools

**Description:**  
Create the GitHub Actions workflow that runs all Jest tests (unit + integration) on every PR. Integration tests use Testcontainers which spin up a real PostgreSQL and Pub/Sub emulator inside the CI runner — no mocks for persistence or messaging.

**What to create:**
- `.github/workflows/pr-tests.yml` — triggers on `pull_request` targeting `main`
- Jobs:
  - `unit-tests` — `pnpm test --selectProjects unit` (fast, no containers)
  - `integration-tests` — `pnpm test --selectProjects integration` (uses Testcontainers; needs Docker socket)
- `services:` block not needed — Testcontainers manages its own containers
- Upload coverage report as artifact
- Fail if any test fails (no `--passWithNoTests` flag)

**Acceptance criteria:**
- [ ] Unit tests run without Docker access
- [ ] Integration tests start real PostgreSQL 15 and Pub/Sub emulator containers via Testcontainers
- [ ] A failing test blocks the PR merge
- [ ] Coverage report is uploaded as a GitHub Actions artifact
- [ ] `--passWithNoTests` is NOT used — empty test suite fails the job
- [ ] Workflow completes in under 5 minutes for the initial empty scaffold

**Dependencies:** M00-S03, M00-S04

---

### M01-S03 — Gitleaks secret scanning ✅ Done

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § security gates

**Description:**  
Add Gitleaks to the PR pipeline to scan the full git history and staged changes for leaked secrets (API keys, passwords, tokens). Any detected secret blocks the merge with a clear error pointing to the offending commit and file.

**What to create:**
- `.github/workflows/pr-security.yml` — add `gitleaks` job (or add to existing security workflow)
- Use `gitleaks/gitleaks-action@v2` — scans git history on every PR
- Add `.gitleaks.toml` at repo root — configure any project-specific allowlist patterns (e.g., test fixture UUIDs)

**Acceptance criteria:**
- [ ] Gitleaks runs on every PR
- [ ] A commit with a hardcoded `password = "secret123"` fails the job
- [ ] A legitimate test fixture with a placeholder like `"test-jwt-secret"` can be allowlisted in `.gitleaks.toml` without suppressing real detections
- [ ] Job failure message shows the file path and line number of the detected secret

**Dependencies:** M00-S01

---

### M01-S04 — Snyk SCA vulnerability scanning ✅ Done

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § security gates, `docs/19-INFRASTRUCTURE_TOOLING_MAP.md` § Snyk

**Description:**  
Add Snyk software composition analysis (SCA) to the PR pipeline. Snyk scans `package.json` and `pnpm-lock.yaml` for known CVEs in dependencies. Any HIGH or CRITICAL vulnerability blocks the merge. `SNYK_TOKEN` must be stored as a GitHub Actions secret.

**What to create:**
- Job `snyk-sca` in `.github/workflows/pr-security.yml`
- Uses `snyk/actions/node@master`
- Runs `snyk test --severity-threshold=high --all-projects`
- `SNYK_TOKEN` read from `secrets.SNYK_TOKEN`

**Acceptance criteria:**
- [ ] Snyk runs against all workspaces (`--all-projects`)
- [ ] Severity threshold is `high` — HIGH and CRITICAL CVEs block merge
- [ ] LOW and MEDIUM vulnerabilities produce a warning but do not block merge
- [ ] `SNYK_TOKEN` is read from GitHub Secrets (never hardcoded)
- [ ] Job produces a Snyk report URL in the workflow summary

**Dependencies:** M00-S01

---

### M01-S05 — SonarCloud code quality and differential coverage gate ✅ Done

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § SonarCloud, `docs/07-ENGINEERING_PRINCIPLES.md` § coverage gate

**Description:**  
Integrate SonarCloud to enforce the differential coverage gate (≥80% on changed code, not global). SonarCloud also catches new bugs, code smells, and security hotspots. The Quality Gate must be GREEN for a PR to merge. `SONAR_TOKEN` and `SONAR_ORGANIZATION` must be stored as GitHub Secrets.

**What to create:**
- Job `sonarcloud` in `.github/workflows/pr-quality.yml`
- Uses `SonarSource/sonarcloud-github-action@master`
- `sonar-project.properties` at repo root:
  - `sonar.projectKey=<org>_ikaro`
  - `sonar.coverage.exclusions=**/*.spec.ts,**/*.e2e.ts,**/migrations/**`
  - `sonar.javascript.lcov.reportPaths=coverage/lcov.info`
  - `sonar.newCode.referenceBranch=main` (differential coverage on changed code)
- Coverage report from M01-S02 must be generated with `--coverage --coverageReporters=lcov` and passed to SonarCloud

**Acceptance criteria:**
- [ ] SonarCloud Quality Gate result appears as a PR check
- [ ] A PR that drops coverage on changed code below 80% sets Quality Gate to RED and blocks merge
- [ ] New bugs or vulnerabilities detected by SonarCloud set Quality Gate to RED
- [ ] Coverage report path is correctly configured and SonarCloud reads it
- [ ] Migration files are excluded from coverage analysis
- [ ] `SONAR_TOKEN` is read from GitHub Secrets

**Dependencies:** M01-S02

---

### M01-S06 — Docker build and Trivy image scan ✅ Done

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § image build + scan, `docs/12-DEPLOYMENT_STRATEGY.md` § immutable artifacts

**Description:**  
Create Dockerfiles for all three apps and add a CI job that builds the Docker images and scans them with Trivy for OS and application CVEs. At this stage the images are built but NOT pushed anywhere — the push to Google Artifact Registry happens in M16. HIGH and CRITICAL CVEs in the image block the PR.

**What to create:**
- `apps/backend/Dockerfile` — multi-stage: `builder` (pnpm install + build) → `runner` (Node 20 alpine, non-root user)
- `apps/bff/Dockerfile` — same multi-stage pattern
- `apps/web/Dockerfile` — multi-stage Next.js production build
- `.dockerignore` — excludes `node_modules`, `.env*`, `coverage`, `.git`
- Job `trivy-scan` in `.github/workflows/pr-security.yml`:
  - Builds image locally (`docker build`)
  - Runs `aquasecurity/trivy-action` against built image
  - Severity: `HIGH,CRITICAL` — fails job if found

**Acceptance criteria:**
- [ ] All three Dockerfiles build successfully with `docker build` from repo root
- [ ] Built images run the correct service (health endpoint responds in a container)
- [ ] Trivy scan runs against each built image
- [ ] HIGH or CRITICAL CVE in the image fails the `trivy-scan` job
- [ ] Docker images are NOT pushed anywhere in this workflow (push is M16)
- [ ] Images run as non-root user (`USER node` or equivalent)

**Dependencies:** M00-S03, M00-S04, M00-S05

---

### M01-S07 — Checkov IaC security scan ✅ Done

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § IaC scan, `docs/19-INFRASTRUCTURE_TOOLING_MAP.md` § Checkov

**Description:**  
Add Checkov to the PR pipeline to scan Terraform files for security misconfigurations. This job only runs when files under `infrastructure/terraform/` change. Any HIGH severity finding blocks the merge. The `infrastructure/terraform/` directory will be created in M15 — this story creates the workflow job that will activate once Terraform files exist.

**What to create:**
- Job `checkov` in `.github/workflows/pr-security.yml`
- Uses `bridgecrewio/checkov-action@master`
- `directory: infrastructure/terraform`
- `soft_fail: false` (block on HIGH)
- Job has `paths` filter: only runs if `infrastructure/terraform/**` files changed

**Acceptance criteria:**
- [ ] Checkov job runs ONLY when Terraform files are modified (path filter active)
- [ ] A Terraform file with `encryption = false` on a storage bucket fails the job
- [ ] Job is skipped (not failed) when no Terraform files changed in the PR
- [ ] Results are output in SARIF format and uploaded to GitHub Security tab

**Dependencies:** M00-S01
