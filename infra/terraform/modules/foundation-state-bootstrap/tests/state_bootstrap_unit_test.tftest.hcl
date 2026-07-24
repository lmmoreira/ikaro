mock_provider "google" {}

variables {
  project_id        = "ikaro-prod"
  state_bucket_name = "ikaro-tfstate"
}

run "grants_only_the_two_exact_foundation_state_prefixes" {
  command = plan

  assert {
    condition     = length(google_project_iam_member.deployer_foundation_state_bootstrap) == 2
    error_message = "TD34 bootstrap must grant exactly the staging and production deployers."
  }

  assert {
    condition     = google_project_iam_member.deployer_foundation_state_bootstrap["staging"].member == "serviceAccount:ikaro-tf-deployer@ikaro-staging.iam.gserviceaccount.com"
    error_message = "Only the existing staging deployer may initialize staging foundation state."
  }

  assert {
    condition     = google_project_iam_member.deployer_foundation_state_bootstrap["prod"].member == "serviceAccount:ikaro-tf-deployer@ikaro-prod.iam.gserviceaccount.com"
    error_message = "Only the existing production deployer may initialize production foundation state."
  }

  assert {
    condition     = alltrue([for grant in google_project_iam_member.deployer_foundation_state_bootstrap : grant.role == "roles/storage.objectAdmin"])
    error_message = "The bootstrap needs only state-object administration, never bucket or project administration."
  }

  assert {
    condition     = google_project_iam_member.deployer_foundation_state_bootstrap["staging"].condition[0].expression == "resource.name.startsWith('projects/_/buckets/ikaro-tfstate/objects/foundation/staging/')"
    error_message = "Staging bootstrap access must be limited to foundation/staging."
  }

  assert {
    condition     = google_project_iam_member.deployer_foundation_state_bootstrap["prod"].condition[0].expression == "resource.name.startsWith('projects/_/buckets/ikaro-tfstate/objects/foundation/prod/')"
    error_message = "Production bootstrap access must be limited to foundation/prod."
  }
}

run "grants_bucket_iam_bootstrap_only_on_the_shared_state_bucket" {
  command = plan

  assert {
    condition     = length(google_project_iam_member.deployer_foundation_bucket_iam_bootstrap) == 2
    error_message = "TD34 bootstrap must grant bucket IAM administration only to the two existing deployers."
  }

  assert {
    condition     = alltrue([for grant in google_project_iam_member.deployer_foundation_bucket_iam_bootstrap : grant.role == "roles/storage.admin"])
    error_message = "Bucket-policy bootstrap needs storage administration only for the shared state bucket."
  }

  assert {
    condition     = google_project_iam_member.deployer_foundation_bucket_iam_bootstrap["staging"].member == "serviceAccount:ikaro-tf-deployer@ikaro-staging.iam.gserviceaccount.com"
    error_message = "Only the existing staging deployer may bootstrap foundation bucket IAM."
  }

  assert {
    condition     = google_project_iam_member.deployer_foundation_bucket_iam_bootstrap["prod"].member == "serviceAccount:ikaro-tf-deployer@ikaro-prod.iam.gserviceaccount.com"
    error_message = "Only the existing production deployer may bootstrap foundation bucket IAM."
  }

  assert {
    condition     = alltrue([for grant in google_project_iam_member.deployer_foundation_bucket_iam_bootstrap : grant.condition[0].expression == "resource.name == 'projects/_/buckets/ikaro-tfstate'"])
    error_message = "Bucket-policy bootstrap must be limited to the one shared Terraform state bucket."
  }
}
