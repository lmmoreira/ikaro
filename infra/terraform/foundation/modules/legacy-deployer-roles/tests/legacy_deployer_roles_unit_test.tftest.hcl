mock_provider "google" {}

variables {
  project_id = "ikaro-staging"
  project_role_bindings = {
    service_account_admin = {
      role = "roles/iam.serviceAccountAdmin"
    }
    service_account_user = {
      role = "roles/iam.serviceAccountUser"
    }
    project_iam_admin = {
      role = "roles/resourcemanager.projectIamAdmin"
    }
    storage_admin_except_state = {
      role = "roles/storage.admin"
      condition = {
        title       = "exclude-shared-state-bucket"
        description = "Excludes the shared Terraform state bucket."
        expression  = "!resource.name.startsWith('projects/_/buckets/ikaro-tfstate')"
      }
    }
  }
}

run "adopts_only_the_explicit_legacy_roles" {
  command = plan

  assert {
    condition     = length(google_project_iam_member.normal_deployer_role) == 4 && alltrue([for key in keys(var.project_role_bindings) : contains(keys(google_project_iam_member.normal_deployer_role), key)])
    error_message = "Foundation must adopt exactly the explicit legacy normal-deployer role bindings."
  }

  assert {
    condition     = alltrue([for binding in values(google_project_iam_member.normal_deployer_role) : binding.member == "serviceAccount:ikaro-tf-deployer@ikaro-staging.iam.gserviceaccount.com"])
    error_message = "Legacy role adoption must target only the staging normal deployer."
  }

  assert {
    condition     = google_project_iam_member.normal_deployer_role["storage_admin_except_state"].condition[0].expression == "!resource.name.startsWith('projects/_/buckets/ikaro-tfstate')"
    error_message = "A conditional legacy role must preserve its exact IAM condition."
  }
}
