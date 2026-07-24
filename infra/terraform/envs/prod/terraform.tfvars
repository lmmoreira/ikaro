# Non-sensitive environment identifiers only — secret values NEVER enter
# tfvars, state, or git (M17 §2, no exceptions).
project_id     = "ikaro-prod"
project_number = "671829048389"
environment    = "prod"
region         = "southamerica-east1"

labels = {
  app         = "ikaro"
  environment = "prod"
  managed_by  = "terraform"
}

db_tier = "db-f1-micro"

# Not a secret (only the password is, kept fully out of Terraform — S13
# discovery) — the "ikaro" user/database names are fixed application
# conventions, not per-env choices.
db_user = "ikaro"

# Distinct DDL-capable role for the migrate Cloud Run Job (M17-S20) — not a
# secret either, same reasoning as db_user.
db_migrator_user = "ikaro_migrator"

# Deferred (TD30, 2026-07-22): stays false until S37's deliberate go-live
# apply (PITR + deletion protection are set in main.tf, ready for when it
# does land). iam_admin_user comes from the gitignored local.auto.tfvars /
# TF_VAR_iam_admin_user (S24), never here.
enable_database = false

# Deferred (TD30, 2026-07-22): stays false until S37 — see main.tf's
# module "edge" comment for why this can't land alongside registry/IAM/
# secrets the way this TD lets those apply early.
enable_edge = false

# Path-based hotsites (D11) — one prod origin, not per-tenant subdomains.
# www redirects to apex at the edge (S22) but the browser can still load the
# app from either host before that redirect fires.
cors_origins = ["https://ikaro.online", "https://www.ikaro.online"]

# On-demand IAP relay VM (TD32) — flip true + merge for a session, false +
# merge to tear down. See infra/terraform/modules/relay-vm/README.md. The
# Cloud SQL half has nothing to reach until enable_database flips at S37.
create_relay_vm = false

# S18 launch state — placeholder image (gcr.io/cloudrun/hello) with relaxed
# probes and no secret mounting; flip to false at the S27 activation once a
# real pipeline image exists.
bootstrap_mode = true

# Connection-math invariant (backend) and Direct VPC subnet-capacity
# reasoning (bff) — see the variable descriptions in variables.tf. Raise
# only alongside the matching db_tier upgrade / subnet resize.
backend_max_instances = 3
bff_max_instances     = 20

# Single shared Artifact Registry lives in ikaro-prod (D8) but grants
# cross-project access to staging — these identify staging for that grant.
# Plain values, not secrets (project IDs/numbers aren't confidential; both
# are already discoverable and project_id is committed the same way in
# envs/staging/terraform.tfvars).
staging_project_id     = "ikaro-staging"
staging_project_number = "729809528251"

# Cloudflare zone ID for ikaro.online (S09 zone, non-secret resource
# identifier — same treatment as project_number/staging_project_number).
cloudflare_zone_id = "7410cf58ba867f364e641cf9ea873078"
