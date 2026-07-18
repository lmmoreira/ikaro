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

module "network" {
  source = "../../modules/network"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region
  labels      = var.labels
}

# Enabled in config, but prod remains plan-only until S24/S37 — the pipeline
# performs the first prod apply. PITR + deletion protection are prod law.
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
