# Guards the vpc_egress <-> network_id/subnet_id cross-variable validation
# (review finding, 2026-07-19): without it, a caller setting vpc_egress
# without both would only find out at apply time via an opaque GCP API
# error inside network_interfaces, not a clear plan-time message.

mock_provider "google" {}

variables {
  project_id            = "ikaro-staging"
  environment           = "staging"
  service_name          = "ikaro-bff"
  service_account_email = "ikaro-bff@ikaro-staging.iam.gserviceaccount.com"
  port                  = 3002
  image                 = "gcr.io/cloudrun/hello"
}

run "vpc_egress_set_without_network_id_and_subnet_id_fails" {
  command = plan

  variables {
    vpc_egress = "ALL_TRAFFIC"
  }

  expect_failures = [
    var.vpc_egress,
  ]
}

run "vpc_egress_set_with_both_network_id_and_subnet_id_plans_clean" {
  command = plan

  variables {
    vpc_egress = "ALL_TRAFFIC"
    network_id = "projects/ikaro-staging/global/networks/ikaro-vpc-staging"
    subnet_id  = "projects/ikaro-staging/regions/southamerica-east1/subnetworks/ikaro-subnet-staging"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.name == "ikaro-bff"
    error_message = "Should plan cleanly when both network_id and subnet_id are set alongside vpc_egress."
  }
}

run "vpc_egress_null_does_not_require_network_id_or_subnet_id" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.name == "ikaro-bff"
    error_message = "vpc_egress left null (default) must not require network_id/subnet_id — e.g. web, which has no VPC access."
  }
}
