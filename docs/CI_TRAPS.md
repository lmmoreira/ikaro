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
# Gate conditions (need SONAR_TOKEN — ask the user for one if you don't have it; never write it to a file or commit)
curl -s -u "$SONAR_TOKEN:" "https://sonarcloud.io/api/qualitygates/project_status?projectKey=lmmoreira_ikaro&pullRequest=<PR#>" | python3 -m json.tool

# Per-file new-code coverage/duplication breakdown
curl -s -u "$SONAR_TOKEN:" "https://sonarcloud.io/api/measures/component_tree?component=lmmoreira_ikaro&pullRequest=<PR#>&qualifiers=FIL&metricKeys=new_duplicated_lines,new_uncovered_lines,new_uncovered_conditions" | python3 -m json.tool

# Exact duplicated block (file + line range) once you know which file
curl -s -u "$SONAR_TOKEN:" "https://sonarcloud.io/api/duplications/show?key=<project>:<path/to/file.ts>&pullRequest=<PR#>" | python3 -m json.tool
```

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Scanner exits with code 3 on a **branch push** (not a PR); the native "SonarCloud Code Analysis" GitHub check shows "Quality Gate not computed" | A branch-mode scan (no PR context) analyzed against `sonar.newCode.referenceBranch=main` while running **on** `main` itself — "new code" can't be defined relative to itself, so the gate returns `status: "NONE"` and the scanner treats that as a failure | If the workflow's only job is refreshing the analysis baseline for future PR differential comparisons (not gating anything), disable the wait for that job only: add `args: -Dsonar.qualitygate.wait=false` to the scanner action's `with:` block. See `main-sonar.yml`. |
| A one-line, obviously-safe fix (e.g. adding `readonly`) fails `new_coverage` or `new_duplicated_lines_density` | The touched file already had 0% coverage, or the touched line sits inside a large pre-existing duplicate block (common between near-identical parallel implementations, e.g. backend/bff having their own copy of the same small class) — the gate only "sees" the problem once that line becomes part of the diff | Use the API calls above to find the exact file/line before changing anything else. If it's a real coverage hole, add a test for the touched code path (check branch coverage too — `new_uncovered_conditions`, not just line coverage). If it's pre-existing duplication between files that shouldn't be merged into this PR's scope, revert that specific edit and track the duplication as its own TD instead of forcing a refactor into an unrelated PR. |
| `new_coverage` fails on a new file, but every line is verifiably covered locally — confirmed via a from-scratch `git worktree` + `pnpm install --frozen-lockfile` reproduction matching CI exactly | The new/changed code lives in a directory excluded from `sonar.sources` and/or not fed into `sonar.javascript.lcov.reportPaths` — its real coverage is invisible to the gate entirely. `packages/*` is excluded by default in this repo (only `apps/backend/src`, `apps/bff/src`, `apps/web` are wired in) since `packages/types`/`packages/config` never needed coverage tracking (type-only/config-only) | If the new code is a `packages/*` package with real runtime logic and its own test suite, add it to `sonar.sources` + `sonar.tests`, add its `coverage/lcov.info` to `sonar.javascript.lcov.reportPaths`, and add a `pnpm --filter <pkg> test:cov` step to every coverage-generating workflow (`pr-quality.yml`, `main-sonar.yml`) — see the `packages/observability` PR for the exact diff |

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
