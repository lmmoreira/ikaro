# Environment composition — modules are instantiated here as their Wave 2
# stories land (module dependency graph in ../../README.md):
#
#   network (M17-S12) → database (M17-S13)
#   storage (M17-S14), secrets (M17-S16)
#   → cloudrun-service (M17-S18) → pubsub (M17-S19), migrate-job (M17-S20)
#   → scheduler (M17-S21), monitoring (M17-S35)
#
# registry (M17-S15) and edge (M17-S22) are instantiated in envs/prod only.
# iam (M17-S17, originally composed here) is Foundation-owned since TD34 —
# see foundation/envs/<env>/main.tf, not this file.

locals {
  # Fixed, self-chosen OIDC audience for Pub/Sub push -> backend (S19).
  # NOT derived from the service's own URL: a real staging apply (2026-07-19)
  # proved the *.run.app URL is a per-project hash (e.g.
  # "ikaro-backend-crle4i3nrq-rj.a.run.app"), not the deterministic
  # project-number format an earlier assumption relied on -- and even if it
  # were deterministic, a module cannot take its own output as one of its
  # own inputs anyway. custom_audiences (modules/cloudrun-service) lets the
  # backend accept this fixed string as a valid audience regardless of its
  # real URL; S19's push subscription mints its OIDC token with the same
  # value. Per Google's own docs a custom audience need not be URL-shaped.
  backend_pubsub_audience = "ikaro-backend-${var.environment}-pubsub-push"

  # Digest-pinned (not a mutable tag): each service's runtime SA keeps its
  # Secret Manager / storage / Pub/Sub grants regardless of what env vars are
  # mounted, so a repointed tag would still run with those permissions — a
  # digest can't be silently repointed. Re-pin by re-running `gcloud
  # container images describe gcr.io/cloudrun/hello --format
  # 'value(image_summary.digest)'` if this ever needs to move (review
  # finding, 2026-07-19). Replaced entirely once S27's real pipeline image
  # lands — ignore_changes in modules/cloudrun-service keeps this from
  # fighting that transition.
  bootstrap_image = "gcr.io/cloudrun/hello@sha256:3beb8d6dd8bac1c597d10f3ddf59f5f684d6054ab589c4334c0486dad07a3f97"

  # otel-collector sidecar (M17-S34) — same bootstrap-placeholder reasoning
  # as bootstrap_image above: the first `terraform apply` after this story
  # lands must not depend on build-otel-collector.yml having already pushed
  # ikaro-otel-collector to GAR, so this pins the public upstream image by
  # digest instead (matches infra/docker/otel-collector/Dockerfile's own
  # pin, confirmed 2026-08-04 via `docker pull
  # otel/opentelemetry-collector-contrib:0.157.0`). The pipeline takes over
  # from here via modules/cloudrun-service's ignore_changes on
  # containers[1].image — see infra/docker/otel-collector/README.md.
  otel_collector_bootstrap_image = "otel/opentelemetry-collector-contrib@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6"

  otel_collector_sidecar = [{
    name   = "otel-collector"
    image  = local.otel_collector_bootstrap_image
    cpu    = "0.1"
    memory = "128Mi"
  }]
}

module "network" {
  source = "../../modules/network"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels
}

module "database" {
  source = "../../modules/database"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  network_id                  = module.network.network_id
  private_services_connection = module.network.private_services_connection

  db_tier             = var.db_tier
  iam_admin_user      = var.iam_admin_user
  enable_pitr         = false
  deletion_protection = false
}

# Unconditional (unlike database): empty/near-empty GCS buckets cost
# effectively nothing, so there's no reason to gate creation behind a flag.
module "storage" {
  source = "../../modules/storage"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  cors_origins = var.cors_origins
}

# Unconditional, same reasoning as storage: empty Secret Manager containers
# cost effectively nothing. No values, no IAM here — foundation/modules/runtime-identities
# grants the per-SA accessor bindings (Foundation-owned since TD34, applied only via the
# protected foundation-deploy.yml workflow_dispatch — never automatically on a normal
# envs/* apply, so a new secret here needs a separate manual Foundation apply afterward).
module "secrets" {
  source = "../../modules/secrets"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels
}

