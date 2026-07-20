# modules/migrate-job — Cloud Run Job running TypeORM migrations, triggered by
# the deploy pipeline (`gcloud run jobs execute ikaro-migrate --wait`) as a
# hard prerequisite before every backend/bff/web deploy (M17-S20, D1).
#
# google_cloud_run_v2_job schema verified against provider v7.40.0's own
# schema (2026-07-20, `terraform providers schema -json`) — a Job nests its
# execution config one level deeper than a Service (template.template, the
# "task template", not template directly) and has no ingress/scaling blocks
# at all: a Job is triggered by an explicit `jobs.run` API call, never HTTP
# traffic, so it also has no health probes to configure (unlike
# modules/cloudrun-service's startup/liveness probes).

resource "google_cloud_run_v2_job" "this" {
  name                = var.job_name
  location            = var.region
  project             = var.project_id
  labels              = merge(var.labels, { service = var.job_name })
  deletion_protection = var.deletion_protection

  template {
    template {
      service_account       = var.service_account_email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      max_retries           = var.max_retries
      timeout               = var.timeout

      vpc_access {
        egress = var.vpc_egress

        network_interfaces {
          network    = var.network_id
          subnetwork = var.subnet_id
        }
      }

      containers {
        name    = "migrate"
        image   = var.image
        command = var.command

        resources {
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

        # Gated behind bootstrap_mode, same reasoning as
        # modules/cloudrun-service: the S16/S20 secret containers exist with
        # zero versions until the S27/S37 activation runbooks populate real
        # values, and Cloud Run resolves a secret_key_ref at
        # revision-creation time (not lazily inside the container) — for a
        # Job that means at `terraform apply`, not at `jobs execute`.
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
      }
    }
  }

  # The pipeline owns the image (post-S27/S37); Terraform owns everything
  # else — same convention as modules/cloudrun-service.
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image]
  }
}
