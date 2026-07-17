# Guards the security posture (private-IP only, SSL enforced, IAM auth flag),
# the backup/maintenance schedule, and the prod toggles (PITR, deletion
# protection) — the M17-S13 acceptance criteria depend on these.

mock_provider "google" {}

variables {
  project_id                  = "ikaro-test"
  environment                 = "staging"
  iam_admin_user              = "admin@example.com"
  network_id                  = "projects/ikaro-test/global/networks/ikaro-vpc-staging"
  private_services_connection = "psa-connection-id"
}

run "instance_is_private_ssl_enforced_postgres_15" {
  command = plan

  assert {
    condition     = google_sql_database_instance.main.settings[0].ip_configuration[0].ipv4_enabled == false
    error_message = "Instance must never have a public IP."
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].ip_configuration[0].ssl_mode == "ENCRYPTED_ONLY"
    error_message = "SSL must be enforced (ssl_mode ENCRYPTED_ONLY — provider v7 rename of require_ssl)."
  }

  assert {
    condition     = google_sql_database_instance.main.database_version == "POSTGRES_15"
    error_message = "Database engine must stay PostgreSQL 15 (matches the app and local dev)."
  }

  assert {
    condition     = google_sql_database_instance.main.name == "ikaro-db-staging"
    error_message = "Instance must be named ikaro-db-{env}."
  }
}

run "iam_database_auth_is_on_with_iam_user" {
  command = plan

  assert {
    condition = anytrue([
      for f in google_sql_database_instance.main.settings[0].database_flags :
      f.name == "cloudsql.iam_authentication" && f.value == "on"
    ])
    error_message = "cloudsql.iam_authentication flag must be on — passwordless human access depends on it."
  }

  assert {
    condition     = google_sql_user.iam_admin.type == "CLOUD_IAM_USER"
    error_message = "The admin DB user must be a CLOUD_IAM_USER (no password exists)."
  }
}

run "backups_maintenance_and_disk_are_pinned" {
  command = plan

  assert {
    condition     = google_sql_database_instance.main.settings[0].backup_configuration[0].enabled == true && google_sql_database_instance.main.settings[0].backup_configuration[0].start_time == "02:00"
    error_message = "Daily backups must be enabled at 02:00 UTC."
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].backup_configuration[0].backup_retention_settings[0].retained_backups == 7
    error_message = "Backup retention must be 7."
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].maintenance_window[0].day == 7 && google_sql_database_instance.main.settings[0].maintenance_window[0].hour == 6
    error_message = "Maintenance window must stay Sunday 06:00 UTC (off-peak São Paulo)."
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].disk_autoresize == true && google_sql_database_instance.main.settings[0].disk_autoresize_limit == 30
    error_message = "Disk autoresize must be on with a 30GB cost bound."
  }
}

run "staging_defaults_have_no_pitr_and_no_deletion_protection" {
  command = plan

  assert {
    condition     = google_sql_database_instance.main.settings[0].backup_configuration[0].point_in_time_recovery_enabled == false
    error_message = "PITR must default off (staging)."
  }

  assert {
    condition     = google_sql_database_instance.main.deletion_protection == false
    error_message = "Deletion protection must default off (staging)."
  }
}

run "prod_toggles_enable_pitr_and_deletion_protection" {
  command = plan

  variables {
    enable_pitr         = true
    deletion_protection = true
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].backup_configuration[0].point_in_time_recovery_enabled == true
    error_message = "enable_pitr = true must turn PITR on."
  }

  assert {
    condition     = google_sql_database_instance.main.deletion_protection == true && google_sql_database_instance.main.settings[0].deletion_protection_enabled == true
    error_message = "deletion_protection = true must protect at both the Terraform and API level."
  }
}

run "rejects_non_email_iam_admin_user" {
  command = plan

  variables {
    iam_admin_user = "not-an-email"
  }

  expect_failures = [
    var.iam_admin_user,
  ]
}

run "rejects_missing_psa_connection" {
  command = plan

  variables {
    private_services_connection = ""
  }

  expect_failures = [
    google_sql_database_instance.main,
  ]
}
