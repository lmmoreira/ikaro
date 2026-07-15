# Infrastructure Setup - Ikaro

> ⚠️ **Partially superseded** by `plan/M17-CLOUD-DEPLOY.md` §0 (2026-07-07). On any conflict — SA keys, VPC connector, Cloud Armor+IAP, GCE observability VM, cron transport, pipeline structure — M17 wins. Full rewrite tracked as M17-S42.

## Overview

This document is the single source of truth for infrastructure: from a blank laptop to a fully running local development environment, and from zero GCP access to a deployed production system.

**Stack:** GCP Cloud Run · Cloud SQL PostgreSQL 15 · VPC · Pub/Sub · GCS · Secret Manager · Google Artifact Registry · Terraform

---

## GCP Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GCP Project (staging or prod)                     │
│                                                                           │
│  Google Artifact Registry                                                │
│  └── ikaro-images/          ← all Docker images                      │
│                                                                           │
│  ┌────────────── ikaro-vpc (10.0.0.0/16) ─────────────────────────┐  │
│  │                                                                     │  │
│  │  VPC Serverless Connector (10.8.0.0/28)                           │  │
│  │      ▲ Cloud Run → VPC                                             │  │
│  │                                                                     │  │
│  │  Cloud SQL (private IP 10.0.1.x)                                  │  │
│  │  └── ikaro-postgres (PostgreSQL 15)                             │  │
│  │      ├── schema: platform                                          │  │
│  │      ├── schema: customer                                          │  │
│  │      ├── schema: staff                                             │  │
│  │      ├── schema: booking                                           │  │
│  │      ├── schema: loyalty                                           │  │
│  │      └── schema: notification                                      │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────  │
│                                                                           │
│  Cloud Run (public HTTPS, connected to VPC via connector)                │
│  ├── ikaro-web      → https://<ikaro-domain>                            │
│  ├── ikaro-bff      → https://bff.<ikaro-domain>                        │
│  └── ikaro-backend  → (internal, only called by BFF)                  │
│                                                                           │
│  Pub/Sub                                                                 │
│  ├── topic: ikaro-domain-events                                       │
│  ├── subscription: ikaro-loyalty-consumer                             │
│  ├── subscription: ikaro-notification-consumer                        │
│  └── topic: ikaro-dead-letter                                         │
│                                                                           │
│  Cloud Storage                                                           │
│  └── ikaro-media-<env>/     ← tenant photos (tenants/<tid>/...)       │
│                                                                           │
│  Secret Manager                                                          │
│  ├── database-url                                                        │
│  ├── jwt-secret                                                          │
│  ├── google-oauth-client-id                                              │
│  ├── google-oauth-client-secret                                          │
│  └── email-api-key                                                       │
│                                                                           │
│  Service Accounts                                                        │
│  ├── ikaro-deployer@    ← used by CI/CD (GitHub Actions)              │
│  └── ikaro-backend@     ← used by Cloud Run services at runtime       │
└─────────────────────────────────────────────────────────────────────────┘

  GCE VM (ikaro-observability) — prod project only
  └── Docker Compose: Prometheus + Grafana + Loki + OTel Collector
```

---

## Day 0 Bootstrap (one-time manual setup)

These steps are performed **once** by a developer with GCP Organization Admin access. They cannot be automated by Terraform because they create the prerequisites Terraform needs to run.

### 1. Install required tools

```bash
# macOS / Linux
brew install google-cloud-sdk terraform pnpm node

# Verify versions
gcloud --version          # >= 470
terraform --version       # >= 1.8
node --version            # >= 20
pnpm --version            # >= 9
```

### 2. Create GCP Projects

```bash
# Replace with your GCP billing account ID
BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX

# Create projects
gcloud projects create ikaro-staging --name="Ikaro Staging"
gcloud projects create ikaro-prod    --name="Ikaro Production"

# Link billing
gcloud billing projects link ikaro-staging --billing-account=$BILLING_ACCOUNT
gcloud billing projects link ikaro-prod    --billing-account=$BILLING_ACCOUNT
```

### 3. Enable Required APIs

Run for **each** project (`ikaro-staging` and `ikaro-prod`):

```bash
for PROJECT in ikaro-staging ikaro-prod; do
  echo "Enabling APIs for $PROJECT..."
  gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    sql-component.googleapis.com \
    servicenetworking.googleapis.com \
    vpcaccess.googleapis.com \
    pubsub.googleapis.com \
    storage.googleapis.com \
    secretmanager.googleapis.com \
    artifactregistry.googleapis.com \
    cloudresourcemanager.googleapis.com \
    compute.googleapis.com \
    iam.googleapis.com \
    --project=$PROJECT
done
```

### 4. Create Service Accounts

```bash
for PROJECT in ikaro-staging ikaro-prod; do
  # CI/CD deployer (used by GitHub Actions)
  gcloud iam service-accounts create ikaro-deployer \
    --display-name="Ikaro CI/CD Deployer" \
    --project=$PROJECT

  # Backend + BFF runtime (Cloud SQL, Pub/Sub, Secret Manager, GCS)
  gcloud iam service-accounts create ikaro-backend \
    --display-name="Ikaro Backend + BFF Runtime" \
    --project=$PROJECT

  # Web (Next.js) runtime — no GCP permissions needed at runtime
  gcloud iam service-accounts create ikaro-web \
    --display-name="Ikaro Web Runtime" \
    --project=$PROJECT
