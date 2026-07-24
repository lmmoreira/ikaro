# Guards the two behaviors this module exists for: max_retries=0/timeout
# wired into the job spec exactly (M17-S20 acceptance criteria), and
# bootstrap_mode's secret-mounting gate (mirrors modules/cloudrun-service's
# own regression test — same underlying Secret Manager zero-version
# constraint, see main.tf's comment).

mock_provider "google" {}

variables {
  project_id            = "ikaro-staging"
  environment           = "staging"
  service_account_email = "ikaro-migrate@ikaro-staging.iam.gserviceaccount.com"
  image                 = "gcr.io/cloudrun/hello"
  network_id            = "projects/ikaro-staging/global/networks/ikaro-vpc"
  subnet_id             = "projects/ikaro-staging/regions/southamerica-east1/subnetworks/ikaro-subnet"
}

run "job_spec_matches_the_story_command_and_retry_policy" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_job.this.name == "ikaro-migrate"
    error_message = "Job must be named ikaro-migrate."
  }

  assert {
    condition     = google_cloud_run_v2_job.this.template[0].template[0].max_retries == 0
    error_message = "max_retries must be 0 in the job spec — a failed migration must fail loudly, not retry into a half-applied state (M17-S20 acceptance criterion)."
  }

  assert {
    condition     = google_cloud_run_v2_job.this.template[0].template[0].timeout == "600s"
    error_message = "Per-task timeout must default to 600s (10 minutes) per the story spec."
  }

  assert {
    condition     = google_cloud_run_v2_job.this.template[0].template[0].containers[0].command == tolist(["node", "node_modules/typeorm/cli.js", "migration:run", "-d", "dist/shared/database/data-source.js"])
    error_message = "Container command must invoke the compiled-mode typeorm CLI directly."
  }

  assert {
    condition     = google_cloud_run_v2_job.this.template[0].template[0].vpc_access[0].egress == "PRIVATE_RANGES_ONLY"
    error_message = "vpc_access egress must default to PRIVATE_RANGES_ONLY — the Job only needs Cloud SQL's private IP."
  }
}

run "bootstrap_mode_true_omits_secret_env_vars_entirely" {
  command = plan

  variables {
    bootstrap_mode = true
    secret_env_vars = {
      DB_MIGRATOR_PASSWORD = "projects/ikaro-staging/secrets/db-migrator-password"
    }
  }

  assert {
    condition     = length([for e in google_cloud_run_v2_job.this.template[0].template[0].containers[0].env : e if e.name == "DB_MIGRATOR_PASSWORD"]) == 0
    error_message = "bootstrap_mode=true must never mount secret_env_vars — db-migrator-password has zero versions until S27/S37, so mounting it would fail this apply."
  }
}

run "bootstrap_mode_false_mounts_secret_env_vars" {
  command = plan

  variables {
    bootstrap_mode = false
    secret_env_vars = {
      DB_MIGRATOR_PASSWORD = "projects/ikaro-staging/secrets/db-migrator-password"
    }
  }

  assert {
    condition     = length([for e in google_cloud_run_v2_job.this.template[0].template[0].containers[0].env : e if e.name == "DB_MIGRATOR_PASSWORD"]) == 1
    error_message = "bootstrap_mode=false must mount secret_env_vars normally."
  }
}

run "plain_env_vars_are_mounted_regardless_of_bootstrap_mode" {
  command = plan

  variables {
    bootstrap_mode = true
    env_vars = {
      DB_INSTANCE_CONNECTION_NAME = "proj:region:instance"
      DB_MIGRATOR_USER            = "ikaro_migrator"
    }
  }

  assert {
    condition     = length([for e in google_cloud_run_v2_job.this.template[0].template[0].containers[0].env : e if e.name == "DB_MIGRATOR_USER" && e.value == "ikaro_migrator"]) == 1
    error_message = "Plain env_vars must always be mounted, independent of bootstrap_mode."
  }
}
