locals {
  service_accounts = {
    backend        = "Ikaro backend runtime SA (${var.environment})"
    bff            = "Ikaro BFF runtime SA (${var.environment})"
    web            = "Ikaro web runtime SA (${var.environment})"
    pubsub_invoker = "Pub/Sub push OIDC identity (${var.environment})"
    migrate        = "Ikaro migration Cloud Run Job SA (${var.environment})"
  }

  project_roles = {
    backend_cloudsql_client          = { role = "roles/cloudsql.client", principal = "backend" }
    migrate_cloudsql_client          = { role = "roles/cloudsql.client", principal = "migrate" }
    backend_cloudtrace_agent         = { role = "roles/cloudtrace.agent", principal = "backend" }
    backend_monitoring_metric_writer = { role = "roles/monitoring.metricWriter", principal = "backend" }
    bff_cloudtrace_agent             = { role = "roles/cloudtrace.agent", principal = "bff" }
    bff_monitoring_metric_writer     = { role = "roles/monitoring.metricWriter", principal = "bff" }
  }

  secret_accessors_base = {
    # openrouter-api-key/anthropic-api-key/openai-api-key (M19-S02): granted now since the
    # secret containers and this SA both already exist — harmless ahead of S03's Anthropic/OpenAI
    # adapters landing, same reasoning as cloudflare-api-token below being granted ahead of S40.
    # openrouter-management-api-key (M19-S08 follow-up): the container landed in PR #370 (envs/*
    # only, per TD39 — this grant couldn't be in that same PR); granting it here unblocks the
    # Cloud Run revision update PR #370's own apply left failing on Permission denied.
    backend = ["db-password", "jwt-secret", "internal-api-key", "platform-admin-key", "hotsite-revalidate-secret", "brevo-smtp-key", "openrouter-api-key", "anthropic-api-key", "openai-api-key", "openrouter-management-api-key"]
    # TD38: web-internal-key is the shared secret checked by WebOnlyGuard (bff reads it to
    # verify) and sent by web on every BFF call (web reads it to send) — both sides need it.
    bff     = ["jwt-secret", "internal-api-key", "google-oauth-client-id", "google-oauth-client-secret", "web-internal-key"]
    web     = ["jwt-secret", "hotsite-revalidate-secret", "web-internal-key"]
    migrate = ["db-migrator-password"]
  }

  secret_accessors = var.environment == "prod" ? merge(local.secret_accessors_base, { backend = concat(local.secret_accessors_base.backend, ["cloudflare-api-token"]) }) : local.secret_accessors_base
  secret_bindings  = merge([for principal, secrets in local.secret_accessors : { for secret in secrets : "${principal}-${secret}" => { principal = principal, secret = secret } }]...)
}

resource "google_service_account" "runtime" {
  for_each = local.service_accounts

  account_id   = "ikaro-${replace(each.key, "_", "-")}"
  display_name = each.value
  project      = var.project_id
}

resource "google_project_iam_member" "runtime" {
  for_each = local.project_roles

  project = var.project_id
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.runtime[each.value.principal].email}"
}

resource "google_service_account_iam_member" "backend_token_creator_self" {
  service_account_id = google_service_account.runtime["backend"].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime["backend"].email}"
}

# Normal Terraform still attaches these identities to the Cloud Run services,
# migration Job, and Pub/Sub push subscriptions it owns. Keep actAs scoped to
# these runtime identities; it must never apply to a Foundation identity.
resource "google_service_account_iam_member" "normal_deployer_runtime_service_account_user" {
  for_each = google_service_account.runtime

  service_account_id = each.value.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:ikaro-tf-deployer@${var.project_id}.iam.gserviceaccount.com"
}

resource "google_storage_bucket_iam_member" "backend_object_admin" {
  for_each = { uploads = var.uploads_bucket_name, public = var.public_bucket_name }

  bucket = each.value
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime["backend"].email}"
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each = local.secret_bindings

  secret_id = var.secret_ids[each.value.secret]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value.principal].email}"
}
