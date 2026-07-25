mock_provider "google" {}

variables {
  project_id         = "ikaro-staging"
  public_bucket_name = "ikaro-public-staging"

  project_members = {
    admin_cloudsql_client = {
      role   = "roles/cloudsql.client"
      member = "user:admin@ikaro.online"
    }
    admin_cloudsql_instance_user = {
      role   = "roles/cloudsql.instanceUser"
      member = "user:admin@ikaro.online"
    }
  }

  artifact_registry_members = {
    staging_deployer_writer = {
      location   = "southamerica-east1"
      repository = "ikaro-registry"
      role       = "roles/artifactregistry.writer"
      member     = "serviceAccount:ikaro-app-deployer@ikaro-staging.iam.gserviceaccount.com"
    }
  }

  audit_log_types_by_service = {
    "cloudsql.googleapis.com"      = ["DATA_WRITE"]
    "iap.googleapis.com"           = ["ADMIN_READ", "DATA_READ", "DATA_WRITE"]
    "secretmanager.googleapis.com" = ["DATA_READ"]
  }
}

run "static_resource_iam_preserves_exact_reviewed_policies" {
  command = plan

  assert {
    condition     = google_storage_bucket_iam_member.public_viewer.bucket == "ikaro-public-staging" && google_storage_bucket_iam_member.public_viewer.role == "roles/storage.objectViewer" && google_storage_bucket_iam_member.public_viewer.member == "allUsers"
    error_message = "Foundation must preserve only the reviewed public object-viewer grant."
  }

  assert {
    condition     = length(google_project_iam_member.project_member) == 2 && alltrue([for binding in values(google_project_iam_member.project_member) : binding.member == "user:admin@ikaro.online" && contains(["roles/cloudsql.client", "roles/cloudsql.instanceUser"], binding.role)])
    error_message = "Foundation must preserve the two reviewed human Cloud SQL project bindings."
  }

  assert {
    condition     = google_artifact_registry_repository_iam_member.member["staging_deployer_writer"].project == "ikaro-staging" && google_artifact_registry_repository_iam_member.member["staging_deployer_writer"].repository == "ikaro-registry" && google_artifact_registry_repository_iam_member.member["staging_deployer_writer"].role == "roles/artifactregistry.writer" && google_artifact_registry_repository_iam_member.member["staging_deployer_writer"].member == "serviceAccount:ikaro-app-deployer@ikaro-staging.iam.gserviceaccount.com"
    error_message = "Foundation must scope Artifact Registry IAM to the reviewed repository and role."
  }

  assert {
    condition     = length(google_project_iam_audit_config.service) == 3 && toset([for config in values(google_project_iam_audit_config.service) : config.service]) == toset(["cloudsql.googleapis.com", "iap.googleapis.com", "secretmanager.googleapis.com"]) && toset([for config in google_project_iam_audit_config.service["cloudsql.googleapis.com"].audit_log_config : config.log_type]) == toset(["DATA_WRITE"]) && toset([for config in google_project_iam_audit_config.service["iap.googleapis.com"].audit_log_config : config.log_type]) == toset(["ADMIN_READ", "DATA_READ", "DATA_WRITE"]) && toset([for config in google_project_iam_audit_config.service["secretmanager.googleapis.com"].audit_log_config : config.log_type]) == toset(["DATA_READ"])
    error_message = "Foundation must retain exactly the reviewed relay audit-log types for Cloud SQL, IAP, and Secret Manager."
  }
}
