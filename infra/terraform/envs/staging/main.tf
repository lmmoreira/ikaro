# Environment composition — modules are instantiated here as their Wave 2
# stories land (module dependency graph in ../../README.md):
#
#   network (M17-S12) → database (M17-S13)
#   storage (M17-S14), secrets (M17-S16) → iam (M17-S17)
#   → cloudrun-service (M17-S18) → pubsub (M17-S19), migrate-job (M17-S20)
#   → scheduler (M17-S21), monitoring (M17-S35)
#
# registry (M17-S15) and edge (M17-S22) are instantiated in envs/prod only.

locals {
  # A Cloud Run v2 service's default *.run.app URL is deterministic
  # (service-projectnumber.region.run.app — same format already relied on by
  # this file's own cors_origins value, S08). Needed because Terraform cannot
  # reference a resource's own computed `uri` output from within its own
  # config: the backend's PUBSUB_PUSH_AUDIENCE and the BFF's
  # GOOGLE_CALLBACK_URL both need each service's *own* URL (M17-S18
  # discovery, 2026-07-19). Every other cross-service URL below uses the
  # real module output instead of this — these two locals exist only for the
  # genuine self-reference cases.
  backend_self_uri = "https://ikaro-backend-${var.project_number}.${var.region}.run.app"
  bff_self_uri     = "https://ikaro-bff-${var.project_number}.${var.region}.run.app"

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
}

module "network" {
  source = "../../modules/network"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels
}

# Deferred creation (S13 discovery): no instance — and no charge — until the
# S27 activation flips enable_database = true in terraform.tfvars.
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
# cost effectively nothing. No values, no IAM here — M17-S17 (modules/iam)
# grants the per-SA accessor bindings once it lands.
module "secrets" {
  source = "../../modules/secrets"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels
}

# 4 runtime SAs + every IAM binding resolvable now (S14 buckets, S16
# secrets, project-level roles, self-grant). Cross-resource bindings on
# Cloud Run services / Pub/Sub topics are S18's/S19's, once those exist.
module "iam" {
  source = "../../modules/iam"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  uploads_bucket_name = module.storage.uploads_bucket_name
  public_bucket_name  = module.storage.public_bucket_name
  secret_ids          = module.secrets.secret_ids
}

# Internal-ingress only (D4/D1) — no public URL. Direct VPC egress for Cloud
# SQL's private IP. db_pool_size + db_tier feed the module's own
# connection-math invariant on backend_max_instances (M17 plan §S18).
module "cloudrun_backend" {
  source = "../../modules/cloudrun-service"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-backend"
  image                 = local.bootstrap_image
  bootstrap_mode        = var.bootstrap_mode
  port                  = 3001
  service_account_email = module.iam.backend_sa_email
  execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

  ingress    = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  vpc_egress = "PRIVATE_RANGES_ONLY"
  network_id = module.network.network_id
  subnet_id  = module.network.subnet_id

  min_instance_count = 0
  max_instance_count = var.backend_max_instances
  db_pool_size       = 3
  db_tier            = var.db_tier

  health_check_ready_path = "/health/ready"
  health_check_live_path  = "/health/live"

  # bff + the Pub/Sub push identity call the backend; the operator reaches it
  # via `gcloud run services proxy` (S18 discovery finding — no story before
  # this one granted a human identity run.invoker on the backend).
  invoker_members = concat(
    [
      "serviceAccount:${module.iam.bff_sa_email}",
      "serviceAccount:${module.iam.pubsub_invoker_sa_email}",
    ],
    var.iam_admin_user != "" ? ["user:${var.iam_admin_user}"] : []
  )

