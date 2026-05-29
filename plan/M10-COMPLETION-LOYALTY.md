# M10 — Booking Completion + Loyalty

**Phase:** Local Development  
**Goal:** An admin can mark an APPROVED booking as complete and upload after-service photos. The system automatically creates an immutable `LoyaltyEntry` per booking line, increments the customer's `LoyaltyBalance`, emits `ServicePointsEarned`, and sends a thank-you email. Customers can view their active balance and full redemption history. Admins can record a point redemption (decrement balance + audit trail). A daily cron deducts expired points from the balance.  
**Depends on:** M09 (all booking states implemented), M04-S05 (Notification bootstrap)  
**Blocks:** M11 (full notification system), M13 (dashboard loyalty page)

---

## Stories

---

### M10-S01 — UC-009: Admin marks booking complete ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-009, `docs/03-DOMAIN_EVENTS.md` § BookingCompleted

**Description:**  
Implement booking completion. The admin sets the `actualPriceCharged` for each line (defaults to `priceAtBooking` if not overridden), uploads after-service photos, and marks the booking COMPLETED. This triggers the loyalty points flow.

**Backend use case `CompleteBookingUseCase`:**
1. Load `Booking` — must be APPROVED
2. Validate: `lineActualPrices` contains an entry for every `line_id` in the booking
3. Validate: after-photo URLs are valid GCS URLs (pre-uploaded via signed URL)
4. Call `booking.complete(staffId, lineActualPrices, afterPhotoUrls)`
5. Persist (emits `BookingCompleted` with all line data including `actualPriceCharged` per line)

**BFF endpoint:** `PATCH /v1/bookings/:id/complete`
- Requires: JWT + `MANAGER|STAFF` role
- Body:
```json
{
  "lines": [
    { "lineId": "uuid", "actualPriceCharged": 150.00 }
  ],
  "afterServicePhotoUrls": ["https://storage.googleapis.com/..."],
  "adminNotes": "Extra shine applied"
}
```
- Returns: `200 { bookingId, status: 'COMPLETED', completedAt, totalActualPrice }`

**Acceptance criteria:**
- [x] APPROVED → COMPLETED on valid request
- [x] `actualPriceCharged` for each line persisted; `total_actual_price_amount` computed as sum
- [x] If `lines` array is missing a `lineId` that exists in the booking, returns `400`
- [x] `afterServicePhotoUrls` stored on booking
- [x] `adminNotes` (optional) stored on booking when provided
- [x] Completing a PENDING or CANCELLED booking returns `422`
- [x] `BookingCompleted` event emitted with complete payload: `lines[]` each with `actualPriceCharged`, `pointsValueAtBooking`, `lineId`
- [x] Admin from Tenant B calls `PATCH /v1/bookings/:id/complete` on a Tenant A booking → `404`
- [x] Integration test: full flow PENDING → APPROVED → COMPLETE; assert event published to Pub/Sub

**Dependencies:** M08-S01

---

### M10-S02 — Signed URL endpoint for photo uploads *(moved to M115-S01)*

> This story was deferred to milestone M115-PRODUCTION-READINESS so the loyalty flow (S03–S08) could be delivered first. The completion endpoint (S01) stores `afterServicePhotoUrls` as plain strings in the interim. Do not implement here.

---

### M10-S03 — LoyaltyEntry aggregate domain + migration ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Loyalty context, `docs/05-BOUNDED_CONTEXTS.md` § Loyalty context, `docs/13-DATABASE_SCHEMA.md` § loyalty schema

**Description:**  
Implement the `LoyaltyEntry` aggregate domain layer and its migration. Loyalty entries are immutable (insert-only). No updates, no deletes. Idempotency is guaranteed by a unique constraint on `(tenant_id, booking_line_id)`.

**Domain layer (`apps/backend/src/contexts/loyalty/domain/`):**
- `LoyaltyEntry` aggregate:
  - Properties: `id` (UUID v7), `tenantId`, `customerId`, `bookingId`, `bookingLineId`, `serviceId`, `points` (positive integer), `earnedAt`, `expiresAt`
  - Methods: `record(params: RecordLoyaltyEntryParams)` — static factory (takes params object to stay within 7-param limit)
  - Invariants: `points` must be > 0, `expiresAt` = `earnedAt + expiryDays days`
  - NO `update()` or `cancel()` — entries are permanently immutable
  - Emits `ServicePointsEarned` domain event on `record()`