done
```

### 5. Grant IAM Roles

```bash
for PROJECT in ikaro-staging ikaro-prod; do
  DEPLOYER="serviceAccount:ikaro-deployer@${PROJECT}.iam.gserviceaccount.com"
  BACKEND="serviceAccount:ikaro-backend@${PROJECT}.iam.gserviceaccount.com"
  WEB="serviceAccount:ikaro-web@${PROJECT}.iam.gserviceaccount.com"

  # Deployer: deploy Cloud Run, run migrations, read secrets, manage infra
  gcloud projects add-iam-policy-binding $PROJECT --member=$DEPLOYER --role=roles/run.admin
  gcloud projects add-iam-policy-binding $PROJECT --member=$DEPLOYER --role=roles/cloudsql.client
  gcloud projects add-iam-policy-binding $PROJECT --member=$DEPLOYER --role=roles/secretmanager.secretAccessor
  gcloud projects add-iam-policy-binding $PROJECT --member=$DEPLOYER --role=roles/iam.serviceAccountUser
  gcloud projects add-iam-policy-binding $PROJECT --member=$DEPLOYER --role=roles/vpcaccess.admin
  gcloud projects add-iam-policy-binding $PROJECT --member=$DEPLOYER --role=roles/storage.admin

  # Backend + BFF runtime: read secrets, query DB, Pub/Sub, write GCS, pull images
  gcloud projects add-iam-policy-binding $PROJECT --member=$BACKEND --role=roles/cloudsql.client
  gcloud projects add-iam-policy-binding $PROJECT --member=$BACKEND --role=roles/secretmanager.secretAccessor
  gcloud projects add-iam-policy-binding $PROJECT --member=$BACKEND --role=roles/pubsub.publisher
  gcloud projects add-iam-policy-binding $PROJECT --member=$BACKEND --role=roles/pubsub.subscriber
  gcloud projects add-iam-policy-binding $PROJECT --member=$BACKEND --role=roles/storage.objectAdmin

  # Web (Next.js) runtime: pull image only — no DB, no Pub/Sub, no secrets
  # (no roles needed beyond the implicit Cloud Run identity; image is public in GAR)
done

# ── Cross-project: staging deployer + runtime SAs must read from PROD GAR ──────
# All Docker images are stored in ikaro-prod GAR only.
# Both staging and prod deployments pull from the same registry.
for SA in \
  "serviceAccount:ikaro-deployer@ikaro-staging.iam.gserviceaccount.com" \
  "serviceAccount:ikaro-backend@ikaro-staging.iam.gserviceaccount.com"; do
  gcloud artifacts repositories add-iam-policy-binding ikaro-images \
    --location=us-central1 \
    --project=ikaro-prod \
    --member="$SA" \
    --role="roles/artifactregistry.reader"
done

# ── Prod deployer: writer access to prod GAR (pushes images from CI) ────────────
gcloud projects add-iam-policy-binding ikaro-prod \
  --member="serviceAccount:ikaro-deployer@ikaro-prod.iam.gserviceaccount.com" \
  --role=roles/artifactregistry.writer
```

### 6. Create Service Account Keys (for GitHub Actions)

```bash
for PROJECT in ikaro-staging ikaro-prod; do
  SUFFIX=$(echo $PROJECT | sed 's/ikaro-//')
  gcloud iam service-accounts keys create /tmp/sa-key-${SUFFIX}.json \
    --iam-account=ikaro-deployer@${PROJECT}.iam.gserviceaccount.com \
    --project=$PROJECT
  echo "Key saved: /tmp/sa-key-${SUFFIX}.json"
  echo "Add this to GitHub Secrets as GCP_SA_KEY_$(echo $SUFFIX | tr a-z A-Z)"
done
# ⚠️  Delete these files after adding them to GitHub Secrets
```

### 7. Create Terraform State Bucket

```bash
# State bucket lives in the prod project (manages state for both envs)
gcloud storage buckets create gs://ikaro-tfstate \
  --project=ikaro-prod \
  --location=us-central1 \
  --uniform-bucket-level-access

gcloud storage buckets update gs://ikaro-tfstate --versioning

# Grant deployer access to the state bucket (both projects)
for PROJECT in ikaro-staging ikaro-prod; do
  gsutil iam ch \
    serviceAccount:ikaro-deployer@${PROJECT}.iam.gserviceaccount.com:objectAdmin \
    gs://ikaro-tfstate
done
```

### 8. Initialize Terraform Workspaces

```bash
cd infrastructure/terraform

# Staging workspace
terraform init -backend-config="bucket=ikaro-tfstate" -backend-config="prefix=staging"
terraform workspace new staging

# Production workspace
terraform init -backend-config="bucket=ikaro-tfstate" -backend-config="prefix=prod"
terraform workspace new prod
```

### 9. Set Up Google OAuth 2.0 Credentials

Ikaro uses Google OAuth 2.0 for both customer login (UC-021) and staff login (UC-022). You need **one OAuth client per environment** (staging and production).

> **One-time setup per environment — takes ~10 minutes.** You need a Google account that has access to a Google Cloud project (any project — OAuth credentials are not tied to a specific GCP project).

#### Step-by-step

**1. Open the Google Cloud Console**
Go to [console.cloud.google.com](https://console.cloud.google.com) → select any GCP project (use `ikaro-prod` for production credentials and `ikaro-staging` for staging credentials) → navigate to **APIs & Services → Credentials**.

**2. Configure the OAuth consent screen (one-time per project)**
- Click **OAuth consent screen** (left sidebar).
- User type: **External** (allows any Google account, not just your org).
- Fill in:
  - App name: `Ikaro` (staging: `Ikaro Staging`)
  - User support email: your email
  - Developer contact email: your email
- Scopes: click **Add or remove scopes** → add:
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
- Test users (staging only): add the email addresses of developers who will test login.
- Click **Save and Continue** through all steps.

> **Publishing status:** Leave as **Testing** for staging (only test users can log in). Set to **In production** for the production project after your app is ready to launch (requires a brief Google review — typically 1–3 days for apps using only the above basic scopes).

**3. Create the OAuth 2.0 Client ID**
- Click **Create Credentials → OAuth client ID**.
- Application type: **Web application**.
- Name: `Ikaro Web` (staging: `Ikaro Web Staging`).
- **Authorised JavaScript origins** — add:
  ```
  # Staging
  https://ikaro-web-staging-<hash>-uc.a.run.app   ← Cloud Run staging URL (from terraform output web_url)

  # Production
  https://<ikaro-domain>
  ```
- **Authorised redirect URIs** — add all of the following:
  ```
  # Local development
  http://localhost:3002/auth/google/callback

  # Staging (BFF Cloud Run URL — from terraform output bff_url)
  https://ikaro-bff-staging-<hash>-uc.a.run.app/auth/google/callback

  # Production
  https://bff.<ikaro-domain>/auth/google/callback
  ```
- Click **Create**.

**4. Copy the credentials**
Google shows a popup with your **Client ID** and **Client Secret**. Copy both — you will not see the secret again (you can regenerate it if needed).

**5. Add to Secret Manager**

```bash
# ── Staging credentials ───────────────────────────────────────────────────────
gcloud secrets versions add google-oauth-client-id \
  --data-file=- --project=ikaro-staging <<< "<staging-client-id>"

