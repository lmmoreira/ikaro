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

# Sidecar wiring (M17-S34) — otel-collector activation. Schema confirmed
# against provider v7.40.0 (2026-08-04): containers.depends_on is a plain
# list(string) attribute; startup_probe is a nested block.

run "no_sidecar_containers_means_no_dependency_and_single_container" {
  command = plan

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].containers) == 1
    error_message = "Empty sidecar_containers (the default) must produce exactly one container — no sidecar block emitted."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].containers[0].depends_on) == 0
    error_message = "With no sidecar_containers, the app container must have no depends_on entries."
  }
}

run "sidecar_with_health_check_gets_startup_probe_and_app_depends_on_it" {
  command = plan

  variables {
    sidecar_containers = [{
      name              = "otel-collector"
      image             = "otel/opentelemetry-collector-contrib@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6"
      cpu               = "0.1"
      memory            = "128Mi"
      health_check_port = 13133
      health_check_path = "/"
    }]
  }

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].containers) == 2
    error_message = "A single sidecar_containers entry must add exactly one more container to the revision."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].containers[0].depends_on) == 1 && contains(google_cloud_run_v2_service.this.template[0].containers[0].depends_on, "otel-collector")
    error_message = "The app container must depend_on every sidecar's name, so Cloud Run starts the app only after the sidecar's own probe passes."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[1].name == "otel-collector"
    error_message = "Sidecar container name must match what was configured."
  }

  assert {
    condition     = google_cloud_run_v2_service.this.template[0].containers[1].startup_probe[0].http_get[0].path == "/" && google_cloud_run_v2_service.this.template[0].containers[1].startup_probe[0].http_get[0].port == 13133
    error_message = "A sidecar with health_check_port/health_check_path set must get a matching http_get startup_probe."
  }
}

run "sidecar_without_health_check_gets_no_startup_probe" {
  command = plan

  variables {
    sidecar_containers = [{
      name   = "otel-collector"
      image  = "otel/opentelemetry-collector-contrib@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6"
      cpu    = "0.1"
      memory = "128Mi"
      # health_check_port / health_check_path left null (both, per the
      # variable's own validation rule)
    }]
  }

  assert {
    condition     = length(google_cloud_run_v2_service.this.template[0].containers[1].startup_probe) == 0
    error_message = "A sidecar with no health_check_port/path must get no startup_probe block."
  }
}
