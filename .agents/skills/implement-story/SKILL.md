---
name: implement-story
description: Implement a story or TD after /story-discovery returned READY and the worktree or branch exists. Verifies the workspace, implements per the story spec and the pattern and test plan locked in discovery, self-verifies, commits with the right trailer, pushes detached, then hands off to /pre-pr. Owns the middle of the autonomous chain (CLAUDE.md §9 Steps 1-2 and the commit and push of Steps 3-9).
metadata:
  short-description: Implement a READY story through commit and push, then hand off to /pre-pr
---

Implement one story or TD through to a pushed branch, then hand off to `/pre-pr`. This skill owns the middle of the autonomous chain: workspace hygiene, implementation, self-verification, commit, push. `/story-discovery` precedes it; `/pre-pr`, `/pr-land` and `/mark-done` follow it.

> **AGENT RULE:** Starts once `/story-discovery` has returned READY, the worktree or branch exists, **and the user has confirmed proceeding to implementation** (CLAUDE.md §0). Choosing the worktree or branch is not that confirmation: if the user has not said to go ahead, ask and wait. From that confirmation on, the READY verdict is the single authorization for the whole chain (CLAUDE.md §0 and §9): commit, push, `/pre-pr`, PR, CI-fix and bot-fix run with no per-step asks. Only the merge ask (CLAUDE.md §9 Step 10) and a stuck condition come back to the user.

> **STUCK-CONDITION RULE:** if the same failure survives a couple of genuine fix attempts, or the only apparent fix would be a workaround CLAUDE.md §7 forbids, stop and escalate to the user (CLAUDE.md §9 stuck conditions). Do not keep iterating to force a green check, and do not silently drop a requirement.

Argument: a story ID (`M09-S04`) or TD ID (`TD13`), the same one `/story-discovery` ran for.

---

## Step 0 — Pre-flight

1. **READY check.** `/story-discovery <ID>` must have returned READY for this story, either in this conversation or as the story's discovery output handed to you in your prompt (`/run-batch` passes it to each isolated worktree agent; that is the verified READY result for the story). If neither is true, stop and run `/story-discovery` first; never implement from an unreviewed spec.
2. **Branch.** `git branch --show-current` must be a feature branch for this story, never `main`. `/story-discovery` Step 9 names it `feat/<story-id-lowercase>-<short-description>` for a worktree (for example `feat/m09-s04-booking-reschedule`) and `feat/M0X-SYY-<short-description>` for a direct branch; accept whichever it created. If no worktree or branch was set up, `/story-discovery` Step 9 does it; do not code on `main`.
3. **Shallow clone.** A worktree made by the project's `WorktreeCreate` hook (`.claude/settings.json`, script `.claude/worktree-create.sh`) is already unshallowed, has the env files below and has its dependencies installed: check with `git rev-parse --is-shallow-repository`, `ls apps/backend/.env apps/bff/.env apps/web/.env.local` and `ls node_modules`, and only do the manual steps in items 3 and 4 for what is missing (a branch named `worktree-<name>` instead of the name you passed means the hook did not run, for example in a session started before the settings file existed). First thing in any worktree or fresh clone: `git rev-parse --is-shallow-repository`. If `true`, run `git fetch --unshallow origin` before drawing any "behind/ahead of `main`" conclusion. A shallow clone's `git log HEAD..origin/main` lists phantom commits and `git merge origin/main` fails with "refusing to merge unrelated histories".
4. **Gitignored env files.** A worktree carries none of them. Copy `apps/backend/.env`, `apps/bff/.env` and `apps/web/.env.local` from the main checkout before running anything that needs them (reading from outside the worktree is fine; only git-mutating commands must stay inside it). A worktree's `.env` can also go stale relative to stories merged after it was created. A fresh worktree has no `node_modules` either: run `pnpm install --frozen-lockfile` in it before any type-check, lint or test.
5. **Rebuilt packages.** A merge that changed a workspace package's exports needs that package rebuilt before trusting a local type-check (`docs/CI_TRAPS.md` § Stale local state).
6. **Know which directory a command runs in before `git add` / `git commit` / `git push`.** The shell keeps its directory between calls; after a `cd apps/backend` for a test run, `git add apps/backend/src` fails with "pathspec did not match" and a `git push` runs the whole pre-push hook on nothing (M26-S05: this happened twice). Run `pwd` (or `git rev-parse --show-toplevel`) first, `cd` back to the repository root as its own call, then stage.
7. **Compound commands in a worktree.** The worktree guard refuses a single Bash call that chains git or docker with `&&`, uses `$(...)`, or carries a docker `--format` string ("too complex to verify it stays inside the worktree"). Run each step as its own simple call, or put the sequence in a script file in the scratchpad and run `bash <script>`. The pr-land worktree gotcha has the same cause. The refusal comes from Claude Code itself (the message is compiled into the binary; no repo file, `~/.claude/settings.json` entry or plugin defines it), so nothing in this repo can relax it: only the shape of the command matters. It also refused `;` chains (`git merge-tree … ; echo exit=$?`) and a `cd <dir> && ( … )` subshell, while some `&&` chains of git commands were accepted in the same session, the check's rule is not documented, so keep each call to one plain command, with redirects (`> log 2>&1`) and a trailing `&` as the only extras. It also refused `perl $VAR file` (a computed script argument), `xargs perl -e '…'` (an inline program after `xargs`) and `git -C <main-checkout>` from inside a worktree: run a script file by its literal path (`perl /path/script.pl files`, or `xargs perl /path/script.pl`) and leave the main checkout's git to a session that is in it. A user-level `~/.claude/hooks/guard-worktree-path.sh` is a different, optional guard on the Read/Edit/Write/NotebookEdit `file_path` argument only; it never looks at Bash and is not what refuses these commands. A heredoc file write chained with other commands in one call (`cat > f <<'E' … E` followed by `npx prettier …; npx jest …`) was refused whole: create new files with the Write tool, and keep a heredoc script (`python3 - <<'E'`) as the only statement of its call. Also refused: a computed value inside a `sed -n "${n}p"` or an `npx … -O '{"json":…}'` argument, and `git add … && git commit …` in one call. A script that runs git itself (`scripts/pre-pr.sh`, `scripts/codex-skill.sh`) is refused when it carries a redirect plus a `;` chain (`bash scripts/x.sh > log 2>&1; echo exit=$?`) or follows a `cd <dir> &&`, but accepted as a plain `bash scripts/x.sh`: run `cd` as its own call first (these scripts read the working directory, so `codex-skill.sh` needs the repo root), then the script alone, and read the result from the tool output or its log. Put the logic in a scratchpad script (`python3 <script>`) or pass options through a config file. A `cd` in one Bash call persists into the next, so a later relative path can resolve from the wrong folder: use absolute paths or `pnpm --filter`.

