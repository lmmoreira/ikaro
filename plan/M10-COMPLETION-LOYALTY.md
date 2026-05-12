# M10 — Booking Completion + Loyalty

**Phase:** Local Development  
**Goal:** An admin can mark an APPROVED booking as complete, upload after-service photos, and set the actual price charged per line. The system automatically creates an immutable LoyaltyEntry per booking line, emits ServicePointsEarned, and sends a thank-you email with points earned. Customers can view their loyalty balance.  
**Depends on:** M09 (all booking states implemented), M04-S05 (Notification bootstrap)  
**Blocks:** M11 (full notification system), M13 (dashboard loyalty page)

---

## Stories

---

### M10-S01 — UC-009: Admin marks booking complete

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
  "afterServicePhotoUrls": ["https://storage.googleapis.com/..."]
}
```
- Returns: `200 { bookingId, status: 'COMPLETED', completedAt, totalActualPrice }`

**Acceptance criteria:**
- [ ] APPROVED → COMPLETED on valid request
- [ ] `actualPriceCharged` for each line persisted; `total_actual_price_amount` computed as sum
- [ ] If `lines` array is missing a `lineId` that exists in the booking, returns `400`
- [ ] `afterServicePhotoUrls` stored on booking
- [ ] Completing a PENDING or CANCELLED booking returns `422`
- [ ] `BookingCompleted` event emitted with complete payload: `lines[]` each with `actualPriceCharged`, `pointsValueAtBooking`, `bookingLineId`
- [ ] Integration test: full flow PENDING → APPROVED → COMPLETE; assert event published to Pub/Sub

**Dependencies:** M08-S01

---

### M10-S02 — Signed URL endpoint for photo uploads

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/14-API_CONTRACTS.md` § media endpoints, `docs/23-INFRASTRUCTURE_SETUP.md` § GCS emulator

**Description:**  
Implement the signed URL generation endpoint. Photos (before-service from customer, after-service from staff) are uploaded directly from the browser to GCS using a pre-signed URL, avoiding routing large files through the backend. Locally, this points to the GCS emulator.

**Backend service `GcsSignedUrlService`:**
- Implements `IStorageService` port
- `generateSignedUrl(tenantId, bookingId, fileName, operation: 'write'): Promise<string>`
- Builds GCS path: `tenants/<tenant_id>/bookings/<booking_id>/<fileName>`
- Returns signed URL valid for 15 minutes
- Local dev: points to `http://localhost:4443` (GCS emulator)

**BFF endpoint:** `POST /v1/bookings/attachments/signed-url`
- Requires: JWT (`CUSTOMER` for before-photos, `STAFF|MANAGER` for after-photos)
- Body: `{ bookingId, fileName, contentType: 'image/jpeg' | 'image/png' }`
- Returns: `{ signedUrl, expiresAt, filePath }`

**Photo upload handoff contract (frontend → backend):**
The upload is a 3-step sequence the frontend must execute in order:
1. Call `POST /v1/bookings/attachments/signed-url` → receive `{ signedUrl, filePath }`
2. Upload the file directly to GCS using `PUT <signedUrl>` (no backend involved)
3. Include `filePath` (not `signedUrl`) in the subsequent booking request body (e.g., `afterServicePhotoUrls: [filePath]`)

The `filePath` format is always `tenants/<tenant_id>/bookings/<booking_id>/<fileName>`. The backend stores and returns this path — it constructs a fresh signed read URL at display time, never storing the signed URL itself.

**Acceptance criteria:**
- [ ] Endpoint returns `{ signedUrl, filePath, expiresAt }` — `filePath` is the permanent storage path
- [ ] URL expires in 15 minutes
- [ ] `fileName` with path traversal characters (`../`) is rejected with `400`
- [ ] Content type restricted to `image/jpeg` and `image/png` — other types return `400`
- [ ] File size capped at 10MB (enforced by BFF body limit from M00-S13)
- [ ] Customer can only generate signed URLs for their own bookings
- [ ] Signed URL generated against GCS emulator is functional for integration test (local upload with `PUT` to emulator succeeds)
- [ ] `filePath` stored in `booking.after_service_photo_urls[]` — not the signed URL

**Dependencies:** M07-S03, M03-S05, M00-S06

---

### M10-S03 — LoyaltyEntry aggregate domain + migration

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Loyalty context, `docs/05-BOUNDED_CONTEXTS.md` § Loyalty context, `docs/13-DATABASE_SCHEMA.md` § loyalty schema

**Description:**  
Implement the `LoyaltyEntry` aggregate domain layer and its migration. Loyalty entries are immutable (insert-only). No updates, no deletes. Idempotency is guaranteed by a unique constraint on `(tenant_id, booking_line_id)`.