locals {
  runtime_sa_emails = {
    backend        = "ikaro-backend@${var.project_id}.iam.gserviceaccount.com"
    bff            = "ikaro-bff@${var.project_id}.iam.gserviceaccount.com"
    web            = "ikaro-web@${var.project_id}.iam.gserviceaccount.com"
    pubsub_invoker = "ikaro-pubsub-invoker@${var.project_id}.iam.gserviceaccount.com"
    migrate        = "ikaro-migrate@${var.project_id}.iam.gserviceaccount.com"
  }
}

# Runtime identities and their secret-accessor grants are Foundation-owned
# (TD34). The protected Foundation apply must complete before a normal
# environment apply that creates or updates a secret-mounting workload.
resource "time_sleep" "iam_propagation" {
  create_duration = "30s"
}

# Internal-ingress only (D4/D1) — no public URL. Direct VPC egress for Cloud
# SQL's private IP. db_pool_size + db_tier feed the module's own
# connection-math invariant on backend_max_instances (M17 plan §S18).
module "cloudrun_backend" {
  source = "../../modules/cloudrun-service"

  depends_on = [time_sleep.iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-backend"
  image                 = local.bootstrap_image
  bootstrap_mode        = false
  port                  = 3001
  service_account_email = local.runtime_sa_emails.backend
  execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
  custom_audiences      = [local.backend_pubsub_audience]

  ingress    = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  vpc_egress = "PRIVATE_RANGES_ONLY"
  network_id = module.network.network_id
  subnet_id  = module.network.subnet_id

  min_instance_count = 0
  max_instance_count = var.backend_max_instances
  db_pool_size       = 3
  db_tier            = var.db_tier

  sidecar_containers = local.otel_collector_sidecar

  health_check_ready_path = "/health/ready"
  health_check_live_path  = "/health/live"

  env_vars = merge(
    {
      NODE_ENV    = "production"
      APP_ENV     = "staging"
      GCP_PROJECT = var.project_id
      LOG_LEVEL   = "DEBUG"

      # DB_NAME derives from modules/database's own output (single source of
      # truth for the google_sql_database.ikaro name) rather than a second
      # hardcoded "ikaro" literal.
      # TD33 — DB_INSTANCE_CONNECTION_NAME (not a raw private-IP DB_HOST) routes the backend
      # through the Cloud SQL Connector for a verified, auto-rotating TLS connection.
      DB_INSTANCE_CONNECTION_NAME = module.database.instance_connection_name
      DB_USER                     = var.db_user
      DB_NAME                     = module.database.database_name
      DB_POOL_SIZE                = "3"

      PUBSUB_PROJECT_ID           = var.project_id
      PUBSUB_CONSUMER_MODE        = "push"
      PUBSUB_AUTO_CREATE          = "false"
      PUBSUB_PUSH_AUDIENCE        = local.backend_pubsub_audience
      PUBSUB_PUSH_SERVICE_ACCOUNT = local.runtime_sa_emails.pubsub_invoker

      GCS_BUCKET_NAME        = module.storage.uploads_bucket_name
      GCS_PUBLIC_BUCKET_NAME = module.storage.public_bucket_name

      EMAIL_ADAPTER = "brevo"
      EMAIL_FROM    = "noreply@ikaro.online"

      # TD38: var.web_real_uri (bootstrap-placeholder), not a live module.cloudrun_web.service_uri
      # reference — cloudrun_web's own BFF_UPSTREAM_URL now references module.cloudrun_bff.service_uri
      # live, and module.cloudrun_bff.env_vars references module.cloudrun_backend.service_uri
      # (BACKEND_INTERNAL_URL) live, so a live reference here would complete a 3-node cycle
      # (web -> bff -> backend -> web). Only one edge among backend/bff/web may be a live
      # module reference at a time — see cloudrun_bff's ALLOWED_ORIGINS/FRONTEND_URL comment.
      FRONTEND_URL = var.web_real_uri

      # M19-S02: platform-wide chatbot LLM provider default — a plain env var (not a secret)
      # deliberately, so ops can fail over to another provider in minutes without a deploy.
      CHATBOT_LLM_PROVIDER = "openrouter"
      # M19-S05/S06: platform-wide chatbot cost/abuse-prevention backstops — plain env vars
      # (not secrets, not tenants.settings) so ops can change them via a Terraform var update +
      # apply (a new Cloud Run revision, no application code build/test/deploy) during a real
      # incident, without waiting for the next app release. Final, confirmed values — not
      # placeholders.
      CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD     = "25"
      CHATBOT_MIN_PROVIDER_BALANCE_USD         = "2"
      CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES = "5"
      OUTBOX_CLAIM_LEASE_SECONDS               = "120"
    },
    # BREVO_SMTP_LOGIN is optional-with-min-length in the backend schema — a
    # present "" satisfies "not absent" but fails min(1), crashing app boot
    # the moment bootstrap_mode flips off and a real image reads it. Omit
    # the key entirely rather than pass an empty string (CodeRabbit finding,
    # 2026-07-19).
    var.brevo_smtp_login != "" ? { BREVO_SMTP_LOGIN = var.brevo_smtp_login } : {}
  )

  secret_env_vars = {
    DB_PASSWORD               = module.secrets.secret_ids["db-password"]
    PLATFORM_ADMIN_KEY        = module.secrets.secret_ids["platform-admin-key"]
    INTERNAL_API_KEY          = module.secrets.secret_ids["internal-api-key"]
    HOTSITE_REVALIDATE_SECRET = module.secrets.secret_ids["hotsite-revalidate-secret"]
    JWT_SECRET                = module.secrets.secret_ids["jwt-secret"]
    BREVO_SMTP_KEY            = module.secrets.secret_ids["brevo-smtp-key"]
    # M19-S02: only the OpenRouter adapter is built yet (S03 builds Anthropic/OpenAI), but all 3
    # secret containers + this wiring land together — see SECRETS.md. Each secret's real value
    # must be populated via `gcloud secrets versions add` before this apply runs, or Cloud Run
    # revision creation fails resolving secret_key_ref against a zero-version secret.
    OPENROUTER_API_KEY = module.secrets.secret_ids["openrouter-api-key"]
    ANTHROPIC_API_KEY  = module.secrets.secret_ids["anthropic-api-key"]
    OPENAI_API_KEY     = module.secrets.secret_ids["openai-api-key"]
  }
}

# Internal-ingress only (TD38: BFF's allUsers public invoker grant is removed — the only
# caller is ikaro-web's IAM-authenticated server-side call, mirroring how the backend already
# treats BFF). ALL_TRAFFIC egress: *.run.app resolves to public IPs, so PRIVATE_RANGES_ONLY
# would route the backend call outside the VPC and internal ingress would reject it (M17 §0).
module "cloudrun_bff" {
  source = "../../modules/cloudrun-service"

