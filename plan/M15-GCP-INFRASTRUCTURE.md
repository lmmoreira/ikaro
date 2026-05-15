# M15 — GCP Infrastructure (Terraform)

**Phase:** Cloud ☁️ — GCP charges begin here  
**Goal:** All GCP resources for staging are provisioned via Terraform. The application can be deployed to Cloud Run and reached via public URLs. Production infrastructure is defined in Terraform but requires a separate manual approval to apply.  
**Depends on:** M14 (all local development complete and validated)  
**Blocks:** M16 (deploy pipelines need infra to deploy to)

---

## ⚠️ Cost Notice
Staging resources cost approximately **$50/month**. Production resources cost approximately **$50–100/month** additional. Ensure GCP billing alerts are configured before applying.

---

## Stories

---

### M15-S01 — GCP project bootstrap runbook (Day-0 manual steps)

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § Day-0 bootstrap, `docs/19-INFRASTRUCTURE_TOOLING_MAP.md`

**Description:**  
Document and execute the one-time manual GCP setup steps that cannot be automated via Terraform (chicken-and-egg: Terraform needs a service account and state bucket to run, which must be created manually first). This story produces a runbook + a record of what was done.

**Manual steps to execute and document:**
1. Create GCP projects: `beloauto-staging`, `beloauto-prod`
2. Enable required APIs on each project:
   - `cloudrun.googleapis.com`, `sqladmin.googleapis.com`, `pubsub.googleapis.com`
   - `secretmanager.googleapis.com`, `artifactregistry.googleapis.com`
   - `cloudscheduler.googleapis.com`, `vpcaccess.googleapis.com`
3. Create Terraform state bucket: `gs://beloauto-tfstate` with versioning enabled
4. Create service accounts:
   - `beloauto-deployer@beloauto-staging.iam.gserviceaccount.com` (CI/CD)
   - `beloauto-backend@beloauto-staging.iam.gserviceaccount.com` (runtime)
   - `beloauto-web@beloauto-staging.iam.gserviceaccount.com` (runtime)
5. Grant IAM roles as documented in `docs/23-INFRASTRUCTURE_SETUP.md`
6. Configure Google OAuth consent screen + create OAuth 2.0 Client IDs (staging + production)
7. Create initial secrets in Secret Manager (placeholders — values added in M16)

**Output:** `docs/BOOTSTRAP_LOG.md` (gitignored — contains the actual project IDs and steps completed)

**Google OAuth staging limitation — action required:**
While the OAuth consent screen is in "Testing" mode (before Google verification), only explicitly added test users can log in. You must add every person who will test the staging environment as a test user in the GCP Console (APIs & Services → OAuth consent screen → Test users). Without this, any login attempt on staging returns `"Error 403: access_denied"`. This is a Google policy — not a bug. Add at minimum: your own Google account + any other testers.

**Acceptance criteria:**
- [ ] Both GCP projects created and accessible
- [ ] All 7 APIs enabled in both projects
- [ ] Terraform state bucket exists: `gsutil ls gs://beloauto-tfstate` succeeds
- [ ] All 3 service accounts created with correct IAM bindings
- [ ] Google OAuth credentials created and stored securely (NOT committed to git)
- [ ] At least 1 test user added to the OAuth consent screen test user list
- [ ] `BOOTSTRAP_LOG.md` is in `.gitignore`
- [ ] `infrastructure/terraform/README.md` documents how to run Terraform after bootstrap

**Dependencies:** M14 (all local work validated before cloud spend begins)

---

### M15-S02 — Terraform base configuration

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § Terraform files, `docs/12-DEPLOYMENT_STRATEGY.md`

**Description:**  
Create the Terraform project structure with remote state configuration, variable definitions, and environment-specific `.tfvars` files.

**Files to create in `infrastructure/terraform/`:**

`backend.tf`:
```hcl
terraform {
  backend "gcs" {
    bucket = "beloauto-tfstate"
    prefix = "terraform/state"
  }
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.0" }
  }
  required_version = ">= 1.8"
}
```

