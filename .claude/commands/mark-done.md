---
name: mark-done
description: Mark a story as done in its milestone plan file and commit the change to main. The last-mile check that acceptance criteria were truly met and no Critical/Important review finding was left unresolved - opens a bug-fix TD for any real gap found rather than silently marking done.
metadata:
  short-description: Mark a story done in the milestone plan
---

Mark a story as done in its milestone plan file and commit the change to main.

Argument: `$ARGUMENTS` — the story ID to mark done: a milestone story (`M03-S06`) or a TD story (`TD49-S02` = `Story 2` of TD49 — two digits, matching the `(TD49-S02)` commit-title convention, so `Story 0` is `S00`; a bare `TD27` for a single-scope TD with no `Story N —` subdivision).

**TD stories** go through the same flow as milestone stories: merge the PR first, then run this command on `main`. Find `td/<TDNN>-*.md` (exactly one match expected; zero or several → stop and report) and the heading `Story N —` for `TDNN-SNN` (N = the number in the ID, without the zero padding). **Check that TD's own heading level first, don't assume one** — existing TDs mix `##`, `###` (TD01, TD-18-19-20, TD-21, TD31, TD37, TD51) and `####` (TD23, TD30); new TDs drafted via `/create-td` standardize on `###`, but an existing TD keeps whatever level it already uses. The same Step 4 audit applies in full (AC evidence, bot/review-finding resolution, live-state checks, docs audit, bug-fix-TD-on-gap). Steps 1–3 below say "plan file" and "story heading"; for a TD story read them as the TD file and its `Story N —` heading. (Older TD stories, e.g. TD23 Stories 4–7, were marked done inside their feature branch; that is no longer the convention.)

**Single-scope TDs** (no `Story N —` subdivision at all, just one `## Status` block for the whole TD — e.g. TD27) don't have a heading to append `✅ Done` to. Update the `- **State**:` line in that `## Status` block instead (e.g. `**State**: ✅ Done — implemented and merged via PR #<N> (<date>)`), as a normal `main` commit after the merge, like any other story.

---

## Steps

