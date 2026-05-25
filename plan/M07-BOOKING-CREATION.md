# M07 — Booking Creation

**Phase:** Local Development  
**Goal:** A guest or authenticated customer can submit a multi-service booking request. The booking is persisted with status PENDING, a BookingRequested event is emitted, and an admin confirmation email + customer acknowledgement email are sent via MailHog.  
**Depends on:** M06 (availability must be checked on slot selection), M03 (customer identity from JWT for authenticated flow), M04-S05 (Notification bootstrap for emails)  
**Blocks:** M08 (approval requires bookings to exist), M12 (hotsite booking form calls this endpoint)

---

## Stories

---

### M07-S01 — Booking + BookingLine aggregates domain layer ✅ Done

**Agent:** `backend-ts`  
**Complexity:** L  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Booking aggregate, `docs/05-BOUNDED_CONTEXTS.md` § Booking context, `docs/03-DOMAIN_EVENTS.md` § booking events

**Description:**  
Implement the core domain layer for `Booking` and `BookingLine`. This is the most important aggregate in the system — it owns the state machine, invariants, and emits all booking lifecycle events. Zero framework dependencies.

**`Booking` aggregate (`apps/backend/src/contexts/booking/domain/`):**
- Properties: `id` (UUID v7), `tenantId`, `status` (BookingStatus enum), `type` (GUEST | CUSTOMER), `customerId?`, `guestEmail`, `guestName`, `guestPhone` (Phone), `guestAddress?` (Address, optional general address), `pickupAddress?` (Address, required when any line has `requiresPickupAddressAtBooking=true`), `scheduledAt` (UTC), `totalDurationMins` (derived), `totalPrice` (Money, derived), `totalActualPrice?` (Money, null until COMPLETED), `lines` (BookingLine[]), `beforeServicePhotoUrls?[]`, `afterServicePhotoUrls?[]`, `adminNotes?`, `infoRequestMessage?`, `infoResponseMessage?`, `approvedAt?`, `completedAt?`, `cancelledAt?`, `createdAt`

- **State machine methods:**
  - `requestBooking(tenantId, guestEmail, guestName, guestPhone, scheduledAt, lines, type, customerId?, guestAddress?, pickupAddress?)` — static factory, status=PENDING, emits `BookingRequested`
  - `approve(staffId)` — PENDING|INFO_REQUESTED → APPROVED, freezes lines, emits `BookingApproved`
  - `reject(staffId, reason)` — PENDING|INFO_REQUESTED → REJECTED, emits `BookingRejected`
  - `requestMoreInfo(staffId, message)` — PENDING → INFO_REQUESTED, emits `BookingInfoRequested`
  - `submitInformation(response)` — INFO_REQUESTED → PENDING, emits `BookingInfoSubmitted`
  - `complete(staffId, lineActualPrices, afterPhotos)` — APPROVED → COMPLETED, sets `actualPriceCharged` per line, emits `BookingCompleted`
  - `cancel(cancelledBy, isBusiness, reason?)` — PENDING|INFO_REQUESTED|APPROVED → CANCELLED, emits `BookingCancelled`
  - `reschedule(staffId, newScheduledAt)` — APPROVED → APPROVED (same status), updates `scheduledAt`, emits `BookingRescheduled`
  - `isEligibleForCancellation(cancellationWindowHours)` — returns boolean (now < scheduledAt - windowHours)

- **Invariants:**
  - ≥1 `BookingLine` required
  - `totalPrice` and `totalDurationMins` are always derived (not stored directly)
  - Lines are frozen once APPROVED (no further changes to `lines[]`)
  - Invalid state transitions throw domain errors with descriptive messages
  - `totalActualPrice` is null until COMPLETED
  - `requiresPickupAddress` on any line → `pickupAddress` must be provided

**`BookingLine` entity (child of Booking):**
- Properties: `lineId` (UUID v7), `serviceId`, `serviceNameAtBooking`, `priceAtBooking` (Money), `durationMinsAtBooking`, `pointsValueAtBooking`, `requiresPickupAddressAtBooking` (boolean), `actualPriceCharged?` (Money)
- Snapshots service data at booking time — price/duration changes to Service never affect this