**Migration: `loyalty.loyalty_entries`**
```sql
id               UUID PRIMARY KEY
tenant_id        UUID NOT NULL
customer_id      UUID NOT NULL
booking_id       UUID NOT NULL
booking_line_id  UUID NOT NULL
service_id       UUID NOT NULL
points           INTEGER NOT NULL CHECK (points > 0)
earned_at        TIMESTAMPTZ NOT NULL DEFAULT now()
expires_at       TIMESTAMPTZ NOT NULL

INDEX (tenant_id)
INDEX (tenant_id, customer_id)
INDEX (tenant_id, customer_id, expires_at)   ← for expiry cron
UNIQUE (tenant_id, booking_line_id)          ← idempotency key
```

Also creates `loyalty.processed_events` (idempotency table for Loyalty consumers).

**Repository port `ILoyaltyEntryRepository`:**
- `save(entry): Promise<void>` — INSERT only
- `findExpiringBefore(date: Date): Promise<LoyaltyEntry[]>` — for expiry cron (S08)

**Acceptance criteria:**
- [x] Inserting the same `(tenant_id, booking_line_id)` twice throws a unique constraint error
- [x] `LoyaltyEntry.record(...)` with `points=0` throws a domain error
- [x] Migration runs and reverts cleanly
- [x] `expiry_days` is read from `tenants.settings.loyalty.expiry_days` (default 180) — not hardcoded
- [x] `findExpiringBefore(date)` returns only entries whose `expires_at < date`; future entries excluded
- [x] Tenant isolation: entries saved under Tenant A are not returned for Tenant B

**Dependencies:** M00-S08, M00-S07

---

### M10-S03.1 — LoyaltyBalance + LoyaltyRedemption domain + migration ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Loyalty context, `docs/13-DATABASE_SCHEMA.md` § loyalty schema

**Description:**  
Implement the `LoyaltyBalance` and `LoyaltyRedemption` aggregates, their migrations, and repository ports. `LoyaltyBalance` is the source of truth for a customer's current active point balance — a single row per `(tenant_id, customer_id)` that is incremented on earn (S04), decremented on redemption (S07) and expiry (S08). `LoyaltyRedemption` is an immutable audit record of each admin-triggered redemption.

**`LoyaltyBalance` aggregate:**
- Properties: `tenantId`, `customerId`, `currentPoints` (non-negative integer)
- Methods:
  - `increment(points: number): void` — adds points; validates `points > 0`
  - `decrement(points: number): void` — subtracts points; throws `LoyaltyInsufficientPointsError` if `points > currentPoints`
  - `static create(tenantId, customerId): LoyaltyBalance` — starts at `currentPoints = 0`
  - `static reconstitute(props): LoyaltyBalance`

**`LoyaltyRedemption` aggregate (immutable):**
- Properties: `id`, `tenantId`, `customerId`, `pointsRedeemed`, `redeemedAt`, `redeemedBy` (staffId), `notes` (nullable), `bookingId` (nullable — the booking it was applied to)
- Methods:
  - `static record(params: RecordLoyaltyRedemptionParams): LoyaltyRedemption` — static factory, no domain events
  - NO update/delete methods

**Domain errors (new):**
- `LoyaltyInsufficientPointsError` — thrown by `LoyaltyBalance.decrement()` when balance < requested

**Migrations:**

```sql
-- loyalty.loyalty_balances
tenant_id        UUID NOT NULL
customer_id      UUID NOT NULL
current_points   INTEGER NOT NULL DEFAULT 0 CHECK (current_points >= 0)
updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (tenant_id, customer_id)
INDEX (tenant_id, customer_id)

-- loyalty.loyalty_redemptions
id               UUID PRIMARY KEY
tenant_id        UUID NOT NULL
customer_id      UUID NOT NULL
points_redeemed  INTEGER NOT NULL CHECK (points_redeemed > 0)
redeemed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
redeemed_by      UUID NOT NULL  -- staffId
notes            TEXT
booking_id       UUID           -- nullable: booking the points were applied to
INDEX (tenant_id, customer_id)

-- loyalty.balance_expiry_log
entry_id         UUID PRIMARY KEY → loyalty_entries.id
processed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```
> `balance_expiry_log` makes the expiry cron (S08) idempotent — one row per entry whose expiry has been applied to the balance. Prevents double-decrement if the cron runs twice.

