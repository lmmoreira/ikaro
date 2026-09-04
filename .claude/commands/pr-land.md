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

If this session is running inside a worktree (via `EnterWorktree`), what actually gets blocked is **compound bash in a single Bash tool call** — `&&` chains, `if/then/else` blocks, or capturing `$!` for a later check, all combined with backgrounding — reported as "too complex to verify it stays inside the worktree." This is a structural check on the shape of the command, not on `codex exec` itself and not on whether the target path is inside or outside the worktree. Confirmed empirically (2026-08-23, probing with a disposable worktree): plain `codex exec`, backgrounded `codex exec &`, and `codex exec -C <path outside the worktree>` all ran with zero blocking once each was its own simple, single-statement Bash call. **Confirmed the same way, 2026-09-01 (M20-S16 session): `Monitor` with an inline shell `command` (a poll loop with `while`/`if`) is blocked identically to Bash — same "too complex to verify it stays inside the worktree" message.** The fix is the same shape as the Bash workaround above: don't inline the loop — write it to a script file (`Write` to a path *inside* the worktree, per the file-path guard) and run it as a single simple `bash <script>.sh` command via Bash (with `run_in_background: true`, or let the tool auto-background it after its own timeout). This was verified for Bash specifically; the identical script-file pattern should work for Monitor's `command` too by the same "single simple statement, not compound" logic, though that specific case (`Monitor` + `command: "bash <script>.sh"`) hasn't been separately tried — falling back to plain Bash for the poll loop is the confirmed-working path either way.

**Fix:** never combine backgrounding with `&&`/`if`/`$!`-capture in one call. Split into two separate, minimal Bash tool calls instead — no subagent needed:

For the Claude runtime, Call 1 — dispatch, its own tool call, nothing else in it:
```bash
nohup codex exec -C <main-repo-absolute-path> "<prompt>" </dev/null >/tmp/<log-name>.log 2>&1 &
```
Compute `<main-repo-absolute-path>` yourself (strip `/.claude/worktrees/<name>` off the current cwd) and inline it as a literal string — no `$(pwd)` or other substitution in this call.

For the Claude runtime, Call 2 — verify, its own separate tool call (no `sleep`/`if` combined with it):
```bash
pgrep -af "codex exec.*<distinguishing prompt text>"
```
A matching process line confirms it started. Bash tool shell state (including `$!`) does not persist between calls anyway, so `kill -0 "$review_pid"` from a prior call was never going to work as a follow-up step — `pgrep` is the state-independent replacement.

Do **not** call `ExitWorktree` to work around this — that tool is reserved for when the user explicitly asks to exit.

**Codex runtime dispatch:** do not use the detached `nohup ... &` flow above. Start `codex exec` as a persistent terminal session with the prompt as its argument, retain the returned session ID, and poll it with `write_stdin`. The returned session ID and initial `thread.started` event are the launch evidence. Do not claim the reviewer started if the session is not returned or exits before emitting `thread.started`.

This applies to every Codex dispatch below, whenever the session is in a worktree. `scripts/pr-round-status.sh` (Step 1) is unaffected — it's already a plain script-file invocation, not compound bash, so it always ran fine from a worktree.

---

## Round state

Track two numbers for the life of this PR:
- **round** — starts at 1 (the round `/pre-pr` already opened: CI from the initial push, CodeRabbit's round-1 trigger, Codex's round-1 dispatch).
- **consecutive rounds with Critical/Important still open** — used for the Step 5 escalation.

Also capture, right before dispatching Codex for the current round, an ISO8601 timestamp: `since=$(date -u +%Y-%m-%dT%H:%M:%SZ)`. This is what tells `scripts/pr-round-status.sh` which comment belongs to *this* round versus a stale one from an earlier round.

---

## Step 1 — Wait for every in-scope actor of the current round

