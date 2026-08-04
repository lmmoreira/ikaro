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

# sidecar_containers cap (Copilot review finding, PR #318, 2026-08-04):
# lifecycle.ignore_changes (main.tf) only covers the first sidecar's image,
# so a 2nd+ entry would silently lose drift protection — must fail at plan
# time, not silently under-protect a second sidecar's image.
run "more_than_one_sidecar_container_fails" {
  command = plan

  variables {
    sidecar_containers = [
      { name = "otel-collector", image = "otel/opentelemetry-collector-contrib@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6" },
      { name = "second-sidecar", image = "example.com/second@sha256:0000000000000000000000000000000000000000000000000000000000000000" },
    ]
  }

  expect_failures = [
    var.sidecar_containers,
  ]
}