**Repository ports:**
- `ILoyaltyBalanceRepository`:
  - `findByCustomer(tenantId, customerId): Promise<LoyaltyBalance | null>`
  - `upsert(balance): Promise<void>` — INSERT ON CONFLICT UPDATE (creates row on first earn)
- `ILoyaltyRedemptionRepository`:
  - `save(redemption): Promise<void>`
  - `findByCustomer(tenantId, customerId, page, limit): Promise<{ items: LoyaltyRedemption[]; total: number }>`
- `IBalanceExpiryLogRepository`:
  - `hasBeenProcessed(entryId): Promise<boolean>`
  - `markProcessed(entryId): Promise<void>`

**Acceptance criteria:**
- [ ] `LoyaltyBalance.decrement()` with more points than `currentPoints` throws `LoyaltyInsufficientPointsError`
- [ ] `LoyaltyBalance.increment()` with `points <= 0` throws `LoyaltyDomainError`
- [ ] Two redemptions on same customer accumulate correctly (balance decrements twice)
- [ ] `loyalty_balances` PRIMARY KEY `(tenant_id, customer_id)` enforces one row per customer per tenant
- [ ] Migrations run and revert cleanly
- [ ] Integration test: create balance → increment → decrement → assert `current_points`; decrement below zero → assert error
- [ ] Tenant isolation: `findByCustomer(tenantBId, customerFromTenantA)` returns `null`

**Dependencies:** M10-S03

---

### M10-S04 — BookingCompleted event consumer (Loyalty context) ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § Loyalty context, `docs/03-DOMAIN_EVENTS.md` § BookingCompleted + ServicePointsEarned

**Description:**  
Implement the Loyalty context's consumer for `BookingCompleted`. For each line in the booking that has a customer (`customerId != null`), create a `LoyaltyEntry`, increment `LoyaltyBalance`, and emit `ServicePointsEarned`. The consumer is fully idempotent. Entries and balance are written atomically in a single transaction — they must never be split across two transactions.

**Preparatory fix (before main S04 code):**  
Add `earnedAt: string` (ISO-8601) to `ServicePointsEarned` event class (`loyalty/domain/events/service-points-earned.event.ts`) and populate it in `LoyaltyEntry.record()`. This field is documented in `docs/03-DOMAIN_EVENTS.md` but missing from the class — S06 (notification email) requires it.

---

**New artifacts to create in this story:**

**`IProcessedEventRepository` port** (`loyalty/application/ports/processed-event-repository.port.ts`):
```ts
export const PROCESSED_EVENT_REPOSITORY = Symbol('IProcessedEventRepository');
export interface IProcessedEventRepository {
  hasBeenProcessed(eventId: string, consumerName: string): Promise<boolean>;
  markProcessed(eventId: string, consumerName: string): Promise<void>;
}
```
Also create:
- `ProcessedEventEntity` (`loyalty/infrastructure/entities/processed-event.entity.ts`) — maps `loyalty.processed_events(event_id, consumer_name)`
- `TypeOrmProcessedEventRepository` (`loyalty/infrastructure/repositories/typeorm-processed-event.repository.ts`)
- `InMemoryProcessedEventRepository` (`src/test/infrastructure/in-memory-processed-event.repository.ts`)

**`ILoyaltyTenantSettingsPort` port** (`loyalty/application/ports/loyalty-tenant-settings.port.ts`):
```ts
export const LOYALTY_TENANT_SETTINGS_PORT = Symbol('ILoyaltyTenantSettingsPort');
export interface LoyaltyTenantSettings { expiryDays: number; }
export interface ILoyaltyTenantSettingsPort {
  getLoyaltySettings(tenantId: string): Promise<LoyaltyTenantSettings>;
}
```
Also create:
- `TypeOrmLoyaltyTenantSettingsAdapter` (`loyalty/infrastructure/cross-context/loyalty-tenant-settings.adapter.ts`) — queries `tenants.settings->>'loyalty'` directly via TypeORM `DataSource`; falls back to `expiryDays: 180` if the key is absent
- `InMemoryLoyaltyTenantSettingsPort` (`src/test/infrastructure/in-memory-loyalty-tenant-settings.port.ts`)