gcloud secrets versions add google-oauth-client-secret \
  --data-file=- --project=ikaro-staging <<< "<staging-client-secret>"

# ── Production credentials ────────────────────────────────────────────────────
gcloud secrets versions add google-oauth-client-id \
  --data-file=- --project=ikaro-prod <<< "<prod-client-id>"

gcloud secrets versions add google-oauth-client-secret \
  --data-file=- --project=ikaro-prod <<< "<prod-client-secret>"
```

**6. Add the callback URL to `.env.local` for local development**

```bash
GOOGLE_CLIENT_ID=<your-staging-or-local-client-id>
GOOGLE_CLIENT_SECRET=<your-staging-or-local-client-secret>
GOOGLE_CALLBACK_URL=http://localhost:3002/auth/google/callback
```

> **Tip for local dev:** You can reuse the staging OAuth client for local development — just make sure `http://localhost:3002/auth/google/callback` is in the authorised redirect URIs list. No need to create a third client.

---

### 10. Bootstrap Secrets in Secret Manager

Run **after** Terraform has created the Secret Manager resources (first `terraform apply`) **and after** completing Step 9 above:

```bash
# Staging
# DB passwords for the two provisioned roles (used by init-db.sh in the migration pipeline)
gcloud secrets versions add db-migrator-password --data-file=- --project=ikaro-staging <<< \
  "$(openssl rand -hex 16)"
gcloud secrets versions add db-app-password --data-file=- --project=ikaro-staging <<< \
  "$(openssl rand -hex 16)"

gcloud secrets versions add jwt-secret --data-file=- --project=ikaro-staging <<< \
  "$(openssl rand -base64 64)"
# google-oauth-client-id and google-oauth-client-secret were added in Step 9
gcloud secrets versions add email-api-key --data-file=- --project=ikaro-staging <<< \
  "<your-sendgrid-api-key>"

# Repeat for ikaro-prod with production values
```

**JWT secret requirements:** Must be at least 64 characters of random data. The `openssl rand -base64 64` command above generates a cryptographically secure value. Store it nowhere else — Secret Manager is the single source of truth.

**DB secrets:** `db-migrator-password` is used only by the migration pipeline (CI step 1 runs `docker/init-db.sh` then `pnpm db:migrate`). `db-app-password` is injected into Cloud Run as an env var (`DB_PASSWORD`). Neither is the same as the Postgres superuser password managed by Cloud SQL internally.

---

## Terraform Structure

```
infrastructure/terraform/
├── backend.tf          ← GCS remote state
├── variables.tf        ← All input variables
├── outputs.tf          ← Exported values (URLs, IPs)
├── network.tf          ← VPC, subnet, firewall, VPC connector
├── registry.tf         ← Google Artifact Registry
├── database.tf         ← Cloud SQL instance + DB + users
├── secrets.tf          ← Secret Manager resources
├── pubsub.tf           ← Topics + subscriptions + dead letter
├── storage.tf          ← GCS bucket for media
├── iam.tf              ← Service accounts + bindings
├── cloudrun.tf         ← Cloud Run services
├── observability.tf    ← GCE VM + disk + firewall (prod only)
├── staging.tfvars      ← Staging-specific values
└── prod.tfvars         ← Production-specific values
```

---

## Terraform Files

### `backend.tf`

```hcl
terraform {
  required_version = ">= 1.8"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "ikaro-tfstate"
    # prefix is set via -backend-config in CI and locally
  }
}

provider "google" {
  project = var.gcp_project
  region  = var.region
}
```

### `variables.tf`

```hcl
variable "gcp_project"   { type = string }
variable "region"        { type = string  default = "us-central1" }
variable "environment"   { type = string  description = "staging | prod" }

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier"
  # staging: db-f1-micro | prod: db-n1-standard-1
}

variable "backend_min_instances"  { type = number  default = 0 }
variable "backend_max_instances"  { type = number  default = 10 }
variable "bff_min_instances"      { type = number  default = 0 }
variable "bff_max_instances"      { type = number  default = 10 }
variable "web_min_instances"      { type = number  default = 0 }
variable "web_max_instances"      { type = number  default = 20 }

variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "Developer IPs allowed to SSH into observability VM"
  default     = []
}

variable "create_observability_vm" {
  type    = bool
  default = false   # only true in prod
}

variable "observability_vm_ip" {
  type        = string
  default     = ""
  description = "Public IP of the GCE observability VM. Empty = no OTel export. Populated after first prod apply."
}
```

### `staging.tfvars`

```hcl
gcp_project             = "ikaro-staging"
environment             = "staging"
db_tier                 = "db-f1-micro"
backend_min_instances   = 0
backend_max_instances   = 5
bff_min_instances       = 0
bff_max_instances       = 5
web_min_instances       = 0
web_max_instances       = 10
create_observability_vm = false
allowed_ssh_cidrs       = []
# Set this to the prod observability VM IP after first prod apply.
# Copy from: terraform -chdir=infrastructure/terraform output observability_vm_ip
observability_vm_ip     = ""
```

### `prod.tfvars`

```hcl
gcp_project             = "ikaro-prod"
environment             = "prod"
db_tier                 = "db-n1-standard-1"
backend_min_instances   = 1
backend_max_instances   = 100
bff_min_instances       = 1
bff_max_instances       = 100
web_min_instances       = 1
web_max_instances       = 50
create_observability_vm = true
allowed_ssh_cidrs       = ["<developer-home-ip>/32"]
# Automatically set after first apply — copy from `terraform output observability_vm_ip`
observability_vm_ip     = ""
```

### `network.tf`

