# Testing Strategy - Ikaro

## Philosophy

Tests in Ikaro are **executable specifications**. Each test proves that a specific piece of behaviour from `docs/04-USE_CASES.md` works — not just that code runs. An AI agent implementing any UC must write tests first (TDD) and must be able to run them locally before pushing.

**Three non-negotiable rules:**
1. Every UC must have a unit test, an integration test, and a tenant-isolation test.
2. Tests are co-located with source: `booking.entity.spec.ts` lives next to `booking.entity.ts`.
3. No `.skip()`, `.only()`, or `setTimeout()` in any test file — CI will block the merge.

---

## Tools

| Layer | Tool | Why |
|---|---|---|
| Backend unit + integration | **Jest** | NestJS default, excellent DI mocking, mature |
| Frontend unit + component | **Vitest** | Faster than Jest, native ESM, Vite-native |
| Frontend components | **React Testing Library** | Tests behaviour, not implementation |
| HTTP integration | **Supertest** | NestJS-native HTTP testing |
| Real DB / Pub/Sub | **Testcontainers** | Ephemeral containers per test suite, no shared state |
| API contract | **Spectral** | OpenAPI linting — validates spec consistency in CI |
| E2E | **Playwright** | Full browser automation, cross-context flows |
| In-memory fakes | **Manual** | Hand-written in-memory adapters (see §In-Memory Adapters) |
| Frontend API mocking | **MSW (Mock Service Worker)** | Intercepts BFF calls in browser and Vitest |

---

## The Testing Pyramid

```
              ▲
             /E2E\          Playwright — 3-5 critical user journeys
            /─────\
           / Contr.\        Spectral — OpenAPI spec validation
          /─────────\
         /Integration\      Jest + Testcontainers — real DB, real Pub/Sub emulator
        /─────────────\
       /  Application  \    Jest + in-memory adapters — use case logic
      /─────────────────\
     /   Domain (Unit)   \  Jest — pure TypeScript, zero dependencies
    /─────────────────────\
```

**Coverage target:** ≥ 80% on **changed code** (differential — measured by SonarCloud on PRs, not a global threshold). Fast layers (domain, application) carry most of the coverage; slow layers (integration, E2E) prove the wiring.

---

## Layer 1 — Domain Tests (Pure Unit)

**Scope:** Entities, value objects, aggregates, domain services inside `domain/`.

**Rules:**
- Zero framework imports (`@nestjs/*`, `typeorm`, etc.).
- Zero mocks. Domain logic takes plain objects in, returns plain objects or domain events out.
- Every valid and invalid state machine transition must have its own test.
- Tests run in milliseconds. If a domain test is slow, something is wrong.

**File location:** `<file>.spec.ts` co-located with `<file>.ts`.

### Naming convention
```
describe('<ClassName> / <methodName>()')
  it('should <expected behaviour> when <precondition>')
  it('should throw <ErrorType> when <invalid precondition>')
```

### Example — Booking aggregate state machine
```typescript
// src/contexts/booking/domain/entities/booking.entity.spec.ts

describe('Booking / approveBooking()', () => {
  it('should transition PENDING to APPROVED and emit BookingApproved', () => {
    const booking = BookingFactory.pending({ tenantId: TENANT_A_ID });

    booking.approveBooking(STAFF_ID);

    expect(booking.status).toBe(BookingStatus.APPROVED);
    expect(booking.approvedBy).toBe(STAFF_ID);
    expect(booking.domainEvents).toContainEqual(
      expect.objectContaining({ eventName: 'BookingApproved', tenantId: TENANT_A_ID }),
    );
  });

  it('should transition INFO_REQUESTED to APPROVED', () => {
    const booking = BookingFactory.infoRequested({ tenantId: TENANT_A_ID });
    booking.approveBooking(STAFF_ID);
    expect(booking.status).toBe(BookingStatus.APPROVED);
  });

  it('should throw InvalidStateTransitionError when booking is APPROVED', () => {
    const booking = BookingFactory.approved({ tenantId: TENANT_A_ID });
    expect(() => booking.approveBooking(STAFF_ID))
      .toThrow(InvalidStateTransitionError);
  });

  it('should throw InvalidStateTransitionError when booking is COMPLETED', () => {
    const booking = BookingFactory.completed({ tenantId: TENANT_A_ID });
    expect(() => booking.approveBooking(STAFF_ID))
      .toThrow(InvalidStateTransitionError);
  });
});

// State machine coverage matrix — every transition must be tested
describe('Booking state machine', () => {
  const validTransitions = [
    { from: 'PENDING',        action: 'approve',          to: 'APPROVED' },
    { from: 'PENDING',        action: 'reject',           to: 'REJECTED' },
    { from: 'PENDING',        action: 'requestInfo',      to: 'INFO_REQUESTED' },
    { from: 'PENDING',        action: 'cancel',           to: 'CANCELLED' },
    { from: 'INFO_REQUESTED', action: 'submitInfo',       to: 'PENDING' },
    { from: 'INFO_REQUESTED', action: 'approve',          to: 'APPROVED' },
    { from: 'INFO_REQUESTED', action: 'reject',           to: 'REJECTED' },
    { from: 'INFO_REQUESTED', action: 'cancel',           to: 'CANCELLED' },
    { from: 'APPROVED',       action: 'complete',         to: 'COMPLETED' },
    { from: 'APPROVED',       action: 'cancel',           to: 'CANCELLED' },
  ];

  test.each(validTransitions)(
    'valid: $from → $to via $action',
    ({ from, action, to }) => {
      const booking = BookingFactory.withStatus(from as BookingStatus);
      (booking as any)[action + 'Booking']?.(/* minimal args */);
      expect(booking.status).toBe(to);
    },
  );

  const terminalStates = ['COMPLETED', 'REJECTED', 'CANCELLED'];
  test.each(terminalStates)(
    'terminal: %s cannot transition to any state',
    (state) => {
      const booking = BookingFactory.withStatus(state as BookingStatus);
      expect(() => booking.approveBooking(STAFF_ID)).toThrow(InvalidStateTransitionError);
      expect(() => booking.cancelBooking(STAFF_ID)).toThrow(InvalidStateTransitionError);
    },
  );
});
```

