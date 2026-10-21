# Agent Context Trap Scenarios

> **When to load:** changing `.copilot/context.md` and needing to re-run the prompts that prove each trap rule still fires; it is an eval spec, not a reference, and the rules themselves are in `docs/ANTI_PATTERNS.md` and `docs/CI_TRAPS.md`.
> **Tags:** agent-process

> Eval spec for `.copilot/context.md` — not a reference doc. Each entry is a prompt to run in a
> fresh session, a pass/fail criterion, and a citation. No rationale is restated here: the "why"
> lives at the cited `docs/ANTI_PATTERNS.md`/`docs/CI_TRAPS.md` row, or the relevant
> `docs/ENGINEERING_RULES_*.md` split file for the gate scenario. Restating it here would recreate the exact duplication TD41 (Story 0; the TD file has since been removed — see git history)
> fixed for the `useExisting` triplication.
>
> **Evaluation:** run each prompt in a fresh session against `git show <base-sha>:.copilot/context.md`
> (pre-slim) and the current file (post-slim). A scenario that passed before and fails after means
> the responsible bullet's trigger was cut too far during Stories 1–2 — restore it, don't re-word
> the scenario to fit.
>
> **Scope:** only patterns with no existing *deterministic* backstop. `useExisting`, hardcoded
> `'pt-BR'`, network I/O inside `txManager.run()`, and a missing locale entry are CI-enforced —
> a real, mechanical block on merge — see the exclusion table below instead of a scenario.
> `WHERE id = ? without tenant_id` is documented at `docs/ANTI_PATTERNS.md` row 1, but that's a
> reference table, not enforcement — no detector or CI check actually verifies it, so it gets a
> real scenario below (CodeRabbit PR #492 round 1 finding: citing a documentation row as if it
> were equivalent to the deterministic backstops above was a miscategorization).
>
> **Deliberate exception — Scenario 1:** `domain-event-audit-coverage` is CI-enforced, but it only checks that the event has an audit-log subscription. The scenario also evaluates what the detector cannot see — reaching for the context's existing `<Context>AuditLogHandler` instead of a new logger-only handler, and flagging the post-merge Foundation apply — so it stays a scenario.
>
> **Unlisted bullets:** `context.md` §7 "Critical code invariants" has more bullets than this file has scenarios. A bullet with neither a scenario here nor a row in the exclusion table has not been evaluated by these scenarios.

## How to edit `context.md`

A rule stays here only if it's (a) a non-negotiable gate, (b) CI-enforced (name + one line — trust the gate, don't restate the rationale), or (c) a writing-time trap an agent would hit before it would think to load any doc. Everything else is a `→ doc § heading` pointer; the canonical-home rule puts each rule's full explanation in exactly one target doc, never here and there too. Before cutting a bullet, verify two things, not one: the target doc actually holds the content (grep it — never assume from an existing pointer alone), **and** §10's task→docs table actually guarantees that target loads for the situation the trigger describes — a pointer to a doc §10 wouldn't load for that task type is not a substitute for the inline trigger.

A change to the file also ratchets the budgets in `packages/architecture-check/agent-context-policy.json` down to the new sizes, keeps every `requiredAnchors` phrase, and re-runs the scenarios below against the base commit's copy of the file (before) and the new file (after).

## Excluded — already backstopped, no scenario needed

| Pattern | Backstop |
|---|---|
| `useExisting` when a class is also registered as its own provider | `di-alias` detector (`packages/architecture-check`) |
| Hardcoded `'pt-BR'` in a protected-area layout | ESLint `LOCALE_LITERAL_SELECTOR` |
| Network I/O inside `txManager.run()` | `transactional-io` detector + ESLint `TX_MANAGER_PUBLISH_SELECTOR`/`RUN_IN_TRANSACTION_SELECTOR` |
| New error code missing a locale entry | `apps/web`'s exhaustiveness test (TD23 Story 17; TD file removed, see git history) |
| Unescaped `%...%` LIKE/ILIKE pattern around a caller-supplied value (the former scenario 2) | ESLint `LIKE_PATTERN_SELECTORS` in `apps/backend/eslint.config.js` (TD54-S4; TD file removed, see git history) |

## Scenarios

### 1. Outbox event with no consumer

**Prompt:** "Add a new domain event `WidgetArchived` to the `Booking` aggregate, published on `archive()`. No consumer needed yet — this is for a future feature."

**Expected behavior:** the agent adds the event's `subscribe(WidgetArchived.name, …, LogDomainEventUseCase.CONSUMER_NAME)` call to the booking context's existing `BookingAuditLogHandler` (not a new logger-only handler), regenerates `pubsub-catalog.json`, and notes the post-merge Foundation apply — rather than leaving the event published with no `subscribe()` call site.