**Domain layer (`apps/backend/src/contexts/loyalty/domain/`):**
- `LoyaltyEntry` aggregate:
  - Properties: `id` (UUID v7), `tenantId`, `customerId`, `bookingId`, `bookingLineId`, `serviceId`, `points` (positive integer), `earnedAt`, `expiresAt`
  - Methods: `record(tenantId, customerId, bookingId, bookingLineId, serviceId, points, expiryDays)` — static factory
  - Invariants: `points` must be > 0, `expiresAt` = `earnedAt + expiryDays days` (from `tenants.settings.loyalty.expiry_days`)
  - NO `update()` or `cancel()` — entries are permanently immutable

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
INDEX (tenant_id, customer_id, expires_at)   ← for active balance query
UNIQUE (tenant_id, booking_line_id)          ← idempotency key
```

**Repository port `ILoyaltyEntryRepository`:**
- `save(entry): Promise<void>` — INSERT only, throws if `(tenant_id, booking_line_id)` already exists
- `findActiveByCustomer(tenantId, customerId): Promise<LoyaltyEntry[]>` — only entries with `expires_at > now()`
- `calculateActiveBalance(tenantId, customerId): Promise<number>` — `SUM(points) WHERE expires_at > now()`
- `findExpiringBefore(date): Promise<LoyaltyEntry[]>` — for cron job

**Acceptance criteria:**
- [ ] Inserting the same `(tenant_id, booking_line_id)` twice throws a unique constraint error
- [ ] `calculateActiveBalance` returns 0 for expired entries (past `expires_at`)
- [ ] `LoyaltyEntry.record(...)` with `points=0` throws a domain error
- [ ] Migration runs and reverts cleanly
- [ ] `expiry_days` is read from `tenants.settings.loyalty.expiry_days` (default 180) — not hardcoded
- [ ] Integration test: insert entry → calculate balance → assert correct; wait until expired → assert balance=0

**Dependencies:** M00-S08, M00-S07

---

### M10-S04 — BookingCompleted event consumer (Loyalty context)

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § Loyalty context, `docs/03-DOMAIN_EVENTS.md` § BookingCompleted + ServicePointsEarned

**Description:**  
Implement the Loyalty context's consumer for `BookingCompleted`. For each line in the booking that has a customer (`customerId != null`), create a `LoyaltyEntry` and emit `ServicePointsEarned`. The consumer is fully idempotent — replaying the same event produces no duplicate entries.

**`BookingCompletedHandler`:**
1. Check idempotency: has this `eventId` been processed? → skip if yes
2. For each line in `event.data.lines[]`:
   - Skip if `event.data.customerId` is null (guest booking — no loyalty)
   - Load `expiryDays` from tenant settings
   - Call `LoyaltyEntry.record(tenantId, customerId, bookingId, bookingLineId, serviceId, points, expiryDays)`
   - Persist via `ILoyaltyEntryRepository.save()`
   - Emit `ServicePointsEarned` event (one per line)
3. Mark `eventId` as processed

**`ServicePointsEarned` event payload (per line):**
```json
{
  "entryId": "uuid",
  "customerId": "uuid",
  "bookingId": "uuid",
  "bookingLineId": "uuid",
  "serviceId": "uuid",
  "pointsEarned": 10,
  "expiresAt": "ISO-8601",
  "totalActiveAfter": 150
}
```

**Acceptance criteria:**
- [ ] One `LoyaltyEntry` inserted per booking line for authenticated customer bookings
- [ ] Guest bookings (`customerId=null`) produce zero `LoyaltyEntry` rows
- [ ] Same `BookingCompleted` event replayed twice → still only 1 entry per line (idempotent)
- [ ] `ServicePointsEarned` event emitted per line (3 lines = 3 events)
- [ ] `totalActiveAfter` in the event payload reflects the customer's active balance after insertion
- [ ] Integration test: complete booking with 2 lines → assert 2 loyalty entries + 2 events published

**Dependencies:** M10-S03, M10-S01

---

### M10-S05 — UC-016: Customer views loyalty metrics

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-016, `docs/14-API_CONTRACTS.md` § loyalty endpoints

**Description:**  
Implement the endpoints for customers to view their loyalty balance and history. This is a read-only query — no writes.

**BFF endpoints:**
- `GET /v1/loyalty/balance` — requires JWT (`CUSTOMER`)
  - Returns: `{ totalActivePoints, nextExpiryDate, nextExpiryPoints }`
- `GET /v1/loyalty/entries` — requires JWT (`CUSTOMER`)
  - Returns paginated list of entries with per-service breakdown
  - Query params: `page`, `limit`

**Balance response:**
```json
{
  "totalActivePoints": 150,
  "nextExpiryDate": "2026-11-15",
  "nextExpiryPoints": 30
}
```

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
  "pagination": { ... }
}
```

**Acceptance criteria:**
- [ ] `totalActivePoints` = sum of points where `expires_at > now()`
- [ ] `nextExpiryDate` = earliest `expires_at` among active entries
- [ ] Expired entries appear in history (`isActive=false`) but are excluded from `totalActivePoints`
- [ ] Customer can only see their own entries (tenant + customerId scoped)
- [ ] Staff calling loyalty endpoints returns `403`
- [ ] Tenant isolation: customer in Tenant A cannot see loyalty points in Tenant B

**Dependencies:** M10-S04, M03-S05

---

### M10-S06 — ServicePointsEarned notification consumer

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § ServicePointsEarned

**Description:**  
Implement the Notification consumer for `ServicePointsEarned`. Sends a thank-you email to the customer after their booking is completed with the points earned and their new total balance.

**`ServicePointsEarnedHandler`:**
- Batches all `ServicePointsEarned` events for the same `bookingId` (they arrive in quick succession)
- Sends one consolidated email per booking completion (not one per line)
- Email subject (pt-BR): `"Lavagem concluída! Você ganhou [X] pontos"`
- Body: services completed + points per service + new total balance + expiry date

**Note:** Batching strategy: process all events for a `bookingId` within a 5-second window OR simply send one email per `ServicePointsEarned` event (simpler, acceptable for MVP).

**Acceptance criteria:**
- [ ] Customer receives an email after booking completion with points earned
- [ ] Email subject is in pt-BR and mentions the points earned
- [ ] `totalActiveAfter` from the event payload is displayed in the email
- [ ] Handler is idempotent on `eventId`
- [ ] Email appears in MailHog in integration test

**Dependencies:** M10-S04, M04-S05
