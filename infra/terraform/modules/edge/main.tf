# modules/edge — Global External ALB + serverless NEGs + Cloudflare DNS
# (prod only, D5). Implemented in M17-S22.
#
# Chain: Cloudflare (DNS/CDN/WAF, proxied) -> this module's static IP ->
# Global external Application LB (EXTERNAL_MANAGED) -> host-routed serverless
# NEGs -> Cloud Run (web, bff). Both the `google` and `cloudflare` resources
# live in this one module (not split root-vs-module) because the two sides
# are a single deployable unit — a DNS-authorization CNAME and the cert that
# depends on it, or a host A record and the LB IP it must point at, only
# make sense created together. The `cloudflare` provider itself is
# configured once in envs/prod/providers.tf (root modules configure
# providers; child modules only declare required_providers and inherit) —
# that's the sense in which this is "in the prod env root" per the story
# text, not a claim that the resources themselves live outside this module.
#
# Cloud Armor origin lockdown (security_policy on the backend services
# below) is S36's addition, not this story's — ships behind
# var.enable_origin_lockdown once S36 lands.

locals {
  # Keyed by short name (not the hostname itself) so resource addresses stay
  # readable: google_certificate_manager_dns_authorization.hosts["bff"], not
  # ...["bff.ikaro.online"]. Every hostname this edge fronts is listed here
  # exactly once — the NEG/backend-service host routing, the Certificate
  # Manager SAN list + per-host DNS authorizations, and the Cloudflare A
  # records all derive from this single map so a 4th hostname would only
  # ever need to be added here.
  hostnames = {
    apex = var.root_domain
    www  = "www.${var.root_domain}"
    bff  = "bff.${var.root_domain}"
  }
}

# ---------------------------------------------------------------------------
# Static IP — Cloudflare's proxied A records (below) point at this. Must be
# reserved (not the forwarding rule's auto-assigned ephemeral IP) so the
# Cloudflare-side records never need to change once created.
# ---------------------------------------------------------------------------

resource "google_compute_global_address" "lb_ip" {
  name    = "ikaro-edge-ip"
  project = var.project_id
}

# ---------------------------------------------------------------------------
# Serverless NEGs — one per Cloud Run service. A serverless NEG has no
# instances/endpoints to manage explicitly; it always points at the current
# revision Cloud Run is serving traffic to.
# ---------------------------------------------------------------------------

resource "google_compute_region_network_endpoint_group" "web" {
  name                  = "ikaro-web-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.web_service_name
  }
}

resource "google_compute_region_network_endpoint_group" "bff" {
  name                  = "ikaro-bff-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.bff_service_name
  }
}

# ---------------------------------------------------------------------------
# Backend services — EXTERNAL_MANAGED (the "Global external Application Load
# Balancer" product, not the older Classic ALB's EXTERNAL scheme). No
# health_checks block: the provider's own docs state a health check is
# required "unless the backend service uses an internet or serverless NEG as
# a backend" — Cloud Run itself governs which revision is healthy/serving,
# so one is unnecessary here. protocol is left
# unset (module default HTTP) — deliberately: for a serverless NEG the field
# has no real effect, since the LB-to-Cloud-Run hop is always HTTPS,
# internally managed by Google regardless of what's declared here.
# ---------------------------------------------------------------------------

resource "google_compute_backend_service" "web" {
  name                  = "ikaro-web-backend"
  project               = var.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.web.id
  }

  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_compute_backend_service" "bff" {
  name                  = "ikaro-bff-backend"
  project               = var.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.bff.id
  }

  log_config {
    enable      = true
    sample_rate = 1
  }
}

# ---------------------------------------------------------------------------
# Host routing (HTTPS): root_domain + www -> web; bff -> bff. www is routed
# here too (not only redirected at the Cloudflare edge below) so a request
# that somehow reaches the LB directly for www still resolves correctly
# rather than erroring — defense in depth, not the primary redirect path.
# ---------------------------------------------------------------------------

