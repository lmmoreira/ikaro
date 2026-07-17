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
