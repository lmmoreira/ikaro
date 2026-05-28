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

### M10-S04 — BookingCompleted event consumer (Loyalty context)

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § Loyalty context, `docs/03-DOMAIN_EVENTS.md` § BookingCompleted + ServicePointsEarned

**Description:**  
Implement the Loyalty context's consumer for `BookingCompleted`. For each line in the booking that has a customer (`customerId != null`), create a `LoyaltyEntry`, increment `LoyaltyBalance`, and emit `ServicePointsEarned`. The consumer is fully idempotent.

**`BookingCompletedHandler`:**
1. Check idempotency: has this `eventId` been processed? (`processed_events` table) → skip if yes
2. If `event.data.customerId` is null → skip (guest booking, no loyalty)
3. Load `expiryDays` from tenant settings
4. For each line in `event.data.lines[]`:
   - Call `LoyaltyEntry.record({ tenantId, customerId, bookingId, bookingLineId, serviceId, points, expiryDays, correlationId })`
   - Persist via `ILoyaltyEntryRepository.save()`
5. Load `LoyaltyBalance` for customer (create via `LoyaltyBalance.create()` if first time)
6. Call `balance.increment(totalPointsEarned)` — total across all lines
7. Persist balance via `ILoyaltyBalanceRepository.upsert()`
8. Flush domain events from all created entries → publish `ServicePointsEarned` per line
9. Mark `eventId` as processed in `processed_events`

All DB writes (entries + balance) in a single `txManager.run()`.

**`ServicePointsEarned` event payload (per line):**
```json
{
  "entryId": "uuid",
  "customerId": "uuid",
  "bookingId": "uuid",
  "bookingLineId": "uuid",
  "serviceId": "uuid",
  "pointsEarned": 10,
  "expiresAt": "ISO-8601"
}
```

**Acceptance criteria:**
- [ ] One `LoyaltyEntry` inserted per booking line for authenticated customer bookings
- [ ] `LoyaltyBalance.current_points` incremented by total points across all lines (atomically with entries)
- [ ] Guest bookings (`customerId=null`) produce zero `LoyaltyEntry` rows and zero balance change
- [ ] Same `BookingCompleted` event replayed twice → still only 1 entry per line and balance unchanged (idempotent)
- [ ] `ServicePointsEarned` event emitted per line (3 lines = 3 events)
- [ ] Integration test: complete booking with 2 lines → assert 2 loyalty entries + 2 events published + balance = sum of both lines

**Dependencies:** M10-S03, M10-S03.1, M10-S01

---

### M10-S05 — UC-016: Customer views loyalty metrics

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-016, `docs/14-API_CONTRACTS.md` § loyalty endpoints

**Description:**  
Implement the endpoints for customers to view their active balance, earning history, and redemption history. Balance is read directly from `loyalty_balances` (O(1)). History comes from `loyalty_entries` and `loyalty_redemptions`.

**BFF endpoints:**
- `GET /v1/loyalty/balance` — requires JWT (`CUSTOMER`)
  - Returns: `{ currentPoints, nextExpiryDate, nextExpiryPoints }`
- `GET /v1/loyalty/entries` — requires JWT (`CUSTOMER`)
  - Returns paginated earning history
  - Query params: `page`, `limit`
- `GET /v1/loyalty/redemptions` — requires JWT (`CUSTOMER`)
  - Returns paginated redemption history
  - Query params: `page`, `limit`

**Balance response:**
```json
{
  "currentPoints": 150,
  "nextExpiryDate": "2026-11-15",
  "nextExpiryPoints": 30
}
```
> `currentPoints` comes from `loyalty_balances.current_points` (O(1) — no SUM needed).  
> `nextExpiryDate` / `nextExpiryPoints` come from a `MIN(expires_at)` query on `loyalty_entries` where `expires_at > now()`.

