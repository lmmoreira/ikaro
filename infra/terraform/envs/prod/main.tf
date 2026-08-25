# Environment composition — modules are instantiated here as their Wave 2
# stories land (module dependency graph in ../../README.md):
#
#   network (M17-S12) → database (M17-S13)
#   storage (M17-S14), secrets (M17-S16)
#   → cloudrun-service (M17-S18) → pubsub (M17-S19), migrate-job (M17-S20)
#   → scheduler (M17-S21), monitoring (M17-S35)
#
# registry (M17-S15) and edge (M17-S22) are instantiated in THIS env only (D8/D5).
# iam (M17-S17, originally composed here) is Foundation-owned since TD34 —
# see foundation/envs/<env>/main.tf, not this file.
#
# Composed but NOT applied yet — prod stays plan-only until the S24 pipeline /
# S37 go-live (M17-S12 discovery decision).

locals {
  # Fixed, self-chosen OIDC audience for Pub/Sub push -> backend (S19).
  # NOT derived from the service's own URL: a real staging apply (2026-07-19)
  # proved the *.run.app URL is a per-project hash, not the deterministic
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

  # Single source of truth for the branded domain (D11) — was hardcoded as
  # the literal "ikaro.online" in 5 places across this file (backend/bff env
  # vars, the edge module's own root_domain input); interpolating one local
  # everywhere prevents the domain drifting between call sites if it's ever
  # changed (CodeRabbit finding, 2026-07-20).
  root_domain = "ikaro.online"
}

module "network" {
  source = "../../modules/network"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels
}

# Deferred (TD30, 2026-07-22): count=0 until S37's deliberate go-live apply
# flips enable_database=true in terraform.tfvars — decoupled from
# registry/IAM/secrets so those can apply independently (M17-S27 needs the
# registry; a real instance shouldn't exist just because someone approved
# an unrelated apply). PITR + deletion protection are prod law once it
# does land.
module "database" {
  count  = var.enable_database ? 1 : 0
  source = "../../modules/database"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  network_id                  = module.network.network_id
  private_services_connection = module.network.private_services_connection

  db_tier             = var.db_tier
  iam_admin_user      = var.iam_admin_user
  enable_pitr         = true
  deletion_protection = true
}

# Unconditional (unlike database): empty/near-empty GCS buckets cost
# effectively nothing, so there's no reason to gate creation behind a flag.
# Composed but not applied yet — same plan-only status as the rest of this
# env root until S24/S37.
module "storage" {
  source = "../../modules/storage"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  cors_origins                 = var.cors_origins
  booking_photo_retention_days = var.booking_photo_retention_days
}

# Unconditional, same reasoning as storage. No values, no IAM here —
# foundation/modules/runtime-identities grants the per-SA accessor bindings
# (Foundation-owned since TD34, applied only via the protected foundation-deploy.yml
# workflow_dispatch — never automatically on a normal envs/* apply, so a new secret
# here needs a separate manual Foundation apply afterward).
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
# Composed but not applied yet — same plan-only status as the rest of this
# env root until S24/S37.
module "cloudrun_backend" {
  source = "../../modules/cloudrun-service"