  depends_on = [time_sleep.iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-bff"
  image                 = local.bootstrap_image
  bootstrap_mode        = false
  port                  = 3002
  service_account_email = local.runtime_sa_emails.bff
  max_instance_count    = var.bff_max_instances

  ingress    = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  vpc_egress = "ALL_TRAFFIC"
  network_id = module.network.network_id
  subnet_id  = module.network.subnet_id

  sidecar_containers = local.otel_collector_sidecar

  health_check_ready_path = "/v1/health/ready"
  health_check_live_path  = "/v1/health/live"

  env_vars = {
    NODE_ENV    = "production"
    APP_ENV     = "staging"
    GCP_PROJECT = var.project_id
    LOG_LEVEL   = "DEBUG"

    BACKEND_INTERNAL_URL = module.cloudrun_backend.service_uri
    GOOGLE_CALLBACK_URL  = "${var.web_real_uri}/v1/auth/google/callback"
    # TD38: both use var.web_real_uri (the bootstrap-placeholder pattern), not
    # module.cloudrun_web.service_uri — a live reference here would complete a 3-node module
    # cycle: cloudrun_web's own BFF_UPSTREAM_URL below references module.cloudrun_bff.service_uri
    # live, and this module's own BACKEND_INTERNAL_URL above references
    # module.cloudrun_backend.service_uri live, so web -> bff -> backend -> web would all be
    # live references at once (Terraform requires a one-directional DAG; confirmed via a real
    # `terraform validate` cycle error during implementation — cloudrun_backend's own
    # FRONTEND_URL was switched to var.web_real_uri for the same reason).
    ALLOWED_ORIGINS = var.web_real_uri
    FRONTEND_URL    = var.web_real_uri

    # M17 §2: ENABLE_DEV_AUTH=true only in staging.
    ENABLE_DEV_AUTH   = "true"
    BACKEND_AUTH_MODE = "iam"
  }

  secret_env_vars = {
    JWT_SECRET           = module.secrets.secret_ids["jwt-secret"]
    INTERNAL_API_KEY     = module.secrets.secret_ids["internal-api-key"]
    GOOGLE_CLIENT_ID     = module.secrets.secret_ids["google-oauth-client-id"]
    GOOGLE_CLIENT_SECRET = module.secrets.secret_ids["google-oauth-client-secret"]
    # TD38: app-layer defense-in-depth companion to the IAM lockdown above — checked by
    # WebOnlyGuard against the X-Web-Internal-Key header ikaro-web sends on every call.
    WEB_INTERNAL_KEY = module.secrets.secret_ids["web-internal-key"]
  }
}

# Public (browsers must reach it directly, D5). NEXT_PUBLIC_* are Cloud Run runtime env vars
# (not build args) as of TD29 — wired here for staging (M17-S25); M17-S26 adds prod's
# equivalents with prod-specific values (the fixed ikaro.online domain, no bootstrap-uri dance
# needed there). TD38: web now needs VPC egress too — its same-origin gateway
# (apps/web/app/v1/[...path]/route.ts) calls BFF's internal-only service URI directly, not a
# public BFF URL.
module "cloudrun_web" {
  source = "../../modules/cloudrun-service"

