# TD32 — Developer access to VPC-internal resources (Cloud SQL, ingress-internal Cloud Run) has no viable network path

## Status
- **State**: 🟡 Open
- **Type**: Technical Debt / Infrastructure Gap
- **Priority**: Medium — blocks two M17-S27 AC items today (Cloud SQL proxy-login verification, tenant provisioning); blocks any future need for direct human access to a VPC-internal resource (DB debugging, spot-checks, restore-drill verification, hitting an ingress-internal Cloud Run endpoint) until resolved
- **Context**: `infra/terraform/modules/database/README.md`'s documented connection snippet, `plan/M17-CLOUD-DEPLOY.md` §2 Security Model row "Developer → Cloud SQL"
- **Created**: 2026-07-23
- **Discovered**: during M17-S27 Step 1 (Cloud SQL gap, attempting to verify the deferred S13 AC `cloud-sql-proxy --auto-iam-authn` login) and again during M17-S27 Step 4 (Cloud Run gap, attempting to provision the staging demo tenant via `gcloud run services proxy`) — same root cause both times, discovered independently a day apart

---

## Problem

The dev machine has no network-layer path into `ikaro-vpc-staging`/`ikaro-vpc-prod` — no VPN, no VPC peering, not a resource that already lives inside the VPC. Two unrelated GCP features both enforce "reachable only from inside the VPC" as their access boundary, and both turned out to be actually unreachable from a laptop once someone tried:

### 1. Cloud SQL — private IP only

`modules/database/README.md` documents connecting via:

```bash
cloud-sql-proxy --private-ip --auto-iam-authn ikaro-staging:southamerica-east1:ikaro-db-staging --port 5433
```