**Domain events emitted (from `docs/03-DOMAIN_EVENTS.md`):**
All events must use the standard 7-field envelope + their specific `data` payload.

**Acceptance criteria:**
- [ ] `Booking.requestBooking(...)` with zero lines throws a domain error
- [ ] `booking.approve()` on a COMPLETED booking throws (invalid transition)
- [ ] `booking.approve()` on a PENDING booking transitions to APPROVED and emits `BookingApproved`
- [ ] `booking.cancel(...)` on a COMPLETED booking throws
- [ ] `totalPrice` equals sum of `priceAtBooking` across all lines
- [ ] `totalDurationMins` equals sum of `durationMinsAtBooking` across all lines
- [ ] All 6 terminal/transition state machine paths covered by unit tests
- [ ] Domain events are added to `domainEvents[]` via `AggregateRoot.addDomainEvent()` — not published directly
- [ ] Zero imports from `@nestjs/*` or TypeORM

**Dependencies:** M00-S08

---

### M07-S02 — Booking database migrations ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § booking schema — bookings + booking_lines tables

**Description:**  
Create the TypeORM migrations for `booking.bookings` and `booking.booking_lines` tables. Booking lines are stored as child rows (not JSONB) so they can be indexed and queried individually for loyalty and reporting.

**Table: `booking.bookings`**
```sql
id                         UUID PRIMARY KEY
tenant_id                  UUID NOT NULL
status                     VARCHAR(30) NOT NULL DEFAULT 'PENDING'
type                       VARCHAR(20) NOT NULL CHECK (type IN ('GUEST','CUSTOMER'))
customer_id                UUID                               ← nullable for guest bookings
guest_email                VARCHAR(255) NOT NULL
guest_name                 VARCHAR(255) NOT NULL
guest_phone                VARCHAR(30) NOT NULL
guest_address              JSONB                              ← optional general address (non-pickup)
pickup_address             JSONB                              ← null unless a pickup service was selected
scheduled_at               TIMESTAMPTZ NOT NULL
total_duration_mins        INTEGER NOT NULL
total_price_amount         NUMERIC(10,2) NOT NULL
total_actual_price_amount  NUMERIC(10,2)                     ← null until COMPLETED
before_service_photo_urls  TEXT[] NOT NULL DEFAULT '{}'
after_service_photo_urls   TEXT[] NOT NULL DEFAULT '{}'
admin_notes                TEXT
info_request_message       TEXT                               ← admin prompt to customer (UC-005)
info_requested_at          TIMESTAMPTZ
info_requested_by          UUID                               ← staffId who requested info
info_response_message      TEXT                               ← customer reply notes (UC-005)
info_submitted_at          TIMESTAMPTZ
approved_at                TIMESTAMPTZ
approved_by                UUID                               ← staffId who approved
completed_at               TIMESTAMPTZ
completed_by               UUID                               ← staffId who completed
cancelled_at               TIMESTAMPTZ
cancelled_by               UUID                               ← staff or customer UUID
cancellation_reason        TEXT
rejected_at                TIMESTAMPTZ
rejected_by                UUID                               ← staffId who rejected
rejection_reason           TEXT
created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE (tenant_id, id)
INDEX (tenant_id)
INDEX (tenant_id, status)
INDEX (tenant_id, customer_id)
INDEX (tenant_id, scheduled_at)
```

**Table: `booking.booking_lines`**
```sql
line_id                            UUID PRIMARY KEY
booking_id                         UUID NOT NULL
tenant_id                          UUID NOT NULL                ← denormalized for tenant isolation
FOREIGN KEY (tenant_id, booking_id) REFERENCES booking.bookings(tenant_id, id)
FOREIGN KEY (tenant_id, service_id) REFERENCES booking.services(tenant_id, id)
service_id                         UUID NOT NULL
service_name_at_booking            VARCHAR(255) NOT NULL        ← snapshot of services.name
price_at_booking_amount            NUMERIC(10,2) NOT NULL
duration_mins_at_booking           INTEGER NOT NULL
points_value_at_booking            INTEGER NOT NULL DEFAULT 0
requires_pickup_address_at_booking BOOLEAN NOT NULL DEFAULT false
actual_price_charged_amount        NUMERIC(10,2)                ← null until COMPLETED

INDEX (tenant_id)
INDEX (tenant_id, booking_id)
INDEX (tenant_id, service_id)
```