0. **Sync `main` first — before any audit or check** (milestone and TD stories alike). Steps 4 and 6–8 must run against the latest merged code, and the Step 4 docs audit finds the story's squash commit with `git log main --grep`, which only exists locally after a pull.

   **If this session is isolated in a worktree** (the usual case right after `/pr-land`), the guard refuses every git command aimed at the main checkout, so the pull and steps 6–8 cannot run from there. Call `ExitWorktree` with `action: "keep"` first (it leaves the worktree and branch on disk and returns the session to the main checkout), then run `git pull --ff-only origin main`. Do steps 4–8 on `main`, and remove the worktree afterwards with the git commands in step 8a (which works from the main checkout). `action: "remove"` here would refuse after a squash merge (the commits are not ancestors of `main`) and cannot be used before the plan commit anyway. (M23-S14, 2026-10-15.)

   Already in the main checkout: just `git pull --ff-only origin main`. **Confirm the current branch is `main`** (`git branch --show-current`) before doing anything else; if not, warn the user — "You are on branch `<branch>`. This commit should go to main. Switch to main first, or confirm you want to commit here." — and stop and wait for confirmation. Then confirm the story is actually merged: `git log main --grep "(<story-id>)" --format='%h %s' -1` must return a commit. If it returns nothing, stop and report that the PR does not appear merged — do not audit or mark anything done. If the pull is not a fast-forward, look at `git log origin/main..main --format='%h %an %s'` first (see step 7's note on shared-checkout commits) before touching anything.

1. Parse the container prefix from the argument (e.g. `M03` from `M03-S06`, or `TD49` from `TD49-S02`).

2. Find the file: for a milestone, `plan/<milestone>-*.md` — exclude `*_IMPLEMENTATION_DETAILS_IA.md` and `*_IMPLEMENTATION_DETAILS_DEVELOPER.md` (e.g. `plan/M03-AUTHENTICATION.md`); for a TD, `td/<TDNN>-*.md`. Exactly one match expected either way.

3. Read the file and find the heading line that starts with `### <story-id> —` (e.g. `### M03-S06 —`); for a TD story, the `Story N —` heading at that TD's own heading level (see the TD note above). A single-scope TD has no heading — use its `- **State**:` line (also checked for an existing `✅ Done`).
   - If the line already ends with `✅ Done`, report "Already marked done — nothing to do." and stop.
   - If the story ID is not found, report the error and stop.

4. **First, find everything the story shipped** — every check below depends on this list. A story can land in more than one PR (a follow-up fix, a bug-fix commit), and a bare `git log --grep` can also match unrelated commits. Prefer the PR record: `gh pr list --repo lmmoreira/ikaro --state merged --search "<story-id> in:title" --json number,title,mergeCommit` (for a TD story search the TD id, e.g. `TD49`, and keep the ones whose title carries this `(TD49-S02)` — check each title); fall back to `git log main --grep "(<story-id>)" --format='%h %s'`. List what matched (PR numbers, commit SHAs, changed files via `git diff --name-only <sha>^..<sha>`). If more than one PR or commit matches, show the list and confirm with the user which belong to this story rather than guessing. Every check below runs over **all** of them.

   **Before marking any milestone or TD story done:** independently audit every stated Acceptance Criterion against the repository and concrete verification evidence (for example, targeted tests, lint/type-check output, CI results, or an inspected live resource). A pre-existing `✅ Done` label, implementation claim, or green-looking diff is not evidence. Report the criterion-by-criterion evidence before changing the status.

   **Also verify the story's locked test plan.** `/story-discovery` rewrites the story spec with a concrete plan of named test scenarios (unit cases, integration flows, e2e). For each named scenario, find the test that implements it (grep by name or described behavior) and its result in CI; a named scenario with no test, or a test that was dropped or skipped, is a gap, handled like a partial AC line below.

   **Also verify the bot/review chain actually resolved, not just merged.** For **each** merged PR in the list, pull its review comments (`gh api repos/lmmoreira/ikaro/pulls/<PR>/comments` and `.../reviews`) and confirm every Critical or Important finding — from `/pr-review`, CodeRabbit, or Codex — either has a visible fixing commit afterward or an explicit, reasoned dismissal in the thread. A PR that merged past an unaddressed Critical/Important finding is exactly as much a silently-unmet gap as an unverified AC line — treat it identically. Minor findings don't gate this.

   **Decide which conditional checks apply from the diff, not from memory.** Read `docs/DEFINITION_OF_DONE.md` § "Which checks a story's diff triggers", use the changed files of the story's commits listed at the start of this step, and run only the rows the diff triggers; record every other row as "n/a — <why>" in the summary block. The live-state and Pub/Sub checks in the next paragraph are the ones that table points here for.

   For any `devops`/infra AC line describing *live* cloud state (an org policy, an IAM binding, an enabled API, a provisioned account, a DNS record — as opposed to a Terraform resource merely existing in committed code), confirm it was actually executed and verified — a runbook step that was written about but never run does not satisfy its AC. **A story that added a Pub/Sub topic** must show the topic is actually publishable, not just that it exists: run `gcloud pubsub topics get-iam-policy projects/<project>/topics/ikaro-<Event>` for each new topic in both `ikaro-staging` and `ikaro-prod` and confirm the publisher binding for the backend service account is present — an empty policy (`{"etag": …}` only) means Foundation was never applied for it, which is an unmet AC, not a detail (M23-S04 precedent: three topics shipped ungranted and stayed that way undetected). A story that added a **consumer** (a new `subscribe()` call site) must also show the new subscription is usable: `gcloud pubsub subscriptions get-iam-policy projects/<project>/subscriptions/ikaro-<Event>-<consumer>` shows `roles/pubsub.subscriber` for the project's Pub/Sub service agent, and `gcloud pubsub topics get-iam-policy projects/<project>/topics/ikaro-<Event>-<consumer>-dlq` shows `roles/pubsub.publisher` for it, in both projects. Reading only the event topic proves the backend can publish, not that anything receives (M23-S28).

   **Also check `docs/27-BUSINESS_LOGIC_REFERENCE.md`** if this story's bounded context has a section there: does that section still accurately describe the algorithm/state machine/formulas as this story actually shipped them, not as originally planned at story-discovery time? A story frequently changes its own design mid-implementation (bot review, a user decision) — the reference doc needs to reflect the merged result, not the discovery-time plan. If the context has no section yet but this story's own business logic is genuinely complex/cross-cutting (same bar as `/story-discovery`'s 4r check), that's a real gap too, not just a "changed section" one.

   **Also run the story's docs audit.** Over the commits listed at the start of this step, run one `/docs-audit changed:<sha>^..<sha>` per commit and merge the results. Each run maps the files the story changed to the canonical docs (by `Tags`, through `pnpm --filter @ikaro/architecture-check docs-for --range <sha>^..<sha>`), journeys, prototypes (including the journey-vs-code check), TDs and milestones that describe them. It is read-only; any fix goes through docs-audit's own approval step (CLAUDE.md §0).

   Treat its findings by type:
   - **Stale/Conflicting, `[inventory]` drift, journey-vs-code drift, or a dead pointer — this story caused** (e.g. it renamed or removed a heading, file or export that a doc points to) — handled exactly like a partial AC line below: fix now as a follow-up doc commit (via docs-audit's approval step), or open a TD via `/create-td` and add the `⚠️ … tracked in <TD>` line. Never left silent.
   - **Dead pointers the story did not cause, context-quality, duplication, weight report** — reported to the user, not gating; the user decides now or later.
   - **Changed files that mapped to no doc or tag** (`docs-for`'s `unmapped` lines) — list them so the user can say whether a doc should exist for them.

   If the user declines a fix, record that and continue — doc findings never block the `✅ Done` edit on their own, but a silent gap is not allowed.

   **Also walk `docs/DEFINITION_OF_DONE.md` as a whole.** For each checklist item that applies to this story (coverage, migration items, stale-reference sweep, lock-catalog update, and so on), record the evidence or mark it "n/a — <why>". An applicable item with no evidence is a gap, handled like a partial AC line below.

   **Before the status edit, present one summary block** (a table or short list) so the user reviews it once instead of scrolling Step 4: one row each for every AC line, the bot/review chain, live cloud state (or n/a), `27-BUSINESS_LOGIC_REFERENCE`, the docs audit (counts by finding type, what was fixed or tracked), and the Definition of Done — each with its verdict (verified / gap + resolution) and the evidence reference.

   **If any AC line is partial/unverified, a devops live-state check can't be confirmed, or a Critical/Important review finding is unresolved — never mark the story done with the gap left silent.** Resolve it one of two ways:
   - **Trivial** — fix it immediately as a follow-up commit, verify it, then mark done with no annotation needed.
   - **Not trivial** — open a bug-fix TD via `/create-td` describing the specific gap (not a vague catch-all), then mark done with a single line appended directly below the affected AC checkbox (or directly below the story heading, for a review-finding gap with no single AC line): `  - ⚠️ <gap description> — tracked in <new TD ID>, <date>`. Before writing that line, apply the doc/config gate explicitly: summarise the exact line you intend to add and ask *"May I now update `<path>`?"* — choosing this resolution path is not itself that permission. Nothing else in the file changes beyond this line and the `✅ Done` heading edit itself.

   (M17-S14 precedent, 2026-07-17: S07 was marked ✅ Done while its own "project-level org-policy exceptions" AC line had never been executed — surfaced only during a later story's implementation, well after the fact.)

5. Append ` ✅ Done` to the end of that heading line. Do not change any other content, except the single follow-up annotation Step 4 may have added (under the affected AC checkbox, or under the story heading for a review-finding gap).

6. Re-check `git branch --show-current` is still `main` just before committing (Step 0 verified it at the start; this guards against a branch change during a long audit). If not, stop and ask, as in Step 0.

   (If the session was in a worktree, Step 0 already left it and pulled `main`; worktree cleanup is step 8a.)

7. Stage only the plan file (the TD file, for a TD story) and commit:

   ```text
   chore(plan): mark <story-id> done
   ```

   No Co-Authored-By line needed for plan-only commits.

   **Push it detached, per CLAUDE.md §0** — `git push` runs `ci:fast` as a hook and a foreground push held open by a tool call has been SIGKILLed mid-hook (M22-S04): `nohup git push </dev/null >/tmp/push.log 2>&1 &`, then wait on the real process (`pgrep -f '^git push'`) and confirm with `git fetch origin && git log origin/main -1` that the remote head moved — an exit status alone is not proof. Never `--no-verify`, and never `pkill -f` (it can match the agent's own shell).

   **If the push is rejected or fails because `main` moved** (another session merged while you worked; `git status -sb` shows `ahead 1, behind N`), the plan commit exists only locally, so `git pull --rebase origin main` it onto the new head — the merge-never-rebase rule is for branches already pushed and reviewed — and push again. Confirm with `git log origin/main -1`, not the exit status.

   **Before rebasing, look at what is local-only: `git log origin/main..main --format='%h %an %s'`.** The main checkout is shared by every session working in this repo, so a "diverged" `main` is often another session's commit that it has not pushed yet (M23-S12, 2026-10-10: `chore(plan): mark M23-S44 done` appeared there seconds before this story's merge). Anything you did not commit is not yours to rebase, reset or push: wait for its owner to push (a short poll of `git fetch` plus `git rev-list --count origin/main..main` until it is 0), then `git pull --ff-only` and commit on top. Only your own unpushed commit takes the rebase above.

8. Report the result:

   ```text
   ✅ Marked M03-S06 done in plan/M03-AUTHENTICATION.md
   Commit: <hash>
   Checks: AC <n>/<n> verified · bot chain resolved · docs audit <n> fixed / <n> tracked / <n> reported · DoD <n> applicable items verified
   ```

   Then ask the user one open question: **"What was missing, unclear or wrong in the process, the skills or the docs while doing this story?"** An answer produces a *proposal only* — the file that should change and the exact line to add or fix — for the user to approve or ignore; nothing is written on the strength of the answer alone (CLAUDE.md §0). No answer is also fine.

8a. **If a worktree was used for this story, clean it up now — no need to ask** (CLAUDE.md §9 Step 11 authorizes this automatically as part of the same chain the story's READY verdict already authorized). If this session is currently inside that worktree, use `ExitWorktree` with `action: "remove"`. `ExitWorktree` only acts on a worktree this session created with `EnterWorktree`; for one made with `git worktree add`, or by an earlier session, it is a no-op, so remove it from the main checkout with the commands below and run later commands from there (a shell standing inside a removed worktree breaks). If already back in the main checkout with the worktree directory still present, remove it directly:
   ```bash
   git worktree remove .claude/worktrees/<name> --force
   git branch -D <branch-name>
   git fetch --prune origin
   ```
   Either way, verify the removal actually took with `git worktree list` — don't trust a success/error message alone (`ExitWorktree` can report it couldn't verify worktree state, e.g. after a branch rename mid-session; re-invoke with `discard_changes: true` once you've independently confirmed via `git status`/`git log origin/main..HEAD` that nothing is lost). `ExitWorktree` counts every branch commit as "discarded" when the PR was squash-merged (the commits are not ancestors of `main`); confirm instead that `git diff origin/main HEAD` shows nothing of this branch's own work and `git status` is clean, then re-invoke with `discard_changes: true`. If the main checkout reports a diverging `main` after the worktree is gone, check `git rev-parse --is-shallow-repository` first and `git fetch --unshallow origin`: a shallow clone fakes divergence.

9. **TD story:** check whether every `Story N —` heading in the TD (or its single `## Status` State line) is now `✅ Done`. If yes, report "<TDNN> is fully done" and do the stale-documentation sweep from the milestone block below (it applies to TDs too) for any story that replaced or removed an existing flow; there are no IA/DEVELOPER wrap-up files for a TD. Skip the rest of this step.

   **Milestone story:** check whether ALL stories in the milestone plan file are now marked `✅ Done`. If yes, remind the agent:
   > "All stories in <milestone> are done. Per §9 Step 12, create both wrap-up files before reporting milestone complete:
   > - `plan/<milestone>_IMPLEMENTATION_DETAILS_IA.md` — token-efficient reference for AI agents: artifacts table, gotchas, version facts, structural decisions. No prose, no tutorials.
   > - `plan/<milestone>_IMPLEMENTATION_DETAILS_DEVELOPER.md` — detailed learning doc for the human developer: explain every concept with rationale, real code examples from this codebase, and enough context that a developer can learn NestJS, DDD, and the engineering patterns used here just by reading it.
   > Then add the IA doc to §10 of CLAUDE.md.
   >
   > **Also do a stale-documentation sweep before declaring the milestone complete** — this is a safety net for the per-story Definition of Done check (`docs/DEFINITION_OF_DONE.md`), which should have caught most of this already, but milestones this size reliably leave a few behind. For each story that replaced or removed an existing flow/mechanism (an auth pattern, a data model assumption, a transport layer, a dead endpoint), grep `docs/*.md`, other milestones' `plan/*_IMPLEMENTATION_DETAILS_*.md`, and CLAUDE.md itself for anything still describing the *old* version. Present findings to the user before editing (doc/config gate) — do not silently rewrite docs without confirmation. The per-story docs-audit results from Step 4 feed this sweep; also run `/docs-audit <milestone>` (cited docs) and `/docs-audit changed:<first-story-sha>^..HEAD` (the milestone's whole code footprint, including docs and journeys the plan never cited).
   >
   > **Also confirm `docs/27-BUSINESS_LOGIC_REFERENCE.md` reflects the milestone's final shipped design**, not just each story's own individual mark-done check (Step 4 above) — a later story in the same milestone sometimes changes an earlier story's algorithm in a way its own section never got updated for. Cross-check the whole milestone's relevant section(s) in one pass, not per-story."
