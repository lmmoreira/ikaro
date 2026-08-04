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

# sidecar_containers' health_check_port/health_check_path cross-field
# validation (M17-S34): a probe needs both to be meaningful, so one set
# without the other should fail at plan time, not silently emit a
# half-configured (or absent) startup_probe.
run "sidecar_health_check_port_without_path_fails" {
  command = plan

  variables {
    sidecar_containers = [{
      name              = "otel-collector"
      image             = "otel/opentelemetry-collector-contrib@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6"
      health_check_port = 13133
    }]
  }

  expect_failures = [
    var.sidecar_containers,
  ]
}
