# Guards the count-gate (the whole point of this module being "on-demand,
# not always-on", TD32) and the firewall's IAP-only ingress posture.

mock_provider "google" {}

variables {
  project_id                   = "ikaro-test"
  environment                  = "staging"
  region                       = "southamerica-east1"
  zone                         = "southamerica-east1-a"
  subnet_id                    = "projects/ikaro-test/regions/southamerica-east1/subnetworks/ikaro-subnet-staging"
  network_id                   = "projects/ikaro-test/global/networks/ikaro-vpc-staging"
  iam_admin_user               = "admin@ikaro.online"
  platform_admin_key_secret_id = "projects/ikaro-test/secrets/platform-admin-key"
}

run "create_false_plans_zero_instances" {
  command = plan

  variables {
    create = false
  }

  assert {
    condition     = length(google_compute_instance.relay) == 0
    error_message = "create = false must plan zero relay VM instances — inert by default."
  }
}

run "create_true_plans_exactly_one_instance_with_no_external_ip" {
  command = plan

  variables {
    create = true
  }

  assert {
    condition     = length(google_compute_instance.relay) == 1
    error_message = "create = true must plan exactly one relay VM instance."
  }

  assert {
    condition     = google_compute_instance.relay[0].machine_type == "e2-micro"
    error_message = "Relay VM must default to e2-micro."
  }

  assert {
    condition     = length(google_compute_instance.relay[0].network_interface[0].access_config) == 0
    error_message = "Relay VM must have no access_config block — no external IP, ever (TD32 design: the whole point is IAP-only reachability)."
  }

  assert {
    condition     = one(google_compute_instance.relay[0].shielded_instance_config).enable_secure_boot == true
    error_message = "Relay VM must have Shielded VM enabled."
  }
}

run "firewall_allows_only_iap_range_on_ssh" {
  command = plan

  assert {
    condition     = contains(google_compute_firewall.allow_iap_ssh.source_ranges, "35.235.240.0/20") && length(google_compute_firewall.allow_iap_ssh.source_ranges) == 1
    error_message = "Firewall must allow only IAP's fixed source range, nothing else."
  }

  assert {
    condition     = one(google_compute_firewall.allow_iap_ssh.allow).ports[0] == "22" && length(one(google_compute_firewall.allow_iap_ssh.allow).ports) == 1
    error_message = "Firewall must allow only TCP/22."
  }
}

run "admin_identity_gets_exactly_the_three_grants" {
  command = plan

  assert {
    condition     = google_project_iam_member.admin_iap_tunnel.role == "roles/iap.tunnelResourceAccessor" && google_project_iam_member.admin_iap_tunnel.member == "user:admin@ikaro.online"
    error_message = "iam_admin_user must get roles/iap.tunnelResourceAccessor."
  }

  assert {
    condition     = google_project_iam_member.admin_os_login.role == "roles/compute.osLogin" && google_project_iam_member.admin_os_login.member == "user:admin@ikaro.online"
    error_message = "iam_admin_user must get roles/compute.osLogin."
  }

  assert {
    condition     = google_secret_manager_secret_iam_member.admin_platform_admin_key.role == "roles/secretmanager.secretAccessor" && google_secret_manager_secret_iam_member.admin_platform_admin_key.secret_id == var.platform_admin_key_secret_id
    error_message = "iam_admin_user must get secretAccessor on platform-admin-key — the TD32 discovery gap this module closes."
  }
}
