# modules/registry — single Artifact Registry Docker repo, instantiated
# only in envs/prod (D8): the same image SHA validated in staging is
# promoted to prod, so both envs' Cloud Run services pull from one place.

resource "google_artifact_registry_repository" "ikaro" {
  #checkov:skip=CKV_GCP_84:MVP accepts Google-managed encryption; CMEK adds Cloud KMS operational overhead (key rotation, IAM) with no compliance driver at this stage (no LGPD data touches image layers — booking/tenant PII lives in Cloud SQL, not container images)
  repository_id = "ikaro-registry"
  project       = var.project_id
  location      = var.region
  format        = "DOCKER"
  labels        = var.labels

  # Untagged versions (superseded digests with no tag pointing at them,
  # e.g. after a re-push under the same SHA never happens, or a manual
  # untag) are cleaned up after 7 days.
  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7 days
    }
  }

  # Per image (backend/bff/web/otel-collector are separate packages within
  # this one repo), keep only the 15 most recent tagged versions — bounds
  # storage cost while leaving enough history for a rollback.
  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"

    most_recent_versions {
      keep_count = 15
    }
  }
}

# Staging's app-deployer pushes the image that (once validated in staging)
# is promoted to prod by SHA — it needs write access to the shared,
# prod-hosted repo (D8). Cross-project: the member is a staging-project SA,
# the resource lives in prod.
resource "google_artifact_registry_repository_iam_member" "staging_deployer_writer" {
  project    = google_artifact_registry_repository.ikaro.project
  location   = google_artifact_registry_repository.ikaro.location
  repository = google_artifact_registry_repository.ikaro.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:ikaro-app-deployer@${var.staging_project_id}.iam.gserviceaccount.com"
}

# Cloud Run pulls container images using the project's built-in Cloud Run
# service agent, not the app's runtime service account (backend/bff/web,
# created later in S17) and not the deploying SA. Same-project pulls
# (prod's own Cloud Run reading this repo) are automatically permitted by
# Google once the API is enabled — only the cross-project case (staging
# Cloud Run reading a prod-hosted repo) needs an explicit grant.
resource "google_artifact_registry_repository_iam_member" "staging_service_agent_reader" {
  project    = google_artifact_registry_repository.ikaro.project
  location   = google_artifact_registry_repository.ikaro.location
  repository = google_artifact_registry_repository.ikaro.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:service-${var.staging_project_number}@serverless-robot-prod.iam.gserviceaccount.com"
}