> `TenantContext` (AsyncLocalStorage) is NOT available inside Pub/Sub event handlers — they run outside the HTTP request lifecycle. Always load tenant settings via `ILoyaltyTenantSettingsPort`.

**`InMemoryLoyaltyEntryRepository`** (`src/test/infrastructure/in-memory-loyalty-entry.repository.ts`) — missing from prior stories; required for use case unit tests.

---

**`BookingCompletedHandler`** (thin — delegates to use case):
```
onModuleInit → eventBus.subscribe('BookingCompleted', handler, RecordLoyaltyEntriesUseCase.CONSUMER_NAME)
handle(event) → recordLoyaltyEntries.execute(dto) → rethrow on error
```

**`RecordLoyaltyEntriesUseCase`:**
```ts
static readonly CONSUMER_NAME = 'RECORD_LOYALTY_ENTRY'; // used as consumerName in subscribe() and processed_events.consumer_name
```
1. Check idempotency: `processedEventRepo.hasBeenProcessed(eventId, CONSUMER_NAME)` → return early if yes
2. If `customerId` is null → return early (guest booking, no loyalty)
3. `loyaltySettingsPort.getLoyaltySettings(tenantId)` → `expiryDays`
4. For each line in `lines[]`:
   - `LoyaltyEntry.record({ tenantId, customerId, bookingId, bookingLineId, serviceId, points: line.pointsValueAtBooking, expiryDays, correlationId })`
5. `ILoyaltyBalanceRepository.findByCustomer(tenantId, customerId)` → create via `LoyaltyBalance.create()` if null
6. `balance.increment(totalPointsEarned)` — sum of `pointsValueAtBooking` across all lines
7. In a single `txManager.run()`:
   - `entryRepo.save(entry)` for each new entry
   - `balanceRepo.upsert(balance)`
   - `processedEventRepo.markProcessed(eventId, CONSUMER_NAME)`
8. After `txManager.run()`: flush `entry.clearDomainEvents()` per entry → `eventBus.publish(ServicePointsEarned)` per line

**`ServicePointsEarned` event payload (per line):**
```json
{
  "entryId": "uuid",
  "customerId": "uuid",
  "bookingId": "uuid",
  "bookingLineId": "uuid",
  "serviceId": "uuid",
  "pointsEarned": 10,
  "earnedAt": "ISO-8601",
  "expiresAt": "ISO-8601"
}
```

**Acceptance criteria:**
- [ ] One `LoyaltyEntry` inserted per booking line for authenticated customer bookings
- [ ] `LoyaltyBalance.current_points` incremented by total points across all lines (atomically with entries and `processed_events` mark — all in one `txManager.run()`)
- [ ] Guest bookings (`customerId=null`) produce zero `LoyaltyEntry` rows and zero balance change
- [ ] Same `BookingCompleted` event replayed twice → still only 1 entry per line and balance unchanged (idempotent via `processed_events`)
- [ ] `ServicePointsEarned` event emitted per line (3 lines = 3 events); each payload includes `earnedAt`
- [ ] Integration test: complete booking with 2 lines → assert 2 loyalty entries + 2 events published + balance = sum of both lines
- [ ] Tenant isolation: `BookingCompleted` for Tenant A processed by Loyalty handler → Tenant B `findByCustomer` returns null

**Dependencies:** M10-S03, M10-S03.1, M10-S01

---

### M10-S05 — UC-016: Customer views loyalty metrics ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-016, `docs/14-API_CONTRACTS.md` § Loyalty Metrics

**Description:**  
Implement three read-only endpoints for customers to view their active balance, earning history, and redemption history — plus the admin variants that let staff view any customer's loyalty data within the tenant. Balance is read from `loyalty_balances` (O(1)). History comes from `loyalty_entries` and `loyalty_redemptions`. Service names in the entry response are resolved via a new `IServiceCatalogPort` cross-context adapter.

---

**Required code changes before main implementation (add to feature branch, commit separately):**

