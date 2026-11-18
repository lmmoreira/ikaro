# Guards the VM count-gate (the identity remains persistent while the VM is
# on-demand), the firewall's IAP-only ingress posture, and the
# relay SA's identity-model redesign (2026-07-24, cross-tool PR review):
# the relay VM's own service account does the Cloud SQL / Cloud Run /
# Secret Manager work now, not a human re-authenticating inside the VM.

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
  db_instance_connection_name    = "ikaro-test:southamerica-east1:ikaro-db-staging"
  db_instance_name               = "ikaro-db-staging"
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
    condition     = length(google_iap_tunnel_instance_iam_member.admin_iap_tunnel) == 0 && length(google_compute_instance_iam_member.admin_os_login) == 0 && length(google_secret_manager_secret_iam_member.relay_platform_admin_key) == 0 && length(google_secret_manager_secret_iam_member.relay_internal_api_key) == 0 && length(google_cloud_run_v2_service_iam_member.relay_cloud_run_viewer) == 0
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
    condition     = strcontains(google_compute_instance.relay[0].metadata_startup_script, base64encode(var.tenant_provision_script)) && strcontains(local.startup_script, "User=cloud-sql-proxy") && strcontains(local.startup_script, "NoNewPrivileges=true") && strcontains(local.startup_script, "ProtectSystem=full") && strcontains(local.startup_script, "\"/usr/local/bin/provision-tenant.sh\"")
    error_message = "Cloud SQL Auth Proxy must run as an unprivileged system user with systemd hardening, and the VM must receive provision-tenant.sh."
  }
}

# M25-S32 regression guard (found live): the startup script used to be an indented
# `<<-` heredoc whose terminators stayed indented, so bash never ended the unit's
# here-document and the rest of the script was written into the unit file.
run "startup_script_here_document_terminators_are_at_column_zero" {
  command = plan

  assert {
    condition     = startswith(local.startup_script, "#!/usr/bin/env bash\n") && strcontains(local.startup_script, "\nUNIT\n") && !strcontains(local.startup_script, " UNIT\n") && length(regexall("\n[ \t]+UNIT\n", local.startup_script)) == 0
    error_message = "The systemd unit here-document must end with a terminator at column 0, or bash swallows the rest of the startup script."
  }
}

# Found live on a second boot: a hard reset right after the first boot's download left a
# truncated, still-executable proxy binary, which an executable-bit guard accepted.
run "proxy_binary_is_trusted_only_when_its_checksum_matches" {
  command = plan

  assert {
    condition     = !strcontains(local.startup_script, "[ ! -x /usr/local/bin/cloud-sql-proxy ]")
    error_message = "An existing executable file must not count as an installed proxy: it can be truncated."
  }

  assert {
    condition     = strcontains(local.startup_script, "if ! echo \"cd689d582b826fa5bc82c01ccc14e45a58200c3cefbf923ce96c422825e4e6f6  /usr/local/bin/cloud-sql-proxy\" | sha256sum -c -")
    error_message = "The installed proxy must be re-checked against its pinned sha256 on every boot."
  }

  assert {
    condition     = strcontains(local.startup_script, "-o /usr/local/bin/cloud-sql-proxy.download") && strcontains(local.startup_script, "mv -f /usr/local/bin/cloud-sql-proxy.download /usr/local/bin/cloud-sql-proxy") && strcontains(local.startup_script, "cloud-sql-proxy.download\" | sha256sum -c -")
    error_message = "The proxy must be downloaded to a temporary name, verified, and only then moved into place."
  }
}

