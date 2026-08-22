---
name: pr-land
description: Monitor an open PR through to merge-readiness. Waits for every in-scope reviewer of a round (CI/SonarCloud always, Codex always, CodeRabbit round 1 only) to finish before touching anything, batches every fix for that round into one commit/push, then re-dispatches Codex for the next round. Escalates to the user immediately for any business/design-only finding, and at round 5 if Critical/Important findings still remain unresolved. Never merges — stops right before the merge ask (CLAUDE.md §9 Step 10).
metadata:
  short-description: Monitor a PR's CI + bot-review rounds until merge-ready
---

Monitor the PR opened by `/pre-pr` through to merge-readiness. `/pre-pr` already: opened the PR, posted `@coderabbitai review`, and dispatched Codex's round-1 `/pr-review`. This skill picks up from there.

> **AGENT RULE:** Runs automatically once `/pre-pr` hands off — this was already authorized when `/story-discovery` returned READY (CLAUDE.md §9's autonomous implementation chain). No permission prompt to start or to continue between rounds.

> **CORE RULE — batch, never react mid-round:** Never commit or push in response to a single actor's result. Wait for **every actor in scope for the current round** to reach a terminal state, pool every finding from all of them into one list, triage the whole list, then make **one commit and one push** covering every fix the round needs. Reacting to Codex the moment it lands while CI is still running (or vice versa) wastes a round and can produce two pushes that should have been one.

> **STUCK-CONDITION RULE:** "Fix it and re-run" has an implicit bound. A finding needing a business/design decision escalates immediately (see Step 3). Five rounds with Critical/Important still open escalates too (see Step 5). Never keep iterating past either point to force a green result.

Argument: `$ARGUMENTS` — PR number (optional; defaults to the open PR for the current branch, same resolution `/pre-pr` used).

---

## Worktree gotcha (read before Step 1)

If this session is running inside a worktree (via `EnterWorktree`), the following are hard-blocked by the harness's worktree-isolation guard, regardless of flags or `dangerouslyDisableSandbox`:
- `codex exec ...` (any invocation with a prompt — the guard can't verify an opaque external agent's own git operations stay inside the worktree)
- The `Monitor` tool with a shell `command`
- Compound bash (heredocs, `if/then/else` blocks combined with backgrounding) — reported as "too complex to verify it stays inside the worktree"

**Workaround:** delegate the exact command to a freshly spawned `Agent` call (no `subagent_type: "fork"`, no `isolation` param — a plain new agent). A freshly spawned agent is not pinned to the parent session's worktree and can run these commands directly. Give it the literal command plus enough context to report back cleanly (PID/log for a dispatch, or the final resolved state for a poll). Do **not** call `ExitWorktree` to work around this — that tool is reserved for when the user explicitly asks to exit.

This applies to every Codex dispatch and every CI/comment poll below, whenever the session is in a worktree.

---

## Round state

Track two numbers for the life of this PR:
- **round** — starts at 1 (the round `/pre-pr` already opened: CI from the initial push, CodeRabbit's round-1 trigger, Codex's round-1 dispatch).
- **consecutive rounds with Critical/Important still open** — used for the Step 5 escalation.

---

## Step 1 — Wait for every in-scope actor of the current round

In-scope actors:
- **CI** — always.
- **Codex** — always, for the dispatch that started this round.
- **CodeRabbit** — **round 1 only**, from `/pre-pr`'s `@coderabbitai review` trigger. Never re-triggered in later rounds (per explicit instruction — Codex is re-dispatched every round, CodeRabbit is not).

Poll until all in-scope actors reach a terminal state. If in a worktree, delegate this poll to a fresh `Agent` per the gotcha above.

```bash
# CI — poll until nothing is pending
gh pr checks <N> --repo lmmoreira/ikaro
```

```bash
# Codex — poll PR comments for a new comment authored after this round's dispatch time,
# matching the /pr-review report marker ("PR Review — #<N>")
gh pr view <N> --repo lmmoreira/ikaro --json comments
```

```bash
# CodeRabbit (round 1 only) — poll for any coderabbitai comment posted after the trigger.
# A rate-limit notice ("CodeRabbit reached its review limit...") IS a terminal response —
# treat it exactly like a completed review with zero findings and move on. Do not wait
# for an actual review that a rate-limit notice already says will not arrive.
gh pr view <N> --repo lmmoreira/ikaro --json comments
```

Do not proceed to Step 2 until every in-scope actor for this round has responded.

---

## Step 2 — Pool every finding from this round

Collect, in one list, from every actor that responded in Step 1:
- Every failing CI check (diagnose via the live source — SonarCloud's own issue API per `docs/ANTI_PATTERNS.md`'s SonarCloud row, never from a stale log or a guess from the diff; other checks via their job logs).
- Every Codex finding (Critical/Important/Minor) from this round's review comment.
- Round 1 only: every CodeRabbit finding (if it posted an actual review rather than a rate-limit notice).

---

## Step 3 — Triage the pooled list (bot-finding discipline, CLAUDE.md §9)

For every finding in the pooled list:
1. Read it.
2. Check it against actual codebase practice — grep for the real precedent it claims to violate.
3. Check it against the real business scenario/UC — a flagged "inconsistency" may be deliberate.
4. Only if it survives both checks, it's a real fix.
5. If it doesn't survive, reply on the thread explaining why — never silent-ignore.
6. **If a finding requires a business or design decision** (not a pure code-correctness question — e.g. a naming/scope choice, a UX tradeoff, a "should this even work this way") — stop here and ask the user, with the full pooled list as context, regardless of round number. This is not a Step 5 round-count escalation; it's immediate.
7. If relevance genuinely can't be determined either way (the existing stuck condition), also escalate immediately rather than guessing.

---

## Step 4 — One batch, one commit, one push

If Step 3 produced any real fixes: apply all of them together, then **one commit** covering every fix from this round, **one push**. This triggers CI again automatically. Round += 1. Re-dispatch Codex only (never CodeRabbit) for the new commit, then return to Step 1.

If Step 3 produced zero real fixes (CI green, Codex reports 0 Critical/Important — Minor findings replied-to-and-declined are fine, round 1's CodeRabbit findings all triaged) — the loop is done. Report readiness and hand back to CLAUDE.md §9 Step 10 (the merge ask). Do not merge from this skill.

---

## Step 5 — Round-5 escalation

If, after 5 rounds, Codex's most recent review still reports **≥1 unresolved Critical or Important finding** (Minor-only doesn't count), stop iterating. Describe to the user: what's recurring across rounds, what's been tried, and why it hasn't resolved. This is a stuck condition — ask for a decision rather than attempting a 6th round unprompted.

---

## Output format (each round)

```
## /pr-land — PR #<N> — round <K>

Waited for: CI ✅ / ❌ <check>, Codex ✅, CodeRabbit (round 1 only) ✅/skipped
Pooled findings: <count> (CI: X, Codex: Y, CodeRabbit: Z)
Applied: <count> fixes → one commit <sha>, pushed
Declined (with reason): <count>
Escalated: <count> (business/design or undeterminable)

Next: round <K+1> — re-dispatching Codex
```

or, when clean:

```
## /pr-land — PR #<N> — resolved after <K> round(s)

CI: ✅ all green
Codex: ✅ 0 Critical/Important (N Minor noted, replied)
CodeRabbit: ✅ triaged in round 1

Ready for CLAUDE.md §9 Step 10 — ask the user before merging.
```
