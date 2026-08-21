---
name: run-batch
description: Run a small batch (default 2, cap 5) of independent, non-file-overlapping stories from a milestone concurrently - batched discovery Q&A first, then parallel worktree-isolated implementation, then one batched merge review. A batch is stricter than a milestone "wave" (dependency-sequencing only, not a concurrency-safety guarantee).
metadata:
  short-description: Run a batch of independent stories concurrently
---

Run a small batch of mutually-independent stories from a milestone concurrently instead of one story at a time. Discovery for the whole batch runs first, sequentially, in this session, ending in one consolidated Q&A. Only once every story in the batch is READY does the expensive part — implementation — fan out across parallel worktrees. This exists to compress wall-clock time on an otherwise one-at-a-time process without diluting the discipline any single story gets: every story in a batch still goes through full discovery, full `/pre-pr`, full bot review, and a full human merge read — nothing here reduces scrutiny, it only lets 2 stories' worth of it happen concurrently.

Argument: `$ARGUMENTS` — either a milestone ID (e.g. `M20`) to auto-select the next eligible batch, or explicit story IDs (e.g. `M20-S05 M20-S06`) to use those specifically.

> **HARD RULE:** This skill orchestrates existing single-story mechanics — story-discovery's Steps 0–5 logic and CLAUDE.md §9's autonomous chain — it never bypasses either. No story in a batch reaches implementation without the same discovery rigor a solo `/story-discovery` run would apply.

> **AGENT RULE:** The eligibility check (Step 1) narrows candidates, but batch composition and size are still the user's call — confirm the proposed batch (Step 2) before running any discovery.

---

## Step 0 — Resolve candidate stories

**Check for an already-running batch first:** `git worktree list`. If worktrees from a previous batch are still active and unmerged, tell the user and ask whether to wait, or knowingly run this batch alongside it — don't stack batches silently.

If `$ARGUMENTS` is a milestone ID:
- Read `plan/<milestone>-*.md` (excluding `_IMPLEMENTATION_DETAILS_*` files).
- List stories not yet marked `✅ Done` whose `Dependencies` are all `✅ Done` — mirrors `story-discovery.md` Step 3's dependency check, applied across the whole milestone instead of one story.

If `$ARGUMENTS` names explicit story IDs:
- Use exactly those, but still verify each is not already Done and each declared dependency is Done. Any failure here is a **BLOCKER** — report it before continuing.

If fewer than 2 stories are eligible, say so and suggest running `/story-discovery` solo instead — a batch of 1 has no concurrency benefit.

---

## Step 1 — Eligibility check: independence + non-overlapping scope

This is what makes a set of stories **batch-safe** — stricter than a milestone "wave." A wave (from `/discovery-to-milestone`) only guarantees a story isn't blocked by an *earlier* wave; it says nothing about two stories inside the *same* wave, which can still depend on each other (that skill's own worked example has S03 depending on S02 while both sit in Wave 1). Never assume same-wave membership is enough — check it here, live.

For every pair of candidate stories:
1. **No dependency edge either direction** — neither names the other in its `Dependencies` field.
2. **No overlapping files** — diff each story's `Files to create/modify` list (from `/discovery-to-milestone` Step 4, or read directly from the plan file). Any shared path disqualifies that pair from running together.
3. **No overlapping shared resource by name, even without a literal shared file** — flag (as a RISK, not a hard disqualifier) two stories that both modify the same aggregate/entity/shared module, since a field or migration added in one can silently invalidate the other's assumptions.

A pair failing check 1 or 2 cannot be in the same batch — drop the lower-priority story and note why (it can run solo, or in a later batch once the conflicting one is merged). Check 3 findings go to the user as part of the Step 2 proposal, for a judgment call.

---

## Step 2 — Propose the batch

Default batch size: **2**. Cap at 5 regardless of how many candidates pass Step 1 — size is a ceiling set by review bandwidth and simultaneous-stall risk, never a target to fill. Beyond the cap, run additional stories as a second batch instead.

