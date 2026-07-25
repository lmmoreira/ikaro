# Guards the repo naming/format and the cleanup-policy retention numbers this
# module's acceptance criteria depend on (M17-S15).

mock_provider "google" {}

variables {
  project_id  = "ikaro-prod"
  environment = "prod"
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
    condition     = length(google_artifact_registry_repository.ikaro.cleanup_policies) == 3
    error_message = "Expected exactly 3 cleanup policies (delete-old-tagged, delete-untagged, keep-recent-versions) — a KEEP policy alone never deletes anything, so losing delete-old-tagged silently regresses to retaining every tagged version forever (2026-07-18 discovery)."
  }

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
      p.action == "DELETE" && one(p.condition).tag_state == "TAGGED" && one(p.condition).older_than == "604800s"
    ])
    error_message = "Tagged versions must also have a DELETE policy after 7 days — a KEEP policy alone never deletes anything, so without this, every tagged version would be retained forever."
  }

  assert {
    condition = anytrue([
      for p in google_artifact_registry_repository.ikaro.cleanup_policies :
      p.action == "KEEP" && one(p.most_recent_versions).keep_count == 30
    ])
    error_message = "The 30 most recent versions per image must always be exempted from deletion (rollback safety floor — M17-S26 review finding, 2026-07-23: 5 was too tight against staging's per-merge push frequency)."
  }
}
