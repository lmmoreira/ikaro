# modules/relay-vm — on-demand IAP relay VM (TD32)

Closes the gap documented in `td/TD32-CLOUD-SQL-DEVELOPER-ACCESS-NO-NETWORK-PATH.md`: a dev machine has no network-layer path into `ikaro-vpc-{env}`, so neither Cloud SQL's private IP nor `ikaro-backend`'s `ingress: internal` Cloud Run service is reachable. A single minimal `e2-micro` Compute Engine instance, reachable only via Google's Identity-Aware Proxy, closes both gaps at once — once inside the VPC, it can dial Cloud SQL's private IP directly, and its calls to the backend's public `*.a.run.app` hostname are correctly classified as internal-origin traffic (Private Google Access on the subnet).

**No public IP, no firewall rule open to the internet.** The only ingress allowed is TCP/22 from IAP's fixed source range (`35.235.240.0/20`), gated by `roles/iap.tunnelResourceAccessor` + `roles/compute.osLogin` IAM on the admin identity — never metadata-managed SSH keys.

## On-demand, not always-on

This module is inert by default (`create = false`). Toggling it on or off happens exclusively through a merged PR, never a local `terraform apply` — see `infra/terraform/README.md`'s pipeline-only-apply rule:

1. Flip `create_relay_vm = true` in the target env's `terraform.tfvars`.
2. Open a PR, merge to `main` — the pipeline's `apply-staging`/`apply-prod` job creates the VM.
3. Use it (see below).
4. Flip `create_relay_vm` back to `false`, open a PR, merge — the pipeline destroys it. A real destroy, not a stop, so cost drops to zero between sessions.

`e2-micro` in `southamerica-east1` isn't covered by GCP's Always-Free tier (US-region-only) — running it continuously would cost roughly $8–15/month, which is why this stays a deliberate on/off toggle rather than an always-on host.

## Usage

The startup script installs `gcloud`, `cloud-sql-proxy`, and `psql` via Google's/Debian's official package repos on every boot, so the VM is immediately usable each ephemeral session without a manual setup step.

### Option A — psql from inside the VM (quick CLI check)

```bash
gcloud compute ssh ikaro-relay-vm-<env> \
  --tunnel-through-iap \
  --zone=<zone> \
  --project=ikaro-<env>

# Inside the VM: re-authenticate as yourself. --update-adc sets BOTH the
# gcloud CLI's active account (needed by `gcloud auth print-identity-token`
# and `gcloud secrets versions access` below) AND Application Default
# Credentials (needed by cloud-sql-proxy --auto-iam-authn) in one step —
# `gcloud auth application-default login` alone only does the latter and
# leaves the CLI itself with no active account. This reuses the same Cloud
# SQL IAM user + Cloud Run invoker grants iam_admin_user already has
# (modules/database, envs/*/main.tf's cloudrun_backend invoker_members) —
# no new IAM surface needed for this step.
gcloud auth login --update-adc

cloud-sql-proxy --private-ip --auto-iam-authn \
  ikaro-<env>:southamerica-east1:ikaro-db-<env> --port 5433
psql "host=127.0.0.1 port=5433 dbname=ikaro user=<your-google-email>"
```

### Option B — DBeaver (or any local GUI client) via SSH port forwarding

The relay VM has no desktop — DBeaver can't run *on* it. Instead, run `cloud-sql-proxy` on the VM and forward its port back to your own machine, so DBeaver stays local and just points at `localhost`, same as `modules/database/README.md`'s existing DBeaver instructions with one extra hop:

```bash
# Terminal 1 — SSH in, authenticate, start cloud-sql-proxy on the VM
gcloud compute ssh ikaro-relay-vm-<env> --tunnel-through-iap --zone=<zone> --project=ikaro-<env>
gcloud auth login --update-adc
cloud-sql-proxy --private-ip --auto-iam-authn \
  ikaro-<env>:southamerica-east1:ikaro-db-<env> --port 5433

# Terminal 2 (your local machine) — forward local 5433 to the VM's own 5433
gcloud compute ssh ikaro-relay-vm-<env> --tunnel-through-iap --zone=<zone> --project=ikaro-<env> \
  -- -N -L 5433:localhost:5433
```

Then in DBeaver: host `127.0.0.1`, port `5433`, database `ikaro`, username = your Google e-mail, empty password (the proxy injects the IAM credential, same as `modules/database/README.md`).

### Cloud Run half — reach the ingress:internal backend directly

E.g. tenant provisioning (`POST /internal/tenants`, gated by `PlatformAdminGuard`). Body shape is `ProvisionTenantSchema` (`apps/backend/.../provision-tenant.dto.ts`) — `country_code` is **required** (2-letter ISO, not optional like `timezone`); values below are placeholders, not real data:

```bash
BACKEND_URL="<backend-url>"  # e.g. https://ikaro-backend-<hash>-rj.a.run.app

curl -X POST "$BACKEND_URL/internal/tenants" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences="$BACKEND_URL")" \
  -H "X-Platform-Admin-Key: $(gcloud secrets versions access latest --secret=platform-admin-key --project=ikaro-<env>)" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<tenant-name>",
    "slug": "<tenant-slug>",
    "adminEmail": "<admin-email>",
    "country_code": "BR"
  }'
```

For a simpler connectivity-only check (no body, no side effects), the same auth headers against `$BACKEND_URL/health/ready` return this app's own JSON response instead of Google's generic ingress-block 404.

## Identity model

The VM's own attached service account (`ikaro-relay-vm@...`) is identity-only — it carries zero IAM role bindings. Every real operation inside the VM runs under the human operator's own re-authenticated credentials instead (see Usage above). This was a deliberate choice (TD32 discovery): `iam_admin_user` already has the Cloud SQL IAM user registration and `roles/run.invoker` a VM-specific service account would otherwise need duplicated from scratch for no benefit.

## What lands in Cloud Audit Logs (and what doesn't)

IAP tunnel access (the SSH connection itself) is logged against `iap.googleapis.com` — this module explicitly enables Data Access audit logging for it (`google_project_iam_audit_config.iap_tunnel_access`), since IAP's own docs are explicit that this is opt-in, not on by default. Every Google Cloud API call made from inside the VM under the human's re-authenticated identity (`gcloud secrets versions access`, `gcloud auth print-identity-token`, etc.) is attributed to that identity in Cloud Audit Logs too — the guarantee `plan/M17-CLOUD-DEPLOY.md` §2 already claims for backend access, actually delivered this time (TD32).

**This does not cover arbitrary commands run inside the VM** (raw shell, `psql` queries) — Cloud Audit Logs only records Google Cloud API calls, not in-VM shell activity. Query-level Postgres activity is visible in Cloud SQL's own `pgAudit` logging instead (already enabled by `modules/database`'s `cloudsql.enable_pgaudit`/`pgaudit.log` flags) — a separate log, not Cloud Audit Logs.
