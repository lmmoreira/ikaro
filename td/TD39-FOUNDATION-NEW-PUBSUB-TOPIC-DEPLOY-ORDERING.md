# TD39 — `foundation`'s Terraform plan cannot succeed for a brand-new Pub/Sub topic registered in the same PR that first introduces it

## Status
- **State**: 🟡 Open — not started. Not merge-blocking today (see below), worked around ad hoc for M19-S07 by deferring the affected IAM grant to a follow-up PR. No implementation plan chosen yet; this TD exists to make the gap discoverable the next time a story adds a new domain event or cron trigger, instead of re-deriving it from a red CI run.
- **Type**: Technical Debt / Architecture Gap (Terraform deploy ordering, `foundation`/`envs/*` state split)
- **Priority**: Low/Medium — doesn't block any currently-required CI check and doesn't affect any live functionality, but will silently resurface for every future story that registers a genuinely new Pub/Sub event or cron trigger, each time looking like a fresh mystery unless this doc is found first.
- **Context**: `infra/terraform/foundation/envs/{staging,prod}/main.tf` (`workload_catalog`/`workload_topics`/`workload_subscriptions` locals), `infra/terraform/foundation/modules/workload-iam/main.tf` (`google_pubsub_topic_iam_member`/`google_pubsub_subscription_iam_member`), `infra/terraform/modules/pubsub` (the separate `envs/*`-root module that actually creates topics/subscriptions), `infra/terraform/pubsub-catalog.json`, TD34 (`TD34-TERRAFORM-DEPLOYER-PRIVILEGE-ESCALATION.md` — established the Foundation/Workload IAM split this gap lives inside)
- **Created**: 2026-08-13
- **Discovered**: M19-S07 (PR #365) — registering the `cron-chatbot-retention-purge` trigger (`registerTrigger()` call site) regenerated `pubsub-catalog.json` with a new entry, which is mandatory and CI-enforced (`Pub/Sub topic/subscription catalog` check diffs the committed file against what the code actually registers). `foundation`'s Terraform plan then failed live in CI with `Error retrieving IAM policy for pubsub topic ... 404: Resource not found` for the topic, its DLQ topic, and its subscription — the target Pub/Sub resources don't exist yet in the real GCP project, since they're created by `envs/*`, a separate Terraform root/state that hadn't been applied with this PR's changes.

---

## Problem

### Root cause

`foundation`'s `workload_catalog` local reads `pubsub-catalog.json` directly (`jsondecode(file(...))`) and unconditionally derives IAM grants — backend-publisher, DLQ-publisher, subscription-ack, and (for cron triggers) scheduler-publisher — for **every** entry in that file, via `google_pubsub_topic_iam_member`/`google_pubsub_subscription_iam_member` resources in `foundation/modules/workload-iam`. These aren't plain "create a new resource" operations: an IAM-member resource modifies an *existing* resource's policy, so the Google provider does a live read of the target's current IAM policy even at `plan` time (not just `apply`) to compute an accurate diff. That live read 404s if the target topic/subscription doesn't exist yet in the real project.

The topic/subscription are created by `modules/pubsub`, invoked from the **separate** `envs/*` Terraform root/state (`infra/terraform/envs/{staging,prod}/main.tf`) — not `foundation`. For a topic that already exists (created by a past `envs/*` apply), this is a non-issue: `foundation`'s live read finds the resource and computes a normal diff. For a topic being introduced in the **same PR** that first registers it in code, `foundation`'s plan cannot succeed until `envs/*` has actually been applied first — a genuine two-phase deploy requirement, not a Terraform config bug per se.

### Why this has never come up before

Checked via `git log -- infra/terraform/foundation/envs/staging/main.tf`: the file's entire history is TD34's own migration (PRs #209 through #237-ish), which *transferred* already-existing IAM grants for already-existing topics from the old `envs/*`-owned IAM into `foundation`. Every one of `foundation`'s current `scheduler_publisher_*` entries (the 4 pre-M19 cron topics) was added at a point when its topic had already been live for a while. There is no prior precedent in this repo for "introduce a brand-new topic and its `foundation` IAM grant in the same PR" — M19-S07 is the first time this exact scenario has occurred since TD34 established the split.

### Current mitigation (M19-S07, not a general fix)

For the one topic this affected (`cron-chatbot-retention-purge`), the `scheduler_publisher_cron-chatbot-retention-purge` entry was deferred out of `foundation/envs/{staging,prod}/main.tf`'s `scheduler_publisher_*` `for_each` list, to be added in a follow-up PR once `envs/*` has actually deployed and the topic exists live. This only closes the one grant list M19-S07 happened to hand-edit — the deeper issue (`workload_topics`/`workload_subscriptions`, driven automatically by the *entire* catalog file, including backend-publisher and DLQ grants) is **not** worked around; it will 404 the same way for `foundation`'s plan regardless, since those locals can't selectively exclude one catalog entry without editing shared, generic derivation logic. This TD's finding was accepted as **non-blocking** because `Terraform plan — foundation (staging/prod)` is not in this repo's required-status-checks list (confirmed via `gh api repos/.../branches/main/protection`) and the required `Infra PR Checks Passed` gate's `needs:` graph doesn't depend on it either.

---

## Candidate directions (none chosen — needs dedicated design work, not a story-scoped patch)

1. **Formalize the two-phase rollout as a documented, required process** (lowest-effort, what M19-S07 improvised ad hoc): whenever a new domain event/cron trigger's Pub/Sub topic is introduced, land the code + `envs/*` Terraform in one PR (creates the topic), merge/deploy it, *then* land a small follow-up PR adding just the `foundation` IAM grant. Document this explicitly — likely `infra/terraform/README.md`'s existing gotchas list, or a new checklist item in `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` — so the next story finds the answer instead of a red, confusing CI run.
2. **Make `foundation`'s plan tolerant of a not-yet-existing target.** Needs research into whether the Google provider's `google_pubsub_topic_iam_member`/`_subscription_iam_member` resources (or a `data` source variant) support any "skip if target absent" behavior, or whether this requires a `count`/`for_each` guarded by an external existence check (e.g. a `data "external"` or Terraform-external lookup script) — adds real complexity for a case that's rare by nature (only on the *first* deploy of a new topic).
3. **Split the catalog-derived grants into "confirmed live" vs "pending".** E.g., persist a separate, hand-maintained (or previous-`terraform apply`-derived) list of topics `foundation` should currently grant IAM on, decoupled from the full always-current `pubsub-catalog.json`. Adds a manual sync step but avoids live-read fragility entirely.

Direction 1 is the cheapest and matches what already happened in practice; 2 and 3 are real fixes but need someone with deeper Terraform/GCP IAM context to scope properly before committing to an approach — per this repo's own engineering discipline (`CLAUDE.md` § Mounting complexity is a signal to reconsider the approach), don't bolt on machinery here without first checking whether a structurally simpler option (1) is actually sufficient for how rarely this occurs.

---

## Open questions

1. Does this affect **domain events** too, or only cron triggers? The mechanism (`workload_catalog` reads the *entire* `pubsub-catalog.json`, both event and cron entries) suggests yes — a brand-new domain event's first PR would hit the identical 404, not just cron triggers. Not verified with a real repro since M19-S07 only exercised the cron-trigger path.
2. Is there a lighter-weight live-existence check `foundation`'s plan step could run first (e.g. a `gcloud pubsub topics list` diff, similar in spirit to the `pubsub-catalog` scanner's own regeneration script) to automatically detect "these catalog entries aren't live yet" and skip just those, rather than requiring a human to notice a CI failure and manually defer a grant?

## Acceptance criteria (once someone picks this up)

- [ ] A chosen direction (see Candidate directions) is implemented and documented
- [ ] `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` or `infra/terraform/README.md` gets a permanent entry describing the constraint, so the next new-topic story doesn't rediscover it via a red CI run
- [ ] The deferred `scheduler_publisher_cron-chatbot-retention-purge` grant (M19-S07) is added to `foundation/envs/{staging,prod}/main.tf` once `envs/*` has deployed with that topic live, closing that specific loose end
- [ ] Confirmed (or ruled out) whether this also affects brand-new domain events, not just cron triggers

## Dependencies

- TD34 (`TD34-TERRAFORM-DEPLOYER-PRIVILEGE-ESCALATION.md`) — established the Foundation/Workload IAM split this gap lives inside; any fix here should stay consistent with TD34's security boundary (Foundation identity isolation), not weaken it for convenience
- M19-S07 (PR #365) — origin of this finding; owns the one specific deferred grant listed in Acceptance criteria
