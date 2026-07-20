# modules/iam — runtime service accounts (least privilege, per service).
# Scope split (M17-S17 discovery, 2026-07-18): this module creates the SAs
# and every binding resolvable against resources that already exist (S14
# buckets, S16 secrets, project-level roles, self-grants). Bindings
# targeting resources created by later stories — run.invoker on a Cloud
# Run service (S18), pubsub.publisher on a topic (S19) — are NOT created
# here; those modules own them, referencing the SA emails this module
# outputs. 5 SAs as of M17-S20 (added the dedicated migrate-job identity).

resource "google_service_account" "backend" {
  account_id   = "ikaro-backend"
  display_name = "Ikaro backend runtime SA (${var.environment})"
  project      = var.project_id
}

resource "google_service_account" "bff" {
  account_id   = "ikaro-bff"
  display_name = "Ikaro BFF runtime SA (${var.environment})"
  project      = var.project_id
}

resource "google_service_account" "web" {
  account_id   = "ikaro-web"
  display_name = "Ikaro web runtime SA (${var.environment})"
  project      = var.project_id
}

# The identity Pub/Sub push mints OIDC tokens as (D2). Its only IAM
# binding — run.invoker on the backend service — is granted in S18, once
# that service exists; created here so S18/S19 have a stable principal to
# reference.
resource "google_service_account" "pubsub_invoker" {
  account_id   = "ikaro-pubsub-invoker"
  display_name = "Pub/Sub push OIDC identity (${var.environment})"
  project      = var.project_id
}

# Dedicated Cloud Run Job identity (M17-S20) — not a reuse of the backend
# runtime SA (story-discovery, 2026-07-20): the migrate Job only needs
# cloudsql.client + the db-migrator-password accessor, never backend's
# pubsub.publisher/storage.objectAdmin/self-signing grants.
resource "google_service_account" "migrate" {
  account_id   = "ikaro-migrate"
  display_name = "Ikaro migration Cloud Run Job SA (${var.environment})"
  project      = var.project_id
}

# --- Project-level roles (backend) ---

resource "google_project_iam_member" "backend_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# --- Project-level roles (migrate job) ---

resource "google_project_iam_member" "migrate_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrate.email}"
}

resource "google_project_iam_member" "backend_cloudtrace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_project_iam_member" "backend_monitoring_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# --- Project-level roles (bff) ---
# web gets neither: OTel covers backend + BFF only at launch (D9) — web's
# observability is Cloud Run's built-in metrics/logs, no active
# instrumentation to grant trace/metric-writer roles for.

resource "google_project_iam_member" "bff_cloudtrace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.bff.email}"
}

resource "google_project_iam_member" "bff_monitoring_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.bff.email}"
}

# --- Self-grant (backend signs its own V4 URLs — keyless, via IAM signBlob) ---

resource "google_service_account_iam_member" "backend_token_creator_self" {
  service_account_id = google_service_account.backend.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.backend.email}"
}

# --- Bucket grants (backend only — the app writes/reads both buckets) ---

resource "google_storage_bucket_iam_member" "backend_uploads_object_admin" {
  bucket = var.uploads_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_storage_bucket_iam_member" "backend_public_object_admin" {
  bucket = var.public_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

# --- Per-secret accessor bindings ---
# Hand-maintained mirror of the M17-S16 consumer table (Terraform can't
# read a Markdown table) — keep in sync when either changes. web excludes
# internal-api-key (confirmed 2026-07-18: InternalApiGuard is registered
# only in the backend and gates BFF->backend calls; web's revalidate route
# checks a different secret entirely).
locals {
  sa_emails = {
    backend = google_service_account.backend.email
    bff     = google_service_account.bff.email
    web     = google_service_account.web.email
    migrate = google_service_account.migrate.email
  }

  secret_accessors_base = {
    backend = ["db-password", "jwt-secret", "internal-api-key", "platform-admin-key", "hotsite-revalidate-secret", "brevo-smtp-key"]
    bff     = ["jwt-secret", "internal-api-key", "google-oauth-client-id", "google-oauth-client-secret"]
    web     = ["jwt-secret", "hotsite-revalidate-secret"]
    # Dedicated migrator credential (M17-S20) — never db-password, which is
    # the app runtime's DML-only role; db-migrator-password is the DDL-capable
    # ikaro_migrator role (docker/init-db.sh's local/CI split, carried into
    # cloud by S20).
    migrate = ["db-migrator-password"]
  }

  # cloudflare-api-token only exists in prod (S16) and only the backend
  # consumes it (S40 runtime, a future story) — granted now since the
  # secret container and this SA both already exist; harmless ahead of S40.
  secret_accessors = var.environment == "prod" ? merge(local.secret_accessors_base, {
    backend = concat(local.secret_accessors_base.backend, ["cloudflare-api-token"])
  }) : local.secret_accessors_base

  secret_accessor_bindings = merge([
    for sa, secrets in local.secret_accessors : {
      for secret in secrets : "${sa}-${secret}" => { sa = sa, secret = secret }
    }
  ]...)
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each = local.secret_accessor_bindings

  secret_id = var.secret_ids[each.value.secret]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.sa_emails[each.value.sa]}"
}