---

## Step 1 — Implement

Write every file the story's "Files to create/modify" lists, following the pattern and the test plan locked in during discovery. Load the docs the story's "Docs to load" names and the `docs/` rows `.copilot/context.md` §10 routes the task to.

- **Frontend story with a prototype:** read the prototype HTML before writing components. Use the exact CSS class names from the story's reference table; do not substitute Tailwind for `tokens.css` names.
- **Every new `features/**/components/**/*.tsx`, `shells/**/components/**/*.tsx` or `shared/components/**/*.tsx` ships its `.spec.tsx` in the same commit** (rule: `.copilot/context.md` §7 Testing).
- **Before adding an E2E `test(`, grep `apps/web/e2e` for the route and the `data-testid`s it would assert.** If an existing test already walks that flow with the same login and seed, add a named `test.step` to it instead; a new test needs a one-line reason in the PR body. An assertion jsdom or an integration test can make goes there (`docs/TESTING_STRATEGY.md` § Layer 5, "Before adding an E2E test").
- **Before a blind `Write` of a file you believe is new,** grep for its expected exported symbols (`docs/ENGINEERING_RULES_SHARED.md` § Before a blind `Write` on a file).
- **Editing a `.claude/commands/*.md` file:** run `bash scripts/codex-skill.sh` and stage the regenerated `.agents/skills/<name>/SKILL.md` mirrors in the same commit (see `docs/DEFINITION_OF_DONE.md` § Stale-reference sweep).
- **Backend story: check where each new class lives and what already exists before writing it** (the backend counterpart of the frontend reuse inventory). A batch job belongs in `application/jobs/` and is the only layer that calls use cases; a TypeORM import is allowed only in the reviewed repository adapters (`docs/ENGINEERING_RULES_BACKEND.md` § Layering inside `application/`); a deployment value such as `FRONTEND_URL` comes through `APPLICATION_CONFIG` (`src/shared/ports/`), never a new field on a feature's config. Grep `src/shared/ports/` and a sibling context for the capability you are about to build before creating a port or a token (M26-S05: a job filed as a use case, a TypeORM helper outside the allowlist and a duplicate config field were each found only by `pnpm dep-cruise`, ESLint or review).
- A story that touches Terraform, IAM, Pub/Sub or CI/CD has a live-verification check; `/pr-land` runs it before the merge review. Do not defer designing it.

