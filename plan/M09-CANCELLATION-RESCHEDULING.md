# M09 — Cancellation & Rescheduling

**Phase:** Local Development  
**Goal:** Customers can cancel their own bookings within the configurable cancellation window. Admins can cancel any booking or reschedule an approved booking to a new slot. All actions emit events and trigger email notifications.  
**Depends on:** M08 (approved bookings needed for rescheduling, pending for customer cancel)  
**Blocks:** M10 (completion tests need cancel/reschedule paths tested first)

---

## Stories

---

### M09-S01 — UC-007: Customer cancels booking ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE-CASES.md` § UC-007, `docs/21-TENANTS_SETTINGS_SCHEMA.md` § cancellation_window_hours

**Description:**  
Implement customer-initiated booking cancellation. The cancellation window is read from `tenants.settings.booking.cancellation_window_hours` — if fewer than that many hours remain before `scheduledAt`, cancellation is refused. The window is never hardcoded.

**Backend use case `CancelBookingAsCustomerUseCase`:**
1. Load `Booking` by `(id, tenantId)` — must have status PENDING, INFO_REQUESTED, or APPROVED
2. Validate `booking.customerId === caller.sub`
3. Load tenant settings → get `cancellation_window_hours`
4. Call `booking.isEligibleForCancellation(cancellation_window_hours)` — if false, return `422`
5. Call `booking.cancel(customerId, isBusiness=false)`
6. Persist (emits `BookingCancelled`)

**BFF endpoint:** `PATCH /v1/bookings/:id/cancel`
- Requires: JWT + `CUSTOMER` role
- Returns: `200 { bookingId, status: 'CANCELLED' }`

**Acceptance criteria:**
- [ ] Customer cancels a booking with >48h (default window) before `scheduledAt` → succeeds
- [ ] Customer attempts to cancel with <48h before `scheduledAt` → `422` with pt-BR message: `"O prazo para cancelamento expirou"`
- [ ] Cancellation window is read from `tenants.settings` — changing it to 24h changes the behavior without code changes
- [ ] Cancelling a COMPLETED or REJECTED booking returns `422`
- [ ] Customer can only cancel their own bookings — another customer's booking returns `403`
- [ ] `BookingCancelled` event emitted with `isBusiness=false`, `cancelledBy=customerId`
- [ ] Integration test: create booking scheduled in 1h + default 48h window → cancellation fails

**Dependencies:** M07-S03, M03-S05, M02-S06

---

### M09-S02 — UC-008a: Admin cancels booking ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-008

**Description:**  
Implement admin-initiated booking cancellation. Unlike customer cancellation, admins can cancel any booking at any time regardless of the cancellation window. Both PENDING and APPROVED bookings can be cancelled by staff.

**Backend use case `CancelBookingAsAdminUseCase`:**
1. Load `Booking` — must be PENDING, INFO_REQUESTED, or APPROVED
2. Call `booking.cancel(staffId, isBusiness=true, reason?)`
3. Persist (emits `BookingCancelled` with `isBusiness=true`)

**BFF endpoint:** `PATCH /v1/bookings/:id/cancel`
- When called with `STAFF|MANAGER` JWT → routes to admin cancellation
- Body: `{ reason?: string }`
- Returns: `200 { bookingId, status: 'CANCELLED' }`

Note: The same BFF endpoint `PATCH /v1/bookings/:id/cancel` handles both customer and admin cancellation — the backend use case is selected based on JWT role.

**Acceptance criteria:**
- [ ] Admin cancels a booking scheduled in 1 hour → succeeds (no window constraint)
- [ ] Admin cancels a COMPLETED booking → `422` (terminal state)
- [ ] Admin cancels a booking from another tenant → `404`
- [ ] `BookingCancelled` event has `isBusiness=true` when cancelled by admin
- [ ] `reason` is optional for admin cancellation

**Dependencies:** M07-S03, M03-S05

---

### M09-S03 — UC-008b: Admin reschedules booking ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-008 alt flow A1, `docs/03-DOMAIN_EVENTS.md` § BookingRescheduled

**Description:**  
Implement booking rescheduling. Only an admin can reschedule, and only APPROVED bookings can be rescheduled (moving from APPROVED to a new slot, staying APPROVED). The new slot must be available.

**Backend use case `RescheduleBookingUseCase`:**
1. Load `Booking` — must be APPROVED
2. Validate `newScheduledAt` is in the future
3. Re-run `AvailabilityService` for `newScheduledAt` with the booking's existing services
4. If slot unavailable → `409` with alternative slots
5. Call `booking.reschedule(staffId, newScheduledAt)`
6. Persist (emits `BookingRescheduled`)

**BFF endpoint:** `PATCH /v1/bookings/:id/reschedule`
- Requires: JWT + `MANAGER|STAFF` role
- Body: `{ newScheduledAt: 'ISO-8601' }`
- Returns: `200 { bookingId, status: 'APPROVED', scheduledAt: <new> }`

**Acceptance criteria:**
- [ ] Rescheduling an APPROVED booking to a free slot succeeds; `scheduledAt` is updated
- [ ] Rescheduling to an occupied slot returns `409` with available alternatives
- [ ] Rescheduling a PENDING booking returns `422` (only APPROVED can be rescheduled)
- [ ] `BookingRescheduled` event emitted with `previousScheduledAt`, `newScheduledAt`, `rescheduledBy`
- [ ] `newScheduledAt` in the past returns `422`
- [ ] Tenant isolation: cannot reschedule a booking from another tenant

**Dependencies:** M08-S01, M06-S03

---

### M09-S04 — Notification consumers for BookingCancelled + BookingRescheduled

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § BookingCancelled, BookingRescheduled

**Description:**  
Implement the 2 Notification context consumers for cancellation and rescheduling events. Each event triggers emails to both customer and admin in pt-BR.

**`BookingCancelledHandler`:**
- Sends email to customer: `"Seu agendamento foi cancelado"` — with booking details + refund info (N/A for MVP, no payment)
- Sends email to admin: `"Agendamento cancelado"` — with booking details + who cancelled + reason if provided

**`BookingRescheduledHandler`:**
- Sends email to customer: `"Seu agendamento foi reagendado"` — old date + new date + services + new total
- Sends email to admin: `"Agendamento reagendado"` — booking summary with old and new slot

**Acceptance criteria:**
- [ ] Customer cancellation → 2 emails in MailHog (customer + admin)
- [ ] Admin cancellation with `isBusiness=true` → admin email says `"cancelado pela equipe"`
- [ ] Rescheduling → 2 emails in MailHog (customer + admin) with both old and new `scheduledAt` in tenant timezone
- [ ] All subjects and bodies in pt-BR
- [ ] All 2 handlers are idempotent on `eventId`
- [ ] Dates/times displayed in tenant timezone (not UTC)

**Dependencies:** M09-S01, M09-S02, M09-S03, M04-S05