run "startup_script_installs_every_operator_script_before_starting_the_proxy" {
  command = plan

  variables {
    additional_scripts = {
      "billing-operator.sh" = "#!/usr/bin/env bash\necho operator"
      "lib/relay-auth.sh"   = "echo lib"
    }
  }

  # Each payload is pinned to its own destination, so two scripts swapped between paths fail.
  assert {
    condition = alltrue([
      strcontains(local.startup_script, "printf '%s' '${base64encode(var.tenant_provision_script)}' | base64 -d > \"/usr/local/bin/provision-tenant.sh\""),
      strcontains(local.startup_script, "printf '%s' '${base64encode("#!/usr/bin/env bash\necho operator")}' | base64 -d > \"/usr/local/bin/billing-operator.sh\""),
      strcontains(local.startup_script, "printf '%s' '${base64encode("echo lib")}' | base64 -d > \"/usr/local/bin/lib/relay-auth.sh\""),
    ])
    error_message = "provision-tenant.sh, billing-operator.sh and lib/relay-auth.sh must each be installed from their own payload at their own path under /usr/local/bin."
  }

  # The proxy start must exist, and all three installs must come before it.
  assert {
    condition     = length(split("systemctl enable --now cloud-sql-proxy.service", local.startup_script)) == 2 && length(regexall("base64 -d", split("systemctl enable --now cloud-sql-proxy.service", local.startup_script)[0])) == 3
    error_message = "The scripts must be installed before the proxy is started, so a proxy failure can never leave the VM without them."
  }
}

run "script_content_that_looks_like_a_terminator_cannot_corrupt_the_startup_script" {
  command = plan

  variables {
    additional_scripts = {
      "tricky.sh" = "echo start\nUNIT\nSCRIPT\nEOT\necho end"
    }
  }

  assert {
    condition     = length(regexall("\nUNIT\n", local.startup_script)) == 1 && !strcontains(local.startup_script, "echo start")
    error_message = "Installed from base64, a script's own lines can never act as a here-document terminator in the startup script."
  }

  assert {
    condition     = strcontains(local.startup_script, "printf '%s' '${base64encode("echo start\nUNIT\nSCRIPT\nEOT\necho end")}' | base64 -d > \"/usr/local/bin/tricky.sh\"")
    error_message = "The script is still installed, decoded from its base64 payload, at its own path."
  }
}

run "proxy_is_not_started_without_a_database_connection_name" {
  command = plan

  variables {
    db_instance_connection_name = ""
  }

  assert {
    condition     = !strcontains(local.startup_script, "systemctl enable --now") && strcontains(local.startup_script, "not started: no db_instance_connection_name")
    error_message = "With no db_instance_connection_name the proxy unit is installed but not started, and the scripts are still installed."
  }

  assert {
    condition     = strcontains(local.startup_script, base64encode(var.tenant_provision_script))
    error_message = "The scripts must be installed even when the proxy is not started."
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

run "operator_can_attach_only_the_relay_service_account" {
  command = plan

  override_resource {
    target          = google_service_account.relay
    override_during = plan
    values = {
      name = "projects/ikaro-test/serviceAccounts/ikaro-relay-vm@ikaro-test.iam.gserviceaccount.com"
    }
  }

  assert {
    condition     = google_service_account_iam_member.operator_relay_service_account_user.role == "roles/iam.serviceAccountUser" && google_service_account_iam_member.operator_relay_service_account_user.member == "serviceAccount:ikaro-tf-foundation@ikaro-test.iam.gserviceaccount.com"
    error_message = "The control-plane identity must receive only roles/iam.serviceAccountUser for the relay service account."
  }

  assert {
    condition     = google_service_account_iam_member.operator_relay_service_account_user.service_account_id == google_service_account.relay.name
    error_message = "The control-plane serviceAccountUser grant must be scoped to the relay service account, not the project."
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
      name  = "projects/ikaro-test/serviceAccounts/ikaro-relay-vm@ikaro-test.iam.gserviceaccount.com"
    }
  }

  assert {
    condition     = google_secret_manager_secret_iam_member.relay_platform_admin_key[0].role == "roles/secretmanager.secretAccessor" && google_secret_manager_secret_iam_member.relay_platform_admin_key[0].member == "serviceAccount:${google_service_account.relay.email}"
    error_message = "platform-admin-key accessor must be granted to the relay VM's own service account (2026-07-24 redesign), not the human — closes the TD32 discovery gap via metadata-server auth, no gcloud CLI needed."
  }

  assert {
    condition     = google_secret_manager_secret_iam_member.relay_internal_api_key[0].secret_id == "projects/ikaro-test/secrets/internal-api-key" && google_secret_manager_secret_iam_member.relay_internal_api_key[0].role == "roles/secretmanager.secretAccessor" && google_secret_manager_secret_iam_member.relay_internal_api_key[0].member == "serviceAccount:${google_service_account.relay.email}"
    error_message = "internal-api-key accessor must be granted to the relay VM's own service account for automatic tenant provisioning."
  }

  assert {
    condition     = google_cloud_run_v2_service_iam_member.relay_cloud_run_viewer[0].name == "ikaro-backend" && google_cloud_run_v2_service_iam_member.relay_cloud_run_viewer[0].role == "roles/run.viewer" && google_cloud_run_v2_service_iam_member.relay_cloud_run_viewer[0].member == "serviceAccount:${google_service_account.relay.email}"
    error_message = "The relay SA needs service-scoped read-only Cloud Run access to discover the backend URI."
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

run "cloud_sql_identity_persists_when_vm_is_off" {
  command = plan

  variables {
    create = false
  }

  assert {
    condition     = length(google_sql_user.relay) == 1 && length(google_project_iam_member.relay_cloudsql_client) == 1 && length(google_project_iam_member.relay_cloudsql_instance_user) == 1
    error_message = "The relay Cloud SQL IAM identity and its project grants must persist while the on-demand VM is disabled."
  }

  assert {
    condition     = length(google_iap_tunnel_instance_iam_member.admin_iap_tunnel) == 0 && length(google_compute_instance_iam_member.admin_os_login) == 0 && length(google_secret_manager_secret_iam_member.relay_platform_admin_key) == 0 && length(google_secret_manager_secret_iam_member.relay_internal_api_key) == 0 && length(google_cloud_run_v2_service_iam_member.relay_cloud_run_viewer) == 0
    error_message = "VM-only access grants must remain disabled while the VM is off."
  }
}
