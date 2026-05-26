# M08 — Booking Approval Workflow

**Phase:** Local Development  
**Goal:** An admin can approve, reject, or request additional information for a PENDING booking. A customer can respond to an info request. Emails are sent at each transition. The booking queue is visible to staff.  
**Depends on:** M07 (bookings must exist in PENDING state)  
**Blocks:** M09 (cancellation requires APPROVED bookings), M10 (completion requires APPROVED bookings)

---

## Stories

---

### M08-S01 — UC-003: Admin approves booking ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-003, `docs/03-DOMAIN_EVENTS.md` § BookingApproved

**Description:**  
Implement the approval use case. Before approving, the system re-checks that the requested slot is still available (another booking may have been approved in the meantime). Lines are frozen on approval — no further changes to `lines[]` are allowed.

**Backend use case `ApproveBookingUseCase`:**
1. Load `Booking` by `(id, tenantId)` — must be PENDING or INFO_REQUESTED
2. Re-run `AvailabilityService` for the booking's `scheduledAt` and service set
3. If slot unavailable → return `409` with nearest free slots in `details`
4. Call `booking.approve(staffId)` → transitions to APPROVED, freezes lines
5. Persist via `IBookingRepository.save()` (emits `BookingApproved`)

**BFF endpoint:** `PATCH /v1/bookings/:id/approve`
- Requires: JWT + `MANAGER|STAFF` role
- Returns: `200 { bookingId, status: 'APPROVED', approvedAt }`

**Acceptance criteria:**
- [ ] Approving a PENDING booking transitions it to APPROVED
- [ ] Approving an INFO_REQUESTED booking also transitions to APPROVED (both valid source states)
- [ ] Approving when the slot is already taken by another APPROVED booking returns `409` with pt-BR message and suggested alternative slots
- [ ] Approving a COMPLETED, REJECTED, or CANCELLED booking returns `422` (invalid transition)
- [ ] `BookingApproved` event emitted with all 7 envelope fields + `approvedBy`, `approvedSlot`, `totalPrice`, `lineSummary[]`
- [ ] Integration test: create booking → approve → assert status=APPROVED + event published
- [ ] Tenant isolation: cannot approve a booking from another tenant

**Dependencies:** M07-S03, M06-S03, M03-S05

---

### M08-S02 — UC-004: Admin rejects booking ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-004, `docs/03-DOMAIN_EVENTS.md` § BookingRejected

**Description:**  
Implement the rejection use case. Rejection is a terminal state — the booking cannot be re-opened after rejection.

**Backend use case `RejectBookingUseCase`:**
1. Load `Booking` by `(id, tenantId)` — must be PENDING or INFO_REQUESTED
2. Call `booking.reject(staffId, reason)`
3. Persist (emits `BookingRejected`)

**BFF endpoint:** `PATCH /v1/bookings/:id/reject`
- Requires: JWT + `MANAGER|STAFF` role
- Body: `{ reason: string }` — required, min 10 chars
- Returns: `200 { bookingId, status: 'REJECTED' }`

**Acceptance criteria:**
- [ ] Rejecting a PENDING booking transitions to REJECTED
- [ ] Rejecting with an empty `reason` returns `400`
- [ ] Rejecting an APPROVED booking returns `422` (invalid — APPROVED bookings must be cancelled, not rejected)
- [ ] `BookingRejected` event emitted with `reason`, `rejectedBy`
- [ ] REJECTED is terminal — subsequent approve/reject calls return `422`

**Dependencies:** M07-S03, M03-S05

---

### M08-S03 — UC-005a: Admin requests more information ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-005, `docs/03-DOMAIN_EVENTS.md` § BookingInfoRequested

**Description:**  
Implement the info-request use case: admin sends a message to the customer asking for more details before approving. Booking transitions PENDING → INFO_REQUESTED.

**Backend use case `RequestMoreInfoUseCase`:**
1. Load `Booking` — must be PENDING
2. Call `booking.requestMoreInfo(staffId, message)`
3. Persist (emits `BookingInfoRequested`)

**BFF endpoint:** `PATCH /v1/bookings/:id/request-info`
- Requires: JWT + `MANAGER|STAFF` role
- Body: `{ message: string }` — required, min 20 chars
- Returns: `200 { bookingId, status: 'INFO_REQUESTED' }`

**Acceptance criteria:**
- [ ] PENDING → INFO_REQUESTED on valid request
- [ ] Requesting info on a booking already in INFO_REQUESTED state returns `422`
- [ ] `infoRequestMessage` is stored on the booking
- [ ] `BookingInfoRequested` event emitted with `message`, `requestedBy`
- [ ] Empty `message` returns `400`

**Dependencies:** M07-S03, M03-S05

---

### M08-S04 — UC-005b: Customer submits information

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-005 (alt flow), `docs/03-DOMAIN_EVENTS.md` § BookingInfoSubmitted

**Description:**  
Implement the customer-side response to an info request. The booking transitions INFO_REQUESTED → PENDING (back to pending, ready for admin to review again and approve/reject).

> **⚠️ Planning note — guest info-submission:** UC-005 A2 requires that guests (unauthenticated) can also respond to info requests via a link in the notification email. This means a second, unauthenticated endpoint is needed in addition to the JWT-protected one below. The technical design (token generation, expiry, token storage, unauthenticated BFF route) must be agreed before implementation begins. Treat this as a mandatory part of this story, not a follow-up.