### Example — Booking aggregate invariants
```typescript
describe('Booking / requestBooking()', () => {
  it('should throw MissingPickupAddressError when a pickup service is selected without an address', () => {
    const pickupService = ServiceFactory.withPickup();
    expect(() =>
      Booking.requestBooking(GUEST_ACTOR, SLOT, [pickupService], undefined /* no address */),
    ).toThrow(MissingPickupAddressError);
  });

  it('should snapshot service price into BookingLine at request time', () => {
    const service = ServiceFactory.create({ price: Money.of(100, 'BRL') });
    const booking = Booking.requestBooking(GUEST_ACTOR, SLOT, [service], null);
    expect(booking.lines[0].priceAtBooking).toEqual(Money.of(100, 'BRL'));
  });
});
```

---

## Layer 2 — Application Tests (Use Case + In-Memory Adapters)

**Scope:** Use cases in `application/use-cases/`. Tests the orchestration logic with all external ports replaced by in-memory fakes.

**Rules:**
- No real database, no real Pub/Sub. All ports are in-memory implementations.
- Every use case test MUST include a **tenant isolation assertion** (attempt access as wrong tenant → expect `NotFoundError` or `ForbiddenError`).
- Tests run in milliseconds.

### In-Memory Adapters

In-memory adapters live in `src/shared/testing/` and implement the same port interfaces as real adapters:

```typescript
// src/shared/testing/in-memory-booking.repository.ts
export class InMemoryBookingRepository implements IBookingRepository {
  private store = new Map<string, Booking>();

  async save(booking: Booking): Promise<void> {
    this.store.set(`${booking.tenantId}:${booking.id}`, booking);
  }

  async findByTenant(id: string, tenantId: string): Promise<Booking | null> {
    return this.store.get(`${tenantId}:${id}`) ?? null;
  }

  async findAllByTenant(tenantId: string): Promise<Booking[]> {
    return [...this.store.values()].filter(b => b.tenantId === tenantId);
  }
}

// src/shared/testing/in-memory-event-bus.ts
export class InMemoryEventBus implements IEventBus {
  readonly publishedEvents: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.publishedEvents.push(event);
  }

  async subscribe(_eventName: string, _handler: Function): Promise<void> {}

  clear(): void { this.publishedEvents.length = 0; }
}
```

### Example — Use case test (with mandatory tenant isolation)
```typescript
// src/contexts/booking/application/use-cases/approve-booking.use-case.spec.ts

describe('ApproveBookingUseCase', () => {
  let useCase: ApproveBookingUseCase;
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    useCase = new ApproveBookingUseCase(bookingRepo, eventBus);
  });

  it('should approve a PENDING booking and publish BookingApproved', async () => {
    const booking = BookingFactory.pending({ tenantId: TENANT_A });
    await bookingRepo.save(booking);

    await useCase.execute({ bookingId: booking.id, staffId: STAFF_ID, tenantId: TENANT_A });

    const saved = await bookingRepo.findByTenant(booking.id, TENANT_A);
    expect(saved!.status).toBe(BookingStatus.APPROVED);
    expect(eventBus.publishedEvents).toHaveLength(1);
    expect(eventBus.publishedEvents[0]).toMatchObject({
      eventName: 'BookingApproved',
      tenantId: TENANT_A,
    });
  });

  // ─── MANDATORY TENANT ISOLATION TEST ───────────────────────────────────────
  it('should throw NotFoundError when booking belongs to a different tenant', async () => {
    const booking = BookingFactory.pending({ tenantId: TENANT_A });
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ bookingId: booking.id, staffId: STAFF_ID, tenantId: TENANT_B }),
    ).rejects.toThrow(NotFoundError);

    // no events published for failed cross-tenant attempts
    expect(eventBus.publishedEvents).toHaveLength(0);
  });
  // ───────────────────────────────────────────────────────────────────────────

  it('should throw InvalidStateTransitionError when booking is already APPROVED', async () => {
    const booking = BookingFactory.approved({ tenantId: TENANT_A });
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ bookingId: booking.id, staffId: STAFF_ID, tenantId: TENANT_A }),
    ).rejects.toThrow(InvalidStateTransitionError);

    expect(eventBus.publishedEvents).toHaveLength(0);
  });
});
```

---

## Layer 3 — Infrastructure Tests (Integration)

**Scope:** Repository adapters, event consumers, REST controllers. Uses real PostgreSQL (via Testcontainers) and the real GCP Pub/Sub Emulator.

**Rules:**
- Each context spins up its **own schema only**, not the full DB. Migrations run from `src/contexts/<context>/infrastructure/migrations/`.
- `beforeAll`: start container, run migrations.
- `afterEach`: truncate context tables (not drop) — keeps the schema, clears data.
- `afterAll`: stop container.
- Each test suite creates its own unique `tenantId` (UUID) to avoid cross-test contamination even within the same container.