  env_vars = merge(
    {
      NODE_ENV    = "production"
      APP_ENV     = "staging"
      GCP_PROJECT = var.project_id

      # S13 discovery: staging's database module is deferred (count=0) until
      # the S27 activation — try() falls back to "" until then; harmless while
      # bootstrap_mode's placeholder image never actually reads it.
      DB_HOST      = try(module.database[0].private_ip, "")
      DB_USER      = "ikaro"
      DB_NAME      = "ikaro"
      DB_POOL_SIZE = "3"

      PUBSUB_PROJECT_ID           = var.project_id
      PUBSUB_CONSUMER_MODE        = "push"
      PUBSUB_AUTO_CREATE          = "false"
      PUBSUB_PUSH_AUDIENCE        = "${local.backend_self_uri}/pubsub/push"
      PUBSUB_PUSH_SERVICE_ACCOUNT = module.iam.pubsub_invoker_sa_email

      GCS_BUCKET_NAME        = module.storage.uploads_bucket_name
      GCS_PUBLIC_BUCKET_NAME = module.storage.public_bucket_name

      EMAIL_ADAPTER = "brevo"
      EMAIL_FROM    = "noreply@ikaro.online"

      FRONTEND_URL = module.cloudrun_web.service_uri
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
  }
}

# Public (staging has no LB, D5) — the app does its own auth on top
# (allow_unauthenticated requires the S07 org-policy exception). ALL_TRAFFIC
# egress: *.run.app resolves to public IPs, so PRIVATE_RANGES_ONLY would
# route the backend call outside the VPC and internal ingress would reject
# it (M17 §0).
module "cloudrun_bff" {
  source = "../../modules/cloudrun-service"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-bff"
  image                 = local.bootstrap_image
  bootstrap_mode        = var.bootstrap_mode
  port                  = 3002
  service_account_email = module.iam.bff_sa_email
  max_instance_count    = var.bff_max_instances

  ingress    = "INGRESS_TRAFFIC_ALL"
  vpc_egress = "ALL_TRAFFIC"
  network_id = module.network.network_id
  subnet_id  = module.network.subnet_id

  allow_unauthenticated = true
  # Completes the run.invoker set alongside the backend's grants above — not
  # strictly needed while the BFF is public, but harmless (S17 discovery).
  invoker_members = ["serviceAccount:${module.iam.web_sa_email}"]

  health_check_ready_path = "/v1/health/ready"
  health_check_live_path  = "/v1/health/live"

  env_vars = {
    NODE_ENV    = "production"
    APP_ENV     = "staging"
    GCP_PROJECT = var.project_id

    BACKEND_INTERNAL_URL = module.cloudrun_backend.service_uri
    GOOGLE_CALLBACK_URL  = "${local.bff_self_uri}/v1/auth/google/callback"
    ALLOWED_ORIGINS      = module.cloudrun_web.service_uri
    FRONTEND_URL         = module.cloudrun_web.service_uri

    # M17 §2: ENABLE_DEV_AUTH=true only in staging.
    ENABLE_DEV_AUTH   = "true"
    BACKEND_AUTH_MODE = "iam"
  }

  secret_env_vars = {
    JWT_SECRET           = module.secrets.secret_ids["jwt-secret"]
    INTERNAL_API_KEY     = module.secrets.secret_ids["internal-api-key"]
    GOOGLE_CLIENT_ID     = module.secrets.secret_ids["google-oauth-client-id"]
    GOOGLE_CLIENT_SECRET = module.secrets.secret_ids["google-oauth-client-secret"]
  }
}

# Public (same ingress split as bff, D5). No VPC egress — web never calls the
# backend directly, only the public BFF URL. NEXT_PUBLIC_* build-time vars
# and the per-env image consequence are S26's scope, not this module's.
module "cloudrun_web" {
  source = "../../modules/cloudrun-service"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  service_name          = "ikaro-web"
  image                 = local.bootstrap_image
  bootstrap_mode        = var.bootstrap_mode
  port                  = 3000
  service_account_email = module.iam.web_sa_email
  memory                = "256Mi"

  ingress               = "INGRESS_TRAFFIC_ALL"
  allow_unauthenticated = true

  health_check_ready_path = "/api/health/ready"
  health_check_live_path  = "/api/health/live"

  env_vars = {
    NODE_ENV = "production"
    APP_ENV  = "staging"
  }
}
