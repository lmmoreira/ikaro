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

### Migrations

Migrations follow expand/contract (repo rule): the previous code version already tolerates the new (additive) schema shape, so rolling back code without reverting schema is safe by construction — no schema action needed for a typical rollback. `migration:revert` is the documented last resort, and only when a migration itself is the root cause of the incident — never a first step.