### Testcontainers setup (per context)
```typescript
// src/contexts/booking/infrastructure/persistence/booking.repository.integration.spec.ts
import { v7 as uuidv7 } from 'uuid';

let dataSource: DataSource;
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:15')
    .withDatabase('ikaro_test')
    .start();

  dataSource = new DataSource({
    type: 'postgres',
    url: container.getConnectionUri(),
    schema: 'booking',   // ← only this context's schema
    entities: [BookingEntity, BookingLineEntity, ServiceEntity, ScheduleClosureEntity],
    migrations: [/* booking context migrations only */],
  });

  await dataSource.initialize();
  await dataSource.runMigrations();
});

afterEach(async () => {
  // truncate in FK-safe order — keeps schema, clears rows
  await dataSource.query('TRUNCATE booking.booking_lines CASCADE');
  await dataSource.query('TRUNCATE booking.bookings CASCADE');
});

afterAll(async () => {
  await dataSource.destroy();
  await container.stop();
});
```

### Example — Repository integration test
```typescript
describe('BookingRepository', () => {
  let repo: BookingRepository;
  const TENANT_A = uuidv7();
  const TENANT_B = uuidv7();

  beforeEach(() => {
    repo = new TypeOrmBookingRepository(dataSource);
  });

  it('should save and retrieve a booking within the same tenant', async () => {
    const booking = BookingFactory.pending({ tenantId: TENANT_A });
    await repo.save(booking);

    const found = await repo.findByTenant(booking.id, TENANT_A);
    expect(found).not.toBeNull();
    expect(found!.tenantId).toBe(TENANT_A);
  });

  it('should return null when booking is queried with wrong tenant', async () => {
    const booking = BookingFactory.pending({ tenantId: TENANT_A });
    await repo.save(booking);

    const found = await repo.findByTenant(booking.id, TENANT_B);
    expect(found).toBeNull(); // tenant isolation enforced at query level
  });

  it('should return only bookings belonging to the queried tenant', async () => {
    await repo.save(BookingFactory.pending({ tenantId: TENANT_A }));
    await repo.save(BookingFactory.pending({ tenantId: TENANT_A }));
    await repo.save(BookingFactory.pending({ tenantId: TENANT_B })); // different tenant

    const results = await repo.findAllByTenant(TENANT_A);
    expect(results).toHaveLength(2);
    expect(results.every(b => b.tenantId === TENANT_A)).toBe(true);
  });
});
```

### Example — Event idempotency test
```typescript
describe('LoyaltyEventConsumer — idempotency', () => {
  it('should insert N entries when BookingCompleted has N lines', async () => {
    const event = BookingCompletedFactory.withLines(3, { tenantId: TENANT_A, customerId: CUSTOMER_ID });
    await consumer.handle(event);

    const entries = await loyaltyRepo.findByCustomer(CUSTOMER_ID, TENANT_A);
    expect(entries).toHaveLength(3);
  });

  it('should be a no-op when the same BookingCompleted event is replayed', async () => {
    const event = BookingCompletedFactory.withLines(3, { tenantId: TENANT_A, customerId: CUSTOMER_ID });

    await consumer.handle(event);
    await consumer.handle(event); // replay — simulates at-least-once delivery

    const entries = await loyaltyRepo.findByCustomer(CUSTOMER_ID, TENANT_A);
    expect(entries).toHaveLength(3); // NOT 6 — UNIQUE(tenant_id, booking_line_id) is the guard
  });

  it('should not create LoyaltyEntries for guest bookings', async () => {
    const event = BookingCompletedFactory.withLines(2, { tenantId: TENANT_A, customerId: null });
    await consumer.handle(event);

    const entries = await loyaltyRepo.findByTenant(TENANT_A);
    expect(entries).toHaveLength(0);
  });
});
```

---

## Layer 4 — Contract Tests (Spectral)

**Scope:** The OpenAPI spec at `docs/api/openapi.yaml` is validated against Spectral rules in CI.

**Goal:** Prevent broken or inconsistent API contracts before a single line of implementation is written or changed.

**Setup:**
```yaml
# .spectral.yml
extends: ['spectral:oas']
rules:
  operation-success-response: warn
  openapi-tags: off
  info-contact: off
```

**CI step (runs in Stage 1 — Static Analysis):**
```bash
npx @stoplight/spectral-cli lint docs/api/openapi.yaml --fail-severity warn
```

**What Spectral enforces:**
- Every endpoint has at least one success response defined.
- Every error response uses RFC 9457 `application/problem+json` content type.
- No `any` or untyped `object` in request/response schemas.
- Required fields are marked as `required`.
- Enum values match the domain model (`PENDING`, `APPROVED`, etc.).

---

## Layer 5 — End-to-End Tests (Playwright)

**Scope:** Full user journeys from browser to database, through the real BFF and backend.

**Rules:**
- Happy path only — edge cases belong to unit and integration layers.
- Run against a **staging environment** (real containers, seeded DB), not against localhost.
- Maximum 5–8 E2E scenarios for MVP. Each one maps to a core UC journey.
- **Assert on user-visible outcomes only.** External side effects (emails, events, webhooks) belong in integration tests — not in Playwright tests — unless the side effect *is* the primary user-visible result of the action being tested. Example: UC-001 (guest submits → PENDING) has no immediate user-facing email, so no MailHog assertion. UC-003 (admin approves → customer email) does — that assertion belongs in the UC-003 E2E test, not here.
- **MailHog is available via `page.request`** (`GET http://localhost:8025/api/v2/messages`) when email verification is appropriate, but only add it when the email is synchronous to the tested action and directly confirms the user journey succeeded.

**MVP E2E scenarios:**
1. Guest submits a booking request → admin receives notification → booking in PENDING (UC-001 + UC-018)
2. Admin approves booking → customer receives confirmation email (UC-003)
3. Staff marks booking complete with actual prices → loyalty entry created (UC-009)
4. Customer cancels an approved booking within window → confirmation email sent (UC-007)
5. Customer login with multiple tenants → tenant selection screen → correct data visible (UC-021)

