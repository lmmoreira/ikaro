# Guards the repo naming/format, the cleanup-policy retention numbers this
# module's acceptance criteria depend on (M17-S15), and that the
# cross-project IAM grants target the Cloud Run service agent (the identity
# Cloud Run actually pulls images as) rather than a runtime service account.

mock_provider "google" {}

variables {
  project_id             = "ikaro-prod"
  environment            = "prod"
  staging_project_id     = "ikaro-staging"
  staging_project_number = "729809528251"
}

run "repository_is_docker_format_in_the_configured_region" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository.ikaro.repository_id == "ikaro-registry"
    error_message = "Repository must be named ikaro-registry."
  }

  assert {
    condition     = google_artifact_registry_repository.ikaro.format == "DOCKER"
    error_message = "Repository must be a DOCKER-format repo."
  }

  assert {
    condition     = google_artifact_registry_repository.ikaro.location == "southamerica-east1"
    error_message = "Repository must live in southamerica-east1."
  }
}

run "cleanup_policies_match_retention_rules" {
  command = plan

  assert {
    condition = anytrue([
      for p in google_artifact_registry_repository.ikaro.cleanup_policies :
      p.action == "DELETE" && one(p.condition).tag_state == "UNTAGGED" && one(p.condition).older_than == "604800s"
    ])
    error_message = "Untagged versions must be deleted after 7 days (604800s)."
  }

  assert {
    condition = anytrue([
      for p in google_artifact_registry_repository.ikaro.cleanup_policies :
      p.action == "KEEP" && one(p.most_recent_versions).keep_count == 15
    ])
    error_message = "The 15 most recent tagged versions per image must be kept."
  }
}

run "staging_writer_grant_targets_staging_app_deployer" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository_iam_member.staging_deployer_writer.role == "roles/artifactregistry.writer"
    error_message = "Staging's cross-project grant must be writer (it pushes the image later promoted to prod)."
  }

  assert {
    condition     = google_artifact_registry_repository_iam_member.staging_deployer_writer.member == "serviceAccount:ikaro-app-deployer@ikaro-staging.iam.gserviceaccount.com"
    error_message = "Writer grant must target staging's app-deployer SA."
  }
}

run "staging_reader_grant_targets_cloud_run_service_agent_not_a_runtime_sa" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository_iam_member.staging_service_agent_reader.role == "roles/artifactregistry.reader"
    error_message = "Staging's cross-project pull grant must be reader."
  }

  assert {
    condition     = google_artifact_registry_repository_iam_member.staging_service_agent_reader.member == "serviceAccount:service-729809528251@serverless-robot-prod.iam.gserviceaccount.com"
    error_message = "Reader grant must target staging's Cloud Run service agent (the identity that actually pulls images), not a custom runtime SA."
  }
}

run "iam_grants_are_cross_project_on_the_prod_repository" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository_iam_member.staging_deployer_writer.project == "ikaro-prod"
    error_message = "IAM member resources must be bound to the prod-hosted repository, not the staging project."
  }

  assert {
    condition     = google_artifact_registry_repository_iam_member.staging_service_agent_reader.project == "ikaro-prod"
    error_message = "IAM member resources must be bound to the prod-hosted repository, not the staging project."
  }
}
