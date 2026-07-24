# modules/relay-vm — on-demand IAP relay VM (TD32)

Closes the gap documented in `td/TD32-CLOUD-SQL-DEVELOPER-ACCESS-NO-NETWORK-PATH.md`: a dev machine has no network-layer path into `ikaro-vpc-{env}`, so neither Cloud SQL's private IP nor `ikaro-backend`'s `ingress: internal` Cloud Run service is reachable. A single minimal `e2-micro` Compute Engine instance, reachable only via Google's Identity-Aware Proxy, closes both gaps at once — once inside the VPC, it can dial Cloud SQL's private IP directly, and its calls to the backend's public `*.a.run.app` hostname are correctly classified as internal-origin traffic (Private Google Access on the subnet).

**No public IP, no firewall rule open to the internet.** The only ingress allowed is TCP/22 from IAP's fixed source range (`35.235.240.0/20`), gated by `roles/iap.tunnelResourceAccessor` + `roles/compute.osLogin` IAM on the admin identity — scoped to this specific instance, not project-wide — never metadata-managed SSH keys.

## On-demand, not always-on

This module is inert by default (`create = false`). Toggling it on or off happens exclusively through a merged PR, never a local `terraform apply` — see `infra/terraform/README.md`'s pipeline-only-apply rule:

1. Flip `create_relay_vm = true` in the target env's `terraform.tfvars`.
2. Open a PR, merge to `main` — the pipeline's `apply-staging`/`apply-prod` job creates the VM.
3. Use it (see below).
4. Flip `create_relay_vm` back to `false`, open a PR, merge — the pipeline destroys it. A real destroy, not a stop, so cost drops to zero between sessions.

`e2-micro` in `southamerica-east1` isn't covered by GCP's Always-Free tier (US-region-only) — running it continuously would cost roughly $8–15/month, which is why this stays a deliberate on/off toggle rather than an always-on host.

## Identity model — the relay VM's own service account does the work (redesigned 2026-07-24)

**Constraint that forced this:** the VM has no external IP and no Cloud NAT (deliberate, `modules/network`). Private Google Access only covers `*.googleapis.com` traffic — it does **not** cover `packages.cloud.google.com` (apt) or `deb.debian.org`, so `gcloud` CLI (whose current releases live on `dl.google.com`, not a Private-Google-Access-covered domain) has no reachable install path here at all. `cloud-sql-proxy` is the one exception — its binary is hosted on `storage.googleapis.com`, a genuine `*.googleapis.com` domain — so it's the *only* tool this module installs (verified live, 2026-07-24: a direct `curl -I` against the pinned release URL returns a real `200`, cross-checked against the GitHub release's own publish date).

Rather than have a human interactively `gcloud auth login` inside the VM (which needs the gcloud CLI — the actual blocker), the relay VM's own attached service account does the real work automatically via GCE's metadata server — no gcloud CLI, no login step, no ADC file to manage, ever:

- `cloud-sql-proxy --auto-iam-authn` auto-starts via systemd the moment the VM finishes booting. Application Default Credentials automatically fall back to the instance's own attached service account when nothing else is configured — standard GCE behavior, nothing this module has to wire up beyond granting the SA the right roles.
- Cloud Run identity tokens and Secret Manager access tokens come directly from the metadata server (see Usage below) — plain `curl`, no gcloud CLI needed for either.

This is also the more secure choice on its own terms, not just a workaround for the internet-egress constraint: it confines the actually-sensitive grants (Cloud SQL IAM auth, `run.invoker`, `platform-admin-key` read) to a narrowly-scoped service account with keyless, short-lived credentials minted through the instance metadata server, rather than the human's own long-lived Google identity, which if ever compromised would otherwise carry all of that usable from anywhere. A user with shell access can retrieve and copy a short-lived metadata token, so the boundary is not non-exportability; it is the absence of a long-lived key and the relay VM's narrowly scoped grants. `iam_admin_user` keeps only `iap.tunnelResourceAccessor` + `compute.osLogin`, both scoped to this one instance — i.e., "can SSH into this VM to set up a port-forward or run ad-hoc commands," nothing more.

## Usage

### Option A — DBeaver (or any local GUI client) via SSH port forwarding

`cloud-sql-proxy` is already running on the VM by the time it finishes booting (systemd, auto-started) — you only need to forward its port back to your own machine:

```bash
gcloud compute ssh ikaro-relay-vm-<env> --tunnel-through-iap --zone=<zone> --project=ikaro-<env> \
  -- -N -L 5433:localhost:5433
```

Then in DBeaver: host `127.0.0.1`, port `5433`, database `ikaro`, **username = `ikaro-relay-vm@ikaro-<env>.iam`** (the relay service account's Cloud SQL IAM username — `.gserviceaccount.com` trimmed, per `google_sql_user.relay` — **not** your own Google email; the authenticated identity is now the relay SA, not you), empty password (the proxy injects the credential).

### Option B — reach the ingress:internal backend directly (e.g. tenant provisioning)

This has to run *from inside* the relay VM via SSH — that's the whole reason it exists; Cloud Run's ingress check cares about network origin, not just auth, so it can't be done from your laptop even with a valid token.

```bash
gcloud compute ssh ikaro-relay-vm-<env> --tunnel-through-iap --zone=<zone> --project=ikaro-<env>
```

Inside the VM — everything below authenticates via the metadata server automatically, as the relay VM's own service account. No gcloud CLI, no login step:

```bash
BACKEND_URL="<backend-url>"  # e.g. https://ikaro-backend-<hash>-rj.a.run.app
PROJECT_ID="ikaro-<env>"

# Identity token scoped to this backend URL as audience — the metadata
# server returns the raw JWT as plain text for this endpoint (no JSON to
# parse, unlike the /token endpoint below).
ID_TOKEN=$(curl -s -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=$BACKEND_URL")

# Quick connectivity check (no body, no side effects) — returns this
# app's own JSON response, not Google's generic ingress-block 404:
curl -H "Authorization: Bearer $ID_TOKEN" "$BACKEND_URL/health/ready"
```

Tenant provisioning (`POST /internal/tenants`, gated by `PlatformAdminGuard`) additionally needs `platform-admin-key`, read via Secret Manager's REST API using an OAuth access token (also metadata-server-minted — this endpoint *does* return JSON, so a dependency-free `grep`/`cut` extracts the one field needed rather than assuming `jq` is installed, since `jq` has the same apt-unreachable problem as `gcloud`):

```bash
ACCESS_TOKEN=$(curl -s -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

PLATFORM_ADMIN_KEY=$(curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/platform-admin-key/versions/latest:access" \
  | grep -o '"data":"[^"]*' | cut -d'"' -f4 | base64 -d)
```

Body shape is `ProvisionTenantSchema` (`apps/backend/.../provision-tenant.dto.ts`) — `country_code` is **required** (2-letter ISO, not optional like `timezone`); values below are placeholders, not real data:

```bash
curl -X POST "$BACKEND_URL/internal/tenants" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<tenant-name>",
    "slug": "<tenant-slug>",
    "adminEmail": "<admin-email>",
    "country_code": "BR"
  }'
```

## What lands in Cloud Audit Logs (and what doesn't)

**IAP tunnel access (the SSH connection itself)** is logged against `iap.googleapis.com`, attributed to **`iam_admin_user`** — the human's own identity, since they're the one running `gcloud compute ssh --tunnel-through-iap` from their own machine. This module explicitly enables Data Access audit logging for it (`google_project_iam_audit_config.iap_tunnel_access`), since IAP's own docs are explicit that this is opt-in, not on by default.

**Everything that happens from inside the VM** is attributed to the **relay VM's own service account** instead, since that's the identity actually making those calls (via the metadata server): Secret Manager reads (`AccessSecretVersion`) and Cloud SQL IAM logins (`cloudsql.instances.login`) are both Data Access-classified and opt-in by default — both separately enabled here (`google_project_iam_audit_config.secretmanager_access`, `.cloudsql_login`). Minting the identity token itself is a local metadata-server call, not a network call to a GCP API, so it has nothing to log — but the backend *request* that token authenticates shows up in Cloud Run's own request logs regardless (always-on, not something this module configures).

Correlating the human-attributed IAP log entry (who SSH'd in, when) with the SA-attributed entries that follow (what that session actually did) gives full traceability without either identity carrying the other's blast radius.

**This does not cover arbitrary commands run inside the VM** (raw shell, `psql`/DBeaver queries) — Cloud Audit Logs only records Google Cloud API calls, not in-VM shell activity. Query-level Postgres activity is visible in Cloud SQL's own `pgAudit` logging instead (already enabled by `modules/database`'s `cloudsql.enable_pgaudit`/`pgaudit.log` flags) — a separate log, not Cloud Audit Logs.