```hcl
resource "google_compute_network" "vpc" {
  name                    = "ikaro-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "ikaro-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

# Required for Cloud SQL private IP
resource "google_compute_global_address" "private_ip_range" {
  name          = "ikaro-private-ip-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# VPC Serverless Connector — allows Cloud Run to reach private VPC resources
resource "google_vpc_access_connector" "connector" {
  name          = "ikaro-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"    # must not overlap other ranges
  network       = google_compute_network.vpc.name
  min_throughput = 200
  max_throughput = 300
}

# Allow Cloud Run (via connector) to reach Cloud SQL
resource "google_compute_firewall" "allow_cloudrun_to_cloudsql" {
  name    = "allow-cloudrun-to-cloudsql"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }

  source_ranges = ["10.8.0.0/28"]   # VPC connector range
  target_tags   = ["cloud-sql"]
}
```

### `registry.tf`

```hcl
resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "ikaro-images"
  format        = "DOCKER"
  description   = "Ikaro Docker images"
}
```

### `database.tf`

```hcl
resource "google_sql_database_instance" "postgres" {
  name             = "ikaro-postgres"
  database_version = "POSTGRES_15"
  region           = var.region

  depends_on = [google_service_networking_connection.private_vpc_connection]

  settings {
    tier = var.db_tier

    ip_configuration {
      ipv4_enabled    = false   # no public IP
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day          = 7   # Sunday
      hour         = 3   # 03:00 UTC
      update_track = "stable"
    }
  }

  deletion_protection = var.environment == "prod"
}

resource "google_sql_database" "ikaro" {
  name     = "ikaro"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "backend" {
  name     = "ikaro-backend"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}
```

### `pubsub.tf`

```hcl
# Dead letter topic — receives messages that failed after max retries
resource "google_pubsub_topic" "dead_letter" {
  name = "ikaro-dead-letter"
}

# Main domain events topic
resource "google_pubsub_topic" "domain_events" {
  name = "ikaro-domain-events"

  message_retention_duration = "604800s"  # 7 days
}

# Loyalty consumer — only receives BookingCompleted
resource "google_pubsub_subscription" "loyalty_consumer" {
  name  = "ikaro-loyalty-consumer"
  topic = google_pubsub_topic.domain_events.name

  filter = "attributes.eventName = \"BookingCompleted\""

  ack_deadline_seconds = 30

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s"   # 5 minutes max between retries
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }

  expiration_policy {
    ttl = ""   # never expire
  }
}

# Notification consumer — receives all events
resource "google_pubsub_subscription" "notification_consumer" {
  name  = "ikaro-notification-consumer"
  topic = google_pubsub_topic.domain_events.name

  ack_deadline_seconds = 30

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }

  expiration_policy {
    ttl = ""
  }
}

# Dead letter subscription — for ops monitoring
resource "google_pubsub_subscription" "dead_letter_monitor" {
  name  = "ikaro-dead-letter-monitor"
  topic = google_pubsub_topic.dead_letter.name
  ack_deadline_seconds = 60
}
```

### `storage.tf`

```hcl
resource "google_storage_bucket" "media" {
  name          = "ikaro-media-${var.environment}"
  location      = "US"
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  cors {
    origin          = ["https://<ikaro-domain>", "https://staging.<ikaro-domain>"]
    method          = ["GET", "PUT", "POST"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    action { type = "Delete" }
    condition { age = 365 }   # delete files older than 1 year (adjust per business need)
  }
}

# Public bucket for hotsite marketing assets (logo, hero/CTA backgrounds, gallery,
# about photos — M12-S10). Deliberately separate from `media`: hotsite images are
# public by definition (no privacy requirement, unlike booking photos), so they get
# fixed, permanently-cacheable addresses instead of expiring read-signed URLs — this
# is what makes the hotsite manifest (`Cache-Control: public, max-age=300`, ISR,
# future Cloud CDN) safe to cache without risking broken images mid-window.
resource "google_storage_bucket" "hotsite_public" {
  name          = "ikaro-hotsite-public-${var.environment}"
  location      = "US"
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  cors {
    origin          = ["https://<ikaro-domain>", "https://staging.<ikaro-domain>"]
    method          = ["GET", "PUT", "POST"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }
}

# Public read access — these are marketing assets meant to be visible to anyone
resource "google_storage_bucket_iam_member" "hotsite_public_viewer" {
  bucket = google_storage_bucket.hotsite_public.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
```

### `secrets.tf`

```hcl
# Creates empty secrets — versions (actual values) are added via gcloud CLI (Day 0 §9)
locals {
  secret_names = [
    "database-url",
    "jwt-secret",
    "google-oauth-client-id",
    "google-oauth-client-secret",
    "email-api-key",
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secret_names)
  secret_id = each.key

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}
```

### `iam.tf`

```hcl
# Allow backend runtime SA to access each secret
resource "google_secret_manager_secret_iam_member" "backend_secret_access" {
  for_each  = toset(local.secret_names)
  secret_id = google_secret_manager_secret.secrets[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"
}

# Allow backend SA to pull from Artifact Registry
resource "google_artifact_registry_repository_iam_member" "backend_ar_reader" {
  location   = var.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"
}

# Allow backend SA to publish/subscribe to Pub/Sub
resource "google_pubsub_topic_iam_member" "backend_publisher" {
  topic  = google_pubsub_topic.domain_events.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription_iam_member" "backend_subscriber_loyalty" {
  subscription = google_pubsub_subscription.loyalty_consumer.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription_iam_member" "backend_subscriber_notification" {
  subscription = google_pubsub_subscription.notification_consumer.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"
}

# Allow backend SA to write to GCS media bucket
resource "google_storage_bucket_iam_member" "backend_media_writer" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"
}

# Allow backend SA to write to the public hotsite bucket (uploads + booking-photo
# copies — M12-S10). Public *read* access is granted separately to allUsers above;
# this grant is for the backend's write/copy path only.
resource "google_storage_bucket_iam_member" "backend_hotsite_public_writer" {
  bucket = google_storage_bucket.hotsite_public.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"
}

# ── Web SA — Next.js container has no GCP dependencies at runtime ─────────────
# No Pub/Sub, no Cloud SQL, no Secret Manager, no GCS needed.
# The SA is created so Cloud Run has a non-default identity; no roles are granted.
resource "google_service_account" "web" {
  account_id   = "ikaro-web"
  display_name = "Ikaro Web (Next.js) Runtime"
  project      = var.gcp_project
}

# Allow web SA to pull from prod GAR (cross-project in staging)
resource "google_artifact_registry_repository_iam_member" "web_ar_reader" {
  provider   = google
  location   = "us-central1"
  repository = "ikaro-images"
  # Images always live in the prod project — grant reader from whichever project this is
  role   = "roles/artifactregistry.reader"
  member = "serviceAccount:ikaro-web@${var.gcp_project}.iam.gserviceaccount.com"
}
```

