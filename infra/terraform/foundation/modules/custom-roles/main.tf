locals {
  planner_iam_policy_reader_permissions = toset([
    "artifactregistry.repositories.getIamPolicy",
    "compute.firewalls.get",
    "iam.serviceAccounts.getIamPolicy",
    "pubsub.subscriptions.getIamPolicy",
    "pubsub.topics.getIamPolicy",
    "resourcemanager.projects.getIamPolicy",
    "run.services.getIamPolicy",
    "secretmanager.secrets.getIamPolicy",
    "storage.buckets.getIamPolicy",
  ])

  resource_iam_writer_permissions = toset([
    "artifactregistry.repositories.getIamPolicy",
    "artifactregistry.repositories.setIamPolicy",
    "pubsub.subscriptions.getIamPolicy",
    "pubsub.subscriptions.setIamPolicy",
    "pubsub.topics.getIamPolicy",
    "pubsub.topics.setIamPolicy",
    "run.services.getIamPolicy",
    "run.services.setIamPolicy",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
    "storage.buckets.getIamPolicy",
    "storage.buckets.setIamPolicy",
  ])

  # This is the exact Compute, Cloud SQL, and IAP surface required to manage
  # the private relay VM control plane. It deliberately excludes project IAM,
  # secret-value access, public-IP assignment, and service-account actAs; the
  # latter will be granted only on the relay service account itself.
  relay_vm_operator_permissions = toset([
    "cloudsql.users.create",
    "cloudsql.users.delete",
    "cloudsql.users.get",
    "cloudsql.users.list",
    "compute.disks.create",
    "compute.disks.delete",
    "compute.disks.get",
    "compute.disks.use",
    "compute.firewalls.create",
    "compute.firewalls.delete",
    "compute.firewalls.get",
    "compute.firewalls.list",
    "compute.firewalls.update",
    "compute.instances.create",
    "compute.instances.delete",
    "compute.instances.get",
    "compute.instances.getIamPolicy",
    "compute.instances.list",
    "compute.instances.setIamPolicy",
    "compute.instances.setLabels",
    "compute.instances.setMetadata",
    "compute.instances.setServiceAccount",
    "compute.instances.setTags",
    "compute.machineTypes.get",
    "compute.networks.get",
    "compute.networks.use",
    "compute.subnetworks.get",
    "compute.subnetworks.use",
    "compute.zones.get",
    "iap.tunnelInstances.getIamPolicy",
    "iap.tunnelInstances.setIamPolicy",
  ])
}

# This role already exists in both projects. Foundation adopts it so the
# complete custom-role boundary is version-controlled in the protected state.
resource "google_project_iam_custom_role" "planner_iam_policy_reader" {
  project     = var.project_id
  role_id     = "tfPlannerIamPolicyReader"
  title       = "Terraform Planner IAM Policy Reader"
  description = "Minimal read-only getIamPolicy permissions for M17's tf-planner service accounts, covering exactly the google_*_iam_member resource types this codebase's Terraform modules manage. Narrower than roles/iam.securityReviewer, which covers getIamPolicy across nearly every GCP service."
  permissions = local.planner_iam_policy_reader_permissions
  stage       = "GA"
}

# Foundation needs IAM-policy mutation only for application Artifact Registry
# repositories, buckets, secrets, Cloud Run services, and Pub/Sub resources
# during the ownership transfers. This role deliberately excludes repository
# artifact access, object and secret-value read/write permissions, and every
# project/service-account IAM permission.
resource "google_project_iam_custom_role" "resource_iam_writer" {
  project     = var.project_id
  role_id     = "tfFoundationResourceIamWriter"
  title       = "Terraform Foundation Resource IAM Writer"
  description = "Manage IAM policies for Terraform-managed Artifact Registry, Cloud Run, Pub/Sub, bucket, and secret resources only."
  permissions = local.resource_iam_writer_permissions
  stage       = "GA"
}

# The relay VM is an operator-controlled break-glass access path to private
# Cloud SQL. Its lifecycle belongs to Foundation, not the normal environment
# deployer. Keep the role restricted to the resource operations Terraform uses
# for that single control plane; its service-account attachment is separately
# scoped to the relay service account in the following migration step.
resource "google_project_iam_custom_role" "relay_vm_operator" {
  project     = var.project_id
  role_id     = "tfFoundationRelayVmOperator"
  title       = "Terraform Foundation Relay VM Operator"
  description = "Operate the Foundation-owned private relay VM, its firewall, instance IAM, and Cloud SQL IAM database user without project IAM or secret-value access."
  permissions = local.relay_vm_operator_permissions
  stage       = "GA"
}
