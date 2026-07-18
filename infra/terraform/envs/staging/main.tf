# Environment composition — modules are instantiated here as their Wave 2
# stories land (module dependency graph in ../../README.md):
#
#   network (M17-S12) → database (M17-S13)
#   storage (M17-S14), secrets (M17-S16) → iam (M17-S17)
#   → cloudrun-service (M17-S18) → pubsub (M17-S19), migrate-job (M17-S20)
#   → scheduler (M17-S21), monitoring (M17-S35)
#
# registry (M17-S15) and edge (M17-S22) are instantiated in envs/prod only.

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