  depends_on = [time_sleep.iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-backend"
  image                 = local.bootstrap_image
  bootstrap_mode        = var.bootstrap_mode
  port                  = 3001
  service_account_email = local.runtime_sa_emails.backend
  execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
  deletion_protection   = true
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
      APP_ENV     = "production"
      GCP_PROJECT = var.project_id

      # M17-S34 / D12: OTEL_TRACES_SAMPLER_ARG defaults to 1.0 (100%,
      # env.validation.ts) — staging keeps that default (full sampling for
      # debugging), prod must override to 10% or it silently ships at full
      # sampling cost. Named cost tradeoff (D12): the trace volume/Cloud
      # Trace ingestion cost this avoids is why 10% was chosen over 100%,
      # accepted for a pre-traffic budget target.
      OTEL_TRACES_SAMPLER_ARG = "0.1"

      # DB_NAME derives from modules/database's own output (single source of
      # truth for the google_sql_database.ikaro name) rather than a second
      # hardcoded "ikaro" literal.
      # TD33 — DB_INSTANCE_CONNECTION_NAME (not a raw private-IP DB_HOST) routes the backend
      # through the Cloud SQL Connector for a verified, auto-rotating TLS connection.
      DB_INSTANCE_CONNECTION_NAME = try(module.database[0].instance_connection_name, "")
      DB_USER                     = var.db_user
      DB_NAME                     = try(module.database[0].database_name, "ikaro")
      DB_POOL_SIZE                = "3"

      PUBSUB_PROJECT_ID           = var.project_id
      PUBSUB_CONSUMER_MODE        = "push"
      PUBSUB_AUTO_CREATE          = "false"
      PUBSUB_PUSH_AUDIENCE        = local.backend_pubsub_audience
      PUBSUB_PUSH_SERVICE_ACCOUNT = local.runtime_sa_emails.pubsub_invoker

      GCS_BUCKET_NAME        = module.storage.uploads_bucket_name
      GCS_PUBLIC_BUCKET_NAME = module.storage.public_bucket_name

      EMAIL_ADAPTER = "brevo"
      EMAIL_FROM    = "noreply@${local.root_domain}"

      # Final branded domain (D11) — used for links in emails etc. regardless
      # of ingress mode; unlike GOOGLE_CALLBACK_URL below, nothing needs this
      # host to actually resolve yet.
      FRONTEND_URL = "https://${local.root_domain}"

      # M19-S02: platform-wide chatbot LLM provider default — a plain env var (not a secret)
      # deliberately, so ops can fail over to another provider in minutes without a deploy.
      CHATBOT_LLM_PROVIDER = "openrouter"
      # M19-S05/S06: platform-wide chatbot cost/abuse-prevention backstops — plain env vars
      # (not secrets, not tenants.settings) so ops can change them via a Terraform var update +
      # apply (a new Cloud Run revision, no application code build/test/deploy) during a real
      # incident, without waiting for the next app release. Final, confirmed values — not
      # placeholders.
      CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD     = "1"
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
    # cloudflare-api-token exists in this env's secret catalog (S16) and the
    # backend SA can already read it (S17), but the app doesn't consume it
    # until S40 adds both the env.validation.ts field and this wiring
    # together — not premature to wire alone.

    # M19-S02: only the OpenRouter adapter is built yet (S03 builds Anthropic/OpenAI), but all 3
    # secret containers + this wiring land together — see SECRETS.md. Each secret's real value
    # must be populated via `gcloud secrets versions add` before this apply runs, or Cloud Run
    # revision creation fails resolving secret_key_ref against a zero-version secret. Lower risk
    # here than staging since bootstrap_mode is still true in prod (secret_env_vars ignored).
    OPENROUTER_API_KEY = module.secrets.secret_ids["openrouter-api-key"]
    ANTHROPIC_API_KEY  = module.secrets.secret_ids["anthropic-api-key"]
    OPENAI_API_KEY     = module.secrets.secret_ids["openai-api-key"]
    # M19-S08: distinct Management/Provisioning key, not OPENROUTER_API_KEY above — see
    # SECRETS.md. Per TD39, the foundation SA accessor grant lands in a genuine follow-up PR
    # (can't be in the same PR as this envs/* change). Same bootstrap_mode caveat as above.
    OPENROUTER_MANAGEMENT_API_KEY = module.secrets.secret_ids["openrouter-management-api-key"]
  }
}

# Internal-load-balancer ingress (S22): the raw *.run.app URL no longer
# accepts direct internet traffic — only the Global external ALB's
# serverless NEG can reach it. Its Foundation-owned public invoker grant stays
# in place: the app's public-auth model doesn't rely on Cloud Run IAM checks (that's
# S47/future scope, M17 §2) — narrowing ingress changes the network path,
# not who's allowed to call once traffic arrives via the LB. ALL_TRAFFIC
# egress unchanged: *.run.app resolves to public IPs, so PRIVATE_RANGES_ONLY
# would route the backend call outside the VPC and internal ingress would
# reject it (M17 §0).
module "cloudrun_bff" {
  source = "../../modules/cloudrun-service"

