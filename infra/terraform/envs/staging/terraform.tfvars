# Non-sensitive environment identifiers only — secret values NEVER enter
# tfvars, state, or git (M17 §2, no exceptions).
project_id  = "ikaro-staging"
environment = "staging"
region      = "southamerica-east1"

labels = {
  app         = "ikaro"
  environment = "staging"
  managed_by  = "terraform"
}

db_tier = "db-f1-micro"

# S13 discovery: instance creation deferred — flip to true at the S27
# activation (starts the ~$9/mo Cloud SQL charge). iam_admin_user comes from
# the gitignored local.auto.tfvars, never from this file.
enable_database = false

# Staging has no LB (D5) — the web app's raw Cloud Run URL is the browser
# origin for signed-URL uploads. Deterministic format (project number, not a
# revision hash — S08 already created this project).
cors_origins = ["https://ikaro-web-729809528251.southamerica-east1.run.app"]