```
## Proposed batch — <milestone>

1. M0X-S05 — <title> (touches: <files>)
2. M0X-S06 — <title> (touches: <files>)

Independence check: ✅ no shared dependency edges, ✅ no overlapping files
<any check-3 RISK notes>

Proceed with this batch, adjust it, or run these one at a time instead?
```

Wait for explicit confirmation before Step 3.

---

## Step 3 — Batched discovery (one consolidated Q&A)

For each story in the confirmed batch, in this session — **never as a detached subagent**, since Step 6 needs a live reply and a spawned agent can't pause mid-run to get one:
1. Run `story-discovery.md`'s Steps 0–5 exactly as written: workspace-state check, locate the story, load referenced docs, the dependency-symbol check, and the full discovery checklist (4a–4q, including the pattern/test-strategy/business-rule lock-in).
2. Do **not** run that story's Step 6 individually. Instead, fold its Blockers/Risks/Questions into this skill's own running list, tagged with the story ID.

Once every story in the batch has been processed through Step 5, present one consolidated ask:

```
## Batched discovery questions — <story IDs>

Please answer all at once — I'll wait for one reply before touching any doc.

**M0X-S05**
1. [BLOCKER] ...

**M0X-S06**
2. [RISK] ...
```

Wait for the user's single reply covering the whole batch.

---

## Step 4 — Doc updates, verdicts, commit

For each story, using only the answers relevant to it:
1. Apply `story-discovery.md`'s Step 7 (propose doc updates, full §0 permission protocol).
2. Emit that story's Step 8 readiness verdict.

If every story reaches ✅ READY, commit and push the combined doc updates as one commit covering the whole batch (usually the same milestone plan file), same as a solo story-discovery run's Step 7 commit/push handling.

If any story comes back ❌ NOT READY, drop it from this batch — run it solo later once resolved — and continue with the remaining READY stories. A batch that shrinks to 1 story is fine; it just loses the concurrency benefit for this round.

---

## Step 5 — Parallel implementation

For each READY story, in one message, spawn one `Agent` call with `isolation: "worktree"`, instructing it to run CLAUDE.md §9 Steps 1–9 for that story exactly: create the branch, implement per the pattern and test plan locked in during discovery, then the autonomous chain (commit → push → `/pre-pr` → PR → CI-fix loop → bot-fix loop → infra live-verification if applicable) through to "PR ready for merge" or a defined stuck condition. Give each agent that story's full discovery output (decisions, doc updates already committed) so it isn't rediscovering anything already settled.

Report once dispatched:
```
Batch running — 2 worktrees:
- M0X-S05 → .claude/worktrees/<name>
- M0X-S06 → .claude/worktrees/<name>

I'll flag either one as soon as it's ready for review or hits a stuck condition — no need to check in.
```

---

## Step 6 — Collect results as they land

Report each story's outcome — PR ready, or a stuck condition — **as it arrives**, never held until the whole batch finishes (same principle as CLAUDE.md §9's stuck-condition rule for a single story). A stuck condition on one story never blocks or cancels the other.

---

## Step 7 — Batched merge review

Once every story has either reached "PR ready" or been resolved as stuck-and-escalated, walk through each ready PR with the user back-to-back — the same substantive read as a single story's §9 Step 10, just done for the batch in one sitting:

```
Batch ready for review:
1. PR #N — M0X-S05 — all checks green, bots clean
2. PR #M — M0X-S06 — all checks green, bots clean

Happy to merge both, one, or want changes on either first?
```

Merge each per CLAUDE.md §9 Step 10's command, then `/mark-done` each individually.

---

## Step 8 — Worktree cleanup

After each merge, clean up that story's worktree:
```bash
git worktree remove .claude/worktrees/<name> --force
git branch -D <branch-name>
```
Then verify with `git worktree list` and `ls .claude/worktrees/` (per the `ExitWorktree unreliable removal` lesson — don't trust the removal command's own success message without checking).
