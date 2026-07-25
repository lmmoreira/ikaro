mock_provider "google" {}

variables {
  project_id = "ikaro-staging"
}

run "roles_have_exactly_the_reviewed_permissions" {
  command = plan

  assert {
    condition     = google_project_iam_custom_role.planner_iam_policy_reader.role_id == "tfPlannerIamPolicyReader" && length(google_project_iam_custom_role.planner_iam_policy_reader.permissions) == 9 && alltrue([for permission in ["artifactregistry.repositories.getIamPolicy", "compute.firewalls.get", "iam.serviceAccounts.getIamPolicy", "pubsub.subscriptions.getIamPolicy", "pubsub.topics.getIamPolicy", "resourcemanager.projects.getIamPolicy", "run.services.getIamPolicy", "secretmanager.secrets.getIamPolicy", "storage.buckets.getIamPolicy"] : contains(tolist(google_project_iam_custom_role.planner_iam_policy_reader.permissions), permission)])
    error_message = "The planner role must retain exactly its reviewed read-only IAM-policy permissions."
  }

  assert {
    condition     = google_project_iam_custom_role.resource_iam_writer.role_id == "tfFoundationResourceIamWriter" && length(google_project_iam_custom_role.resource_iam_writer.permissions) == 12 && alltrue([for permission in ["artifactregistry.repositories.getIamPolicy", "artifactregistry.repositories.setIamPolicy", "pubsub.subscriptions.getIamPolicy", "pubsub.subscriptions.setIamPolicy", "pubsub.topics.getIamPolicy", "pubsub.topics.setIamPolicy", "run.services.getIamPolicy", "run.services.setIamPolicy", "secretmanager.secrets.getIamPolicy", "secretmanager.secrets.setIamPolicy", "storage.buckets.getIamPolicy", "storage.buckets.setIamPolicy"] : contains(tolist(google_project_iam_custom_role.resource_iam_writer.permissions), permission)])
    error_message = "The Foundation resource writer must contain only the reviewed Artifact Registry, Cloud Run, Pub/Sub, bucket, and secret IAM-policy permissions."
  }

  assert {
    condition     = !contains(tolist(google_project_iam_custom_role.resource_iam_writer.permissions), "storage.objects.get") && !contains(tolist(google_project_iam_custom_role.resource_iam_writer.permissions), "secretmanager.versions.access")
    error_message = "The Foundation resource writer must not read application objects or secret values."
  }

  assert {
    condition     = google_project_iam_custom_role.relay_vm_operator.role_id == "tfFoundationRelayVmOperator" && length(google_project_iam_custom_role.relay_vm_operator.permissions) == 32 && alltrue([for permission in ["cloudsql.instances.get", "cloudsql.users.create", "cloudsql.users.delete", "cloudsql.users.get", "cloudsql.users.list", "compute.disks.create", "compute.disks.delete", "compute.disks.get", "compute.disks.use", "compute.firewalls.create", "compute.firewalls.delete", "compute.firewalls.get", "compute.firewalls.list", "compute.firewalls.update", "compute.instances.create", "compute.instances.delete", "compute.instances.get", "compute.instances.getIamPolicy", "compute.instances.list", "compute.instances.setIamPolicy", "compute.instances.setLabels", "compute.instances.setMetadata", "compute.instances.setServiceAccount", "compute.instances.setTags", "compute.machineTypes.get", "compute.networks.get", "compute.networks.use", "compute.subnetworks.get", "compute.subnetworks.use", "compute.zones.get", "iap.tunnelInstances.getIamPolicy", "iap.tunnelInstances.setIamPolicy"] : contains(tolist(google_project_iam_custom_role.relay_vm_operator.permissions), permission)])
    error_message = "The relay VM operator must retain exactly its reviewed Cloud SQL, Compute, and IAP control-plane permissions."
  }

  assert {
    condition     = !contains(tolist(google_project_iam_custom_role.relay_vm_operator.permissions), "iam.serviceAccounts.actAs") && !contains(tolist(google_project_iam_custom_role.relay_vm_operator.permissions), "resourcemanager.projects.setIamPolicy") && !contains(tolist(google_project_iam_custom_role.relay_vm_operator.permissions), "secretmanager.versions.access") && !contains(tolist(google_project_iam_custom_role.relay_vm_operator.permissions), "compute.instances.addAccessConfig")
    error_message = "The relay VM operator must not gain service-account actAs, project IAM, secret-value, or public-IP permissions."
  }

  assert {
    condition     = google_project_iam_custom_role.normal_infrastructure_deployer.role_id == "tfNormalInfrastructureDeployer" && length(google_project_iam_custom_role.normal_infrastructure_deployer.permissions) == 162 && alltrue([for permission in ["artifactregistry.repositories.create", "certificatemanager.certs.create", "cloudsql.instances.update", "compute.networks.create", "pubsub.topics.create", "run.services.update", "secretmanager.secrets.create", "servicenetworking.services.addPeering", "storage.buckets.update"] : contains(tolist(google_project_iam_custom_role.normal_infrastructure_deployer.permissions), permission)])
    error_message = "The normal deployer role must cover every reviewed ordinary infrastructure API family."
  }

  assert {
    condition     = alltrue([for permission in google_project_iam_custom_role.normal_infrastructure_deployer.permissions : !strcontains(permission, "setIamPolicy") && !strcontains(permission, "getIamPolicy") && !strcontains(permission, "serviceusage.") && !strcontains(permission, "iam.serviceAccounts") && permission != "secretmanager.versions.access" && !strcontains(permission, "storage.objects")])
    error_message = "The normal deployer role must not mutate or read IAM policies, administer service accounts, activate APIs, or read secret values or bucket objects."
  }
}
