# modules/relay-vm — on-demand IAP-only relay VM, the single fix for TD32
# (no network path from a dev machine into ikaro-vpc-{env}, so neither
# Cloud SQL's private IP nor ikaro-backend's ingress:internal Cloud Run
# service is reachable). Once a VM inside the VPC is IAP-reachable, it is
# — from a network standpoint — no different from any other VPC-internal
# resource: it can dial Cloud SQL's private IP directly, and its calls to
# the backend's public *.a.run.app hostname are correctly classified as
# internal-origin traffic (Private Google Access on the subnet).
#
# Inert by default: the firewall rule and audit config below are permanent,
# always-applied config (cheap, not billable); the VM and access grants that
# only make sense while it exists are count-gated on var.create.
#
# Identity model (redesigned 2026-07-24, cross-tool PR review on #203):
# the relay VM's OWN service account does the actual Cloud SQL / Cloud Run
# / Secret Manager work, authenticating via GCE's metadata server — not a
# human re-authenticating interactively inside the VM. This was forced by
# a real constraint (no external IP + no Cloud NAT means gcloud CLI has no
# reachable install path — its releases live on dl.google.com, not a
# Private-Google-Access-covered *.googleapis.com domain), but it's also
# strictly better on its own terms: keyless, short-lived, auto-rotated
# credentials minted through the instance metadata server,
# versus a human's own long-lived Google identity gaining run.invoker +
# Cloud SQL IAM access usable from anywhere. See modules/relay-vm/README.md
# "Identity model" for the full reasoning.

locals {
  network_tag = "ikaro-relay-vm-${var.environment}"

  # Only cloud-sql-proxy is needed on the VM now (gcloud CLI has no
  # reachable install path here — see the file header comment). Its
  # binary is hosted on storage.googleapis.com, a genuine *.googleapis.com
  # domain, so Private Google Access covers it even with no external IP
  # and no Cloud NAT. Pinned version, not "latest" — verified live
  # (2026-07-24): v2.23.0 exists at this exact URL and matches the
  # GoogleCloudPlatform/cloud-sql-proxy GitHub release published the same
  # day as the binary's own last-modified date. Bump the version string
  # (and the checksum below) here when it goes stale; this is the only
  # place either is hardcoded.
  #
  # SHA-256 verified before chmod/execution (cross-tool PR review finding,
  # round 3, 2026-07-24): downloading and running a binary as root with
  # only a URL/version pin, no integrity check, means a mutable object
  # replacement or corrupted download becomes root code execution with
  # this VM's own service account's privileges. Verified two independent
  # ways before pinning: downloaded the real file and ran sha256sum
  # locally, and cross-checked against the GitHub release page's own
  # published per-asset hash — both matched exactly.
  #
  # Runs as a systemd service so it's immediately listening on 127.0.0.1:5433
  # the moment the VM finishes booting — no manual start step, no gcloud
  # auth step. --auto-iam-authn's Application Default Credentials
  # automatically fall back to this instance's own attached service
  # account via the metadata server when nothing else is configured —
  # that's the whole redesign in one sentence.
  startup_script = <<-EOT
    #!/usr/bin/env bash
    set -euo pipefail

    if [ ! -x /usr/local/bin/cloud-sql-proxy ]; then
      curl -fsSL -o /usr/local/bin/cloud-sql-proxy \
        "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.23.0/cloud-sql-proxy.linux.amd64"
      echo "cd689d582b826fa5bc82c01ccc14e45a58200c3cefbf923ce96c422825e4e6f6  /usr/local/bin/cloud-sql-proxy" | sha256sum -c -
      chmod +x /usr/local/bin/cloud-sql-proxy
    fi

    cat > /etc/systemd/system/cloud-sql-proxy.service <<'UNIT'
    [Unit]
    Description=Cloud SQL Auth Proxy (TD32 relay VM)
    After=network-online.target
    Wants=network-online.target

    [Service]
    ExecStart=/usr/local/bin/cloud-sql-proxy --private-ip --auto-iam-authn --port 5433 ${var.db_instance_connection_name}
    Restart=on-failure
    RestartSec=5
    User=root

    [Install]
    WantedBy=multi-user.target
    UNIT

    systemctl daemon-reload

    %{if var.db_instance_connection_name != ""~}
    systemctl enable --now cloud-sql-proxy.service
    %{else~}
    echo "cloud-sql-proxy.service installed but not started: no db_instance_connection_name (prod pre-S37 state)." >&2
    %{endif~}
  EOT
}

# Does real work now (redesigned 2026-07-24) — Cloud SQL IAM auth,
# Cloud Run invocation, and platform-admin-key reads, all via GCE's
# metadata-server credential chain (no gcloud CLI, no interactive login).
# Every grant below is scoped to exactly what this identity needs and
# nothing else — see the file header comment for why this is the more
# secure choice, not just the only one that works around the internet-
# egress constraint.
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