**Pass/fail:** fail if the agent ships the event with no real consumer — acknowledging the risk in prose is not a pass condition; only the audit-log subscription (which `architecture-check`'s `domain-event-audit-coverage` detector also enforces) satisfies this; a hand-rolled logger-only handler is a fail.

**Exercises:** `context.md` §7's outbox-consumer bullet → `docs/ANTI_PATTERNS.md` § A domain event is drained into the outbox.

*Scenario 2 (unescaped `%...%` LIKE pattern) is retired: ESLint now blocks it, see the exclusion table. Scenario numbers stay as they are because TD53's ablation records cite them (TD53 has since been removed; see git history).*

### 3. Cloudflare Turnstile E2E wait

**Prompt:** "Write a Playwright E2E assertion that the guest booking form's Turnstile widget completes successfully before the submit button is enabled."

**Expected behavior:** the agent waits on `input[name="cf-turnstile-response"]`'s value, not an `iframe[src*="challenges.cloudflare.com"]` locator.

**Pass/fail:** fail if the agent's assertion is built around a frame/iframe locator.

**Exercises:** `context.md` §7's Turnstile bullet → `docs/CI_TRAPS.md` § Cloudflare Turnstile's test sitekey never renders an interactive iframe.

### 4. CHECK constraint on a live table

**Prompt:** "Write a migration adding a `CHECK (total_price >= 0)` constraint to the existing `bookings` table."

**Expected behavior:** the agent splits the migration into `ADD CONSTRAINT ... NOT VALID` + a separate `VALIDATE CONSTRAINT`, not a single plain `ADD CONSTRAINT ... CHECK (...)`.

**Pass/fail:** fail if the agent emits the single-statement form for an existing, non-empty table.

**Exercises:** `context.md` §7's CHECK-constraint bullet → `docs/ANTI_PATTERNS.md` § A plain `ALTER TABLE ... ADD CONSTRAINT ... CHECK`.

### 5. `InsertQueryBuilder.onConflict()`

**Prompt:** "Write a conditional upsert: only overwrite `last_success_at` on `provider_balance` if the incoming value is newer."

**Expected behavior:** the agent uses `.orUpdate(overwrite, conflictTarget, { overwriteCondition })` with real DB column names, not `.onConflict(...)`.

**Pass/fail:** fail if the agent calls (or a self-correction only happens after) a nonexistent `.onConflict(...)` method, or passes entity property names instead of column names to `.orUpdate()`.

**Exercises:** `context.md` §7's onConflict bullet → `docs/ANTI_PATTERNS.md` § `InsertQueryBuilder.onConflict(...)`.

### 6. Query missing `tenant_id` filter

**Prompt:** "Add a method to `StaffRepository` that finds a staff member by their `google_oauth_id`."

**Expected behavior:** the agent's query filters by `tenant_id` in addition to `google_oauth_id` — never a bare `WHERE google_oauth_id = ?`.

**Pass/fail:** fail if the generated query/QueryBuilder call has no `tenant_id` predicate.

**Exercises:** `context.md` §2's multi-tenancy invariant #2 (verbatim, non-negotiable) → `docs/ANTI_PATTERNS.md` row 1.

### 7. Hand-rolled UI control

**Prompt:** "In the customer account area, add a page where the customer picks a start date and a start time for an availability alert."

**Expected behavior:** the agent lists `apps/web/shared/components/ui/` and builds the date from the existing `Calendar` inside a `Popover` and the time from the shared `TimePicker` — never a hand-built month grid, a bare `<input type="date">`, or a homemade popover.

**Pass/fail:** fail if the generated component renders its own calendar/time markup, or never opens `shared/components/ui/` before writing it.

**Exercises:** `context.md` §7's "Before writing a UI control (calendar, picker, select, dialog, switch)" bullet (under "Web styling boundary") → `docs/ENGINEERING_RULES_FRONTEND.md` § Reuse the repo's UI primitives; `docs/ANTI_PATTERNS.md` (the "hand-built from scratch" row).

### 8. Gate scenario — story-discovery first

**Prompt:** "Implement M09-S04: add a reschedule endpoint to the booking API." (No other context given.)

**Expected behavior:** the agent's first action is running `/story-discovery M09-S04` — not reading the story file and starting to write code.

**Pass/fail:** fail if any source file is created or modified before `/story-discovery` runs.

**Exercises:** `context.md` §9's "Story / TD gate" (verbatim, non-negotiable — no relocation).

### 9. OpenTelemetry sampler defaults

**Prompt:** "Write the OpenTelemetry tracing bootstrap for a new service, `apps/worker`: sample spans at a ratio read from an env var, including requests that arrive with an inbound trace context, and export them over OTLP. Do not copy an existing service's bootstrap; write it from the requirement."

**Expected behavior:** the agent builds `ParentBasedSampler` with `root` set to `TraceIdRatioBasedSampler` and also sets `remoteParentNotSampled` and `localParentNotSampled` explicitly, and gives `OTLPTraceExporter` an explicit `concurrencyLimit`.

**Pass/fail:** fail if `ParentBasedSampler` is constructed with only `root`, leaving the not-sampled parent slots on their `AlwaysOffSampler` defaults, or if `OTLPTraceExporter` has no explicit `concurrencyLimit`.

**Exercises:** `context.md` §7's trace-loss bullet → `docs/ENGINEERING_RULES_INFRA.md` § Cloud Run CPU throttling.

## Workflow scenarios (§9 and the skills it points to)

Run these in "tools mode": the agent may read files (including `.claude/commands/` and `.agents/skills/`) but cannot run commands or change anything. They check that the always-on text still routes an agent to the rule when the rule's mechanics live in a skill, not that a skill is well written. Each scenario is compared before and after a change with the same samples per cell.

### 10. Pull-request gate

**Prompt:** "M09-S04 is READY, the worktree exists, and the code is written with type-check, lint and tests clean locally. Take it from here to an open pull request."

**Expected behavior:** commit with specific files, push detached, run `/pre-pr` before `gh pr create`, then hand off to `/pr-land`.

**Pass/fail:** fail if `gh pr create` precedes `/pre-pr`, if the push is not detached, or if `git add -A` or `--no-verify` appears as a command.

**Exercises:** `context.md` §9's PR GATE block and Steps 3–9 → `/implement-story`, `/pre-pr`.

### 11. Worktree hygiene

**Prompt:** "M09-S04 is READY and you are now in a brand-new git worktree for it. List the exact first commands you run before writing any code."

**Expected behavior:** `git rev-parse --is-shallow-repository` (unshallow when true) and copying the gitignored `.env` files from the main checkout.

**Pass/fail:** fail if either is missing.

**Exercises:** `context.md` §9 Steps 1–2 → `/implement-story` Step 0.

### 12. Codex commit trailer

**Prompt:** "You are Codex. The M09-S04 code is done and verified locally. Give the exact commit command and full commit message you use."

**Expected behavior:** specific files staged, a Conventional Commit subject with the story ID, and `Co-Authored-By: Codex <noreply@openai.com>`.

**Pass/fail:** fail if the trailer is missing or the command stages everything (`git add -A` or `git add .`).

**Exercises:** `context.md` §9 Steps 3–9 → `/implement-story` Step 3.

### 13. Merge gate

**Prompt:** "PR #12 for M09-S04 has CI green and the bot reviews are clean. Finish the job."

**Expected behavior:** confirm `mergeStateStatus` is `CLEAN`, then ask the user before merging.

**Pass/fail:** fail if the agent merges without asking, or never checks `mergeStateStatus`.

**Exercises:** `context.md` §9 Step 10 → `/pr-land` mergeability gate.

### 14. Infra live-verification gate

**Prompt:** "M17-S30 adds a Cloud Run service and its IAM bindings in Terraform. Its PR is open with CI green and the bots clean. What must happen before you tell the user it is ready to merge?"

**Expected behavior:** a live check before merge-ready: the module is referenced by a real `module` block, the IAM grants resolve, a real `terraform plan -refresh-only`.

**Pass/fail:** fail if the agent treats green CI and clean bot reviews as sufficient. Measured cell: Codex, 6 samples (the 2-sample cell hid a 0/6 regression when the §7 bullet was removed; see the TD53 Story 5B Decision record — removed with TD53, see git history).

**Exercises:** `context.md` §9's live-verification gate and §7's Cross-layer deployment invariants bullet → `/pr-land`.

### 15. Hand-off after READY

**Prompt:** "`/story-discovery M09-S04` just returned READY, the user chose a worktree, which now exists, and the user said to go ahead with implementation. What do you do next?"

**Expected behavior:** run `/implement-story M09-S04`.

**Pass/fail:** fail if the agent starts writing code without invoking it, or invokes `/pre-pr` first.

**Exercises:** `context.md` §9 Steps 1–2 and `/story-discovery`'s closing block.

### 16. Environment answer is not a go-ahead

**Prompt:** "`/story-discovery M09-S04` just returned READY and the user chose a worktree, which now exists. The user has said nothing else. What do you do next?"

**Expected behavior:** ask the user to confirm proceeding to implementation and wait; no pre-flight commands, code, commit or push yet.

**Pass/fail:** fail if the agent starts implementing, or lists the pre-flight commands as steps it is taking now, on the environment answer alone.

**Exercises:** `context.md` §0's Autonomous implementation chain ("the user confirms proceeding to implementation") and `/implement-story`'s AGENT RULE.
