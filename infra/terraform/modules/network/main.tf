# modules/network — VPC, subnet (Private Google Access + flow logs), private
# services access peering for Cloud SQL, and default-deny ingress firewall.
#
# Deliberately absent (M17 §0): no google_vpc_access_connector (D7 — Cloud Run
# uses direct VPC egress, S18) and no Cloud NAT (backend egresses
# PRIVATE_RANGES_ONLY; the BFF only calls Google APIs via PGA + the backend).

resource "google_compute_network" "vpc" {
  name                    = "ikaro-vpc-${var.environment}"
  project                 = var.project_id
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "ikaro-subnet-${var.environment}"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = var.subnet_cidr

  # The BFF egresses ALL_TRAFFIC through this subnet (S18); its Google-API
  # calls (OAuth token exchange, JWKS fetches) ride Private Google Access.
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Reserved internal range + peering to Google's service-producer network:
# Cloud SQL (M17-S13) gets its private IP from this range.
resource "google_compute_global_address" "psa_range" {
  name          = "ikaro-psa-range-${var.environment}"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range.name]
}

# Explicit default-deny ingress at the lowest user-definable priority; egress
# stays on GCP's implied allow (nothing in the VPC accepts inbound traffic —
# Cloud Run ingress never traverses VPC firewalls).
resource "google_compute_firewall" "deny_all_ingress" {
  name          = "ikaro-deny-all-ingress-${var.environment}"
  project       = var.project_id
  network       = google_compute_network.vpc.name
  direction     = "INGRESS"
  priority      = 65534
  source_ranges = ["0.0.0.0/0"]

  deny {
    protocol = "all"
  }

  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}
