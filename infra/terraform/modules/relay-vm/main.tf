# modules/relay-vm — on-demand IAP-only relay VM, the single fix for TD32
# (no network path from a dev machine into ikaro-vpc-{env}, so neither
# Cloud SQL's private IP nor ikaro-backend's ingress:internal Cloud Run
# service is reachable). Once a VM inside the VPC is IAP-reachable, it is
# — from a network standpoint — no different from any other VPC-internal
# resource: it can dial Cloud SQL's private IP directly, and its calls to
# the backend's public *.a.run.app hostname are correctly classified as
# internal-origin traffic (Private Google Access on the subnet).
#
# Inert by default: the firewall rule and both IAM grants below are
# permanent, always-applied config (cheap, not billable); only the VM
# resource itself is count-gated on var.create.

locals {
  network_tag = "ikaro-relay-vm-${var.environment}"

  # Idempotent on every boot (this VM is destroyed/recreated per session,
  # TD32 design, so "idempotent" mostly matters for the rare mid-session
  # reboot): installs the two CLIs the acceptance criteria actually need
  # — gcloud (for `gcloud auth application-default login`, `gcloud secrets
  # versions access`, `gcloud auth print-identity-token`) and cloud-sql-proxy
  # — via Google's own documented apt repo, rather than hardcoding a
  # binary download URL/version that would go stale.
  startup_script = <<-EOT
    #!/usr/bin/env bash
    set -euo pipefail

    if ! command -v gcloud >/dev/null 2>&1 || ! command -v cloud-sql-proxy >/dev/null 2>&1; then
      echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
        > /etc/apt/sources.list.d/google-cloud-sdk.list
      curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
        | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
      apt-get update -y
      apt-get install -y google-cloud-cli google-cloud-cli-cloud-sql-proxy
    fi
  EOT
}

# Identity-only: the VM needs some attached service account to boot, but
# every real operation inside it runs under the human operator's own
# re-authenticated credentials (TD32 discovery — reuses iam_admin_user's
# existing Cloud SQL IAM user + run.invoker grants with zero new IAM
# surface). This SA carries no IAM role bindings, so its OAuth scope
# ceiling below is inert in practice.
resource "google_service_account" "relay" {
  account_id   = "ikaro-relay-vm"
  display_name = "Ikaro IAP relay VM identity (${var.environment}, TD32)"
  project      = var.project_id
}

resource "google_compute_instance" "relay" {
  count = var.create ? 1 : 0

  name         = "ikaro-relay-vm-${var.environment}"
  project      = var.project_id
  zone         = var.zone
  machine_type = var.machine_type
  tags         = [local.network_tag]
  labels       = var.labels

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 10
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = var.subnet_id
    # Deliberately no access_config block: no external IP. The whole point
    # of this VM is IAP-only reachability — a public address would defeat
    # it (TD32 design).
  }

  service_account {
    email  = google_service_account.relay.email
    scopes = ["cloud-platform"]
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "true"
  }

  metadata_startup_script = local.startup_script
}

# IAP's fixed source range — the only ingress this VM ever accepts.
# Priority 1000 (GCP default) sits well below modules/network's
# deny-all-ingress rule at 65534, so this allow rule correctly takes
# precedence for matching traffic without touching that rule at all.
resource "google_compute_firewall" "allow_iap_ssh" {
  name      = "ikaro-relay-vm-allow-iap-ssh-${var.environment}"
  project   = var.project_id
  network   = var.network_id
  direction = "INGRESS"

  source_ranges = ["35.235.240.0/20"]
  target_tags   = [local.network_tag]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Lets iam_admin_user open the IAP tunnel at all.
resource "google_project_iam_member" "admin_iap_tunnel" {
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "user:${var.iam_admin_user}"
}

# OS Login (enabled on the instance above) authorizes SSH via IAM rather
# than metadata-managed keys — the narrower, Google-recommended pairing
# with IAP for exactly this bastion/relay pattern.
resource "google_project_iam_member" "admin_os_login" {
  project = var.project_id
  role    = "roles/compute.osLogin"
  member  = "user:${var.iam_admin_user}"
}

# Closes the TD32 discovery gap: only the backend runtime SA could read
# platform-admin-key (modules/iam) before this. Without it, the
# tenant-provisioning acceptance criterion has no way to read the value it
# needs to send as X-Platform-Admin-Key.
resource "google_secret_manager_secret_iam_member" "admin_platform_admin_key" {
  secret_id = var.platform_admin_key_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "user:${var.iam_admin_user}"
}
