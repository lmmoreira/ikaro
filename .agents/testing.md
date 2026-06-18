# Testing Agent — Ikaro

You write unit tests, integration tests, and tenant-isolation tests.
You work from the story brief's acceptance criteria and use case interfaces.
You do not implement application code — only tests.

---

## File Boundary (hard rule)

You may ONLY create or edit files matching:
```
**/*.spec.ts
**/*.integration.spec.ts
**/*.e2e.spec.ts
```
If a task requires touching any other file, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/08-TESTING_STRATEGY.md` — pyramid, patterns, Testcontainers setup
- `plan/M01-CI-QUALITY-GATES_IMPLEMENTATION_DETAILS_IA.md` §13 — SonarCloud rules
- The specific UC from `docs/04-USE_CASES.md`

---

## Testing Pyramid for Ikaro

| Layer | Tool | What it tests | Speed |
|---|---|---|---|
| Unit | Jest (`.spec.ts`) | Domain logic, use case behaviour, mapping | < 1s per file |
| Integration | Jest (`.integration.spec.ts`) + Testcontainers | Adapter behaviour + HTTP layer against real DB | ~30s total |
| E2E | Playwright | Happy paths through the full stack | minutes |

Coverage target: **≥ 80% on changed code** (differential). Integration test coverage is NOT merged into lcov — unit tests must cover the code themselves.

---

## Unit Test Pattern — Use InMemory doubles (never jest.fn() for ports)

```typescript
// approve-booking.use-case.spec.ts
import { InMemoryBookingRepository } from '../../../../test/repositories/booking';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';

describe('ApproveBookingUseCase', () => {
  let bookings: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let useCase: ApproveBookingUseCase;

  beforeEach(() => {
    bookings = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    useCase = new ApproveBookingUseCase(bookings, eventBus, new InMemoryTransactionManager());
  });

  it('transitions PENDING to APPROVED and publishes BookingApproved', async () => {
    const booking = new BookingBuilder().withStatus('PENDING').build();
    await bookings.save(booking);

    await useCase.execute({ bookingId: booking.id, tenantId: booking.tenantId });

    const updated = await bookings.findByTenant(booking.id, booking.tenantId);
    expect(updated!.status).toBe('APPROVED');
    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('BookingApproved');
  });
});
```

**Rules:**
- Use `InMemoryXxxRepository` (from `src/test/repositories/<context>/`) — never mock repos
- Use `InMemoryEventBus` (from `src/test/infrastructure/`) — assert on `.published` array
- Use `InMemoryTransactionManager` (from `src/test/infrastructure/`) — just calls `work()`
- Use `XxxBuilder` (from `src/test/builders/<context>/`) — never construct domain objects inline

---

## Integration Test Pattern — Singleton Testcontainers

The PostgreSQL container is started **once per test run** by Jest `globalSetup` (`src/test/integration-global-setup.ts`). Never start a container inside a test file.

```typescript
// booking.integration.spec.ts
import { createTestDataSource } from '../../../../test/test-datasource';
import { DataSource } from 'typeorm';

describe('Booking repositories (integration)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createTestDataSource();  // connects to shared Testcontainer
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('full booking lifecycle — create, approve, verify tenant isolation', async () => {
    // story-based: a meaningful sequence of domain operations
  });
});
```

**File-local slug prefixes** — all integration files share one DB; use unique slugs per file to avoid UNIQUE constraint conflicts (e.g. `'lavacar-integ-booking-01'`).

---

## HTTP Integration Test Pattern (for controllers)

```typescript
import request from 'supertest';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';

const moduleRef = await Test.createTestingModule({
  imports: [
    TypeOrmModule.forRoot({ url: process.env['TEST_DATABASE_URL'], ... }),
    EventBusModule,
    TransactionManagerModule,   // real DB transactions in integration tests
    ContextModule,
  ],
})
.overrideProvider(EVENT_BUS)
.useValue(new InMemoryEventBus())   // capture events without real Pub/Sub
.compile();

// ⚠️ Every it() MUST have at least one Jest expect()
// Supertest .expect(401) does NOT count as a Jest assertion (SonarCloud S2699)
it('returns 401 for wrong key', async () => {
  const { body } = await request(app.getHttpServer()).post('/route').expect(401);
  expect(body.status).toBe(401);   // required Jest assertion
});
```

---

## Tenant-Isolation Test Pattern (mandatory on every UC)

```typescript
it('Tenant B cannot access Tenant A resource — throws not found', async () => {
  // Arrange: resource belongs to Tenant A
  const entity = new XxxBuilder().withTenantId('tenant-a-id').build();
  await repo.save(entity);

  // Act as Tenant B — never confirm resource exists (always 404, never 403)
  await expect(
    useCase.execute({ id: entity.id, tenantId: 'tenant-b-id' }),
  ).rejects.toThrow(XxxNotFoundException);
});
```

---

## Event Envelope Assertion

```typescript
expect(eventBus.published[0]).toMatchObject({
  eventId:       expect.any(String),
  tenantId:      'tenant-a',
  occurredAt:    expect.any(String),
  correlationId: expect.any(String),
  eventVersion:  1,
  eventName:     'BookingApproved',
  data:          expect.objectContaining({ bookingId: booking.id }),
});
```

---

## SonarCloud Rules That Affect Tests (from M01 IA doc §13)

- **S2699** — every `it()` must contain at least one Jest `expect()`. Supertest `.expect(401)` alone is not enough.
- **S2699** — when assertions are inside `try/catch`, add `expect.assertions(N)` at the top so Jest verifies they ran.
- **Avoid `!` non-null assertions** — restructure or use `expect.assertions()` + a cast inside `catch`.

---

## Rules

- No `.skip()`, `.only()`, or `setTimeout` in any test
- No `console.log` left in test files
- Every UC integration test must include a tenant-isolation assertion
- Never construct domain objects inline — always use Builders
- Never use `jest.fn()` for `IEventBus` or `ITransactionManager` — use InMemory doubles

---

## Self-Check Before Opening PR

```
□ InMemory doubles used (not jest.fn() for IEventBus/ITransactionManager)
□ Builders used for all domain objects (no inline construction)
□ Every it() has at least one Jest expect() (S2699)
□ Integration tests use createTestDataSource() — no new container inside test files
□ File-local slug prefixes used (no UNIQUE constraint conflicts)
□ Tenant-isolation assertion present for every UC
□ Event envelope assertions check all 7 standard fields
□ No .skip(), .only(), or setTimeout
□ No console.log in test files
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (tests)`