`variables.tf` — all input variables: `gcp_project`, `environment`, `region` (default: `southamerica-east1`), `db_tier`, `backend_min_instances`, `backend_max_instances`, `create_observability_vm`

`staging.tfvars`:
```hcl
gcp_project          = "beloauto-staging"
environment          = "staging"
db_tier              = "db-f1-micro"
backend_min_instances = 0
backend_max_instances = 10
create_observability_vm = false
```

`prod.tfvars`:
```hcl
gcp_project          = "beloauto-prod"
environment          = "production"
db_tier              = "db-n1-standard-1"
backend_min_instances = 1
backend_max_instances = 100
create_observability_vm = true
```

**Acceptance criteria:**
- [ ] `terraform init` succeeds and connects to GCS remote state
- [ ] `terraform validate` passes with zero errors
- [ ] Staging and production environments use different variable values (no shared state)
- [ ] `region` defaults to `southamerica-east1` (São Paulo — closest GCP region to Brazilian users)
- [ ] Checkov scan (M01-S07) passes on all Terraform files

**Dependencies:** M15-S01

---

### M15-S03 — Network module (VPC, subnet, VPC connector)

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § network, `docs/12-DEPLOYMENT_STRATEGY.md` § Cloud SQL private IP

**Description:**  
Create the VPC network infrastructure. Cloud Run services connect to Cloud SQL via the VPC connector (private IP — never public internet for DB traffic).

**`infrastructure/terraform/network.tf`:**
- VPC network: `beloauto-vpc-{environment}`
- Subnet: `beloauto-subnet-{environment}` (`10.0.0.0/24` in `southamerica-east1`)
- VPC connector: `beloauto-connector-{environment}` for Cloud Run → Cloud SQL connectivity
- Firewall rules: deny all ingress except internal; allow egress to internet for Cloud Run

**Acceptance criteria:**
- [ ] `terraform apply -var-file=staging.tfvars` creates VPC, subnet, and connector
- [ ] Cloud Run services (created in M15-S09) can reach Cloud SQL via private IP through the connector
- [ ] No public IP assigned to Cloud SQL instance
- [ ] Checkov: VPC flow logs enabled on subnet

**Dependencies:** M15-S02

---

### M15-S04 — Cloud SQL module

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § database module, `docs/12-DEPLOYMENT_STRATEGY.md` § Cloud SQL

**Description:**  
Provision the Cloud SQL PostgreSQL 15 instance. Staging uses `db-f1-micro` (minimal cost). Production uses `db-n1-standard-1`. Private IP only — no public IP.

**`infrastructure/terraform/database.tf`:**
- Cloud SQL instance: `beloauto-db-{environment}`, PostgreSQL 15, `var.db_tier`
- Private IP: `ipv4_enabled = false`, connected to VPC via private services access
- Database: `beloauto`
- User: `beloauto` (password from Secret Manager reference)
- Backup: enabled, daily at 02:00, retention 7 days
- Point-in-time recovery: enabled for production

**Acceptance criteria:**
- [ ] Cloud SQL instance created with private IP only (no public IP)
- [ ] Database and user created
- [ ] Automated backups enabled
- [ ] Connection from Cloud Run via VPC connector works (tested by running a migration in M16-S05)
- [ ] Checkov: SSL enforcement enabled, public IP disabled

**Dependencies:** M15-S03

---