In-scope actors:
- **CI** — always.
- **SonarCloud** — always, every round, via the script's own live issues-API check below — **not** via whether a Sonar check-run happens to appear in `gh pr checks` this round. This repo's Sonar analysis job is dependency-gated behind the other test jobs in the same workflow: if an unrelated job fails, Sonar gets *skipped* for that commit rather than re-run, so a real, still-open issue can sit unflagged in `gh pr checks` for round after round until some round happens to have every gating job green (M20-S08 PR #429 precedent, 2026-08-26 — two Sonar issues from the very first commit went unflagged for 3 rounds this way, caught only because the user asked directly). The script queries SonarCloud's issues API directly, keyed by PR number rather than by commit, so it stays accurate regardless of whether Sonar's own check-run executed this round.
- **Codex** — always, for the dispatch that started this round.
- **CodeRabbit** — **round 1 only**, from `/pre-pr`'s `@coderabbitai review` trigger. Never re-triggered in later rounds (per explicit instruction — Codex is re-dispatched every round, CodeRabbit is not).

Use `scripts/pr-round-status.sh` for this — it blocks until every actor you ask it to wait for reaches a terminal state (a CodeRabbit rate-limit notice counts as terminal, same as an actual review), then prints one result per actor, including an unconditional SonarCloud open-issues line (no flag needed — it always runs):

```bash
# Round 1 (CI + Codex + CodeRabbit all in scope)
bash scripts/pr-round-status.sh <N> --wait-codex --wait-coderabbit --since "$since"

# Round 2+ (CodeRabbit never re-triggered)
bash scripts/pr-round-status.sh <N> --wait-codex --since "$since"
```

This is a plain script-file invocation, not raw compound bash — it runs directly even inside a worktree, no subagent delegation needed (unlike the `codex exec` dispatch itself — see the gotcha above). Do not proceed to Step 2 until it exits.

---

## Step 2 — Pool every finding from this round

Step 1's script prints a URL/pointer per actor (which CI checks failed, the Codex comment URL, the CodeRabbit comment URL, the SonarCloud open-issues list) — fetch each one's full content now (`gh api repos/lmmoreira/ikaro/pulls/<N>/comments`, the failing job's logs) before triaging; the script only tells you *that* something arrived, not the full detail behind a CI job failure or a comment body.

Collect, in one list, from every actor that responded in Step 1:
- Every failing CI check (diagnose via its job log; never from a stale log or a guess from the diff).
- **Every open SonarCloud issue from the script's live issues-API output — always pool this, unconditionally, every round, regardless of whether `gh pr checks` shows a Sonar row at all this round** (see Step 1's SonarCloud bullet for why the check-run status alone can't be trusted). Never rely on the `sonarqubecloud[bot]` PR comment's "Quality Gate Passed" headline either — a passing gate can still carry real new issues that block this repo's own separate "Fail on any new SonarCloud issue" CI step; the live issues list is the only source of truth (`docs/ANTI_PATTERNS.md`'s SonarCloud row).
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

**Before committing, grep the round's own staged diff for self-referential process language and strip it from source comments and `describe()`/`it()` titles:** `git diff --cached | grep -inE 'PR #[0-9]+|Codex (PR|round)|round-[0-9]+'`. `docs/CODE_STANDARDS.md` already forbids task/ticket references in source comments — the rule doesn't need re-discovering, it needs self-applying while writing each round's own fix, not just when a bot catches it. (M21-S03 precedent, PR #460, 2026-09-04: "Codex PR #460 round-N finding" was written into source comments and `describe()` titles at least 15 separate times across many files over 9 rounds before a later round's Codex review caught the whole pattern as one batched Minor finding — the rule existed the entire time.)

If Step 3 produced zero real fixes (CI green, SonarCloud 0 open issues, Codex reports 0 Critical/Important — Minor findings replied-to-and-declined are fine, round 1's CodeRabbit findings all triaged) — the loop is done. Report readiness and hand back to CLAUDE.md §9 Step 10 (the merge ask). Do not merge from this skill.

---

## Step 5 — Round-5 escalation

If, after 5 rounds, Codex's most recent review still reports **≥1 unresolved Critical or Important finding** (Minor-only doesn't count), stop iterating. Describe to the user: what's recurring across rounds, what's been tried, and why it hasn't resolved. This is a stuck condition — ask for a decision rather than attempting a 6th round unprompted.

---

## Output format (each round)

```
## /pr-land — PR #<N> — round <K>

Waited for: CI ✅ / ❌ <check>, SonarCloud ✅ / ❌ <count> open, Codex ✅, CodeRabbit (round 1 only) ✅/skipped
Pooled findings: <count> (CI: X, SonarCloud: S, Codex: Y, CodeRabbit: Z)
Applied: <count> fixes → one commit <sha>, pushed
Declined (with reason): <count>
Escalated: <count> (business/design or undeterminable)

Next: round <K+1> — re-dispatching Codex
```

or, when clean:

```
## /pr-land — PR #<N> — resolved after <K> round(s)

CI: ✅ all green
SonarCloud: ✅ 0 open issues (live issues-API check)
Codex: ✅ 0 Critical/Important (N Minor noted, replied)
CodeRabbit: ✅ triaged in round 1

Ready for CLAUDE.md §9 Step 10 — ask the user before merging.
```
