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

```bash
gcloud compute ssh ikaro-relay-vm-<env> \
  --tunnel-through-iap \
  --zone=<zone> \
  --project=ikaro-<env>

# Inside the VM: re-authenticate as yourself. This reuses the same Cloud
# SQL IAM user + Cloud Run invoker grants iam_admin_user already has
# (modules/database, envs/*/main.tf's cloudrun_backend invoker_members) —
# no new IAM surface needed for this step.
gcloud auth application-default login

# Cloud SQL half:
cloud-sql-proxy --private-ip --auto-iam-authn \
  ikaro-<env>:southamerica-east1:ikaro-db-<env> --port 5433
psql "host=127.0.0.1 port=5433 dbname=ikaro user=<your-google-email>"

# Cloud Run half (e.g. tenant provisioning, POST /internal/tenants):
curl -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=<backend-url>)" \
     -H "X-Platform-Admin-Key: $(gcloud secrets versions access latest --secret=platform-admin-key --project=ikaro-<env>)" \
     <backend-url>/health/ready
```

The startup script installs `gcloud` + `cloud-sql-proxy` via Google's official apt repo on every boot, so the VM is immediately usable each ephemeral session without a manual setup step.

## Identity model

The VM's own attached service account (`ikaro-relay-vm@...`) is identity-only — it carries zero IAM role bindings. Every real operation inside the VM runs under the human operator's own re-authenticated credentials instead (see Usage above). This was a deliberate choice (TD32 discovery): `iam_admin_user` already has the Cloud SQL IAM user registration and `roles/run.invoker` a VM-specific service account would otherwise need duplicated from scratch for no benefit.

## Every access lands in Cloud Audit Logs

SSH via IAP, and everything run from inside the VM under the human's own re-authenticated identity, is attributed to that identity in Cloud Audit Logs — the guarantee `plan/M17-CLOUD-DEPLOY.md` §2 already claims for backend access, actually delivered this time (TD32).
