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

run "instance_is_private_ssl_enforced_postgres_17" {
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
    condition     = google_sql_database_instance.main.database_version == "POSTGRES_17"
    error_message = "Database engine must stay PostgreSQL 17 (matches the app and local dev — revised 2026-07-17, see docs/22)."
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

  assert {
    condition     = google_project_iam_member.admin_cloudsql_client.role == "roles/cloudsql.client" && google_project_iam_member.admin_cloudsql_client.member == "user:admin@example.com"
    error_message = "The admin identity must hold roles/cloudsql.client to open the proxy tunnel."
  }

  assert {
    condition     = google_project_iam_member.admin_cloudsql_instance_user.role == "roles/cloudsql.instanceUser" && google_project_iam_member.admin_cloudsql_instance_user.member == "user:admin@example.com"
    error_message = "The admin identity must hold roles/cloudsql.instanceUser to log in as the IAM DB user."
  }
}

run "all_database_flags_match_the_checkov_compliant_set" {
  command = plan

  assert {
    condition = tomap({
      for f in google_sql_database_instance.main.settings[0].database_flags : f.name => f.value
      }) == tomap({
      "cloudsql.enable_pgaudit"     = "on"
      "cloudsql.iam_authentication" = "on"
      "log_checkpoints"             = "on"
      "log_connections"             = "on"
      "log_disconnections"          = "on"
      "log_duration"                = "on"
      "log_hostname"                = "on"
      "log_lock_waits"              = "on"
      "log_min_duration_statement"  = "-1"
      "log_min_error_statement"     = "error"
      "log_min_messages"            = "warning"
      "log_statement"               = "ddl"
      "pgaudit.log"                 = "ddl"
    })
    error_message = "The full database_flags set must match exactly — these flags satisfy Checkov's Postgres logging/pgAudit checks (CKV_GCP_108/109/110/111, CKV2_GCP_13); a silently dropped or changed flag stays invisible to this fast test suite otherwise."
  }
}

run "ikaro_database_exists_on_the_instance" {
  command = plan

  assert {
    condition     = google_sql_database.ikaro.name == "ikaro" && google_sql_database.ikaro.instance == google_sql_database_instance.main.name
    error_message = "The ikaro database must exist and be attached to the ikaro-db-{env} instance."
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

run "rejects_whitespace_in_iam_admin_user" {
  command = plan

  variables {
    iam_admin_user = "admin foo@example.com"
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
