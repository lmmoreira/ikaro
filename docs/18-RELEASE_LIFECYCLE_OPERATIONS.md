# Release Lifecycle & Operations - BeloAuto

## Overview

This document provides a step-by-step operational guide for the entire lifecycle of a change in BeloAuto, from the first line of code on a local machine to the final deployment in Production.

---

## 1. Feature Lifecycle (The Standard Path)

### **Step 1: Local Development**
1. **Branch:** Create a short-lived branch `feat/UC-xxx-description`.
2. **Environment:** Run `docker-compose up` to have a local PostgreSQL and GCP Pub/Sub Emulator (plus Prometheus/Grafana for observability).
3. **TDD:** Write a failing test in the `domain` or `application` layer.
4. **Implement:** Write the minimal code to pass the test.
5. **Verify:** Run `npm run test` and `npm run lint` locally.

### **Step 2: The Pull Request (PR)**
1. **Push:** Push to GitHub.
2. **Open PR:** Targeted at `main`.
3. **CI Trigger:** GitHub Actions runs:
   - Linting & Type-checking.
   - All Unit & Integration tests (via Testcontainers).
   - Security scans (Snyk, Gitleaks).
   - SonarCloud Quality Gate.
4. **Review:** Peer review focusing on Architecture, Security, and UC compliance.

### **Step 3: Merge to Main & Staging**
1. **Merge:** Once approved and CI is green, merge (Squash & Merge) into `main`.
2. **CD Trigger (Staging):**
   - Build Docker images for Backend and Frontend.
   - Push to Private Registry.
   - Run Database Migrations in the Staging environment.
   - Perform a **Rolling Update** to the Staging container platform.
3. **Smoke Test:** Automated check of `/health/ready` and basic login flow.

### **Step 4: Promotion to Production**
1. **UAT:** (Optional) User Acceptance Testing in Staging.
2. **Promotion:** Triggered via a GitHub Action "Release to Production".
   - **No New Build:** The *exact same* Docker image from Staging is used.
   - **Production Migrations:** Run migrations against the Prod DB.
   - **Blue/Green or Rolling Update:** Deploy to the Production platform.
3. **Verification:** Monitor Grafana/Sentry for any spike in errors.

---

## 2. The Hotfix Path (Emergency)

When a critical bug is found in Production:

1. **Branch:** `fix/HOTFIX-description` from `main`.
2. **Fix:** Implement the fix + a regression test.
3. **Fast-Track PR:** PR requires "Emergency" label (prioritized review).
4. **CI Bypass:** (NEVER allowed) All tests must still pass.
5. **Immediate Deploy:** Once merged to `main`, it deploys to Staging, then is promoted to Production immediately after a quick smoke test.

---

## 3. Configuration & Secrets Management

- **Environment Variables:** All runtime config (DB URLs, API Keys) is stored in a **Secret Manager** (e.g., AWS Secrets Manager, GCP Secret Manager).
- **Injection:** Containers fetch secrets at startup. **NEVER** store secrets in `.env` files committed to the repo.
- **Local:** Use `.env.local` (ignored by git) for local development secrets.

---

## 4. Rollback Procedures

If a deployment causes a regression:

### **Automated Rollback**
The container platform (Cloud Run/Fargate) is configured to automatically rollback if health checks fail during the first 5 minutes of a rolling update.

### **Manual Rollback**
1. **GitHub Action:** "Rollback Production".
2. **Process:** 
   - Reverts the container image to the previous tag.
   - **Note on Migrations:** If the deployment included a breaking database migration, the rollback must be handled with extreme care (Expand/Contract pattern is preferred to avoid this).

---

## 5. Monitoring the Release

During and after deployment, the team monitors the "Release Dashboard" in Grafana:
- **Success Rate:** Should remain > 99%.
- **Latency (P99):** Should not increase by more than 10%.
- **Error Logs:** Check Sentry for new unique issues.

---

**Status:** Phase 2 - Technical Architecture  
**Validated:** Comprehensive lifecycle coverage.