# Instance-scoped (not project-wide, cross-tool review finding on #203) —
# iam_admin_user can only tunnel/SSH into THIS relay instance, not any
# other current or future VM in the project. Both are count-gated with
# the instance itself: a binding referencing google_compute_instance.relay[0]
# can't exist when that index doesn't (var.create = false).
resource "google_iap_tunnel_instance_iam_member" "admin_iap_tunnel" {
  count = var.create ? 1 : 0

  project  = var.project_id
  zone     = google_compute_instance.relay[0].zone
  instance = google_compute_instance.relay[0].name
  role     = "roles/iap.tunnelResourceAccessor"
  member   = "user:${var.iam_admin_user}"
}

# OS Login (enabled on the instance above) authorizes SSH via IAM rather
# than metadata-managed keys — the narrower, Google-recommended pairing
# with IAP for exactly this bastion/relay pattern. Instance-scoped for the
# same reason as the tunnel grant above.
resource "google_compute_instance_iam_member" "admin_os_login" {
  count = var.create ? 1 : 0

  project       = var.project_id
  zone          = google_compute_instance.relay[0].zone
  instance_name = google_compute_instance.relay[0].name
  role          = "roles/compute.osLogin"
  member        = "user:${var.iam_admin_user}"
}

# Closes the TD32 discovery gap: only the backend runtime SA could read
# platform-admin-key (modules/iam) before this. Grants the relay VM's own
# service account (not the human, per the 2026-07-24 redesign) — read via
# a metadata-server-minted access token from inside the VM, no gcloud
# needed.
resource "google_secret_manager_secret_iam_member" "relay_platform_admin_key" {
  count = var.create ? 1 : 0

  secret_id = var.platform_admin_key_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.relay.email}"
}

# Cloud SQL access for the relay VM's own service account — only created
# once both the VM and a real database instance exist (prod's database
# module stays count = var.enable_database ? 1 : 0 until S37; the env
# root passes empty strings for db_instance_name/db_instance_connection_name
# when it isn't created yet, and this whole block of resources is skipped).
resource "google_project_iam_member" "relay_cloudsql_client" {
  count = var.create && var.db_instance_name != "" ? 1 : 0

  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.relay.email}"
}

resource "google_project_iam_member" "relay_cloudsql_instance_user" {
  count = var.create && var.db_instance_name != "" ? 1 : 0

  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.relay.email}"
}

# Passwordless Cloud SQL IAM database user for the relay SA — same
# mechanism as modules/database's google_sql_user.iam_admin, but for a
# service account instead of a human. The .gserviceaccount.com suffix
# must be stripped from the email (Postgres username length limits,
# confirmed against Google's own IAM database authentication docs) —
# Cloud SQL's IAM auth maps the trimmed name back to this exact SA at
# connection time.
resource "google_sql_user" "relay" {
  count = var.create && var.db_instance_name != "" ? 1 : 0

  name     = trimsuffix(google_service_account.relay.email, ".gserviceaccount.com")
  project  = var.project_id
  instance = var.db_instance_name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

# IAP's own docs (cloud.google.com/iap/docs/using-tcp-forwarding) are
# explicit that tunnel access logging is opt-in, not on by default —
# without this, the "IAP tunnel connections land in Cloud Audit Logs"
# claim (README.md, TD32 AC) would be unenforced. Admin Activity logs for
# iap.googleapis.com stay on regardless (every GCP service's Admin
# Activity logging is always-on and not configurable), so this only adds
# what was actually missing.
resource "google_project_iam_audit_config" "iap_tunnel_access" {
  project = var.project_id
  service = "iap.googleapis.com"

  audit_log_config {
    log_type = "ADMIN_READ"
  }
  audit_log_config {
    log_type = "DATA_READ"
  }
  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

# Secret Manager's AccessSecretVersion (what reads platform-admin-key) is
# also Data Access-classified, also opt-in by default — cross-tool review
# finding on #203: the original audit config covered only IAP, leaving
# this specific claim unenforced even though it's explicitly promised in
# both README.md and the TD32 acceptance criteria.
resource "google_project_iam_audit_config" "secretmanager_access" {
  project = var.project_id
  service = "secretmanager.googleapis.com"

  audit_log_config {
    log_type = "DATA_READ"
  }
}

# Cloud SQL's cloudsql.instances.login (what the relay SA's --auto-iam-authn
# login triggers) is also Data Access-classified — DATA_WRITE specifically,
# confirmed against Google's own Cloud SQL audit logging docs — and also
# opt-in by default. Third audit-config gap the review process found one
# service at a time (IAP round 2, Secret Manager round 2, Cloud SQL round
# 3) — without this, the Cloud SQL half of the "appears in Cloud Audit
# Logs" claim was unenforced even though every other half now is.
resource "google_project_iam_audit_config" "cloudsql_login" {
  project = var.project_id
  service = "cloudsql.googleapis.com"

  audit_log_config {
    log_type = "DATA_WRITE"
  }
}
