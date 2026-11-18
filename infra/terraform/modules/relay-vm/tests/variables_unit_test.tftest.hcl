# command = plan + mock_provider only (M17 Wave 2 preamble): runs with no
# credentials, creates no resources, costs nothing.
#
# Run from the module directory:
#   terraform init && terraform test

mock_provider "google" {}

variables {
  project_id                     = "ikaro-test"
  environment                    = "staging"
  region                         = "southamerica-east1"
  zone                           = "southamerica-east1-a"
  subnet_id                      = "projects/ikaro-test/regions/southamerica-east1/subnetworks/ikaro-subnet-staging"
  network_id                     = "projects/ikaro-test/global/networks/ikaro-vpc-staging"
  operator_service_account_email = "ikaro-tf-foundation@ikaro-test.iam.gserviceaccount.com"
  iam_admin_user                 = "admin@ikaro.online"
  platform_admin_key_secret_id   = "projects/ikaro-test/secrets/platform-admin-key"
  internal_api_key_secret_id     = "projects/ikaro-test/secrets/internal-api-key"
  tenant_provision_script        = "#!/usr/bin/env bash\necho provision"
}

run "accepts_valid_environment_and_defaults" {
  command = plan

  assert {
    condition     = var.machine_type == "e2-micro"
    error_message = "machine_type must default to e2-micro."
  }

  assert {
    condition     = var.create == false
    error_message = "create must default to false — inert until deliberately toggled on."
  }
}

run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "production" # only "staging" and "prod" are valid
  }

  expect_failures = [
    var.environment,
  ]
}

run "additional_scripts_defaults_to_none" {
  command = plan

  assert {
    condition     = length(var.additional_scripts) == 0
    error_message = "additional_scripts must default to an empty map, so a caller that passes none keeps working."
  }
}

run "rejects_an_absolute_additional_script_path" {
  command = plan

  variables {
    additional_scripts = { "/etc/cron.d/evil" = "echo x" }
  }

  expect_failures = [
    var.additional_scripts,
  ]
}

run "rejects_a_parent_directory_additional_script_path" {
  command = plan

  variables {
    additional_scripts = { "lib/../../etc/passwd" = "echo x" }
  }

  expect_failures = [
    var.additional_scripts,
  ]
}

run "rejects_an_additional_script_that_collides_with_provision_tenant" {
  command = plan

  variables {
    additional_scripts = { "provision-tenant.sh" = "echo x" }
  }

  expect_failures = [
    var.additional_scripts,
  ]
}

run "rejects_the_proxy_binary_path_and_anything_beneath_it" {
  command = plan

  variables {
    additional_scripts = { "cloud-sql-proxy" = "echo x" }
  }

  expect_failures = [
    var.additional_scripts,
  ]
}

run "rejects_a_path_with_an_empty_dot_or_trailing_component" {
  command = plan

  variables {
    additional_scripts = { "lib//relay-auth.sh" = "echo x", "lib/./x.sh" = "echo y", "lib/" = "echo z" }
  }

  expect_failures = [
    var.additional_scripts,
  ]
}

run "rejects_a_path_that_sits_beneath_another_installed_path" {
  command = plan

  variables {
    additional_scripts = { "lib" = "echo x", "lib/relay-auth.sh" = "echo y" }
  }

  expect_failures = [
    var.additional_scripts,
  ]
}

run "accepts_the_documented_operator_script_paths" {
  command = plan

  variables {
    additional_scripts = { "billing-operator.sh" = "echo x", "lib/relay-auth.sh" = "echo y" }
  }

  assert {
    condition     = length(var.additional_scripts) == 2
    error_message = "The paths the Foundation roots pass must be valid."
  }
}

run "rejects_an_empty_additional_script" {
  command = plan

  variables {
    additional_scripts = { "billing-operator.sh" = "  " }
  }

  expect_failures = [
    var.additional_scripts,
  ]
}

run "rejects_empty_tenant_provision_script" {
  command = plan

  variables {
    tenant_provision_script = "   "
  }

  expect_failures = [
    var.tenant_provision_script,
  ]
}
