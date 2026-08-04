# Regression coverage for behaviors connection_math.tftest.hcl doesn't touch:
# where the scaling block actually lives (a real bug caught only by manual
# review, not by any automated check, 2026-07-19), and bootstrap_mode's two
# real effects (probe path relaxation, secret-mounting gate).

mock_provider "google" {}

variables {
  project_id            = "ikaro-staging"
  environment           = "staging"
  service_name          = "ikaro-backend"
  service_account_email = "ikaro-backend@ikaro-staging.iam.gserviceaccount.com"
  port                  = 3001
  image                 = "gcr.io/cloudrun/hello"
  max_instance_count    = 6
  min_instance_count    = 0
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

# Sidecar wiring (M17-S34) — otel-collector activation. Deliberately NO
# depends_on/startup_probe gating between the app container and any sidecar
# (removed 2026-08-04, cross-tool PR review finding on PR #318, confirmed
# via a docker-compose depends_on: condition: service_healthy reproduction):
# gating the app's own startup on a sidecar's health probe means Cloud Run
# never starts the app at all if the sidecar fails to become healthy — the
# opposite of "app boots even if the collector crashes". These tests lock
# in the corrected (non-blocking) behavior as a regression guard.

run "no_sidecar_containers_means_single_container" {
  command = plan

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].containers) == 1
    error_message = "Empty sidecar_containers (the default) must produce exactly one container — no sidecar block emitted."
  }
}

run "sidecar_containers_never_gate_app_startup_on_sidecar_health" {
  command = plan

  variables {
    sidecar_containers = [{
      name   = "otel-collector"
      image  = "otel/opentelemetry-collector-contrib@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6"
      cpu    = "0.1"
      memory = "128Mi"
    }]
  }

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].containers) == 2
    error_message = "A single sidecar_containers entry must add exactly one more container to the revision."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[0].depends_on == null
    error_message = "The app container must never depend_on a sidecar — a crashed/unhealthy sidecar must not block the app from starting (M17-S34 correction)."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[1].name == "otel-collector"
    error_message = "Sidecar container name must match what was configured."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].containers[1].startup_probe) == 0
    error_message = "A sidecar container must never get a startup_probe — nothing depends_on it, so a probe here would only add a pointless startup delay for the sidecar itself."
  }
}
