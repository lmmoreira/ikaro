# CI/CD Pipeline - Ikaro

> ⚠️ **Partially superseded** by `plan/M17-CLOUD-DEPLOY.md` §0 (2026-07-07). On any conflict — SA keys, VPC connector, Cloud Armor+IAP, GCE observability VM, cron transport, pipeline structure — M17 wins. Full rewrite tracked as M17-S42.

## Guiding Principles

1. **Every pipeline is isolated.** Backend, BFF, frontend, infrastructure, migrations, and observability each have their own CI and deploy workflows. A change to the frontend never triggers backend tests. Infrastructure changes never rebuild application images.
2. **Immutable artifact.** One Docker image is built, scanned, and tagged with a Git SHA. The same image moves from GHCR → staging → production. Never rebuilt.
3. **Migrations are a hard prerequisite.** The backend deploy workflow calls the migrations workflow and waits for it to succeed before deploying application code.
4. **Manual production gate per service.** Each service has its own GitHub Environment with 1 required reviewer. A full-stack deploy requires 3 separate approvals — maximum isolation and auditability.
5. **Trunk-Based Development.** `main` is always deployable. Feature branches live ≤ 2 days. No direct pushes to `main`.
6. **`synchronize: false` always.** Migrations never run at application startup.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                                │
│                                                                      │
│  .github/workflows/                                                  │
│  ├── ci/                       ← PR gates (run on every PR push)    │
│  │   ├── ci-backend.yml                                             │
│  │   ├── ci-bff.yml                                                 │
│  │   ├── ci-frontend.yml                                            │
│  │   └── ci-infra.yml                                               │
│  │                                                                   │
│  ├── deploy/                   ← Deployment (merge to main + manual) │
│  │   ├── deploy-migrations.yml     reusable + standalone             │
│  │   ├── deploy-infra.yml          Terraform plan+apply              │
│  │   ├── deploy-backend.yml        calls migrations → deploys        │
│  │   ├── deploy-bff.yml                                             │
│  │   ├── deploy-frontend.yml                                        │
│  │   └── deploy-observability.yml  SSH → GCE VM → docker-compose    │
│  │                                                                   │
│  └── shared/                   ← Reusable workflow components        │
│      └── build-push-scan.yml       build + Trivy + push to GHCR     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Environments & GitHub Environments

Each service has **two GitHub Environments**: one for staging (auto-deploy) and one for production (1 reviewer required).

| GitHub Environment | Service | Protection |
|---|---|---|
| `backend-staging` | ikaro-backend | None — auto |
| `backend-production` | ikaro-backend | 1 reviewer required |
| `bff-staging` | ikaro-bff | None — auto |
| `bff-production` | ikaro-bff | 1 reviewer required |
| `frontend-staging` | ikaro-web | None — auto |
| `frontend-production` | ikaro-web | 1 reviewer required |
| `migrations-staging` | DB migrations | None — auto |
| `migrations-production` | DB migrations | 1 reviewer required |
| `infra-staging` | Terraform | None — auto |
| `infra-production` | Terraform | 1 reviewer required |
| `observability` | GCE VM stack | 1 reviewer required |

Configure at: `GitHub repo → Settings → Environments`

---

## GitHub Secrets Catalog

| Secret | Scope | Description |
|---|---|---|
| `SONAR_TOKEN` | Repository | SonarCloud project token |
| `SNYK_TOKEN` | Repository | Snyk API token |
| `GCP_SA_KEY_PROD` | **Repository** | GCP service account JSON — prod project. Repository-scoped (not environment-scoped) because the image build job pushes to the prod GAR registry and does not run inside a GitHub Environment. |
| `GCP_SA_KEY_STAGING` | Env: `*-staging` | GCP service account JSON — staging project (deploy steps only) |
| `DB_HOST_STAGING` | Env: `migrations-staging` | Cloud SQL private IP (staging) |
| `DB_HOST_PROD` | Env: `migrations-production` | Cloud SQL private IP (prod) |
| `DB_NAME` | Repository | Database name (`ikaro`) — same for all envs |
| `DB_MIGRATOR_USER` | Repository | Migration role username (`ikaro_migrator`) |
| `DB_MIGRATOR_PASSWORD_STAGING` | Env: `migrations-staging` | Migration role password (staging) — from Secret Manager `db-migrator-password` |
| `DB_MIGRATOR_PASSWORD_PROD` | Env: `migrations-production` | Migration role password (prod) — from Secret Manager `db-migrator-password` |
| `DB_APP_PASSWORD_STAGING` | Env: `migrations-staging` | App runtime role password (staging) — injected into Cloud Run `DB_PASSWORD` |
| `DB_APP_PASSWORD_PROD` | Env: `migrations-production` | App runtime role password (prod) — injected into Cloud Run `DB_PASSWORD` |
| `OBSERVABILITY_VM_IP` | Env: `observability` | Public IP of the GCE observability VM |
| `OBSERVABILITY_SSH_KEY` | Env: `observability` | SSH private key for GCE VM access |
| `TF_STATE_BUCKET` | Repository | GCS bucket name for Terraform state |

> **Single image registry:** All Docker images are pushed to **Google Artifact Registry** in the prod project (`us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/`). Both staging and production deployments pull from this registry. The staging deployer SA has `roles/artifactregistry.reader` on the prod registry (see `docs/23-INFRASTRUCTURE_SETUP.md`).

