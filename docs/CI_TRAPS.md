# CI Traps — Ikaro

> Failures this project repeatedly produces in CI and SonarCloud.
> Check your code against this list before the first commit — fixing pre-push is much cheaper than fixing post-push.

---

## SonarCloud violations (block CI)

These are flagged as bugs/code smells and cause the Quality Gate to fail.

| Rule | Wrong ❌ | Correct ✅ |
|------|---------|-----------|
| **S1940** Negated condition | `dto.x !== undefined ? dto.x : fallback` | `dto.x ?? fallback` |
| **S1940** Negated condition (nullable) | `dto.x !== undefined ? dto.x : existing` | `dto.x === undefined ? existing : dto.x` (flip branch) |
| **S3358** Nested ternary | `a ? b ? c : d : e` | flat `if / else if / else` block |
| **S6582** Optional chain | `x && x.y` | `x?.y` |
| **S1788** Default param order | `fn(required, optional = 1, second: string)` | `fn(required, second: string, optional = 1)` |
| **S1874** Deprecated React submit event type | `FormEvent<HTMLFormElement>` in a submit handler | `SubmitEvent<HTMLFormElement>` |
| **S2933** Member never reassigned | `private props: XxxProps` · `private updatedAt = new Date()` | `private readonly props: XxxProps` · `private readonly updatedAt = new Date()` |
| **Duplicate class** | `StaffInvited` defined in both `staff/` and `platform/` | event lives in the **publishing** context only |
| **Unused variable** | `const _x = ...` | remove it entirely |
| **S2699** No assertion in test | Integration test that uses only supertest's `.expect(403)` — SonarCloud does not recognise chained supertest `.expect()` as a Jest assertion | Capture the response (`const res = await request(...).set(...)`) then add `expect(res.status).toBe(403)` |
| **void operator** | `void tenantId;` to suppress an unused-parameter warning | Use an underscore prefix: `_tenantId` in the method signature |
| **S7776** Array membership check on a fixed set | `const MODULE_TYPES: readonly T[] = [...]; MODULE_TYPES.includes(x)` | `const MODULE_TYPES: ReadonlySet<T> = new Set([...]); MODULE_TYPES.has(x)` |

**S2933 appears in two recurring spots:**
- **Aggregate `props` field** — `private props: XxxProps` set once in the constructor, then its *contents* mutate via `increment()` / `decrement()`. `readonly` applies to the reference, not the object's internals — this is always safe to add.
- **Builder fields without a `withXxx()` setter** — any field you initialise but never provide a fluent setter for is effectively final. Add `readonly`; if you later need a setter, the compiler will stop you.

---

## Zod v4 format (block CI via ESLint/SonarCloud)

| Wrong ❌ | Correct ✅ |
|---------|-----------|
| `z.string().uuid()` | `z.uuid()` |
| `z.string().email()` | `z.email()` |
| `z.string().url()` | `z.url()` |

The chained forms are deprecated in Zod v4. ESLint and SonarCloud both flag them.

---

## Prettier violations (block CI)

| Trap | Details |
|------|---------|
| Line > 80 chars | Prettier enforces 80-char max — break chained calls at each `.` |
| Import not sorted | Prettier/ESLint auto-orders imports — don't manually reorder |
| Trailing comma missing | Prettier adds trailing commas in multi-line — let it |

Run `pnpm prettier --write .` locally before committing. Never fix Prettier issues by hand — re-run the formatter.

---

## TypeScript strict violations (block CI via `tsc --noEmit`)

| Pattern | Problem | Fix |
|---------|---------|-----|
| `as any` | Banned by `strict: true` | Use proper type or `as unknown as T` with a justification comment |
| `@ts-ignore` | Banned | Fix the underlying type error |
| Passing `AddressProps` where `Address` VO is expected | Type mismatch | Use `Address.create({ ...dto.address, complement: dto.address.complement ?? undefined })` |
| `complement: string \| null \| undefined` passed to VO | VO `create()` expects `string \| undefined` | Normalise: `complement: dto.complement ?? undefined` |
| `testAddress()` return type | Returns `AddressProps` (plain object), not `Address` VO | Pass directly to use case DTO; don't pass to `Address.create()` |

---

## NestJS DI failures (crash at integration test startup)

These appear as `Nest can't resolve dependencies of XxxUseCase (?, ...)` in test output.

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| `Nest can't resolve IEventBus` | `EventBusModule` missing from integration app | Add `EventBusModule` to `imports[]` in the integration app helper |
| `Nest can't resolve ITransactionManager` | `TransactionManagerModule` missing | Add `TransactionManagerModule` |
| `Cannot read properties of undefined` (reading `tenantId`) | `RequestModule` missing from the **context module** — not just the test app | Add `RequestModule` to the context's own `xxx.module.ts` `imports[]` |
| `Nest can't resolve IXxxRepository` | `{ provide: XXX_REPOSITORY, useClass: TypeOrmXxxRepository }` missing from `providers[]` | Add the provider entry to the module |
| TypeORM entity not registered | Entity class not in `entities[]` of `TypeOrmModule.forRoot` | Add entity to the integration app's `forRoot` entity list |
| `ProvisionTenantUseCase` DI crash | `EventBusModule` missing — `PlatformModule` always needs it | Add `EventBusModule` + `.overrideProvider(EVENT_BUS).useValue(new InMemoryEventBus())` |

---

