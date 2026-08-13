# TD39 — `foundation`'s Terraform plan cannot succeed for a brand-new Pub/Sub topic registered in the same PR that first introduces it

## Status
- **State**: ✅ Resolved — the live incident, the permanent cleanup, and the domain-event question are all closed. Follow-up PR #367 merged 2026-08-13, verified green in CI (including a live `Terraform plan — foundation (staging/prod)` showing zero drift after removing all 17 `import` blocks).
- **Type**: Technical Debt / Architecture Gap (Terraform deploy ordering, `foundation`/`envs/*` state split)
- **Priority**: Was Low/Medium at filing; escalated same-day after the M19-S07 incident turned into a live deploy deadlock affecting the whole pipeline, not just the one story.
- **Context**: `infra/terraform/foundation/envs/{staging,prod}/main.tf` (`workload_catalog`/`workload_topics`/`workload_subscriptions` locals), `infra/terraform/foundation/modules/workload-iam/main.tf` (`google_pubsub_topic_iam_member`/`google_pubsub_subscription_iam_member`), `infra/terraform/foundation/modules/custom-roles/main.tf` (`normal_infrastructure_deployer` role), `infra/terraform/modules/pubsub` (the separate `envs/*`-root module that actually creates topics/subscriptions), `infra/terraform/modules/scheduler`, `infra/terraform/pubsub-catalog.json`, TD34 (`TD34-TERRAFORM-DEPLOYER-PRIVILEGE-ESCALATION.md` — established the Foundation/Workload IAM split this gap lives inside)
- **Created**: 2026-08-13
- **Live incident resolved**: 2026-08-13 (same day)

---

## Problem

### Root cause

`foundation`'s `workload_catalog` local reads `pubsub-catalog.json` directly (`jsondecode(file(...))`) and unconditionally derives IAM grants — backend-publisher, DLQ-publisher, subscription-ack, and (for cron triggers) scheduler-publisher — for **every** entry in that file, via `google_pubsub_topic_iam_member`/`google_pubsub_subscription_iam_member` resources in `foundation/modules/workload-iam`. These aren't plain "create a new resource" operations: an IAM-member resource modifies an *existing* resource's policy, so the Google provider does a live read of the target's current IAM policy even at `plan` time (not just `apply`) to compute an accurate diff. That live read 404s if the target topic/subscription doesn't exist yet in the real project.

The topic/subscription are created by `modules/pubsub`, invoked from the **separate** `envs/*` Terraform root/state — not `foundation`. For a topic that already exists (created by a past `envs/*` apply), this is a non-issue. For a topic being introduced in the **same PR** that first registers it in code, `foundation`'s plan cannot succeed until `envs/*` has actually been applied first.

### The mutual deadlock (discovered live, not anticipated at filing)

The TD as originally filed treated this as a simple ordering nuisance: defer the `foundation` grant to a follow-up PR, done. That mitigation was applied to PR #365 (M19-S07) and turned out to be **insufficient** — merging it produced a genuine live deadlock, not just an inconvenience:

1. `foundation`'s own CI (`foundation-deploy.yml`) is gated behind a separate check, `Verify Foundation is applied (staging + prod)`, run as part of `envs/*`'s own deploy pipeline (`infra-deploy.yml`). That check finds the most recent commit touching `infra/terraform/foundation/` and requires a *successful* `foundation-deploy.yml` apply (both staging and prod) for a commit at or after it, before `envs/*`'s own apply is allowed to proceed.
2. Editing `foundation/envs/*/main.tf` at all — even just to add a comment deferring the grant — counts as "touching `foundation/`". This re-armed the gate, demanding a *fresh* successful Foundation apply.
3. But `foundation`'s own plan **still** couldn't succeed: `workload_catalog` reads the *entire* `pubsub-catalog.json` unconditionally, independent of anything hand-edited in `scheduler_publisher_*`. The new topic's entry was in that file the moment PR #365 merged, so `foundation` tried (and failed) to grant IAM on it regardless of the deferred-comment edit.
4. And `envs/*`'s own deploy — the *only* thing that creates the topic — was itself blocked behind step 1's gate.

