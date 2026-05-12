# M07 — Booking Creation

**Phase:** Local Development  
**Goal:** A guest or authenticated customer can submit a multi-service booking request. The booking is persisted with status PENDING, a BookingRequested event is emitted, and an admin confirmation email + customer acknowledgement email are sent via MailHog.  
**Depends on:** M06 (availability must be checked on slot selection), M03 (customer identity from JWT for authenticated flow), M04-S05 (Notification bootstrap for emails)  
**Blocks:** M08 (approval requires bookings to exist), M12 (hotsite booking form calls this endpoint)

---

## Stories

---

### M07-S01 — Booking + BookingLine aggregates domain layer

**Agent:** `backend-ts`  
**Complexity:** L  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Booking aggregate, `docs/05-BOUNDED_CONTEXTS.md` § Booking context, `docs/03-DOMAIN_EVENTS.md` § booking events

**Description:**  
Implement the core domain layer for `Booking` and `BookingLine`. This is the most important aggregate in the system — it owns the state machine, invariants, and emits all booking lifecycle events. Zero framework dependencies.

**`Booking` aggregate (`apps/backend/src/contexts/booking/domain/`):**
- Properties: `id` (UUID v7), `tenantId`, `status` (BookingStatus enum), `type` (GUEST | CUSTOMER), `customerId?`, `guestEmail`, `guestName`, `scheduledAt` (UTC), `totalDurationMins` (derived), `totalPrice` (Money, derived), `totalActualPrice?` (Money, null until COMPLETED), `lines` (BookingLine[]), `carPhotoUrls?[]`, `afterServicePhotoUrls?[]`, `adminNotes?`, `infoRequestMessage?`, `infoResponseMessage?`, `approvedAt?`, `completedAt?`, `cancelledAt?`, `createdAt`

- **State machine methods:**
  - `requestBooking(tenantId, guestEmail, guestName, scheduledAt, lines, type, customerId?)` — static factory, status=PENDING, emits `BookingRequested`
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
  - `requiresPickupAddress` on any line → `guestAddress` must be provided

**`BookingLine` entity (child of Booking):**
- Properties: `lineId` (UUID v7), `serviceId`, `serviceNameAtBooking`, `priceAtBooking` (Money), `durationMinsAtBooking`, `pointsValueAtBooking`, `actualPriceCharged?` (Money)
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

### M07-S02 — Booking database migrations

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § booking schema — bookings + booking_lines tables

**Description:**  
Create the TypeORM migrations for `booking.bookings` and `booking.booking_lines` tables. Booking lines are stored as child rows (not JSONB) so they can be indexed and queried individually for loyalty and reporting.

**Table: `booking.bookings`**
```sql
id                       UUID PRIMARY KEY
tenant_id                UUID NOT NULL
status                   VARCHAR(30) NOT NULL DEFAULT 'PENDING'
type                     VARCHAR(20) NOT NULL CHECK (type IN ('GUEST','CUSTOMER'))
customer_id              UUID                               ← nullable for guest bookings
guest_email              VARCHAR(255) NOT NULL
guest_name               VARCHAR(255) NOT NULL
guest_address            JSONB
scheduled_at             TIMESTAMPTZ NOT NULL
total_duration_mins      INTEGER NOT NULL
total_price_amount       NUMERIC(10,2) NOT NULL
total_actual_price_amount NUMERIC(10,2)                    ← null until COMPLETED
car_photo_urls           TEXT[]   DEFAULT '{}'
after_service_photo_urls TEXT[]   DEFAULT '{}'
admin_notes              TEXT
info_request_message     TEXT
info_response_message    TEXT
approved_at              TIMESTAMPTZ
completed_at             TIMESTAMPTZ
cancelled_at             TIMESTAMPTZ
created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()

INDEX (tenant_id)
INDEX (tenant_id, status)
INDEX (tenant_id, customer_id)
INDEX (tenant_id, scheduled_at)
```

**Table: `booking.booking_lines`**
```sql
line_id                  UUID PRIMARY KEY
booking_id               UUID NOT NULL REFERENCES booking.bookings(id)
tenant_id                UUID NOT NULL               ← denormalized for tenant isolation
service_id               UUID NOT NULL
service_name_at_booking  VARCHAR(255) NOT NULL
price_at_booking_amount  NUMERIC(10,2) NOT NULL
duration_mins_at_booking INTEGER NOT NULL
points_value_at_booking  INTEGER NOT NULL DEFAULT 0
actual_price_charged_amount NUMERIC(10,2)            ← null until COMPLETED

INDEX (tenant_id)
INDEX (booking_id)
INDEX (tenant_id, service_id)
```

**Acceptance criteria:**
- [ ] Both tables created via `pnpm db:migrate` without errors
- [ ] `booking.booking_lines.tenant_id` is denormalized (redundant but required for isolation)
- [ ] REFERENCES constraint from `booking_lines.booking_id` → `bookings.id` exists
- [ ] Migration reverts cleanly (drops lines first, then bookings)
- [ ] All indexes exist as specified

