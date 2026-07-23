# Runbooks — Ikaro

Operational procedures for production incidents — what an operator actually runs, not why the system is built the way it is (that's `plan/M17-CLOUD-DEPLOY.md`). Sections land as their owning story completes: this file starts with Rollback (M17-S26); staging's dev-auth data rule, full secret-rotation/proxy-access/DLQ-replay runbooks, and Disaster Recovery arrive with M17-S27, M17-S37, and M17-S49 respectively.

---

## Rollback (Production Promote)

Applies when `deploy-production.yml`'s smoke stage fails, or a bad deploy is noticed shortly after a promote completes.

### Fastest path — re-promote the previous SHA

Re-run `deploy-production.yml` (`workflow_dispatch`) with `image_sha` set to the previous SHA. The pipeline's own `validate-and-summarize` job prints that SHA into its job summary on every run (`prod_current_sha`); the `smoke` job also prints it in its rollback-guidance step if a run fails. This is "fix forward" in spirit — it goes through the same approval gate and safety checks as any other promote.

### Instant manual fallback — traffic split to the previous revision

Cloud Run keeps prior revisions after every deploy. If a full pipeline re-run isn't fast enough:

```bash
gcloud run services update-traffic ikaro-backend \
  --to-revisions=<previous-revision>=100 \
  --project=ikaro-prod \
  --region=southamerica-east1
```

Repeat per affected service (`ikaro-backend`, `ikaro-bff`, `ikaro-web`). Find the previous revision name:

```bash
gcloud run revisions list \
  --service=ikaro-backend \
  --project=ikaro-prod \
  --region=southamerica-east1 \
  --sort-by='~metadata.creationTimestamp' \
  --limit=5
```

Since all three services are promoted as one same-image group (D8), roll all three back together to the same previous SHA unless the incident is clearly isolated to a single service.

### Migrations

Migrations follow expand/contract (repo rule): the previous code version already tolerates the new (additive) schema shape, so rolling back code without reverting schema is safe by construction — no schema action needed for a typical rollback. `migration:revert` is the documented last resort, and only when a migration itself is the root cause of the incident — never a first step.