1. **`ILoyaltyEntryRepository`** — add two methods:
   ```ts
   findByCustomerPaginated(
     tenantId: string,
     customerId: string,
     page: number,
     limit: number,
   ): Promise<{ items: LoyaltyEntry[]; total: number }>;

   findNextExpiry(
     tenantId: string,
     customerId: string,
   ): Promise<{ expiryDate: Date; points: number } | null>;
   ```
   Also update `TypeOrmLoyaltyEntryRepository` and `InMemoryLoyaltyEntryRepository` to implement both.

2. **`IServiceCatalogPort`** — new cross-context port:
   ```ts
   // loyalty/application/ports/service-catalog.port.ts
   export const SERVICE_CATALOG_PORT = Symbol('IServiceCatalogPort');
   export interface ServiceSummary { serviceId: string; serviceName: string; }
   export interface IServiceCatalogPort {
     findServicesByIds(tenantId: string, serviceIds: string[]): Promise<ServiceSummary[]>;
   }
   ```
   - Adapter: `loyalty/infrastructure/cross-context/service-catalog.adapter.ts` — queries `booking.services` table via TypeORM `DataSource` (read-only, own DataSource injection, not a repo token).
   - Test double: `src/test/infrastructure/in-memory-service-catalog.port.ts`

---

**New backend use cases (`loyalty/application/use-cases/`):**

- **`GetLoyaltyBalanceUseCase`** (`get-loyalty-balance/`):
  1. `balanceRepo.findByCustomer(tenantId, customerId)` — if null, return `{ currentPoints: 0, nextExpiryDate: null, nextExpiryPoints: null }`
  2. `entryRepo.findNextExpiry(tenantId, customerId)` — one extra query for next-expiry
  3. Return `{ currentPoints: balance.currentPoints, nextExpiryDate, nextExpiryPoints }`

- **`GetLoyaltyEntriesUseCase`** (`get-loyalty-entries/`):
  1. `entryRepo.findByCustomerPaginated(tenantId, customerId, page, limit)`
  2. Collect unique `serviceId`s from returned entries
  3. `serviceCatalogPort.findServicesByIds(tenantId, serviceIds)` — build a `Map<serviceId, serviceName>`
  4. Map entries to response DTOs: include `isActive = entry.expiresAt > new Date()`

- **`GetLoyaltyRedemptionsUseCase`** (`get-loyalty-redemptions/`):
  1. `redemptionRepo.findByCustomer(tenantId, customerId, page, limit)`
  2. Map to response DTOs

For the **admin variant**, the same three use cases are reused — the controller passes `customerId` from the URL path param instead of from `TenantContext.actorId`. A customer-existence check is NOT required in the use case; if the customer has no rows the balance returns zero/empty (same as A1 flow). The BFF forwards `X-Customer-ID` header for admin calls.

---

**Backend controller (`loyalty/infrastructure/rest/loyalty.controller.ts`):**

Customer-scoped (reads `customerId` from `TenantContext.actorId`):
- `GET /loyalty/balance` — guard: `CustomerRoleGuard`
- `GET /loyalty/entries?page&limit` — guard: `CustomerRoleGuard`
- `GET /loyalty/redemptions?page&limit` — guard: `CustomerRoleGuard`

Admin-scoped (reads `customerId` from URL path `/:customerId`):
- `GET /customers/:customerId/loyalty/balance` — guard: `StaffOrManagerRoleGuard`
- `GET /customers/:customerId/loyalty/entries?page&limit` — guard: `StaffOrManagerRoleGuard`
- `GET /customers/:customerId/loyalty/redemptions?page&limit` — guard: `StaffOrManagerRoleGuard`

---

**BFF endpoints (`bff/src/loyalty/loyalty.controller.ts`):**

Customer-facing (JWT role `CUSTOMER`):
- `GET /v1/loyalty/balance` → proxies to `GET /loyalty/balance`
- `GET /v1/loyalty/entries?page&limit` → proxies to `GET /loyalty/entries`
- `GET /v1/loyalty/redemptions?page&limit` → proxies to `GET /loyalty/redemptions`

