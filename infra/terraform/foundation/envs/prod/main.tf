module "control_plane" {
  source = "../../modules/control-plane"

  environment                           = var.environment
  github_environment                    = "production-foundation"
  project_id                            = var.project_id
  state_bucket_name                     = var.state_bucket_name
  workload_identity_pool_project_number = var.project_number
}

module "project_services" {
  source = "../../modules/project-services"

  project_id = var.project_id
  services   = ["iap.googleapis.com"]
}

# TD34: Foundation, not the routine environment deployer, owns runtime
# identities and their IAM bindings. The explicit imports below will adopt the
# existing objects without changing their live access.
module "runtime_identities" {
  source = "../../modules/runtime-identities"

  project_id  = var.project_id
  environment = var.environment

  uploads_bucket_name = "ikaro-uploads-${var.environment}"
  public_bucket_name  = "ikaro-public-${var.environment}"
  secret_ids = {
    for name in ["db-password", "db-migrator-password", "jwt-secret", "internal-api-key", "platform-admin-key", "hotsite-revalidate-secret", "google-oauth-client-id", "google-oauth-client-secret", "brevo-smtp-key", "cloudflare-api-token"] : name => "projects/${var.project_id}/secrets/${name}"
  }
}

locals {
  runtime_project_roles = {
    backend_cloudsql_client          = { role = "roles/cloudsql.client", principal = "backend" }
    migrate_cloudsql_client          = { role = "roles/cloudsql.client", principal = "migrate" }
    backend_cloudtrace_agent         = { role = "roles/cloudtrace.agent", principal = "backend" }
    backend_monitoring_metric_writer = { role = "roles/monitoring.metricWriter", principal = "backend" }
    bff_cloudtrace_agent             = { role = "roles/cloudtrace.agent", principal = "bff" }
    bff_monitoring_metric_writer     = { role = "roles/monitoring.metricWriter", principal = "bff" }
  }

  runtime_secret_accessors = {
    backend = ["db-password", "jwt-secret", "internal-api-key", "platform-admin-key", "hotsite-revalidate-secret", "brevo-smtp-key", "cloudflare-api-token"]
    bff     = ["jwt-secret", "internal-api-key", "google-oauth-client-id", "google-oauth-client-secret"]
    web     = ["jwt-secret", "hotsite-revalidate-secret"]
    migrate = ["db-migrator-password"]
  }

  runtime_secret_bindings = merge([for principal, secrets in local.runtime_secret_accessors : { for secret in secrets : "${principal}-${secret}" => { principal = principal, secret = secret } }]...)
}

import {
  for_each = toset(["backend", "bff", "web", "pubsub_invoker", "migrate"])
  to       = module.runtime_identities.google_service_account.runtime[each.key]
  id       = "projects/${var.project_id}/serviceAccounts/ikaro-${replace(each.key, "_", "-")}@${var.project_id}.iam.gserviceaccount.com"
}

import {
  for_each = local.runtime_project_roles
  to       = module.runtime_identities.google_project_iam_member.runtime[each.key]
  id       = "${var.project_id} ${each.value.role} serviceAccount:ikaro-${replace(each.value.principal, "_", "-")}@${var.project_id}.iam.gserviceaccount.com"
}

import {
  to = module.runtime_identities.google_service_account_iam_member.backend_token_creator_self
  id = "projects/${var.project_id}/serviceAccounts/ikaro-backend@${var.project_id}.iam.gserviceaccount.com roles/iam.serviceAccountTokenCreator serviceAccount:ikaro-backend@${var.project_id}.iam.gserviceaccount.com"
}

import {
  for_each = { uploads = "ikaro-uploads-${var.environment}", public = "ikaro-public-${var.environment}" }
  to       = module.runtime_identities.google_storage_bucket_iam_member.backend_object_admin[each.key]
  id       = "b/${each.value} roles/storage.objectAdmin serviceAccount:ikaro-backend@${var.project_id}.iam.gserviceaccount.com"
}