Neither side could go first. This was confirmed live: a manually dispatched `foundation-deploy.yml` run failed on the identical 404 twice in a row, once with the grant present and once with it removed-but-commented, before the actual mechanism (step 3) was correctly diagnosed.

### A second, unrelated finding surfaced during recovery

Once the topic/subscriptions were unblocked and `envs/*`'s apply ran for real, it failed a third way: `Error 403: lacks IAM permission "cloudscheduler.jobs.enable"` when creating the new Cloud Scheduler job. The `normal_infrastructure_deployer` custom role (`foundation/modules/custom-roles`) had `cloudscheduler.jobs.{create,delete,get,list,pause,update}` but was missing `enable`/`run` — this repo's first-ever *new* Scheduler job since that role's permission set was last reviewed. Fixed by adding both permissions (mirroring the existing `pause`/`update` pattern) — unrelated to the deadlock above, but discovered only because resolving the deadlock let the apply reach far enough to hit it.

### Why this had never come up before

`git log -- infra/terraform/foundation/envs/staging/main.tf`: the file's entire history is TD34's own migration, which *transferred* already-existing IAM grants for already-existing topics into `foundation`. Every one of `foundation`'s pre-M19 `scheduler_publisher_*` entries was added when its topic had already been live for a while. M19-S07 was the first time a brand-new topic and its `foundation` grant were introduced in the same change since TD34 established the split.

---

## Resolution

### 1. Temporary unblock (already live, verified in both staging and prod)

`workload_catalog` in `foundation/envs/{staging,prod}/main.tf` filtered out `cron-chatbot-retention-purge` at the earliest point in the derivation chain, so `workload_topics`/`workload_subscriptions` (and everything downstream) naturally excluded it too:

```hcl
workload_catalog = [
  for entry in jsondecode(file("${path.module}/../../../pubsub-catalog.json")) : entry
  if entry.event != "cron-chatbot-retention-purge"
]
```

This let `foundation` plan/apply successfully without the topic existing, breaking the deadlock. `envs/*` then deployed for real, creating the topic, DLQ topic, both subscriptions, and (once the deployer permission fix above landed) the Cloud Scheduler job — all confirmed live in staging and prod via real `terraform apply` runs, not just planned.

### 2. Permanent fix (this PR)

