Run the pre-PR checklist against the current branch. This is the mandatory gate — run it **once** when the story implementation is complete. If a PR is already open for this branch, this skill exits immediately.

> **AGENT RULE:** Never invoke this skill autonomously. Ask the user: *"I believe the story is complete — may I run /pre-pr?"* Wait for explicit yes before starting.

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
If there are staged or modified files → list all of them and apply the commit gate:

*"Here are the files I'm about to commit: [list]. Anything else to add before I commit?"*

Wait for explicit yes, then commit with specific file names (never `git add -A`). Follow the commit format from CLAUDE.md §9.

---

## Step 1 — Script checks (automated)

Run:
```bash
bash scripts/pre-pr.sh
```

This covers: checks 1, 5, 6, 7, 11, 12, 14, 15, 16, 17, 18, 22–27; W1; WEB-1/WEB-4/WEB-5/WEB-6/WEB-7; E2E-1/E2E-2/E2E-3; BE-2–BE-5/BE-7 (changed files only).

If the script exits with issues, fix them and re-run. Do not proceed to Step 2 with script failures outstanding.

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

---

## Step 3b — bad-smell-audit (mandatory, per changed layer)

Identify which layers have changed files, then invoke bad-smell-audit for each in parallel:

```
apps/backend/ changed  →  /bad-smell-audit backend
apps/bff/ changed      →  /bad-smell-audit bff
apps/web/ changed      →  /bad-smell-audit web
```

Wait for all invocations to complete before continuing. Any FAIL from bad-smell-audit blocks Step 4.

---

## Step 4 — Unit tests + coverage gate (85%)

Run unit tests with coverage for each changed app — in parallel:

```bash
# backend (if changed)
pnpm --filter @ikaro/backend test --coverage 2>&1 | tail -80

# web (if changed)
pnpm --filter @ikaro/web test --coverage 2>&1 | tail -80
```

Use a 300 000 ms timeout. After tests complete:

1. Parse the coverage table from the output.
2. For each changed production file (exclude `*.spec.ts`, `*.spec.tsx`, test helpers), find its row in the table.
3. Flag any file where **% Lines < 85%** as a coverage failure.
4. If the overall summary row shows < 85%, also flag it.

**If coverage fails** → report file names and current percentages. Do NOT proceed to Step 5 — fix the tests first.

```
### Step 4 — Unit tests + coverage
✅ PASS — all suites green; all changed files ≥ 85%
```
or:
```
### Step 4 — Unit tests + coverage
❌ FAIL — coverage below 85%:
  apps/backend/src/contexts/booking/application/cancel-booking.use-case.ts — 72% lines
```

---

## Step 5 — Integration tests (autonomous)

```bash
{ pnpm --filter @ikaro/backend test:integration && pnpm --filter @ikaro/bff test:component; } 2>&1 | tail -50
```

Use a 600 000 ms timeout (10 min).

```
### Step 5 — Integration tests
✅ PASS — X suites, Y tests
```
or:
```
### Step 5 — Integration tests
❌ FAIL — [failing suite and test names]
Blocked: fix failures before opening the PR.
```

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
Step 4   coverage            ✅  all changed files ≥ 85%
Step 5   integration tests   ✅  X suites, Y tests

---
Total issues: 0
```

**If all steps pass**, ask the user:
> "All pre-PR checks passed — shall I open the PR now?"

Wait for explicit yes before running `gh pr create` (per CLAUDE.md §9 Step 8).

**If any step failed**, list the blocking issues and stop. Do not open the PR.
