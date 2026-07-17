# Non-sensitive environment identifiers only — secret values NEVER enter
# tfvars, state, or git (M17 §2, no exceptions).
project_id  = "ikaro-prod"
environment = "prod"
region      = "southamerica-east1"

labels = {
  app         = "ikaro"
  environment = "prod"
  managed_by  = "terraform"
}

db_tier = "db-f1-micro"

# Prod is plan-only until S24/S37 — the pipeline performs the first apply
# (PITR + deletion protection are set in main.tf). iam_admin_user comes from
# the gitignored local.auto.tfvars / TF_VAR_iam_admin_user (S24), never here.
enable_database = true