resource "google_compute_url_map" "https" {
  name            = "ikaro-edge-https"
  project         = var.project_id
  default_service = google_compute_backend_service.web.id

  host_rule {
    hosts        = [local.hostnames.apex, local.hostnames.www]
    path_matcher = "web"
  }

  host_rule {
    hosts        = [local.hostnames.bff]
    path_matcher = "bff"
  }

  path_matcher {
    name            = "web"
    default_service = google_compute_backend_service.web.id
  }

  path_matcher {
    name            = "bff"
    default_service = google_compute_backend_service.bff.id
  }
}

# HTTP -> HTTPS redirect (separate url_map + target_http_proxy + forwarding
# rule on port 80, sharing the same static IP) — a url_map can carry either
# backend routing or a redirect, not both, so this is unavoidably a second
# proxy chain rather than a rule bolted onto the https url_map above.
resource "google_compute_url_map" "http_redirect" {
  name    = "ikaro-edge-http-redirect"
  project = var.project_id

  default_url_redirect {
    https_redirect         = true
    strip_query            = false
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
  }
}

# ---------------------------------------------------------------------------
# Certificate Manager — DNS authorization (not load-balancer authorization):
# the only method that validates while Cloudflare proxies traffic (D5/story
# text). One authorization per hostname rather than relying on
# "ikaro.online"'s authorization implicitly covering "*.ikaro.online" — the
# API doc language for that wildcard behavior is for wildcard *issuance*,
# not a guarantee every non-wildcard SAN silently reuses a parent
# authorization; one authorization per SAN is the unambiguous, explicitly
# documented shape and matches the story text's plural "DNS-authorization
# CNAME records" / "the three hostnames".
#
# deletion_policy = "ABANDON" on every Certificate Manager resource below:
# the classic LB resources above (global_address, backend_service, url_map,
# forwarding_rule) don't expose an equivalent field at all, but these newer
# resources do, and everywhere else in this repo a prod-critical resource
# gets the strongest available protection against an accidental destroy/
# replace (deletion_protection = true on the database, Cloud Run services,
# migrate job). ABANDON removes the resource from Terraform state without
# deleting it in GCP — an intentional removal needs a manual console/gcloud
# cleanup afterward, which is the accepted tradeoff for not letting a
# terraform apply silently take down prod's live cert mid-deploy.
# ---------------------------------------------------------------------------

resource "google_certificate_manager_dns_authorization" "hosts" {
  for_each = local.hostnames

  name            = "ikaro-dns-auth-${each.key}"
  project         = var.project_id
  location        = "global"
  domain          = each.value
  deletion_policy = "ABANDON"
}

resource "google_certificate_manager_certificate" "edge" {
  name            = "ikaro-edge-cert"
  project         = var.project_id
  location        = "global"
  deletion_policy = "ABANDON"

  managed {
    domains = [for h in local.hostnames : h]
    dns_authorizations = [
      for k, h in local.hostnames : google_certificate_manager_dns_authorization.hosts[k].id
    ]
  }
}

# Certificate Manager's certificate_map + per-hostname map entries are what
# the target HTTPS proxy actually consults at TLS handshake (SNI) time — the
# certificate resource alone isn't attachable to a proxy directly. All three
# entries reference the same single SAN certificate above; a map entry only
# selects which certificate to serve for a given SNI, it doesn't require a
# 1:1 certificate-per-hostname.
resource "google_certificate_manager_certificate_map" "edge" {
  name            = "ikaro-edge-cert-map"
  project         = var.project_id
  deletion_policy = "ABANDON"
}

resource "google_certificate_manager_certificate_map_entry" "hosts" {
  for_each = local.hostnames

  name            = "ikaro-edge-cert-map-entry-${each.key}"
  project         = var.project_id
  map             = google_certificate_manager_certificate_map.edge.name
  hostname        = each.value
  certificates    = [google_certificate_manager_certificate.edge.id]
  deletion_policy = "ABANDON"
}