Admin-facing (JWT role `MANAGER|STAFF`):
- `GET /v1/customers/:customerId/loyalty/balance` → proxies to `GET /customers/:customerId/loyalty/balance` (passes `customerId` via path)
- `GET /v1/customers/:customerId/loyalty/entries?page&limit` → proxies to same backend path
- `GET /v1/customers/:customerId/loyalty/redemptions?page&limit` → proxies to same backend path

---

**Response shapes** (from `docs/14-API_CONTRACTS.md` § Loyalty Metrics):

Balance: `{ currentPoints: number, nextExpiryDate: string | null, nextExpiryPoints: number | null }`

Entries: `{ entries: [{ entryId, serviceId, serviceName, points, earnedAt, expiresAt, isActive }], pagination: { page, limit, total } }`

Redemptions: `{ redemptions: [{ redemptionId, pointsRedeemed, redeemedAt, notes }], pagination: { page, limit, total } }`

---

**Acceptance criteria:**
- [ ] `currentPoints` read from `loyalty_balances` — no SUM on entries
- [ ] `nextExpiryDate` = earliest `expires_at` among active entries; `null` if none
- [ ] `nextExpiryPoints` = sum of points expiring on `nextExpiryDate`; `null` if none
- [ ] Expired entries appear in earning history with `isActive=false`; `currentPoints` not affected (maintained by S04/S08)
- [ ] `serviceName` resolved for each entry via `IServiceCatalogPort`; unknown `serviceId` falls back to `serviceId` string
- [ ] Customer can only see their own data (tenant + customerId scoped)
- [ ] STAFF/MANAGER calling customer-facing `GET /v1/loyalty/*` endpoints → `403`
- [ ] CUSTOMER calling admin-facing `GET /v1/customers/:id/loyalty/*` endpoints → `403`
- [ ] Admin variant: staff can view any customer's loyalty data within their tenant
- [ ] Tenant isolation: customer in Tenant A cannot see Tenant B data → 404/empty
- [ ] Tenant isolation: staff from Tenant B calling admin variant with Tenant A customerId → empty (zero balance, no entries)
- [ ] Integration test: earn points → call balance → assert `currentPoints`; call entries → assert `serviceName` present; call redemptions → assert empty list
- [ ] Integration test (admin variant): same data accessible via `GET /customers/:customerId/loyalty/*` with STAFF JWT

**Dependencies:** M10-S04, M10-S03.1

---

### M10-S06 — ServicePointsEarned notification consumer ✅ Done

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § ServicePointsEarned

**Description:**  
Implement the Notification consumer for `ServicePointsEarned`. Sends a thank-you email to the customer after their booking is completed with the points earned. One email per event (one per line — acceptable for MVP).

**Preparatory fix (on feature branch, before handler code):**
Add `currentBalance: number` to `ServicePointsEarnedData` interface (`loyalty/domain/events/service-points-earned.event.ts`) and populate it in `RecordLoyaltyEntriesUseCase` after `balance.increment()` — pass `currentBalance: balance.currentPoints` when constructing each `ServicePointsEarned` event.

---

**New artifacts (all in Notification context):**

**`INotificationCustomerPort`** (`notification/application/ports/notification-customer.port.ts`):
```ts
export const NOTIFICATION_CUSTOMER_PORT = Symbol('INotificationCustomerPort');
export interface NotificationCustomerInfo { email: string; name: string; }
export interface INotificationCustomerPort {
  getCustomerInfo(customerId: string, tenantId: string): Promise<NotificationCustomerInfo | null>;
}
```
- Adapter: `notification/infrastructure/cross-context/customer-info.adapter.ts` — injects `CustomerQueryService` (imported from `CustomerModule`); returns null on not-found.
- Test double: `src/test/infrastructure/in-memory-notification-customer.port.ts`

**`INotificationServicePort`** (`notification/application/ports/notification-service.port.ts`):
```ts
export const NOTIFICATION_SERVICE_PORT = Symbol('INotificationServicePort');
export interface NotificationServiceInfo { serviceId: string; serviceName: string; }
export interface INotificationServicePort {
  getServiceInfo(serviceId: string, tenantId: string): Promise<NotificationServiceInfo | null>;
}
```
- Adapter: `notification/infrastructure/cross-context/service-info.adapter.ts` — queries `booking.services` via TypeORM `DataSource` (read-only); falls back to `serviceId` string if not found.
- Test double: `src/test/infrastructure/in-memory-notification-service.port.ts`

