---
name: enter-worktree
description: Create a repo worktree for this project by running `.claude/worktree-create.sh`, which also copies the required env files into the new worktree. Use when the user wants an isolated worktree copy of the repo or asks Codex to start work inside one.
metadata:
  short-description: Create and enter a repo worktree
---

# Enter Worktree

Use this skill whenever the task should run in an isolated repo worktree.

## Required flow

1. Run `.claude/worktree-create.sh` from the repository root.
2. Pass the worktree name as JSON on stdin, for example:

```bash
printf '{"name":"feat/m09-s04-booking-reschedule"}' | bash .claude/worktree-create.sh
```

3. Read the printed worktree path from stdout.
4. Continue all subsequent file edits, tests, and commands in that worktree directory.

## Important behavior

- The script creates the worktree under `.claude/worktrees/<name>`.
- The script also copies these env files when present:
  - `apps/backend/.env`
  - `apps/bff/.env`
  - `apps/web/.env.local`
- If the script reports that the worktree already exists, stop and ask the user before creating anything else.

## Naming

- Prefer the branch name requested by the user or by the story workflow.
- Keep the worktree name aligned with the branch name, since the script derives the directory from it.