---

## Step 2 — Self-verify locally

Run type-check, lint and the tests for every app the change touches, plus `pnpm architecture-check` whenever the diff touches docs, `.claude/**` or `.copilot/context.md` (the file has an enforced size budget), not only for a docs-only change. Judge it by its exit status (`pnpm architecture-check >/tmp/ac.log 2>&1; echo $?`) and read the `file:line [detector]` lines: its output is long, and filtering it hid a violation that then failed the push (TD54-S1). All clean before moving on. To run **one** backend integration spec, put the path first and the project flag after it: `NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=5120" npx jest <path> --selectProjects integration`. `--selectProjects integration <path>` reads the path as a second project name and runs the whole project (126 suites, about 7 minutes; M25-S20), and without `NODE_OPTIONS` the integration global setup refuses to start. `pnpm ci:local` (about 5 minutes, Docker) is optional and worth running first only when touching Dockerfiles, `infra/`, or integration-test paths.

Before committing, list every `Acceptance criteria — technical` bullet of the story and name the spec, test or command that proves it (a line that holds only by construction, such as "imports nothing from X" or "exempt", needs a test that pins it, see `/story-discovery` check 4q). A bullet with no proof is a gap to close now, not one for `/mark-done` to find after the merge.

Also, before committing, run the story's stale-reference sweep while the change is fresh, not only at `/pre-pr`: when the story adds, renames or changes a field, route, response shape or behaviour, grep `docs/*.md` (above all `docs/API_CONTRACTS.md`), `journeys/**` and `plan/*_IMPLEMENTATION_DETAILS_*.md` for wording that still says it is planned, "gains", "has no X today" or "decided at story discovery", and fix it in the same commit (`docs/DEFINITION_OF_DONE.md` § Stale-reference sweep). M25-S26: `docs/API_CONTRACTS.md` still called the new `operational` field planned in four places, and only the round-1 review caught it.

**Resolve every forward reference to this story.** Docs often leave a question open for the story that owns it ("fixed by M26-S14", "decided at M26-S14", "owned by this story"). Run `git grep -n "<story-id>" -- docs journeys plan .claude/commands` and settle each hit that waits on this story's answer in the same commit. The sweep above looks for "planned" and "gains" wording and misses these (M26-S14: UC-117 A9 still said the no-subscription answer "is fixed by M26-S14", and a journey note had the web comparing a link expiry the backend now decides; both surfaced only at `/mark-done`).

**After merging `main` into a worktree, compare each touched app's `.env` with its `.env.example`** (`docs/CI_TRAPS.md` § Stale local state after a merge/pull). A variable `main` retired is rejected at startup, and the symptom is not the message: `app.module.spec.ts` fails in the pre-push hook as `Jest worker encountered N child process exceptions`. Run that spec alone to read the real error.

