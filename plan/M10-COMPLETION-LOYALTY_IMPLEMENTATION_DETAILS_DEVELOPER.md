# M10 — Booking Completion + Loyalty: Implementation Details (Developer)

This document explains every concept, decision, and pattern introduced in M10. It is written so a developer can understand the "why" behind each choice — covering DDD aggregate design, Pub/Sub idempotency, cross-context data access, and the HTTP-trigger pattern for scheduled jobs.

---

## 1. Overview

M10 delivers the loyalty points system. When an admin marks a booking complete, the customer earns points automatically. Those points can be viewed, redeemed by an admin, and expire after a configurable number of days. The expiry is triggered by a daily HTTP call from GCP Cloud Scheduler.

The Loyalty context introduces three aggregates, two Pub/Sub event consumers, six use cases, and an internal HTTP trigger — all following the hexagonal architecture pattern established in earlier milestones.

---

## 2. The Three Aggregates

### LoyaltyEntry (append-only)

A `LoyaltyEntry` is an immutable record of points earned for one completed booking line. Once inserted, it is never updated or deleted.

```ts
// domain/loyalty-entry.aggregate.ts
static record(params: RecordLoyaltyEntryParams): LoyaltyEntry {
  if (params.points <= 0) throw new LoyaltyInvalidPointsError();
  const earnedAt = new Date();
  const expiresAt = new Date(earnedAt.getTime() + params.expiryDays * 24 * 60 * 60 * 1000);
  // ...returns new LoyaltyEntry with a UUIDv7 id
}
```

**Why append-only?** Loyalty entries are an audit trail. Mutating them after the fact would create trust issues (did the admin change the points?). Immutability is enforced at the DB level with `CHECK (points > 0)` and no UPDATE migrations ever written against this table.

**Idempotency key:** `UNIQUE(tenant_id, booking_line_id)` — if `BookingCompleted` is replayed by Pub/Sub, the second insert fails the constraint and the use case is a no-op.

### LoyaltyBalance (mutable running total)

`LoyaltyBalance` is a single row per `(tenant_id, customer_id)` holding the current active point total. It is the source of truth for "how many points does this customer have?" — never computed via SUM over entries.

```ts
// Why not SUM?
// 1. O(n) query grows with every booking the customer has ever made
// 2. Redemptions reduce the balance — you'd need to subtract redemptions too
// 3. Expiry reduces the balance — you'd need to subtract expired entries
// With a running total: balance read = O(1), single row

increment(points: number): void {
  if (points <= 0) throw new LoyaltyInvalidPointsError();
  this.props.currentPoints += points;
}

decrement(points: number): void {
  if (points <= 0) throw new LoyaltyInvalidPointsError();
  if (points > this.props.currentPoints) throw new LoyaltyInsufficientPointsError();
  this.props.currentPoints -= points;
}
```

The balance is upserted (INSERT ON CONFLICT UPDATE) because the first time a customer earns points, no row exists yet. After that, updates overwrite the existing row.

### LoyaltyRedemption (append-only)

A `LoyaltyRedemption` records each time an admin redeems points on behalf of a customer. Like `LoyaltyEntry`, it is immutable — an audit trail of every redemption event.

```ts
static record(params: RecordLoyaltyRedemptionParams): LoyaltyRedemption {
  // no domain events — this is a synchronous admin action, no async processing
}
```

**No domain event for redemption.** Unlike earning (which triggers an async notification), redemption happens at the counter with the customer present. The use case writes both the balance decrement and the redemption row atomically in one transaction — no async fan-out needed.

---

## 3. The Earn Flow: BookingCompleted → LoyaltyEntry + ServicePointsEarned

### What happens when a booking is completed

```
Admin calls PATCH /v1/bookings/:id/complete (BFF)
  → CompleteBookingUseCase (backend)
    → booking.complete() → adds BookingCompleted domain event
    → txManager.run() → saves booking
  → booking.clearDomainEvents() → eventBus.publish(BookingCompleted)

[Pub/Sub delivers BookingCompleted to loyalty subscriber]
  → BookingCompletedHandler.handle(event) [loyalty context]
    → RecordLoyaltyEntriesUseCase.execute(dto)
```