### `cloudrun.tf`

```hcl
locals {
  # Images always live in the PROD GAR — both staging and prod Cloud Run pull from here.
  # The prod deployer SA pushes; staging deployer SA has cross-project reader access (see Day 0 §5).
  image_base        = "us-central1-docker.pkg.dev/ikaro-prod/ikaro-images"
  placeholder_image = "us-docker.pkg.dev/cloudrun-samples/hello:latest"
}

resource "google_cloud_run_v2_service" "backend" {
  name     = "ikaro-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"  # not public — only BFF calls it

  template {
    service_account = "ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"

    scaling {
      min_instance_count = var.backend_min_instances
      max_instance_count = var.backend_max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = local.placeholder_image   # replaced by CI on each deploy

      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "SERVICE_NAME"
        value = "ikaro-backend"
      }

      # OTel: send traces/metrics to the observability VM (both staging and prod)
      # Leave empty in staging until the prod VM IP is known (see outputs.tf).
      dynamic "env" {
        for_each = var.observability_vm_ip != "" ? [1] : []
        content {
          name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
          value = "http://${var.observability_vm_ip}:4317"
        }
      }

      # Secrets injected at runtime
      dynamic "env" {
        for_each = toset(local.secret_names)
        content {
          name = upper(replace(env.value, "-", "_"))
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "bff" {
  name     = "ikaro-bff"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"   # public — receives frontend requests

  template {
    service_account = "ikaro-backend@${var.gcp_project}.iam.gserviceaccount.com"

    scaling {
      min_instance_count = var.bff_min_instances
      max_instance_count = var.bff_max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = local.placeholder_image

      resources {
        limits = { cpu = "1", memory = "256Mi" }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "BACKEND_INTERNAL_URL"
        value = "https://${google_cloud_run_v2_service.backend.uri}"
      }

      dynamic "env" {
        for_each = var.observability_vm_ip != "" ? [1] : []
        content {
          name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
          value = "http://${var.observability_vm_ip}:4317"
        }
      }
    }
  }
}

# Allow unauthenticated invocations on BFF (public API)
resource "google_cloud_run_v2_service_iam_member" "bff_public" {
  location = google_cloud_run_v2_service.bff.location
  name     = google_cloud_run_v2_service.bff.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "web" {
  name     = "ikaro-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    # Dedicated SA — Next.js needs no GCP permissions at runtime
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = var.web_min_instances
      max_instance_count = var.web_max_instances
    }

    containers {
      image = local.placeholder_image
      resources { limits = { cpu = "1", memory = "256Mi" } }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "NEXT_PUBLIC_BFF_URL"
        value = google_cloud_run_v2_service.bff.uri
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
```

### `domainmapping.tf`

