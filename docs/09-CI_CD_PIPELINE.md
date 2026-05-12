# CI/CD Pipeline & Trunk-Based Development - BeloAuto

## Overview

BeloAuto adopts **Trunk-Based Development (TBD)** and a high-frequency delivery model. The goal is to merge small, verified changes into the `main` branch multiple times a day and deploy them automatically to production (CD).

---

## Trunk-Based Development (TBD)

### **Core Rules**
1. **Short-lived branches:** Feature branches (e.g., `feat/UC-001-booking`) should last no more than 1-2 days.
2. **Always via PR:** Every change — even a single-line fix — goes through a short-lived PR that runs the full CI gate. No direct pushes to `main`.
3. **Always releasable:** The `main` branch must always be in a deployable state.
4. **Feature Flags:** Use feature flags to merge code that is not yet ready for public use (e.g., future Loyalty rewards).

### **Branching Strategy**
- `main`: The single source of truth.
- `feat/UC-xxx`: Short-lived feature branch.
- `fix/issue-xxx`: Short-lived bug fix branch.

---

## The Pipeline Flow

Every Pull Request and merge to `main` triggers the automated pipeline:

### **Stage 1: Static Analysis & Security (Pre-Commit/Pre-Merge)**
- **Linting:** Strict ESLint/Prettier rules.
- **Type-Check:** Mandatory `tsc` pass.
- **SonarCloud/SonarQube Scan:** 
  - Deep code quality analysis.
  - Security hotspots identification.
  - Technical debt tracking.
  - **Quality Gate:** Pipeline fails if Sonar "Quality Gate" is RED.
- **Security Scanning (Snyk/Trivy):**
  - **SCA (Software Composition Analysis):** Check for vulnerable npm packages.
  - **Secret Detection:** Scan for accidental API keys/secrets (Gitleaks).
  - **IaC Scan:** Validate Terraform files for security misconfigurations.

### **Stage 2: Verification (Dynamic Testing)**
- **Unit Tests:** High-speed logic verification.
- **Integration Tests (The "Robust" Layer):** 
  - Using **Testcontainers** to spin up real PostgreSQL and GCP Pub/Sub Emulator instances *inside* the CI runner.
  - Verifying tenant isolation and database migrations.
- **API Contract Testing:** Ensuring no breaking changes for the frontend.

### **Stage 3: Containerization & Security**
- **Build:** Optimized multi-stage Docker builds for both `beloauto-backend` and `beloauto-frontend`.
- **Image Scanning:** Scan the final Docker images for OS-level vulnerabilities (Trivy/Prisma).
- **Registry:** Push only scanned and approved images to the Private Artifact Registry.

### **Stage 4: Infrastructure (IaC)**
- **Plan:** Run `terraform plan` to see infra changes.
- **Apply (Auto for Staging):** Apply changes to the Staging environment.

### **Stage 4.5: Database Migrations**
- **Separate Job:** A dedicated `migration` job runs **after** IaC and **before** application deployment.
- **Tool:** TypeORM CLI (`migration:run`) executed against the target environment's database.
- **Rule:** The application **never** auto-migrates at startup (`synchronize: false` always). Migrations are explicit, reviewed, and version-controlled in `apps/backend/src/migrations/`.
- **Backward Compatibility:** Every migration must follow the **Expand/Contract** pattern — safe for rolling deploys where old and new app versions coexist briefly.
- **Rollback:** Migrations must provide a `down()` method. Emergency rollback is a manual step (see `18-RELEASE_LIFECYCLE_OPERATIONS.md`).

### **Stage 5: Deployment (CD)**
- **Deploy to Staging:** Automated deployment of containers.
- **Smoke Tests:** Verify basic connectivity and health checks.
- **Manual/Auto Approval for Production:**
  - Standard: Continuous Deployment (CD) to Production after Stage 5 succeeds.
  - Critical: Manual "Big Green Button" for production releases.

---

## Quality Gates & Promotion

| Gate | Requirement | Tool | Action on Failure |
|------|-------------|------|-------------------|
| **Static Analysis** | "A" Rating / 0 Bugs | **SonarCloud** | **BLOCK MERGE** |
| **Security (Code)** | 0 Vulnerabilities | **Snyk/Sonar** | **BLOCK MERGE** |
| **Security (Deps)** | 0 High/Critical | **Snyk/npm** | **BLOCK MERGE** |
| **Security (Secret)**| 0 Secrets found | **Gitleaks** | **BLOCK MERGE** |
| **Tests (Unit)** | 100% Pass | **Jest** | **BLOCK MERGE** |
| **Tests (Integ.)** | 100% Pass | **Testcontainers**| **BLOCK MERGE** |
| **Coverage** | ≥80% on changed code | **Sonar/Jest** | **BLOCK MERGE** |
| **Infra (IaC)** | 0 Security Flaws | **Checkov/Tfsec** | **BLOCK MERGE** |

---

## Observability in Pipeline

- **Deployment Logs:** Captured and searchable.
- **Performance Benchmarks:** Compare test execution time over time.
- **Success/Failure Alerts:** Slack/Email notifications for pipeline status.

---

## Multi-Tenant Deployment Strategy

While the code is multi-tenant, the infrastructure might scale differently:
- **Shared Infrastructure:** All tenants share the same BFF/Backend/DB instances (current MVP).
- **Database Migrations:** Run as a **separate CI job** (Stage 4.5) before application deployment — never at app startup. Must follow the Expand/Contract pattern for rolling-deploy safety.

---

## Tools & Technologies

- **VCS:** GitHub
- **CI/CD Runner:** GitHub Actions (recommended).
- **IaC:** Terraform.
- **Orchestration:** **Docker** (Docker Compose for local/simple prod, K8s for scaling).
- **Quality:** **SonarCloud / SonarQube** (Mandatory Quality Gates).
- **Security:** **Snyk** (SCA), **Gitleaks** (Secrets), **Trivy** (Container scan).
- **Observability:** **Prometheus & Grafana**.

---

## Local Development vs. CI Parity

To avoid "it works on my machine" syndrome:
- Use `docker-compose` locally to match the CI environment.
- Run the same `npm run lint` and `npm run test` scripts locally and in CI.

---

**Status:** Phase 2 - Technical Architecture  
**Next:** `10-OBSERVABILITY_STRATEGY.md`