## Integration test runtime failures

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Pub/Sub idempotency: `newCount > countBeforeRedeliver` fails randomly | Parallel integration tests publish same-named events on shared subscriptions | Scope the dispatcher filter to **both** `templateKey` AND `m.to === specificEmail` |
| Slug uniqueness constraint on second tenant | Fixed slug reused across runs | Append `uuidv7()` to slug: `` `prefix-${uuidv7()}` `` |
| `googleOAuthId` UNIQUE constraint violated | Fixed string reused in `beforeEach` across multiple runs | Use `uuidv7()` for generated IDs — never `Date.now()` or a fixed string |
| Aggregate-count assertion flakes | Shared `tenantAId` collects rows from other `it()` blocks | Use an inline unique `tenantId` per `it()` for count-sensitive assertions |
| `PLATFORM_ADMIN_KEY` rejected | Key < 32 chars | Use a ≥ 32-char string (e.g. a UUID literal `'xxx-integ-key-00000000-0000-4000'`) |
| `waitFor` timeout on async assertion | Pub/Sub handler not triggered or test app missing subscription | Ensure `EventBusModule` is imported without override in story integration specs |
| Native booking action sheets render in the top-left corner instead of centered, or tests fail to find the dialog/button roles after switching to `<dialog>` | The component was changed to a native dialog but never calls `showModal()`, or the jsdom test harness does not mock `HTMLDialogElement.prototype.showModal` / `close` | Keep the modal controlled with `showModal()`/`close()` and an inner layout wrapper. In Vitest, define `showModal` and `close` on `HTMLDialogElement.prototype` before rendering, and prefer `getByRole('dialog', { hidden: true })` if jsdom does not expose the accessible name the same way the browser does |
| PATCH endpoint returns 400 instead of expected status in component/integration test | Zod body schema has all-optional fields but no `.default({})` — `ZodValidationPipe` receives `undefined` when body is omitted | Add `.default({})` at the end of every `z.object({…})` used on a PATCH endpoint where the body is optional. Pattern: `z.object({ reason: z.string().min(1).optional() }).default({})` |
| Setup step in integration test returns 404, causing the actual assertion to fail for wrong reason | Integration test chains through a `PATCH/POST` endpoint that is not yet implemented | Before writing integration test blocks, verify every setup-step endpoint exists: `grep -n "@Patch\|@Post\|@Get\|@Delete" <context>.controller.ts` |
| `FetchError: connect ECONNREFUSED 127.0.0.1:4443` in booking or notification integration tests (even for suites unrelated to GCS) | `StorageModule` registered adapter with `useExisting`, which adds a standalone class provider that is instantiated even when `STORAGE_SERVICE` is overridden; `onApplicationBootstrap()` then tries to reach the GCS emulator | Use `useClass` in `StorageModule` (already fixed); ensure `createBookingIntegrationApp()` and `createNotificationIntegrationApp()` default-override `STORAGE_SERVICE` with `InMemoryStorageService` |
| New env var added to `env.validation.ts` passes unit tests but fails a job that boots the **real** app with `Invalid input: expected string, received undefined` | `ConfigModule.forRoot({ validate: validateEnv })` calls `validate` **synchronously, the moment `app.module.ts` is imported** — for bff this happens transitively at the top of every `*.component.spec.ts` file, before `beforeAll`/`createTestApp()` ever runs. Any `process.env[...]` assignment inside `createTestApp()` is too late to affect this specific check (confirmed by moving the real `apps/bff/.env` aside locally — `bff-component`'s `env:` block in `pr-tests.yml` is genuinely load-bearing, not dead code). Backend integration tests are the exception: they build a `TestingModule` directly, never importing the real `AppModule`/going through `main.ts` — only vars a given spec's code path actually reads need setting (`integration-global-setup.ts` for cross-cutting ones, individual specs for narrower ones like `PLATFORM_ADMIN_KEY`) | Add the new var to whichever job actually boots the real app: `pr-tests.yml`'s `bff-component` `env:` block, the relevant integration spec/`integration-global-setup.ts` (backend integration, only if read on the path under test), or `pr-security.yml`'s smoke-test step `env:` (backend/bff boot) |
| `TypeError: Configuration key "X" does not exist` from `ConfigService.getOrThrow('X')`, even though `X` has a `.default(...)` in the Zod schema | Zod's `.default()` only applies to the object `validateEnv()` *returns* — `ConfigService` reads raw `process.env` directly and never sees it, unless something copies the validated/defaulted values back. `ConfigModule.forRoot({ validate: validateEnv })` does this automatically via `@nestjs/config`'s own `assignVariablesToProcess()` — both backend's and bff's `app.module.ts` wire it this way. If a module's `ConfigModule.forRoot()` doesn't pass `validate`, nothing copies schema defaults into `process.env` and every `getOrThrow()` on a defaulted-but-unset key throws the moment that provider is constructed | Wire `validate: validateEnv` into that app's `ConfigModule.forRoot()`. Backend's `validateEnv()` `throw`s rather than `process.exit()`s specifically so this is safe to do — see the next row. |
| Worried that wiring `validate: validateEnv` into `ConfigModule.forRoot()` will crash a future test the moment it imports the real `AppModule` | `NestFactory.create()` wraps bootstrap in NestJS's own "exceptions zone" and calls `process.exit(1)` on **any** fatal bootstrap exception — regardless of whether the underlying code throws or calls `exit` itself, so production behavior is unaffected either way. `Test.createTestingModule(...).compile()` does **not** have this wrapper — confirmed empirically (a `validate` that throws inside `compile()` surfaces as a normal, catchable rejected promise; a `validate` that calls `process.exit()` directly kills the Jest worker outright, no catch possible) | Always `throw` from a `validate` callback, never call `process.exit()` directly inside it — `throw` is safe under both `NestFactory.create()` (still hard-exits, same as before) and `Test.createTestingModule().compile()` (catchable) |
| A smoke test or component test passes locally every time but fails identically every time in CI | A real, gitignored `.env` file on the dev machine (`apps/backend/.env`, `apps/bff/.env`) supplies values CI's fresh checkout never has. For Docker builds specifically, this is worse than it sounds: `.dockerignore`'s `.env*` pattern does **not** reliably exclude nested `apps/*/.env` paths from the build context, so even a `--no-cache` local image build can silently bake a real local `.env` into the image (confirmed: `apps/backend/.env` ended up at `/app/.env` and inside `pnpm deploy`'s `/standalone` output) — see TD06 follow-up | Before trusting any local "it passes" result for a smoke test or component test, move the relevant `apps/*/.env` file aside (`mv apps/backend/.env /tmp/...`) and rerun. If the result changes, the original pass was contaminated and not representative of CI. |
| New controller's integration spec passes locally and in CI, but a reviewer flags the endpoint as "effectively unauthenticated in this test" | `InternalApiGuard` is registered as a **global** `APP_GUARD` — it gates *every* route (not just `/internal/*` paths), but integration app helpers don't wire it by default | Register `extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }]`, set `process.env['INTERNAL_API_KEY']`, and add `.set('X-Internal-Key', KEY)` to every request — mirror `internal-tenant-read.controller.integration.spec.ts` (incl. cleanup in `afterAll`) |
| Manifest/config aggregate looks correct in unit tests but reconstituted seed data is incomplete or fails validation | `seed.ts` inserts JSONB columns via raw SQL (`JSON.stringify({...})`), bypassing the aggregate's `create()` factory — `tsc`/lint can't catch a shape mismatch inside a stringified plain object literal | When you expand required fields on a JSONB-persisted aggregate (e.g. `HotsiteBranding`/`HotsiteModule`), grep `seed.ts` for raw inserts of that entity and update the literals to match the new shape |
| `POST /cron/loyalty-expiry` intermittently returns 500 (`QueryFailedError`, FK violation on `FK_balance_expiry_log_entry`) | `ExpirePointsUseCase` reads via global `findExpiringBefore()` (by design, no tenant filter — CLAUDE.md §3); a test in another spec file can transiently create a `loyalty_entries` row with a near-now past `expiresAt` that's globally visible. If that row is deleted (`afterEach`) before the cron's later `markProcessed` INSERT runs, the FK constraint fails | Any "read-now, write-later" global cron use case must re-verify each row still exists (`existsById()`) immediately before its dependent write — see `ExpirePointsUseCase.execute()` |
| A GitHub Actions job named `Playwright E2E` fails before any browser/test output appears | The workflow died during backend bootstrap, not during browser execution. In this repo, Playwright jobs also run infra startup, migrations, seed, and service readiness before `Run Playwright E2E`. A real example was backend seeding failing with Postgres `inconsistent types deduced for parameter $5` from raw SQL in `seed.ts`; the job looked like a Playwright failure but never reached the browser stage | Check the job steps in order: `Run migrations`, `Seed database`, `Start services and wait for readiness`, then the browser step. If the failure is pre-browser, reproduce it as a backend bootstrap problem (`pnpm db:migrate`, `pnpm db:seed`, clean Docker volume if needed) before touching frontend or Playwright code |

---

## Snyk SCA failures (dependency vulnerabilities)

Snyk scans the **whole** dependency tree on every PR — a freshly-disclosed CVE in an untouched transitive dependency can fail a PR that never touched that package.

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Snyk flags a transitive dependency as vulnerable, but `package.json`'s `pnpm.overrides` already pins a fixed version | pnpm 11 silently ignores `pnpm.overrides` / `pnpm.patchedDependencies` declared in `package.json` — no warning, no error. Overrides must live in `pnpm-workspace.yaml` since the v10→v11 migration. | Move the `overrides:` block to `pnpm-workspace.yaml` (same key/value syntax, root-level key). Verify with `pnpm why <package> -r` — more than one resolved version means the override isn't applying. |
| An override "fixes" a CVE today but the same package gets re-flagged later for a different CVE | The override pins to one version forever; if that exact version is later found vulnerable, the override now blocks a newer, already-safe version from resolving naturally | Before bumping an override, check what resolves **without** it (`pnpm why <pkg> -r` after temporarily removing it) — if natural resolution is already ≥ the fix version, delete the override instead of bumping it |
| `pnpm install` doesn't pick up an override or version bump | A plain install does not re-resolve packages already settled in the lockfile | `pnpm update <package> -r` to force re-resolution; re-verify with `pnpm why <package> -r` |

---

## SonarCloud Quality Gate failures with no useful detail in the scanner log

The scanner CLI only ever prints `QUALITY GATE STATUS: FAILED` with a dashboard link — no condition breakdown. Query the API directly instead of guessing:

```bash
# Gate conditions (need SONAR_TOKEN — ask the user for one if you don't have it; never write it to a file or commit).
# Try without -u first: this project's read API answered every call below unauthenticated
# during M17-S31's review response (2026-07-20) — only add -u "$SONAR_TOKEN:" if you get a 401/403.
curl -s -u "$SONAR_TOKEN:" "https://sonarcloud.io/api/qualitygates/project_status?projectKey=lmmoreira_ikaro&pullRequest=<PR#>" | python3 -m json.tool

# Per-file new-code coverage/duplication breakdown
curl -s -u "$SONAR_TOKEN:" "https://sonarcloud.io/api/measures/component_tree?component=lmmoreira_ikaro&pullRequest=<PR#>&qualifiers=FIL&metricKeys=new_duplicated_lines,new_uncovered_lines,new_uncovered_conditions" | python3 -m json.tool

# Exact duplicated block (file + line range) once you know which file
curl -s -u "$SONAR_TOKEN:" "https://sonarcloud.io/api/duplications/show?key=<project>:<path/to/file.ts>&pullRequest=<PR#>" | python3 -m json.tool
```

### Sonar triage playbook

1. Read the live `project_status` for the PR and note the exact failing metric.
2. Read the PR `component_tree` and identify the exact file(s) that contribute to the failure.
3. If the metric is duplication-related, read `duplications/show` and fix the shared source, not the symptom.
4. If the metric is coverage-related, add the smallest test that exercises the touched line or branch.
5. If the metric does not move after a change, stop and re-query Sonar before editing again.
6. Re-check the live Sonar result after the push. Do not declare the issue fixed from local test output alone.

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Scanner exits with code 3 on a **branch push** (not a PR); the native "SonarCloud Code Analysis" GitHub check shows "Quality Gate not computed" | A branch-mode scan (no PR context) analyzed against `sonar.newCode.referenceBranch=main` while running **on** `main` itself — "new code" can't be defined relative to itself, so the gate returns `status: "NONE"` and the scanner treats that as a failure | If the workflow's only job is refreshing the analysis baseline for future PR differential comparisons (not gating anything), disable the wait for that job only: add `args: -Dsonar.qualitygate.wait=false` to the scanner action's `with:` block. See `main-sonar.yml`. |
| A one-line, obviously-safe fix (e.g. adding `readonly`) fails `new_coverage` or `new_duplicated_lines_density` | The touched file already had 0% coverage, or the touched line sits inside a large pre-existing duplicate block (common between near-identical parallel implementations, e.g. backend/bff having their own copy of the same small class) — the gate only "sees" the problem once that line becomes part of the diff | Use the API calls above to find the exact file/line before changing anything else. If it's a real coverage hole, add a test for the touched code path (check branch coverage too — `new_uncovered_conditions`, not just line coverage). If it's pre-existing duplication between files that shouldn't be merged into this PR's scope, revert that specific edit and track the duplication as its own TD instead of forcing a refactor into an unrelated PR. |
| `new_coverage` fails on a new file, but every line is verifiably covered locally — confirmed via a from-scratch `git worktree` + `pnpm install --frozen-lockfile` reproduction matching CI exactly | The new/changed code lives in a directory excluded from `sonar.sources` and/or not fed into `sonar.javascript.lcov.reportPaths` — its real coverage is invisible to the gate entirely. `packages/*` is excluded by default in this repo (only `apps/backend/src`, `apps/bff/src`, `apps/web` are wired in) since `packages/types`/`packages/config` never needed coverage tracking (type-only/config-only) | If the new code is a `packages/*` package with real runtime logic and its own test suite, add it to `sonar.sources` + `sonar.tests`, add its `coverage/lcov.info` to `sonar.javascript.lcov.reportPaths`, and add a `pnpm --filter <pkg> test:cov` step to every coverage-generating workflow (`pr-quality.yml`, `main-sonar.yml`) — see the `packages/observability` PR for the exact diff |
| The "SonarCloud Analysis" check shows green / Quality Gate status is `OK`, but `sonarcloud.io`'s Issues tab still lists open MINOR/LOW-impact issues on the PR (e.g. `S7735` "Unexpected negated condition") | The default Sonar way gate only fails when a **new-code rating** (reliability/security/maintainability) drops below A; a rating of A tolerates some MINOR/LOW-severity issues. `sonar.qualitygate.wait=true` makes the scanner watch that rating only — it does not enforce "zero new issues" by itself | The `sonar` job in `pr-tests.yml` has its own "Fail on any new SonarCloud issue" step — a separate `curl` to `/api/issues/search?statuses=OPEN,CONFIRMED` that fails the job if `.total > 0`. This is the actual zero-new-issues enforcement; the gate rating is necessary but not sufficient. Don't remove this step assuming the gate already covers it — it was removed once on that exact (incorrect) assumption in AUD-024 and had to be restored during the M13-S13 PR #48 review after 2 MINOR issues slipped through a green gate. |
| A PR-blocking SonarCloud MINOR/LOW issue is reported on a line that, diffed against the base commit, is byte-identical to before your change | The zero-new-issues gate (row above) determines "new" via SCM blame, not semantic diffing. Rewriting a whole file with a single `Write` (instead of targeted `Edit`s) makes git attribute every line — including untouched ones — to the latest commit, so pre-existing debt on those lines surfaces as a "new" finding | Diff the flagged line against the pre-change commit (`git show <base-sha>:<path>`) before assuming you introduced it. If it's genuinely pre-existing and just misattributed, fix it anyway — it's real debt and the gate won't pass otherwise — but don't waste time hunting for what you broke. To avoid the misattribution recurring, prefer `Edit` over a full-file `Write` when refactoring a file that has unchanged sections, so git's diff preserves blame on the unchanged lines. |
| `new_duplicated_lines_density` fails on a PR | The PR introduced a duplicate block that is still counted in the live analysis, even if the code looks cleaner locally | Find the exact duplicated files/lines with `duplications/show`, extract the shared logic into one reusable component/helper, or remove one side entirely. If the duplicate lives across two parallel implementations, the right fix is usually a shared abstraction plus both call sites updated to use it. |
| `new_uncovered_lines` or `new_uncovered_conditions` fails on a PR | The touched code path or branch is not covered by tests | Add or update the smallest test that executes the exact line or branch the gate reports. |
| Sonar still fails after a refactor and the metric is unchanged | The refactor moved code without eliminating the failing pattern | Re-query the live Sonar API and change strategy. The correct fix is the one that moves the metric, not the one that feels locally cleaner. |

---

## Docker build/Trivy passing does not mean the container boots

`Trivy Image Scan` only does **static filesystem vulnerability scanning**; it never starts the container. `pr-security.yml`'s `trivy-scan` job now has a "Boot smoke test" step after the Trivy scan for exactly this reason — it `docker run`s the built image and fails the job if the container exits within 5s instead of staying up (see TD06). It only proves the process survives module-resolution and starts listening — it does **not** prove the app is fully healthy (no live DB/Pub/Sub in that job), so a backend/bff Dockerfile change can still pass the smoke test and fail for DB-dependent reasons in real deployment; that class of failure is covered by integration tests, not this gate.

Before this existed, bff's production image had apparently never successfully booted, undetected, until a manual `docker run` smoke test caught it. To reproduce that kind of check manually (e.g. for a Dockerfile change not yet pushed, or to debug a smoke-test failure locally):

```bash
docker build -f apps/<service>/Dockerfile -t <service>-smoke .
docker run --name <service>-smoke-test -d -p <port>:<port> -e <required env vars> <service>-smoke
sleep 5 && docker logs <service>-smoke-test   # look for "successfully started", not a stack trace
docker inspect <service>-smoke-test --format='{{.State.Status}} exitCode={{.State.ExitCode}}'
docker rm -f <service>-smoke-test && docker rmi <service>-smoke
```

To isolate whether a boot failure is caused by your current change or already exists on `main`, reproduce it in an isolated worktree rather than guessing:

```bash
git worktree add /tmp/<name>-main-test main
cd /tmp/<name>-main-test && docker build -f apps/<service>/Dockerfile -t <service>-main-test .
# ...run/inspect as above...
cd - && git worktree remove /tmp/<name>-main-test --force
```

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| `Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]` on container start, referencing a `packages/*` dependency's `.ts` source | See the matching `ANTI_PATTERNS.md` entry — a workspace package shipped raw TS as `main` | Ship compiled JS for that package; see `ANTI_PATTERNS.md` |
| `Error: Cannot find module 'x'` on container start, where `x` works fine in every dev/test run | See the matching `ANTI_PATTERNS.md` entry — `x` is misclassified under `devDependencies` or only available transitively | Add `x` to the failing app's `dependencies`; sweep all production imports the same way to catch siblings of the same bug |

---

## `middleware.ts` unit tests passing does not mean the CSP actually works in a browser

`middleware.spec.ts` calls `middleware(request)` directly and asserts on the returned `Content-Security-Policy` header string — this proves the header-building logic is correct, it does **not** prove the policy actually permits everything the rendered page needs. Discovered in AUD-007 (`td/TD08-AUDIT-REMEDIATION-BACKLOG.md`): 28/28 unit tests green, `tsc`/`eslint` clean, and `script-src` was still wrong — scoping `'unsafe-inline'` to only the hotsite route (reasoning: "dashboard has no developer-authored inline `<script>` tag") missed that **Next.js injects its own inline hydration/RSC-payload `<script>` tags into every server-rendered page**, hotsite or not. `/dashboard/login` was actually broken (real CSP violations blocking hydration) until this was caught by loading the page in an actual browser.

Any CSP/security-header change must be verified against a running dev stack before it's considered done, not just against the unit test suite:

```bash
ROUTE=/dashboard/login

# 1. Headers are actually being sent
curl -sD - -o /dev/null "http://localhost:3000${ROUTE}" | grep -i content-security-policy

# 2. No console violations when the page actually renders (needs @playwright/test — not the bare
#    `playwright` package name, which pnpm's strict node_modules won't resolve from apps/web directly).
#    Closes the browser and exits non-zero if a CSP violation was seen, so this fails loudly instead
#    of hanging or silently exiting 0.
node -e "
import('@playwright/test').then(async ({ chromium }) => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let sawViolation = false;
  page.on('console', m => {
    if (m.type() === 'error' && /content security policy/i.test(m.text())) {
      console.log(m.text());
      sawViolation = true;
    }
  });
  await page.goto(\`http://localhost:3000\${process.env.ROUTE}\`, { waitUntil: 'networkidle' });
  await browser.close();
  if (sawViolation) process.exitCode = 1;
});
"
```

Check at least one route from every distinct policy branch the middleware produces (e.g. hotsite vs. dashboard vs. auth), not just one representative route — a per-route-group CSP difference is exactly the kind of branch a unit test can assert on paper while still being wrong about what the browser actually needs.

---

## Web test binary resolution (`npx vitest` vs `pnpm exec vitest`)

`ci:fast` runs web tests via `pnpm --filter @ikaro/web test`, which resolves the Vitest binary from the workspace's own `node_modules`. Running tests via `npx --prefix apps/web vitest run` can resolve to a completely different binary — different version, different plugin chain — producing results that don't match CI.

**The trap:** an agent sees 4 specs "failing" with `npx` and spends time on phantom fixes. The same specs pass immediately with `pnpm`. Or vice versa: `npx` gives a green result that CI later contradicts.

| Wrong ❌ | Correct ✅ |
|---------|-----------|
| `npx --prefix apps/web vitest run <file>` | `pnpm --prefix apps/web exec vitest run <file>` |
| `npx --prefix apps/web vitest run` | `pnpm --filter @ikaro/web test` |

**Rule:** to verify web tests locally in a way that matches `ci:fast`, always use `pnpm --filter @ikaro/web test` (full suite) or `pnpm --prefix apps/web exec vitest run <file>` (single spec). Never use `npx vitest` for authoritative results.

---

## JSX inside `vi.mock()` factories for external (node_modules) packages

Vite v8 changed its import-analysis pass to use Rolldown (a Rust-based parser). Rolldown rejects JSX — it can only parse plain JS/TS. When Vitest hoists `vi.mock('some-package', () => ({ default: () => <a>...</a> }))` to the top of the file, the hoisted code runs through Vite's import-analysis **before** the React JSX transform, causing a parse failure on every spec that contains this pattern.

This broke four specs simultaneously in M13-S16 (`Sidebar`, `BottomNav`, `ManagerSheet`, `CustomerShell`) — all used `vi.mock('next/link', ...)` with a JSX factory. The error message is:

```
Failed to parse source for import analysis because the content contains invalid JS syntax.
If you use tsconfig.json, make sure to not set jsx to preserve.
Unexpected JSX expression
```

**Fix pattern** (same as `next/image` and `next/font/google`): use a global `resolve.alias` in `vitest.config.ts` pointing to a `__mocks__/<name>.ts` file that uses `React.createElement` instead of JSX:

```ts
// vitest.config.ts — resolve.alias block
'next/link': path.resolve(__dirname, '__mocks__/next-link.ts'),
```

```ts
// apps/web/__mocks__/next-link.ts
import React from 'react';
const MockLink = ({ href, children, className, onClick, ...rest }) =>
  React.createElement('a', { href, className, onClick, ...rest }, children);
export default MockLink;
```

Remove every per-file `vi.mock('next/link', ...)` that used JSX — the global alias takes over automatically.

**Packages already aliased in `vitest.config.ts`:** `next/font/google`, `next/image`, `next/link`.

**Rule:** if you need to mock any external package whose factory would return a React component (JSX), **do not** write `vi.mock('package', () => ({ default: () => <...> }))`. Check `apps/web/__mocks__/` first; if no mock exists, create one using `React.createElement` and wire it in `vitest.config.ts`. JSX belongs in the component file, not in a mock factory.

---

## Pre-push hook failures (`ci:fast`)

`ci:fast` = `pnpm lint && pnpm prettier --check . && pnpm type-check && pnpm --filter @ikaro/backend test:unit`

Runs automatically on `git push`. Fix these before re-pushing.

| Failure message | Cause | Fix |
|-----------------|-------|-----|
| `Barrel import from ports/` | `import ... from '../../ports'` | Import from the specific file path |
| `Barrel import from shared/domain/` | `import ... from '../../shared/domain'` | Import from the specific file |
| `no-restricted-imports: cross-context import` | Context A importing from Context B's path | Route through `src/shared/` or a port+adapter |
| Jest `Cannot find module` | Wrong relative path depth | Count the `../` levels from the spec file location |
| Type error on `complement` field | VO expects `string \| undefined`, DTO has `string \| null \| undefined` | Normalise with `?? undefined` at the VO call site |

---

## SonarCloud CPD (Duplicated Lines %) > 3% on new code

SonarCloud gates on ≤ 3% duplicated lines on **new code**. A private method duplicated across two use cases easily pushes past this threshold.

| Situation | Wrong ❌ | Correct ✅ |
|-----------|---------|-----------|
| Admin-email logic duplicated in two notification use cases | `private sendAdminEmail(...)` method in each use case (~18+ lines each) | Extract to `dispatchAdminEmailToManagers()` in `notification-log.helper.ts`; both use cases call the utility |
| Payload serialisation repeated in multiple aggregate methods | Inline `this.props.lines.map(...)` block copy-pasted into `approve()`, `cancel()`, `reschedule()` | Extract `private lineSummaryPayload()` / `private totalPricePayload()` helpers in the aggregate |

**Rule:** Any block of ~10 identical lines that appears in ≥ 2 new files will breach the CPD gate. Extract before it ships — retrofitting after CI fails requires an extra commit cycle.

**Cross-app exception:** removing a translation/mapping layer between two systems that previously used different naming conventions (e.g. a BFF dropping its snake_case↔camelCase translation once the backend itself switched to camelCase — M13-S10) can make their validation schemas become textually near-identical, even though nothing is functionally duplicated — each app independently re-validates the same business rules for a legitimate reason (the BFF gives fast feedback before round-tripping to the backend; the backend stays authoritative). This is the same pattern already accepted for `HotsiteAdminController` vs. `update-hotsite-content.dto.ts` — it just stays under the threshold there. Don't restructure the apps to share Zod schemas mid-PR just to satisfy the metric (that's a real architecture change — build chain, Dockerfiles, see `td/TD11-BFF-BACKEND-VALIDATION-SCHEMA-DUPLICATION.md`); add the newly-duplicate file to `sonar.cpd.exclusions` in `sonar-project.properties` with a comment naming the precedent, and file/extend the TD note instead.

**Concrete precedent — genuinely identical code, not the cross-app exception above:** M17-S31 (2026-07-20) needed the exact same tiny `uuidv7()`/`isUuidV7()` pair in both `apps/backend` and `apps/bff`. Duplicating it deliberately (to keep the two apps decoupled) worked fine as a single function, but the gate failed (4.4% vs. the 3% threshold) the moment a second identical function was added to both copies. This is real duplication, not independently-justified re-validation — the fix was to extract it, not exclude it via `sonar.cpd.exclusions`. It landed in `@ikaro/validation`, whose own `package.json` description already declares "never consumed by apps/web" (the exact constraint this `node:crypto`-using code needed) and which both apps already depend on via a plain main-barrel import — see the next section for why a new package.json `exports` subpath was tried first and didn't work.

---

## `moduleResolution: "Node"` doesn't see package.json `exports` subpaths

`apps/backend/tsconfig.json` and `apps/bff/tsconfig.json` both set `"moduleResolution": "Node"` (classic Node resolution) — a deliberate override of the base config's `NodeNext` (`packages/config/tsconfig.base.json`). Classic resolution only understands a package's `main`/`types` fields; it does not read the `exports` field at all, so a package.json `exports` subpath (e.g. `"./uuid-v7": { "types": "./dist/uuid-v7.d.ts", ... }`) type-checks fine in isolation but fails `tsc --noEmit` with `TS2307: Cannot find module` the moment backend or BFF tries to import it (confirmed the hard way during M17-S31's review response, 2026-07-20, before landing on the real fix below).

**If you need to scope a shared utility to backend+BFF only (never apps/web):** don't reach for a subpath export on `@ikaro/types` (its main barrel is what apps/web imports, so a subpath doesn't even solve the actual isolation problem — it only adds an unresolvable import). Instead, put the file in a package whose own `package.json` description already declares it's backend+BFF-only — `@ikaro/validation` is exactly that (*"Shared Zod business-rule validation schemas for backend and bff — never consumed by apps/web"*) — and export it from that package's plain main barrel. Both apps already depend on it, so no subpath is needed at all.

---

## Bulk find-and-replace refactors (snake_case → camelCase, renames)

A blanket `sed`/find-replace on a field name is unsafe the moment that exact identifier is reused by a **different, unrelated** DTO or contract. `country_code` existed both in `TenantSettingsProps.localization` (the rename target, M13-S10) and in the unrelated `ProvisionTenantDto`/`POST /internal/tenants` request body — a repo-wide rename silently corrupted the second one twice in the same session, each time only caught by a failing integration test, never by `tsc`.

Worse: `tsc --noEmit` passing after a bulk rename is **not** proof the test fixtures are correct. A mock built with an `as unknown as X` cast (common for `jest.fn()` mocks that don't conform to a strict interface) bypasses the type checker entirely — a stale field name inside one of these mocks compiles cleanly and only fails when the test actually runs.

**Before running a bulk rename:**
1. Grep every occurrence of the identifier first; group by which DTO/contract each one actually belongs to — don't assume one name means one meaning.
2. After the `sed`, run the full affected test suite (not just `tsc --noEmit`) — type-checking alone will miss any fixture hidden behind a type-erasing cast.

---

## Early return + downstream branch coverage gap

Adding an early-return guard (e.g., `if (existingCustomer && existingAdmin) return`) closes a happy path quickly but creates new uncovered branches: the false-arms of the downstream `if (!existingCustomer)` / `if (!existingAdmin)` blocks that are now only reachable when **one** log exists.

SonarCloud gates on **branch** coverage (not just line coverage) for new code. Missing false-arms show as uncovered even when line coverage looks fine.

**Fix pattern:** add two partial-retry tests per use case — one that pre-seeds only the customer log, one that pre-seeds only the admin log:

```typescript
it('sends only admin email when customer log already exists (partial retry)', async () => {
  await logRepo.save(NotificationLog.create({ ..., notificationType: 'XXX_CUSTOMER', channel: 'EMAIL' }));
  const result = await useCase.execute(baseDto);
  expect(result.customerEmailSent).toBe(false);
  expect(result.adminEmailSent).toBe(true);
});

it('sends only customer email when admin log already exists (partial retry)', async () => {
  await logRepo.save(NotificationLog.create({ ..., notificationType: 'XXX_ADMIN', channel: 'EMAIL' }));
  const result = await useCase.execute(baseDto);
  expect(result.customerEmailSent).toBe(true);
  expect(result.adminEmailSent).toBe(false);
});
```

These two tests together cover the four branch combinations introduced by the early return + two independent guards.

---

## A compile/test failure only exists in CI, and won't reproduce even in a clean clone

GitHub Actions' `pull_request` trigger checks out the **speculative merge** of your branch with the base branch (`main`) — `refs/pull/<N>/merge` — not your branch's raw HEAD. If `main` has concurrently changed a file your branch also touches, even with zero textual conflict (git auto-merges cleanly, no `CONFLICT` markers), the *merged result* can fail to compile or fail a test that neither branch fails on its own.

**Symptom:** CI reports a compile error (e.g. `TS2554: Expected 1-3 arguments, but got 4`) at lines that look correct in `git show <your-commit>:<file>`. The error does not reproduce in a completely fresh `git clone` + `pnpm install --frozen-lockfile` + the exact CI command — because that reproduces your branch *alone*, not the PR's speculative merge with the current tip of `main`.

Found in TD23-S11: `main` merged a concurrent story (TD24-S02) that changed a shared test helper's function signature (`makeController()`, 4 params → 3, dropping `eventBus`) in `staff.controller.spec.ts`. The PR branch had added new call sites elsewhere in that same file, still using the old 4-arg form — `main` never touched those specific lines, so git's line-based merge saw no conflict, but the merged file ended up calling a 3-param function with 4 arguments.

**Fix:** `git fetch origin main && git merge origin/main` locally (never rebase an already-pushed/reviewed branch — CLAUDE.md §9 Step 9), reconcile any content only your branch added against `main`'s changes by hand, re-verify locally, then push. Don't spend time trying to reproduce a CI-only failure by inspecting your own commit in isolation — check whether `main` has diverged first.

---

## CI workflow configuration traps

These affect `.github/workflows/` files, not application code — but cause CI to fail or produce misleading results just as surely.

| Trap | Root cause | Fix |
|------|-----------|-----|
| SonarCloud job re-runs `test:cov` for all packages, doubling PR build time | A `sonarcloud` job generates its own coverage instead of downloading artifacts that sibling test jobs already uploaded | Declare `needs: [backend-unit, bff-unit, web-unit]`, download their artifacts via `actions/download-artifact`, and only run `test:cov` for packages not covered by those jobs (`@ikaro/observability`, `@ikaro/env-validation`). See `pr-tests.yml` for the reference pattern. |
| `main-sonar.yml` starts failing with exit code 3 after removing `-Dsonar.qualitygate.wait=false` | Branch-mode scans on `main` (no PR context) return `status: NONE` from the quality gate; `wait=true` (set in `sonar-project.properties`) treats `NONE` as a hard failure | Always keep `args: -Dsonar.qualitygate.wait=false` in `main-sonar.yml`. `wait=true` is correct for PR scans only — the properties file sets it and it takes effect there. See existing entry in "SonarCloud Quality Gate failures" section above for full detail. |
| Trivy permanently blocks PRs on a CVE that has no upstream fix | Removing `ignore-unfixed: true` means un-patchable CVEs fail every PR — authors can do nothing to resolve them | Keep `ignore-unfixed: true` in the PR-blocking Trivy scan. Track unfixed CVEs separately in `security-weekly.yml` (Monday cron, `ignore-unfixed: false`, `exit-code: '0'`, SARIF uploaded to GitHub Security tab). |
| A CI step uses `npx -y <tool>` — different jobs on the same PR can silently get different tool versions | `npx -y` downloads the latest version at runtime — not pinned, not cached, not in the lockfile | Add the CLI as a root `devDependency` (pinned in `pnpm-lock.yaml`, cached by `actions/setup-node`) and use `pnpm exec <tool>` in the workflow step. See `wait-on` in `pr-e2e.yml` as the reference. |
| An `actions/*` step uses a floating tag (`@v4`) — zizmor / CodeRabbit flags it as Major security | GitHub-owned action tags are mutable — the tag can be silently redirected to a new commit with different code | Pin ALL actions (including `actions/checkout`, `actions/setup-node`, `actions/download-artifact`) to full commit SHAs. See `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md §7` for current SHAs and the lookup command. |
| "Optimizing" the Checkov job's path condition from a step-level `if:` to a workflow/job-level `paths:` filter | The `checkov` job must *run and report success* on every PR (it's shape-compatible with a required status check). With `on.pull_request.paths` the job never starts on non-terraform PRs — the check stays "Expected — waiting for status" forever and blocks merge (same failure class as the S08 infra-only PRs that needed `--admin` bypass, from the other direction) | Keep the current design in `pr-tests.yml`: job unconditional, `dorny/paths-filter` step computes the filter, scan + SARIF-upload *steps* gated on `steps.filter.outputs.terraform == 'true'`. Skipped steps still yield a green job in seconds. Also: the filter path is `infra/terraform/**` (fixed in M17-S11 — the original `infrastructure/terraform/**` was stale and the gate silently never fired) |
| A job that consumes `vars.X`/`secrets.X` reads an empty string even though the value is definitely set on the repo | The value is set as an **environment-scoped** GitHub Variable/Secret, but this job declares no `environment:` (e.g. a PR-triggered plan job, which must run without an approval gate) — GitHub only exposes environment-scoped values to jobs that declare that exact environment | Use repo-level (not environment-scoped) Variables/Secrets for anything a no-`environment:` job needs. See `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` § Repository Secrets vs. Variables — this exact rule was already documented from M17-S23 and still got violated once during M17-S24, so don't assume "I know the rule" is enough; grep the section against every new Variable/Secret you add. |
| A branch-protection required-check name is added the same PR that introduces the workflow/job producing it | The check doesn't exist on `main` yet — every *other* open PR (based on `main`) has no workflow to produce that check name at all, so it sits as "Expected, waiting to be reported" forever, forcing an admin-override merge on unrelated work | Never add a context to `required_status_checks` until its producing workflow is already merged to `main` and has run there successfully at least once. Merge the workflow first (not required), confirm a real run on `main`, *then* `gh api PATCH .../required_status_checks` as a distinct follow-up step. Real incident: M17-S24, 2026-07-21. |

---

## Quick pre-commit checklist

Before every `git commit`, verify:

- [ ] `dto.x !== undefined ?` patterns → replaced with `??` or positive `=== undefined` branch
- [ ] No nested ternaries — use `if/else`
- [ ] No `z.string().uuid()` or `z.string().email()` — use `z.uuid()`, `z.email()`
- [ ] Lines ≤ 80 chars — run `pnpm prettier --write .`
- [ ] Every generated ID uses `uuidv7()` — not `Date.now()`, not fixed strings
- [ ] Slugs in integration tests are unique: `` `prefix-${uuidv7()}` ``
- [ ] `RequestModule` in context module `imports[]` (not just the test app)
- [ ] `EventBusModule` in integration app `imports[]`
- [ ] Domain events listed in the **publishing** context, not duplicated
- [ ] Every `@Patch` body schema with all-optional fields ends with `.default({})`
- [ ] Every endpoint called as a setup step in `*.integration.spec.ts` exists in the controller (`grep -n "@Patch\|@Post" controller.ts`)
- [ ] No private `sendAdminEmail`-style methods duplicated across notification use cases — use `dispatchAdminEmailToManagers()` utility
- [ ] Early-return guard added? → add two partial-retry tests (one log pre-seeded each way) to cover the new branch arms
- [ ] Builder/aggregate fields with no `withXxx()` setter → mark `readonly` (S2933)
- [ ] Integration test 403/404 assertions use `expect(res.status).toBe(403)` — not bare supertest `.expect(403)` (S2699)
- [ ] Unused method parameters suppressed with `_param` prefix — not `void param;`
- [ ] Global (non-tenant-scoped) cron use cases that read-then-write (e.g. `findExpiringBefore` → `markProcessed`) re-verify each row's existence before the write — a SELECT result can go stale across an `await` boundary
- [ ] New/changed dependency override goes in `pnpm-workspace.yaml` — never `package.json`'s `pnpm` field (silently ignored on pnpm 11)
- [ ] Before a bulk rename/`sed`, grepped every occurrence to confirm the identifier isn't reused by a different, unrelated DTO/contract — and ran the affected test suites afterward, not just `tsc --noEmit`
- [ ] Web test results verified with `pnpm --filter @ikaro/web test` or `pnpm --prefix apps/web exec vitest run` — NOT `npx vitest` (different binary, produces false results)
- [ ] Any new `vi.mock()` for an external package that returns JSX → created `apps/web/__mocks__/<name>.ts` + added `resolve.alias` in `vitest.config.ts` instead of putting JSX inside the factory (Vite v8 rejects JSX at import-analysis time)
