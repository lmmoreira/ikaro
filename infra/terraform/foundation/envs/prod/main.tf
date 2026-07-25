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
  static_resource_artifact_registry_members = {
    staging_deployer_writer = {
      location   = var.region
      repository = "ikaro-registry"
      role       = "roles/artifactregistry.writer"
      member     = "serviceAccount:ikaro-app-deployer@ikaro-staging.iam.gserviceaccount.com"
    }
    staging_service_agent_reader = {
      location   = var.region
      repository = "ikaro-registry"
      role       = "roles/artifactregistry.reader"
      member     = "serviceAccount:service-729809528251@serverless-robot-prod.iam.gserviceaccount.com"
    }
    staging_tf_deployer_reader = {
      location   = var.region
      repository = "ikaro-registry"
      role       = "roles/artifactregistry.reader"
      member     = "serviceAccount:ikaro-tf-deployer@ikaro-staging.iam.gserviceaccount.com"
    }
  }

  static_resource_audit_log_types_by_service = {
    "cloudsql.googleapis.com"      = ["DATA_WRITE"]
    "iap.googleapis.com"           = ["ADMIN_READ", "DATA_READ", "DATA_WRITE"]
    "secretmanager.googleapis.com" = ["DATA_READ"]
  }
}

# TD34: Foundation adopts these static, resource-scoped policies before a later
# normal-root handoff relinquishes the former addresses with destroy = false.
# The bucket, registry, and relay resources remain in their ordinary modules.
module "static_resource_iam" {
  source = "../../modules/static-resource-iam"

  project_id         = var.project_id
  public_bucket_name = "ikaro-public-${var.environment}"

  artifact_registry_members  = local.static_resource_artifact_registry_members
  audit_log_types_by_service = local.static_resource_audit_log_types_by_service
}

import {
  to = module.static_resource_iam.google_storage_bucket_iam_member.public_viewer
  id = "b/ikaro-public-${var.environment} roles/storage.objectViewer allUsers"
}

import {
  for_each = local.static_resource_artifact_registry_members
  to       = module.static_resource_iam.google_artifact_registry_repository_iam_member.member[each.key]
  id       = "projects/${var.project_id}/locations/${each.value.location}/repositories/${each.value.repository} ${each.value.role} ${each.value.member}"
}