### RecordLoyaltyEntriesUseCase step-by-step

```ts
// 1. Idempotency check — Pub/Sub delivers at-least-once
const alreadyProcessed = await processedEventRepo.hasBeenProcessed(eventId, CONSUMER_NAME);
if (alreadyProcessed) return { skipped: true };

// 2. Guest bookings have no customerId — skip loyalty
if (!dto.customerId) return { skipped: true };

// 3. Load expiry days from tenant settings
const { expiryDays } = await tenantSettingsPort.getLoyaltySettings(dto.tenantId);

// 4. Create one LoyaltyEntry per line — each emits ServicePointsEarned
const entries = dto.lines.map(line =>
  LoyaltyEntry.record({ ...line, points: line.pointsValueAtBooking, expiryDays })
);

// 5. Load or create balance
let balance = await balanceRepo.findByCustomer(tenantId, customerId);
if (!balance) balance = LoyaltyBalance.create(tenantId, customerId);
balance.increment(totalPoints);

// 6. ALL saves in one transaction — entries + balance + processed_events mark
await txManager.run(async () => {
  for (const entry of entries) await entryRepo.save(entry);
  await balanceRepo.upsert(balance);
  await processedEventRepo.markProcessed(eventId, CONSUMER_NAME);
});

// 7. Publish events AFTER commit — post-commit flush pattern
for (const entry of entries) {
  const events = entry.clearDomainEvents();
  for (const event of events) await eventBus.publish(event);
}
```

**Why TenantContext is not available in handlers.** Pub/Sub handlers run outside the HTTP request lifecycle. The `AsyncLocalStorage`-based `TenantContext` is only populated by `TenantInterceptor` on HTTP requests. Therefore, loyalty settings are loaded via a dedicated port (`ILoyaltyTenantSettingsPort`) that takes `tenantId` as a parameter — not from the request context.

**Why events are published after `txManager.run()`.** If you publish inside the transaction and the commit fails, Pub/Sub subscribers receive events for data that was never persisted. By flushing after commit, you guarantee the DB and the event bus stay in sync (eventual consistency, not phantom consistency).

---

## 4. Cross-Context Data Access — Two Patterns Used in M10

### Pattern A: Port + Adapter calling a use case (LoyaltyTenantSettingsAdapter)

The Loyalty context needs `settings.loyalty.expiry_days` from the Platform context. The solution is a port interface in Loyalty + an adapter that delegates to an existing Platform use case:

```ts
// loyalty/application/ports/loyalty-tenant-settings.port.ts
export interface ILoyaltyTenantSettingsPort {
  getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings>;
}

// loyalty/infrastructure/cross-context/loyalty-tenant-settings.adapter.ts
@Injectable()
export class LoyaltyTenantSettingsAdapter implements ILoyaltyTenantSettingsPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings> {
    try {
      const result = await this.getTenantById.execute(tenantId);
      return { expiryDays: result.settings.loyalty.expiry_days };
    } catch {
      return { expiryDays: 180 }; // fallback if tenant not found
    }
  }
}
```

The adapter injects `GetTenantByIdUseCase` (a service class), not the platform repository. Context isolation invariant: adapters may call **services** from other contexts, never their **repository tokens**.

### Pattern B: DataSource injection for read-only cross-context queries (ServiceCatalogAdapter)

When the Loyalty context needs to resolve service names for the entries list, it queries `booking.services` directly via TypeORM `DataSource`. No repository token import needed:

```ts
// loyalty/infrastructure/cross-context/service-catalog.adapter.ts
@Injectable()
export class ServiceCatalogAdapter implements IServiceCatalogPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findServicesByIds(tenantId: string, serviceIds: string[]): Promise<ServiceSummary[]> {
    const rows = await this.dataSource.getRepository(ServiceEntity).find({
      where: { tenantId, id: In(serviceIds) },
      select: ['id', 'name'],
    });
    return rows.map(r => ({ serviceId: r.id, serviceName: r.name }));
  }
}
```

