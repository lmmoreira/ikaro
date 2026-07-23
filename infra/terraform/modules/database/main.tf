# modules/database — Cloud SQL PostgreSQL 17, private-IP only (via the network
# module's PSA peering), SSL enforced, IAM database auth for human access.
#
# Zero secrets by design (M17 §2): the app's `ikaro` user + password are
# created out-of-band by the S27/S37 activation runbooks — never here. The
# only Terraform-managed DB user is the passwordless IAM admin identity.

resource "google_sql_database_instance" "main" {
  #checkov:skip=CKV_GCP_6:ssl_mode ENCRYPTED_ONLY enforces TLS on every connection; the check additionally demands TRUSTED_CLIENT_CERTIFICATE_REQUIRED (per-client mTLS certs), a posture M17 deliberately did not adopt
  #checkov:skip=CKV_GCP_79:PostgreSQL 17 is pinned for parity with the app and local dev (docs/22 §6 PostgreSQL Choice, revised 2026-07-17); re-evaluate this pin against Checkov's definition of "latest" the next time the app's engine version is deliberately revisited
  name                = "ikaro-db-${var.environment}"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = var.deletion_protection

  settings {
    tier                        = var.db_tier
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_autoresize             = true
    disk_autoresize_limit       = var.disk_autoresize_limit
    deletion_protection_enabled = var.deletion_protection
    user_labels                 = var.labels

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network_id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = var.enable_pitr

      backup_retention_settings {
        retained_backups = 7
      }
    }

    # Sunday 06:00 UTC ≈ 03:00 São Paulo — off-peak.
    maintenance_window {
      day  = 7
      hour = 6
    }

    # IAM database authentication (passwordless human access) + the Postgres
    # logging flags Checkov requires.
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }
    database_flags {
      name  = "log_min_messages"
      value = "warning"
    }
    database_flags {
      name  = "log_min_error_statement"
      value = "error"
    }
    database_flags {
      name  = "log_min_duration_statement"
      value = "-1"
    }
    database_flags {
      name  = "log_duration"
      value = "on"
    }
    database_flags {
      name  = "log_hostname"
      value = "on"
    }
    database_flags {
      name  = "log_statement"
      value = "ddl"
    }
    database_flags {
      name  = "cloudsql.enable_pgaudit"
      value = "on"
    }
    database_flags {
      name  = "pgaudit.log"
      value = "ddl"
    }
  }

  lifecycle {
    # A private-IP instance cannot be created before the PSA peering exists;
    # referencing the connection here puts it in the dependency graph without
    # a coarse module-level depends_on (S12 discovery decision).
    precondition {
      condition     = var.private_services_connection != ""
      error_message = "private_services_connection must carry the network module's PSA connection ID."
    }
  }
}

resource "google_sql_database" "ikaro" {
  name     = "ikaro"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
}

# The instance reporting ready doesn't mean the internal `cloudsqliamuser`
# Postgres role (auto-created when cloudsql.iam_authentication is enabled)
# has propagated yet -- a real staging apply (M17-S27, 2026-07-23) hit
# "role \"cloudsqliamuser\" does not exist" ~30s after instance creation
# completed. Same pattern as envs/*/main.tf's iam_propagation sleep: bridge
# the gap between the GCP API call succeeding and the underlying resource
# actually being usable.
#
# This is a heuristic buffer, not a readiness check -- GCP documents no
# guaranteed bound on this propagation, and Terraform has no visibility
# into the underlying Postgres role from here (a real poll would need the
# CI runner to reach the private instance directly, which no tooling here
# does today). If 120s ever proves insufficient, the safe recovery is the
# same one used to diagnose this in the first place: retry the pipeline --
# the instance and every already-created resource are unaffected, so a
# retry only needs to create what's still missing.
#
# Create-only: once recorded in state (this apply), a no-op on every
# subsequent apply -- the wait never repeats.
resource "time_sleep" "cloudsql_iam_role_propagation" {
  depends_on      = [google_sql_database_instance.main]
  create_duration = "120s"
}

# Passwordless human access: the admin identity as an IAM DB user, plus the
# project roles needed to open the proxy tunnel (client) and log in
# (instanceUser). No password exists for this user anywhere.
resource "google_sql_user" "iam_admin" {
  depends_on = [time_sleep.cloudsql_iam_role_propagation]

  name     = var.iam_admin_user
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_USER"
}

resource "google_project_iam_member" "admin_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "user:${var.iam_admin_user}"
}

resource "google_project_iam_member" "admin_cloudsql_instance_user" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "user:${var.iam_admin_user}"
}
