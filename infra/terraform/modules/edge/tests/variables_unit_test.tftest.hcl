# command = plan + mock_provider (Wave 2 preamble pattern) — no credentials,
# no resources created, zero cost. Run from the module directory:
#   terraform init && terraform test

mock_provider "google" {}
mock_provider "cloudflare" {}

variables {
  project_id         = "ikaro-test"
  environment        = "prod"
  web_service_name   = "ikaro-web"
  bff_service_name   = "ikaro-bff"
  cloudflare_zone_id = "0123456789abcdef0123456789abcdef"
}

run "accepts_valid_inputs_and_defaults_domain_and_region" {
  command = plan

  assert {
    condition     = var.root_domain == "ikaro.online"
    error_message = "root_domain must default to ikaro.online (D11)."
  }

  assert {
    condition     = var.region == "southamerica-east1"
    error_message = "Region must default to southamerica-east1 (São Paulo)."
  }
}

run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "production"
  }

  expect_failures = [
    var.environment,
  ]
}

run "rejects_zone_id_that_looks_like_a_zone_name" {
  command = plan

  variables {
    cloudflare_zone_id = "ikaro.online" # the exact mistake this validation guards against
  }

  expect_failures = [
    var.cloudflare_zone_id,
  ]
}

run "accepts_lowercase_hex_zone_id" {
  command = plan

  assert {
    condition     = var.cloudflare_zone_id == "0123456789abcdef0123456789abcdef"
    error_message = "A 32-char lowercase hex zone ID must be accepted."
  }
}

run "rejects_root_domain_with_scheme" {
  command = plan

  variables {
    root_domain = "https://ikaro.online"
  }

  expect_failures = [
    var.root_domain,
  ]
}

run "rejects_root_domain_without_a_dot" {
  command = plan

  variables {
    root_domain = "localhost"
  }

  expect_failures = [
    var.root_domain,
  ]
}