**Acceptance criteria:**
- [ ] Both tables created via `pnpm db:migrate` without errors
- [ ] `booking.booking_lines.tenant_id` is denormalized (redundant but required for isolation)
- [ ] Composite FK `(tenant_id, booking_id) REFERENCES booking.bookings(tenant_id, id)` exists
- [ ] `UNIQUE(tenant_id, id)` constraint exists on `booking.bookings`
- [ ] Migration reverts cleanly (drops lines first, then bookings)
- [ ] All indexes exist as specified

**Dependencies:** M07-S01, M00-S07

---

### M07-S03 — Booking infrastructure (TypeORM entities, repository, event publishing) ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/11-ARCHITECTURE.md` § hexagonal layers, `docs/05-BOUNDED_CONTEXTS.md` § event publishing pattern

**Description:**  
Implement the TypeORM entities, repository adapter, and event publishing wiring for the Booking aggregate. Follows the established post-commit flush pattern used by every other use case in this codebase: the use case wraps `repo.save()` in `txManager.run()`, then calls `booking.clearDomainEvents()` and flushes each event to `eventBus.publish()` after the transaction completes. This is NOT a transactional outbox (no relay table, no background worker) — event publishing is best-effort post-commit.

**What to create:**
- `IBookingRepository` port (`application/ports/booking-repository.port.ts`) + `BOOKING_REPOSITORY` injection token
- `BookingEntity` + `BookingLineEntity` (TypeORM) — map to migration tables; reconstruct `Booking` aggregate on load; register both in `BookingModule` `TypeOrmModule.forFeature()` and in `integration-global-setup.ts`
- `TypeOrmBookingRepository` — implements `IBookingRepository`:
  - `findById(id, tenantId): Promise<Booking | null>`
  - `findAllByTenant(tenantId, filters): Promise<Booking[]>` — filters: status, customerId, scheduledAfter, scheduledBefore
  - `save(booking): Promise<void>` — persists aggregate only; checks `getActiveEntityManager()` to join the active transaction when called inside `txManager.run()`
- `TypeOrmBookingAvailabilityAdapter` — implements `IBookingAvailabilityPort` (replaces the M06 stub); uses `@InjectRepository(BookingEntity)` directly for lightweight queries — does NOT inject `IBookingRepository`:
  - `findApprovedByTenantAndDate(tenantId, date): Promise<BookedSlot[]>` — returns `{ scheduledAt, totalDurationMins }` for all APPROVED bookings on `date` (UTC)
  - `findApprovedByTenantAndDateRange(tenantId, from, to): Promise<BookedSlot[]>` — APPROVED bookings whose `scheduled_at` falls in `[from 00:00:00Z, to 23:59:59Z]`; single query
- `InMemoryBookingRepository` test double (`src/test/repositories/booking/in-memory-booking.repository.ts`) — needed by M07-S04/S05 unit tests
- Wire `EventBusModule` into `BookingModule` imports — do NOT create a new `IEventBus` adapter; `GcpPubSubEventBusAdapter` already exists in shared infrastructure

**Event publishing (use case responsibility, not repository):**
- Use case wraps `repo.save()` in `ITransactionManager.run()` — same pattern as every other write use case
- Repository `save()` calls `getActiveEntityManager()` to join the active transaction; persists `BookingEntity` + `BookingLineEntity[]` within it
- After `txManager.run()` completes, use case flushes: `for (const e of booking.clearDomainEvents()) await eventBus.publish(e)`
- `repo.save()` never publishes events — that is exclusively the use case's responsibility
- If the process crashes between commit and `publish()`, the event is lost — this is a known, accepted tradeoff for MVP

