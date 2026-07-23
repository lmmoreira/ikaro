# modules/database — Cloud SQL PostgreSQL 17 (private IP)

Cloud SQL instance `ikaro-db-{env}`: PostgreSQL 17, **no public IP ever** (private IP via the network module's PSA peering), SSL enforced (`ssl_mode = "ENCRYPTED_ONLY"`), daily backups 02:00 UTC (retention 7), maintenance window Sunday 06:00 UTC (≈ 03:00 São Paulo), disk autoresize bounded at 30GB. Database `ikaro` is created here; PITR and deletion protection are prod-only toggles (`enable_pitr`, `deletion_protection`).

## Zero secrets (M17 §2)

The app's `ikaro` user and its password are **not** Terraform-managed — the S27/S37 activation runbooks create them out-of-band (`gcloud sql users create` + a `db-password` secret version). Rationale: `tf-planner` credentials are PR-mintable and read state, so any secret in state is readable from a tampered PR workflow. Nothing in this module ever puts a secret value in state, tfvars, or git.

## Deferred creation (`enable_database`) — staging only, until it's flipped for good

Cost decision (S13 discovery, 2026-07-17): each env root instantiated this module behind `enable_database`, so an instance wasn't created — and billing didn't start — until each env was actually ready. **Staging's `enable_database` flag was removed entirely at M17-S27** (2026-07-23): once flipped `true` for real, the flag could never meaningfully go back to `false` again (that would mean tearing down the live database the app depends on), so the gate no longer served a purpose — `envs/staging/main.tf` instantiates this module unconditionally now, and consumers reference outputs as `module.database.…` (no `[0]` index). **Prod still has the gate** — `enable_database = false` in `envs/prod/terraform.tfvars`, plan-only until S37 flips it. S37 should do the same removal for prod once that flip is permanent.

## Human access — passwordless (IAM database authentication)

The `cloudsql.iam_authentication` flag is on, and the admin identity (`var.iam_admin_user`) is registered as a `CLOUD_IAM_USER` with `roles/cloudsql.client` + `roles/cloudsql.instanceUser`. **The email value is never committed** (public repo): locally it lives in the gitignored `envs/<env>/local.auto.tfvars`; the S24 pipeline supplies `TF_VAR_iam_admin_user` from a GitHub environment variable.

Connect from a dev machine (no password at any step). The instance has no public IP, so `--private-ip` is required — the proxy defaults to a public IPv4 connection even when the instance also has a private IP, and fails without the flag. The proxy host also needs VPC reachability (a machine inside the VPC, a VPN, or a bastion — plain internet access is not enough):

```bash
cloud-sql-proxy --private-ip --auto-iam-authn ikaro-staging:southamerica-east1:ikaro-db-staging --port 5433
psql "host=127.0.0.1 port=5433 dbname=ikaro user=<your-google-email>"
```

DBeaver and similar: host `127.0.0.1:5433`, database `ikaro`, username = your Google e-mail, empty password (the proxy injects the credential).

The **app runtime** intentionally keeps password auth (the `ikaro` user): moving it to IAM auth would add a Cloud SQL connector dependency inside the app — documented future option, not built.

## Tier & cost (D12)

Both envs launch on `db-f1-micro` (~$9/mo). Upgrade path is a tfvars change of `db_tier` (e.g. `db-g1-small`, or a dedicated-core custom tier) when the first paying tenant lands — **a tier change restarts the instance** (brief downtime; do it in the maintenance window). Shared-core tiers are excluded from the Cloud SQL SLA — accepted pre-traffic (D12).

## Connection capacity — the 3-rung ladder

`db-f1-micro` allows only ~25 connections, and every Cloud Run instance opens its own TypeORM pool. **Invariant (owned by S18):** `backend max_instances × DB_POOL_SIZE ≤ ~80% of max_connections`.

Scale up strictly in this order (M17-S13, verified against Cloud SQL docs):

1. **Pool math** — tune `max_instances` × `DB_POOL_SIZE`. Day zero, free.
2. **Dedicated-core Enterprise tier** + raise the `max_connections` database flag (RAM-bounded).
3. **Enterprise Plus + Managed Connection Pooling** (Google-managed PgBouncer, ~$200–300+/mo/env) — only when traffic justifies it: M17-S46.

Never a self-hosted pooler VM, at any rung.