Cloud Run provides built-in TLS and custom domain mapping — no Load Balancer needed for MVP (~$18/month saved). Domain ownership must be verified in [Google Search Console](https://search.google.com/search-console) before `terraform apply` will succeed.

**Pre-requisite (one-time, manual):**
1. Go to [search.google.com/search-console](https://search.google.com/search-console) → Add property → enter `<ikaro-domain>` → verify via DNS TXT record.
2. Repeat for `bff.<ikaro-domain>` (add as a URL-prefix property or verify the root domain).
3. After verification, run `terraform apply` — Google will provision a managed SSL certificate automatically.

```hcl
# domainmapping.tf — production only (staging uses the auto-generated .run.app URLs)

resource "google_cloud_run_domain_mapping" "web" {
  count    = var.environment == "prod" ? 1 : 0
  location = var.region
  name     = "<ikaro-domain>"

  metadata { namespace = var.gcp_project }
  spec     { route_name = google_cloud_run_v2_service.web.name }
}

resource "google_cloud_run_domain_mapping" "bff" {
  count    = var.environment == "prod" ? 1 : 0
  location = var.region
  name     = "bff.<ikaro-domain>"

  metadata { namespace = var.gcp_project }
  spec     { route_name = google_cloud_run_v2_service.bff.name }
}
```

After `terraform apply`, run:
```bash
# Get the DNS records to configure in your domain registrar
gcloud run domain-mappings describe --domain=<ikaro-domain> --region=us-central1 --project=ikaro-prod
gcloud run domain-mappings describe --domain=bff.<ikaro-domain> --region=us-central1 --project=ikaro-prod
```
Point the CNAME/A records at your registrar to the values returned. SSL certificate provisioning takes 10–20 minutes after DNS propagates.

### `outputs.tf`

```hcl
output "backend_url"     { value = google_cloud_run_v2_service.backend.uri }
output "bff_url"         { value = google_cloud_run_v2_service.bff.uri }
output "web_url"         { value = google_cloud_run_v2_service.web.uri }
output "db_private_ip"   { value = google_sql_database_instance.postgres.private_ip_address }
output "media_bucket"    { value = google_storage_bucket.media.name }
output "hotsite_public_bucket" { value = google_storage_bucket.hotsite_public.name }
output "artifact_repo"   { value = google_artifact_registry_repository.images.name }
output "domain_events_topic" { value = google_pubsub_topic.domain_events.name }

output "observability_vm_ip" {
  description = "Public IP of the GCE observability VM. Add to GitHub Secret OBSERVABILITY_VM_IP and to staging.tfvars observability_vm_ip."
  value       = var.create_observability_vm ? google_compute_instance.observability[0].network_interface[0].access_config[0].nat_ip : null
}
```

---

## Cron Jobs (Cloud Scheduler)

### Why `@nestjs/schedule` alone is not enough on Cloud Run

NestJS's `@Cron()` decorator (`@nestjs/schedule`) works fine on a single long-running server. Cloud Run is different:

- **Scale-to-zero:** When `min_instances = 0` (staging), the container is shut down after inactivity. A cron that fires at 06:00 may find no running instance. The OS-level timer never fires.
- **Multiple instances:** When `min_instances >= 1` and traffic causes 3 instances to run, all 3 will fire the same cron simultaneously — potentially sending 3× the emails.

**Solution:** Use **GCP Cloud Scheduler** to send an authenticated HTTP POST to a `/cron/:job` endpoint on the backend every time a cron should fire. Cloud Run spins up an instance on demand to handle the request. A single Cloud Scheduler job = a single guaranteed invocation.

### Authentication (Cloud Scheduler → Cloud Run)

Cloud Scheduler authenticates to Cloud Run using an **OIDC token** scoped to the backend's service URL. The backend verifies the token using a NestJS guard before executing any cron logic.

```
Cloud Scheduler
    │  POST /cron/reminders   (every 30 min)
    │  Authorization: Bearer <OIDC token signed by scheduler-invoker SA>
    ▼
Cloud Run (ikaro-backend)
    │  CronAuthGuard validates: token issuer = Google, audience = backend URL
    │  If valid → execute cron handler
    │  If invalid → 401 Unauthorized
```

**NestJS guard (implement in `src/shared/cron/cron-auth.guard.ts`):**
```typescript
@Injectable()
export class CronAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) return false;

    // Verify the OIDC token issued by Google for this service's URL
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken: token,
      audience: process.env.BACKEND_SELF_URL, // e.g. https://ikaro-backend-xyz-uc.a.run.app
    });
    const payload = ticket.getPayload();
    // Verify the scheduler SA email is the expected invoker
    return payload?.email === `ikaro-scheduler@${process.env.GCP_PROJECT}.iam.gserviceaccount.com`;
  }
}
```

**Controller (implement in `src/shared/cron/cron.controller.ts`):**
```typescript
@Controller('cron')
@UseGuards(CronAuthGuard)
export class CronController {
  constructor(
    private reminderJob: BookingReminderJob,
    private loyaltyExpiryJob: LoyaltyExpiryJob,
    private adminScheduleJob: AdminScheduleReminderJob,
  ) {}

  // Fires every 30 min — handler checks which tenants are at 06:00 local time
  @Post('reminders')
  async reminders() {
    await this.reminderJob.run();      // emits BookingReminderDue + BookingReminderDueToday
    await this.adminScheduleJob.run(); // emits AdminDailyScheduleReminder
    return { ok: true };
  }

  // Fires every Monday at 06:00 UTC — loyalty expiry warnings
  @Post('loyalty-expiry')
  async loyaltyExpiry() {
    await this.loyaltyExpiryJob.run(); // emits PointsExpiringSoon per tenant
    return { ok: true };
  }
}
```

> **"6 AM per tenant" logic lives in the handler, not in Cloud Scheduler.** Cloud Scheduler fires the `/cron/reminders` endpoint every 30 minutes (UTC). The `BookingReminderJob.run()` queries the `tenants` table, converts the current UTC time to each tenant's local timezone (`settings.businessHours.timezone`), and only processes tenants whose local time is between 06:00 and 06:30. This guarantees each tenant gets exactly one reminder per day regardless of timezone.

### Terraform — `scheduler.tf`

```hcl
# Service account used by Cloud Scheduler to invoke Cloud Run
resource "google_service_account" "scheduler" {
  account_id   = "ikaro-scheduler"
  display_name = "Ikaro Cloud Scheduler Invoker"
  project      = var.gcp_project
}

# Allow scheduler SA to invoke the backend Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "scheduler_backend_invoker" {
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# ── Job 1: Booking & admin reminders — every 30 min ─────────────────────────
resource "google_cloud_scheduler_job" "reminders" {
  name      = "ikaro-reminders"
  region    = var.region
  project   = var.gcp_project
  schedule  = "*/30 * * * *"   # every 30 minutes, all day
  time_zone = "UTC"

  http_target {
    uri         = "${google_cloud_run_v2_service.backend.uri}/cron/reminders"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.backend.uri
    }
  }

  retry_config {
    retry_count          = 3
    min_backoff_duration = "5s"
    max_backoff_duration = "60s"
  }
}

# ── Job 2: Loyalty expiry warnings — every Monday at 06:00 UTC ──────────────
resource "google_cloud_scheduler_job" "loyalty_expiry" {
  name      = "ikaro-loyalty-expiry"
  region    = var.region
  project   = var.gcp_project
  schedule  = "0 6 * * 1"   # Monday 06:00 UTC
  time_zone = "UTC"

  http_target {
    uri         = "${google_cloud_run_v2_service.backend.uri}/cron/loyalty-expiry"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.backend.uri
    }
  }

  retry_config {
    retry_count          = 3
    min_backoff_duration = "5s"
    max_backoff_duration = "60s"
  }
}
```

> **Cost:** Cloud Scheduler charges **$0.10 per job per month** after the first 3 free jobs. Both jobs together = **$0.20/month**. Negligible.

### Enable the API (add to Day 0 §3)

```bash
gcloud services enable cloudscheduler.googleapis.com --project=$PROJECT
```

Add `cloudscheduler.googleapis.com` to the `gcloud services enable` loop in **Day 0 §3** above.

### Local development

Cloud Scheduler does not run locally. To test cron handlers during development, call the endpoint directly:

```bash
# Simulate a cron trigger (no auth required on localhost)
curl -X POST http://localhost:3001/cron/reminders
curl -X POST http://localhost:3001/cron/loyalty-expiry
```

The `CronAuthGuard` must be disabled (or bypassed via an env flag) when `NODE_ENV=development`:
```typescript
async canActivate(ctx: ExecutionContext): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') return true; // skip auth locally
  // ... OIDC verification
}
```

---

## Local Development Environment

### Prerequisites

```bash
# Install tools
brew install docker docker-compose pnpm node   # macOS
# or: apt install docker.io docker-compose nodejs npm && npm install -g pnpm  # Ubuntu

# Verify
docker --version          # >= 24
docker-compose --version  # >= 2
node --version            # >= 20
pnpm --version            # >= 9
```

### Initial Setup (first time)

```bash
# 1. Clone the repo
git clone https://github.com/<org>/ikaro.git
cd ikaro

# 2. Install dependencies
pnpm install

# 3. Copy environment templates
cp apps/backend/.env.example apps/backend/.env
cp apps/bff/.env.example apps/bff/.env

# 4. Fill in Google OAuth credentials in apps/bff/.env (see Day 0 §9)
# All other values work as-is for local dev

# 5. Start infrastructure services (DB + Pub/Sub + storage + email)
# On first start, docker creates ikaro_migrator + ikaro_app via init-db.sh
pnpm infra:up

# 6. Run all migrations (creates schemas + tables, grants DML to ikaro_app)
pnpm db:migrate

# 7. Start all services in development mode
pnpm dev
```

### pnpm Scripts

```json
// package.json (root)
{
  "scripts": {
    "dev":                "pnpm -r --parallel run dev",
    "infra:up":           "docker-compose -f docker/docker-compose.yml up -d && pnpm infra:init-pubsub",
    "infra:down":         "docker-compose -f docker/docker-compose.yml down",
    "infra:logs":         "docker-compose -f docker/docker-compose.yml logs -f",
    "infra:init-pubsub":  "bash docker/pubsub-init.sh",
    "obs:up":             "docker-compose -f docker/docker-compose.observability.yml up -d",
    "obs:down":           "docker-compose -f docker/docker-compose.observability.yml down",
    "obs:logs":           "docker-compose -f docker/docker-compose.observability.yml logs -f",
    "db:migrate":         "pnpm --filter backend migration:run",
    "db:revert":          "pnpm --filter backend migration:revert",
    "db:reset":           "pnpm infra:down && docker volume rm ikaro_postgres_data && pnpm infra:up && pnpm db:migrate",
    "test":               "pnpm -r run test",
    "lint":               "pnpm -r run lint",
    "type-check":         "pnpm -r run type-check"
  }
}
```

### Main Docker Compose

**File:** `docker/docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: ikaro-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: ikaro
      POSTGRES_USER: postgres       # superuser used only to run initdb.d scripts
      POSTGRES_PASSWORD: postgres
      DB_MIGRATOR_PASSWORD: ${DB_MIGRATOR_PASSWORD:-ikaro_migrator}
      DB_APP_PASSWORD: ${DB_APP_PASSWORD:-ikaro_app}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db.sh:/docker-entrypoint-initdb.d/init-db.sh:ro  # creates ikaro_migrator + ikaro_app
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d ikaro"]
      interval: 5s
      timeout: 5s
      retries: 10

  pubsub-emulator:
    image: gcr.io/google.com/cloudsdktool/cloud-sdk:latest
    container_name: ikaro-pubsub
    command: >
      gcloud beta emulators pubsub start
      --host-port=0.0.0.0:8085
      --project=ikaro-local
    ports:
      - "8085:8085"

  storage-emulator:
    image: fsouza/fake-gcs-server:latest
    container_name: ikaro-gcs
    ports:
      - "4443:4443"
    command: -scheme http -port 4443 -backend memory -external-url http://localhost:4443
    volumes:
      - storage-data:/data

  mailhog:
    image: mailhog/mailhog:v1.0.1
    container_name: ikaro-mail
    ports:
      - "1025:1025"    # SMTP — app sends emails here
      - "8025:8025"    # Web UI — view sent emails at http://localhost:8025

volumes:
  postgres-data:
  storage-data:
```

### Database Users

Ikaro uses two PostgreSQL roles with different privilege levels:

| Role | Privileges | Used by |
|---|---|---|
| `ikaro_migrator` | `CREATE`/`ALTER`/`DROP` (DDL) | `pnpm db:migrate` · CI pipeline · `docker/init-db.sh` |
| `ikaro_app` | `SELECT`/`INSERT`/`UPDATE`/`DELETE` (DML) | Running backend service |

This separation ensures a compromised app process cannot alter or drop the schema.

**Provisioning script:** `docker/init-db.sh` — creates both roles with passwords from environment variables. Run once before the first migration.

- **docker-compose:** the script is mounted in `initdb.d` and runs automatically on the first container start.
- **Tests:** `integration-global-setup.ts` issues the same SQL via `process.env` before running migrations.
- **Production/CI:** execute `docker/init-db.sh` (or equivalent SQL) as step 1 of the migration pipeline.

```bash
# docker/init-db.sh — reads DB_MIGRATOR_PASSWORD / DB_APP_PASSWORD from the environment.
# Falls back to 'ikaro_migrator' / 'ikaro_app' when not set (always the case locally).
# Production CI passes real secrets as env vars before running the script.
```

**Schema creation and DML grants** are handled by the first TypeORM migration (`BootstrapSchemas1700000000000`), which runs as `ikaro_migrator`. It creates all 6 schemas and sets up `ALTER DEFAULT PRIVILEGES` so every future table automatically grants DML to `ikaro_app`.

---

### Pub/Sub Emulator Initialisation Script

The GCP Pub/Sub emulator starts with no topics or subscriptions. The app expects the topic and both subscriptions to exist before it starts consuming events. `pnpm infra:up` calls this script automatically after Docker Compose starts.

**File:** `docker/pubsub-init.sh`

```bash
#!/bin/bash
# Creates topics and subscriptions in the local Pub/Sub emulator.
# Safe to run multiple times — uses PUT (idempotent).

set -euo pipefail

EMULATOR="localhost:8085"
PROJECT="ikaro-local"
BASE="http://${EMULATOR}/v1/projects/${PROJECT}"

# Wait for the emulator to be ready
echo "Waiting for Pub/Sub emulator..."
until curl -sf "http://${EMULATOR}" > /dev/null 2>&1; do
  sleep 1
done
echo "Emulator ready."

# Create topic
curl -sf -X PUT "${BASE}/topics/ikaro-domain-events" \
  -H "Content-Type: application/json" -d '{}' > /dev/null
echo "  topic: ikaro-domain-events"

# Dead-letter topic
curl -sf -X PUT "${BASE}/topics/ikaro-dead-letter" \
  -H "Content-Type: application/json" -d '{}' > /dev/null
echo "  topic: ikaro-dead-letter"

# Loyalty subscription — filtered to BookingCompleted only
curl -sf -X PUT "${BASE}/subscriptions/ikaro-loyalty-consumer" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "projects/ikaro-local/topics/ikaro-domain-events",
    "ackDeadlineSeconds": 30
  }' > /dev/null
echo "  subscription: ikaro-loyalty-consumer"

# Note: the emulator does not support Pub/Sub attribute filters.
# The loyalty consumer handler filters by eventName in application code locally.

# Notification subscription — all events
curl -sf -X PUT "${BASE}/subscriptions/ikaro-notification-consumer" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "projects/ikaro-local/topics/ikaro-domain-events",
    "ackDeadlineSeconds": 30
  }' > /dev/null
echo "  subscription: ikaro-notification-consumer"

# Dead-letter monitor subscription
curl -sf -X PUT "${BASE}/subscriptions/ikaro-dead-letter-monitor" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "projects/ikaro-local/topics/ikaro-dead-letter",
    "ackDeadlineSeconds": 60
  }' > /dev/null
echo "  subscription: ikaro-dead-letter-monitor"

echo "Pub/Sub emulator initialised."
```

> **Emulator filter note:** The GCP Pub/Sub emulator does not support subscription-level attribute filters (`filter` field). In production, the `ikaro-loyalty-consumer` subscription filters to `eventName = "BookingCompleted"` at the infrastructure level. Locally, the Loyalty event consumer handler checks `event.eventName === 'BookingCompleted'` in code and ignores all other events. The production behaviour is identical — the filter just moves from infrastructure to application layer for local dev.

---

### Environment Variables

**File:** `apps/backend/.env.example`

```bash
NODE_ENV=development
PORT=3001

# PostgreSQL — app runtime user (DML only: SELECT/INSERT/UPDATE/DELETE)
DB_HOST=localhost
DB_PORT=5432
DB_USER=ikaro_app
DB_PASSWORD=ikaro_app
DB_NAME=ikaro

# PostgreSQL — migration user (DDL; used only by pnpm db:migrate, not app startup)
DB_MIGRATOR_USER=ikaro_migrator
DB_MIGRATOR_PASSWORD=ikaro_migrator

# JWT — must be at least 32 characters
JWT_SECRET=change-me-to-a-random-64-char-string-in-production-environments

# ... (see apps/backend/.env.example for full list)
```

**File:** `apps/backend/.env` / `apps/bff/.env` (gitignored — developer creates from each app's `.env.example`)

### Local Service Ports

| Service | Port | URL |
|---|---|---|
| Backend (NestJS) | 3001 | http://localhost:3001 |
| BFF (NestJS) | 3002 | http://localhost:3002 |
| Web (Next.js) | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | postgresql://ikaro:password@localhost:5432/ikaro |
| Pub/Sub Emulator | 8085 | localhost:8085 |
| Storage Emulator | 4443 | http://localhost:4443 |
| MailHog SMTP | 1025 | localhost:1025 |
| MailHog Web | 8025 | http://localhost:8025 |
| Grafana (optional) | 3010 | http://localhost:3010 |
| Prometheus (optional) | 9090 | http://localhost:9090 |
| Loki (optional) | 3100 | http://localhost:3100 |

> **Note:** The observability stack and the Next.js dev server run on separate ports (Grafana: 3010, Next.js: 3000). Both can run simultaneously without conflict.

---

## First `terraform apply` (per environment)

```bash
cd infrastructure/terraform

# Staging
terraform workspace select staging
terraform init -backend-config="bucket=ikaro-tfstate" -backend-config="prefix=staging"
terraform plan -var-file="staging.tfvars" -out=tfplan
terraform apply tfplan

# Production
terraform workspace select prod
terraform init -backend-config="bucket=ikaro-tfstate" -backend-config="prefix=prod"
terraform plan -var-file="prod.tfvars" -out=tfplan
terraform apply tfplan
```

After the first apply, complete **Day 0 §9** (populate secrets).

---

## CI/CD Integration

The `deploy-infra.yml` workflow (see `docs/09-CI_CD_PIPELINE.md`) handles Terraform in CI. The image push step pushes to **Google Artifact Registry** (not GHCR):

```
Image path: us-central1-docker.pkg.dev/<gcp-project>/ikaro-images/ikaro-backend:sha-<commit>
```

Cloud Run deploys reference this GAR path. No GHCR authentication needed at runtime.

---

## Checklist: New Developer Onboarding

```
[ ] Install: docker, docker-compose, node >= 20, pnpm >= 9
[ ] Clone repo: git clone ...
[ ] Copy env: cp apps/backend/.env.example apps/backend/.env && cp apps/bff/.env.example apps/bff/.env
[ ] Get Google OAuth credentials (see Day 0 §9 — reuse staging client for local dev)
[ ] Fill in apps/bff/.env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (from Google Console), JWT_SECRET (any 64-char random string locally)
[ ] Start infra: pnpm infra:up   (starts PostgreSQL, Pub/Sub emulator, GCS emulator, MailHog)
      → On first start, postgres auto-runs docker/init-db.sh which creates ikaro_migrator + ikaro_app roles
[ ] Run migrations: pnpm db:migrate   (creates all schemas, tables, and DML grants)
[ ] Start apps: pnpm dev
[ ] Open browser: http://localhost:3000 (hotsite / dashboard)
[ ] Test OAuth: click "Login with Google" — should redirect to Google and back
[ ] View emails: http://localhost:8025 (MailHog — catches all outbound email)
[ ] Optional — start observability: pnpm obs:up, then http://localhost:9090 (Prometheus) / http://localhost:3010 (Grafana)
[ ] Run tests: pnpm test
[ ] Run linting: pnpm lint
```

**Total setup time from zero: ~10 minutes.**
