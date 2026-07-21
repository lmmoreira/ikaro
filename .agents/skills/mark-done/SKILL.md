---
name: mark-done
description: Mark a story as done in its milestone plan file and commit the change to main.
metadata:
  short-description: Mark a story done in the milestone plan
---

Mark a story as done in its milestone plan file and commit the change to main.

Argument: `$ARGUMENTS` — the story ID to mark done (e.g. `M03-S06`).

**TD stories** (`TDxx Story N`) are not covered by this command — `$ARGUMENTS` only parses `M0X-SYY` milestone syntax, and Step 6 requires being on `main`. Mark a TD story done by appending ` ✅ Done` directly to its `#### Story N —` heading in the `td/TDxx-*.md` file, bundled into the same feature-branch commit as the story's implementation — not as a separate post-merge `main` commit. See TD23 Stories 4-7 for precedent.

---

## Steps

1. Parse the milestone prefix from the argument (e.g. `M03` from `M03-S06`).

2. Find the plan file: `plan/<milestone>-*.md` — exclude `*_IMPLEMENTATION_DETAILS_IA.md` and `*_IMPLEMENTATION_DETAILS_DEVELOPER.md`. There should be exactly one match (e.g. `plan/M03-AUTHENTICATION.md`).

3. Read the file and find the heading line that starts with `### <story-id> —` (e.g. `### M03-S06 —`).
   - If the line already ends with `✅ Done`, report "Already marked done — nothing to do." and stop.
   - If the story ID is not found, report the error and stop.

4. **For `devops`/infra stories only:** before appending ` ✅ Done`, read the story's Acceptance Criteria. For any AC line describing *live* cloud state (an org policy, an IAM binding, an enabled API, a provisioned account, a DNS record — as opposed to a Terraform resource merely existing in committed code), confirm it was actually executed and verified — a runbook step that was written about but never run does not satisfy its AC. If any such line's live execution can't be confirmed right now, stop and ask the user whether to (a) execute/verify it now before marking done, or (b) mark the story done anyway, with that specific AC line annotated as an open follow-up — never mark done with a silently-unmet AC line.

   If (b) is chosen, the only permitted extra edit beyond Step 5's heading change is a single line appended directly below that AC's own checkbox, in the form `  - ⚠️ Not verified as of <date> — <one-line reason>`; nothing else in the file changes. Before writing it, apply the doc/config gate explicitly: summarise the exact line you intend to add and ask *"May I now update `<path>`?"* — the earlier (a)/(b) choice is not itself that permission.

   (M17-S14 precedent, 2026-07-17: S07 was marked ✅ Done while its own "project-level org-policy exceptions" AC line had never been executed — surfaced only during a later story's implementation, well after the fact.)

5. Append ` ✅ Done` to the end of that heading line. Do not change any other content, except the single follow-up annotation Step 4 may have added under an unverified AC line.

6. Verify the current branch is `main`. If not, warn the user:
   > "You are on branch `<branch>`. This commit should go to main. Switch to main first, or confirm you want to commit here."
   Then stop and wait for confirmation before proceeding.

7. Stage only the plan file and commit:

   ```text
   chore(plan): mark <story-id> done
   ```

   No Co-Authored-By line needed for plan-only commits.

8. Report the result:

   ```text
   ✅ Marked M03-S06 done in plan/M03-AUTHENTICATION.md
   Commit: <hash>
   ```

9. Check whether ALL stories in the milestone plan file are now marked `✅ Done`. If yes, remind the agent:
   > "All stories in <milestone> are done. Per §9 Step 12, create both wrap-up files before reporting milestone complete:
   > - `plan/<milestone>_IMPLEMENTATION_DETAILS_IA.md` — token-efficient reference for AI agents: artifacts table, gotchas, version facts, structural decisions. No prose, no tutorials.
   > - `plan/<milestone>_IMPLEMENTATION_DETAILS_DEVELOPER.md` — detailed learning doc for the human developer: explain every concept with rationale, real code examples from this codebase, and enough context that a developer can learn NestJS, DDD, and the engineering patterns used here just by reading it.
   > Then add the IA doc to §10 of CLAUDE.md.
   >
   > **Also do a stale-documentation sweep before declaring the milestone complete** — this is a safety net for the per-story Definition of Done check (CLAUDE.md §7), which should have caught most of this already, but milestones this size reliably leave a few behind. For each story that replaced or removed an existing flow/mechanism (an auth pattern, a data model assumption, a transport layer, a dead endpoint), grep `docs/*.md`, other milestones' `plan/*_IMPLEMENTATION_DETAILS_*.md`, and CLAUDE.md itself for anything still describing the *old* version. Present findings to the user before editing (doc/config gate) — do not silently rewrite docs without confirmation."