**Acceptance criteria:**
- [ ] `IBookingRepository` port file and `BOOKING_REPOSITORY` token exist
- [ ] `save()` persists both `bookings` and `booking_lines` rows in a single transaction
- [ ] `save()` does NOT publish domain events — the use case does that post-commit
- [ ] If `IEventBus.publish()` throws, the DB is NOT rolled back (events are best-effort post-commit)
- [ ] `TypeOrmBookingAvailabilityAdapter.findApprovedByTenantAndDate` returns only APPROVED bookings for the given UTC date, filtered by `tenant_id`
- [ ] `TypeOrmBookingAvailabilityAdapter.findApprovedByTenantAndDateRange` returns APPROVED bookings within the UTC date range; single query
- [ ] `TypeOrmBookingAvailabilityAdapter` is wired into `BookingModule` replacing `InMemoryBookingAvailabilityAdapter`
- [ ] `BookingEntity` and `BookingLineEntity` are registered in `integration-global-setup.ts`
- [ ] Booking entity correctly reconstructs the `Booking` domain aggregate including all fields and lines
- [ ] Tenant isolation: `findById(id, tenantB)` for a booking that belongs to `tenantA` returns `null`
- [ ] Integration test: save a booking → read it back → assert all fields, including `lines[]`, match
- [ ] `InMemoryBookingRepository` exists in `src/test/repositories/booking/`
- [ ] All queries filter by `tenant_id`

**Dependencies:** M07-S01, M07-S02, M02-S04

---

### M07-S04 — UC-001: Guest requests booking ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-001, `docs/14-API_CONTRACTS.md` § POST /bookings

**Description:**  
Implement the guest booking request use case. No authentication required — only `X-Tenant-Slug`. The slot is re-validated at submission time (not just when the calendar was viewed), and a `BookingRequested` event is emitted.

**Backend use case `RequestBookingUseCase`:**

Injected dependencies: `TenantContext`, `IServiceRepository` (`SERVICE_REPOSITORY`), `IBookingAvailabilityPort` (`BOOKING_AVAILABILITY_PORT`), `IBookingRepository` (`BOOKING_REPOSITORY`), `ITransactionManager` (`TRANSACTION_MANAGER`), `IEventBus` (`EVENT_BUS`).

1. Load services via `serviceRepo.findByIds(serviceIds, tenantId)`. For each requested `serviceId`: if not found in results → throw `BookingServiceNotInTenantError`; if `!service.isActive` → throw `BookingServiceNotActiveError`.
2. Re-verify slot availability with a direct overlap query — do NOT run `AvailabilityService.calculate()` (too heavy for a write path). Call `bookingAvailabilityPort.findApprovedByTenantAndDate(tenantId, localDate)` where `localDate` is derived from `scheduledAt` via `utcDateToLocalDate(scheduledAt, businessHours.timezone)`. Check that no returned `BookedSlot` interval `[slot.scheduledAt, slot.scheduledAt + slot.totalDurationMins)` overlaps `[scheduledAt, scheduledAt + totalDurationMins)`. Overlap condition (half-open intervals): `slot.scheduledAt < end && scheduledAt < slotEnd`. If overlap found → throw `BookingSlotUnavailableError`.

   > **Getting `timezone`:** call `settingsPort.getSchedulingSettings(tenantId)` to obtain `businessHours.timezone`. Add `IScheduleTenantSettingsPort` (`SCHEDULE_TENANT_SETTINGS_PORT`) to injected deps. This is the only field needed from settings for the slot check.

3. Create `Booking` via `Booking.requestBooking({ tenantId, guestEmail, guestName, guestPhone, scheduledAt, lineInputs, type: 'GUEST', correlationId, guestAddress?, pickupAddress?, beforeServicePhotoUrls? })`. `correlationId` comes from `tenantContext.correlationId`. Build each `BookingLineInput` from the loaded `Service`: `{ serviceId, serviceNameAtBooking: service.name, priceAtBooking: service.price, durationMinsAtBooking: service.durationMinutes, pointsValueAtBooking: service.pointsValue, requiresPickupAddressAtBooking: service.requiresPickupAddress }`. Service order matches `serviceIds` input order; duplicates are allowed.
4. Persist: wrap `bookingRepo.save(booking)` inside `txManager.run()`.
5. Flush events post-commit: `for (const e of booking.clearDomainEvents()) await eventBus.publish(e)`. The repository does NOT publish events — this is exclusively the use case's responsibility.

