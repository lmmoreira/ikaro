# Environment composition — modules are instantiated here as their Wave 2
# stories land (module dependency graph in ../../README.md):
#
#   network (M17-S12) → database (M17-S13)
#   storage (M17-S14), secrets (M17-S16) → iam (M17-S17)
#   → cloudrun-service (M17-S18) → pubsub (M17-S19), migrate-job (M17-S20)
#   → scheduler (M17-S21), monitoring (M17-S35)
#
# registry (M17-S15) and edge (M17-S22) are instantiated in THIS env only (D8/D5).
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

  cors_origins = var.cors_origins
}

# Unconditional, same reasoning as storage. No values, no IAM here — M17-S17
# grants the per-SA accessor bindings once it lands. Composed but not applied
# yet — same plan-only status as the rest of this env root until S24/S37.
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
# Composed but not applied yet — same plan-only status as the rest of this
# env root until S24/S37.
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

# Review finding (PR #176, 2026-07-20): none of the cloudrun-service/migrate-job
# module calls below reference module.iam's per-SA secret_manager_secret_iam_member
# bindings — their only implicit edges are to the SA resource itself
# (module.iam.<x>_sa_email) and to the secret container (module.secrets), never to
# the accessor grant that actually lets that SA read it. Without an explicit
# dependency, Terraform could create/update a Cloud Run service or Job in parallel
# with (or before) the IAM grant that lets its runtime identity mount the secret —
# Cloud Run validates secret access at revision/execution creation time and fails
# with a permission error if the grant isn't visible yet.
#
# depends_on = [module.iam] alone fixes the ordering (Terraform won't issue the
# Cloud Run API call until every resource in module.iam, including the accessor
# bindings, has returned success) but GCP IAM grants have their own propagation
# delay on top of that — up to ~60s per Google's own docs — even after the
# Terraform-level API call succeeds. time_sleep adds that buffer explicitly rather
# than relying on undocumented luck (bootstrap_mode deferring the real secret
# mount to a much later apply, by which point the binding has long since
# propagated in practice).
resource "time_sleep" "iam_propagation" {
  depends_on      = [module.iam]
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
  service_account_email = module.iam.backend_sa_email
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

  health_check_ready_path = "/health/ready"
  health_check_live_path  = "/health/live"

  # bff + the Pub/Sub push identity call the backend. iam_admin_user's own
  # grant here predates TD32 and was for `gcloud run services proxy` (S18
  # discovery finding) — TD32's live verification proved that path never
  # actually worked (ingress:internal blocks it regardless of IAM
  # validity, confirmed by a real attempt); kept as-is since removing an
  # existing human grant is a separate, not-yet-requested change. The
  # The relay VM's own SA (TD32) is the mechanism that actually works when
  # the VM is enabled — it calls the backend from inside the VPC, where the
  # ingress check classifies it as internal-origin traffic. Do not retain
  # run.invoker while the on-demand VM is absent.
  invoker_members = concat(
    [
      "serviceAccount:${module.iam.bff_sa_email}",
      "serviceAccount:${module.iam.pubsub_invoker_sa_email}",
    ],
    var.create_relay_vm ? ["serviceAccount:${module.relay_vm.service_account_email}"] : [],
    var.iam_admin_user != "" ? ["user:${var.iam_admin_user}"] : []
  )

  env_vars = merge(
    {
      NODE_ENV    = "production"
      APP_ENV     = "production"
      GCP_PROJECT = var.project_id

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
      PUBSUB_PUSH_SERVICE_ACCOUNT = module.iam.pubsub_invoker_sa_email

      GCS_BUCKET_NAME        = module.storage.uploads_bucket_name
      GCS_PUBLIC_BUCKET_NAME = module.storage.public_bucket_name

      EMAIL_ADAPTER = "brevo"
      EMAIL_FROM    = "noreply@${local.root_domain}"

      # Final branded domain (D11) — used for links in emails etc. regardless
      # of ingress mode; unlike GOOGLE_CALLBACK_URL below, nothing needs this
      # host to actually resolve yet.
      FRONTEND_URL = "https://${local.root_domain}"
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
  }
}

# Internal-load-balancer ingress (S22): the raw *.run.app URL no longer
# accepts direct internet traffic — only the Global external ALB's
# serverless NEG can reach it. allow_unauthenticated stays true: the app's
# public-auth model doesn't rely on Cloud Run IAM invoker checks (that's
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
  service_account_email = module.iam.bff_sa_email
  deletion_protection   = true
  max_instance_count    = var.bff_max_instances

  ingress    = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
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
    APP_ENV     = "production"
    GCP_PROJECT = var.project_id

    BACKEND_INTERNAL_URL = module.cloudrun_backend.service_uri
    # Fixed custom domain (S22's edge module + Cloudflare DNS make this
    # hostname real) — no placeholder/two-apply bootstrap dance needed here
    # anymore, unlike staging's bff_real_uri (no edge module there, D5).
    GOOGLE_CALLBACK_URL = "https://bff.${local.root_domain}/v1/auth/google/callback"
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
  }
}