> **Runtime secrets** (JWT secret, OAuth client, email API key) live in GCP Secret Manager and are injected into Cloud Run via `--set-secrets`. They never appear in GitHub Secrets.

---

## Path Trigger Matrix

Each CI workflow runs only when its service files change, keeping PRs fast.

| Workflow | Triggers on |
|---|---|
| `ci-backend.yml` | `apps/backend/**`, `packages/**`, `pnpm-lock.yaml` |
| `ci-bff.yml` | `apps/bff/**`, `packages/**`, `pnpm-lock.yaml` |
| `ci-frontend.yml` | `apps/web/**`, `packages/**`, `pnpm-lock.yaml` |
| `ci-infra.yml` | `infrastructure/terraform/**` |
| `deploy-backend.yml` | push to `main` with `apps/backend/**` changes |
| `deploy-bff.yml` | push to `main` with `apps/bff/**` changes |
| `deploy-frontend.yml` | push to `main` with `apps/web/**` changes |
| `deploy-infra.yml` | push to `main` with `infrastructure/terraform/**` changes + `workflow_dispatch` |
| `deploy-migrations.yml` | `workflow_call` (from deploy-backend) + `workflow_dispatch` — **step 1: run `docker/init-db.sh` to provision DB roles; step 2: `pnpm db:migrate`** |
| `deploy-observability.yml` | push to `main` with `infrastructure/observability/**` + `workflow_dispatch` |

---

## Terraform State Backend — One-Time Bootstrap