  depends_on = [time_sleep.iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-bff"
  image                 = local.bootstrap_image
  bootstrap_mode        = var.bootstrap_mode
  port                  = 3002
  service_account_email = local.runtime_sa_emails.bff
  deletion_protection   = true
  max_instance_count    = var.bff_max_instances

  ingress    = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  vpc_egress = "ALL_TRAFFIC"
  network_id = module.network.network_id
  subnet_id  = module.network.subnet_id

  sidecar_containers = local.otel_collector_sidecar

  health_check_ready_path = "/v1/health/ready"
  health_check_live_path  = "/v1/health/live"

  env_vars = {
    NODE_ENV    = "production"
    APP_ENV     = "production"
    GCP_PROJECT = var.project_id

    # M17-S34 / D12: see cloudrun_backend's identically-commented line above
    # — prod overrides the 100% default to 10%, staging keeps full sampling.
    OTEL_TRACES_SAMPLER_ARG = "0.1"

    BACKEND_INTERNAL_URL = module.cloudrun_backend.service_uri
    # Fixed custom domain (S22's edge module + Cloudflare DNS make this
    # hostname real) — no placeholder/two-apply bootstrap dance needed here
    # anymore, unlike staging's web_real_uri (no edge module there, D5).
    GOOGLE_CALLBACK_URL = "https://${local.root_domain}/v1/auth/google/callback"
    ALLOWED_ORIGINS     = "https://${local.root_domain}"
    FRONTEND_URL        = "https://${local.root_domain}"

    # M17 §2: ENABLE_DEV_AUTH=true only in staging — omitted here, and the
    # schema itself rejects true when APP_ENV=production regardless.
    BACKEND_AUTH_MODE = "iam"
  }

  secret_env_vars = {
    JWT_SECRET           = module.secrets.secret_ids["jwt-secret"]
    INTERNAL_API_KEY     = module.secrets.secret_ids["internal-api-key"]
    GOOGLE_CLIENT_ID     = module.secrets.secret_ids["google-oauth-client-id"]
    GOOGLE_CLIENT_SECRET = module.secrets.secret_ids["google-oauth-client-secret"]
    # TD38: unconditionally required by env.validation.ts (mirrors INTERNAL_API_KEY) regardless
    # of environment — wired here so prod's Terraform stays consistent with the shared app
    # code, even though prod's own ingress lockdown (Story B) is not part of this change.
    WEB_INTERNAL_KEY = module.secrets.secret_ids["web-internal-key"]
  }
}

# Same internal-load-balancer ingress split as bff above (S22). No VPC
# egress — web never calls the backend directly, only the public BFF URL.
# NEXT_PUBLIC_* are Cloud Run runtime env vars (not build args) as of TD29 —
# staging wires its own values in M17-S25; this is M17-S26's prod equivalent.
# Fixed domain values (D11) — unlike staging's web_real_uri,
# there's no bootstrap-uri two-apply dance needed here.
module "cloudrun_web" {
  source = "../../modules/cloudrun-service"

  depends_on = [time_sleep.iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-web"
  image                 = local.bootstrap_image
  bootstrap_mode        = var.bootstrap_mode
  port                  = 3000
  service_account_email = local.runtime_sa_emails.web
  # memory left at the module default (512Mi) -- GCP rejects <512Mi with
  # EXECUTION_ENVIRONMENT_GEN2 (confirmed by a real staging apply, 2026-07-19:
  # the story's original "256Mi" spec silently conflicted with "second-gen
  # execution environment", a combination no static check catches).
  deletion_protection = true

  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  health_check_ready_path = "/api/health/ready"
  health_check_live_path  = "/api/health/live"

  env_vars = {
    NODE_ENV = "production"
    APP_ENV  = "production"

    # Runtime env vars (TD29) — read at request time by
    # apps/web/shared/lib/runtime-env/public-env.ts, not baked into the
    # image at build time.
    #
    # Browser calls stay on the web origin through the /v1 gateway. The web
    # server alone uses BFF_UPSTREAM_URL to reach the BFF's separate host.
    NEXT_PUBLIC_BFF_URL                = "/v1"
    BFF_UPSTREAM_URL                   = "https://bff.${local.root_domain}/v1"
    NEXT_PUBLIC_SITE_URL               = "https://${local.root_domain}"
    NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = module.storage.public_base_url
    NEXT_PUBLIC_TURNSTILE_SITE_KEY     = cloudflare_turnstile_widget.lead_form.sitekey
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
    # TD38: unconditionally required by attachBffAuthHeaders() (mirrors BFF's own
    # WEB_INTERNAL_KEY requirement) regardless of environment — wired here so prod's
    # Terraform stays consistent with the shared app code, even though prod's own ingress
    # lockdown / BFF_AUTH_MODE=iam (Story B) is not part of this change.
    WEB_INTERNAL_KEY = module.secrets.secret_ids["web-internal-key"]
  }
}

# M20-S05 — the Turnstile widget itself is Terraform-managed (unlike TURNSTILE_SECRET_KEY,
# which stays out-of-band per modules/secrets' own "containers only, no values via Terraform"
# rule, M17 §2 — the sitekey isn't a secret at all, so that rule never applied to it). Creating
# the widget here means the sitekey can never be empty, a placeholder, or one of Cloudflare's
# documented test values (1x00000000000000000000AA / 2x00000000000000000000AB) by construction —
# Cloudflare's own API always returns a real, account-scoped sitekey for a real widget. This
# replaces an earlier design (PR #423 rounds 2-4) that sourced the sitekey from a plain
# `var.turnstile_site_key` Terraform variable (first with a test-key default, then required with
# no default, guarded by a non-blocking `check` block) — that design still depended on a human
# supplying the real value out-of-band (terraform.tfvars or a GitHub Actions variable), and a
# gap was found live: an unset GitHub Actions variable resolves to an empty string, which the
# no-default variable accepted as "a value was provided," silently passing CI with an empty
# sitekey. Provisioning the widget in Terraform removes that whole human-input step, not just
# patches around its failure modes (round-5 finding, 2026-08-25).
#
# mode = "managed" — Cloudflare's standard interactive checkbox widget (matches the lead form's
# own UX expectation of a visible, real challenge for guests/customers), not "non-interactive" or
# "invisible".
resource "cloudflare_turnstile_widget" "lead_form" {
  account_id = var.cloudflare_account_id
  name       = "ikaro-lead-form-${var.environment}"
  mode       = "managed"
  domains    = [local.root_domain, "www.${local.root_domain}"]
}

# Global external ALB + serverless NEGs + Cloudflare DNS (M17-S22, D5/D11) —
# prod only. Depends on the bff/web Cloud Run services' *names* (for the
# NEGs), not their *.run.app URIs — ingress on both flipped to
# INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER above so this ALB becomes their
# only public entry point. Deferred (TD30, 2026-07-22): count=0 until S37's
# deliberate go-live apply flips enable_edge=true — cert issuance,
# Cloudflare record creation, and the ingress flip all need to land in one
# apply so the services don't go temporarily unreachable mid-cutover.
# Decoupled from registry/IAM/secrets specifically so those don't have to
# wait for this too (M17-S27's dependency). bff/web are simply unreachable
# from anywhere while this is count=0 — expected, since prod isn't meant to
# serve real traffic before S37 regardless.
module "edge" {
  count  = var.enable_edge ? 1 : 0
  source = "../../modules/edge"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  root_domain        = local.root_domain
  web_service_name   = module.cloudrun_web.service_name
  bff_service_name   = module.cloudrun_bff.service_name
  cloudflare_zone_id = var.cloudflare_zone_id
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
# 2026-07-20). Composed but not applied yet — same plan-only status as the
# rest of this env root until S24/S37.
module "migrate_job" {
  source = "../../modules/migrate-job"

