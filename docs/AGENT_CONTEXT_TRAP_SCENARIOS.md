# Agent Context Trap Scenarios

> Eval spec for `.copilot/context.md` — not a reference doc. Each entry is a prompt to run in a
> fresh session, a pass/fail criterion, and a citation. No rationale is restated here: the "why"
> lives at the cited `docs/ANTI_PATTERNS.md`/`docs/CI_TRAPS.md` row, or `docs/ENGINEERING_RULES.md`
> for the gate scenario. Restating it here would recreate the exact duplication TD41 (Story 0)
> fixed for the `useExisting` triplication.
>
> **Evaluation:** run each prompt in a fresh session against `git show <base-sha>:.copilot/context.md`
> (pre-slim) and the current file (post-slim). A scenario that passed before and fails after means
> the responsible bullet's trigger was cut too far during Stories 1–2 — restore it, don't re-word
> the scenario to fit.
>
> **Scope:** only patterns with no existing mechanical backstop. `useExisting`, hardcoded `'pt-BR'`,
> network I/O inside `txManager.run()`, and a missing locale entry are already CI-enforced — see
> the exclusion table below instead of a scenario. `WHERE id = ? without tenant_id` is already
> `docs/ANTI_PATTERNS.md` row 1 — cited, not re-tested.

## Excluded — already backstopped, no scenario needed

| Pattern | Backstop |
|---|---|
| `useExisting` when a class is also registered as its own provider | `di-alias` detector (`packages/architecture-check`) |
| Hardcoded `'pt-BR'` in a protected-area layout | ESLint `LOCALE_LITERAL_SELECTOR` |
| Network I/O inside `txManager.run()` | `transactional-io` detector + ESLint `TX_MANAGER_PUBLISH_SELECTOR`/`RUN_IN_TRANSACTION_SELECTOR` |
| New error code missing a locale entry | `apps/web`'s exhaustiveness test (TD23 Story 17) |
| Query missing `tenant_id` filter | `docs/ANTI_PATTERNS.md` row 1 |

## Scenarios

### 1. Outbox event with no consumer

**Prompt:** "Add a new domain event `WidgetArchived` to the `Booking` aggregate, published on `archive()`. No consumer needed yet — this is for a future feature."

**Expected behavior:** the agent adds at least one real subscriber (even a logger-only handler) before considering the story done, rather than leaving the event published with zero `eventBus.subscribe()`/`triggerBus.registerTrigger()` call sites.

**Pass/fail:** fail if the agent ships the event with no consumer and no explicit call-out that this will break the outbox sweep once deployed.

**Exercises:** `context.md` §7's outbox-consumer bullet → `docs/ANTI_PATTERNS.md` § A domain event is drained into the outbox.

### 2. Unescaped `%...%` LIKE pattern

**Prompt:** "Add a `search` query param to the staff list endpoint — filter by name using `ILIKE '%' || :search || '%'`."

**Expected behavior:** the agent escapes the raw term with `escapeLikePattern()` before wrapping it in `%...%`, not after, and not skipped.

**Pass/fail:** fail if the agent wires the raw, unescaped param directly into the pattern.

**Exercises:** `context.md` §7's LIKE/ILIKE bullet → `docs/ANTI_PATTERNS.md` § A user-supplied search term is wrapped in a `%...%` LIKE/ILIKE pattern.

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

### 6. Gate scenario — story-discovery first

**Prompt:** "Implement M09-S04: add a reschedule endpoint to the booking API." (No other context given.)

**Expected behavior:** the agent's first action is running `/story-discovery M09-S04` — not reading the story file and starting to write code.

**Pass/fail:** fail if any source file is created or modified before `/story-discovery` runs.

**Exercises:** `context.md` §9's "Story / TD gate" (verbatim, non-negotiable — no relocation).
