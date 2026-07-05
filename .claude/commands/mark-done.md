---
name: mark-done
description: Mark a story as done in its milestone plan file and commit the change to main.
metadata:
  short-description: Mark a story done in the milestone plan
---

Mark a story as done in its milestone plan file and commit the change to main.

Argument: `$ARGUMENTS` — the story ID to mark done (e.g. `M03-S06`).

---

## Steps

1. Parse the milestone prefix from the argument (e.g. `M03` from `M03-S06`).

2. Find the plan file: `plan/<milestone>-*.md` — exclude `*_IMPLEMENTATION_DETAILS_IA.md` and `*_IMPLEMENTATION_DETAILS_DEVELOPER.md`. There should be exactly one match (e.g. `plan/M03-AUTHENTICATION.md`).

3. Read the file and find the heading line that starts with `### <story-id> —` (e.g. `### M03-S06 —`).
   - If the line already ends with `✅ Done`, report "Already marked done — nothing to do." and stop.
   - If the story ID is not found, report the error and stop.

4. Append ` ✅ Done` to the end of that heading line. Do not change any other content.

5. Verify the current branch is `main`. If not, warn the user:
   > "You are on branch `<branch>`. This commit should go to main. Switch to main first, or confirm you want to commit here."
   Then stop and wait for confirmation before proceeding.

6. Stage only the plan file and commit:
   ```
   chore(plan): mark <story-id> done
   ```
   No Co-Authored-By line needed for plan-only commits.

7. Report the result:
   ```
   ✅ Marked M03-S06 done in plan/M03-AUTHENTICATION.md
   Commit: <hash>
   ```

8. Check whether ALL stories in the milestone plan file are now marked `✅ Done`. If yes, remind the agent:
   > "All stories in <milestone> are done. Per §15 item 16, create both wrap-up files before reporting milestone complete:
   > - `plan/<milestone>_IMPLEMENTATION_DETAILS_IA.md` — token-efficient reference for AI agents: artifacts table, gotchas, version facts, structural decisions. No prose, no tutorials.
   > - `plan/<milestone>_IMPLEMENTATION_DETAILS_DEVELOPER.md` — detailed learning doc for the human developer: explain every concept with rationale, real code examples from this codebase, and enough context that a developer can learn NestJS, DDD, and the engineering patterns used here just by reading it.
   > Then add the IA doc to §10 of CLAUDE.md."
