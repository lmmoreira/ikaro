Run the pre-PR checklist against the current branch. This is the mandatory gate before opening any PR. Do not open the PR until this reports zero issues.

---

## Step 1 — Script checks (automated)

Run:
```bash
bash scripts/pre-pr.sh
```

This single call covers checks 1, 5, 6, 7, 11, 12, 14, 15, 16, 17, 18 (backend + bff + web tsx), W1 (vitest setup entrypoint), WEB-1/WEB-4/WEB-6 (web), and bad-smell-audit backend checks BE-2–BE-5, BE-7.

If the script exits with issues, fix them and re-run before continuing. Do not proceed to Step 2 with script failures outstanding.

---

## Step 2 — Compiler checks (compact output)

Identify which apps have changed files (`apps/backend/`, `apps/bff/`, `apps/web/`). Fire all relevant commands in parallel — multiple Bash calls in a single response, one per app. Do not wait for one to finish before starting the next.

```bash
# backend
pnpm --filter @ikaro/backend run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @ikaro/backend run lint 2>&1 | grep -E ' error ' | head -20

# bff (if changed)
pnpm --filter @ikaro/bff run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @ikaro/bff run lint 2>&1 | grep -E ' error ' | head -20

# web (if changed)
pnpm --filter @ikaro/web run type-check 2>&1 | grep -E 'error TS' | head -20
pnpm --filter @ikaro/web run lint 2>&1 | grep -E ' error ' | head -20
```

Empty output = clean. Any `error TS` line = failure; report it and stop.

---

## Step 3 — Agent checks (require reading changed files)

Read the changed files once, then check all of the following. Script checks from Step 1 are not repeated here.

### 2. Multi-aggregate writes wrapped in ITransactionManager.run()

Read each changed use case file (`*.use-case.ts`). If it calls `save()` on two or more different repositories, verify all saves are inside a `txManager.run(async () => { … })` call.

### 3. Every new REST endpoint has a .http request block

For every new `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` route in changed controller files, check that a corresponding block exists in `apps/backend/http/<context>/<resource>.http` (backend) or `apps/bff/http/<module>/<resource>.http` (BFF). The block must cover the happy path AND at least the main error cases.

### 4. Every public controller and service method has an explicit return type

Check changed `*.controller.ts` and `*.service.ts` files (backend and BFF) for public methods missing `: Promise<...>` or `: Type` return annotations.

### 8. @Global() modules have an explanatory comment

For each `@Global()` occurrence in changed `*.module.ts` files, verify the line or a nearby comment explains why it is global and where it is imported.

### 10. Aggregate fields use VO types; getters return the VO (subsumes BE-1)

Read changed `*.aggregate.ts` files. Check that:
- Props interfaces use VO types — not `string` or `number` — for known VO candidates:
  - `email` → `Email`
  - `phone` → `PhoneNumber`
  - `slug` → `Slug`
  - `timezone` → `Timezone`
  - `color` / `primary_color` / `accent_color` → `HexColor`
  - `open` / `close` / `opens_at` / `closes_at` (in business-hours-like structures) → `TimeOfDay`
- Getter return types match the VO (e.g. `get email(): Email`, not `get email(): string`)

This is the changed-files version of bad-smell-audit `BE-1`; the full-codebase scan (all layers) still runs via `/bad-smell-audit`.

### 13. Static routes declared before dynamic routes in the same controller

Read changed controller files. Verify that all `@Get('literal-path')` decorators appear before any `@Get(':param')` decorators in declaration order within each controller class.

### BE-6. No utility functions duplicated outside src/shared/utils/

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

### WEB-1. Verify dangerouslySetInnerHTML sanitization (web only)

If the script flagged any `dangerouslySetInnerHTML` occurrences in changed files, read those files and verify the value passed to `__html` is sanitized before use (e.g. `DOMPurify.sanitize()` or equivalent). Passing raw, un-sanitized input is an XSS vulnerability.

### WEB-2. Non-`readonly` props in changed React components (SonarCloud S6759, web only)

For changed `*.tsx` files in `apps/web/components/`, find `interface` or `type` declarations used as component props (the function parameter type or `React.FC` first type argument). Report any field not marked `readonly`. Every field in a component props interface must be `readonly`.

### Full-codebase coverage (advisory)

The checks above target **changed files only**. BFF structural checks (BFF-1–BFF-4) and web checks beyond WEB-1/WEB-4/WEB-6 (e.g. WEB-2 on unchanged components, WEB-3, WEB-5, WEB-7) are only caught by the full-codebase scan. For PRs that touch BFF or web broadly, also run:

```
/bad-smell-audit bff    # BFF structure scan
/bad-smell-audit web    # full web scan
```

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

The user has authorized autonomous execution of this step. Run the tests directly — do not ask for permission or request the user to paste output.

```bash
{ pnpm --filter @ikaro/backend test:integration && pnpm --filter @ikaro/bff test:component; } 2>&1 | tail -50
```

Use a 600 000 ms timeout (10 min). Integration tests are slow.

**If all tests pass** (`Test Suites: X passed, X total` — 0 failed suites, 0 failed tests) → proceed immediately to open the PR following CLAUDE.md §9 Step 8.

**If any test fails** → report the failing suite and test names, do NOT open the PR, and wait for user guidance.

```
### Step 4 — Integration tests
✅ PASS — X suites, Y tests → opening PR
```
or:
```
### Step 4 — Integration tests
❌ FAIL — [failing test names]
Blocked: fix failures before opening the PR.
```