**Example:**
```typescript
// e2e/guest-booking.spec.ts
test('UC-001: guest can submit a booking request and see pending confirmation', async ({ page }) => {
  await page.goto('/ikaro');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.goto('/ikaro/booking');
  await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();

  await page.locator('[data-testid="service-card"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  await page.locator('[data-testid="day-option"]:not([disabled])').first().click();
  await page.locator('[data-testid="time-slot"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  await page.locator('[data-testid="input-name"]').fill('João Silva');
  await page.locator('[data-testid="input-email"]').fill('joao@test.com.br');
  await page.locator('[data-testid="input-phone"]').fill('31999990000');
  await page.locator('[data-testid="step-next"]').click();

  await page.locator('[data-testid="step-confirm"]').click();
  await expect(page.locator('[data-testid="booking-success"]')).toBeVisible();
});
```

### Translated strings — unit tests vs E2E (mandatory distinction)

| Layer | Asserting translated strings | Rule |
|---|---|---|
| **Unit test** | ✅ Acceptable | Locale IS component behaviour — `getByText('Hoje')` proves `dayLabel()` returns the correct pt-BR string. When i18n ships, inject locale context and update the assertion. |
| **E2E test** | ❌ Never | Locale is an external variable across the whole system. Use `data-testid` exclusively so tests survive any locale change without modification. |

Example of what is correct in a unit test:
```ts
// AvailabilityCarousel.spec.tsx — ✅ testing component behaviour
expect(screen.getByText('Hoje')).toBeInTheDocument(); // dayLabel() for index 0
expect(screen.getByText('Ter')).toBeInTheDocument();  // dayLabel() for Tuesday
```

Example of what is wrong in an E2E test:
```ts
// guest-booking.spec.ts — ❌ breaks when locale changes
await page.getByLabel(/nome/i).fill('E2E Teste');
// ✅ correct
await page.locator('[data-testid="input-name"]').fill('E2E Teste');
```

---

### E2E Selector Strategy (mandatory — all Playwright tests)

**Priority order — use the first that applies:**

**1. Accessibility selectors first**

Use `getByRole`, `getByLabel`, `getByText` for elements users interact with directly. These survive component refactors and test what the user actually sees.

```ts
// ✅ heading confirms the right page rendered
page.getByRole('heading', { level: 1 })

// ✅ label-based — survives HTML restructuring
page.getByLabel(/e-mail/i)
```

**2. `data-testid` for structural anchors**

Good candidates: complex widgets, dynamic content, action buttons, success/error states — anything without a stable accessible name.

```ts
page.locator('[data-testid="booking-success"]')
page.locator('[data-testid="day-option"]')
page.locator('[data-testid="step-next"]')   // action button
page.locator('[data-testid="step-confirm"]') // action button
```

**3. Never encode data into `data-testid`**

Embed the data value in a separate `data-*` attribute. The testid is an identity, not a record key.

```ts
// ✅
<button data-testid="day-option" data-date={date} />
page.locator('[data-testid="day-option"]:not([disabled])').first()

// ❌ — breaks when dates change; couples tests to seed data
<button data-testid={`day-card-${date}`} />
page.locator('[data-testid="day-card-2026-06-01"]')
```

**4. One attribute, one responsibility**

| Attribute | Purpose |
|---|---|
| `data-testid` | Element identity |
| `data-date`, `data-user-id` | Data value |
| `data-status` | Runtime state |

Never mix concerns in a single attribute.

**5. Never assert translated strings**

Hardcoding UI copy in E2E tests breaks under i18n. Use `data-testid` on action buttons instead.

```ts
// ✅ — survives translation to any language
page.locator('[data-testid="step-next"]').click()

// ❌ — breaks the day localization ships
page.getByRole('button', { name: 'Próximo' }).click()
```

When a heading or label is the right locator (rule 1), use a **case-insensitive regex** so capitalisation changes don't break the test:

```ts
// ✅
page.getByLabel(/e-mail/i)
page.getByRole('heading', { name: /escolha os serviços/i })
```

---

## Test Data Factories

Every test that needs domain objects uses a **Factory** — never constructs aggregates by hand. Factories live in `src/shared/testing/factories/`.

```typescript
// src/shared/testing/factories/booking.factory.ts
export const BookingFactory = {
  pending(overrides?: Partial<BookingProps>): Booking {
    return Booking.requestBooking(
      overrides?.actor ?? GuestActorFactory.create(),
      overrides?.slot ?? SlotFactory.tomorrow(),
      overrides?.services ?? [ServiceFactory.basicWash()],
      overrides?.pickupAddress ?? null,
    );
  },

  approved(overrides?: Partial<BookingProps>): Booking {
    const booking = BookingFactory.pending(overrides);
    booking.approveBooking(overrides?.staffId ?? STAFF_ID);
    booking.clearDomainEvents(); // clean slate for the test's assertions
    return booking;
  },

  withStatus(status: BookingStatus, overrides?: Partial<BookingProps>): Booking {
    // ... build booking in the required state
  },
};
```

**Rule:** Factories always produce **valid** domain objects. Use `overrides` to target specific scenarios — never build invalid states by bypassing the aggregate.

### Shared test constants
```typescript
// src/shared/testing/constants.ts
export const TENANT_A = '00000000-0000-0000-0000-000000000001' as TenantId;
export const TENANT_B = '00000000-0000-0000-0000-000000000002' as TenantId;
export const STAFF_ID = '00000000-0000-0000-0000-000000000010' as StaffId;
export const CUSTOMER_ID = '00000000-0000-0000-0000-000000000020' as CustomerId;
```