`--private-ip` is required because the instance has no public IP (`ipv4Enabled=false`, by design — §2's "DB has no public IP" invariant). Dialing the private VPC IP (`10.27.0.3`) requires genuine network-layer reachability into the VPC — see the live verification below.

### 2. Cloud Run — `ingress: internal` on the backend

`ikaro-backend` is deliberately configured `ingress: internal` (S18's design goal: "Backend unreachable from internet; reachable from BFF"). Ingress is enforced at Google's front-end, **before IAM auth is even checked** — a request from outside the VPC gets rejected at that layer regardless of whether it carries a valid, correctly-audienced identity token from a principal that already has `roles/run.invoker`. `gcloud run services proxy` does not change this: it still sends the underlying HTTP request over the same public path a raw `curl` would, so it is treated as external traffic exactly like a browser or laptop `curl` call — it does **not** tunnel through Google's internal network the way IAP does.

Both gaps directly contradict `plan/M17-CLOUD-DEPLOY.md` §2's own claim: *"Developer → Cloud SQL: Cloud SQL Auth Proxy (IAM-authenticated, TLS). DB has no public IP."* sitting alongside *"No VPN, no SSH, no bastion — there is nothing to SSH into."* Both access paths **require** exactly the kind of network reachability the second claim says doesn't exist. This looks like a design assumption that was never validated until M17-S27 actually tried it — consistent with this story's role as the first real end-to-end exercise of several such assumptions (the shared registry dependency, the `cloudsqliamuser` propagation race, the unverified XFF header position all surfaced the same way).

## Live verification

### Cloud SQL (2026-07-23)

Real attempt against the real `ikaro-staging` instance:

```
cloud-sql-proxy --private-ip --auto-iam-authn ikaro-staging:southamerica-east1:ikaro-db-staging --port 5433
...
Listening on 127.0.0.1:5433
The proxy has started successfully and is ready for new connections!
Accepted connection from 127.0.0.1:48400
failed to connect to instance: dial error: dial tcp 10.27.0.3:3307: connect: no route to host
```

A retry (this time connecting via DBeaver instead of psql) produced a client-side timeout instead of an immediate error — same root cause (no network path to `10.27.0.3`), just a different failure mode depending on how packets are handled along the way (silently dropped vs. immediately rejected). Not a DBeaver- or psql-specific issue; a plain `psql` connection would hit the identical wall.

### Cloud Run ingress (2026-07-24)

`gcloud run services proxy ikaro-backend --project=ikaro-staging --region=southamerica-east1 --port=8080` started cleanly and reported a valid target (`http://127.0.0.1:8080 proxies to https://ikaro-backend-crle4i3nrq-rj.a.run.app`), but every request through it 404'd with Google's generic front-end error page (not this app's own RFC 9457 error shape):

```
HTTP/1.1 404 Not Found
<html><head><title>404 Page not found</title></head>
<body text=#000000 bgcolor=#ffffff>
<h1>Error: Page not found</h1>
<h2>The requested URL was not found on this server.</h2>
</body></html>
```

Isolated the cause with direct `curl`s to `https://ikaro-backend-crle4i3nrq-rj.a.run.app/health/ready` (bypassing the proxy tool entirely):
- No `Authorization` header at all → same 404
- A correctly-audienced identity token (`gcloud auth print-identity-token --audiences=<service-url>`) from `admin@ikaro.online`, which **already has `roles/run.invoker`** directly granted (`gcloud run services get-iam-policy ikaro-backend`) → same 404, identical byte-for-byte

Identical output regardless of auth validity rules out IAM as the cause — Cloud Run/GFE deliberately returns a generic 404 (not 403) for ingress-blocked requests, to avoid confirming the service or route exists to an unauthorized-by-network-position caller. Confirmed via `gcloud run services describe ikaro-backend --format="value(metadata.annotations['run.googleapis.com/ingress'])"` → `internal`. Also confirmed the BFF has no forwarding route for tenant provisioning (grepped `apps/bff/src` for `internal/tenants`/`ProvisionTenant` — only tenant *read* paths exist, e.g. `platform.public.controller.ts`'s manifest lookups; the BFF's own ingress is `all`, but that doesn't help since it has nothing to forward through).

## Why this matters

- M17-S27's own Step 1 AC (verifying dev-machine proxy login to Cloud SQL) and Step 4 AC (tenant provisioning via `gcloud run services proxy`) both cannot be completed as currently documented.
- More importantly: any future need for a human to directly inspect the database (ad-hoc debugging, spot-checking after a deploy, the S49 restore-drill verification) or to reach any other `ingress: internal` service hits the same wall until this is solved.

## Proposed approach — IAP relay VM (not yet built — needs its own scoping/story)

**A single minimal relay VM closes both gaps at once**, because both gaps have the identical root cause: no resource exists inside the VPC that an authorized human can reach from outside it. Once a VM inside the VPC is reachable via IAP, it is — from a network standpoint — no different from any other VPC-internal resource: it can dial Cloud SQL's private IP directly, and its calls to `ikaro-backend`'s public `*.a.run.app` hostname are correctly classified as internal-origin traffic by the ingress check (confirmed: `ikaro-subnet-staging` already has Private Google Access enabled — `gcloud compute networks subnets describe ikaro-subnet-staging --region=southamerica-east1 --format="value(privateIpGoogleAccess)"` → `True` — which is the specific setting that makes this work; without it, even a VPC-internal VM's traffic to `*.a.run.app` would exit over the public path and get ingress-blocked same as a laptop).

This extends the same zero-trust pattern already used for reaching the internal-only backend from CI (`gcloud run services proxy` + IAM for automated flows) and is Google's own documented alternative to a traditional bastion host.

### Design

- A minimal `e2-micro` (or smaller) Compute Engine instance inside `ikaro-vpc-staging` (and later `ikaro-vpc-prod` for the equivalent prod need), **no public IP**, **no firewall rule open to the internet** — the only ingress rule needed allows TCP/22 from IAP's fixed source range `35.235.240.0/20`.
- Access brokered entirely through Google's Identity-Aware Proxy: `gcloud compute ssh <vm-name> --tunnel-through-iap --zone=... --project=...` (handles the tunnel automatically) or `gcloud compute start-iap-tunnel` for raw port forwarding, gated by `roles/iap.tunnelResourceAccessor` + `roles/compute.osLogin` IAM on the admin identity — scoped to this specific instance (`google_iap_tunnel_instance_iam_member`/`google_compute_instance_iam_member`), not project-wide, so the grant can't silently apply to some other future VM (cross-tool PR review finding on #203).
- **No internet egress at all beyond one binary (discovered 2026-07-24, cross-tool PR review on #203):** the VM has no external IP and no Cloud NAT (deliberate, `modules/network`). Private Google Access only covers `*.googleapis.com` traffic — verified against Google's own docs — so `packages.cloud.google.com` (apt) and `deb.debian.org` are both unreachable, meaning `gcloud` CLI (current releases live on `dl.google.com`, not a PGA-covered domain) has no install path here. `cloud-sql-proxy` is the one exception: its binary is hosted on `storage.googleapis.com`, a genuine `*.googleapis.com` domain — verified live via a direct `curl -I` against the pinned release URL (real `200`, cross-checked against the GitHub release's own publish date). This is why the identity model below changed from "human re-authenticates inside the VM" to "the VM's own service account, via the metadata server" — the former needs the gcloud CLI, the latter needs nothing beyond `curl` (always present) + the one PGA-covered binary.
- **On-demand, not always-on**: flip `create_relay_vm` from `false` to `true` in `envs/staging/terraform.tfvars`, open a small PR, merge to `main` — the pipeline's `apply-staging` job creates the VM. Flip it back to `false` and merge again to tear it down. A real destroy (not stop) means zero cost when not in use. `e2-micro` in `southamerica-east1` is **not** covered by GCP's Always-Free tier (that tier is US-region-only), so running it continuously would cost roughly $8–15/month — a meaningful slice of this project's ~$50/mo total budget target (D12) for something used only occasionally. This keeps the on/off toggle inside the pipeline-only-apply invariant introduced at M17-S24 (`infra/terraform/README.md`: "manual `terraform apply` is forbidden... fix the pipeline instead") — no local `terraform apply`/`destroy` against staging, ever. Same shape as this project's other on/off infra gates, except this one is meant to toggle repeatedly for its whole life (unlike a one-time bootstrap gate such as the removed `enable_database`/`bootstrap_mode` flags), so budget for a ~2-PR-cycle lead time per session rather than an instant local flip.
- IAP tunnel connections (attributed to the human) and every Data Access-logged call the relay SA makes from inside the VM (Secret Manager reads, Cloud SQL IAM logins) land in Cloud Audit Logs — this requires explicitly enabling Data Access audit logging per service (`google_project_iam_audit_config` × 3: `iap.googleapis.com`, `secretmanager.googleapis.com`, `cloudsql.googleapis.com`; each service's own docs are explicit these are opt-in, not on by default), same guarantee §2 already claims for backend access, actually delivered this time. Arbitrary commands run inside the VM (raw shell, `psql`/DBeaver queries) are **not** covered — Cloud Audit Logs only records Google Cloud API calls, not in-VM shell activity; query-level Postgres activity is `pgAudit`'s job instead (already enabled by `modules/database`), a separate log.

### Rough Terraform shape (new `modules/relay-vm/`)

- `google_compute_instance "relay"` — `count = var.create ? 1 : 0`, `machine_type = "e2-micro"`, network interface on the existing `subnet_id` (no `access_config` block → no external IP). Startup script downloads the pinned `cloud-sql-proxy` binary from `storage.googleapis.com` and runs it as a systemd service (`--auto-iam-authn`, auto-started on boot) — the only tool installed; see the identity model below for why nothing else is needed.
- `google_compute_firewall "allow_iap_ssh"` — `source_ranges = ["35.235.240.0/20"]`, `allow { protocol = "tcp", ports = ["22"] }`, scoped via a network tag on the relay instance.
- `google_iap_tunnel_instance_iam_member` + `google_compute_instance_iam_member` — `roles/iap.tunnelResourceAccessor` + `roles/compute.osLogin` to the admin identity, both scoped to this specific instance (not project-wide).
- `google_service_account "relay"` + `google_project_iam_member` (`roles/cloudsql.client`, `roles/cloudsql.instanceUser`) + `google_sql_user "relay"` (`CLOUD_IAM_SERVICE_ACCOUNT`, `.gserviceaccount.com` suffix trimmed per Google's IAM database auth docs) — registers the relay VM's **own** service account as a passwordless Cloud SQL IAM user, gated on both `var.create` and a real database instance existing (`var.db_instance_name != ""` — prod's database stays `count`-gated behind `enable_database` until S37, so this whole block is skipped there until then).
- `google_secret_manager_secret_iam_member` granting `roles/secretmanager.secretAccessor` on the `platform-admin-key` secret to the relay VM's **own** service account — currently only the `backend` runtime SA had this (`modules/iam/main.tf`); without it, the tenant-provisioning acceptance criterion has no way to read the value it needs to send as `X-Platform-Admin-Key`.
- `google_project_iam_audit_config` × 3 — Data Access audit logging (`ADMIN_READ`/`DATA_READ`/`DATA_WRITE`) for `iap.googleapis.com`, `DATA_READ` for `secretmanager.googleapis.com` (`AccessSecretVersion`), and `DATA_WRITE` for `cloudsql.googleapis.com` (`cloudsql.instances.login`, what the relay SA's `--auto-iam-authn` login triggers) — all three are Data Access-classified and opt-in by default per their respective services' own docs, and all three were gaps caught one at a time across three rounds of cross-tool review (IAP round 2, Secret Manager round 2, Cloud SQL round 3).
- Startup script verifies the downloaded `cloud-sql-proxy` binary's SHA-256 before `chmod`/execution (cross-tool review finding, round 3) — a URL/version pin alone means a mutable object replacement or corrupted download becomes root code execution with the relay SA's privileges. Checksum verified two independent ways before pinning: downloaded the real file and ran `sha256sum` locally, cross-checked against the GitHub release page's own published per-asset hash — both matched exactly.
- Env root (`envs/*/main.tf`) additionally adds `"serviceAccount:${module.relay_vm.service_account_email}"` to `cloudrun_backend`'s existing `invoker_members` list, and passes `module.database.instance_connection_name`/`.instance_name` (staging: unconditional; prod: `try(module.database[0]..., "")`) as the relay module's `db_instance_connection_name`/`db_instance_name` inputs.
- Wire into `envs/staging/main.tf` (and `envs/prod/main.tf` once needed) with `create = false` by default.
- `tests/*.tftest.hcl` covering the count-gate, the firewall's source range, instance-scoped IAM, the relay SA's grants (including the empty-`db_instance_name` skip case), and both audit configs — per `infra/terraform/README.md`'s unit-test convention.

**Identity used inside the VM: the relay VM's own service account, not the human operator (redesigned 2026-07-24, cross-tool PR review on #203).** The original design had the human re-authenticate as themselves inside the VM (`gcloud auth login --update-adc`), reusing `iam_admin_user`'s existing Cloud SQL IAM user + `run.invoker` grants — but this requires the gcloud CLI, which (per the internet-egress discovery above) has no reachable install path on this VM at all. The relay VM's own attached service account does the work instead, authenticating automatically via GCE's metadata server — no gcloud CLI, no login step, ever. This isn't just a workaround for the egress constraint: it's also the more secure choice on its own terms, confining the sensitive grants (Cloud SQL IAM auth, `run.invoker`, `platform-admin-key` read) to a narrowly-scoped identity with keyless, short-lived credentials minted through the metadata server, rather than the human's own long-lived Google identity (which, if ever compromised, would otherwise carry all of this usable from anywhere). A user with shell access can retrieve and copy a short-lived metadata token, so the boundary is not non-exportability; it is the absence of a long-lived key and the relay VM's narrowly scoped grants. `iam_admin_user` keeps only the instance-scoped SSH grants above.

**Terraform is authoritative for all resources above — never a raw `gcloud compute instances create` script, and never a local `terraform apply`.** The firewall rule and audit-log configs are permanent, always-applied config (inert, not billable, no reason to ever toggle them); the VM and access grants that only make sense while it exists are `count`-gated. A standalone script that created the VM outside Terraform would drift from tracked state and risk an orphaned (and quietly billed) instance if the matching teardown step is ever skipped — exactly the ad-hoc-infra pattern this project has consistently moved away from (e.g. the `enable_database`/`bootstrap_mode` flag removals). Toggling `create_relay_vm` happens exclusively through the PR-per-toggle flow described above — `scripts/relay-vm-up.sh` / `scripts/relay-vm-down.sh` automate flipping the tfvars value, committing, and opening the PR, but never call `terraform apply`/`terraform destroy` directly.

**Alternative considered and rejected (for now):** Cloud VPN (HA VPN gateway + tunnels) — technically simpler conceptually, but real ongoing cost (~$36+/mo per Google's published pricing) for a rarely-used need, and doesn't fit this project's ~$50/mo budget target (D12). An HTTPS Load Balancer + Serverless NEG + IAP directly in front of `ikaro-backend` was also considered — Google's other documented pattern for reaching an ingress-restricted Cloud Run service — but it's heavier (a new Load Balancer, more moving parts, more cost) for what is fundamentally occasional admin access, and it only solves the Cloud Run half of this gap, not Cloud SQL.

Whichever approach is chosen, `plan/M17-CLOUD-DEPLOY.md` §2's "Developer → Cloud SQL" row and its "No VPN, no SSH, no bastion" line need updating to reflect the real, built mechanism — not left describing an access path that was never actually possible.

## Acceptance criteria

- [ ] `modules/relay-vm/` exists, `count`/`create`-gated, defaults to not-created; applying it creates exactly one `e2-micro` instance with no external IP inside the target environment's VPC.
- [ ] `gcloud compute ssh <relay-vm-name> --tunnel-through-iap --zone=<zone> --project=ikaro-staging` succeeds for `admin@ikaro.online` — proves the firewall rule + the instance-scoped `roles/iap.tunnelResourceAccessor`/`roles/compute.osLogin` grants are correctly wired.
- [ ] From inside the relay VM (no manual auth step — the relay SA authenticates automatically via the metadata server), a Secret Manager REST call using a metadata-server-minted access token successfully reads `platform-admin-key` — proves the new secret-accessor grant (on the relay SA, not the human) is correctly wired.
- [ ] `cloud-sql-proxy` is already running (systemd, auto-started on boot) by the time SSH login completes; connecting via DBeaver (`127.0.0.1:5433` through an SSH port-forward, username `ikaro-relay-vm@ikaro-staging.iam`, empty password) succeeds — closes the original Cloud SQL half of this TD.
- [ ] From inside the relay VM, `curl` with a metadata-server-minted identity token against `https://ikaro-backend-crle4i3nrq-rj.a.run.app/health/ready` returns this app's own JSON response (not Google's generic ingress-block 404) — closes the Cloud Run half of this TD.
- [ ] The staging demo tenant (`{"name":"Ikaro","slug":"ikaro","adminEmail":"<staging-admin-email>","country_code":"BR"}`) is provisioned end-to-end through the relay VM against `POST /internal/tenants`, using a designated, authorized staging mailbox supplied at execution time rather than committed to this document. (`country_code` is required by `ProvisionTenantSchema`, `apps/backend/.../provision-tenant.dto.ts`.)
- [ ] Flipping `create_relay_vm` to `false` through the PR-per-toggle flow cleanly destroys the instance with zero lingering billed resources, confirmed via `gcloud compute instances list` showing nothing.
- [ ] IAP tunnel connections to the relay VM appear in Cloud Audit Logs attributed to the human operator; Secret Manager reads and Cloud SQL IAM logins appear attributed to the relay VM service account. Metadata-server token issuance and in-VM shell/`psql`/DBeaver activity are out of scope — they are not Cloud Audit Log events. Verify the configured signals after a real session.
- [ ] `plan/M17-CLOUD-DEPLOY.md` §2's "Developer → Cloud SQL" row, "No VPN, no SSH, no bastion" line, D1, and D4 are updated to describe the actual, built mechanism.

## Impact on M17-S27

Both AC items are tracked here instead of being hotfixed inside S27's runbook (per S27's own Step 5: "document every gap found as a follow-up issue — do not hotfix silently"). The rest of S13's deferred Cloud SQL AC is otherwise confirmed independently of this gap: instance is `RUNNABLE`, private-IP only, `ssl_mode=ENCRYPTED_ONLY`, and backup configuration (daily 02:00 UTC, retention 7) is live per `gcloud sql instances describe` — only the actual proxy-login exercise and the first scheduled backup snapshot (not yet due) remain unverified. The tenant-provisioning AC item has no interim workaround (unlike Cloud SQL's Studio-based one below) — it needs either the relay VM above or a narrower one-off fix before it can be exercised at all.

## Interim workaround in active use: Cloud SQL Studio (Cloud SQL half only — no equivalent exists for the Cloud Run half)

Cloud SQL Studio (the GCP Console's browser-based query editor, `https://console.cloud.google.com/sql/instances/<instance>/studio?project=<project>`) sidesteps the Cloud SQL half of this TD entirely — the query actually executes server-side inside GCP, so the dev machine's missing network path to the private IP never matters. Used live during M17-S27 (2026-07-24) to reset staging's schemas after the `ikaro_app`/`ikaro` role-name fix.

**Gotcha: your personal IAM login has no object-level grants.** `google_sql_user.iam_admin` (`modules/database/main.tf`) provisions the human operator as a passwordless `CLOUD_IAM_USER` with `roles/cloudsql.client` + `roles/cloudsql.instanceUser` — enough to authenticate, but Cloud SQL's IAM database auth only maps you into the `cloudsqliamuser` group role, which carries no `GRANT`/`DROP`/`DELETE` rights on anything. Logging into Cloud SQL Studio as yourself and trying to modify data or schema will fail with a permission error.

**Fix: authenticate as `ikaro_migrator` instead**, using **built-in database authentication** (not IAM) — its password is in Secret Manager (`db-migrator-password`, fetch with `gcloud secrets versions access latest --secret=db-migrator-password --project=<project>`). `ikaro_migrator` owns every schema/table it created (it's the role that runs all migrations), so it has full rights to inspect, alter, or drop anything the app needs — no extra grants required.

This doesn't reduce the need for the real fix above (Cloud SQL Studio has no CLI/scripting story, no audit trail beyond Cloud SQL's own query log, and doesn't help anything outside a browser session, and has no equivalent at all for reaching an ingress-internal Cloud Run service), but it's a fully viable interim path for the occasional Cloud-SQL-only inspect-or-repair need this TD anticipated.