**`ServicePointsEarnedHandler`** (`notification/infrastructure/events/service-points-earned.handler.ts`):
```
onModuleInit → eventBus.subscribe('ServicePointsEarned', handler, 'notification')
handle(event) → sendServicePointsEarnedNotification.execute(dto) → rethrow on error
```

**`SendServicePointsEarnedNotificationUseCase`** (`notification/application/use-cases/send-service-points-earned-notification/`):
```
const NOTIFICATION_TYPE = 'SERVICE_POINTS_EARNED';
const CHANNEL = 'EMAIL';
```
1. `isAlreadySent(tenantId, eventId, NOTIFICATION_TYPE, CHANNEL)` → return early if yes
2. `customerPort.getCustomerInfo(customerId, tenantId)` → skip silently if null (customer deleted)
3. `servicePort.getServiceInfo(serviceId, tenantId)` → fall back to `serviceId` string if null
4. `dispatcher.dispatch({ to: customer.email, subject: 'Lavagem concluída! Você ganhou [X] pontos', templateKey: 'service-points-earned', data: { customerName, serviceName, pointsEarned, expiresAt, currentBalance } })`
5. `saveLog(tenantId, eventId, NOTIFICATION_TYPE, CHANNEL)`

**Module wiring:** Add `CustomerModule` to `NotificationModule` imports; register both ports and adapters, the use case, and the handler as providers.

---

**Acceptance criteria:**
- [ ] Customer receives an email after booking completion with points earned
- [ ] Email subject is in pt-BR and mentions the points earned (`Lavagem concluída! Você ganhou [X] pontos`)
- [ ] Email body includes `pointsEarned`, `serviceName`, `expiresAt`, and `currentBalance`
- [ ] Handler is idempotent on `eventId`: same `ServicePointsEarned` event processed twice → only one `notification_logs` row and one email dispatched
- [ ] `ServicePointsEarned` with null customer (deleted) → no email, no error (silent skip)
- [ ] Tenant isolation: `ServicePointsEarned` for Tenant A customer is not dispatched to Tenant B
- [ ] Integration test: publish `ServicePointsEarned` → `waitFor` notification log → assert `dispatcher.dispatched` contains email to correct customer address with correct template

**Dependencies:** M10-S04, M04-S05

---

### M10-S07 — Admin records point redemption ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Loyalty context, `docs/14-API_CONTRACTS.md` § loyalty endpoints

**Description:**  
Implement the admin-facing redemption flow. When a customer uses their points (e.g., for a free or discounted wash), the admin records the redemption in the system. This decrements `LoyaltyBalance.current_points` and creates an immutable `LoyaltyRedemption` audit record — both atomically.

**`RedeemPointsUseCase`:**
1. Load `LoyaltyBalance` for `(tenantId, customerId)` — 404 if not found (customer has never earned points)
2. Validate `balance.currentPoints >= pointsToRedeem` — throws `LoyaltyInsufficientPointsError` if not
3. Call `balance.decrement(pointsToRedeem)`
4. Call `LoyaltyRedemption.record({ tenantId, customerId, pointsRedeemed, redeemedBy: staffId, notes, bookingId })`
5. In a single `txManager.run()`: `balanceRepo.upsert(balance)` + `redemptionRepo.save(redemption)`
6. Return `{ redemptionId, customerId, pointsRedeemed, newBalance: balance.currentPoints, redeemedAt: redemption.redeemedAt.toISOString() }`

**Backend endpoint:** `POST /loyalty/redeem`  
**BFF endpoint:** `POST /v1/loyalty/redeem`
- Requires: JWT + `MANAGER|STAFF` role
- Body:
```json
{
  "customerId": "uuid",
  "pointsToRedeem": 50,
  "notes": "Free basic wash applied",
  "bookingId": "uuid?"
}
```
- Returns: `201 { redemptionId, customerId, pointsRedeemed, newBalance, redeemedAt }`
- Errors: `404` if customer has no balance row; `422` if insufficient points

