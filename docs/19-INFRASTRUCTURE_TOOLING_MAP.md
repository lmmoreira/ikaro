# Infrastructure & Tooling Map - Ikaro

## Purpose

This document answers one question per tool: **where does it run, what does it cost, and how does it connect to the pipeline?** Implementation details (Terraform HCL, workflow YAML, observability config) live in the authoritative documents referenced at the end of each section — this doc does not duplicate them.

---

## 1. CI/CD & Quality Tools (SaaS — hosted by third parties)

These tools run on their providers' infrastructure. Ikaro does not manage any servers for them.

---

### 1.1 GitHub + GitHub Actions

| | |
|---|---|
| **Hosted by** | GitHub (Microsoft) |
| **Purpose** | Source control, pull requests, CI runners, CD workflows |
| **Pricing** | GitHub Free: 2 000 Actions minutes/month (Linux runners). GitHub Team: $4/user/month + 3 000 minutes/month. For a small team (1–3 devs), the Free plan covers normal PR volume; upgrade to Team if minutes run out. |
| **Secret required** | `GITHUB_TOKEN` — automatically injected by GitHub Actions into every workflow run. No manual setup. |

**Account setup:**
1. Create organisation at github.com (free).
2. Push the monorepo to `github.com/<org>/ikaro`.
3. Under repo → Settings → Environments, create the 11 environments listed in `docs/09-CI_CD_PIPELINE.md` (backend-staging, backend-production, etc.).
4. Add the secrets listed in the GitHub Secrets Catalog in `docs/09-CI_CD_PIPELINE.md` to each environment.

**Pipeline integration:** GitHub Actions is the CI/CD runner for all workflows. Full YAML is in `docs/09-CI_CD_PIPELINE.md`.

---

### 1.2 SonarCloud (SonarSource)

| | |
|---|---|
| **Hosted by** | SonarSource (sonarcloud.io) |
| **Purpose** | Static code analysis: bugs, code smells, security hotspots, differential coverage gate (≥ 80% on changed code) |
| **Pricing** | **Free for public repositories.** Private repos: up to 100 k lines of code → **$10/month**. Ikaro will stay well under 100 k LOC for the first year. Expected cost: **$10/month** once the repo is private. |
| **Secret required** | `SONAR_TOKEN` — repository-scoped GitHub Secret |