- Remove the temporary `workload_catalog` filter — the topic now exists live, so `foundation`'s plan no longer needs it.
- Re-add `scheduler_publisher_cron-chatbot-retention-purge` to both env roots' `scheduler_publisher_*` list — this now succeeds, since the target topic is live.
- **New CI guardrail**: `no-foundation-plus-other-infra-mix` in `pr-quality.yml` (mirroring `no-infra-app-mix`'s structure) fails — hard, no label escape hatch — when a PR touches both `infra/terraform/foundation/**` and any other `infra/terraform/**` path. Scoped to the whole of `infra/terraform/**`, not just `pubsub-catalog.json`'s `event` entries: the same live-IAM-read pattern applies to every one of `foundation`'s other grant lists (secrets, Cloud Run invokers, Artifact Registry, buckets), and a narrower content-diff check on just top-level `event` names would also miss a new *consumer* added to an existing event (a new subscription + DLQ, same 404 mechanism) — both gaps found in cross-tool review of this PR's first draft. Unlike the infra/app-mix case, there's no legitimate reason to combine these two in one PR — the safe path (land the new resource via `envs/*` first, add the `foundation` grant in a follow-up once it's live) has no real exception to preserve.
- **Documented rule**, added to `infra/terraform/README.md`'s gotchas list: *`infra/terraform/foundation/**` and any other `infra/terraform/**` path must never change in the same PR — not even a deferral comment. Land the `envs/*` change first, add the `foundation` IAM grant in a genuine follow-up PR once the target exists live.*
- **A second, related bug found by this PR's own CI run**: `foundation`'s two Pub/Sub `import { for_each = ... }` blocks (TD34's one-time adoption of pre-existing bindings) were wired to the same live, catalog-derived locals used for resource creation. `import` blocks require the target binding to already exist — a brand-new binding was never granted by hand, so Terraform tried to *import* something that didn't exist and failed with `Cannot find binding for ...` (caught live: this PR's own `Terraform plan — foundation (staging/prod)` checks went red on first push). First fixed narrowly (parallel `_migrated` locals frozen to the pre-existing snapshot, used only by the two pubsub import blocks) — but a follow-up question ("why does `workload_cloud_run_public_invokers`'s import block get away with reusing its live local, when it's structurally the same pattern?") surfaced that *every* `import { for_each = local.X }` block in both env roots has the identical latent risk the moment `local.X` ever gains one new entry, whether catalog-derived or a plain hand-maintained map — the pubsub ones just happened to be first, because TD34's migration is the entire history of every other one. **Final fix**: removed all 17 `import` blocks from both env roots entirely (net deletion, no `_migrated` locals needed). Terraform's own documented `import`-block lifecycle confirms this is safe once a resource is confirmed in state — the block's only job was the one-time historical adoption, already complete; deleting it has zero effect on how the underlying `resource`/`module` block manages that same state address going forward. This closes the entire bug class permanently, not just the one pubsub instance of it.

---

## Open questions (resolved)

1. **Does this affect brand-new domain events too, or only cron triggers?** Confirmed via code tracing (not a live repro — deliberately triggering one would now violate the new guardrail, so this is settled analytically): `backend_publisher_${event}` iterates `keys(local.workload_topics)` — every entry in `pubsub-catalog.json`, cron or domain event alike, with zero filtering by name. Likewise `service_agent_dlq_publisher_*`/`service_agent_subscriber_*` iterate every consumer of every catalog entry. The *only* cron-specific piece anywhere in this derivation is `scheduler_publisher_${event}`, a hardcoded cron-name list — and that's irrelevant to the deadlock, since `backend_publisher_<event>` alone is sufficient to trigger the identical live-IAM-read-404 for a brand-new domain event's not-yet-existing topic. **Answer: yes, equally affected**, and the CI guardrail (scoped to all of `infra/terraform/**` vs `foundation/**`, not just pubsub) already protects against both cases identically.

## Acceptance criteria

- [x] The specific deadlock from M19-S07/PR #365 resolved live — topic, DLQ topic, both subscriptions, and the Cloud Scheduler job confirmed live in both staging and prod via real `terraform apply` runs
- [x] The deployer's missing `cloudscheduler.jobs.enable`/`run` permissions fixed and verified live
- [x] Temporary `workload_catalog` filter removed once the topic existed live — merged and CI-verified (PR #367)
- [x] Real `scheduler_publisher_cron-chatbot-retention-purge` grant added to both env roots — merged and CI-verified (PR #367)
- [x] All 17 `import` blocks removed from both `foundation/envs/{staging,prod}/main.tf`, closing the second bug this PR's own CI surfaced — and its whole latent class, not just the pubsub instance — merged and CI-verified: `Terraform plan — foundation (staging/prod)` both green with zero unexpected drift (PR #367)
- [x] New CI guardrail added, catching this exact scenario before merge for the next new topic/trigger (PR #367)
- [x] `infra/terraform/README.md` gets a permanent entry describing the constraint (PR #367)
- [x] Confirmed whether this also affects brand-new domain events, not just cron triggers — yes, confirmed via code tracing (see Open questions above)

## Dependencies

- TD34 (`TD34-TERRAFORM-DEPLOYER-PRIVILEGE-ESCALATION.md`) — established the Foundation/Workload IAM split this gap lives inside; the fix stays consistent with TD34's security boundary (Foundation identity isolation), not weakened for convenience
- M19-S07 (PR #365) — origin of this finding