### M15-S05 — Artifact Registry module

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/12-DEPLOYMENT_STRATEGY.md` § immutable artifacts

**Description:**  
Create the Google Artifact Registry repository for Docker images. All 3 app images (`backend`, `bff`, `web`) are stored here, tagged by Git SHA.

**`infrastructure/terraform/registry.tf`:**
- Registry: `beloauto-registry` in `southamerica-east1`, format: `DOCKER`
- Cleanup policy: keep last 10 versions per image, delete untagged after 7 days

**Acceptance criteria:**
- [ ] Artifact Registry created: `southamerica-east1-docker.pkg.dev/<project>/beloauto-registry`
- [ ] `beloauto-deployer` service account has `roles/artifactregistry.writer` on this registry
- [ ] `beloauto-backend` runtime service account has `roles/artifactregistry.reader`
- [ ] Cleanup policy configured to avoid unbounded storage costs

**Dependencies:** M15-S02

---

### M15-S06 — Secret Manager module

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § secrets

**Description:**  
Create the Secret Manager secret resources via Terraform. The secret VALUES are populated manually (never via Terraform to avoid state file exposure). The Terraform resources just create the secret containers and IAM bindings.

**`infrastructure/terraform/secrets.tf`:**
Secret resources (no `secret_data` — values set manually):
- `database-url` — Cloud SQL connection string
- `jwt-secret` — minimum 64-character random string
- `google-oauth-client-id` — from Day-0 bootstrap
- `google-oauth-client-secret` — from Day-0 bootstrap
- `sendgrid-api-key` — SendGrid account
- `cron-secret` — random string for cron endpoint auth
- `platform-admin-key` — minimum 32-character random hex string (`openssl rand -hex 32`); used by `PlatformAdminGuard` to protect `POST /internal/tenants` (UC-024, M02-S05)

IAM: `beloauto-backend` SA gets `roles/secretmanager.secretAccessor` on all secrets

**Acceptance criteria:**
- [ ] Secret Manager resources created in Terraform
- [ ] Secret VALUES are NOT stored in Terraform state or `.tfvars` files
- [ ] Service account has `secretAccessor` role
- [ ] Checkov: secret rotation policy enabled (or suppression documented)

**Dependencies:** M15-S02

---

### M15-S07 — IAM module (service accounts)

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § IAM

**Description:**  
Define the IAM roles and service account bindings as Terraform resources. This codifies the permissions defined in the Day-0 runbook into reproducible infrastructure.

**`infrastructure/terraform/iam.tf`:**

`beloauto-deployer` SA roles:
- `roles/run.admin`, `roles/cloudsql.client`, `roles/secretmanager.secretAccessor`
- `roles/artifactregistry.writer`, `roles/pubsub.admin`

`beloauto-backend` SA roles:
- `roles/pubsub.publisher`, `roles/pubsub.subscriber`
- `roles/storage.objectAdmin`, `roles/secretmanager.secretAccessor`
- `roles/cloudsql.client`

`beloauto-web` SA roles:
- `roles/run.invoker` (to call backend Cloud Run URL)

**Acceptance criteria:**
- [ ] All IAM bindings match `docs/23-INFRASTRUCTURE_SETUP.md` exactly
- [ ] Principle of least privilege: no SA has `roles/owner` or `roles/editor`
- [ ] Checkov passes with no IAM-related high findings

**Dependencies:** M15-S02, M15-S01

---

### M15-S08 — Pub/Sub module (topics + subscriptions)

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § event catalog, `docs/23-INFRASTRUCTURE_SETUP.md` § Pub/Sub

**Description:**  
Create all Pub/Sub topics and subscriptions for every domain event in the system. Each subscription has a dead-letter topic and retry policy.

**`infrastructure/terraform/pubsub.tf`:**

Main topic: `beloauto-events-{environment}`

Subscriptions (one per consumer):
- `beloauto-notification-consumer` → Notification context
- `beloauto-loyalty-consumer` → Loyalty context (BookingCompleted only via filter)

Dead letter: `beloauto-events-dead-letter-{environment}` topic + `beloauto-events-dlq` subscription

Retry policy: `minimum_backoff=10s`, `maximum_backoff=600s`, `max_delivery_attempts=5`

**Acceptance criteria:**
- [ ] All topics and subscriptions created
- [ ] Dead-letter topic configured with 5 max delivery attempts
- [ ] Message retention: 7 days on main topic
- [ ] `beloauto-loyalty-consumer` subscription has a filter: `attributes.eventName="BookingCompleted"`
- [ ] Subscriptions have `ack_deadline_seconds=60`

**Dependencies:** M15-S02

---

### M15-S09 — Cloud Run module (3 services)

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/12-DEPLOYMENT_STRATEGY.md` § Cloud Run, `docs/23-INFRASTRUCTURE_SETUP.md` § Cloud Run services