  depends_on = [time_sleep.iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-web"
  image                 = local.bootstrap_image
  bootstrap_mode        = false
  port                  = 3000
  service_account_email = local.runtime_sa_emails.web
  # memory left at the module default (512Mi) -- GCP rejects <512Mi with
  # EXECUTION_ENVIRONMENT_GEN2 (confirmed by a real staging apply, 2026-07-19:
  # the story's original "256Mi" spec silently conflicted with "second-gen
  # execution environment", a combination no static check catches).

  ingress    = "INGRESS_TRAFFIC_ALL"
  vpc_egress = "ALL_TRAFFIC"
  network_id = module.network.network_id
  subnet_id  = module.network.subnet_id

  health_check_ready_path = "/api/health/ready"
  health_check_live_path  = "/api/health/live"

  env_vars = {
    NODE_ENV = "production"
    APP_ENV  = "staging"

    # Runtime env vars (TD29) — read at request time by
    # apps/web/shared/lib/runtime-env/public-env.ts, not baked into the
    # image at build time.
    #
    # Browser calls stay on the web origin through the /v1 gateway. The web server alone uses
    # BFF_UPSTREAM_URL to reach BFF's internal-only service URI over the VPC (TD38: BFF no
    # longer has a public URL at all) — a live module reference now that it's the only
    # bff<->web direction using one (see cloudrun_bff's ALLOWED_ORIGINS/FRONTEND_URL comment).
    NEXT_PUBLIC_BFF_URL                = "/v1"
    BFF_UPSTREAM_URL                   = "${module.cloudrun_bff.service_uri}/v1"
    NEXT_PUBLIC_SITE_URL               = var.web_real_uri
    NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = module.storage.public_base_url

    # TD38: BFF only accepts calls carrying a valid Google ID token now — web mints one and
    # attaches it on every server-side call (route.ts, bff-server.ts).
    BFF_AUTH_MODE = "iam"
  }

  # apps/web/middleware.ts verifies the access_token cookie's HS256 signature
  # (TD15, verify-edge-jwt.ts) before trusting any claim — needs the same
  # JWT_SECRET the BFF signs with, or every request past the gateway 500s
  # the moment a real cookie reaches this origin (TD35 same-origin gateway
  # made that finally happen — this gap was latent and untriggered before).
  #
  # apps/web/app/api/revalidate/route.ts compares the incoming secret against
  # this same value — without it here, process.env.HOTSITE_REVALIDATE_SECRET
  # is undefined on web, so the backend's real secret (already wired below on
  # cloudrun_backend) can never match and every hotsite publish revalidation
  # silently 401s.
  secret_env_vars = {
    JWT_SECRET                = module.secrets.secret_ids["jwt-secret"]
    HOTSITE_REVALIDATE_SECRET = module.secrets.secret_ids["hotsite-revalidate-secret"]
    # TD38: sent as X-Web-Internal-Key on every BFF call — the same value BFF's own
    # WEB_INTERNAL_KEY (cloudrun_bff above) checks against.
    WEB_INTERNAL_KEY = module.secrets.secret_ids["web-internal-key"]
  }
}

module "pubsub" {
  source = "../../modules/pubsub"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  backend_push_endpoint   = "${module.cloudrun_backend.service_uri}/pubsub/push"
  backend_pubsub_audience = local.backend_pubsub_audience
  pubsub_invoker_sa_email = local.runtime_sa_emails.pubsub_invoker
}

# Migration Cloud Run Job (M17-S20) — CI-triggered pipeline stage
# (`gcloud run jobs execute ikaro-migrate --wait`), a hard prerequisite
# before every backend/bff/web deploy (D1). Dedicated ikaro-migrate@ SA, not
# a reuse of the backend runtime SA (least privilege — story-discovery,
# 2026-07-20). bootstrap_mode gates db-migrator-password the same way
# cloudrun-service gates its own secrets — the container has zero versions
# until the S27 activation runbook populates it.
module "migrate_job" {
  source = "../../modules/migrate-job"