Before any Terraform can run, the GCS state bucket must exist. This is a **one-time manual step** — not managed by Terraform (you can't use Terraform to create its own state backend).

```bash
# Run once by a developer with GCP project owner role
gcloud storage buckets create gs://ikaro-tfstate \
  --project=ikaro-prod \
  --location=us-central1 \
  --uniform-bucket-level-access

# Enable versioning so state history is preserved
gcloud storage buckets update gs://ikaro-tfstate \
  --versioning
```

```hcl
# infrastructure/terraform/backend.tf
terraform {
  backend "gcs" {
    bucket = "ikaro-tfstate"
    prefix = "env"   # set per workspace: staging/ or prod/
  }
}
```

CI sets the prefix via `-backend-config`:
```bash
terraform init -backend-config="prefix=staging"
terraform init -backend-config="prefix=prod"
```

---

## Infrastructure Layout

```
infrastructure/
├── terraform/
│   ├── main.tf                # Cloud Run services, Cloud SQL, Pub/Sub, Secret Manager
│   ├── observability.tf       # GCE VM + persistent disk + firewall rules
│   ├── variables.tf
│   ├── outputs.tf
│   ├── backend.tf             # GCS remote state
│   ├── staging.tfvars         # staging-specific values
│   └── prod.tfvars            # prod-specific values
│
└── observability/
    ├── docker-compose.yml     # all 4 services
    ├── prometheus/
    │   └── prometheus.yml     # scrape configs (Cloud Run targets)
    ├── grafana/
    │   ├── grafana.ini
    │   └── provisioning/
    │       ├── datasources/
    │       │   ├── prometheus.yml
    │       │   └── loki.yml
    │       └── dashboards/
    │           ├── dashboards.yml  # auto-provision config
    │           └── ikaro-overview.json
    ├── loki/
    │   └── loki.yml
    └── otel/
        └── otel-collector.yml
```

---

## Shared Reusable Workflow — Build, Scan & Push

**File:** `.github/workflows/shared/build-push-scan.yml`

This is called by every service deploy workflow. It builds the Docker image, scans it with Trivy, and pushes it to GHCR. Returns the image tag as an output.

```yaml
name: Build, Scan & Push Image

on:
  workflow_call:
    inputs:
      service:
        required: true
        type: string        # ikaro-backend | ikaro-bff | ikaro-web
      dockerfile:
        required: true
        type: string        # docker/backend/Dockerfile
      build-context:
        required: true
        type: string        # apps/backend
    secrets:
      GCP_SA_KEY_PROD:
        required: true      # needed to push to prod GAR
    outputs:
      image-tag:
        description: SHA tag of the built image
        value: ${{ jobs.build.outputs.image-tag }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      image-tag: sha-${{ github.sha }}

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP (prod registry)
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}

      - name: Configure Docker for GAR
        run: gcloud auth configure-docker us-central1-docker.pkg.dev --quiet

      - uses: docker/setup-buildx-action@v3

      - name: Build & push
        uses: docker/build-push-action@v5
        with:
          context: ${{ inputs.build-context }}
          file: ${{ inputs.dockerfile }}
          push: true
          tags: |
            us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/${{ inputs.service }}:sha-${{ github.sha }}
            us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/${{ inputs.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Trivy image scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/${{ inputs.service }}:sha-${{ github.sha }}
          format: sarif
          exit-code: 1
          severity: HIGH,CRITICAL
```

---

## CI Pipeline — Backend

**File:** `.github/workflows/ci/ci-backend.yml`
**Triggers:** PR push with changes to `apps/backend/**` or `packages/**`

```yaml
name: CI — Backend

on:
  push:
    branches-ignore: [main]
    paths:
      - 'apps/backend/**'
      - 'packages/**'
      - 'pnpm-lock.yaml'
  pull_request:
    branches: [main]
    paths:
      - 'apps/backend/**'
      - 'packages/**'
      - 'pnpm-lock.yaml'

jobs:
  # Runs in parallel ──────────────────────────────────────────────────────────
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter backend lint
      - run: pnpm --filter backend type-check
      - name: Architecture isolation check
        run: pnpm --filter backend lint:architecture

  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        context: [booking, customer, staff, loyalty, notification, platform]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter backend test:unit --testPathPattern="src/contexts/${{ matrix.context }}"

  integration-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        context: [booking, customer, staff, loyalty, notification, platform]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: /tmp/.testcontainers-cache
          key: tc-${{ runner.os }}-postgres17
      - run: pnpm --filter backend test:integration --testPathPattern="src/contexts/${{ matrix.context }}"
        env:
          TESTCONTAINERS_REUSE_ENABLE: true

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Snyk SCA
        uses: snyk/actions/node@master
        with:
          args: --severity-threshold=high --file=apps/backend/package.json
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  sonarcloud:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter backend test:coverage
      - uses: SonarSource/sonarcloud-github-action@master
        with:
          projectBaseDir: apps/backend
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## CI Pipeline — BFF

**File:** `.github/workflows/ci/ci-bff.yml`
**Triggers:** PR push with changes to `apps/bff/**`

```yaml
name: CI — BFF

on:
  push:
    branches-ignore: [main]
    paths: ['apps/bff/**', 'packages/**', 'pnpm-lock.yaml']
  pull_request:
    branches: [main]
    paths: ['apps/bff/**', 'packages/**', 'pnpm-lock.yaml']

jobs:
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter bff lint
      - run: pnpm --filter bff type-check

  unit-and-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter bff test

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: snyk/actions/node@master
        with:
          args: --severity-threshold=high --file=apps/bff/package.json
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

---

## CI Pipeline — Frontend

**File:** `.github/workflows/ci/ci-frontend.yml`
**Triggers:** PR push with changes to `apps/web/**`

```yaml
name: CI — Frontend

on:
  push:
    branches-ignore: [main]
    paths: ['apps/web/**', 'packages/**', 'pnpm-lock.yaml']
  pull_request:
    branches: [main]
    paths: ['apps/web/**', 'packages/**', 'pnpm-lock.yaml']

jobs:
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web lint
      - run: pnpm --filter web type-check

  unit-and-component-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web test     # Vitest

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm --filter web test:e2e
        env:
          BASE_URL: http://localhost:3000  # Playwright starts Next.js dev server
```

---

## CI Pipeline — Infrastructure

**File:** `.github/workflows/ci/ci-infra.yml`
**Triggers:** PR push with changes to `infrastructure/terraform/**`

```yaml
name: CI — Infrastructure

on:
  push:
    branches-ignore: [main]
    paths: ['infrastructure/terraform/**']
  pull_request:
    branches: [main]
    paths: ['infrastructure/terraform/**']

jobs:
  terraform-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with: { terraform_version: '1.8' }
      - name: Terraform fmt check
        run: terraform -chdir=infrastructure/terraform fmt -check -recursive
      - name: Terraform init (staging)
        run: terraform -chdir=infrastructure/terraform init -backend=false
      - name: Terraform validate
        run: terraform -chdir=infrastructure/terraform validate

  checkov:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bridgecrewio/checkov-action@master
        with:
          directory: infrastructure/terraform
          soft_fail: false
          quiet: true

  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Deploy — Migrations (Reusable + Standalone)

**File:** `.github/workflows/deploy/deploy-migrations.yml`

This workflow is **both** a reusable `workflow_call` (called by `deploy-backend`) **and** a standalone `workflow_dispatch` (for manual runs, rollbacks, and expand-only migrations).

```yaml
name: Deploy — Migrations

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string     # staging | production
      context:
        required: false
        type: string     # empty = all contexts; set = run one context only
    secrets:
      DATABASE_URL:
        required: true
      GCP_SA_KEY:
        required: true

  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options: [staging, production]
      context:
        description: 'Context to migrate (leave empty for all)'
        required: false
        type: string

jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: migrations-${{ inputs.environment }}

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with: { version: 9 }

      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }

      - run: pnpm install --frozen-lockfile

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Install psql client
        run: sudo apt-get install -y -q postgresql-client

      - name: Ensure schemas exist (idempotent)
        # CREATE SCHEMA IF NOT EXISTS is safe to run on every deploy.
        # On a brand-new database the schemas do not exist yet and migrations
        # will fail without this step. On subsequent deploys it is a no-op.
        run: |
          psql "$DATABASE_URL" <<-SQL
            CREATE SCHEMA IF NOT EXISTS platform;
            CREATE SCHEMA IF NOT EXISTS customer;
            CREATE SCHEMA IF NOT EXISTS staff;
            CREATE SCHEMA IF NOT EXISTS booking;
            CREATE SCHEMA IF NOT EXISTS loyalty;
            CREATE SCHEMA IF NOT EXISTS notification;
          SQL
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Run migrations — all contexts (ordered by FK dependency)
        if: ${{ !inputs.context }}
        run: |
          echo "▶ Running ALL context migrations on ${{ inputs.environment }}"
          for ctx in platform customer staff booking loyalty notification; do
            echo "  ── migrating schema: $ctx"
            pnpm --filter backend migration:run --context "$ctx"
          done
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Run migrations — single context
        if: ${{ inputs.context != '' }}
        run: |
          echo "▶ Running migrations for context: ${{ inputs.context }} on ${{ inputs.environment }}"
          pnpm --filter backend migration:run --context "${{ inputs.context }}"
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Verify migration integrity
        run: pnpm --filter backend migration:status
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**Migration order (FK dependency):**
```
1. platform      ← tenants table must exist first (tenant_id references platform.tenants)
2. customer
3. staff
4. booking
5. loyalty
6. notification
```

---

## Deploy — Infrastructure (Terraform)

**File:** `.github/workflows/deploy/deploy-infra.yml`
**Triggers:** push to `main` with `infrastructure/terraform/**` changes **OR** `workflow_dispatch`

Staging deploys automatically. Production requires approval.

```yaml
name: Deploy — Infrastructure

on:
  push:
    branches: [main]
    paths: ['infrastructure/terraform/**']
  workflow_dispatch:
    inputs:
      environment:
        required: true
        type: choice
        options: [staging, production]
      action:
        required: true
        type: choice
        options: [plan, apply]
        default: plan

jobs:
  # ── Staging (auto on push to main) ───────────────────────────────────────────
  deploy-staging:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: infra-staging
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with: { terraform_version: '1.8' }

      - name: Authenticate to GCP — staging
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_STAGING }}

      - name: Terraform init — staging
        run: |
          terraform -chdir=infrastructure/terraform init \
            -backend-config="bucket=${{ secrets.TF_STATE_BUCKET }}" \
            -backend-config="prefix=staging"

      - name: Terraform plan — staging
        run: terraform -chdir=infrastructure/terraform plan -var-file="staging.tfvars" -out=tfplan

      - name: Terraform apply — staging
        run: terraform -chdir=infrastructure/terraform apply -auto-approve tfplan

  # ── Production (manual dispatch + approval) ───────────────────────────────────
  deploy-production:
    if: github.event_name == 'workflow_dispatch' && inputs.environment == 'production'
    runs-on: ubuntu-latest
    environment: infra-production   # ← requires 1 reviewer
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with: { terraform_version: '1.8' }

      - name: Authenticate to GCP — production
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}

      - name: Terraform init — production
        run: |
          terraform -chdir=infrastructure/terraform init \
            -backend-config="bucket=${{ secrets.TF_STATE_BUCKET }}" \
            -backend-config="prefix=prod"

      - name: Terraform plan — production
        run: terraform -chdir=infrastructure/terraform plan -var-file="prod.tfvars" -out=tfplan

      - name: Terraform apply — production
        if: inputs.action == 'apply'
        run: terraform -chdir=infrastructure/terraform apply -auto-approve tfplan
```

---

## Deploy — Backend

**File:** `.github/workflows/deploy/deploy-backend.yml`
**Triggers:** push to `main` with `apps/backend/**` changes

Migrations run first as a **hard prerequisite** — the deploy step only runs if migrations succeed.

```yaml
name: Deploy — Backend

on:
  push:
    branches: [main]
    paths:
      - 'apps/backend/**'
      - 'packages/**'
      - 'pnpm-lock.yaml'

jobs:
  # ── Step 1: Build & push image ────────────────────────────────────────────────
  build:
    uses: ./.github/workflows/shared/build-push-scan.yml
    with:
      service: ikaro-backend
      dockerfile: docker/backend/Dockerfile
      build-context: .
    permissions:
      contents: read
    secrets:
      GCP_SA_KEY_PROD: ${{ secrets.GCP_SA_KEY_PROD }}

  # ── Step 2: Migrate staging DB (hard prerequisite) ───────────────────────────
  migrate-staging:
    needs: build
    uses: ./.github/workflows/deploy/deploy-migrations.yml
    with:
      environment: staging
    secrets:
      DATABASE_URL: ${{ secrets.DATABASE_URL_STAGING }}
      GCP_SA_KEY: ${{ secrets.GCP_SA_KEY_STAGING }}

  # ── Step 3: Deploy to staging ─────────────────────────────────────────────────
  deploy-staging:
    needs: migrate-staging
    runs-on: ubuntu-latest
    environment: backend-staging
    env:
      IMAGE_TAG: sha-${{ github.sha }}
      REGION: us-central1
    steps:
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_STAGING }}
      - uses: google-github-actions/setup-gcloud@v2
      - name: Deploy to Cloud Run — staging
        run: |
          gcloud run deploy ikaro-backend-staging \
            --image us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/ikaro-backend:${{ env.IMAGE_TAG }} \
            --region ${{ env.REGION }} \
            --project ikaro-staging \
            --memory 512Mi --cpu 1 \
            --min-instances 0 --max-instances 10 \
            --set-secrets DATABASE_URL=database-url:latest,JWT_SECRET=jwt-secret:latest \
            --traffic 100
      - name: Smoke test
        run: |
          URL=$(gcloud run services describe ikaro-backend-staging \
            --region ${{ env.REGION }} \
            --project ikaro-staging \
            --format 'value(status.url)')
          curl --fail --retry 5 --retry-delay 5 "$URL/health/ready"

  # ── Step 4: Migrate production DB (hard prerequisite, manual approval) ────────
  migrate-production:
    needs: deploy-staging
    uses: ./.github/workflows/deploy/deploy-migrations.yml
    with:
      environment: production
    secrets:
      DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}
      GCP_SA_KEY: ${{ secrets.GCP_SA_KEY_PROD }}

  # ── Step 5: Deploy to production (requires 1 reviewer) ───────────────────────
  deploy-production:
    needs: migrate-production
    runs-on: ubuntu-latest
    environment: backend-production   # ← approval gate
    env:
      IMAGE_TAG: sha-${{ github.sha }}
      REGION: us-central1
    steps:
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}
      - uses: google-github-actions/setup-gcloud@v2
      - name: Deploy to Cloud Run — production
        run: |
          gcloud run deploy ikaro-backend \
            --image us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/ikaro-backend:${{ env.IMAGE_TAG }} \
            --region ${{ env.REGION }} \
            --project ikaro-prod \
            --memory 512Mi --cpu 1 \
            --min-instances 1 --max-instances 100 \
            --set-secrets DATABASE_URL=database-url:latest,JWT_SECRET=jwt-secret:latest \
            --traffic 100
      - name: Smoke test — production
        run: |
          URL=$(gcloud run services describe ikaro-backend \
            --region ${{ env.REGION }} \
            --project ikaro-prod \
            --format 'value(status.url)')
          curl --fail --retry 5 --retry-delay 10 "$URL/health/ready"
```

---

## Deploy — BFF

**File:** `.github/workflows/deploy/deploy-bff.yml`
**Triggers:** push to `main` with `apps/bff/**` changes

Same pattern as backend but **no migration step** — BFF owns no database schema.

```yaml
name: Deploy — BFF

on:
  push:
    branches: [main]
    paths: ['apps/bff/**', 'packages/**', 'pnpm-lock.yaml']

jobs:
  build:
    uses: ./.github/workflows/shared/build-push-scan.yml
    with:
      service: ikaro-bff
      dockerfile: docker/bff/Dockerfile
      build-context: .
    permissions:
      contents: read
    secrets:
      GCP_SA_KEY_PROD: ${{ secrets.GCP_SA_KEY_PROD }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: bff-staging
    env:
      IMAGE_TAG: sha-${{ github.sha }}
      REGION: us-central1
    steps:
      - uses: google-github-actions/auth@v2
        with: { credentials_json: '${{ secrets.GCP_SA_KEY_STAGING }}' }
      - uses: google-github-actions/setup-gcloud@v2
      - name: Deploy BFF — staging
        run: |
          gcloud run deploy ikaro-bff-staging \
            --image us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/ikaro-bff:${{ env.IMAGE_TAG }} \
            --region ${{ env.REGION }} \
            --project ikaro-staging \
            --allow-unauthenticated \
            --memory 256Mi --cpu 1 \
            --min-instances 0 --max-instances 10 \
            --traffic 100
      - name: Smoke test
        run: |
          URL=$(gcloud run services describe ikaro-bff-staging \
            --region ${{ env.REGION }} \
            --project ikaro-staging \
            --format 'value(status.url)')
          curl --fail --retry 5 --retry-delay 5 "$URL/health/ready"

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: bff-production    # ← approval gate
    env:
      IMAGE_TAG: sha-${{ github.sha }}
      REGION: us-central1
    steps:
      - uses: google-github-actions/auth@v2
        with: { credentials_json: '${{ secrets.GCP_SA_KEY_PROD }}' }
      - uses: google-github-actions/setup-gcloud@v2
      - name: Deploy BFF — production
        run: |
          gcloud run deploy ikaro-bff \
            --image us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/ikaro-bff:${{ env.IMAGE_TAG }} \
            --region ${{ env.REGION }} \
            --project ikaro-prod \
            --allow-unauthenticated \
            --min-instances 1 --max-instances 100 \
            --traffic 100
      - name: Smoke test — production
        run: |
          URL=$(gcloud run services describe ikaro-bff \
            --region ${{ env.REGION }} \
            --project ikaro-prod \
            --format 'value(status.url)')
          curl --fail --retry 5 --retry-delay 10 "$URL/health/ready"
```

---

## Deploy — Frontend

**File:** `.github/workflows/deploy/deploy-frontend.yml`
**Triggers:** push to `main` with `apps/web/**` changes

```yaml
name: Deploy — Frontend

on:
  push:
    branches: [main]
    paths: ['apps/web/**', 'packages/**', 'pnpm-lock.yaml']

jobs:
  build:
    uses: ./.github/workflows/shared/build-push-scan.yml
    with:
      service: ikaro-web
      dockerfile: docker/web/Dockerfile
      build-context: .
    permissions:
      contents: read
    secrets:
      GCP_SA_KEY_PROD: ${{ secrets.GCP_SA_KEY_PROD }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: frontend-staging
    env:
      IMAGE_TAG: sha-${{ github.sha }}
      REGION: us-central1
    steps:
      - uses: google-github-actions/auth@v2
        with: { credentials_json: '${{ secrets.GCP_SA_KEY_STAGING }}' }
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud run deploy ikaro-web-staging \
            --image us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/ikaro-web:${{ env.IMAGE_TAG }} \
            --region ${{ env.REGION }} \
            --project ikaro-staging \
            --allow-unauthenticated \
            --memory 256Mi --cpu 1 \
            --min-instances 0 --max-instances 20 \
            --traffic 100
      - run: |
          URL=$(gcloud run services describe ikaro-web-staging \
            --region ${{ env.REGION }} \
            --project ikaro-staging \
            --format 'value(status.url)')
          curl --fail --retry 5 --retry-delay 5 "$URL"

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: frontend-production    # ← approval gate
    env:
      IMAGE_TAG: sha-${{ github.sha }}
      REGION: us-central1
    steps:
      - uses: google-github-actions/auth@v2
        with: { credentials_json: '${{ secrets.GCP_SA_KEY_PROD }}' }
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud run deploy ikaro-web \
            --image us-central1-docker.pkg.dev/ikaro-prod/ikaro-images/ikaro-web:${{ env.IMAGE_TAG }} \
            --region ${{ env.REGION }} \
            --project ikaro-prod \
            --allow-unauthenticated \
            --min-instances 1 --max-instances 50 \
            --traffic 100
      - name: Smoke test — production
        run: |
          URL=$(gcloud run services describe ikaro-web \
            --region ${{ env.REGION }} \
            --project ikaro-prod \
            --format 'value(status.url)')
          curl --fail --retry 5 --retry-delay 10 "$URL"
```

---

## Deploy — Observability (GCE VM + Docker Compose)

**File:** `.github/workflows/deploy/deploy-observability.yml`
**Triggers:** push to `main` with `infrastructure/observability/**` changes **OR** `workflow_dispatch`

The GCE VM is provisioned by Terraform (`infrastructure/terraform/observability.tf`). The deploy pipeline SSHes into it, copies the latest `docker-compose.yml` and configs, then restarts the stack.

```yaml
name: Deploy — Observability Stack

on:
  push:
    branches: [main]
    paths: ['infrastructure/observability/**']
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: observability    # ← always requires 1 reviewer (monitoring prod + staging)

    steps:
      - uses: actions/checkout@v4

      - name: Set up SSH key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.OBSERVABILITY_SSH_KEY }}" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
          ssh-keyscan -H "${{ secrets.OBSERVABILITY_VM_IP }}" >> ~/.ssh/known_hosts

      - name: Copy observability configs to VM
        run: |
          scp -r infrastructure/observability/ \
            ubuntu@${{ secrets.OBSERVABILITY_VM_IP }}:/opt/observability/

      - name: Pull latest images and restart stack
        run: |
          ssh ubuntu@${{ secrets.OBSERVABILITY_VM_IP }} << 'EOF'
            cd /opt/observability
            docker-compose pull
            docker-compose up -d --remove-orphans
            docker-compose ps
          EOF

      - name: Health check — Prometheus
        run: |
          curl --fail --retry 10 --retry-delay 5 \
            "http://${{ secrets.OBSERVABILITY_VM_IP }}:9090/-/ready"

      - name: Health check — Grafana
        run: |
          curl --fail --retry 10 --retry-delay 5 \
            "http://${{ secrets.OBSERVABILITY_VM_IP }}:3000/api/health"

      - name: Health check — Loki
        run: |
          curl --fail --retry 10 --retry-delay 5 \
            "http://${{ secrets.OBSERVABILITY_VM_IP }}:3100/ready"
```

---

## Observability Stack Configuration

**File:** `infrastructure/observability/docker-compose.yml`

```yaml
version: '3.9'

services:
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'          # allow config reload via API

  grafana:
    image: grafana/grafana:10.4.0
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./grafana/grafana.ini:/etc/grafana/grafana.ini:ro
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana-data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_USERS_ALLOW_SIGN_UP: "false"

  loki:
    image: grafana/loki:2.9.0
    container_name: loki
    restart: unless-stopped
    ports:
      - "3100:3100"
    volumes:
      - ./loki/loki.yml:/etc/loki/loki.yml:ro
      - loki-data:/loki
    command: -config.file=/etc/loki/loki.yml

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.98.0
    container_name: otel-collector
    restart: unless-stopped
    ports:
      - "4317:4317"    # gRPC
      - "4318:4318"    # HTTP
      - "8888:8888"    # Prometheus metrics (self-monitoring)
    volumes:
      - ./otel/otel-collector.yml:/etc/otelcol-contrib/otel-collector.yml:ro
    command: --config=/etc/otelcol-contrib/otel-collector.yml

volumes:
  prometheus-data:
  grafana-data:
  loki-data:
```

**File:** `infrastructure/observability/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: production

scrape_configs:
  - job_name: 'ikaro-backend'
    scheme: https
    static_configs:
      - targets: ['ikaro-backend-prod.run.app']
    metrics_path: /metrics

  - job_name: 'ikaro-bff'
    scheme: https
    static_configs:
      - targets: ['ikaro-bff-prod.run.app']
    metrics_path: /metrics

  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector:8888']
```

**File:** `infrastructure/observability/otel/otel-collector.yml`

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    send_batch_size: 1000
    timeout: 5s
  resource:
    attributes:
      - action: insert
        key: environment
        value: production

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
    labels:
      resource:
        service.name: service_name
        tenant.id: tenant_id
  logging:
    verbosity: basic

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [logging]
    metrics:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [loki]
```

---

## Terraform — Observability VM (`infrastructure/terraform/observability.tf`)

```hcl
# GCE VM for the observability stack
resource "google_compute_instance" "observability" {
  name         = "ikaro-observability"
  machine_type = "e2-small"        # 2 vCPU, 2 GB RAM — ~$13/month
  zone         = "${var.region}-a"
  project      = var.gcp_project_prod   # lives in prod project, monitors both envs

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts"
      size  = 20    # GB — OS + Docker images
    }
  }

  # Persistent disk for metrics/logs data
  attached_disk {
    source      = google_compute_disk.observability_data.self_link
    device_name = "observability-data"
  }

  network_interface {
    network = "default"
    access_config {}   # assigns a public IP
  }

  metadata = {
    startup-script = <<-SCRIPT
      #!/bin/bash
      set -euo pipefail

      # Install Docker
      apt-get update -q
      apt-get install -y -q ca-certificates curl gnupg
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu \
        $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -q
      apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin

      # Mount the persistent data disk (first boot: format it)
      DISK=/dev/disk/by-id/google-observability-data
      MOUNT=/mnt/observability-data
      if ! blkid "$DISK" | grep -q ext4; then
        mkfs.ext4 -F "$DISK"
      fi
      mkdir -p "$MOUNT"
      mount -o discard,defaults "$DISK" "$MOUNT"
      echo "$DISK $MOUNT ext4 discard,defaults 0 2" >> /etc/fstab

      # Create sub-directories for persistent volumes
      mkdir -p "$MOUNT"/{prometheus,grafana,loki}

      # Working directory — CI deploys compose file here via SSH
      mkdir -p /opt/observability
      echo "Bootstrap complete. Observability stack will start after CI deploy."
    SCRIPT
  }

  tags = ["observability", "allow-ssh"]
}

resource "google_compute_disk" "observability_data" {
  name    = "observability-data"
  type    = "pd-standard"
  zone    = "${var.region}-a"
  size    = 50    # GB — 30d of Prometheus + Loki logs
  project = var.gcp_project_prod
}

resource "google_compute_firewall" "allow_observability_internal" {
  name    = "allow-observability-internal"
  network = "default"
  project = var.gcp_project_prod

  allow {
    protocol = "tcp"
    ports    = ["9090", "3000", "3100", "4317", "4318"]
  }

  # Only allow access from Cloud Run service accounts + developer IPs
  source_ranges = var.allowed_observability_cidrs
}
```

---

## Health Check Contract

Every Cloud Run service must expose both endpoints. Cloud Run uses `/health/ready` as the readiness probe before shifting traffic.

```typescript
// health.controller.ts (NestJS)
@Controller('health')
export class HealthController {
  constructor(
    private db: DatabaseHealthIndicator,
    private eventBus: EventBusHealthIndicator,
  ) {}

  @Get('live')
  liveness(): { status: string } {
    return { status: 'ok' };   // always 200 if process is running
  }

  @Get('ready')
  async readiness() {
    const db = await this.db.check('database');
    const bus = await this.eventBus.check('eventBus');

    const healthy = db.status === 'up' && bus.status === 'up';
    const response = { status: healthy ? 'ok' : 'error', checks: { db, bus } };

    if (!healthy) throw new ServiceUnavailableException(response);
    return response;
  }
}
```

---

## Event Reliability

### ACK / NACK contract

Handlers **never** call `message.ack()` or `message.nack()` directly. `GcpPubSubEventBusAdapter.dispatch()` owns the full ACK/NACK lifecycle:

| Outcome | Adapter action | Effect |
|---|---|---|
| Handler completes without throwing | `message.ack()` | Message removed from subscription — success |
| Handler throws (any error) below threshold | `message.nack()` | Pub/Sub redelivers with backoff |
| Handler throws at `PUBSUB_MAX_DELIVERY_ATTEMPTS` | `publishToDlq()` + `message.ack()` | Routed to dead-letter topic; no further retry |
| Message data is unparseable JSON | Log raw bytes at ERROR + `message.ack()` | Silently removed — retry cannot fix a malformed payload |

Handlers signal failure by **throwing**. The adapter translates that into a nack or a DLQ route transparently.

---

### Dead-letter queue (DLQ)

**Topic:** `ikaro-dead-letter`  
**Subscription:** `ikaro-dead-letter-monitor`  
**Threshold:** `PUBSUB_MAX_DELIVERY_ATTEMPTS` env var (default `5`)

**Routing is programmatic, not infrastructure-native.**  
`GcpPubSubEventBusAdapter.dispatch()` tracks `message.deliveryAttempt`. When it reaches the threshold it publishes the original message bytes to `ikaro-dead-letter` (preserving all original attributes plus `originalEventName`, `deadLetterReason`, `deliveryAttempt`) and ACKs the original message. This works identically on the local emulator and in production.

```
Handler nacks (attempt 1–4)
  → Pub/Sub redelivers with exponential backoff

Handler nacks (attempt 5 = PUBSUB_MAX_DELIVERY_ATTEMPTS)
  → Adapter publishes to ikaro-dead-letter
  → Adapter ACKs original message
  → DeadLetterHandler receives it, logs at ERROR, ACKs
```

**Why no `NotificationLog` row for DLQ messages:**  
Each failed delivery attempt creates a `NotificationLog(status=FAILED)` row via `BaseNotificationUseCase.saveFailedLog()`. By the time a message reaches the DLQ, those FAILED rows already exist. The DLQ signal is an observability concern — ERROR-level structured logs (routed to Loki → Grafana alert) are the correct instrument.

---

### Pub/Sub resource ownership by environment

| Environment | Who creates topics / subscriptions |
|---|---|
| Local dev (emulator) | `GcpPubSubEventBusAdapter` — auto-creates on `onApplicationBootstrap()` |
| CI (emulator via Testcontainers or PUBSUB_EMULATOR_HOST) | `GcpPubSubEventBusAdapter` — auto-creates |
| Staging | **Terraform** (`infrastructure/terraform/pubsub.tf`) — app must NOT create |
| Production | **Terraform** (`infrastructure/terraform/pubsub.tf`) — app must NOT create |

Set `PUBSUB_AUTO_CREATE=false` in staging and production. With this flag the adapter skips `ensureTopicOnce()` and `ensureSubscription()` entirely — Terraform pre-creates all resources before the app starts.

> **Known gap:** a future story should enforce that `PUBSUB_AUTO_CREATE=false` is set via the Cloud Run deploy step in `deploy-backend.yml` so it cannot be accidentally omitted.

**Terraform resources (`infrastructure/terraform/pubsub.tf`):**

```
google_pubsub_topic.dead_letter          → ikaro-dead-letter
google_pubsub_subscription.loyalty_consumer      → ikaro-loyalty-consumer (filter: BookingCompleted)
google_pubsub_subscription.notification_consumer → ikaro-notification-consumer (all events)
google_pubsub_subscription.dead_letter_monitor   → ikaro-dead-letter-monitor
```

All subscriptions in staging/prod have `dead_letter_policy { max_delivery_attempts = 5 }` pointing to `ikaro-dead-letter`. In practice the app's programmatic routing fires first (same threshold), so native Pub/Sub dead-lettering acts as a safety net for cases where the adapter itself crashes before routing.

---

### Testing DLQ behaviour

The Pub/Sub emulator **does not support** native dead-letter policies. Test DLQ routing by:

1. **Adapter unit test** — mock `message.deliveryAttempt = PUBSUB_MAX_DELIVERY_ATTEMPTS`, assert `publishToDlq` called and `message.ack()` called (not `nack()`).
2. **Handler unit test** — call `deadLetterHandler.handle(event)` directly, assert `logger.error` called and no throw.
3. **Do not** attempt to trigger DLQ routing through the emulator subscription flow in integration tests — it is not supported.

---

## Quality Gates — Per Pipeline Summary

| Pipeline | Static | Tests | Security | Sonar | Gate |
|---|---|---|---|---|---|
| `ci-backend` | lint + tsc + arch isolation | unit (×6) + integration (×6) | Gitleaks + Snyk | ✅ diff coverage | Merge blocked if any fail |
| `ci-bff` | lint + tsc | unit + integration | Gitleaks + Snyk | — | Merge blocked |
| `ci-frontend` | lint + tsc | Vitest + Playwright | Gitleaks | — | Merge blocked |
| `ci-infra` | tf fmt + validate | — | Checkov + Gitleaks | — | Merge blocked |
| `build-push-scan` | — | — | Trivy image scan → GAR | — | Push to GAR blocked on HIGH/CRITICAL |
| `deploy-migrations` | — | migration:status | — | — | Deploy blocked on failure |
| `deploy-infra` | — | — | — | — | Prod requires approval |
| `deploy-backend` | — | — | — | — | Migrations must pass first; prod requires approval |
| `deploy-bff` | — | — | — | — | Prod requires approval |
| `deploy-frontend` | — | — | — | — | Prod requires approval |
| `deploy-observability` | — | health checks | — | — | Always requires approval |

---

## Full Pipeline Map

```
PR opened / pushed
       │
       ├── backend changed? ──→ ci-backend (parallel: lint + unit×6 + integ×6 + security + sonar)
       ├── bff changed?     ──→ ci-bff     (lint + tests + security)
       ├── frontend changed?──→ ci-frontend (lint + vitest + playwright)
       └── infra changed?   ──→ ci-infra   (tf validate + checkov)

Merge to main (all gates green, 1 reviewer approved)
       │
       ├── backend changed?
       │     ├── build-push-scan (ikaro-backend → GHCR)
       │     ├── deploy-migrations staging  ← hard prerequisite
       │     ├── deploy-backend staging (auto)
       │     ├── deploy-migrations production  ← hard prerequisite
       │     └── deploy-backend production  🔴 requires 1 reviewer
       │
       ├── bff changed?
       │     ├── build-push-scan (ikaro-bff → GHCR)
       │     ├── deploy-bff staging (auto)
       │     └── deploy-bff production  🔴 requires 1 reviewer
       │
       ├── frontend changed?
       │     ├── build-push-scan (ikaro-web → GHCR)
       │     ├── deploy-frontend staging (auto)
       │     └── deploy-frontend production  🔴 requires 1 reviewer
       │
       ├── terraform changed?
       │     ├── deploy-infra staging (auto)
       │     └── deploy-infra production  🔴 requires 1 reviewer
       │
       └── observability changed?
             └── deploy-observability  🔴 always requires 1 reviewer
```
