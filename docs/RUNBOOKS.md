# Runbooks — Ikaro

Operational procedures for production incidents — what an operator actually runs, not why the system is built the way it is (that's `plan/M17-CLOUD-DEPLOY.md`). Sections land as their owning story completes: this file starts with Rollback (M17-S26); staging's dev-auth data rule, full secret-rotation/proxy-access/DLQ-replay runbooks, and Disaster Recovery arrive with M17-S27, M17-S37, and M17-S49 respectively.

---

## Rollback (Production Promote)

Applies when `deploy-production.yml`'s smoke stage fails, or a bad deploy is noticed shortly after a promote completes.

### Fastest path — `rollback-production.yml` (instant traffic shift)

Run `rollback-production.yml` (`workflow_dispatch`): pick a `service` (`ikaro-backend` / `ikaro-bff` / `ikaro-web` / `all-three`), leave `revision` blank. Cloud Run already keeps prior revisions after every deploy (`deploy-production.yml`'s own cleanup step retains the 5 most recent per service), so this just shifts 100% of traffic back to the previous one — a pointer change, typically seconds, no rebuild/redeploy/migrate/smoke. Same WIF-based auth as every other prod mutation, so no local `gcloud` install or auth needed — just trigger it from the Actions tab and approve, same `production` environment gate as a normal promote.

Since all three services are promoted as one same-image group (D8) but this rolls each one back to *its own* previous revision independently, using `all-three` doesn't guarantee they land back on the same original SHA — if the incident is a bad promote (not something isolated to one service) and cross-service consistency matters, prefer the thorough path below instead. For an isolated single-service issue, rolling back just that one service is exactly what this is for.

To target an exact revision instead of the automatic "previous one," pass its name (e.g. `ikaro-backend-00042-abc`) as the `revision` input — find it with:

```bash
gcloud run revisions list \
  --service=ikaro-backend \
  --project=ikaro-prod \
  --region=southamerica-east1 \
  --sort-by='~metadata.creationTimestamp' \
  --limit=5
```

### Thorough path — re-promote the previous SHA

Re-run `deploy-production.yml` (`workflow_dispatch`) with `image_sha` set to the previous SHA (or leave it blank once staging itself has already been rolled back/fixed forward, since a blank input resolves to whatever staging is currently running). The pipeline's own `validate-and-summarize` job prints the previous prod SHA into its job summary on every run (`prod_current_sha`); the `smoke` job also prints it in its rollback-guidance step if a run fails. This is "fix forward" in spirit — full migrate + redeploy + smoke, all three services brought back to the exact same known-good SHA together, through the same approval gate and safety checks as any other promote. Slower than the traffic-shift above, but the one that guarantees cross-service consistency.

**If this fails with "Image not found in GAR":** the registry keeps the 30 most recent versions per image (`infra/terraform/modules/registry/main.tf`), so a long gap since the last promote combined with heavy staging activity can in principle evict the SHA you need. Fall back to the traffic-shift path above instead — it works off already-deployed Cloud Run revisions, not the registry, so it's unaffected by this.

### Migrations

Migrations follow expand/contract (repo rule): the previous code version already tolerates the new (additive) schema shape, so rolling back code without reverting schema is safe by construction — no schema action needed for a typical rollback. `migration:revert` is the documented last resort, and only when a migration itself is the root cause of the incident — never a first step.

---

## Staging

### Dev Login data rule (compensating control)

`ENABLE_DEV_AUTH=true` is enabled on staging's public `*.run.app` URL (`APP_ENV=staging` is what makes it legal — M17-S06; the BFF refuses to start with it under `APP_ENV=production`). Since staging has no edge/Cloudflare/LB in front of it (D5), this is a real authentication bypass for anyone who discovers the URL — accepted **only** under one rule:

**Staging holds synthetic/test data exclusively. Never real customer data, never a copy of prod.**

No exceptions. If a test ever needs staging data to more closely resemble production, populate it with fabricated data matching that shape — never restore or copy a real customer/tenant dataset into staging.

### Debugging a permission-denied-shaped 500 (DB grants)

Recipe from a real incident (M17-S27, 2026-07-24): a tenant hotsite manifest lookup 500'd in staging; root cause was `apps/backend`'s app-runtime role (`ikaro`) silently having zero schema privileges, because the bootstrap migrations' role-name check (`rolname = 'ikaro_app'`) didn't match the role that actually exists in that environment (`ikaro`).

1. **Triage where the failure actually is.** If web shows a generic/opaque error page instead of the app's own expected error (e.g. a "tenant not found" page), the failure happened upstream — in the BFF or backend — not in web's own render logic. Go straight to backend/BFF logs; don't debug it as a frontend bug.
2. **`permission denied for schema X` / `permission denied for relation X`** in this codebase almost always means the two-role DDL/DML split (`ikaro_migrator` vs `ikaro`, see `docker/init-db.sh` and `docs/23-INFRASTRUCTURE_SETUP.md`) is broken for that environment — not a query/logic bug. Check whether the app's actual DB role name matches what `BootstrapSchemas1700000000000`/`AddSharedSchema1748400000005` check for, and whether that matches the environment's Terraform `db_user` value.
3. **`ALTER DEFAULT PRIVILEGES` (what those two migrations use to grant DML) is prospective-only** — it never retroactively grants on tables that already exist at the time it runs. Fixing a role-name mismatch and simply re-running those two migrations against an already-migrated environment does nothing for tables created by migrations that ran in between; the app will just fail on the next schema/relation instead.
4. **Remediation, pre-production only:** a full schema reset + full migration replay makes the fix retroactive without a special repair migration, since every table gets created after its schema's (now-correct) default-privilege rule is set:
   ```sql
   DROP SCHEMA IF EXISTS "shared" CASCADE;
   DROP SCHEMA IF EXISTS "notification" CASCADE;
   DROP SCHEMA IF EXISTS "loyalty" CASCADE;
   DROP SCHEMA IF EXISTS "booking" CASCADE;
   DROP SCHEMA IF EXISTS "staff" CASCADE;
   DROP SCHEMA IF EXISTS "customer" CASCADE;
   DROP SCHEMA IF EXISTS "platform" CASCADE;
   DELETE FROM public.migrations;
   ```
   then `gcloud run jobs execute ikaro-migrate --project=<project> --region=<region> --wait`. This is safe only pre-production and only for the one environment that ran the broken version — see the DoD's migration-editing exception (§7) for why this specific combination doesn't violate "never edit an applied migration."
5. **Staging DB access is Cloud SQL Studio only** (no direct network path, TD32) — authenticate as `ikaro_migrator` via built-in auth (Secret Manager: `db-migrator-password`), not your personal IAM login, which has no object-level grants (TD32).
6. **Verify a reset actually took effect — don't trust "it's done."** The first attempt in the real incident silently failed to apply. Query directly:
   ```sql
   SELECT count(*) FROM public.migrations;
   SELECT nspname FROM pg_namespace WHERE nspname IN ('platform','customer','staff','booking','loyalty','notification','shared');
   ```
7. **Verify a migrate-job replay actually ran fresh**, not a no-op, by reading its own execution logs: `"N migrations are new migrations must be executed"` means it replayed; `"No migrations are pending"` means nothing happened and the reset didn't take.
