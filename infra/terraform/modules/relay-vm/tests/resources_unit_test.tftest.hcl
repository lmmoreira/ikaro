# Guards the count-gate (the whole point of this module being "on-demand,
# not always-on", TD32), the firewall's IAP-only ingress posture, and the
# relay SA's identity-model redesign (2026-07-24, cross-tool PR review):
# the relay VM's own service account does the Cloud SQL / Cloud Run /
# Secret Manager work now, not a human re-authenticating inside the VM.

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
  db_instance_connection_name  = "ikaro-test:southamerica-east1:ikaro-db-staging"
  db_instance_name             = "ikaro-db-staging"
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

  assert {
    condition     = length(google_iap_tunnel_instance_iam_member.admin_iap_tunnel) == 0 && length(google_compute_instance_iam_member.admin_os_login) == 0 && length(google_secret_manager_secret_iam_member.relay_platform_admin_key) == 0
    error_message = "Instance-scoped and Secret Manager access bindings must be zero when the relay VM is not created."
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

  assert {
    condition     = strcontains(local.startup_script, "User=cloud-sql-proxy") && strcontains(local.startup_script, "NoNewPrivileges=true") && strcontains(local.startup_script, "ProtectSystem=full")
    error_message = "Cloud SQL Auth Proxy must run as an unprivileged system user with systemd hardening."
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

run "admin_identity_gets_instance_scoped_ssh_access_only" {
  command = plan

  variables {
    create = true
  }

  assert {
    condition     = google_iap_tunnel_instance_iam_member.admin_iap_tunnel[0].role == "roles/iap.tunnelResourceAccessor" && google_iap_tunnel_instance_iam_member.admin_iap_tunnel[0].member == "user:admin@ikaro.online"
    error_message = "iam_admin_user must get roles/iap.tunnelResourceAccessor, scoped to this instance (not project-wide — cross-tool review finding, TD32)."
  }

  assert {
    condition     = google_iap_tunnel_instance_iam_member.admin_iap_tunnel[0].instance == google_compute_instance.relay[0].name
    error_message = "IAP tunnel grant must target this specific instance, not the whole project."
  }

  assert {
    condition     = google_compute_instance_iam_member.admin_os_login[0].role == "roles/compute.osLogin" && google_compute_instance_iam_member.admin_os_login[0].member == "user:admin@ikaro.online"
    error_message = "iam_admin_user must get roles/compute.osLogin, scoped to this instance."
  }

  assert {
    condition     = google_compute_instance_iam_member.admin_os_login[0].instance_name == google_compute_instance.relay[0].name
    error_message = "OS Login grant must target this specific instance, not the whole project."
  }
}

run "relay_service_account_gets_cloud_sql_and_secret_access_not_the_human" {
  command = plan

  variables {
    create = true
  }

  # google_service_account.relay.email is a computed attribute — unknown
  # at plan time under mock_provider unless overridden. This module's
  # every other resource references it, so a concrete plan-time value is
  # needed to assert against (matches account_id's own deterministic
  # naming convention: <account_id>@<project>.iam.gserviceaccount.com).
  override_resource {
    target          = google_service_account.relay
    override_during = plan
    values = {
      email = "ikaro-relay-vm@ikaro-test.iam.gserviceaccount.com"
    }
  }

  assert {
    condition     = google_secret_manager_secret_iam_member.relay_platform_admin_key[0].role == "roles/secretmanager.secretAccessor" && google_secret_manager_secret_iam_member.relay_platform_admin_key[0].member == "serviceAccount:${google_service_account.relay.email}"
    error_message = "platform-admin-key accessor must be granted to the relay VM's own service account (2026-07-24 redesign), not the human — closes the TD32 discovery gap via metadata-server auth, no gcloud CLI needed."
  }

  assert {
    condition     = google_project_iam_member.relay_cloudsql_client[0].member == "serviceAccount:${google_service_account.relay.email}" && google_project_iam_member.relay_cloudsql_instance_user[0].member == "serviceAccount:${google_service_account.relay.email}"
    error_message = "Cloud SQL client/instanceUser roles must be granted to the relay VM's own service account."
  }

  assert {
    condition     = google_sql_user.relay[0].type == "CLOUD_IAM_SERVICE_ACCOUNT" && google_sql_user.relay[0].name == "ikaro-relay-vm@ikaro-test.iam"
    error_message = "google_sql_user must register the relay SA as a CLOUD_IAM_SERVICE_ACCOUNT with the .gserviceaccount.com suffix trimmed (Postgres username length limit, per Google's IAM database authentication docs)."
  }
}

run "cloud_sql_resources_skipped_when_db_instance_name_empty" {
  command = plan

  variables {
    create           = true
    db_instance_name = "" # prod's pre-S37 state: database module not created yet
  }

  assert {
    condition     = length(google_sql_user.relay) == 0 && length(google_project_iam_member.relay_cloudsql_client) == 0 && length(google_project_iam_member.relay_cloudsql_instance_user) == 0
    error_message = "With no db_instance_name, there's nothing to grant Cloud SQL access to yet — these resources must be skipped, not fail or dangle."
  }
}

run "audit_logging_covers_iap_secret_manager_and_cloud_sql" {
  command = plan

  assert {
    condition     = google_project_iam_audit_config.iap_tunnel_access.service == "iap.googleapis.com"
    error_message = "Audit config must target iap.googleapis.com — IAP's own docs say tunnel-access logging is opt-in, not on by default (cross-tool review finding, TD32)."
  }

  assert {
    condition = alltrue([
      for log_type in ["ADMIN_READ", "DATA_READ", "DATA_WRITE"] :
      contains([for c in google_project_iam_audit_config.iap_tunnel_access.audit_log_config : c.log_type], log_type)
    ])
    error_message = "IAP audit config must cover all three log types (ADMIN_READ, DATA_READ, DATA_WRITE)."
  }

  assert {
    condition     = google_project_iam_audit_config.secretmanager_access.service == "secretmanager.googleapis.com"
    error_message = "Secret Manager reads (AccessSecretVersion) are also Data Access-classified and opt-in — must be covered too, not just IAP (cross-tool review finding, TD32)."
  }

  assert {
    condition     = contains([for c in google_project_iam_audit_config.secretmanager_access.audit_log_config : c.log_type], "DATA_READ")
    error_message = "Secret Manager audit config must cover DATA_READ — that's the log type AccessSecretVersion falls under."
  }

  assert {
    condition     = google_project_iam_audit_config.cloudsql_login.service == "cloudsql.googleapis.com"
    error_message = "Cloud SQL IAM logins (cloudsql.instances.login) are also Data Access-classified and opt-in — must be covered too, not just IAP and Secret Manager (cross-tool review finding, round 3, TD32)."
  }

  assert {
    condition     = contains([for c in google_project_iam_audit_config.cloudsql_login.audit_log_config : c.log_type], "DATA_WRITE")
    error_message = "Cloud SQL audit config must cover DATA_WRITE — confirmed against Google's own Cloud SQL audit logging docs that cloudsql.instances.login falls under this log type."
  }
}
