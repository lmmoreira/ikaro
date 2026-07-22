# Non-sensitive environment identifiers only — secret values NEVER enter
# tfvars, state, or git (M17 §2, no exceptions).
project_id     = "ikaro-staging"
project_number = "729809528251"
environment    = "staging"
region         = "southamerica-east1"

labels = {
  app         = "ikaro"
  environment = "staging"
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

# S13 discovery: instance creation deferred — flip to true at the S27
# activation (starts the ~$9/mo Cloud SQL charge). iam_admin_user comes from
# the gitignored local.auto.tfvars, never from this file.
enable_database = false

# Staging has no LB (D5) — the web app's raw Cloud Run URL is the browser
# origin for signed-URL uploads. Corrected 2026-07-22 (M17-S25 discovery
# finding): this previously held a guessed project-number-format URL
# (https://ikaro-web-729809528251.southamerica-east1.run.app), which is NOT
# the format Cloud Run actually assigns — verified live via `gcloud run
# services describe ikaro-web`, same per-project random hash as
# bff_real_uri, not the deterministic project-number format an earlier
# assumption relied on (see bff_real_uri's description). The wrong value
# meant the uploads bucket's CORS policy never actually matched the real
# staging web origin.
cors_origins = ["https://ikaro-web-crle4i3nrq-rj.a.run.app"]

# S18 launch state — placeholder image (gcr.io/cloudrun/hello) with relaxed
# probes and no secret mounting; flip to false at the S27 activation once a
# real pipeline image exists.
bootstrap_mode = true

# Connection-math invariant (backend) and Direct VPC subnet-capacity
# reasoning (bff) — see the variable descriptions in variables.tf. Raise
# only alongside the matching db_tier upgrade / subnet resize.
backend_max_instances = 3
bff_max_instances     = 20

# Real *.run.app URL discovered from the bff_service_uri output after the
# first apply (see bff_real_uri's description in variables.tf) — used to
# build GOOGLE_CALLBACK_URL. Also registered as an Authorized redirect URI
# on the Google OAuth client in the GCP Console (M17-S18 post-apply step).
bff_real_uri = "https://ikaro-bff-crle4i3nrq-rj.a.run.app"

# Real *.run.app URL discovered the same way as bff_real_uri (see its
# comment above) — used for NEXT_PUBLIC_SITE_URL and cors_origins (M17-S25).
web_real_uri = "https://ikaro-web-crle4i3nrq-rj.a.run.app"
