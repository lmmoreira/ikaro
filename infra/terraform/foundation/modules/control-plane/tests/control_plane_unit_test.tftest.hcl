mock_provider "google" {}

variables {
  environment                           = "staging"
  github_environment                    = "staging-foundation"
  project_id                            = "ikaro-staging"
  state_bucket_name                     = "ikaro-tfstate"
  workload_identity_pool_project_number = "729809528251"
}

run "foundation_deployer_requires_main_and_its_own_environment" {
  command = plan

  assert {
    condition     = google_service_account.foundation_deployer.account_id == "ikaro-tf-foundation"
    error_message = "The foundation deployer must use the dedicated service account name."
  }

  assert {
    condition     = google_service_account_iam_member.foundation_deployer_wif.member == "principalSet://iam.googleapis.com/projects/729809528251/locations/global/workloadIdentityPools/github-pool/attribute.repo_ref_env/lmmoreira/ikaro@refs/heads/main@staging-foundation"
    error_message = "The foundation deployer WIF binding must require main and staging-foundation."
  }
}

run "foundation_planner_is_repo_scoped_and_state_is_prefix_scoped" {
  command = plan

  assert {
    condition     = google_service_account_iam_member.foundation_planner_wif.member == "principalSet://iam.googleapis.com/projects/729809528251/locations/global/workloadIdentityPools/github-pool/attribute.repository/lmmoreira/ikaro"
    error_message = "The read-only foundation planner must be repository-scoped for PR plans."
  }

  assert {
    condition     = google_storage_bucket_iam_member.foundation_deployer_state.condition[0].expression == "resource.name.startsWith('projects/_/buckets/ikaro-tfstate/objects/foundation/staging/')"
    error_message = "The foundation deployer must be restricted to its own state prefix."
  }

  assert {
    condition     = google_storage_bucket_iam_member.foundation_planner_lock.condition[0].expression == "resource.name == 'projects/_/buckets/ikaro-tfstate/objects/foundation/staging/default.tflock'"
    error_message = "The foundation planner must be able to mutate only its state lock."
  }
}
