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

# S13 discovery: instance creation deferred — flip to true at the S27
# activation (starts the ~$9/mo Cloud SQL charge). iam_admin_user comes from
# the gitignored local.auto.tfvars, never from this file.
enable_database = false

# Staging has no LB (D5) — the web app's raw Cloud Run URL is the browser
# origin for signed-URL uploads. Deterministic format (project number, not a
# revision hash — S08 already created this project).
cors_origins = ["https://ikaro-web-729809528251.southamerica-east1.run.app"]

# S18 launch state — placeholder image (gcr.io/cloudrun/hello) with relaxed
# probes and no secret mounting; flip to false at the S27 activation once a
# real pipeline image exists.
bootstrap_mode = true

# Connection-math invariant (backend) and Direct VPC subnet-capacity
# reasoning (bff) — see the variable descriptions in variables.tf. Raise
# only alongside the matching db_tier upgrade / subnet resize.
backend_max_instances = 3
bff_max_instances     = 20
