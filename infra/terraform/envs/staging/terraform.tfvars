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
