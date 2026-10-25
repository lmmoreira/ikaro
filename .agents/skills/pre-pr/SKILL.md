---
name: pre-pr
description: Run the pre-PR checklist against the current branch. This is the mandatory gate - run it once when the story implementation is complete. If a PR is already open for this branch, this skill exits immediately. Once it opens the PR, posts the CodeRabbit review trigger, dispatches Codex /pr-review in the background, verifies it started, then hands off to /pr-land.
metadata:
  short-description: Run the mandatory pre-PR checklist
---

Run the pre-PR checklist against the current branch. This is the mandatory gate — run it **once** when the story implementation is complete. If a PR is already open for this branch, this skill exits immediately.

> **AGENT RULE:** Runs automatically once local implementation self-verification (type-check, lint, tests) is clean — no separate permission prompt to start it. This was already authorized when `/story-discovery` returned READY for this story (CLAUDE.md §9's autonomous implementation chain).

> **STUCK-CONDITION RULE (applies to every step below, not just Step 4):** "Fix it and re-run" has an implicit bound — if the same failure survives a couple of genuine fix attempts, or the only apparent fix would be a workaround CLAUDE.md §7 forbids, stop and escalate to the user as a stuck condition (CLAUDE.md §9) rather than continuing to iterate.

---

## Step 0 — Pre-flight

**1. Check if a PR is already open for this branch:**
```bash
gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number,url --jq '.[0]'
```
If a PR exists → print its number and URL, then **stop**:
> PR #N is already open — pre-pr is a no-op at this point. Monitor CI checks with `gh pr checks <N> --repo lmmoreira/ikaro`.

**2. Check for uncommitted changes:**
```bash
git status --short
```
If there are staged or modified files → list all of them for visibility, then commit with specific file names (never `git add -A`) — no permission prompt needed, this is already covered by the chain-wide authorization from story-discovery's READY verdict (CLAUDE.md §9). Follow the commit format in `/implement-story` Step 3: `feat(<context>): <description> (<story-id>)` (`<story-id>` is `M0X-SYY` or `TDNN-SYY`), with the `Co-Authored-By` trailer (Codex adds `Co-Authored-By: Codex <noreply@openai.com>` explicitly; Claude Code adds its own).

**3. Check the branch is mergeable with `main` before `gh pr create`.** Run `git fetch origin`, then `git merge-tree --write-tree origin/main HEAD` as its own call (a non-zero exit means conflicts). On a conflict, `git merge origin/main` (never rebase), resolve, re-run the affected checks, push, and only then open the PR. A PR that opens `CONFLICTING` runs no CI at all, and the first sign is a status script that sees one check instead of dozens (TD53-S6, PR #650: a 430-file rename conflicted with hotsite work that landed during the story). A large rename or rewrite also needs a fresh citation scan after the merge, because the merged-in files can carry the old form.

---

## Step 1 — Script checks (automated)

Run:
```bash
bash scripts/pre-pr.sh
```

This covers: checks 1, 5, 6, 7, 11, 12, 14, 15, 17, 18, 22–27; W1; WEB-1/WEB-4/WEB-5/WEB-6/WEB-7; BE-2–BE-5/BE-7 (changed files only). Check 16 (`.skip()`/`.only()` in tests) was retired (TD37-S15) — now enforced full-codebase via ESLint (`jest/no-disabled-tests`/`jest/no-focused-tests`, `vitest/no-disabled-tests`/`vitest/no-focused-tests`) as part of `pnpm lint`, not this script. E2E-1/E2E-2/E2E-3 were likewise retired (TD37-S23) — now enforced via ESLint (`apps/web/eslint.config.js`'s `no-restricted-syntax` E2E-1/E2E-2/E2E-3 selectors) within each rule's configured scope (E2E-1: `apps/web/e2e/**/*.spec.ts`; E2E-2/E2E-3: `apps/web/**/*.tsx`, excluding `*.spec.tsx`) as part of `pnpm lint`, not this script.

If the script exits with issues, fix them and re-run. Do not proceed to Step 2 with script failures outstanding.

**Docs-only branches:** the pre-push hook skips `ci:fast` when a push touches only docs/tooling files, so `architecture-check` (dead pointers, `doc-orientation`, the `context.md` size budget) has not run. Run `pnpm architecture-check` yourself before this step and treat a non-zero exit as a script failure.

---

## Step 2 — Compiler checks

Identify which apps have changed files. Fire all relevant commands in parallel:

```bash
# backend (if changed)
pnpm --filter @ikaro/backend run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @ikaro/backend run lint 2>&1 | grep -E ' error ' | head -20

# bff (if changed)
pnpm --filter @ikaro/bff run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @ikaro/bff run lint 2>&1 | grep -E ' error ' | head -20

# web (if changed)
pnpm --filter @ikaro/web run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @ikaro/web run lint 2>&1 | grep -E ' error ' | head -20
```

Empty output = clean. Any `error TS` line = failure; report and stop.

---

## Step 3a — Agent checks (changed files)

Read the changed files once, then run all checks below. Script results from Step 1 are not repeated here.

### 2. Multi-aggregate writes wrapped in ITransactionManager.run()
Read each changed use-case file (`*.use-case.ts`). If it calls `save()` on two or more different repositories, verify all saves are inside a `txManager.run(async () => { … })` call.

### 2a. Transaction ownership and external I/O
For changed repository ports, verify none exposes `runInTransaction(...)` or `EntityManager`. For changed `txManager.run(...)` callbacks, verify they contain only database work: no event-bus publish, HTTP/client call, storage call, or other cross-service network I/O. A durable-work relay must claim/lease in a short transaction, do I/O outside it, then mark or release in a second short transaction.

### 3. Every new REST endpoint has a .http request block
For every new `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` route in changed controller files, verify a corresponding block exists in `apps/backend/http/<context>/<resource>.http` (backend) or `apps/bff/http/<module>/<resource>.http` (BFF), covering the happy path and at least the main error cases.

### 4. Every public controller and service method has an explicit return type
Check changed `*.controller.ts` and `*.service.ts` files for public methods missing `: Promise<...>` or `: Type` return annotations.

### 8. @Global() modules have an explanatory comment
For each `@Global()` in changed `*.module.ts` files, verify a nearby comment explains why it is global and where it is imported.

### 10. Aggregate fields use VO types; getters return the VO
Read changed `*.aggregate.ts` files. Props interfaces must use VO types — not `string`/`number` — for: `email` → `Email`, `phone` → `PhoneNumber`, `slug` → `Slug`, `timezone` → `Timezone`, `color`/`primary_color`/`accent_color` → `HexColor`, `open`/`close`/`opens_at`/`closes_at` → `TimeOfDay`. Getter return types must match the VO.

### 13. Static routes declared before dynamic routes
Read changed controller files. All `@Get('literal-path')` decorators must appear before any `@Get(':param')` decorators within each controller class.

### 19. PATCH body schemas with all-optional fields use `.default({})`
For every new `@Patch` route in changed controllers, find the Zod body schema. If all fields are optional, verify it ends with `.default({})`. Without it, `ZodValidationPipe` rejects `undefined` with 400 — unit tests pass but component and integration tests fail silently.

### 20. Integration test setup steps only call implemented endpoints
For every new block in `*.integration.spec.ts`, verify all routes used as setup steps (i.e., pre-`it()` state setup) have a corresponding `@Get/@Post/@Patch/@Delete` decorator in the controller. A missing endpoint returns 404 and silently corrupts the setup chain.

### 21. All new `<Image fill>` components have a `sizes` prop
For every changed `.tsx` in `apps/web/`, verify every `<Image` with `fill` also has a `sizes` prop (e.g. `sizes="100vw"` for full-width, `sizes="(min-width: 640px) 50vw, 100vw"` for half-column).

### mapXxxError catch chain
For changed `*.controller.ts` files (backend + BFF), verify use-case calls use `.catch(mapXxxError)` — never `try/catch` with a rethrown `HttpException` inside the controller. For changed `*.use-case.ts` files, verify they never `throw new HttpException` directly (HTTP concerns live at the controller layer only via the error mapper).

### correlationId from event — never generated
For changed event handler files (`*.handler.ts`, `*.listener.ts`), verify the DTO passed to the use case uses `event.correlationId` — not `uuidv7()` or any newly generated UUID. Handlers pass through, never originate correlation IDs.

### Cron jobs and cron-published Commands (`*.job.ts`, `domain/commands/*.command.ts`)
For every changed or new job under `application/jobs/`, verify against `docs/ENGINEERING_RULES_BACKEND.md` § Adding a cron-published event (items 1–11): a per-tenant job that runs in a local-time window extends `WindowedTenantJob` (or calls `forEachTenantInWindow()`) with `REMINDER_WINDOW`/`ALERT_SWEEP_WINDOW` from `tenant-local-window.helpers.ts` (no copied `WINDOW_START`/`WINDOW_END`, no `catch` that only logs, no loop that aborts on the first tenant's error); no `await` inside a `for` loop (use `mapSequentially`), including the publish loop inside `txManager.run()`; reads happen before `txManager.run()`; every Command extends `Command` with a deterministic `dedupKey`; and a new Command with a consumer has its `pubsub-catalog.json` entry regenerated and the story's post-merge Foundation-apply step named. A new Command's payload follows item 11 (booking-side: the contact, like booking events; customer-record-based: ids only).

### New or changed lock → lock catalog and concurrent test
For changed files, grep for `lockTenantDay|lockTenantStaff|lockResources|lockService|lockCustomerAlerts|findByIdForUpdate|FOR UPDATE|pessimistic_write|pg_advisory`. If the diff adds one or moves where one is taken, verify the same diff updates `docs/LOCK_CATALOG.md` (§ 3, § 4, § 3.1), that the lock is acquired in the § 2 order, and that a concurrent integration test names it. A lock test that passes with the lock removed is not coverage (`docs/ENGINEERING_RULES_TESTING.md` concurrency rules).

### Object.setPrototypeOf in domain error constructors
For changed files that define a class extending `Error` (or a base domain error), verify the constructor contains `Object.setPrototypeOf(this, new.target.prototype)` immediately after `super()`. Without it, `instanceof` checks fail silently and every `mapXxxError` branch falls through to 500.

### clearDomainEvents() called AFTER txManager.run()
For changed use-case files, if domain events are flushed (`clearDomainEvents()` or publishing), verify the flush happens **after** the `txManager.run(async () => { … })` block closes — never inside the transaction callback.

### useExisting adapter token — agent reasoning
The script (check 24) catches the pattern syntactically. Read flagged `*.module.ts` files to confirm context: `{ provide: TOKEN, useExisting: Adapter }` alongside a standalone `Adapter` in `providers` is the anti-pattern. If the token is the *only* registration and `useExisting` points to a different, unrelated class, it may be intentional — confirm with the surrounding module design.

### --ba-* CSS variables in dashboard/account (changed files)
The script (check 27) flags occurrences. For each flagged file, read it and confirm the `--ba-` variable isn't coming from a legitimate hotsite component accidentally imported into dashboard. If the file itself is under `apps/web/components/dashboard/` or `apps/web/components/account/`, it is a defect — rewrite using Tailwind + shadcn.

### /internal/ routes used for authenticated endpoints
For any new `@Controller('/internal/...')` or new paths containing `/internal/` in changed controller files, verify the endpoint is pre-auth only (OAuth callback before a JWT exists: `handleStaffLogin`, `findOrCreate`, `link-google`). If the BFF can include actor headers, the endpoint must not be `/internal/` — move it to the authenticated controller.

### bffServerFetch / bffClient transport mismatch
For changed `apps/web/` files:
- `bffServerFetch` in a file marked `'use client'` → **FAIL**
- `bffClient` in a Server Component (`page.tsx`, `layout.tsx`, or any file without `'use client'`) → **FAIL**
- Raw `fetch()` building a BFF route URL outside `lib/api/<name>.ts` → **FAIL**

### Stored objects resolved on the backend
For changed backend `*.use-case.ts` / `*.mapper.ts` / controller result mapping and BFF mappers: a response field that refers to a stored object (an image or document path: `tenants/…`, `tmp/…`, a `*ImageUrl` / `*Path` field built from a stored value) must be a full URL from `IStorageService.getPublicUrl`, resolved at the response boundary, never the raw stored path — and requests take the path. For changed `apps/web/` files, no code may join a host to a path for saved data (ESLint `IMAGE_BASE_URL_SELECTOR` blocks reading `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL`; a hardcoded host or a second variable is not caught by it). `docs/API_CONTRACTS.md` § Stored objects in responses and requests.

### RequestModule imported explicitly
For changed `*.module.ts` files whose controllers or services inject `RequestContext`, verify `RequestModule` appears in the `imports:` array. `RequestModule` is not `@Global()` — every consuming module must import it explicitly.

### WEB-1. Verify dangerouslySetInnerHTML sanitization
If the script flagged any `dangerouslySetInnerHTML` occurrence, read those files and verify the value passed to `__html` is sanitized (e.g. `DOMPurify.sanitize()`) before use. Raw, un-sanitized input is an XSS vulnerability.

### WEB-2. Non-readonly props in changed React components (S6759)
For changed `*.tsx` files in `apps/web/components/`, find `interface` or `type` declarations used as component props. Report any field not marked `readonly`. Every field in a component props interface must be `readonly`.

### BE-6. No utility functions duplicated outside src/shared/utils/
Check changed files for:
- `deepMerge` implemented inline instead of imported from `src/shared/utils/deep-merge`
- Function bodies that re-implement string trimming, digit-stripping, or format conversion already in a shared VO or util

### Diff against the story's locked decisions
Re-read the story's "Decisions already made", its "Locked at `/story-discovery`" notes and its "Files to create/modify" list, and compare each against the diff. A decision not implemented as written, a listed file that is missing or moved, or a listed artifact (a builder, a helper, a doc, a test) that was dropped is a **deviation**. Do not open the PR with one unannounced: tell the user in the same message what the story said, what shipped and why, and when it is deliberate update the story text in the PR's own commit. A reviewer must never be the first to find one. (M23-S44: the story specified a builder and a round-trip test, the implementation shipped only the parser, and Codex raised it as a Critical in round 1.)

---

## Step 3b — bad-smell-audit (mandatory, per changed layer)

Identify which layers have changed files, then invoke bad-smell-audit in PR mode for each in parallel:

```
apps/backend/ changed  →  /bad-smell-audit backend --pr
apps/bff/ changed      →  /bad-smell-audit bff --pr
apps/web/ changed      →  /bad-smell-audit web --pr
```

The `--pr` flag scopes the audit to files changed in this branch only. BE-4 is retired entirely (mechanized by `pnpm architecture-check`, TD37-S07) and no longer runs in either mode. Use `/bad-smell-audit backend` (no flag) for a full codebase audit on demand.

Wait for all invocations to complete before continuing. Any FAIL from bad-smell-audit blocks Step 4.

---

## Step 4 — Integration tests (autonomous)

```bash
{ pnpm --filter @ikaro/backend test:integration && pnpm --filter @ikaro/bff test:component; } 2>&1 | tail -50
```

Use a 600 000 ms timeout (10 min).

```
### Step 4 — Integration tests
✅ PASS — X suites, Y tests
```
or:
```
### Step 4 — Integration tests
❌ FAIL — [failing suite and test names]
Blocked: fix failures before opening the PR.
```

If the BFF component suite fails every spec with `ENV validation failed: ... received undefined`, the worktree is missing its gitignored env files (`apps/bff/.env`, `apps/backend/.env`, `apps/web/.env.local`): copy them from the main checkout (`/implement-story` Step 0 item 4) and re-run. It is not a code failure, and the first run in a fresh worktree is where it shows.

If a failure survives a couple of genuine fix attempts, or the only apparent fix would be a workaround CLAUDE.md §7 forbids, stop and escalate to the user as a stuck condition (CLAUDE.md §9) rather than continuing to iterate.

---

## Final — Verdict and PR gate

Emit the full summary:

```
## Pre-PR Checklist — <branch>

Step 0   pre-flight          ✅
Step 1   script              ✅  0 issues
Step 2   type-check + lint   ✅  clean
Step 3a  agent checks        ✅  clean
Step 3b  bad-smell-audit     ✅  clean (backend + web)
Step 4   integration tests   ✅  X suites, Y tests

---
Total issues: 0
```

**If all steps pass**, proceed directly to `gh pr create` (CLAUDE.md §9 PR GATE: forbidden until this skill clears) — no permission prompt; this was authorized when `/story-discovery` returned READY. State that all checks passed and the PR is being opened, then open it:

```bash
gh pr create --title "feat(<context>): <description> (<story-id>)" --repo lmmoreira/ikaro --body "$(cat <<'EOF'
## Summary
- <bullet>

## Story
<story-id>

## Test plan
- [ ] Unit tests pass
- [ ] Type-check clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

`<story-id>` is `M0X-SYY` for a milestone story or `TDNN-SYY` for a TD story. A PR with no story or TD ID (a chore or test-infrastructure fix) drops `(<story-id>)` from the title, and its `## Story` section says it is intentionally story-less (see Step 5b). In a worktree session the heredoc form is refused as too complex to verify: write the body to a file in the scratchpad and pass `--body-file`. The body needs real line breaks (a heredoc, as above, or `--body-file`): inside shell double quotes `\n` stays a literal backslash-n, so `## Story` would not be a Markdown section, and Step 5b's headless Codex review depends on finding it.

**If the diff touches both `infra/terraform/**` and `apps/**`/`packages/**`** (typically a regenerated `infra/terraform/pubsub-catalog.json` beside app code), pass `--label infra-app-mix-ok` in the same `gh pr create` call and put the playbook's PR-body note in the body. The `no-infra-app-mix` check reads the labels present when the PR event fires, so a label added afterwards does not clear it (`docs/CI_TRAPS.md` § CI workflow configuration traps).

**If any step failed**, list the blocking issues and stop. Do not open the PR.

---

## Step 5 — Trigger CodeRabbit, dispatch Codex, hand off (mandatory, once the PR exists)

**5a. Trigger CodeRabbit's full review.** This repo's CodeRabbit config skips automatic review on this OSS repo ("manual review required") — its own auto-posted summary comment says so. Post the trigger comment right after `gh pr create` succeeds:

```bash
gh pr comment <N> --repo lmmoreira/ikaro --body "@coderabbitai review"
```

This is a one-time trigger for round 1 only — `/pr-land` never re-posts it on later rounds.

**5b. Dispatch `/pr-review` to Codex.** First capture the round-1 timestamp `/pr-land` needs to distinguish this round's comments from anything later: `since=$(date -u +%Y-%m-%dT%H:%M:%SZ)`. Then dispatch. Do not merely state that it was dispatched: verify that the reviewer actually started before reporting success. `/pr-review` handles review, verification, and posting its own mandatory PR comment. Verify the launch in the same turn with a one-shot `pgrep -af "codex exec.*PR #<N>"` and carry straight on to Step 5c: never end a turn to wait (`/implement-story` Step 4 has the wait rule).

**A PR with no story or TD ID** (a test-infrastructure fix, a chore) must say so before dispatching: put a `## Story` section in the PR body stating it is intentionally story-less, and add to the prompt *"This PR is intentionally story-less (its body says so under '## Story'). Do not stop to ask for an ID; skip acceptance-criteria and UC-flow verification, review correctness, security, performance, architecture and test quality, and post the review comment as usual."* Otherwise the headless Codex finds no resolvable ID, asks for one, and exits without posting (PR #569, 2026-10-07), and `/pr-land` waits for a comment that never comes.

**Runtime-specific dispatch:**

- **Claude runtime:** use the existing detached process flow below (`nohup`, closed stdin, log, PID verification).
- **Codex runtime:** do not use `nohup ... &`. Start `codex exec` as a persistent terminal session with the prompt as its argument, retain the returned session ID, and poll that session with `write_stdin`. The returned session ID and initial `thread.started` event are the launch evidence. Do not claim success if the terminal session is not returned or the process exits before emitting `thread.started`.

**Worktree gotcha:** if this session is in a worktree (`EnterWorktree`), the block that used to be attributed to `codex exec` itself is actually a structural complexity guard on the Bash tool: a single compound command (`&&` chains, variable assignment + backgrounding + `if/kill -0` verification all in one call) gets refused with "too complex to verify that it stays inside the worktree" — regardless of whether the path it targets is inside or outside the worktree. Confirmed empirically (2026-08-23, probing with a disposable worktree): plain `codex exec`, backgrounded `codex exec &`, and `codex exec -C <path outside the worktree>` all run with **zero** blocking as long as each is its own simple, single-statement Bash call — no `&&`, no `if`, no capturing `$!` for a later call (Bash tool shell state doesn't persist between calls anyway). Spawning a fresh `Agent` to route around this is unnecessary and doesn't reliably help (a plain new agent is not actually exempt from the parent session's worktree pinning, contrary to earlier guidance here) — just split the dispatch into two separate, minimal Bash tool calls in this same session:

For the Claude runtime, Call 1 — dispatch (its own tool call, nothing else in it):
```bash
nohup codex exec -C <main-repo-absolute-path> "Run the pr-review skill (.agents/skills/pr-review/SKILL.md) against GitHub PR #<N> on lmmoreira/ikaro. Create any review worktree only under .claude/worktrees/review-pr-<N>, keep scratch files in one mktemp -d directory, and remove both before you exit, including when the review fails or you stop early." </dev/null >/tmp/pr-<N>-codex-review-r1.log 2>&1 &
```
Compute `<main-repo-absolute-path>` yourself from the current worktree's cwd (strip the `/.claude/worktrees/<name>` suffix) and substitute it as a literal string — don't use `$(pwd)` or any other substitution inside this call.

For the Claude runtime, Call 2 — verify, as its own separate tool call (no `sleep`/`if` combined with it):
```bash
pgrep -af "codex exec.*PR #<N>"
```
A matching process line confirms it started; no match means it exited immediately — inspect `/tmp/pr-<N>-codex-review-r1.log` in a third call.

Pass `$since` to `/pr-land` along with the PR number when handing off (Step 5c) — it's round 1's waiting timestamp for `scripts/pr-round-status.sh`.

Tell the user the PR is open, the CodeRabbit trigger was posted, and Codex review was **verified started** (include the PID/log for Claude, or session ID/thread ID for Codex). Do not wait for completion before considering pre-pr complete. If Codex exits before the relevant launch verification, report the launch failure; never claim a review was dispatched.

**5c. Hand off to `/pr-land`.** This is where `/pre-pr`'s own scope ends — round 1's CI, CodeRabbit, and Codex results are collected and triaged by `/pr-land`, not here. Invoke it with the PR number, in the same turn; its Step 1 says how the wait is run (a fresh background agent, so the main session stays free).