# Same internal-load-balancer ingress split as bff above (S22). No VPC
# egress — web never calls the backend directly, only the public BFF URL.
# NEXT_PUBLIC_* are Cloud Run runtime env vars (not build args) as of TD29 —
# staging wires its own values in M17-S25; this is M17-S26's prod equivalent.
# Fixed domain values (D11) — unlike staging's bff_real_uri/web_real_uri,
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
  service_account_email = module.iam.web_sa_email
  # memory left at the module default (512Mi) -- GCP rejects <512Mi with
  # EXECUTION_ENVIRONMENT_GEN2 (confirmed by a real staging apply, 2026-07-19:
  # the story's original "256Mi" spec silently conflicted with "second-gen
  # execution environment", a combination no static check catches).
  deletion_protection = true

  ingress               = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  allow_unauthenticated = true

  health_check_ready_path = "/api/health/ready"
  health_check_live_path  = "/api/health/live"

  env_vars = {
    NODE_ENV = "production"
    APP_ENV  = "production"

    # Runtime env vars (TD29) — read at request time by
    # apps/web/shared/lib/runtime-env/public-env.ts, not baked into the
    # image at build time.
    #
    # NEXT_PUBLIC_BFF_URL must include the /v1 prefix -- same fix as
    # envs/staging/main.tf, found there via M17-S27's first real deploy
    # (2026-07-23). See that file's comment for the full explanation.
    NEXT_PUBLIC_BFF_URL                = "https://bff.${local.root_domain}/v1"
    NEXT_PUBLIC_SITE_URL               = "https://${local.root_domain}"
    NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = module.storage.public_base_url
  }
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

  project_id     = var.project_id
  project_number = var.project_number
  environment    = var.environment
  region         = var.region
  labels         = var.labels

  backend_push_endpoint   = "${module.cloudrun_backend.service_uri}/pubsub/push"
  backend_pubsub_audience = local.backend_pubsub_audience
  backend_sa_email        = module.iam.backend_sa_email
  pubsub_invoker_sa_email = module.iam.pubsub_invoker_sa_email
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
  service_account_email = module.iam.migrate_sa_email
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

  project_id     = var.project_id
  project_number = var.project_number
  environment    = var.environment
  region         = var.region
  labels         = var.labels

  cron_topic_ids        = module.pubsub.topic_ids
  outbox_relay_schedule = var.outbox_relay_schedule
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

  staging_project_id     = var.staging_project_id
  staging_project_number = var.staging_project_number
}

# The tf-deployer already has projectIamAdmin, so Terraform can grant the
# Compute Engine administration needed to create the relay VM itself.
# Count-gating keeps that otherwise-broad role absent between sessions.
resource "google_project_iam_member" "relay_vm_deployer_compute_instance_admin" {
  #checkov:skip=CKV_GCP_42:roles/compute.instanceAdmin.v1 is the GCP predefined role required to create and destroy this VM and its boot disk; a custom role would be an unverified, brittle permission list. The binding exists only while the on-demand relay VM is enabled.
  count = var.create_relay_vm ? 1 : 0

  project = var.project_id
  role    = "roles/compute.instanceAdmin.v1"
  member  = "serviceAccount:ikaro-tf-deployer@${var.project_id}.iam.gserviceaccount.com"
}

# GCP IAM bindings can take up to 60 seconds to propagate after Terraform's
# API call succeeds. Do not race VM creation against that propagation.
resource "time_sleep" "relay_vm_deployer_iam_propagation" {
  count = var.create_relay_vm ? 1 : 0

  depends_on      = [google_project_iam_member.relay_vm_deployer_compute_instance_admin]
  create_duration = "30s"
}

# On-demand IAP relay VM (TD32) — wired in ahead of need, same as
# envs/staging/main.tf, so S37 doesn't have to duplicate this module later.
# The VM and access grants exist only while create_relay_vm is true. Note
# (TD32 discovery): prod's database module is still count-gated behind
# enable_database (false until S37) — creating this VM in prod today would
# have nothing to reach on the Cloud SQL half until that flips. See
# modules/relay-vm/README.md for the PR-per-toggle usage flow.
module "relay_vm" {
  source = "../../modules/relay-vm"

  depends_on = [time_sleep.relay_vm_deployer_iam_propagation]

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels

  create = var.create_relay_vm
  zone   = "${var.region}-a"

  subnet_id                    = module.network.subnet_id
  network_id                   = module.network.network_id
  iam_admin_user               = var.iam_admin_user
  platform_admin_key_secret_id = module.secrets.secret_ids["platform-admin-key"]

  # Prod's database module is count-gated (enable_database, false until
  # S37) — try() yields "" when it doesn't exist yet, which the module
  # treats as "skip the Cloud SQL grants and google_sql_user, nothing to
  # register a DB user against."
  db_instance_connection_name = try(module.database[0].instance_connection_name, "")
  db_instance_name            = try(module.database[0].instance_name, "")
}