**Entry response:**
```json
{
  "entries": [{
    "entryId": "uuid",
    "serviceId": "uuid",
    "serviceName": "Lavagem Completa",
    "points": 10,
    "earnedAt": "ISO-8601",
    "expiresAt": "ISO-8601",
    "isActive": true
  }],
  "pagination": { "page": 1, "limit": 20, "total": 45 }
}
```

**Redemption response:**
```json
{
  "redemptions": [{
    "redemptionId": "uuid",
    "pointsRedeemed": 50,
    "redeemedAt": "ISO-8601",
    "notes": "Free basic wash"
  }],
  "pagination": { "page": 1, "limit": 20, "total": 3 }
}
```

**Acceptance criteria:**
- [ ] `currentPoints` read from `loyalty_balances` — no SUM on entries
- [ ] `nextExpiryDate` = earliest `expires_at` among active entries
- [ ] Expired entries appear in earning history (`isActive=false`) but excluded from `currentPoints`
- [ ] Customer can only see their own data (tenant + customerId scoped)
- [ ] Staff calling loyalty endpoints returns `403`
- [ ] Tenant isolation: customer in Tenant A cannot see Tenant B data

**Dependencies:** M10-S04, M10-S03.1

---

### M10-S06 — ServicePointsEarned notification consumer

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § ServicePointsEarned

**Description:**  
Implement the Notification consumer for `ServicePointsEarned`. Sends a thank-you email to the customer after their booking is completed with the points earned.

**`ServicePointsEarnedHandler`:**
- Sends one email per `ServicePointsEarned` event (one per line — acceptable for MVP)
- Email subject (pt-BR): `"Lavagem concluída! Você ganhou [X] pontos"`
- Body: service name + points earned + expiry date + reminder of total balance

**Acceptance criteria:**
- [ ] Customer receives an email after booking completion with points earned
- [ ] Email subject is in pt-BR and mentions the points earned
- [ ] Email body includes `pointsEarned` and the service name
- [ ] Handler is idempotent on `eventId`
- [ ] Email appears in MailHog in integration test

**Dependencies:** M10-S04, M04-S05

---

### M10-S07 — Admin records point redemption

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
6. Return `{ redemptionId, newBalance: balance.currentPoints }`

**Backend endpoint:** `POST /loyalty/redeem`  
**BFF endpoint:** `POST /v1/loyalty/redeem`
- Requires: JWT + `MANAGER|STAFF` role
- Body:
```json
{
  "customerId": "uuid",
  "pointsToRedeem": 50,
  "notes": "Free basic wash applied",
  "bookingId": "uuid"
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

**Dependencies:** M10-S03.1

---

### M10-S08 — Points expiry daily cron

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Loyalty context

**Description:**  
Implement the daily cron that decrements `loyalty_balances.current_points` when `loyalty_entries` expire. Runs at 02:00 UTC via NestJS `@nestjs/schedule`. Fully idempotent via `balance_expiry_log` — if the cron runs twice in a day (restart, redeploy), no entry is processed twice.

**`ExpiryPointsCron`:**
```
@Cron('0 2 * * *')  // 02:00 UTC daily
```
1. Find all `loyalty_entries` where `expires_at < now()` AND `id NOT IN (SELECT entry_id FROM balance_expiry_log)`
2. Group by `(tenant_id, customer_id)` — sum points per customer
3. For each customer group:
   a. Load `LoyaltyBalance`
   b. Call `balance.decrement(expiredPoints)` — if balance somehow already 0 (edge case), skip silently
   c. In a single `txManager.run()`: `balanceRepo.upsert(balance)` + insert all entry IDs into `balance_expiry_log`
4. Log summary: `N customers, M total points expired`

**Acceptance criteria:**
- [ ] Balance decremented by exact points of expired entries
- [ ] Running cron twice (simulated by calling handler twice in test) → no double-decrement
- [ ] Entry in `balance_expiry_log` after processing
- [ ] If no entries expired → cron exits cleanly with no DB writes
- [ ] Integration test: insert entry with `expires_at` in past → run cron → assert balance decremented + expiry log entry

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