**Error mapper additions required** (update `booking-error.mapper.ts` as part of this story):
- `BookingSlotUnavailableError` → `409 Conflict`
- `BookingNotFoundError` → `404 Not Found`
- `BookingServiceNotInTenantError` → `400 Bad Request`
- `BookingServiceNotActiveError` → `400 Bad Request`

**BFF endpoint:** `POST /v1/bookings`
- **Public** — requires only `X-Tenant-Slug` (no JWT for guest booking); use `@Public()` decorator.
- Resolves tenant: `GET /internal/tenants/by-slug/${tenantSlug}` → `tenantId`.
- Forwards to backend via `backendHttp.postForPublic('/bookings', body, tenantId)`.
- **`BackendHttpService.postForPublic(path, body, tenantId)` does not yet exist** — add it alongside the existing `getForPublic` method: sends only `X-Tenant-ID: tenantId` header, no auth headers.
- Request body (Zod-validated):
```json
{
  "guestEmail": "cliente@email.com",
  "guestName": "João Silva",
  "guestPhone": "+5531999999999",
  "guestAddress": { "street": "...", "number": "45", "complement": null, "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30100000" },
  "pickupAddress": { "street": "...", "number": "123", "complement": null, "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30100000" },
  "scheduledAt": "2026-06-15T10:00:00Z",
  "serviceIds": ["uuid1", "uuid2"],
  "beforeServicePhotoUrls": ["https://..."]
}
```
(`guestAddress` always optional. `pickupAddress` required only when any selected service has `requiresPickupAddress=true`. `beforeServicePhotoUrls` optional, defaults to `[]`.)
- Returns `201`:
```json
{
  "bookingId": "uuid",
  "status": "PENDING",
  "scheduledAt": "2026-06-15T10:00:00Z",
  "totalPrice": { "amount": 120.00, "currency": "BRL" },
  "totalDurationMins": 85,
  "pickupAddress": { "street": "...", "number": "123", "complement": null, "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30100000" },
  "lines": [
    {
      "lineId": "uuid",
      "serviceId": "uuid",
      "priceAtBooking": { "amount": 100.00, "currency": "BRL" },
      "durationMinsAtBooking": 60,
      "pointsValueAtBooking": 1,
      "requiresPickupAddressAtBooking": false
    }
  ]
}
```
(`pickupAddress` omitted when null. `serviceNameAtBooking` is stored on the line but is NOT included in this response — follow API contracts exactly.)

**Acceptance criteria:**
- [ ] `booking-error.mapper.ts` updated: `BookingSlotUnavailableError → 409`, `BookingNotFoundError → 404`, `BookingServiceNotInTenantError → 400`, `BookingServiceNotActiveError → 400`
- [ ] `BackendHttpService.postForPublic(path, body, tenantId)` method added
- [ ] Guest booking created with `type=GUEST` and `customer_id=null`
- [ ] `beforeServicePhotoUrls` stored on the booking when provided; defaults to `[]`
- [ ] `BookingRequested` event published to Pub/Sub with all 7 envelope fields
- [ ] Slot already taken by another APPROVED booking returns `409`
- [ ] Slot check is a direct overlap query via `IBookingAvailabilityPort` — does not invoke `AvailabilityService.calculate()`
- [ ] Service not belonging to the tenant returns `400`
- [ ] Deactivated service returns `400`
- [ ] `guestEmail` validation: invalid format returns `400`
- [ ] `guestPhone` validation: invalid Brazilian E.164 format returns `400`
- [ ] `pickupAddress` required when any service has `requiresPickupAddress=true`; absent → `400`
- [ ] `guestAddress` is optional — booking accepted without it
- [ ] Backend: controller unit spec + integration spec (save → read back → assert lines, tenant isolation)
- [ ] BFF: `bookings.controller.spec.ts` (unit) + `bookings.controller.component.spec.ts` (component, per CLAUDE.md mandate — covers 401/400/happy-path/backend error propagation)
- [ ] Backend integration test verifies `BookingRequested` event on the Pub/Sub emulator

**Dependencies:** M07-S03, M06-S04, M03-S05

---

