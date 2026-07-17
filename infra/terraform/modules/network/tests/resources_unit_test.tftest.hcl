# Guards the two Checkov-critical subnet attributes (Private Google Access,
# flow logs) and the default-deny ingress posture — the S18 BFF egress path
# and the M17-S12 acceptance criteria depend on them.

mock_provider "google" {}

variables {
  project_id  = "ikaro-test"
  environment = "staging"
}

run "subnet_rides_private_google_access_with_flow_logs" {
  command = plan

  assert {
    condition     = google_compute_subnetwork.subnet.private_ip_google_access == true
    error_message = "Subnet must keep private_ip_google_access = true — the BFF's Google-API calls under ALL_TRAFFIC egress (S18) break without it."
  }

  assert {
    condition     = length(google_compute_subnetwork.subnet.log_config) == 1
    error_message = "Subnet must keep flow logs enabled (log_config block) — Checkov requirement."
  }
}

run "resource_names_carry_environment_suffix" {
  command = plan

  assert {
    condition     = google_compute_network.vpc.name == "ikaro-vpc-staging"
    error_message = "VPC must be named ikaro-vpc-{env}."
  }

  assert {
    condition     = google_compute_subnetwork.subnet.name == "ikaro-subnet-staging"
    error_message = "Subnet must be named ikaro-subnet-{env}."
  }

  assert {
    condition     = google_compute_global_address.psa_range.name == "ikaro-psa-range-staging"
    error_message = "PSA reserved range must be named ikaro-psa-range-{env}."
  }
}

run "ingress_is_denied_by_default" {
  command = plan

  assert {
    condition     = google_compute_firewall.deny_all_ingress.direction == "INGRESS" && google_compute_firewall.deny_all_ingress.priority == 65534
    error_message = "Firewall must be a default-deny INGRESS rule at priority 65534."
  }

  assert {
    condition     = one(google_compute_firewall.deny_all_ingress.deny).protocol == "all"
    error_message = "The default-deny rule must deny all protocols."
  }
}

run "psa_range_is_an_auto_allocated_slash_16" {
  command = plan

  assert {
    condition     = google_compute_global_address.psa_range.prefix_length == 16 && google_compute_global_address.psa_range.purpose == "VPC_PEERING"
    error_message = "PSA range must be an auto-allocated /16 VPC_PEERING internal range (settled in S12 discovery)."
  }
}
