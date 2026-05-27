Run the pre-PR checklist against the current branch. This is the mandatory gate before opening any PR. Do not open the PR until this reports zero issues.

---

## Step 1 — Script checks (automated)

Run:
```bash
bash scripts/pre-pr.sh
```

This single call covers checks 1, 5, 6, 7, 11, 12, 14, 15, 16, 17, 18 and domain-audit checks DA-2, DA-3, DA-4, DA-5.

If the script exits with issues, fix them and re-run before continuing. Do not proceed to Step 2 with script failures outstanding.

---

## Step 2 — Compiler checks (compact output)

Identify which apps have changed files (`apps/backend/`, `apps/bff/`, `apps/web/`) and run only the relevant ones.

```bash
# backend
pnpm --filter @beloauto/backend run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @beloauto/backend run lint 2>&1 | grep -E ' error ' | head -20

# bff (if changed)
pnpm --filter @beloauto/bff run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @beloauto/bff run lint 2>&1 | grep -E ' error ' | head -20

# web (if changed)
pnpm --filter @beloauto/web run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @beloauto/web run lint 2>&1 | grep -E ' error ' | head -20
```

Empty output = clean. Any `error TS` line = failure; report it and stop.

---

## Step 3 — Agent checks (semantic — cannot be automated)

Read the changed files once, then check all of the following.

### 2. Multi-aggregate writes wrapped in ITransactionManager.run()

Read each changed use case file (`*.use-case.ts`). If it calls `save()` on two or more different repositories, verify all saves are inside a `txManager.run(async () => { … })` call.

### 3. Every new REST endpoint has a .http request block

For every new `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` route in changed controller files, check that a corresponding block exists in `apps/backend/http/<context>/<resource>.http`. The block must cover the happy path AND at least the main error cases.

### 4. Every public controller and service method has an explicit return type

Check changed `*.controller.ts` and `*.service.ts` files for public methods missing `: Promise<...>` or `: Type` return annotations.

### 8. @Global() modules have an explanatory comment

For each `@Global()` occurrence in changed `*.module.ts` files, verify the line or a nearby comment explains why it is global and where it is imported.

### 10. Aggregate fields use VO types; getters return the VO

Read changed `*.aggregate.ts` files. Check that:
- Props interfaces use VO types (`Email`, `PhoneNumber`, `Slug`, `Timezone`, `HexColor`, `TimeOfDay`) — not `string` or `number`
- Getter return types match the VO (e.g. `get email(): Email`, not `get email(): string`)

### 13. Static routes declared before dynamic routes in the same controller

Read changed controller files. Verify that all `@Get('literal-path')` decorators appear before any `@Get(':param')` decorators in declaration order within each controller class.

### DA-1. Aggregate props not typed as plain primitives

Look for `Props` interfaces inside changed `*/domain/*.aggregate.ts` files. Report any field that matches a known VO candidate but is typed as `string` or `number`:
- `email: string` → should be `Email`
- `phone: string` → should be `PhoneNumber`
- `slug: string` → should be `Slug`
- `timezone: string` → should be `Timezone`
- `color`/`primary_color`/`accent_color: string` → should be `HexColor`
- `open`/`close`/`opens_at`/`closes_at: string` in business hours structures → should be `TimeOfDay`

### DA-6. No utility functions duplicated outside src/shared/utils/

Check for:
- `deepMerge` implemented inline (not imported from `src/shared/utils/deep-merge`)
- Function bodies that re-implement string trimming, digit-stripping, or format conversion already in a shared VO or util

### 19. PATCH body schemas with all-optional fields use `.default({})`

For every new `@Patch` route in changed controller files, find the corresponding Zod body schema. If all fields are optional (or the body itself is optional), verify the schema ends with `.default({})`.

**Why:** `ZodValidationPipe` receives `undefined` when no body is sent. Without `.default({})` the schema rejects it with 400, silently breaking component and integration tests that omit the body — unit tests pass because they call the method directly.

### 20. Integration test setup steps only call implemented endpoints

For every new block in `*.integration.spec.ts`, collect all routes called as **setup steps** (i.e., not the primary subject of the `it()` block — e.g. a `PATCH /approve` called to put a booking in APPROVED state before testing cancel). Verify each one has a corresponding `@Get/@Post/@Patch/@Delete` decorator in the controller. Flag any route used as a setup step that does not exist yet.

**Why:** The pre-push hook runs unit tests only. A missing endpoint returns 404 and silently corrupts the setup chain — the `it()` block then fails for the wrong reason. Only caught in CI.

---

## Output format

```
## Pre-PR Checklist — <branch name>

### Step 1 — script
✅ PASS — 0 issues

### Step 2 — type-check + lint
✅ PASS — backend clean, bff clean

### Step 3 — agent checks
#### 2. txManager.run()
✅ PASS

#### 3. .http blocks
❌ FAIL — PATCH /bookings/:id/approve has no .http block

...

---
Total issues: N
```

If all Step 1–3 checks pass, output:
```
✅ Steps 1–3 passed — 0 issues. Proceeding to Step 4.
```

---

## Step 4 — Integration test gate (MANDATORY — blocks PR open)

Check whether the branch has any new or modified test blocks inside `*.integration.spec.ts` files.

**If yes — STOP. Do not open the PR yet.** Ask the user exactly this:

> ⚠️ **Integration test gate — required before PR**
>
> All automated checks passed. The pre-push hook only runs unit tests, so integration tests must be verified manually before opening the PR.
>
> Please run:
> ```bash
> pnpm --filter @beloauto/backend test:integration 2>&1 | tail -30
> ```
> Paste the output here. I will open the PR only after you confirm it passes.

Wait for the user's response. Open the PR **only** if:
1. The pasted output shows `Test Suites: X passed, X total` with 0 failed suites and 0 failed tests.
2. The user explicitly says to proceed.

**If no `*.integration.spec.ts` files were touched**, skip this step and proceed directly to opening the PR.

Output when gate triggers:
```
### Step 4 — Integration test gate
⏸ WAITING — paste `pnpm --filter @beloauto/backend test:integration` output to proceed
```

Output when gate is skipped:
```
### Step 4 — Integration test gate
⏭ SKIP — no integration test files changed
```

Output when gate clears:
```
### Step 4 — Integration test gate
✅ PASS — integration tests confirmed by user
```
