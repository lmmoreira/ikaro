---
name: implement-story
description: Implement a story or TD after /story-discovery returned READY and the worktree or branch exists. Verifies the workspace, implements per the story spec and the pattern and test plan locked in discovery, self-verifies, commits with the right trailer, pushes detached, then hands off to /pre-pr. Owns the middle of the autonomous chain (CLAUDE.md §9 Steps 1-2 and the commit and push of Steps 3-9).
metadata:
  short-description: Implement a READY story through commit and push, then hand off to /pre-pr
---

Implement one story or TD through to a pushed branch, then hand off to `/pre-pr`. This skill owns the middle of the autonomous chain: workspace hygiene, implementation, self-verification, commit, push. `/story-discovery` precedes it; `/pre-pr`, `/pr-land` and `/mark-done` follow it.

> **AGENT RULE:** Starts automatically when `/story-discovery` returns READY and the user chooses the worktree or branch. That READY verdict is the single authorization for the whole chain (CLAUDE.md §0 and §9): commit, push, `/pre-pr`, PR, CI-fix and bot-fix run with no per-step asks. Only the merge ask (CLAUDE.md §9 Step 10) and a stuck condition come back to the user.

> **STUCK-CONDITION RULE:** if the same failure survives a couple of genuine fix attempts, or the only apparent fix would be a workaround CLAUDE.md §7 forbids, stop and escalate to the user (CLAUDE.md §9 stuck conditions). Do not keep iterating to force a green check, and do not silently drop a requirement.

Argument: a story ID (`M09-S04`) or TD ID (`TD13`), the same one `/story-discovery` ran for.

---

## Step 0 — Pre-flight

1. **READY check.** `/story-discovery <ID>` must have returned READY in this conversation. If it did not, stop and run it first; never implement from an unreviewed spec.
2. **Branch.** `git branch --show-current` must be the story's feature branch (`feat/M0X-SYY-<short-description>`), never `main`. If a worktree or branch was not set up, `/story-discovery` Step 9 does it; do not code on `main`.
3. **Shallow clone.** First thing in any worktree or fresh clone: `git rev-parse --is-shallow-repository`. If `true`, run `git fetch --unshallow origin` before drawing any "behind/ahead of `main`" conclusion. A shallow clone's `git log HEAD..origin/main` lists phantom commits and `git merge origin/main` fails with "refusing to merge unrelated histories".
4. **Gitignored env files.** A worktree carries none of them. Copy `apps/backend/.env`, `apps/bff/.env` and `apps/web/.env.local` from the main checkout before running anything that needs them (reading from outside the worktree is fine; only git-mutating commands must stay inside it). A worktree's `.env` can also go stale relative to stories merged after it was created.
5. **Rebuilt packages.** A merge that changed a workspace package's exports needs that package rebuilt before trusting a local type-check (`docs/CI_TRAPS.md` § Stale local state).

---

## Step 1 — Implement

Write every file the story's "Files to create/modify" lists, following the pattern and the test plan locked in during discovery. Load the docs the story's "Docs to load" names and the `docs/` rows `.copilot/context.md` §10 routes the task to.

- **Frontend story with a prototype:** read the prototype HTML before writing components. Use the exact CSS class names from the story's reference table; do not substitute Tailwind for `tokens.css` names.
- **Every new `features/**/components/**/*.tsx`, `shells/**/components/**/*.tsx` or `shared/components/**/*.tsx` ships its `.spec.tsx` in the same commit** (rule: `.copilot/context.md` §7 Testing).
- **Before a blind `Write` of a file you believe is new,** grep for its expected exported symbols (`docs/ENGINEERING_RULES_SHARED.md` § Before a blind `Write` on a file).
- A story that touches Terraform, IAM, Pub/Sub or CI/CD has a live-verification check; `/pr-land` runs it before the merge review. Do not defer designing it.

---

## Step 2 — Self-verify locally

Run type-check, lint and the tests for every app the change touches, plus `pnpm architecture-check` for a docs-only or tooling change. All clean before moving on. `pnpm ci:local` (about 5 minutes, Docker) is optional and worth running first only when touching Dockerfiles, `infra/`, or integration-test paths.

Do not start a dev server or run Playwright/Chromium to verify visually without asking the user first (CLAUDE.md §0, local verification gate).

---

## Step 3 — Commit

Stage specific files only (never `git add -A`), list them for visibility, then commit. No permission prompt: the READY verdict covers it.

```
feat(<context>): <description> (M0X-SYY)

Co-Authored-By: <your-name> <your-noreply-email>
```

Conventional Commits types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. Claude Code adds its own trailer automatically. **Codex:** add `Co-Authored-By: Codex <noreply@openai.com>` explicitly on every commit you author; it does not happen by default, it is not optional, and it is the record of who actually wrote the code.

---

## Step 4 — Push (detached)

`git push` automatically runs `ci:fast` (lint, type-check, architecture-check, unit tests) and blocks if it fails. Never use `--no-verify`.

In an agent session, run the push detached and wait on the real process; a foreground push held open by a tool call was SIGKILLed (exit 137) mid-hook:

```bash
nohup git push </dev/null >/tmp/push.log 2>&1 &
pgrep -f '^git push'      # wait until it is gone, then read /tmp/push.log
git log origin/<branch> -1   # the remote head must have moved; an exit status alone is not proof
```

Never `pkill -f <pattern>` in a session: it can match the agent's own shell. List PIDs with `pgrep` or `ss -ltnp` and kill those. If the session detached while the hook ran, its result is unknown: read the log and wait for the real exit status before treating the push as done.

---

## Step 5 — Hand off to `/pre-pr`

Invoke `/pre-pr`. It is the mandatory gate: `gh pr create` is forbidden until it clears. It opens the PR, triggers the bot reviews and hands off to `/pr-land`, which stops before the merge ask. After the user merges, `/mark-done` closes the story.