**Dependencies:** M07-S01, M00-S07

---

### M07-S03 — Booking infrastructure (TypeORM + transactional outbox)

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/11-ARCHITECTURE.md` § hexagonal layers, `docs/05-BOUNDED_CONTEXTS.md` § event publishing pattern

**Description:**  
Implement the TypeORM entities, repository adapter, and the transactional outbox pattern for the Booking aggregate. The transactional outbox ensures that domain events are published atomically with the state change — if the DB commit succeeds, the event will eventually be published; if it fails, neither the state change nor the event is persisted.

**What to create:**
- `BookingEntity` + `BookingLineEntity` (TypeORM) — map to migration tables; reconstruct `Booking` aggregate on load
- `TypeOrmBookingRepository` — implements `IBookingRepository`:
  - `findById(id, tenantId): Promise<Booking | null>`
  - `findAllByTenant(tenantId, filters): Promise<Booking[]>` — filters: status, customerId, scheduledAfter, scheduledBefore
  - `findApprovedByTenantAndDate(tenantId, date): Promise<Booking[]>` — used by availability algorithm
  - `save(booking, tenantId): Promise<void>` — within one transaction: persist aggregate + publish domain events via `IEventBus`
- `PubSubEventBusAdapter` — implements `IEventBus`, publishes events to Pub/Sub emulator (wraps Google Pub/Sub client)

**Transactional approach:**
- `save()` opens a TypeORM `QueryRunner` transaction
- Persists `BookingEntity` + `BookingLineEntity[]`
- On commit success → call `IEventBus.publish()` for each domain event
- On failure → rollback (events are not published)

**Acceptance criteria:**
- [ ] `save()` persists both `bookings` and `booking_lines` rows in a single transaction
- [ ] If `IEventBus.publish()` throws, the DB is NOT rolled back (events are best-effort post-commit)
- [ ] `findApprovedByTenantAndDate` returns only APPROVED bookings for a specific UTC date, filtered by `tenant_id`
- [ ] Booking entity correctly reconstructs the `Booking` domain aggregate including all lines
- [ ] Integration test: save a booking → read it back → assert all fields, including `lines[]`, match
- [ ] All queries include `WHERE tenant_id = :tenantId`

**Dependencies:** M07-S01, M07-S02, M02-S04

---

### M07-S04 — UC-001: Guest requests booking

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-001, `docs/14-API_CONTRACTS.md` § POST /bookings

**Description:**  
Implement the guest booking request use case. No authentication required — only `X-Tenant-Slug`. The slot is re-validated at submission time (not just when the calendar was viewed), and a `BookingRequested` event is emitted.

**Backend use case `RequestBookingUseCase`:**
1. Load tenant + settings
2. Load requested services (validate all active, all belong to tenant)
3. Re-verify slot availability via `AvailabilityService` (slot could have been taken since calendar view)
4. If slot unavailable → return `409` with nearest available slots
5. Create `Booking` via `Booking.requestBooking(...)` with `type=GUEST`
6. Persist via `IBookingRepository.save()` (emits `BookingRequested`)

**BFF endpoint:** `POST /v1/bookings`
- **Public** — requires only `X-Tenant-Slug` (no JWT for guest booking)
- Body:
```json
{
  "guestEmail": "cliente@email.com",
  "guestName": "João Silva",
  "guestAddress": { "street": "...", "zipCode": "..." },
  "scheduledAt": "2026-06-15T10:00:00Z",
  "serviceIds": ["uuid1", "uuid2"]
}
```
- Returns: `201 { bookingId, status: 'PENDING', scheduledAt, totalPrice, totalDurationMins }`

**Acceptance criteria:**
- [ ] Guest booking created with `type=GUEST` and `customer_id=null`
- [ ] `BookingRequested` event published to Pub/Sub with all 7 envelope fields
- [ ] Slot already taken by another APPROVED booking returns `409` with message in pt-BR
- [ ] Service not belonging to the tenant returns `400`
- [ ] Deactivated service returns `400`
- [ ] `guestEmail` validation: invalid format returns `400`
- [ ] `guestAddress` required when any service has `requiresPickupAddress=true`
- [ ] Integration test: full flow from POST to DB assertion + Pub/Sub emulator event verification
- [ ] Tenant isolation: booking is created with correct `tenant_id` from `X-Tenant-Slug` resolution

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
- `guestAddress` pre-filled from `Customer.defaultAddress` if not provided in request body
- `type=CUSTOMER`

**Acceptance criteria:**
- [ ] Authenticated booking is created with `type=CUSTOMER` and `customer_id` populated from JWT
- [ ] `guestEmail` is auto-populated from the Customer record if not provided in body
- [ ] `guestAddress` is auto-populated from `Customer.defaultAddress` if not provided and a service requires it
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
- [ ] `zipCode` must match Brazilian format (`NNNNN-NNN`)
