Run the pre-PR checklist against the current branch. This is the mandatory gate before opening any PR. Do not open the PR until this reports zero issues.

---

## Step 1 — Script checks (automated)

Run:
```bash
bash scripts/pre-pr.sh
```

This single call covers checks 1, 5, 6, 7, 11, 12, 14, 15, 16, 17, 18, W1 (web vitest setup entrypoint) and domain-audit checks DA-2, DA-3, DA-4, DA-5, DA-7.

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

## Step 3 — Agent checks (require reading changed files)

Every numbered check below belongs to this project's master checklist (#1–#20; **#9 was retired** — its content was folded into #10, and the number was never reassigned, so don't go looking for it). Items covered by the script in Step 1 are not repeated here:

| # | Check | Covered in |
|---|---|---|
| 1, 5, 6, 7, 11, 12, 14–18, W1 | grep/file-existence checks (HTTP imports, infra tokens, `any`, Zod v3, `.spec.ts`, DI registration, `.skip`/`.only`, `console.*`, barrels, vitest setup entrypoint) | Step 1 (script) |
| 2 | Multi-aggregate writes wrapped in `ITransactionManager.run()` | Step 3 below |
| 3 | Every new REST endpoint has a `.http` request block | Step 3 below |
| 4 | Every public controller/service method has an explicit return type | Step 3 below |
| 8 | `@Global()` modules have an explanatory comment | Step 3 below |
| 9 | _retired — folded into #10_ | — |
| 10 | Aggregate fields use VO types; getters return the VO (also subsumes domain-audit `DA-1`) | Step 3 below |
| 13 | Static routes declared before dynamic routes | Step 3 below |
| 19 | PATCH body schemas with all-optional fields use `.default({})` | Step 3 below |
| 20 | Integration test setup steps only call implemented endpoints | Step 3 below |
| 21 | All new `<Image fill>` in changed `.tsx` files have a `sizes` prop | Step 3 below |

Domain-audit checks `DA-2`–`DA-5` and `DA-7` run mechanically in Step 1; `DA-6` requires agent reasoning and is listed below. `DA-1` is covered by #10 (see that entry) — not repeated as its own item.

Read the changed files once, then check all of the following.

### 2. Multi-aggregate writes wrapped in ITransactionManager.run()

Read each changed use case file (`*.use-case.ts`). If it calls `save()` on two or more different repositories, verify all saves are inside a `txManager.run(async () => { … })` call.

### 3. Every new REST endpoint has a .http request block

For every new `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` route in changed controller files, check that a corresponding block exists in `apps/backend/http/<context>/<resource>.http`. The block must cover the happy path AND at least the main error cases.

### 4. Every public controller and service method has an explicit return type

Check changed `*.controller.ts` and `*.service.ts` files for public methods missing `: Promise<...>` or `: Type` return annotations.

### 8. @Global() modules have an explanatory comment

For each `@Global()` occurrence in changed `*.module.ts` files, verify the line or a nearby comment explains why it is global and where it is imported.

### 10. Aggregate fields use VO types; getters return the VO (subsumes DA-1)

Read changed `*.aggregate.ts` files. Check that:
- Props interfaces use VO types — not `string` or `number` — for known VO candidates:
  - `email` → `Email`
  - `phone` → `PhoneNumber`
  - `slug` → `Slug`
  - `timezone` → `Timezone`
  - `color` / `primary_color` / `accent_color` → `HexColor`
  - `open` / `close` / `opens_at` / `closes_at` (in business-hours-like structures) → `TimeOfDay`
- Getter return types match the VO (e.g. `get email(): Email`, not `get email(): string`)

This is the changed-files version of domain-audit `DA-1`; the full-codebase scan still runs via `/domain-audit`.

### 13. Static routes declared before dynamic routes in the same controller

Read changed controller files. Verify that all `@Get('literal-path')` decorators appear before any `@Get(':param')` decorators in declaration order within each controller class.

### DA-6. No utility functions duplicated outside src/shared/utils/

Grep for duplicated implementations — do not rely on reading alone. Check for:
- `deepMerge` implemented inline (not imported from `src/shared/utils/deep-merge`)
- Function bodies that re-implement string trimming, digit-stripping, or format conversion already in a shared VO or util

### 19. PATCH body schemas with all-optional fields use `.default({})`

For every new `@Patch` route in changed controller files, find the corresponding Zod body schema. If all fields are optional (or the body itself is optional), verify the schema ends with `.default({})`.

**Why:** `ZodValidationPipe` receives `undefined` when no body is sent. Without `.default({})` the schema rejects it with 400, silently breaking component and integration tests that omit the body — unit tests pass because they call the method directly.

### 20. Integration test setup steps only call implemented endpoints

For every new block in `*.integration.spec.ts`, collect all routes called as **setup steps** (i.e., not the primary subject of the `it()` block — e.g. a `PATCH /approve` called to put a booking in APPROVED state before testing cancel). Verify each one has a corresponding `@Get/@Post/@Patch/@Delete` decorator in the controller. Flag any route used as a setup step that does not exist yet.

**Why:** The pre-push hook runs unit tests only. A missing endpoint returns 404 and silently corrupts the setup chain — the `it()` block then fails for the wrong reason. Only caught in CI.

### 21. All new `<Image fill>` components have a `sizes` prop (web only)

For every changed `.tsx` file in `apps/web/`, read the file and verify that every `<Image` with the `fill` prop also specifies a `sizes` prop. A missing `sizes` causes Next.js to omit responsive srcsets, forces the browser to always download the full-resolution image, and emits a runtime warning.

Common values:
- Full-width background/hero: `sizes="100vw"`
- Half-column (two-column layout): `sizes="(min-width: 640px) 50vw, 100vw"`
- Card thumbnail / third-column: `sizes="(min-width: 768px) 33vw, 100vw"`

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

> **HARD RULE: STOP. Do not open the PR yet.** Ask the user exactly this:

> ⚠️ **Integration test gate — required before PR**
>
> All automated checks passed. The pre-push hook only runs unit tests, so integration tests must be verified manually before opening the PR.
>
> Please run:
> ```bash
> { pnpm --filter @beloauto/backend test:integration && pnpm --filter @beloauto/bff test:component; } 2>&1 | tail -50
> ```
> Paste the output here. I will open the PR only after you confirm it passes.

Wait for the user's response. Open the PR **only** if:
1. The pasted output shows `Test Suites: X passed, X total` with 0 failed suites and 0 failed tests.
2. The user explicitly says to proceed.

Output when waiting:
```
### Step 4 — Integration test gate
⏸ WAITING — paste `{ pnpm --filter @beloauto/backend test:integration && pnpm --filter @beloauto/bff test:component; } 2>&1 | tail -50` output to proceed
```

Output when gate clears:
```
### Step 4 — Integration test gate
✅ PASS — integration tests confirmed by user
```

Once Step 4 clears, open the PR following the template in CLAUDE.md §9 Step 8.
