module "control_plane" {
  source = "../../modules/control-plane"

  environment                           = var.environment
  github_environment                    = "staging-foundation"
  project_id                            = var.project_id
  state_bucket_name                     = var.state_bucket_name
  workload_identity_pool_project_number = var.project_number
}

module "project_services" {
  source = "../../modules/project-services"

  project_id = var.project_id
  services   = ["iap.googleapis.com"]
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
  legacy_deployer_project_role_bindings = {
    for role in toset([
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
      "roles/storage.admin",
    ]) : role => { role = role }
  }
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
  id = "${var.project_id} ${each.value.role} serviceAccount:ikaro-tf-deployer@${var.project_id}.iam.gserviceaccount.com"
}