This pattern is used when:
- The read is truly cross-context (data owned by another context's schema)
- You only need a lightweight projection (id + name), not the full aggregate
- The source context doesn't export a useful query service

---

## 5. The Balance View: nextExpiryDate

`GET /loyalty/balance` returns not just `currentPoints` but also `nextExpiryDate` and `nextExpiryPoints` — the earliest date when points will expire and how many will go at that time.

```ts
// get-loyalty-balance.use-case.ts
const balance = await balanceRepo.findByCustomer(tenantId, customerId);
const nextExpiry = await entryRepo.findNextExpiry(tenantId, customerId);

return {
  currentPoints: balance?.currentPoints ?? 0,
  nextExpiryDate: nextExpiry?.expiryDate.toISOString() ?? null,
  nextExpiryPoints: nextExpiry?.points ?? null,
};
```

`findNextExpiry` queries the `loyalty_entries` table for the earliest `expires_at` in the future for this customer, then sums all points expiring on that exact date. The index on `(tenant_id, customer_id, expires_at)` makes this efficient.

**Why not store nextExpiryDate on the balance row?** It would need to be recomputed on every expiry trigger run and every new entry insert. The current approach: two queries, both indexed — acceptable for MVP.

---

## 6. The Redemption Flow

Admin calls `POST /v1/loyalty/redeem` (BFF) → `RedeemPointsUseCase`:

```ts
// 1. Load balance — 404 if not found (customer has never earned)
const balance = await balanceRepo.findByCustomer(tenantId, customerId);
if (!balance) throw new LoyaltyBalanceNotFoundError();

// 2. Decrement — throws LoyaltyInsufficientPointsError if points > currentPoints
balance.decrement(pointsToRedeem);

// 3. Create immutable redemption record
const redemption = LoyaltyRedemption.record({ tenantId, customerId, pointsRedeemed, redeemedBy, notes, bookingId });

// 4. Atomic write
await txManager.run(async () => {
  await balanceRepo.upsert(balance);
  await redemptionRepo.save(redemption);
});
```

No domain event is emitted. Redemption is a synchronous admin action — the customer is present and the admin immediately confirms it. No async fan-out is needed.

---

## 7. Points Expiry — Why HTTP Trigger Instead of @Cron

The original plan specified `@nestjs/schedule` with a `@Cron('0 2 * * *')` decorator. This was changed to an HTTP endpoint during story discovery for two reasons:

**Reason 1: Cloud Run scales to zero.** Cloud Run will shut down the container if there is no traffic for a period. An in-process cron decorator has no process to run in if the container is sleeping. You'd deploy and discover the cron never fired.

**Reason 2: Multi-pod deployments.** If the app runs with 3 replicas (e.g. during peak hours or a canary deploy), `@Cron` fires on all 3 pods simultaneously. Even with idempotency, you'd have 3 processes competing to process the same entries at the same time — wasteful and harder to reason about.

**The solution:** GCP Cloud Scheduler issues one HTTP POST at the scheduled time. Exactly one Cloud Run instance handles it.

```ts
// infrastructure/controllers/internal-loyalty.controller.ts
@Controller('internal/loyalty')
export class InternalLoyaltyController {
  constructor(private readonly expirePoints: ExpirePointsUseCase) {}

  @Post('expire-points')
  @HttpCode(HttpStatus.OK)
  runExpiry(): Promise<ExpirePointsResult> {
    return this.expirePoints.execute().catch(mapLoyaltyError);
  }
}
```

No `@UseGuards` in MVP — the backend is only reachable from within GCP's network. M115-S03 adds `InternalApiGuard` with `X-Internal-Key` header validation, consistent with the other `/internal/*` controllers.

### ExpirePointsUseCase idempotency

The use case is idempotent via `balance_expiry_log`. If Cloud Scheduler fires twice (restart during deploy), the second run finds all entries already in the log and returns `{ processedEntries: 0 }`:

```ts
// 1. Find all expired entries
const expired = await entryRepo.findExpiringBefore(new Date());

// 2. Filter out already-processed (idempotency check)
const unprocessed = [];
for (const entry of expired) {
  if (!(await expiryLogRepo.hasBeenProcessed(entry.id))) {
    unprocessed.push(entry);
  }
}

// 3. Group by (tenantId, customerId), sum points
// 4. For each group: decrement balance (clamped), write expiry log atomically
await txManager.run(async () => {
  if (balance && pointsToDecrement > 0) await balanceRepo.upsert(balance);
  for (const entry of entries) await expiryLogRepo.markProcessed(entry.id);
});
```

**Clamp instead of throw on balance deficit.** If a customer redeemed all their points but still has entries in the database (the entries are never deleted), the expiry run would find `expiredPoints > balance.currentPoints`. Rather than throw `LoyaltyInsufficientPointsError`, the use case clamps: `Math.min(expiredPoints, balance.currentPoints)`. Points that are already gone don't need to expire again. Entries are still marked processed to prevent infinite retries.

---

## 8. The ServicePointsEarned Notification

When `RecordLoyaltyEntriesUseCase` publishes `ServicePointsEarned`, the Notification context consumer sends a thank-you email to the customer.

Two new cross-context ports were introduced in the Notification context for this:
- `INotificationCustomerPort` — gets customer email and name from CustomerQueryService
- `INotificationServicePort` — gets service name from `booking.services` via DataSource

Both follow the same patterns as the Loyalty context cross-context adapters.

`currentBalance` is included in the `ServicePointsEarned` payload so the email can say "you now have X points total" without the notification use case needing an additional DB query. This was added as a preparatory fix on the M10-S04 branch.

---

## 9. BFF Loyalty Routes

The BFF exposes two sets of loyalty endpoints — one for customers (reads own data) and one for admin (reads any customer's data within the tenant):

```
Customer (JWT role = CUSTOMER):
  GET  /v1/loyalty/balance
  GET  /v1/loyalty/entries?page&limit
  GET  /v1/loyalty/redemptions?page&limit

Admin (JWT role = MANAGER|STAFF):
  GET  /v1/customers/:customerId/loyalty/balance
  GET  /v1/customers/:customerId/loyalty/entries
  GET  /v1/customers/:customerId/loyalty/redemptions
  POST /v1/loyalty/redeem
```

The backend mirrors this split with `CustomerRoleGuard` vs `StaffOrManagerRoleGuard`. The admin routes pass `customerId` from the URL path param — the same three backend use cases handle both variants.

`POST /internal/loyalty/expire-points` is **not** exposed through the BFF. Cloud Scheduler calls the backend's Cloud Run internal URL directly within GCP's network.

---

## 10. Testing Patterns

### Unit tests use InMemory doubles
Every use case test wires up `InMemoryLoyaltyEntryRepository`, `InMemoryLoyaltyBalanceRepository`, etc. directly — no `Test.createTestingModule` boilerplate needed.

```ts
// Pattern established in M10 and used throughout
beforeEach(() => {
  entryRepo = new InMemoryLoyaltyEntryRepository();
  balanceRepo = new InMemoryLoyaltyBalanceRepository();
  txManager = new InMemoryTransactionManager();
  useCase = new ExpirePointsUseCase(entryRepo, balanceRepo, expiryLogRepo, txManager);
});
```

### Integration tests use `createLoyaltyIntegrationApp()`
All loyalty controller integration tests share a single app helper (`src/test/utils/loyalty-integration-app.ts`) that wires LoyaltyModule + PlatformModule + real DB. The `SERVICE_CATALOG_PORT` is overridden with `InMemoryServiceCatalogPort` since booking services are not in scope for loyalty integration tests.

### Cleanup in integration tests
`balance_expiry_log` has no `tenant_id` column — it cannot be cleaned with `delete({ tenantId })`. Use a query builder:

```ts
afterEach(async () => {
  await ds.createQueryBuilder().delete().from(BalanceExpiryLogEntity).execute();
  await ds.getRepository(LoyaltyEntryEntity).delete({ tenantId });
  await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId });
});
```