---

## Tenant Isolation Test — Mandatory Pattern

Every use case test file **must** contain at least one test that crosses tenant boundaries and asserts isolation. This is the minimum viable isolation test:

```typescript
// Pattern: create data in TENANT_A, attempt access as TENANT_B
it('should not expose TENANT_A data to TENANT_B', async () => {
  // Arrange: create resource in tenant A
  const resource = await createInTenantA();

  // Act: attempt access as tenant B
  const result = actor === 'customer-or-staff'
    ? await useCase.execute({ id: resource.id, tenantId: TENANT_B })
    : await repo.findByTenant(resource.id, TENANT_B);

  // Assert: either null (repository) or NotFoundError (use case)
  expect(result).toBeNull(); // or .rejects.toThrow(NotFoundError)
});
```

**Named exports to reuse across suites:**
```typescript
// src/shared/testing/tenant-isolation.helper.ts
export function expectTenantIsolation(
  fn: () => Promise<unknown>,
): Promise<void> {
  return expect(fn()).rejects.toThrow(NotFoundError);
}
```

---

## Architecture Isolation Test

This test enforces the Context Isolation Contract (Rule 1 in `docs/05-BOUNDED_CONTEXTS.md`) at build time. It uses ESLint import rules, not a custom test.

All 30 pairs (6 contexts × 5 forbidden sources) are listed explicitly — no "repeat for all" shortcuts. Every pair must be present for the rule to be complete.

```jsonc
// apps/backend/.eslintrc.js  (or eslint.config.ts)
{
  "rules": {
    "import/no-restricted-paths": [
      "error",
      {
        "zones": [
          // ── Booking cannot import from ───────────────────────────────────────
          { "target": "./src/contexts/booking",      "from": "./src/contexts/customer" },
          { "target": "./src/contexts/booking",      "from": "./src/contexts/staff" },
          { "target": "./src/contexts/booking",      "from": "./src/contexts/loyalty" },
          { "target": "./src/contexts/booking",      "from": "./src/contexts/notification" },
          { "target": "./src/contexts/booking",      "from": "./src/contexts/platform" },

          // ── Customer cannot import from ──────────────────────────────────────
          { "target": "./src/contexts/customer",     "from": "./src/contexts/booking" },
          { "target": "./src/contexts/customer",     "from": "./src/contexts/staff" },
          { "target": "./src/contexts/customer",     "from": "./src/contexts/loyalty" },
          { "target": "./src/contexts/customer",     "from": "./src/contexts/notification" },
          { "target": "./src/contexts/customer",     "from": "./src/contexts/platform" },

          // ── Staff cannot import from ─────────────────────────────────────────
          { "target": "./src/contexts/staff",        "from": "./src/contexts/booking" },
          { "target": "./src/contexts/staff",        "from": "./src/contexts/customer" },
          { "target": "./src/contexts/staff",        "from": "./src/contexts/loyalty" },
          { "target": "./src/contexts/staff",        "from": "./src/contexts/notification" },
          { "target": "./src/contexts/staff",        "from": "./src/contexts/platform" },

          // ── Loyalty cannot import from ───────────────────────────────────────
          { "target": "./src/contexts/loyalty",      "from": "./src/contexts/booking" },
          { "target": "./src/contexts/loyalty",      "from": "./src/contexts/customer" },
          { "target": "./src/contexts/loyalty",      "from": "./src/contexts/staff" },
          { "target": "./src/contexts/loyalty",      "from": "./src/contexts/notification" },
          { "target": "./src/contexts/loyalty",      "from": "./src/contexts/platform" },

          // ── Notification cannot import from ──────────────────────────────────
          { "target": "./src/contexts/notification", "from": "./src/contexts/booking" },
          { "target": "./src/contexts/notification", "from": "./src/contexts/customer" },
          { "target": "./src/contexts/notification", "from": "./src/contexts/staff" },
          { "target": "./src/contexts/notification", "from": "./src/contexts/loyalty" },
          { "target": "./src/contexts/notification", "from": "./src/contexts/platform" },

          // ── Platform cannot import from ──────────────────────────────────────
          { "target": "./src/contexts/platform",     "from": "./src/contexts/booking" },
          { "target": "./src/contexts/platform",     "from": "./src/contexts/customer" },
          { "target": "./src/contexts/platform",     "from": "./src/contexts/staff" },
          { "target": "./src/contexts/platform",     "from": "./src/contexts/loyalty" },
          { "target": "./src/contexts/platform",     "from": "./src/contexts/notification" }
        ]
      }
    ]
  }
}
```

This makes cross-context imports a **lint error** caught in CI Stage 1 (Static Analysis), long before tests run.

> **Note on `src/shared/`:** The rule above only restricts context-to-context imports. Imports from `src/shared/` are always allowed from any context — that is the intended cross-cutting path.

---

## BookingRescheduled Test Examples

UC-008 (admin reschedules) produces a `BookingRescheduled` event and requires its own test coverage. It is easy to miss because the booking status does not change (stays `APPROVED`) — only `scheduledAt` updates.

### Domain unit test — aggregate