# ---------------------------------------------------------------------------
# Target proxies + forwarding rules
# ---------------------------------------------------------------------------

resource "google_compute_target_https_proxy" "edge" {
  name    = "ikaro-edge-https-proxy"
  project = var.project_id
  url_map = google_compute_url_map.https.id

  # Documented Google pattern for attaching a Certificate Manager map to a
  # classic Compute target proxy: a certificatemanager.googleapis.com
  # relative resource name, not the bare map id/self_link.
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.edge.id}"
}

resource "google_compute_target_http_proxy" "edge" {
  name    = "ikaro-edge-http-proxy"
  project = var.project_id
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "ikaro-edge-https-fr"
  project               = var.project_id
  ip_address            = google_compute_global_address.lb_ip.address
  ip_protocol           = "TCP"
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_https_proxy.edge.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "ikaro-edge-http-fr"
  project               = var.project_id
  ip_address            = google_compute_global_address.lb_ip.address
  ip_protocol           = "TCP"
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_http_proxy.edge.id
}

# ---------------------------------------------------------------------------
# Cloudflare DNS — two distinct record shapes, easy to get backwards:
#   1. DNS-authorization CNAMEs: DNS-only / gray-cloud (proxied = false).
#      A proxied validation record breaks issuance (story text, 2026-07-08
#      finding) — Google's validator resolves this CNAME directly and a
#      Cloudflare-proxied answer doesn't return the expected target.
#   2. Host records (apex/www/bff -> LB IP): proxied / orange-cloud
#      (proxied = true) — these carry real traffic through Cloudflare's
#      edge (WAF/DDoS/CDN), the whole point of D5.
# ---------------------------------------------------------------------------

resource "cloudflare_dns_record" "dns_auth" {
  for_each = local.hostnames

  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(google_certificate_manager_dns_authorization.hosts[each.key].dns_resource_record[0].name, ".")
  type    = google_certificate_manager_dns_authorization.hosts[each.key].dns_resource_record[0].type
  content = trimsuffix(google_certificate_manager_dns_authorization.hosts[each.key].dns_resource_record[0].data, ".")
  ttl     = 300
  proxied = false
}

resource "cloudflare_dns_record" "hosts" {
  for_each = local.hostnames

  zone_id = var.cloudflare_zone_id
  name    = each.value
  type    = "A"
  content = google_compute_global_address.lb_ip.address
  # ttl = 1 means "automatic" (schema) — Cloudflare requires this for any
  # proxied record; an explicit TTL is rejected once proxied = true.
  ttl     = 1
  proxied = true
}

# www -> apex redirect at the Cloudflare edge (the "Single Redirect" /
# Dynamic Redirect rule engine — Page Rules' modern replacement). Runs
# before the request ever reaches the LB, so this is the primary redirect
# path; the www host_rule on the https url_map above is the fallback.
resource "cloudflare_ruleset" "www_redirect" {
  zone_id = var.cloudflare_zone_id
  name    = "ikaro-www-apex-redirect"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [
    {
      action      = "redirect"
      description = "Redirect ${local.hostnames.www} to https://${local.hostnames.apex}"
      expression  = "(http.host eq \"${local.hostnames.www}\")"
      enabled     = true

      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true

          target_url = {
            expression = "concat(\"https://${local.hostnames.apex}\", http.request.uri.path)"
          }
        }
      }
    }
  ]
}

# Full (strict): Cloudflare validates the origin's certificate, not just that
# TLS is present — required since the origin (Certificate Manager's
# DNS-authorization cert above) is a real, publicly-trusted certificate, not
# a self-signed one. Left unmanaged, the zone defaults to Flexible (edge
# review finding, 2026-07-20) — Cloudflare would then connect to the LB over
# plain HTTP, which the LB's own HTTP->HTTPS redirect above turns into a
# redirect loop. "strict" is this setting's API value for the dashboard's
# "Full (strict)" option.
resource "cloudflare_zone_setting" "ssl_mode" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "ssl"
  value      = "strict"
}
