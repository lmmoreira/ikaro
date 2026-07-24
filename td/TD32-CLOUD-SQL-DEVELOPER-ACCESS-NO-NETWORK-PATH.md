# TD32 — Developer access to private-IP Cloud SQL has no viable network path

## Status
- **State**: 🟡 Open
- **Type**: Technical Debt / Infrastructure Gap
- **Priority**: Medium — blocks one M17-S27 AC item today; blocks any future need for direct human Postgres access (debugging, spot-checks, restore-drill verification) until resolved
- **Context**: `infra/terraform/modules/database/README.md`'s documented connection snippet, `plan/M17-CLOUD-DEPLOY.md` §2 Security Model row "Developer → Cloud SQL"
- **Created**: 2026-07-23
- **Discovered**: during M17-S27 Step 1, attempting to verify the deferred S13 AC (`cloud-sql-proxy --auto-iam-authn` login from a dev machine)

---

## Problem

`modules/database/README.md` documents connecting from a dev machine via:

```bash
cloud-sql-proxy --private-ip --auto-iam-authn ikaro-staging:southamerica-east1:ikaro-db-staging --port 5433
```

`--private-ip` is required because the instance has no public IP (`ipv4Enabled=false`, by design — §2's "DB has no public IP" invariant). But dialing a private VPC IP (`10.27.0.3`) requires genuine network-layer reachability into `ikaro-vpc-staging` — VPN, VPC peering, or being a resource that already lives inside that VPC. None of those exist today.

This directly contradicts `plan/M17-CLOUD-DEPLOY.md` §2's own claim: *"Developer → Cloud SQL: Cloud SQL Auth Proxy (IAM-authenticated, TLS). DB has no public IP."* sitting alongside *"No VPN, no SSH, no bastion — there is nothing to SSH into."* Cloud SQL Auth Proxy reaching a private-IP-only instance **requires** exactly the kind of network path the second claim says doesn't exist. This looks like a design assumption that was never validated until M17-S27 actually tried it — consistent with this story's role as the first real end-to-end exercise of several such assumptions (the shared registry dependency, the `cloudsqliamuser` propagation race, the unverified XFF header position all surfaced the same way).

## Live verification (2026-07-23)

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

## Why this matters

- M17-S27's own Step 1 AC — verifying dev-machine proxy login — cannot be completed as currently documented.
- More importantly: any future need for a human to directly inspect the database (ad-hoc debugging, spot-checking after a deploy, the S49 restore-drill verification) hits the same wall until this is solved.

## Proposed approach (not yet built — needs its own scoping/story)

**IAP TCP forwarding via a minimal relay VM** — extends the same zero-trust pattern already used for reaching the internal-only backend (`gcloud run services proxy` + IAM, M17 §2), rather than reintroducing a traditional bastion:
- A minimal `e2-micro` (or smaller) Compute Engine instance inside `ikaro-vpc-staging`/`ikaro-vpc-prod`, **no public IP**, **no open firewall ports to the internet**.
- Access brokered entirely through Google's Identity-Aware Proxy: `gcloud compute start-iap-tunnel`, gated by `roles/iap.tunnelResourceAccessor` IAM (same access-control shape as the existing `run.invoker` grant for tenant provisioning).
- Every connection lands in Cloud Audit Logs — same guarantee §2 already claims for backend access, actually delivered this time.
- Consider making it on-demand (create before a session, destroy after) rather than always-on, since a solo operator's DB-inspection needs are occasional — keeps cost near-$0 rather than paying for an idle VM continuously.

**Alternative considered and rejected (for now):** Cloud VPN (HA VPN gateway + tunnels) — technically simpler conceptually, but real ongoing cost (~$36+/mo per Google's published pricing) for a rarely-used need, and doesn't fit this project's stated ~$50/mo total budget target (D12).

Whichever approach is chosen, `plan/M17-CLOUD-DEPLOY.md` §2's "Developer → Cloud SQL" row and its "No VPN, no SSH, no bastion" line need updating to reflect the real, built mechanism — not left describing an access path that was never actually possible.

## Impact on M17-S27

This AC item is tracked here instead of being hotfixed inside S27's runbook (per S27's own Step 5: "document every gap found as a follow-up issue — do not hotfix silently"). The rest of S13's deferred AC is otherwise confirmed independently of this gap: instance is `RUNNABLE`, private-IP only, `ssl_mode=ENCRYPTED_ONLY`, and backup configuration (daily 02:00 UTC, retention 7) is live per `gcloud sql instances describe` — only the actual proxy-login exercise and the first scheduled backup snapshot (not yet due) remain unverified.

## Interim workaround in active use: Cloud SQL Studio

Cloud SQL Studio (the GCP Console's browser-based query editor, `https://console.cloud.google.com/sql/instances/<instance>/studio?project=<project>`) sidesteps this TD entirely — the query actually executes server-side inside GCP, so the dev machine's missing network path to the private IP never matters. Used live during M17-S27 (2026-07-24) to reset staging's schemas after the `ikaro_app`/`ikaro` role-name fix.

**Gotcha: your personal IAM login has no object-level grants.** `google_sql_user.iam_admin` (`modules/database/main.tf`) provisions the human operator as a passwordless `CLOUD_IAM_USER` with `roles/cloudsql.client` + `roles/cloudsql.instanceUser` — enough to authenticate, but Cloud SQL's IAM database auth only maps you into the `cloudsqliamuser` group role, which carries no `GRANT`/`DROP`/`DELETE` rights on anything. Logging into Cloud SQL Studio as yourself and trying to modify data or schema will fail with a permission error.

**Fix: authenticate as `ikaro_migrator` instead**, using **built-in database authentication** (not IAM) — its password is in Secret Manager (`db-migrator-password`, fetch with `gcloud secrets versions access latest --secret=db-migrator-password --project=<project>`). `ikaro_migrator` owns every schema/table it created (it's the role that runs all migrations), so it has full rights to inspect, alter, or drop anything the app needs — no extra grants required.

This doesn't reduce the need for the real fix above (Cloud SQL Studio has no CLI/scripting story, no audit trail beyond Cloud SQL's own query log, and doesn't help anything outside a browser session), but it's a fully viable interim path for the occasional inspect-or-repair need this TD anticipated.