```typescript
// src/contexts/booking/domain/entities/booking.entity.spec.ts

describe('Booking / rescheduleBooking()', () => {
  it('should update scheduledAt and emit BookingRescheduled when APPROVED', () => {
    const booking = BookingFactory.approved({ tenantId: TENANT_A });
    const previousSlot = booking.scheduledAt;
    const newSlot = SlotFactory.nextWeek();

    booking.rescheduleBooking(STAFF_ID, newSlot, 'Customer request');

    expect(booking.status).toBe(BookingStatus.APPROVED);   // status unchanged
    expect(booking.scheduledAt).toEqual(newSlot.startTime);
    expect(booking.domainEvents).toContainEqual(
      expect.objectContaining({
        eventName: 'BookingRescheduled',
        tenantId: TENANT_A,
        data: expect.objectContaining({
          newSlot: expect.objectContaining({ startTime: newSlot.startTime }),
          previousSlot: expect.objectContaining({ startTime: previousSlot }),
          rescheduledBy: STAFF_ID,
        }),
      }),
    );
  });

  it('should throw InvalidStateTransitionError when rescheduling a PENDING booking', () => {
    const booking = BookingFactory.pending({ tenantId: TENANT_A });
    expect(() => booking.rescheduleBooking(STAFF_ID, SlotFactory.nextWeek(), null))
      .toThrow(InvalidStateTransitionError);
  });

  it('should throw InvalidStateTransitionError when rescheduling a COMPLETED booking', () => {
    const booking = BookingFactory.completed({ tenantId: TENANT_A });
    expect(() => booking.rescheduleBooking(STAFF_ID, SlotFactory.nextWeek(), null))
      .toThrow(InvalidStateTransitionError);
  });
});
```

### Use case test — with mandatory tenant isolation

```typescript
// src/contexts/booking/application/use-cases/reschedule-booking.use-case.spec.ts

describe('RescheduleBookingUseCase', () => {
  let useCase: RescheduleBookingUseCase;
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    eventBus    = new InMemoryEventBus();
    useCase     = new RescheduleBookingUseCase(bookingRepo, eventBus);
  });

  it('should update scheduledAt and publish BookingRescheduled', async () => {
    const booking = BookingFactory.approved({ tenantId: TENANT_A });
    await bookingRepo.save(booking);
    const newSlot = SlotFactory.nextWeek();

    await useCase.execute({
      bookingId:    booking.id,
      tenantId:     TENANT_A,
      staffId:      STAFF_ID,
      newScheduledAt: newSlot.startTime,
      adminNotes:   'Reagendado a pedido do cliente',
    });

    const saved = await bookingRepo.findByTenant(booking.id, TENANT_A);
    expect(saved!.scheduledAt).toEqual(newSlot.startTime);
    expect(saved!.status).toBe(BookingStatus.APPROVED);
    expect(eventBus.publishedEvents).toHaveLength(1);
    expect(eventBus.publishedEvents[0]).toMatchObject({
      eventName: 'BookingRescheduled',
      tenantId:  TENANT_A,
    });
  });

  // ─── MANDATORY TENANT ISOLATION TEST ───────────────────────────────────────
  it('should throw NotFoundError when booking belongs to a different tenant', async () => {
    const booking = BookingFactory.approved({ tenantId: TENANT_A });
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        bookingId:      booking.id,
        tenantId:       TENANT_B,   // wrong tenant
        staffId:        STAFF_ID,
        newScheduledAt: SlotFactory.nextWeek().startTime,
        adminNotes:     null,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(eventBus.publishedEvents).toHaveLength(0);
  });
  // ───────────────────────────────────────────────────────────────────────────

  it('should throw SlotUnavailableError when the new slot conflicts', async () => {
    const existing = BookingFactory.approved({ tenantId: TENANT_A });
    const target   = BookingFactory.approved({ tenantId: TENANT_A });
    await bookingRepo.save(existing);
    await bookingRepo.save(target);

    // Try to reschedule `target` into the slot already taken by `existing`
    await expect(
      useCase.execute({
        bookingId:      target.id,
        tenantId:       TENANT_A,
        staffId:        STAFF_ID,
        newScheduledAt: existing.scheduledAt,
        adminNotes:     null,
      }),
    ).rejects.toThrow(SlotUnavailableError);

    expect(eventBus.publishedEvents).toHaveLength(0);
  });
});
```

> `BookingRescheduled` is consumed only by **Notification Context** (sends the customer a "your booking has been rescheduled" email). Loyalty Context does NOT consume this event — reschedule does not affect points.

---

## Test Parallelism

- **Domain and application tests** are stateless — run fully in parallel (`--runInBand false`, default Jest behaviour).
- **Integration tests** each spin up their own Testcontainers instance. They run in parallel using Jest's `--maxWorkers` setting. Because each context owns its own schema and each test generates a unique `tenantId` (UUID), there are no port or data conflicts.
- **E2E tests** run sequentially against staging (Playwright default). Parallel E2E requires separate worker slots and isolated staging data — post-MVP.

---

## Quality Gates (CI)

| Gate | Tool | Failure action |
|---|---|---|
| Zero lint errors | ESLint + Prettier | Block merge |
| Zero cross-context imports | ESLint `no-restricted-paths` | Block merge |
| Type check passes | `tsc --noEmit` | Block merge |
| All tests pass (100%) | Jest / Vitest | Block merge |
| Coverage ≥ 80% on **changed code** | SonarCloud (differential) | Block merge |
| OpenAPI spec valid | Spectral | Block merge |
| Security scan clean | Snyk + Gitleaks | Block merge |

> Coverage is **differential** (changed files only), not a global project threshold. SonarCloud computes this on the PR diff. The Jest/Vitest coverage report feeds into SonarCloud.

---

## Forbidden Patterns