**Run the gates CI runs, not only the ones you remember, before the first push** (each of these failed on a PR for M26-S05 after a green local run of a subset):
- `pnpm --filter @ikaro/backend run lint` over the whole app (not `eslint` on the folders you touched: `max-lines`, `max-lines-per-function` and the persistence-import ban fire on neighbours too), and the same for the BFF and web when they change.
- `pnpm dep-cruise` whenever the diff adds a file or an import.
- `terraform fmt -recursive -check` when HCL changes; without the binary, run it in a container (`infra/terraform/README.md` § Gotchas). Never run a container as root against the worktree: `init`/`test` leave a root-owned `.terraform/` that blocks `git worktree remove`, and the same section has the `--user` form.
- **A job selector or any query whose `ORDER BY` you changed**: order it like the index that serves it (`docs/ENGINEERING_RULES_TESTING.md` § An `EXPLAIN` assertion that passes locally proves little); CI's planner, not yours, is the check.
- **A story that adds integration suites**: look at the last green `Backend Integration Tests` run (duration, and whether it sat near its heap ceiling, `docs/ENGINEERING_RULES_TESTING.md` § Node's default V8 heap limit) before assuming two more files are free.

**For a story sized L, get one independent read before committing.** Spawn a fresh `general-purpose` agent with the diff range, the story block and the docs it is judged against, but not your own conclusions, and ask for Critical/Important defects with a concrete failing scenario, gaps against the ACs and UC alternative flows, tests that would still pass with the production line removed, and comments that no longer match the code (read-only, no edits). Re-read each finding yourself before acting on it. On M26-S05 such a pass found a real gap (a charge created against a different provider customer than the account's) and several misleading comments that five bot rounds had not. It is optional for S and M stories.

Do not start a dev server or the compose stack to look at the app without asking the user first (CLAUDE.md §0, local verification gate). Local Playwright E2E is allowed without asking, only from the story's worktree: `pnpm infra:e2e` before (ask first if a compose stack is already running, it replaces it), then the apps; after, stop them by PID, delete the generated `AGENTS.md`/`CLAUDE.md` and run `pnpm infra:e2e:down` (`docs/TESTING_STRATEGY.md` § Running Playwright locally).

---

## Step 3 — Commit

Stage specific files only (never `git add -A`), list them for visibility, then commit. No permission prompt: the READY verdict covers it.

```
feat(<context>): <description> (<story-id>)

Co-Authored-By: <your-name> <your-noreply-email>
```

`<story-id>` is the ID this skill was invoked with: `M0X-SYY` for a milestone story, `TDNN-SYY` for a TD story (for example `TD49-S02`).

Conventional Commits types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. Claude Code adds its own trailer automatically. **Codex:** add `Co-Authored-By: Codex <noreply@openai.com>` explicitly on every commit you author; it does not happen by default, it is not optional, and it is the record of who actually wrote the code.

---

## Step 4 — Push (detached)

`git push` automatically runs `ci:fast` (lint, type-check, architecture-check, unit tests) and blocks if it fails. Never use `--no-verify`.

In an agent session, run the push detached and wait on the real process; a foreground push held open by a tool call was SIGKILLed (exit 137) mid-hook:

```bash
git rev-parse HEAD                    # note the commit being pushed
nohup git push --porcelain </dev/null >/tmp/push-<story-id>-<unix-time>.log 2>&1 &    # one log per push: put the current epoch seconds in the name as a literal
pgrep -af '^git push'                 # one-shot: note the PID it prints; other sessions push from their own worktrees, so if more than one line prints, pick yours with `ls -l /proc/<pid>/cwd` (it must be this worktree), never the lowest PID
while kill -0 <pid> 2>/dev/null; do sleep 10; done   # separate foreground call, timeout 600000; if it times out, run it again
git ls-remote origin refs/heads/<branch>   # the remote head must equal the commit noted above; read the log too: a ref line for the branch, or "Everything up-to-date"
```

**Never end a turn to wait for a detached push, and never wait with a `pgrep -f <pattern>` loop.** Nothing wakes the session when the process exits, so a turn that ends with "I'll continue when the push finishes" stalls the chain until the user prods it (TD54-S1: it did). A `pgrep -f` pattern also matches the waiting shell's own command line, and another session's, so that loop never ends. Wait on the exact PID with `kill -0`, in the same turn, then check the log and the remote head yourself. A background-task notice that the launcher shell exited says nothing about the push.

**If the push is rejected, the hook failed.** Read the log for the cause (`grep -E '^\S+:[0-9]+ \[' <log>` lists `architecture-check` violations), fix it, re-stage and `git commit --amend --no-edit` the still-unpushed commit, then push again; never `--no-verify`. The hook reads the working tree, so do not edit tracked files while it runs. Two known push traps are already written up in `docs/CI_TRAPS.md`: the row on a background `nohup git push` reporting "completed (exit code 0)" and the row on a push failing in `ci:fast` on a file edited meanwhile.

The push is done only when that remote head equals the commit you noted and the log shows no rejected ref or hook failure: an exit status alone is not proof, and an older commit already on the remote branch looks like success if you only check that the branch exists.

Never `pkill -f <pattern>` in a session: it can match the agent's own shell. List PIDs with `pgrep` or `ss -ltnp` and kill those. If the session detached while the hook ran, its result is unknown: read the log and wait for the real exit status before treating the push as done.

---

## Step 5 — Hand off to `/pre-pr`

Invoke `/pre-pr`. It is the mandatory gate: `gh pr create` is forbidden until it clears. It opens the PR, triggers the bot reviews and hands off to `/pr-land`, which stops before the merge ask. After the user merges, `/mark-done` closes the story.