**Backend use case `SubmitBookingInfoUseCase`:**
1. Load `Booking` — must be INFO_REQUESTED
2. For authenticated path: validate `booking.customerId === caller.sub` (customer can only update their own bookings)
3. Call `booking.submitInformation(submittedBy, response, photoUrls?)`
4. Appends any `photoUrls` to `booking.beforeServicePhotoUrls`
5. Sets `infoSubmittedBy` (customerId for authenticated, null for guest)
6. Persist (emits `BookingInfoSubmitted`)

**BFF endpoints:**
- **Authenticated path:** `PATCH /v1/bookings/:id/submit-info`
  - Requires: JWT + `CUSTOMER` role
  - Body: `{ response: string, photoUrls?: string[] }` — `response` required
  - Returns: `200 { bookingId, status: 'PENDING' }`
- **Guest path:** endpoint design TBD in planning (tokenised link from notification email)

**Acceptance criteria:**
- [ ] INFO_REQUESTED → PENDING on valid submission (both authenticated and guest paths)
- [ ] Customer can only submit info for their own bookings — attempting to submit for another customer's booking returns `403`
- [ ] `photoUrls` (if provided) are appended to `booking.beforeServicePhotoUrls`
- [ ] `infoResponseMessage` is stored on the booking
- [ ] `infoSubmittedBy` is set to the customer's UUID (authenticated path) or `null` (guest path)
- [ ] `BookingInfoSubmitted` event emitted with `{ response, photoUrls, customerId, submittedByEmail }`
- [ ] Submitting info on a PENDING booking (not INFO_REQUESTED) returns `422`
- [ ] Guest tokenised-link path: design and implementation included in this story

**Dependencies:** M08-S03

---

### M08-S05 — Notification consumers for approval workflow events

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § BookingApproved, BookingRejected, BookingInfoRequested, BookingInfoSubmitted

**Description:**  
Implement the 4 Notification context event consumers for the approval workflow. Each handler sends one email in pt-BR, verified in MailHog. All handlers must be idempotent on `eventId`.

**Handlers to create:**

`BookingApprovedHandler` → email to customer:
- Subject: `"Seu agendamento foi confirmado! ✓"`
- Body: date, time (tenant timezone), services list, total price in R$, pickup address if applicable

`BookingRejectedHandler` → email to customer:
- Subject: `"Sobre seu pedido de agendamento"`
- Body: reason provided by admin, pt-BR apology, suggestion to re-book

`BookingInfoRequestedHandler` → email to customer:
- Subject: `"Precisamos de mais informações sobre seu agendamento"`
- Body: admin's message, link to respond (frontend URL `/dashboard/bookings/:id`)

`BookingInfoSubmittedHandler` → email to admin (MANAGER of tenant):
- Subject: `"Cliente respondeu à solicitação de informações"`
- Body: booking summary + customer's response

**Acceptance criteria:**
- [ ] Each event triggers exactly one email to the correct recipient
- [ ] `BookingApproved` email to customer contains date/time in tenant's timezone (not UTC)
- [ ] All subjects and bodies are in pt-BR
- [ ] Prices displayed as `R$ 150,00` (not `150.0` or `R$150,00`)
- [ ] All 4 handlers are idempotent — processing the same `eventId` twice sends only 1 email
- [ ] Each email verified to appear in MailHog in integration test

**Dependencies:** M08-S01, M08-S02, M08-S03, M08-S04, M04-S05

---

### M08-S06 — Booking list and detail APIs

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/14-API_CONTRACTS.md` § bookings endpoints, `docs/04-USE_CASES.md` § UC-006

**Description:**  
Implement the booking list and detail endpoints. The list endpoint returns different views depending on the caller's role: customers see their own bookings; staff see all bookings for the tenant (the admin queue). This is UC-006 (customer views bookings) and the staff queue view.

**BFF endpoints:**
- `GET /v1/bookings` — requires JWT:
  - If `role=CUSTOMER` → returns bookings where `customer_id = JWT.sub` (tenant-scoped)
  - If `role=STAFF|MANAGER` → returns all bookings for tenant with optional filter `?status=PENDING`
  - Query params: `status`, `from`, `to`, `page`, `limit`
- `GET /v1/bookings/:id` — requires JWT; customer can only see their own; staff can see all

**Response DTO (per booking):**
```json
{
  "id": "uuid",
  "status": "PENDING",
  "type": "CUSTOMER",
  "guestName": "João Silva",
  "guestEmail": "joao@email.com",
  "scheduledAt": "ISO-8601",
  "totalDurationMins": 75,
  "totalPrice": { "amount": 200.00, "currency": "BRL", "formatted": "R$ 200,00" },
  "lines": [{ "serviceId": "...", "serviceName": "...", "price": {...}, "durationMins": 60 }],
  "createdAt": "ISO-8601"
}
```

**Acceptance criteria:**
- [ ] Customer calling `GET /v1/bookings` only receives their own bookings (filtered by `customer_id`)
- [ ] Staff calling `GET /v1/bookings?status=PENDING` receives all PENDING bookings for the tenant
- [ ] Customer calling `GET /v1/bookings/:id` for another customer's booking returns `404`
- [ ] Response includes `pagination` object with `limit`, `offset`, `total`, `hasMore`
- [ ] `scheduledAt` in response is UTC ISO-8601 (frontend converts to display timezone)
- [ ] Tenant isolation: staff cannot access bookings from another tenant