| Pattern | Reason | Fix |
|---|---|---|
| `it.skip(...)` / `describe.skip(...)` | Hides test failures from CI | Delete the test or fix it |
| `it.only(...)` | Masks failures in other tests | Remove before committing |
| `setTimeout` in test body | Makes tests flaky and slow | Use `await`, proper async, or fake timers |
| Mocking a real TypeORM repository in a use case test | Doesn't test real SQL behaviour | Use in-memory adapter for use case layer; real DB for infrastructure layer |
| Shared mutable test state between `it` blocks | Makes tests order-dependent and flaky | Use `beforeEach` to reset state |
| Direct DB writes in domain or application tests | Bypasses aggregate invariants | Use factories; let the aggregate persist via the in-memory adapter |
| Hardcoding a fixed `tenantId` across parallel integration tests | Causes data contamination between suites | Generate a fresh `uuidv7()` per test suite (`import { v7 as uuidv7 } from 'uuid'`) |

---

## Testing Environments

| Environment | Purpose | Data source |
|---|---|---|
| **Local** | Fast feedback during development | Testcontainers (ephemeral) |
| **CI runner** | Gate on every PR | Testcontainers (ephemeral, spun per job) |
| **Staging** | E2E tests + UAT | Seeded data, reset between runs |
| **Production** | — | Never tested against directly |

---

## File Structure Reference

```
src/contexts/booking/
├── domain/
│   ├── entities/
│   │   ├── booking.entity.ts
│   │   └── booking.entity.spec.ts          ← domain unit test
│   └── services/
│       ├── availability.service.ts
│       └── availability.service.spec.ts    ← domain unit test
├── application/
│   └── use-cases/
│       ├── approve-booking.use-case.ts
│       └── approve-booking.use-case.spec.ts ← application test (in-memory adapters)
└── infrastructure/
    ├── persistence/
    │   ├── booking.repository.ts
    │   └── booking.repository.integration.spec.ts  ← integration test (Testcontainers)
    ├── controllers/
    │   ├── booking.controller.ts
    │   └── booking.controller.integration.spec.ts  ← HTTP integration (Supertest)
    └── event-consumers/
        ├── booking-completed.consumer.ts
        └── booking-completed.consumer.integration.spec.ts  ← event + idempotency test

src/shared/testing/
├── constants.ts             ← TENANT_A, TENANT_B, STAFF_ID, CUSTOMER_ID
├── in-memory-event-bus.ts   ← IEventBus in-memory implementation
├── in-memory-booking.repository.ts
├── in-memory-loyalty.repository.ts
├── ... (one per context port)
└── factories/
    ├── booking.factory.ts
    ├── service.factory.ts
    ├── customer.factory.ts
    └── loyalty-entry.factory.ts

e2e/
├── guest-booking.spec.ts
├── admin-approve.spec.ts
├── complete-with-actual-prices.spec.ts
├── customer-cancel.spec.ts
└── customer-login-tenant-selection.spec.ts
```

---

## Mandatory Patterns (enforced — no exceptions)

### Builder class pattern (all test data)

Always use a **class** with fluent `withXxx()` methods and a `build()` call. Never use a plain factory function (`function makeFoo(...): Foo { return {...} as Foo }`).

| Test data type | Builder location |
|---|---|
| TypeORM entities | `src/test/builders/<context>/XxxEntityBuilder` (`id` defaults to `uuidv7()`) |
| Domain aggregates | `src/test/builders/<context>/XxxBuilder` |
| Shared infra stubs (e.g. TenantContext) | `src/test/factories/XxxBuilder` — e.g. `TenantContextBuilder` at `src/test/factories/tenant-context.factory.ts` |

### Test setup pattern

**Never** use factory helper functions (`makeUseCase`, `make`, etc.) at describe scope. Always use `let` declarations + `beforeEach` to wire dependencies.

```typescript
// ✅ CORRECT
let useCase: ApproveBookingUseCase;
let repo: InMemoryBookingRepository;
beforeEach(() => {
  repo = new InMemoryBookingRepository();
  useCase = new ApproveBookingUseCase(repo, new InMemoryTransactionManager());
});

// ❌ WRONG
const makeUseCase = () => new ApproveBookingUseCase(...);
```

### InMemory port doubles

Every cross-context port used in tests needs an `InMemoryXxxPort` class in `src/test/infrastructure/` — never a `jest.fn()` inline mock. Provide a sensible default state with setter methods for overrides.

Example: `InMemoryScheduleTenantSettingsPort` defaults to Mon–Sat open, Sunday null.

### BFF: two test files per controller (mandatory)

Every `*.controller.ts` in `apps/bff/src/` must have:
- `*.controller.spec.ts` — unit spec
- `*.controller.component.spec.ts` — boots full `AppModule` via `createTestApp()`, mocks `BackendHttpService`; must cover: 401, 403, 400 (Zod), happy path per allowed role, backend error propagation

Canonical examples: `services.controller.component.spec.ts`, `schedule.controller.component.spec.ts`.

### BFF test helper file isolation

`apps/bff/src/test/` has a hard dependency boundary:
- `component-test.helpers.ts` — **component specs only** (imports `AppModule`)
- `backend-http.mock.ts` — **unit specs only** (no `AppModule` dependency)

Never import `component-test.helpers.ts` from a unit spec: it triggers `AppModule` load → `validateEnv()` before env vars are set → crashes 5+ test suites under `jest --coverage`.

BFF `test:cov` must exclude component specs from coverage collection for the same reason.

In `afterEach`, use `resetAllMocks()` not `clearAllMocks()` — `clearAllMocks` leaves `mockReturnValueOnce` queues intact, causing cross-test leakage.

### Shared date helpers (mandatory — never inline)

