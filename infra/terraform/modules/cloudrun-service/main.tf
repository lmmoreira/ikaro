# modules/cloudrun-service — generic Cloud Run v2 service (backend/BFF/web are three
# instantiations of this same module from envs/<env>/main.tf). Implemented M17-S18.
#
# google_cloud_run_v2_service.ingress enum verified against provider v7.40.0's own
# schema (2026-07-19): INGRESS_TRAFFIC_ALL / INGRESS_TRAFFIC_INTERNAL_ONLY /
# INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER — see variables.tf's validation.

locals {
  # bootstrap_mode (S18 launch state): the placeholder image (gcr.io/cloudrun/hello)
  # doesn't implement /health/*, so probes target "/" until S27 deploys a real image.
  effective_ready_path = var.bootstrap_mode ? "/" : var.health_check_ready_path
  effective_live_path  = var.bootstrap_mode ? "/" : var.health_check_live_path

  # Shared with variables.tf's max_instance_count validation (a variable's own
  # validation condition can reference a local as long as it also references
  # the variable being validated — see the comment there).
  tier_max_connections = {
    "db-f1-micro" = 25
    "db-g1-small" = 50
  }
}

resource "google_cloud_run_v2_service" "this" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
  ingress  = var.ingress
  labels   = merge(var.labels, { service = var.service_name })

  deletion_protection = var.deletion_protection

  # Service-level (combined across all revisions), not template-level: the
  # provider schema is explicit that template.scaling is per-revision, while
  # this one is "combined maximum number of instances for all revisions
  # receiving traffic." During a rolling deploy the old and new revisions
  # both serve traffic simultaneously — a per-revision cap lets each one
  # independently reach max_instance_count, doubling the real ceiling (and
  # doubling backend's DB connection count against db_tier's limit). Review
  # finding, 2026-07-19.
  scaling {
    min_instance_count = var.min_instance_count
    max_instance_count = var.max_instance_count
  }

  template {
    service_account       = var.service_account_email
    execution_environment = var.execution_environment

    dynamic "vpc_access" {
      for_each = var.vpc_egress == null ? [] : [var.vpc_egress]

      content {
        egress = vpc_access.value

        network_interfaces {
          network    = var.network_id
          subnetwork = var.subnet_id
        }
      }
    }

    # Primary app container — must stay the first `containers` block so
    # template[0].containers[0] (the lifecycle.ignore_changes target below) is always
    # this one, regardless of how many sidecars follow.
    containers {
      name  = "app"
      image = var.image

      ports {
        container_port = var.port
      }

      resources {
        cpu_idle          = true
        startup_cpu_boost = true

        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      dynamic "env" {
        for_each = var.env_vars

        content {
          name  = env.key
          value = env.value
        }
      }

      # Gated behind bootstrap_mode, unlike env_vars above: the S16 secret
      # containers exist with zero versions until the S27/S37 activation
      # runbooks populate real values out-of-band (M17 §2 — Terraform never
      # writes secret values). Cloud Run resolves a secret_key_ref at
      # revision-creation time (not lazily inside the container), so mounting
      # an unversioned secret now would fail the very deploy this story's
      # first acceptance criterion needs to succeed. bootstrap_mode=false
      # (S27) is exactly the point real values start existing.
      dynamic "env" {
        for_each = var.bootstrap_mode ? {} : var.secret_env_vars

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      # Cloud Run has startup + liveness probes only — no readiness probe (a running
      # instance that loses a dependency is never pulled from rotation; M17 §S18).
      # failure_threshold=18 * period_seconds=10 = 180s budget. Google's own
      # Direct VPC docs: "You might experience connection establishment
      # delays of a minute or more on instance startup" — the previous
      # 3*10=30s budget could kill a legitimate revision still establishing
      # its VPC connection, well before the app ever gets a chance to serve
      # traffic. Review finding, 2026-07-19.
      startup_probe {
        http_get {
          path = local.effective_ready_path
        }
        period_seconds    = 10
        timeout_seconds   = 3
        failure_threshold = 18
      }

      liveness_probe {
        http_get {
          path = local.effective_live_path
        }
        period_seconds  = 10
        timeout_seconds = 3
      }
    }

    # Sidecar support (S34 activates a real otel-collector image here) — empty by
    # default, so this is a no-op until then.
    dynamic "containers" {
      for_each = { for c in var.sidecar_containers : c.name => c }

      content {
        name  = containers.value.name
        image = containers.value.image

        resources {
          limits = {
            cpu    = containers.value.cpu
            memory = containers.value.memory
          }
        }
      }
    }
  }

  # The pipeline owns the image (post-S27); Terraform owns everything else. Without
  # this, every `terraform apply` after a real deploy would roll the image back to
  # whatever's in this file.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_service_iam_member" "invoker" {
  for_each = toset(var.invoker_members)

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = each.value
}

# Public invoker grant (bff/web only — the app does its own auth on top; internal
# ingress + InternalApiGuard/PLATFORM_ADMIN_KEY protect the backend regardless). This
# is the one deliberate allUsers grant CKV_IKARO_1 exists to catch everywhere else.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count = var.allow_unauthenticated ? 1 : 0

  #checkov:skip=CKV_IKARO_1: intentional public invoker grant — bff/web perform their
  # own application-level auth (JWT/session cookie), matching the S07 org-policy
  # exception granted specifically for allow-unauthenticated Cloud Run services
  # (M17 §2). See CLAUDE.md §8's IAM binding review discipline.
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
