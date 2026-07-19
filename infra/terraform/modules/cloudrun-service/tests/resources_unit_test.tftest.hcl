# Regression coverage for behaviors connection_math.tftest.hcl doesn't touch:
# where the scaling block actually lives (a real bug caught only by manual
# review, not by any automated check, 2026-07-19), and bootstrap_mode's two
# real effects (probe path relaxation, secret-mounting gate).

mock_provider "google" {}

variables {
  project_id             = "ikaro-staging"
  environment            = "staging"
  service_name           = "ikaro-backend"
  service_account_email  = "ikaro-backend@ikaro-staging.iam.gserviceaccount.com"
  port                   = 3001
  image                  = "gcr.io/cloudrun/hello"
  max_instance_count     = 6
  min_instance_count     = 0
}

run "scaling_lives_at_service_level_not_per_revision" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.this.scaling[0].max_instance_count == 6
    error_message = "max_instance_count must be set on the service-level (combined) scaling block, not template.scaling (which is per-revision and lets concurrent old+new revisions each independently reach the cap during a rollout — review finding, 2026-07-19)."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.scaling[0].min_instance_count == 0
    error_message = "min_instance_count must be set on the service-level scaling block."
  }
}

run "bootstrap_mode_true_relaxes_probes_to_root_path" {
  command = plan

  variables {
    bootstrap_mode          = true
    health_check_ready_path = "/health/ready"
    health_check_live_path  = "/health/live"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].startup_probe[0].http_get[0].path == "/"
    error_message = "bootstrap_mode=true must relax the startup probe to \"/\" since the placeholder image doesn't implement /health/*."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].liveness_probe[0].http_get[0].path == "/"
    error_message = "bootstrap_mode=true must relax the liveness probe to \"/\"."
  }
}

run "bootstrap_mode_false_uses_the_configured_health_check_paths" {
  command = plan

  variables {
    bootstrap_mode          = false
    health_check_ready_path = "/v1/health/ready"
    health_check_live_path  = "/v1/health/live"
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].startup_probe[0].http_get[0].path == "/v1/health/ready"
    error_message = "bootstrap_mode=false must use the real configured health_check_ready_path."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].liveness_probe[0].http_get[0].path == "/v1/health/live"
    error_message = "bootstrap_mode=false must use the real configured health_check_live_path."
  }
}

run "bootstrap_mode_true_omits_secret_env_vars_entirely" {
  command = plan

  variables {
    bootstrap_mode = true
    secret_env_vars = {
      DB_PASSWORD = "projects/ikaro-staging/secrets/db-password"
    }
  }

  assert {
    condition     = length([for e in google_cloud_run_v2_service.this.template[0].containers[0].env : e if e.name == "DB_PASSWORD"]) == 0
    error_message = "bootstrap_mode=true must never mount secret_env_vars — the Secret Manager containers have zero versions until S27/S37, so mounting one would fail the deploy this story's first acceptance criterion needs to succeed."
  }
}

run "bootstrap_mode_false_mounts_secret_env_vars" {
  command = plan

  variables {
    bootstrap_mode = false
    secret_env_vars = {
      DB_PASSWORD = "projects/ikaro-staging/secrets/db-password"
    }
  }

  assert {
    condition     = length([for e in google_cloud_run_v2_service.this.template[0].containers[0].env : e if e.name == "DB_PASSWORD"]) == 1
    error_message = "bootstrap_mode=false must mount secret_env_vars normally."
  }
}