  depends_on = [time_sleep.iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  image                 = local.bootstrap_image
  bootstrap_mode        = false
  service_account_email = local.runtime_sa_emails.migrate

  network_id = module.network.network_id
  subnet_id  = module.network.subnet_id

  env_vars = {
    NODE_ENV = "production"
    APP_ENV  = "staging"

    # TD33 — Cloud SQL Connector, not raw private-IP DB_HOST (see backend service block above).
    DB_INSTANCE_CONNECTION_NAME = module.database.instance_connection_name
    DB_MIGRATOR_USER            = var.db_migrator_user
    DB_NAME                     = module.database.database_name
  }

  secret_env_vars = {
    DB_MIGRATOR_PASSWORD = module.secrets.secret_ids["db-migrator-password"]
  }
}

# Cloud Scheduler cron jobs (M17-S21) — publish ticks to the 4 cron topics
# S19 provisions. No custom Scheduler SA: pubsub_target jobs have no
# service-account field, so the built-in Cloud Scheduler service agent
# publishes directly (module grants it pubsub.publisher on each topic).
module "scheduler" {
  source = "../../modules/scheduler"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  cron_topic_ids        = module.pubsub.topic_ids
  outbox_relay_schedule = var.outbox_relay_schedule
}

# Dashboards, alerts & uptime checks as code (M17-S35, narrowed 2026-08-08 —
# see plan/M17-CLOUD-DEPLOY.md's M17-S35 section for the split rationale).
# Staging always has a database (no enable_edge-style gating here, unlike
# prod below), so database_instance_name is unconditional. uptime_checks is
# NOT fully unconditional in the same way, though — see that block's own
# comment for why bff's check routes through web, not BFF's own URL.
module "monitoring" {
  source = "../../modules/monitoring"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  notification_email = var.notification_email

  cloud_run_services = {
    backend = { service_name = module.cloudrun_backend.service_name, max_instance_count = var.backend_max_instances }
    bff     = { service_name = module.cloudrun_bff.service_name, max_instance_count = var.bff_max_instances }
    # web has no explicit max_instances override in this env — matches
    # modules/cloudrun-service's own var.max_instance_count default (100).
    web = { service_name = module.cloudrun_web.service_name, max_instance_count = 100 }
  }

  database_instance_name = module.database.instance_name

  # bff's own service_uri is NOT used here: TD38 locked staging's BFF
  # ingress to INGRESS_TRAFFIC_INTERNAL_ONLY (same as backend, confirmed
  # ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY" above) with no public invoker
  # grant and no ALB in staging (D5, "Staging has no LB") — Cloud
  # Monitoring's uptime prober runs from Google's external infrastructure
  # and could never reach it, so a check against BFF's raw URL would fail
  # every single period regardless of BFF's actual health. Routed through
  # web's own reachable host + the /v1 gateway path instead — the exact
  # same path deploy-staging.yml's smoke test already uses
  # (`curl "${WEB_URL}/v1/health/ready"`), and BFF's own /v1/health/ready
  # already chains through to backend's readiness too (see
  # apps/bff/src/health/health.controller.ts), so this single check covers
  # web -> bff -> backend end to end.
  uptime_checks = {
    bff = {
      host    = replace(module.cloudrun_web.service_uri, "https://", "")
      path    = "/v1/health/ready"
      use_ssl = true
    }
    web = {
      host    = replace(module.cloudrun_web.service_uri, "https://", "")
      path    = "/api/health/live"
      use_ssl = true
    }
  }
}
