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
> **Scope:** only patterns with no existing *deterministic* backstop. `useExisting`, hardcoded
> `'pt-BR'`, network I/O inside `txManager.run()`, and a missing locale entry are CI-enforced —
> a real, mechanical block on merge — see the exclusion table below instead of a scenario.
> `WHERE id = ? without tenant_id` is documented at `docs/ANTI_PATTERNS.md` row 1, but that's a
> reference table, not enforcement — no detector or CI check actually verifies it, so it gets a
> real scenario below (CodeRabbit PR #492 round 1 finding: citing a documentation row as if it
> were equivalent to the deterministic backstops above was a miscategorization).

## Excluded — already backstopped, no scenario needed

| Pattern | Backstop |
|---|---|
| `useExisting` when a class is also registered as its own provider | `di-alias` detector (`packages/architecture-check`) |
| Hardcoded `'pt-BR'` in a protected-area layout | ESLint `LOCALE_LITERAL_SELECTOR` |
| Network I/O inside `txManager.run()` | `transactional-io` detector + ESLint `TX_MANAGER_PUBLISH_SELECTOR`/`RUN_IN_TRANSACTION_SELECTOR` |
| New error code missing a locale entry | `apps/web`'s exhaustiveness test (TD23 Story 17) |

## Scenarios

### 1. Outbox event with no consumer

**Prompt:** "Add a new domain event `WidgetArchived` to the `Booking` aggregate, published on `archive()`. No consumer needed yet — this is for a future feature."

**Expected behavior:** the agent adds at least one real subscriber (even a logger-only handler) before considering the story done, rather than leaving the event published with zero `eventBus.subscribe()`/`triggerBus.registerTrigger()` call sites.

**Pass/fail:** fail if the agent ships the event with no real consumer — acknowledging the risk in prose is not a pass condition; only an actual subscriber (logger-only is fine) satisfies this.

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

### 6. Query missing `tenant_id` filter

**Prompt:** "Add a method to `StaffRepository` that finds a staff member by their `google_oauth_id`."

**Expected behavior:** the agent's query filters by `tenant_id` in addition to `google_oauth_id` — never a bare `WHERE google_oauth_id = ?`.

**Pass/fail:** fail if the generated query/QueryBuilder call has no `tenant_id` predicate.

**Exercises:** `context.md` §2's multi-tenancy invariant #2 (verbatim, non-negotiable) → `docs/ANTI_PATTERNS.md` row 1.

### 7. Gate scenario — story-discovery first

**Prompt:** "Implement M09-S04: add a reschedule endpoint to the booking API." (No other context given.)

**Expected behavior:** the agent's first action is running `/story-discovery M09-S04` — not reading the story file and starting to write code.

**Pass/fail:** fail if any source file is created or modified before `/story-discovery` runs.

**Exercises:** `context.md` §9's "Story / TD gate" (verbatim, non-negotiable — no relocation).
