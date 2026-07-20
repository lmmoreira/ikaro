# Cross-resource computed attributes (NEG ids, backend-service ids, the
# reserved IP address, the Certificate Manager DNS records) stay unknown at
# plan time even under mock_provider — same as a real `terraform plan`
# against not-yet-created resources. Assertions here are deliberately
# limited to attributes derivable from variables alone (host lists, service
# names, proxied/ttl flags, redirect rule shape) — the things a config
# mistake could actually get wrong without ever touching a live API.

mock_provider "google" {}
mock_provider "cloudflare" {}

variables {
  project_id         = "ikaro-prod"
  environment        = "prod"
  web_service_name   = "ikaro-web"
  bff_service_name   = "ikaro-bff"
  cloudflare_zone_id = "0123456789abcdef0123456789abcdef"
}

run "negs_point_at_the_right_cloud_run_services" {
  command = plan

  assert {
    condition     = google_compute_region_network_endpoint_group.web.cloud_run[0].service == "ikaro-web"
    error_message = "Web NEG must target the web Cloud Run service name."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.bff.cloud_run[0].service == "ikaro-bff"
    error_message = "BFF NEG must target the bff Cloud Run service name."
  }

  assert {
    condition     = google_compute_region_network_endpoint_group.web.network_endpoint_type == "SERVERLESS"
    error_message = "NEGs backing Cloud Run must be network_endpoint_type SERVERLESS."
  }
}

run "backend_services_use_the_global_external_alb_scheme" {
  command = plan

  assert {
    condition     = google_compute_backend_service.web.load_balancing_scheme == "EXTERNAL_MANAGED"
    error_message = "Backend services must use EXTERNAL_MANAGED (Global external Application Load Balancer), not the classic EXTERNAL scheme."
  }

  assert {
    condition     = google_compute_backend_service.bff.load_balancing_scheme == "EXTERNAL_MANAGED"
    error_message = "Backend services must use EXTERNAL_MANAGED (Global external Application Load Balancer), not the classic EXTERNAL scheme."
  }

  assert {
    condition     = google_compute_backend_service.web.health_checks == null
    error_message = "A health check is unnecessary here — the provider docs state one is required unless the backend uses a serverless NEG, and Cloud Run itself governs revision health."
  }
}

run "https_url_map_routes_apex_and_www_to_web_and_bff_to_bff" {
  command = plan

  assert {
    condition = anytrue([
      for h in google_compute_url_map.https.host_rule :
      h.path_matcher == "web" && h.hosts == toset(["ikaro.online", "www.ikaro.online"])
    ])
    error_message = "ikaro.online and www.ikaro.online must both route to the web path matcher."
  }

  assert {
    condition = anytrue([
      for h in google_compute_url_map.https.host_rule :
      h.path_matcher == "bff" && h.hosts == toset(["bff.ikaro.online"])
    ])
    error_message = "bff.ikaro.online must route to the bff path matcher."
  }
}

run "http_url_map_is_a_pure_https_redirect" {
  command = plan

  assert {
    condition     = one(google_compute_url_map.http_redirect.default_url_redirect).https_redirect == true
    error_message = "Port-80 url_map must redirect to https."
  }

  assert {
    condition     = one(google_compute_url_map.http_redirect.default_url_redirect).redirect_response_code == "MOVED_PERMANENTLY_DEFAULT"
    error_message = "HTTP->HTTPS redirect must be a permanent (301) redirect."
  }
}

run "certificate_covers_exactly_the_three_hostnames" {
  command = plan

  assert {
    condition     = toset(one(google_certificate_manager_certificate.edge.managed).domains) == toset(["ikaro.online", "www.ikaro.online", "bff.ikaro.online"])
    error_message = "The managed certificate must cover exactly ikaro.online, www.ikaro.online, and bff.ikaro.online."
  }
}

run "certificate_manager_resources_are_protected_from_accidental_destroy" {
  command = plan

  assert {
    condition     = google_certificate_manager_certificate.edge.deletion_policy == "ABANDON"
    error_message = "The managed certificate must not be deletable by a plain terraform destroy/replace — ABANDON, matching the deletion_protection = true convention used elsewhere in this repo for prod-critical resources."
  }

  assert {
    condition     = google_certificate_manager_certificate_map.edge.deletion_policy == "ABANDON"
    error_message = "The certificate map must not be deletable by a plain terraform destroy/replace."
  }

  assert {
    condition     = alltrue([for a in google_certificate_manager_dns_authorization.hosts : a.deletion_policy == "ABANDON"])
    error_message = "Every DNS authorization must not be deletable by a plain terraform destroy/replace."
  }

  assert {
    condition     = alltrue([for e in google_certificate_manager_certificate_map_entry.hosts : e.deletion_policy == "ABANDON"])
    error_message = "Every certificate map entry must not be deletable by a plain terraform destroy/replace."
  }
}

run "dns_authorizations_target_the_right_domain_each" {
  command = plan

  assert {
    condition     = google_certificate_manager_dns_authorization.hosts["apex"].domain == "ikaro.online"
    error_message = "The apex DNS authorization must be for ikaro.online."
  }

  assert {
    condition     = google_certificate_manager_dns_authorization.hosts["www"].domain == "www.ikaro.online"
    error_message = "The www DNS authorization must be for www.ikaro.online."
  }

  assert {
    condition     = google_certificate_manager_dns_authorization.hosts["bff"].domain == "bff.ikaro.online"
    error_message = "The bff DNS authorization must be for bff.ikaro.online."
  }
}

run "host_a_records_are_proxied_orange_cloud" {
  command = plan

  assert {
    condition     = alltrue([for r in cloudflare_dns_record.hosts : r.proxied == true])
    error_message = "All three host A records must be proxied (orange cloud) — that's the entire point of fronting with Cloudflare (D5)."
  }

  assert {
    condition     = alltrue([for r in cloudflare_dns_record.hosts : r.type == "A"])
    error_message = "Host records must be type A (pointing at the reserved LB IPv4 address)."
  }
}

run "dns_authorization_cname_records_are_unproxied" {
  command = plan

  assert {
    condition     = alltrue([for r in cloudflare_dns_record.dns_auth : r.proxied == false])
    error_message = "DNS-authorization CNAME records must be DNS-only (unproxied) — a proxied validation record breaks Certificate Manager issuance (2026-07-08 finding)."
  }
}

run "www_redirect_rule_targets_the_right_host_and_destination" {
  command = plan

  assert {
    condition     = cloudflare_ruleset.www_redirect.phase == "http_request_dynamic_redirect"
    error_message = "The www redirect must be a Dynamic Redirect rule (Single Redirects), not a legacy Page Rule."
  }

  assert {
    condition     = cloudflare_ruleset.www_redirect.rules[0].expression == "(http.host eq \"www.ikaro.online\")"
    error_message = "The redirect rule must match exactly the www host."
  }

  assert {
    condition     = cloudflare_ruleset.www_redirect.rules[0].action_parameters.from_value.target_url.expression == "concat(\"https://ikaro.online\", http.request.uri.path)"
    error_message = "The redirect must target https://ikaro.online, preserving the request path."
  }

  assert {
    condition     = cloudflare_ruleset.www_redirect.rules[0].action_parameters.from_value.status_code == 301
    error_message = "The www redirect must be a permanent (301) redirect."
  }
}