**Description:**  
Define the 3 Cloud Run services in Terraform. At this point the images don't exist yet (they're built in M16) — use placeholder image references. The actual deployments with real images happen in M16.

**`infrastructure/terraform/cloudrun.tf`:**

For each service (`beloauto-backend`, `beloauto-bff`, `beloauto-web`):
- Region: `southamerica-east1`
- CPU: 1 vCPU; Memory: 512Mi (backend/BFF), 256Mi (web)
- Min instances: `var.backend_min_instances`; Max instances: `var.backend_max_instances`
- Service account: appropriate SA per service
- VPC connector: `beloauto-connector-{environment}`
- Env vars read from Secret Manager (version reference, not value)
- Liveness probe: `GET /health/live`; Readiness probe: `GET /health/ready`

IAM: `beloauto-web` can invoke `beloauto-bff`; BFF can invoke `beloauto-backend` (internal-only)

**Acceptance criteria:**
- [ ] 3 Cloud Run services defined in Terraform
- [ ] Internal traffic only for BFF → Backend (no public URL for backend service)
- [ ] Liveness and readiness probes configured
- [ ] Secrets injected as environment variables via Secret Manager references (not plain text values in Terraform)
- [ ] `terraform plan` shows no errors

**Dependencies:** M15-S04, M15-S05, M15-S06, M15-S07, M15-S08

---

### M15-S10 — Cloud Scheduler module

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § Cloud Scheduler, `docs/04-USE_CASES.md` § cron jobs

**Description:**  
Create the 2 Cloud Scheduler cron jobs that drive reminder notifications and loyalty expiry warnings.

**`infrastructure/terraform/scheduler.tf`:**

Job 1 — Reminders (every 30 minutes):
```hcl
schedule = "*/30 * * * *"
http_target {
  uri = "${google_cloud_run_v2_service.bff.uri}/v1/cron/reminders"
  http_method = "POST"
  headers = { "X-Cron-Secret" = "<from secret manager>" }
}
```

Job 2 — Loyalty expiry (weekly Monday 06:00 UTC):
```hcl
schedule = "0 6 * * 1"
http_target {
  uri = "${google_cloud_run_v2_service.bff.uri}/v1/cron/loyalty-expiry"
  http_method = "POST"
  headers = { "X-Cron-Secret" = "<from secret manager>" }
}
```

**Acceptance criteria:**
- [ ] Both scheduler jobs created in Terraform
- [ ] Cron secret header is read from Secret Manager reference (not hardcoded)
- [ ] Timezone for scheduler jobs: `UTC` (BFF converts to tenant timezone internally)
- [ ] Jobs only created for `staging` and `production` environments (not for dev Terraform runs)

**Dependencies:** M15-S09, M15-S06

---

