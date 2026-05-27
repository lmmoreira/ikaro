# CI Traps — BeloAuto

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
| **Duplicate class** | `StaffInvited` defined in both `staff/` and `platform/` | event lives in the **publishing** context only |
| **Unused variable** | `const _x = ...` | remove it entirely |

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
| `Cannot read properties of undefined` (reading `tenantId`) | `TenantModule` missing from the **context module** — not just the test app | Add `TenantModule` to the context's own `xxx.module.ts` `imports[]` |
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

---

## Pre-push hook failures (`ci:fast`)

`ci:fast` = `pnpm lint && pnpm prettier --check . && pnpm type-check && pnpm --filter @beloauto/backend test:unit`

Runs automatically on `git push`. Fix these before re-pushing.

| Failure message | Cause | Fix |
|-----------------|-------|-----|
| `Barrel import from ports/` | `import ... from '../../ports'` | Import from the specific file path |
| `Barrel import from shared/domain/` | `import ... from '../../shared/domain'` | Import from the specific file |
| `no-restricted-imports: cross-context import` | Context A importing from Context B's path | Route through `src/shared/` or a port+adapter |
| Jest `Cannot find module` | Wrong relative path depth | Count the `../` levels from the spec file location |
| Type error on `complement` field | VO expects `string \| undefined`, DTO has `string \| null \| undefined` | Normalise with `?? undefined` at the VO call site |

---

## Quick pre-commit checklist

Before every `git commit`, verify:

- [ ] `dto.x !== undefined ?` patterns → replaced with `??` or positive `=== undefined` branch
- [ ] No nested ternaries — use `if/else`
- [ ] No `z.string().uuid()` or `z.string().email()` — use `z.uuid()`, `z.email()`
- [ ] Lines ≤ 80 chars — run `pnpm prettier --write .`
- [ ] Every generated ID uses `uuidv7()` — not `Date.now()`, not fixed strings
- [ ] Slugs in integration tests are unique: `` `prefix-${uuidv7()}` ``
- [ ] `TenantModule` in context module `imports[]` (not just the test app)
- [ ] `EventBusModule` in integration app `imports[]`
- [ ] Domain events listed in the **publishing** context, not duplicated
- [ ] Every `@Patch` body schema with all-optional fields ends with `.default({})`
- [ ] Every endpoint called as a setup step in `*.integration.spec.ts` exists in the controller (`grep -n "@Patch\|@Post" controller.ts`)