**Account setup (one-time, ~10 minutes):**
1. Go to [sonarcloud.io](https://sonarcloud.io) → "Log in with GitHub".
2. Grant access to the `<org>` GitHub organisation.
3. Click "+" → "Analyze new project" → select `ikaro` repo → set up manually.
4. Note the **Organisation key** (e.g. `my-org`) and **Project key** (e.g. `my-org_ikaro`).
5. Go to My Account (top-right avatar) → Security → Generate Token → name it `ikaro-ci` → copy the token.
6. In GitHub: repo → Settings → Secrets → Actions → New secret → name `SONAR_TOKEN`, paste the token.

**Repository configuration file** (commit to root of repo):

```properties
# sonar-project.properties
sonar.projectKey=<org>_ikaro
sonar.organization=<org>

sonar.sources=apps/backend/src,apps/bff/src,apps/web/src
sonar.tests=apps/backend/src,apps/bff/src,apps/web/src
sonar.test.inclusions=**/*.spec.ts,**/*.test.ts,**/*.e2e-spec.ts

# Feed Jest/Vitest LCOV reports so Sonar computes differential coverage
sonar.typescript.lcov.reportPaths=\
  apps/backend/coverage/lcov.info,\
  apps/bff/coverage/lcov.info,\
  apps/web/coverage/lcov.info

sonar.coverage.exclusions=\
  **/*.spec.ts,\
  **/*.module.ts,\
  **/main.ts,\
  **/tracing.ts,\
  **/migrations/**

sonar.cpd.exclusions=**/migrations/**
```

**Quality Gate configuration (set in SonarCloud UI):**
- New code coverage ≥ 80%
- New bugs = 0
- New vulnerabilities = 0
- New security hotspots reviewed = 100%
- New code smells (blocker/critical) = 0

**Pipeline integration (key step — full YAML in `docs/09-CI_CD_PIPELINE.md`):**
```yaml
- uses: SonarSource/sonarcloud-github-action@master
  with:
    projectBaseDir: apps/backend   # run once per app in its own job
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**What it gates:** Merge to `main` is blocked if the SonarCloud Quality Gate status is not GREEN on the PR diff.

---

### 1.3 Snyk

| | |
|---|---|
| **Hosted by** | Snyk Ltd (snyk.io) |
| **Purpose** | Software Composition Analysis (SCA) — scans `package.json` dependency trees for known CVEs. Blocks merge on HIGH or CRITICAL vulnerabilities. |
| **Pricing** | **Free tier: unlimited open-source tests** (the action runs `snyk test`, which counts as an open-source test). For private repos with the free plan: 200 tests/month, which covers normal PR + nightly usage. Team plan ($25/user/month) adds licence compliance and container scanning — not needed for MVP. Expected cost: **$0/month** on the free tier. |
| **Secret required** | `SNYK_TOKEN` — repository-scoped GitHub Secret |

**Account setup (one-time, ~5 minutes):**
1. Go to [snyk.io](https://snyk.io) → "Sign up with GitHub".
2. Grant access to the `<org>` organisation.
3. Go to Account Settings (avatar bottom-left) → General → Auth Token → copy the token.
4. In GitHub: repo → Settings → Secrets → Actions → New secret → name `SNYK_TOKEN`, paste the token.

**Pipeline integration (key step — full YAML in `docs/09-CI_CD_PIPELINE.md`):**
```yaml
- uses: snyk/actions/node@master
  with:
    args: --severity-threshold=high --file=apps/backend/package.json
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

Run once per `package.json` (backend, bff, web) in parallel jobs. `--severity-threshold=high` means LOW and MEDIUM vulnerabilities do not fail the build — only HIGH and CRITICAL do.

**What it gates:** Merge blocked if any HIGH or CRITICAL CVE is found in the dependency tree of any app.

---

### 1.4 Gitleaks

| | |
|---|---|
| **Hosted by** | Runs inside the GitHub Actions runner (GitHub's cloud). No external service. |
| **Purpose** | Scans the full git history for accidentally committed secrets (API keys, passwords, tokens). |
| **Pricing** | **Free** — open-source tool, runs on the GitHub Actions runner. No account needed. |
| **Secret required** | `GITHUB_TOKEN` — automatically available. No manual setup. |

**Account setup:** None. The action runs the Gitleaks binary inside the GitHub Actions runner.

**Pipeline integration (key step — full YAML in `docs/09-CI_CD_PIPELINE.md`):**
```yaml
- uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The action checks out the repo with full history (`fetch-depth: 0`) and scans every commit. A `.gitleaks.toml` config file can be added to the repo root to suppress false positives (e.g. test fixture files with dummy keys).

**What it gates:** Merge blocked if any secret pattern is detected anywhere in git history.

---

### 1.5 Checkov (Bridgecrew / Prisma Cloud)

| | |
|---|---|
| **Hosted by** | Runs inside the GitHub Actions runner. Optional SaaS dashboard at bridgecrew.io. |
| **Purpose** | IaC security scanner — checks `infrastructure/terraform/**` for misconfigurations (open ports, missing encryption, overly broad IAM roles). |
| **Pricing** | **Free** — open-source CLI, runs on the GitHub Actions runner. The optional Bridgecrew SaaS dashboard (for historical results) has a free tier. For MVP, the CLI-only approach (no dashboard) is sufficient. |
| **Secret required** | None for CLI-only mode. `BC_API_KEY` needed only if connecting to the Bridgecrew dashboard. |

**Account setup:** None required for CLI mode.

**Pipeline integration (key step — full YAML in `docs/09-CI_CD_PIPELINE.md`):**
```yaml
- uses: bridgecrewio/checkov-action@master
  with:
    directory: infrastructure/terraform
    soft_fail: false
    quiet: true
```

`soft_fail: false` means the job fails on any HIGH check. If a Checkov check must be suppressed (e.g. a known acceptable risk in the Terraform), add an inline comment to the `.tf` file:
```hcl
#checkov:skip=CKV_GCP_62:Bucket access logging not needed for Terraform state
```

**What it gates:** Merge blocked if any HIGH IaC misconfiguration is found in `infrastructure/terraform/**`.

---

### 1.6 Trivy (Aqua Security)

| | |
|---|---|
| **Hosted by** | Runs inside the GitHub Actions runner. |
| **Purpose** | Container image vulnerability scanner — scans the built Docker image for OS and library CVEs before it is pushed to the registry. |
| **Pricing** | **Free** — open-source tool. No account needed. |
| **Secret required** | None. Scans the locally-built image inside the runner. |

**Account setup:** None.

**Pipeline integration** (runs after `docker build`, before `docker push` — full YAML in `docs/09-CI_CD_PIPELINE.md`):
```yaml
- uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.IMAGE_REF }}
    format: sarif
    exit-code: 1
    severity: HIGH,CRITICAL
```

If a HIGH/CRITICAL CVE is found, the image is **not pushed** to Google Artifact Registry and the deploy workflow never starts. SARIF output is uploaded to GitHub Security tab for visibility.

**What it gates:** Image push and deployment blocked if any HIGH or CRITICAL CVE exists in the Docker image.

---

## 2. Application Infrastructure (GCP — fully managed services)

All resources are provisioned by Terraform. Full HCL, Day 0 bootstrap commands, IAM roles, and `.tfvars` for both environments are in `docs/23-INFRASTRUCTURE_SETUP.md`.

| GCP Service | What it hosts | Region |
|---|---|---|
| **Cloud Run** | `ikaro-web`, `ikaro-bff`, `ikaro-backend` containers | `us-central1` |
| **Cloud SQL PostgreSQL 15** | Single instance, 6 schemas (platform, customer, staff, booking, loyalty, notification); private IP only | `us-central1` |
| **Pub/Sub** | `ikaro-domain-events` topic; `ikaro-loyalty-consumer` + `ikaro-notification-consumer` subscriptions; `ikaro-dead-letter` topic | global |
| **Cloud Storage** | `ikaro-media-<env>` bucket for tenant photo uploads | `US` multi-region |
| **Secret Manager** | `database-url`, `jwt-secret`, `google-oauth-client-id`, `google-oauth-client-secret`, `email-api-key` | `us-central1` |
| **Artifact Registry** | `ikaro-images` Docker repository — single source of truth for all container images | `us-central1` |
| **VPC + Serverless Connector** | `ikaro-vpc` private network; connector bridges Cloud Run to Cloud SQL private IP | `us-central1` |
| **GCE e2-small VM** (prod only) | Self-hosted observability stack (Prometheus, Grafana, Loki, OTel Collector) via Docker Compose | `us-central1-a` |

**Cost reference:** See `docs/22-TECH_STACK_DECISIONS.md` — cost summary tables for MVP, growth, and scale phases.

---

## 3. Observability Stack (GCE VM, self-hosted, prod only)

Runs as Docker Compose on a single GCE e2-small VM (~$13/month) with a 50 GB persistent disk. Monitors both staging and production Cloud Run services from one place.

**Full configuration, dashboard inventory, metric catalog, alerting rules, and OTel NestJS setup:** `docs/10-OBSERVABILITY_STRATEGY.md`.

**Local development:** Run `pnpm obs:up` to start the same stack on your machine (Prometheus on :9090, Grafana on :3010, Loki on :3100). See `docs/23-INFRASTRUCTURE_SETUP.md`.

---

## 4. Local Development (Docker on developer machine)

All infrastructure dependencies run locally via Docker Compose — PostgreSQL, GCP Pub/Sub Emulator, GCS Emulator (fake-gcs-server), and MailHog (SMTP catch-all). No real GCP credentials needed for basic development.

**Full setup guide, port map, `pnpm` scripts, `.env.example`, and onboarding checklist:** `docs/23-INFRASTRUCTURE_SETUP.md`.

---

## 5. Security & Connectivity Summary

| Concern | Approach |
|---|---|
| **Secrets at rest** | GCP Secret Manager — injected into Cloud Run at startup via `--set-secrets`. Never in `.env` files in the repo or in Docker images. |
| **Secrets in CI** | GitHub Environment Secrets — scoped per environment (staging / production). Runtime secrets (JWT, OAuth, DB) are in Secret Manager, not GitHub Secrets. |
| **Traffic: browser → BFF** | Public HTTPS via Cloud Run's managed TLS. Custom domain via Cloud Run domain mapping (no Load Balancer required for MVP). |
| **Traffic: BFF → backend** | Internal Cloud Run URL (`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`). Backend is not reachable from the public internet. |
| **Traffic: Cloud Run → Cloud SQL** | Private IP inside `ikaro-vpc` via VPC Serverless Connector. Port 5432 never exposed publicly. |
| **Traffic: Cloud Run → Pub/Sub / Secret Manager** | Google's internal network via service account credentials. No public endpoint. |
| **Image security** | Trivy scans every image before push. Images tagged by Git SHA — mutable `:latest` tag is also pushed for convenience but deployments always reference the SHA tag. |
| **IaC security** | Checkov scans all Terraform on every PR targeting `main`. |
| **Secret leak prevention** | Gitleaks scans full git history on every PR. |
| **Dependency vulnerabilities** | Snyk SCA on every PR; blocks HIGH/CRITICAL. |
| **Code quality** | SonarCloud Quality Gate on every PR; blocks on new bugs, vulnerabilities, and coverage drop below 80% on changed code. |
