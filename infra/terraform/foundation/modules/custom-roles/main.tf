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
    "cloudsql.instances.get",
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

  # This is the ordinary environment Terraform surface, derived from the
  # resources that remain in envs/{staging,prod}: networks, Cloud SQL,
  # buckets, secrets, Cloud Run services/jobs, Pub/Sub, Scheduler, Artifact
  # Registry, and the production edge. IAM, Service Usage, service-account
  # administration, object/secret-value access, and service-account actAs are
  # intentionally absent; Foundation owns policy resources and grants actAs
  # only on the five runtime service accounts below.
  normal_infrastructure_deployer_permissions = toset([
    "artifactregistry.locations.get",
    "artifactregistry.locations.list",
    "artifactregistry.repositories.create",
    "artifactregistry.repositories.delete",
    "artifactregistry.repositories.get",
    "artifactregistry.repositories.list",
    "artifactregistry.repositories.update",
    "certificatemanager.certmapentries.create",
    "certificatemanager.certmapentries.delete",
    "certificatemanager.certmapentries.get",
    "certificatemanager.certmapentries.list",
    "certificatemanager.certmapentries.update",
    "certificatemanager.certmaps.create",
    "certificatemanager.certmaps.delete",
    "certificatemanager.certmaps.get",
    "certificatemanager.certmaps.list",
    "certificatemanager.certmaps.update",
    "certificatemanager.certs.create",
    "certificatemanager.certs.delete",
    "certificatemanager.certs.get",
    "certificatemanager.certs.list",
    "certificatemanager.certs.update",
    "certificatemanager.dnsauthorizations.create",
    "certificatemanager.dnsauthorizations.delete",
    "certificatemanager.dnsauthorizations.get",
    "certificatemanager.dnsauthorizations.list",
    "certificatemanager.dnsauthorizations.update",
    "certificatemanager.locations.get",
    "certificatemanager.locations.list",
    "cloudscheduler.jobs.create",
    "cloudscheduler.jobs.delete",
    "cloudscheduler.jobs.get",
    "cloudscheduler.jobs.list",
    "cloudscheduler.jobs.pause",
    "cloudscheduler.jobs.update",
    "cloudscheduler.locations.get",
    "cloudscheduler.locations.list",
    "cloudsql.databases.create",
    "cloudsql.databases.delete",
    "cloudsql.databases.get",
    "cloudsql.databases.list",
    "cloudsql.databases.update",
    "cloudsql.instances.create",
    "cloudsql.instances.delete",
    "cloudsql.instances.get",
    "cloudsql.instances.list",
    "cloudsql.instances.update",
    "cloudsql.users.create",
    "cloudsql.users.delete",
    "cloudsql.users.get",
    "cloudsql.users.list",
    "cloudsql.users.update",
    "compute.backendServices.create",
    "compute.backendServices.delete",
    "compute.backendServices.get",
    "compute.backendServices.list",
    "compute.backendServices.update",
    "compute.backendServices.use",
    "compute.firewalls.create",
    "compute.firewalls.delete",
    "compute.firewalls.get",
    "compute.firewalls.list",
    "compute.firewalls.update",
    "compute.globalAddresses.create",
    "compute.globalAddresses.delete",
    "compute.globalAddresses.get",
    "compute.globalAddresses.list",
    "compute.globalAddresses.use",
    "compute.globalForwardingRules.create",
    "compute.globalForwardingRules.delete",
    "compute.globalForwardingRules.get",
    "compute.globalForwardingRules.list",
    "compute.globalForwardingRules.update",
    "compute.networks.create",
    "compute.networks.delete",
    "compute.networks.get",
    "compute.networks.list",
    "compute.networks.update",
    "compute.networks.use",
    "compute.projects.get",
    "compute.regionNetworkEndpointGroups.create",
    "compute.regionNetworkEndpointGroups.delete",
    "compute.regionNetworkEndpointGroups.get",
    "compute.regionNetworkEndpointGroups.list",
    "compute.regionNetworkEndpointGroups.use",
    "compute.regions.get",
    "compute.regions.list",
    "compute.subnetworks.create",
    "compute.subnetworks.delete",
    "compute.subnetworks.get",
    "compute.subnetworks.list",
    "compute.subnetworks.update",
    "compute.subnetworks.use",
    "compute.targetHttpProxies.create",
    "compute.targetHttpProxies.delete",
    "compute.targetHttpProxies.get",
    "compute.targetHttpProxies.list",
    "compute.targetHttpProxies.setUrlMap",
    "compute.targetHttpProxies.update",
    "compute.targetHttpProxies.use",
    "compute.targetHttpsProxies.create",
    "compute.targetHttpsProxies.delete",
    "compute.targetHttpsProxies.get",
    "compute.targetHttpsProxies.list",
    "compute.targetHttpsProxies.setCertificateMap",
    "compute.targetHttpsProxies.setUrlMap",
    "compute.targetHttpsProxies.update",
    "compute.targetHttpsProxies.use",
    "compute.urlMaps.create",
    "compute.urlMaps.delete",
    "compute.urlMaps.get",
    "compute.urlMaps.list",
    "compute.urlMaps.update",
    "compute.urlMaps.use",
    "compute.zones.get",
    "compute.zones.list",
    "pubsub.subscriptions.create",
    "pubsub.subscriptions.delete",
    "pubsub.subscriptions.get",
    "pubsub.subscriptions.list",
    "pubsub.subscriptions.update",
    "pubsub.topics.attachSubscription",
    "pubsub.topics.create",
    "pubsub.topics.delete",
    "pubsub.topics.get",
    "pubsub.topics.list",
    "pubsub.topics.update",
    "resourcemanager.projects.get",
    "run.executions.get",
    "run.executions.list",
    "run.jobs.create",
    "run.jobs.delete",
    "run.jobs.get",
    "run.jobs.list",
    "run.jobs.update",
    "run.locations.list",
    "run.operations.get",
    "run.operations.list",
    "run.revisions.get",
    "run.revisions.list",
    "run.services.create",
    "run.services.delete",
    "run.services.get",
    "run.services.list",
    "run.services.update",
    "secretmanager.locations.get",
    "secretmanager.locations.list",
    "secretmanager.secrets.create",
    "secretmanager.secrets.delete",
    "secretmanager.secrets.get",
    "secretmanager.secrets.list",
    "secretmanager.secrets.update",
    "servicenetworking.operations.get",
    "servicenetworking.operations.list",
    "servicenetworking.services.addPeering",
    "servicenetworking.services.deleteConnection",
    "servicenetworking.services.get",
    "storage.buckets.create",
    "storage.buckets.delete",
    "storage.buckets.get",
    "storage.buckets.list",
    "storage.buckets.update",
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

# Ordinary Terraform applies may manage application infrastructure but never
# its IAM or API control plane. Foundation applies own those sensitive paths.
resource "google_project_iam_custom_role" "normal_infrastructure_deployer" {
  project     = var.project_id
  role_id     = "tfNormalInfrastructureDeployer"
  title       = "Terraform Normal Infrastructure Deployer"
  description = "Manage reviewed non-IAM application infrastructure without IAM policy, API activation, service-account, object, or secret-value permissions."
  permissions = local.normal_infrastructure_deployer_permissions
  stage       = "GA"
}