import {
  for_each = local.static_resource_audit_log_types_by_service
  to       = module.static_resource_iam.google_project_iam_audit_config.service[each.key]
  id       = "${var.project_id} ${each.key}"
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

# TD34: ordinary resource modules continue to own services, topics,
# subscriptions, and jobs. Foundation owns only their IAM policies.
locals {
  workload_catalog = jsondecode(file("${path.module}/../../../pubsub-catalog.json"))
  workload_topics  = { for entry in local.workload_catalog : entry.event => entry }
  workload_subscriptions = merge([
    for entry in local.workload_catalog : {
      for consumer in entry.consumers : jsonencode([entry.event, consumer]) => {
        topic    = entry.event
        consumer = consumer
      }
    }
  ]...)

  workload_pubsub_service_agent    = "service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
  workload_scheduler_service_agent = "service-${var.project_number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"

  workload_cloud_run_invokers = merge({
    backend_bff = {
      service_name = "ikaro-backend"
      member       = "serviceAccount:ikaro-bff@${var.project_id}.iam.gserviceaccount.com"
    }
    backend_pubsub_invoker = {
      service_name = "ikaro-backend"
      member       = "serviceAccount:ikaro-pubsub-invoker@${var.project_id}.iam.gserviceaccount.com"
    }
    bff_web = {
      service_name = "ikaro-bff"
      member       = "serviceAccount:ikaro-web@${var.project_id}.iam.gserviceaccount.com"
    }
    }, var.iam_admin_user != "" ? {
    backend_iam_admin_user = {
      service_name = "ikaro-backend"
      member       = "user:${var.iam_admin_user}"
    }
  } : {})

  workload_cloud_run_public_invokers = toset(["ikaro-bff", "ikaro-web"])
  workload_relay_cloud_run_services  = toset(["ikaro-backend"])

  workload_pubsub_subscription_members = {
    for key, subscription in local.workload_subscriptions : "service_agent_subscriber_${key}" => {
      subscription = "ikaro-${subscription.topic}-${subscription.consumer}"
      role         = "roles/pubsub.subscriber"
      member       = "serviceAccount:${local.workload_pubsub_service_agent}"
    }
  }

  workload_pubsub_topic_members = merge({
    for key, subscription in local.workload_subscriptions : "service_agent_dlq_publisher_${key}" => {
      topic  = "ikaro-${subscription.topic}-${subscription.consumer}-dlq"
      role   = "roles/pubsub.publisher"
      member = "serviceAccount:${local.workload_pubsub_service_agent}"
    }
    }, {
    for event in keys(local.workload_topics) : "backend_publisher_${event}" => {
      topic  = "ikaro-${event}"
      role   = "roles/pubsub.publisher"
      member = "serviceAccount:ikaro-backend@${var.project_id}.iam.gserviceaccount.com"
    }
    }, {
    for event in ["cron-reminders", "cron-loyalty-expiry", "cron-loyalty-expiry-warning", "cron-outbox-relay"] : "scheduler_publisher_${event}" => {
      topic  = "ikaro-${event}"
      role   = "roles/pubsub.publisher"
      member = "serviceAccount:${local.workload_scheduler_service_agent}"
    }
  })

  workload_service_account_members = {
    pubsub_token_creator = {
      service_account_id = "projects/${var.project_id}/serviceAccounts/ikaro-pubsub-invoker@${var.project_id}.iam.gserviceaccount.com"
      role               = "roles/iam.serviceAccountTokenCreator"
      member             = "serviceAccount:${local.workload_pubsub_service_agent}"
    }
  }
}

module "workload_iam" {
  source = "../../modules/workload-iam"

  project_id = var.project_id
  region     = var.region

  cloud_run_invokers          = local.workload_cloud_run_invokers
  relay_cloud_run_services    = local.workload_relay_cloud_run_services
  pubsub_subscription_members = local.workload_pubsub_subscription_members
  pubsub_topic_members        = local.workload_pubsub_topic_members
  service_account_members     = local.workload_service_account_members
}

import {
  for_each = local.workload_cloud_run_invokers
  to       = module.workload_iam.google_cloud_run_v2_service_iam_member.invoker[each.key]
  id       = "projects/${var.project_id}/locations/${var.region}/services/${each.value.service_name} roles/run.invoker ${each.value.member}"
}

import {
  for_each = local.workload_cloud_run_public_invokers
  to       = google_cloud_run_v2_service_iam_member.public_invoker[each.value]
  id       = "projects/${var.project_id}/locations/${var.region}/services/${each.value} roles/run.invoker allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  #checkov:skip=CKV_IKARO_1:reviewed intentional public BFF/web invoker grants
  for_each = local.workload_cloud_run_public_invokers

  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "allUsers"
}

import {
  for_each = local.workload_pubsub_subscription_members
  to       = module.workload_iam.google_pubsub_subscription_iam_member.member[each.key]
  id       = "projects/${var.project_id}/subscriptions/${each.value.subscription} ${each.value.role} ${each.value.member}"
}

import {
  for_each = local.workload_pubsub_topic_members
  to       = module.workload_iam.google_pubsub_topic_iam_member.member[each.key]
  id       = "projects/${var.project_id}/topics/${each.value.topic} ${each.value.role} ${each.value.member}"
}

import {
  for_each = local.workload_service_account_members
  to       = module.workload_iam.google_service_account_iam_member.member[each.key]
  id       = "${each.value.service_account_id} ${each.value.role} ${each.value.member}"
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
