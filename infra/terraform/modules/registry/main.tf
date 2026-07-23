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

  # Tagged versions older than 7 days are deleted UNLESS they fall inside
  # the keep-recent-versions floor below — a KEEP policy only ever exempts
  # versions from a DELETE policy, it never deletes anything by itself, so
  # this DELETE policy is what actually bounds tagged-image growth (a
  # KEEP-only config would retain every tagged version forever — verified
  # against the google_artifact_registry_repository provider schema and
  # https://cloud.google.com/artifact-registry/docs/repositories/cleanup-policy-overview,
  # 2026-07-18 discovery).
  cleanup_policies {
    id     = "delete-old-tagged"
    action = "DELETE"

    condition {
      tag_state  = "TAGGED"
      older_than = "604800s" # 7 days
    }
  }

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
  # this one repo), always keep the most recent versions regardless of
  # age — the production digest plus rollback candidates.
  # most_recent_versions has no tag_state filter (provider/API limitation),
  # so this floor counts ANY version, tagged or untagged; a very recent
  # untagged version can therefore outlive the 7-day untagged rule above
  # until it ages out of this top-N-by-recency window — accepted, bounded
  # edge case, not indefinite retention.
  #
  # keep_count = 30, not 5 (cross-tool review finding, 2026-07-23): staging
  # pushes a new tagged version on every merge touching apps/**,
  # packages/**, or the lockfile (deploy-staging.yml's trigger — broad,
  # frequent for a trunk-based repo), independent of how often prod is
  # actually promoted. At keep_count=5, as few as 5 staging merges after a
  # promote could evict the exact image M17-S26's "thorough" rollback path
  # (re-run deploy-production.yml with the previous SHA) needs — the
  # workflow's own GAR-existence check would then fail with "image not
  # found." 30 gives real headroom for that gap without meaningful cost
  # (small container images, GAR storage is fractions of a cent per
  # version). Not a hard guarantee — docs/RUNBOOKS.md's rollback section
  # documents falling back to rollback-production.yml's traffic-shift path
  # if this is ever exhausted, since that path works off already-deployed
  # Cloud Run revisions and doesn't depend on registry retention at all.
  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"

    most_recent_versions {
      keep_count = 30
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

# Staging's tf-deployer manages modules/migrate-job's google_cloud_run_v2_job
# resource, whose container image is set out-of-band by deploy-staging.yml
# (gcloud run jobs update, not Terraform — see that module's own
# lifecycle.ignore_changes on the image field) to the prod-hosted registry.
# Discovered live (2026-07-23): even though Terraform never tries to change
# the image field itself, Cloud Run's jobs.patch API re-validates pull
# access on the job's CURRENT actual image for every update call — so the
# very first time apply-staging had to update that resource for any reason
# (here, correcting client/client_version drift left by deploy-staging.yml's
# own gcloud calls), it failed with a 403 on
# artifactregistry.repositories.downloadArtifacts. tf-deployer had never
# been granted any access to this cross-project repo before now.
resource "google_artifact_registry_repository_iam_member" "staging_tf_deployer_reader" {
  project    = google_artifact_registry_repository.ikaro.project
  location   = google_artifact_registry_repository.ikaro.location
  repository = google_artifact_registry_repository.ikaro.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:ikaro-tf-deployer@${var.staging_project_id}.iam.gserviceaccount.com"
}