`src/test/utils/date-helpers.ts` exports:
- `futureDate(daysAhead = 1)` — `YYYY-MM-DD` string, UTC
- `pastDate(daysAgo = 1)` — `YYYY-MM-DD` string, UTC
- `nextWeekday(utcDayOfWeek: 0–6, weeksAhead?)` — next future date for that UTC day. 0 = Sunday … 6 = Saturday.

Always import these; never define `futureDate`, `pastDate`, `nextSunday`, `nextMonday`, etc. inline in any spec file.

### Shared address helper (mandatory — never inline)

`src/test/utils/address-helpers.ts` exports `testAddress(overrides?: Partial<AddressProps>): Address` — a valid Brazilian `Address` VO with sensible defaults. Always import it instead of calling `Address.create({...})` inline.

### Integration test DB isolation

Integration tests share a live DB with no cleanup between tests in the same file. Any `it()` sensitive to aggregate counts (`countActiveManagersByTenant`, `total` in pagination, etc.) **must use a unique tenant UUID** that no other test in the file writes to. Never reuse suite-level `TENANT_A`/`TENANT_B` constants for count-sensitive assertions.

### Registering new migrations and entities in the global setup (MANDATORY)

`src/test/integration-global-setup.ts` holds **explicit** import lists — it does not use a glob. Every time you add a new TypeORM entity or migration you **must** update this file or integration tests will fail with `column X does not exist` / `relation X does not exist`.

**Checklist — do this in the same commit as the migration:**

1. **Import the migration class** at the top of `integration-global-setup.ts`.
2. **Add the migration** to the `migrations: [...]` array, keeping timestamp order.
3. **Import the TypeORM entity class** if it is new.
4. **Add the entity** to the `entities: [...]` array.
5. **If the context has its own integration app helper** (e.g. `notification-integration-app.ts`), add the new entity there too.

Skipping any of these steps is a silent failure: unit tests pass (InMemory doubles never touch the DB), but integration tests will error on the first query that touches the new column/table.

### Integration app helpers — mandatory default overrides for network-calling adapters

Any module that imports an adapter whose `onApplicationBootstrap()` makes a network call (e.g. `StorageModule` → `GcsSignedUrlAdapter` connects to the GCS emulator) will cause **every** integration test using that module to fail with `ECONNREFUSED` when the external service is not running — even tests completely unrelated to that adapter.

**Rule:** every integration app helper that imports such a module must default-override the adapter's token with an in-memory stub before callers can add their own overrides:

```ts
let builder = Test.createTestingModule({ imports: [..., BookingModule] })
  .overrideProvider(EVENT_BUS)
  .useValue(routingBus)
  .overrideProvider(STORAGE_SERVICE)          // default — prevents GcsSignedUrlAdapter from being instantiated
  .useValue(new InMemoryStorageService());

for (const { provide, useValue } of overrideProviders) {
  builder = builder.overrideProvider(provide).useValue(useValue);  // caller's override wins
}
```

Currently affected helpers and their default overrides:

| Helper | Token overridden by default |
|---|---|
| `createBookingIntegrationApp()` | `STORAGE_SERVICE` → `InMemoryStorageService` |
| `createNotificationIntegrationApp()` | `STORAGE_SERVICE` → `InMemoryStorageService` (BookingModule pulled via `extraModules`) |

**When adding a new shared module with a network-calling adapter:** update every integration app helper that imports that module (directly or via `extraModules`) to add a default override for the new token.

**Root cause gotcha — `useExisting` vs `useClass`:** if the shared module uses `useExisting` to register the adapter (`providers: [Adapter, { provide: TOKEN, useExisting: Adapter }]`), overriding the token in tests only removes the alias — the standalone `Adapter` class is still instantiated. Always use `useClass` in shared module providers so that overriding the token is sufficient to suppress instantiation.

### Notification integration spec helper

All notification story integration specs must use `createNotificationIntegrationApp()` from `src/test/utils/notification-integration-app.ts`.

Options: `dispatcher` (required), `configure` (override providers), `extraModules`, `extraEntities`, `withTenantInterceptor`. Returns `{ app, ds, eventBus }`. Never repeat `TypeOrmModule.forRoot` inline.

### Notification cross-handler isolation

`NotificationModule` registers ALL handlers. When a spec runs concurrently with another spec that publishes events those handlers subscribe to, the handler processes foreign events and contaminates idempotency checks. Suppress unrelated handlers with a no-op override:

```typescript
const noOpXxxHandler = { onModuleInit: () => undefined, handle: async () => undefined };
configure: (b) => b.overrideProvider(XxxHandler).useValue(noOpXxxHandler)
```

Canonical example: `booking-requested.handler.integration.spec.ts` suppresses `StaffInvitedHandler`.

### Idempotency baseline drain (mandatory — provisioning noise)

When the provisioning flow also emits the same event type you are testing idempotency for, the provisioning's notification email may arrive after you capture `countBeforeRedeliver`, causing a false-positive failure. Extend the initial `waitFor` to also confirm the provisioning's `NotificationLog` row is written before recording the baseline:

```typescript
await waitFor(async () => {
  const aggregate = await ds.getRepository(XxxEntity).findOne({ where: { tenantId, ... } });
  if (!aggregate) return false;
  const provisioningLog = await ds.getRepository(NotificationLogEntity)
    .findOne({ where: { tenantId, notificationType: 'STAFF_INVITED', channel: 'EMAIL' } });
  return provisioningLog !== null;
});
// Only now: publish synthetic event and record countBeforeRedeliver
```

### Controller integration spec — event bus override

Override `EVENT_BUS` with `new InMemoryEventBus()` in all controller integration specs that don't need end-to-end Pub/Sub routing. Without this override, `GcpPubSubEventBusAdapter` connects to the emulator — gRPC timeouts fail every test if the emulator is unreachable.