### M07-S05 — UC-002: Authenticated customer requests booking

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-002, `docs/14-API_CONTRACTS.md` § POST /bookings

**Description:**  
Implement the authenticated variant of booking creation. Same as UC-001 but with a JWT. The customer's `id` is attached to the booking (`customer_id`), their profile data pre-fills the guest fields, and `type=CUSTOMER`.

**Differences from UC-001:**
- Requires JWT (`role: CUSTOMER`)
- `customer_id` is populated from JWT `sub`
- `guestEmail` and `guestName` auto-populated from Customer record (can be overridden in body)
- `guestAddress` pre-filled from `Customer.defaultAddress` if not provided in request body (optional)
- `pickupAddress` pre-filled from `Customer.defaultAddress` if not provided and any service requires pickup
- `type=CUSTOMER`

**Acceptance criteria:**
- [ ] Authenticated booking is created with `type=CUSTOMER` and `customer_id` populated from JWT
- [ ] `guestEmail` is auto-populated from the Customer record if not provided in body
- [ ] `pickupAddress` is auto-populated from `Customer.defaultAddress` if not provided and a service requires pickup
- [ ] Customer from a different tenant calling this endpoint (wrong JWT tenant vs X-Tenant-Slug) returns `403`
- [ ] Integration test: create customer → POST booking with JWT → assert `customer_id` is set

**Dependencies:** M07-S04, M03-S01

---

### M07-S06 — BookingRequested event consumer (Notification context)

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § BookingRequested, `docs/05-BOUNDED_CONTEXTS.md` § Notification context

**Description:**  
Implement the Notification context's consumer for `BookingRequested`. Two emails are sent: one to the admin (new booking alert) and one to the customer/guest (booking acknowledgement). Both emails are in pt-BR. Emails are verified visually in MailHog.

**`BookingRequestedHandler`:**
1. Idempotency check via `eventId`
2. Send admin notification email (to: tenant's MANAGER email addresses):
   - Subject: `"Nova solicitação de agendamento — [Service Names]"`
   - Body: booking details (customer name, date/time, services, total price in R$)
3. Send customer acknowledgement email (to: `guestEmail`):
   - Subject: `"Seu agendamento foi recebido"`
   - Body: pt-BR confirmation with booking details + "aguarde aprovação"

**Acceptance criteria:**
- [ ] Two emails appear in MailHog after a booking is requested
- [ ] Admin email subject starts with `"Nova solicitação"`
- [ ] Customer email subject is `"Seu agendamento foi recebido"` (pt-BR)
- [ ] Prices in email bodies use `R$ 150,00` format (not `150.00`)
- [ ] If `BookingRequested` event is delivered twice (same `eventId`), only 2 emails total (idempotent)
- [ ] `IEmailSender` is injected — no direct SMTP client in handler

**Dependencies:** M07-S04, M04-S05

---

### M07-S07 — Customer profile endpoint

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/14-API_CONTRACTS.md` § customers endpoints, `docs/02-DOMAIN_MODEL.md` § Customer aggregate

**Description:**  
Expose a `GET /v1/customers/me` endpoint so the frontend can pre-fill the booking form with the authenticated customer's profile. Also allows the customer to update their default address.

**BFF endpoints:**
- `GET /v1/customers/me` — requires JWT (`role: CUSTOMER`); returns customer profile
- `PATCH /v1/customers/me` — requires JWT; body: `{ name?, phone?, defaultAddress? }`

**Response DTO:**
```json
{
  "customerId": "uuid",
  "email": "cliente@email.com.br",
  "name": "João Silva",
  "phone": "+5531999999999",
  "defaultAddress": { "street": "...", "city": "Belo Horizonte", "state": "MG", "zipCode": "30100-000" }
}
```

**Acceptance criteria:**
- [ ] `GET /v1/customers/me` returns the customer record for the JWT's `sub` + `tenantId`
- [ ] Customer from Tenant A cannot access Tenant B customer data (different JWT + tenant slug)
- [ ] `PATCH /v1/customers/me` updates only the provided fields
- [ ] Phone number must be valid Brazilian E.164 format (`+55...`)
- [ ] `zipCode` is an 8-digit CEP; hyphen is optional and normalized by the `Address` VO