  depends_on = [time_sleep.iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  image                 = local.bootstrap_image
  bootstrap_mode        = var.bootstrap_mode
  service_account_email = local.runtime_sa_emails.migrate
  deletion_protection   = true

  network_id = module.network.network_id
  subnet_id  = module.network.subnet_id

  env_vars = {
    NODE_ENV = "production"
    APP_ENV  = "production"

    # TD33 — Cloud SQL Connector, not raw private-IP DB_HOST (see backend service block above).
    DB_INSTANCE_CONNECTION_NAME = try(module.database[0].instance_connection_name, "")
    DB_MIGRATOR_USER            = var.db_migrator_user
    DB_NAME                     = try(module.database[0].database_name, "ikaro")
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
# see plan/M17-CLOUD-DEPLOY.md's M17-S35 section for the split rationale and
# for why prod's uptime checks are written now but their "verify green"
# acceptance criterion is deferred to post-S37, mirroring module.edge's own
# established count-gating pattern below).
#
# database_instance_name: try(...) against module.database[0], same pattern
# as this file's other database-output references — empty string (skip the
# SQL alert policies) until S37 flips enable_database=true.
#
# uptime_checks: empty map until var.enable_edge=true — bff.ikaro.online/
# ikaro.online don't resolve before S37's edge apply, and an uptime check
# against a non-resolving domain would immediately and perpetually fire the
# failure alert from the moment it's created. enable_edge/enable_database
# are already enforced to flip together (variables.tf validation), so this
# reuses that same signal rather than inventing a second prod-only flag.
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

  database_instance_name = try(module.database[0].instance_name, "")

  uptime_checks = var.enable_edge ? {
    bff = {
      host    = "bff.${local.root_domain}"
      path    = "/v1/health/ready"
      use_ssl = true
    }
    web = {
      host    = local.root_domain
      path    = "/api/health/live"
      use_ssl = true
    }
  } : {}
}

# Prod-only (D8): single Artifact Registry backing both envs. The one
# Terraform-external prerequisite is documented in modules/registry's
# variables and the story's Dependencies note — ikaro-tf-deployer@ikaro-prod
# needs roles/artifactregistry.admin granted manually before this module's
# first apply (bootstrap gap closed 2026-07-18, same pattern as S08's other
# deployer roles).
module "registry" {
  source = "../../modules/registry"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels
}