### M15-S11 — Terraform apply staging + smoke validation

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md`, `docs/12-DEPLOYMENT_STRATEGY.md`

**Description:**  
Apply the complete Terraform configuration to the staging environment and validate that all resources are healthy. This is the first time the cloud infrastructure is live.

**Steps:**
1. `terraform init -backend-config=staging.tfvars`
2. `terraform plan -var-file=staging.tfvars` — review output (share with team)
3. `terraform apply -var-file=staging.tfvars`
4. Populate secret values manually in GCP Console
5. Validate: Cloud SQL reachable via VPC connector, Pub/Sub topics created, Cloud Run services in READY state (with placeholder image), health probes passing

**Acceptance criteria:**
- [ ] `terraform apply` completes with zero errors
- [ ] All 3 Cloud Run services show as READY in Cloud Console
- [ ] Cloud SQL instance running and accessible via VPC connector
- [ ] Pub/Sub topics and subscriptions created and visible in Cloud Console
- [ ] Artifact Registry repository accessible
- [ ] All 6 Secret Manager secrets exist (even if values are still placeholder)
- [ ] `terraform destroy` plan reviewed and saved for emergency use (but NOT applied)

**Dependencies:** M15-S01 through M15-S10

---

### M15-S12 — Cloud Armor + Cloud IAP: harden `/internal/*` endpoints

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/14-API_CONTRACTS.md` § Internal Platform API, `docs/12-DEPLOYMENT_STRATEGY.md`

**Context — security decision (2026-05-15):**
`POST /internal/tenants` (UC-024, M02-S05) is the highest-privilege endpoint in the system — it creates new tenants. In M02 it is protected only by `PLATFORM_ADMIN_KEY` (application layer). This story adds two infrastructure layers, completing the three-layer defence-in-depth:

| Layer | Where | What it does |
|---|---|---|
| **1. Cloud Armor** | Network (load balancer) | Blocks all requests to `/internal/*` from IPs not in the operator allowlist — request never reaches Cloud Run |
| **2. Cloud IAP** | Identity (Google) | Requires a valid Google Workspace identity; only allowlisted accounts can pass |
| **3. `PLATFORM_ADMIN_KEY`** | Application (NestJS) | Validates the Bearer token using `crypto.timingSafeEqual` (implemented in M02-S05) |

All three must pass. This was the explicit user decision: "I want to go more secure."

**What to create:**

**1. Cloud Armor security policy (`security_policy.tf`)**
- Security policy attached to the backend Cloud Run service via Load Balancer
- Rule 1 (priority 1000, action: `deny-403`): path matches `/internal/*` AND source IP NOT in `var.operator_allowed_cidrs` → block
- Rule 2 (priority 2147483647, action: `allow`): default allow for all other traffic
- Variable `operator_allowed_cidrs = list(string)` — list of developer/VPN IP CIDR ranges, set in `staging.tfvars` and `prod.tfvars`

**2. Cloud IAP configuration (`iap.tf`)**
- Enable IAP on the Cloud Run backend's load balancer backend service
- IAP OAuth client: create via `google_iap_client` resource (requires OAuth consent screen from M15-S01)
- IAM binding: `roles/iap.httpsResourceAccessor` for members in `var.iap_members`
- Variable `iap_members = list(string)` — Google accounts/groups allowed, e.g. `["user:dev@beloauto.com.br"]`
- IAP only applies to the backend service; BFF and web services are NOT behind IAP (they have their own auth)

**3. Terraform variables**
- `operator_allowed_cidrs`: list of CIDRs for Cloud Armor allowlist (developer home/office/VPN IPs)
- `iap_members`: list of Google accounts allowed through IAP
- Both are required in `staging.tfvars` and `prod.tfvars` — no defaults (fail loud if missing)

**4. `platform-admin-key` secret Cloud Run env injection**
- Update Cloud Run backend service definition to mount `platform-admin-key` from Secret Manager as `PLATFORM_ADMIN_KEY` env var
- Uses `google_cloud_run_v2_service.backend.template.containers[0].env` with `value_source.secret_key_ref`

**Acceptance criteria:**
- [ ] HTTP request to `/internal/tenants` from an IP NOT in `operator_allowed_cidrs` → `403` from Cloud Armor (never reaches app)
- [ ] HTTP request from allowed IP WITHOUT valid IAP token → `401` from IAP
- [ ] HTTP request from allowed IP + valid IAP token + wrong `PLATFORM_ADMIN_KEY` → `401` from app
- [ ] HTTP request from allowed IP + valid IAP token + correct `PLATFORM_ADMIN_KEY` + valid body → `201` from app
- [ ] `/health/live` and `/health/ready` are NOT affected by Cloud Armor rules (health probes must reach the service)
- [ ] `platform-admin-key` is mounted as env var in Cloud Run backend service
- [ ] `terraform plan` shows no unintended changes to existing Cloud Run services, Pub/Sub, or Cloud SQL
- [ ] Checkov: no high/critical findings on new Terraform resources

**Dependencies:** M15-S03 (VPC + network), M15-S06 (Secret Manager), M15-S09 (Cloud Run services), M02-S05 (`PLATFORM_ADMIN_KEY` implemented in app layer)
