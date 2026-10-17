# Release Lifecycle & Operations - Ikaro

## Overview

This document provides a step-by-step operational guide for the entire lifecycle of a change in Ikaro, from the first line of code on a local machine to the final deployment in Production.

---

## 1. Feature Lifecycle (The Standard Path)

### **Step 1: Local Development**
1. **Branch:** Create a short-lived branch `feat/M0X-SYY-<short-description>` (see CLAUDE.md §1).
2. **Environment:** Run `pnpm infra:up` (`docker/docker-compose.yml`) for a local PostgreSQL, GCP Pub/Sub Emulator, GCS emulator, and Mailhog. No Prometheus/Grafana/Loki stack exists locally or otherwise (`package.json`'s `obs:up` script was removed 2026-08-04 — it pointed at a compose file that never existed). To see real traces locally, see `docs/10-OBSERVABILITY_STRATEGY.md` § Local development.
3. **TDD:** Write a failing test in the `domain` or `application` layer.
4. **Implement:** Write the minimal code to pass the test.
5. **Verify:** Run `pnpm ci:fast` locally (lint, type-check, architecture-check and unit tests; the pre-push hook runs it too).

### **Step 2: The Pull Request (PR)**
1. **Push:** Push to GitHub.
2. **Open PR:** Targeted at `main`.
3. **CI Trigger:** GitHub Actions runs:
   - Linting & Type-checking.
   - All Unit & Integration tests (via Testcontainers).
   - Security scans (Gitleaks; Snyk SCA runs weekly instead, not per-PR — see `docs/CI_TRAPS.md`).
   - SonarCloud Quality Gate.
4. **Review:** Peer review focusing on Architecture, Security, and UC compliance.

### **Step 3: Merge to Main & Staging**
1. **Merge:** Once approved and CI is green, merge (Squash & Merge) into `main`.
2. **CD Trigger (Staging):**
   - Build Docker images for the backend, BFF and web.
   - Push to Artifact Registry.
   - Run Database Migrations in the Staging environment.
   - Deploy a new **Cloud Run revision** to Staging (`deploy-staging.yml`).
3. **Smoke Test:** Automated check of the health routes only — `/v1/health/ready` on the BFF (Staging reaches it through the web app's `/v1` gateway; Production calls the BFF host directly) and `/api/health/ready` on the web app. There is no login-flow check.

### **Step 4: Promotion to Production**
1. **UAT:** (Optional) User Acceptance Testing in Staging.
2. **Promotion:** Triggered manually via the GitHub Action **"App — Production Promote Pipeline"** (`deploy-production.yml`, `workflow_dispatch`). Input `image_sha` is optional — blank promotes whatever SHA Staging currently runs; `smoke_tenant_slug` optionally adds a real-tenant public read to the smoke test. The only gated job (`environment: production`, required reviewer) is `migrate-and-deploy`; `validate-and-summarize` runs before it and `smoke` after.
   - **No New Build:** The *exact same* Docker image from Staging is used.
   - **Production Migrations:** Run migrations against the Prod DB.
   - **Cloud Run revisions:** the deploy creates a new revision and points `latestRevision` traffic at it; the previous revisions stay available for rollback (the 5 most recent per service are retained).
3. **Verification:** No Grafana/Loki stack is deployed (see `docs/10-OBSERVABILITY_STRATEGY.md`'s file-level banner) — check Cloud Trace for latency/error spans and Cloud Logging for `ERROR`-level entries instead. Dashboards/alerts-as-code (M17-S35) is implemented (`infra/terraform/modules/monitoring`) — see `docs/10-OBSERVABILITY_STRATEGY.md`'s Dashboards/Alerting Rules sections. The dashboard, uptime checks and alert policies, including the three `error_rate_5xx` policies (their MQL type bug is fixed and was live-verified in staging on 2026-08-09), are live in staging.

---

## 2. The Hotfix Path (Emergency)

When a critical bug is found in Production:

1. **Branch:** `fix/<short-description>` from `main`.
2. **Fix:** Implement the fix + a regression test.
3. **Fast-Track PR:** ask for prioritized review in the PR description. (No workflow, PR template or label gate enforces an "Emergency" label — it is a convention only.)
4. **CI Bypass:** (NEVER allowed) All tests must still pass.
5. **Deploy:** Once merged to `main` (when `apps/**` or `packages/**` changed), it deploys to Staging automatically. Production is a separate manual promotion (`deploy-production.yml`, required-reviewer approval); its smoke job runs after the deploy.

---

## 3. Configuration & Secrets Management

- **Environment Variables:** All runtime config (DB URLs, API Keys) is stored in **GCP Secret Manager** (`infra/terraform/modules/secrets`).
- **Injection:** Containers fetch secrets at startup. **NEVER** store secrets in `.env` files committed to the repo.
- **Local:** Use `.env.local` (ignored by git) for local development secrets.

---

## 4. Rollback Procedures

If a deployment causes a regression:

### **Automated Rollback**
There is no timed auto-rollback. A new Cloud Run revision that fails its startup probe (about 180 s: 18 failures × 10 s) never becomes ready, so it does not receive traffic and the previous revision keeps serving. A revision that is already serving and degrades later is **not** rolled back automatically — use the manual rollback below.

### **Manual Rollback**
1. **GitHub Action:** **"App — Production Emergency Rollback"** (`rollback-production.yml`, `workflow_dispatch`). Inputs: `service` (`backend`, `bff`, `web` or all three) and `revision` (optional — blank sends traffic back to each service's previous revision; or name an exact Cloud Run revision). Gated by the `production` environment approval.
2. **Process:** 
   - An instant Cloud Run **traffic shift** to the chosen earlier revision — no rebuild and no image change. It is per service, not a guaranteed cross-service consistent state; see the workflow's header comment and `docs/RUNBOOKS.md`.
   - **Note on Migrations:** If the deployment included a breaking database migration, the rollback must be handled with extreme care (Expand/Contract pattern is preferred to avoid this).

---

## 5. Monitoring the Release

> No "Release Dashboard"/Grafana/Loki exists. Dashboards, alerts and uptime checks are code (`infra/terraform/modules/monitoring`) — see `docs/10-OBSERVABILITY_STRATEGY.md` § Dashboards, alerts and uptime checks. The dashboard, uptime checks and alert policies, including the three `error_rate_5xx` policies (their MQL type bug is fixed and was live-verified in staging on 2026-08-09), are live in staging.

During and after deployment, the team monitors:
- **Success Rate / Latency (P99):** the Engineering dashboard and the 5xx-rate and p99 alerts in Cloud Monitoring (Cloud Trace is sampled, 10% in production, so use it to drill into a slow request, not to measure rates) — should remain > 99% success, P99 not increasing by more than 10%.
- **Error Logs:** Cloud Logging for new `ERROR`-level entries; correlate via `correlationId` (also promoted to `logging.googleapis.com/trace`/`spanId` for trace↔log linking).