**Acceptance criteria:**
- [ ] `current_points` decremented atomically with redemption record insertion
- [ ] `LoyaltyRedemption` row inserted with correct staffId, notes, bookingId
- [ ] Redeeming more than `current_points` → `422 LoyaltyInsufficientPoints`
- [ ] Customer with no earning history (no balance row) → `404`
- [ ] `CUSTOMER` role calling this endpoint → `403`
- [ ] Tenant isolation: staff from Tenant B cannot redeem points for Tenant A customer → `404`
- [ ] Integration test: earn 30pts → redeem 20pts → assert `current_points = 10` + redemption record exists
- [ ] `mapLoyaltyError` maps `LoyaltyBalanceNotFoundError → 404` and `LoyaltyInsufficientPointsError → 422`

**Dependencies:** M10-S03.1

---

### M10-S08 — Points expiry HTTP trigger

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Loyalty context

**Description:**  
Implement the points expiry logic as an internal HTTP endpoint. A GCP Cloud Scheduler job calls `POST /internal/loyalty/expire-points` at 02:00 UTC daily, which decrements `loyalty_balances.current_points` for all `loyalty_entries` whose `expires_at` has passed. Fully idempotent via `balance_expiry_log` — if the scheduler fires twice, no entry is double-processed.

**Why HTTP trigger instead of `@nestjs/schedule` + `@Cron`:**
- Cloud Run scales to zero — an in-process cron never fires when no instance is running.
- Multi-pod deployments would execute a `@Cron` on every pod simultaneously.
- GCP Cloud Scheduler issues one HTTP request; exactly one pod handles it.

**Backend endpoint:** `POST /internal/loyalty/expire-points`  
- No JWT required — network-protected (backend not publicly reachable from the internet). M115-S03 adds `InternalApiGuard` (`X-Internal-Key` header), consistent with the other `/internal/*` controllers.
- No request body.
- Returns: `200 { processedEntries: number, affectedCustomers: number, totalPointsExpired: number }`

**`ExpirePointsUseCase`:**
1. `entryRepo.findExpiringBefore(new Date())` — all entries whose `expires_at < now()`
2. For each entry, `balanceExpiryLogRepo.hasBeenProcessed(entry.id)` → skip if already processed
3. Group remaining entries by `(tenantId, customerId)` — sum points per customer
4. For each customer group:
   a. `balanceRepo.findByCustomer(tenantId, customerId)` — if null (edge case), skip silently
   b. `balance.decrement(expiredPoints)` — if `currentPoints` already 0, skip silently
   c. In a single `txManager.run()`: `balanceRepo.upsert(balance)` + `balanceExpiryLogRepo.markProcessed(entryId)` for each entry in the group
5. Return `{ processedEntries, affectedCustomers, totalPointsExpired }`

**GCP Cloud Scheduler (Terraform):**
- Schedule: `0 2 * * *` (02:00 UTC)
- HTTP target: `POST <BACKEND_INTERNAL_URL>/internal/loyalty/expire-points`
- The Terraform resource (`google_cloud_scheduler_job`) is tracked as a separate infra task in M115 or M16. The endpoint must be deployed before the scheduler resource is created.

**Acceptance criteria:**
- [ ] Balance decremented by exact points of expired entries
- [ ] Calling the endpoint twice for the same expired entries → no double-decrement (idempotent via `balance_expiry_log`)
- [ ] `balance_expiry_log` row inserted per processed entry
- [ ] If no entries have expired → returns `{ processedEntries: 0, affectedCustomers: 0, totalPointsExpired: 0 }` with no DB writes
- [ ] No `@nestjs/schedule` or `@Cron` decorator used anywhere in this story
- [ ] Integration test: insert entry with `expires_at` in past → `POST /internal/loyalty/expire-points` → assert balance decremented + `balance_expiry_log` row exists
- [ ] Integration test: call endpoint twice → balance decremented only once, one `balance_expiry_log` row

**Dependencies:** M10-S03.1

---

## Story Dependency Graph

```
S01 ✅
  └── S04 ──────────────────────────────── (BookingCompleted consumer)
        └── S06                            (ServicePointsEarned notification)

S03 ──── S03.1 ──── S04
              ├──── S05                    (customer views metrics)
              ├──── S07                    (admin records redemption)
              └──── S08                    (expiry cron)
```