import {
  for_each = local.runtime_secret_bindings
  to       = module.runtime_identities.google_secret_manager_secret_iam_member.accessor[each.key]
  id       = "projects/${var.project_id}/secrets/${each.value.secret} roles/secretmanager.secretAccessor serviceAccount:ikaro-${replace(each.value.principal, "_", "-")}@${var.project_id}.iam.gserviceaccount.com"
}

module "custom_roles" {
  source = "../../modules/custom-roles"

  project_id = var.project_id
}

resource "google_project_iam_member" "foundation_deployer_resource_iam_writer" {
  project = var.project_id
  role    = module.custom_roles.resource_iam_writer_role_id
  member  = "serviceAccount:${module.control_plane.foundation_deployer_email}"
}

# TD34 migration only: foundation adopts the pre-existing normal deployer's
# broad project roles before later batches can safely replace or revoke them.
# Importing these bindings changes state ownership only; it does not alter IAM.
locals {
  legacy_deployer_project_role_bindings = merge({
    for role in toset([
      "roles/artifactregistry.admin",
      "roles/cloudscheduler.admin",
      "roles/cloudsql.admin",
      "roles/compute.networkAdmin",
      "roles/compute.securityAdmin",
      "roles/iam.serviceAccountAdmin",
      "roles/iam.serviceAccountUser",
      "roles/monitoring.editor",
      "roles/pubsub.admin",
      "roles/resourcemanager.projectIamAdmin",
      "roles/run.admin",
      "roles/secretmanager.admin",
      ]) : role => {
      role      = role
      condition = null
    }
    }, {
    storage_admin_except_shared_state = {
      role = "roles/storage.admin"
      condition = {
        title       = "exclude-shared-state-bucket"
        description = "Prod tf-deployer gets storage.admin on all prod buckets except the shared Terraform state bucket - that one is governed solely by its own prefix-scoped conditional binding"
        expression  = "!resource.name.startsWith('projects/_/buckets/ikaro-tfstate')"
      }
    }
  })
}

module "legacy_deployer_roles" {
  source = "../../modules/legacy-deployer-roles"

  project_id            = var.project_id
  project_role_bindings = local.legacy_deployer_project_role_bindings
}

import {
  to = module.project_services.google_project_service.managed["iap.googleapis.com"]
  id = "${var.project_id}/iap.googleapis.com"
}

import {
  to = module.custom_roles.google_project_iam_custom_role.planner_iam_policy_reader
  id = "${var.project_id}/tfPlannerIamPolicyReader"
}

import {
  for_each = local.legacy_deployer_project_role_bindings

  to = module.legacy_deployer_roles.google_project_iam_member.normal_deployer_role[each.key]
  id = each.value.condition == null ? "${var.project_id} ${each.value.role} serviceAccount:ikaro-tf-deployer@${var.project_id}.iam.gserviceaccount.com" : "${var.project_id} ${each.value.role} serviceAccount:ikaro-tf-deployer@${var.project_id}.iam.gserviceaccount.com ${each.value.condition.title}"
}

# The shared Terraform state bucket belongs to ikaro-prod. Staging's
# repository-scoped planner needs only the existing policy-reader custom role
# here to refresh the bucket IAM bindings held in staging foundation state.
resource "google_project_iam_member" "staging_foundation_planner_state_policy_reader" {
  project = var.project_id
  role    = "projects/${var.project_id}/roles/tfPlannerIamPolicyReader"
  member  = "serviceAccount:ikaro-tf-foundation-planner@ikaro-staging.iam.gserviceaccount.com"
}

# Both foundation deployers refresh bucket-IAM resources in their own state.
# This existing custom role is read-only and is sufficient for refresh; any
# future bucket-IAM mutation is transferred deliberately in TD34 phase 3.
resource "google_project_iam_member" "foundation_deployer_state_policy_reader" {
  for_each = toset([
    "ikaro-tf-foundation@ikaro-staging.iam.gserviceaccount.com",
    "ikaro-tf-foundation@ikaro-prod.iam.gserviceaccount.com",
  ])

  project = var.project_id
  role    = "projects/${var.project_id}/roles/tfPlannerIamPolicyReader"
  member  = "serviceAccount:${each.value}"
}
