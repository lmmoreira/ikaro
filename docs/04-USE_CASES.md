# Use Cases - Ikaro

Use cases represent the business operations (user actions) that the system must support. Each use case describes the sequence of steps to achieve a business goal.

## Multi-Tenancy Note

All use cases operate within a **tenant scope**. When a user (staff or customer) interacts with the system, they are always scoped to their assigned tenant. A user can belong to only ONE tenant, and all their actions (viewing bookings, managing services, etc.) are isolated to that tenant's data.

**Example:** Staff member logs into Tenant A. They can only see/manage Tenant A's bookings, services, and staff. They cannot access Tenant B's data even if they somehow try to manipulate URLs or requests.

---

## Format

Each use case follows this structure:

```
UC-XXX: [Use Case Name]
- Actor: [Who performs this action?]
- Preconditions: [What must be true before?]
- Trigger: [What initiates this use case?]
- Main Flow: [Happy path steps]
- Alternative Flows: [Exception paths]
- Postconditions: [What's true after?]
- Events Triggered: [Domain events published]
```

---

## Booking Management Use Cases

### **UC-001: Guest Requests Booking (No Authentication)**

- **Actor:** Guest (unauthenticated user)
- **Tenant Scope:** Specific company/tenant
- **Preconditions:** Guest is on tenant's hotsite or booking page (e.g., <ikaro-domain>/tenant1). System has available time slots. Guest is requesting for a specific tenant.
- **Trigger:** Guest clicks "Request Booking"
- **Main Flow:**
  1. System identifies tenant from URL path (e.g., /tenant1).
  2. Guest enters: name, email, phone, and optionally a general address (`contactAddress`).
  3. Guest selects **one or more services** from that tenant's catalog (e.g. "Basic Wash" + "Wax", or "Basic Wash" twice for two cars). Each selection adds a line to the booking.
  4. As the guest adds / removes services, the booking summary updates live:
     - **Total price** = SUM of each selected service's current price.
     - **Total duration** = SUM of each selected service's duration.
     - If any selected service has `requiresPickupAddress = true`, the form reveals a **pickup address field**.
  5. System displays calendar with available slots, filtered by **total duration**.
  6. Guest selects preferred date/time.
  7. **If pickup address field is visible:** Guest fills in the address (street, number, complement, neighborhood, city, state, CEP). Required — cannot submit without it.
  8. Guest optionally uploads one or more car photos (PNG/JPG).
  9. System validates: email format, phone format, slot availability, ≥ 1 service selected, file sizes, and — if any pickup service selected — pickup address is present and CEP is 8 digits.
  10. Guest clicks "Submit".
  11. System creates the `Booking` aggregate with status = PENDING and one `BookingLine` per selected service. Each line snapshots `priceAtBooking`, `durationMinsAtBooking`, `pointsValueAtBooking`, and `requiresPickupAddressAtBooking`. `Booking.contactAddress` stored if provided. `Booking.pickupAddress` is set if any pickup service was selected. Photos stored. All rows scoped to tenant.
  12. System publishes `BookingRequested` event (includes `pickupAddress` when applicable).
  13. Guest sees confirmation: "Your request is pending. You'll hear from us soon."

- **Alternative Flows:**
  - **A1: Invalid email** → System shows error, guest corrects.
  - **A2: No service selected** → "Submit" disabled until ≥ 1 service is in the basket.
  - **A3: No available slots for the selected duration** → System shows "No slot of [N] minutes is available on that day; pick another day or remove a service".
  - **A4: Photo upload fails** → System allows submission without photos (optional).
  - **A5: Multiple photos** → Guest can add/remove photos before submitting.
  - **A6: Wrong tenant URL** → Guest sees only that tenant's services/calendar.
  - **A7: Pickup service selected but address missing** → System blocks submission: "Endereço de coleta obrigatório para o serviço selecionado."
  - **A8: Guest removes pickup service from basket** → Address field hides; previously entered address is discarded.

- **Postconditions:** Booking exists in PENDING with ≥ 1 lines (and `pickupAddress` if applicable), scoped to tenant. Admin notified. Guest receives confirmation email listing services, total price, and pickup address if relevant.
- **Events Triggered:** `BookingRequested` (envelope: `tenantId`; `data.lines[]` ≥ 1; `data.pickupAddress` if applicable).

---

### **UC-002: Authenticated Customer Requests Booking**

- **Actor:** Customer (logged in via Google OAuth)
- **Preconditions:** Customer is authenticated and has a phone number set on their profile (`Customer.phone ≠ null`). System has available slots.
- **Trigger:** Customer clicks "Request Booking"
- **Endpoint:** `POST /bookings/authenticated` (JWT `role: CUSTOMER` required)
- **Main Flow:**
  1. Customer selects **one or more services** from the tenant's catalog. Same multi-line model as UC-001 main flow steps 3–4. Guest fields (`contactEmail`, `contactName`, `contactPhone`, `contactAddress`) are **not shown on the UI form** — they are sourced from the Customer record by the backend.
  2. If any selected service has `requiresPickupAddress = true`, the form reveals the **pickup address field**, pre-filled with `Customer.defaultAddress` (if set). Customer can edit it for this booking.
  3. System displays calendar with available slots filtered by total duration.
  4. Customer selects preferred date/time.
  5. Customer optionally uploads car photos.
  6. Customer clicks "Submit". The UI sends only `serviceIds`, `scheduledAt`, `pickupAddress?`, and `beforeServicePhotoUrls?`.
  7. Backend validates slot (same rules as UC-001). Reads `contactEmail`, `contactName`, `contactPhone` from the Customer record (identified by JWT `sub`). Uses `Customer.defaultAddress` as `contactAddress`. If `pickupAddress` is absent from the request, falls back to `Customer.defaultAddress`; if that is also null and a service requires pickup, returns `400 missing-pickup-address`.
  8. System creates `Booking` with `status = PENDING`, `type = CUSTOMER`, `customerId` linked. `contactEmail`, `contactName`, `contactPhone` set from Customer record. `Booking.contactAddress` set from `Customer.defaultAddress` (may be null). `Booking.pickupAddress` set from the resolved pickup address (request body takes precedence over profile default).
  9. System publishes `BookingRequested` event (envelope `tenantId`; `data.lines[]` ≥ 1; `data.pickupAddress` if applicable).
  10. System displays: "Solicitação enviada. Veja seus agendamentos no seu perfil."
  11. System shows the customer's current active-points total (e.g., "47 pontos ativos").

- **Alternative Flows:**
  - Same A1–A8 as UC-001 (invalid services, slot unavailable, invalid pickup address, etc.).
  - **A9: Customer has no defaultAddress and selects pickup service** → pickup address field shown empty; customer must fill it in manually.
  - **A10: Customer views past bookings** → System shows COMPLETED / CANCELLED history with each booking's line list and pickup address if applicable.
  - **A11: Customer has no phone set on their profile** → System returns `422 customer-phone-not-set`. UI prompts the customer to update their profile (`PATCH /customers/me`) before booking. In practice this is handled proactively by the post-login flow (UC-021 A3); this 422 is a defensive backend check.

- **Postconditions:** Booking created with ≥ 1 lines (and `pickupAddress` if applicable), linked to customer. `type = CUSTOMER`. No loyalty effect yet.
- **Events Triggered:** `BookingRequested`

---

### **UC-003: Admin Approves Booking**

- **Actor:** STAFF | MANAGER
- **Preconditions:** Booking in PENDING or INFO_REQUESTED state. Admin is authenticated. Admin has access to dashboard.
- **Trigger:** Admin clicks "Approve" on a pending booking
- **Endpoint:** `PATCH /v1/bookings/:id/approve` (STAFF | MANAGER)
- **Main Flow:**
  1. Admin opens the booking request. The dashboard shows:
     - Customer name, email, phone (or guest contact details).
     - **The full line list**: each service with its `priceAtBooking`, `durationMinsAtBooking`, `pointsValueAtBooking`.
     - **Booking totals**: `totalPrice`, `totalDurationMins`.
     - Preferred date/time (start of slot).
     - **The customer's current active-points balance** (so the admin can see at a glance whether to offer a courtesy / gift — gifts are still admin-driven, not in the system).
     - Car photos (if any).
  2. Admin reviews all information.
  3. Admin clicks "Approve".
  4. System re-checks that the slot `[scheduledAt, scheduledAt + totalDurationMins)` is still free.
  5. System transitions booking: `PENDING | INFO_REQUESTED` → `APPROVED`. The line collection is now frozen.
  6. System records `approvedAt`, `approvedBy`.
  7. System publishes `BookingApproved` (event carries `lineSummary[]` and `totalPrice`).
  8. Admin sees success: "Booking approved".

- **Alternative Flows:**
  - **A1: Slot no longer available** → System shows error and suggests adjacent free slots that also fit `totalDurationMins`.
  - **A2: Admin adds internal notes** → System stores notes on the booking (optional).
  - **A3: Admin spots an issue with the line list** → For MVP, admin asks the customer to cancel and re-book (no "edit lines on approval" UC yet).

- **Postconditions:** Booking is APPROVED. Customer receives confirmation email listing every service in the booking plus total price. Calendar slot reserved.
- **Events Triggered:** `BookingApproved`

---

### **UC-004: Admin Rejects Booking**

- **Actor:** STAFF | MANAGER
- **Preconditions:** Booking in PENDING or INFO_REQUESTED state
- **Trigger:** Admin clicks "Reject"
- **Endpoint:** `PATCH /v1/bookings/:id/reject` (STAFF | MANAGER)
- **Main Flow:**
  1. Admin selects booking
  2. Admin clicks "Reject"
  3. Admin enters reason (e.g., "Service unavailable", "Schedule full") — required, minimum 10 characters
  4. Admin clicks "Submit"
  5. System transitions booking: `PENDING | INFO_REQUESTED` → REJECTED
  6. System records rejectionReason and rejectedBy
  7. System publishes `BookingRejected` event
  8. Admin sees confirmation

- **Alternative Flows:**
  - **A1: Reason too short** → System rejects with `400` — reason is required and must be at least 10 characters.

- **Postconditions:** Booking is REJECTED. Guest/customer receives email explaining reason.
- **Events Triggered:** `BookingRejected`

---

### **UC-005: Admin Requests More Information**

- **Actor:** STAFF | MANAGER (Main Flow); CUSTOMER | GUEST (Alternative Flow A2 — info submission)
- **Preconditions:** Booking in PENDING state
- **Trigger:** Admin clicks "Request More Info"
- **Endpoint (main flow):** `PATCH /v1/bookings/:id/request-info` (STAFF | MANAGER)
- **Endpoint (A2 — authenticated customer):** `PATCH /v1/bookings/:id/submit-info` (CUSTOMER)
- **Endpoint (A2 — guest):** `PATCH /v1/bookings/:id/submit-info/guest` (guest token)
- **Main Flow:**
  1. Admin selects pending booking
  2. Admin clicks "Request More Info"
  3. Admin enters message (e.g., "Please provide car photos")
  4. Admin clicks "Submit"
  5. System transitions booking: PENDING → INFO_REQUESTED
  6. System records `infoRequestedAt`, `infoRequestedBy`, `infoRequestMessage` (required, minimum 20 characters, no maximum)
  7. System publishes `BookingInfoRequested` event
  8. Admin sees confirmation

- **Alternative Flows:**
  - **A1: Booking not in PENDING** → System rejects ("can only request info on PENDING bookings"). INFO_REQUESTED → second request requires a separate UC if ever needed.
  - **A2: Customer / guest submits requested info** (this is the inverse flow that returns the booking to PENDING):
    1. Customer / guest opens the link in the info-request email (or, if authenticated, opens the booking in "My Bookings")
    2. Customer / guest provides the requested data (photos, notes, corrections)
    3. System validates input
    4. System transitions booking: INFO_REQUESTED → PENDING
    5. System records `infoSubmittedAt`, `infoResponseMessage`
    6. System publishes `BookingInfoSubmitted` event → Notification re-notifies admin: "[name] replied with the requested info"
    7. Customer / guest sees confirmation: "Thanks — we'll review and confirm shortly."
  - **A3: Admin acts on the info offline (no return to PENDING needed)** → Admin can directly APPROVE / REJECT / CANCEL from INFO_REQUESTED (UC-003 / UC-004 / UC-008 are valid transitions out of INFO_REQUESTED).

- **Postconditions:** Booking is in INFO_REQUESTED (after main flow) or PENDING (after A2). Guest/customer was notified; if A2 ran, admin was re-notified.
- **Events Triggered:** `BookingInfoRequested` (main flow), `BookingInfoSubmitted` (alt flow A2)

---

### **UC-006: Customer Views and Manages Bookings**

- **Actor:** Authenticated Customer
- **Preconditions:** Customer is logged in
- **Trigger:** Customer clicks "My Bookings" or "Booking History"
- **Endpoint (list):** `GET /v1/bookings` (CUSTOMER | STAFF | MANAGER — filtered to the customer's own bookings when role = CUSTOMER)
- **Endpoint (detail):** `GET /v1/bookings/:id` (CUSTOMER | STAFF | MANAGER — ownership enforced for CUSTOMER)
- **Main Flow:**
  1. System displays customer's bookings in sections (`apps/web/features/customer/booking-sections.ts`'s `splitBookingSections()` is the single source of truth for this grouping — reused by the home dashboard, the list, and each row):
     - **Upcoming:** APPROVED bookings with date ≥ today
     - **Pending:** PENDING or INFO_REQUESTED bookings awaiting admin action
     - **Past:** COMPLETED, CANCELLED, or REJECTED bookings
  2. Each booking shows: the list of services in the booking, date, time, status, total price, total duration.
  3. For APPROVED upcoming bookings: customer can see "Cancel" button.
  4. For PENDING / INFO_REQUESTED bookings: customer can see "Cancel Request" button.
  5. Clicking a booking shows the full detail including every line (service name, line price, line duration) and any photos.
  6. Customer can view loyalty summary (full breakdown lives in UC-016):
     - Total active points (across all services)
     - "Agendamentos" stat = count of APPROVED + COMPLETED bookings (there is no lifetime-wash counter in the system — this was a deliberate M13 substitution for an earlier "total washes (lifetime)" concept that was never implemented)

- **Alternative Flows:**
  - **A1: No bookings** → System shows "You haven't booked yet"
  - **A2: Cancellation not eligible** → Cancel button hidden with note: "Cancellation available up to `tenants.settings.booking.cancellationWindowHours` hours before your appointment"

- **Postconditions:** Customer sees booking history and loyalty status
- **Events Triggered:** None (read operation)

---

### **UC-007: Customer Cancels Booking**

- **Actor:** Authenticated Customer
- **Preconditions:** Booking belongs to the customer and is in APPROVED, PENDING, or INFO_REQUESTED state.
  - For APPROVED bookings: time to booking ≥ `tenants.settings.booking.cancellationWindowHours`.
  - For PENDING / INFO_REQUESTED bookings: no time restriction — customer may cancel a pending request at any time.
- **Trigger:** Customer clicks "Cancel Booking" (APPROVED) or "Cancel Request" (PENDING / INFO_REQUESTED)
- **Endpoint:** `PATCH /v1/bookings/:id/cancel` (CUSTOMER | STAFF | MANAGER — BFF dispatches to `/cancel-customer` for CUSTOMER, `/cancel-admin` for staff)
- **Main Flow:**
  1. If booking is APPROVED: System validates that `scheduledAt − now() ≥ tenants.settings.booking.cancellationWindowHours`. If not, returns error (A1).
  2. If booking is PENDING or INFO_REQUESTED: no time validation needed — proceed directly.
  3. Customer sees confirmation: "Cancelar este agendamento?"
  4. Customer clicks "Confirmar"
  5. System transitions booking: `APPROVED | PENDING | INFO_REQUESTED → CANCELLED`
  6. System records `cancelledBy` (customer id), `cancelledAt`, `cancellationReason` (optional)
  7. System publishes `BookingCancelled` event
  8. System shows success: "Agendamento cancelado."

- **Alternative Flows:**
  - **A1: Inside cancellation window (APPROVED bookings only)** → System shows error: "Cancelamentos devem ser feitos com pelo menos `tenants.settings.booking.cancellationWindowHours` horas de antecedência."
  - **A2: Booking is COMPLETED, REJECTED, or CANCELLED** → System shows error: "Este agendamento não pode ser cancelado."

- **Postconditions:** Booking is CANCELLED. Customer receives cancellation confirmation email. Admin notified.
- **Events Triggered:** `BookingCancelled`

---

### **UC-008: Admin Cancels or Reschedules Booking**

- **Actor:** STAFF | MANAGER
- **Preconditions:** Booking is APPROVED, PENDING, or INFO_REQUESTED
- **Trigger:** Admin clicks "Cancel" or "Reschedule" in dashboard
- **Endpoint (cancel):** `PATCH /v1/bookings/:id/cancel` — this UC's admin path, but the guard is actually `@Roles('CUSTOMER', 'MANAGER', 'STAFF')` on the same shared endpoint (BFF dispatches to backend `/cancel-admin` for STAFF/MANAGER, `/cancel-customer` for CUSTOMER — see UC-007 for the customer-facing half of this same route)
- **Endpoint (reschedule — A1):** `PATCH /v1/bookings/:id/reschedule` (STAFF | MANAGER)
- **Main Flow:**
  1. Admin selects booking
  2. Admin clicks "Cancel Booking"
  3. Admin enters reason (e.g., "Emergency closure", "Staff unavailable")
  4. Admin clicks "Confirm"
  5. System transitions: APPROVED/PENDING → CANCELLED
  6. System records cancelledBy (staff UUID) and reason
  7. System publishes `BookingCancelled` event (with isBusiness = true)
  8. Admin sees success confirmation

- **Alternative Flows:**
   - **A1: Admin reschedules instead of cancelling (MVP — Simple Approach):**
     1. Admin selects booking and clicks "Reschedule"
     2. Admin selects new date/time from calendar
     3. System validates the new slot is available (same duration check as original booking)
     4. System updates `scheduledAt` to the new date/time
     5. Admin may optionally enter a note explaining the reschedule (stored as freeform `adminNotes` — not auto-generated)
     6. System transitions booking: APPROVED → APPROVED (stays approved, time updated, no status change)
     7. System sends customer email: "Your booking has been rescheduled to [new date/time]"
     8. Admin sees success: "Booking rescheduled"
   - **A2: New slot unavailable** → System shows error and suggests available alternatives

- **Postconditions:** Booking cancelled (status CANCELLED) or rescheduled (status APPROVED with updated time). Customer receives notification email in both cases.
- **Events Triggered:** `BookingCancelled` (cancel flow), `BookingRescheduled` (reschedule flow — carries new and previous slot; Notification Context sends the customer email)
---

### **UC-009: Admin Marks Booking Complete**

- **Actor:** STAFF | MANAGER (after completing wash)
- **Preconditions:** Booking is APPROVED. Scheduled time has passed (or is current).
- **Trigger:** Admin/Staff clicks "Mark Complete" or "Wash Done" in the dashboard
- **Endpoint:** `PATCH /v1/bookings/:id/complete` (STAFF | MANAGER)
- **Main Flow:**
  1. Staff/Admin opens the booking. The dashboard shows the full line list (all services that were performed), with each line's quoted `priceAtBooking`.
  2. Staff/Admin clicks "Mark as Completed".
  3. Staff/Admin may add notes (e.g., "Extra shine applied").
  4. Staff/Admin optionally adjusts the **actual price charged** per line. Each line shows the quoted price as a pre-filled default — staff only changes it when discounting or waiving:
     ```
     Basic Wash    — quoted R$ 100,00 · charged [R$ 80,00] ← staff edited
     Pickup        — quoted R$  20,00 · charged [R$  0,00] ← staff waived (zero)
     ```
     Lines left unchanged keep their `priceAtBooking` as `actualPriceCharged`.
  5. Staff/Admin optionally uploads one or more after-service photos (PNG/JPG).
  6. Staff/Admin clicks "Confirm".
  7. System transitions booking: `APPROVED → COMPLETED` (all lines complete together — no partial completion in MVP).
  8. System records `completedBy`, `completedAt`, `afterServicePhotoUrls`, `adminNotes`.
  9. For each line: system sets `actualPriceCharged` (staff-entered value, or `priceAtBooking` if unchanged). System caches `totalActualPrice = SUM(lines.actualPriceCharged)`.
  10. System publishes `BookingCompleted` event with the full line list (including `actualPriceCharged` per line and `totalActualPrice`).
  11. If `customerId != null`: Loyalty Context inserts one `LoyaltyEntry` per line using `pointsValueAtBooking` — **loyalty points are not affected by the actual price charged**.
  12. System shows success, displaying a summary:
      ```
      Serviço concluído!
      Basic Wash:  R$ 100,00 → cobrado R$ 80,00
      Pickup:      R$  20,00 → cobrado R$  0,00
      Total cobrado: R$ 80,00  (cotado: R$ 120,00)
      ```

- **Alternative Flows:**
  - **A1: No-show** → Admin marks as NO_SHOW instead of COMPLETED (future state, not in MVP).
  - **A2: Multiple photos** → Staff can add/remove photos before confirming.
  - **A3: Photo upload fails** → System allows completion without photos (optional).
  - **A4: Guest booking** → Booking is marked COMPLETED but no `LoyaltyEntry` is created (no `customerId`). Notification still sends a "thanks" email to the guest with the actual amounts.
  - **A5: All lines charged at full price** → Staff leaves all fields unchanged. `actualPriceCharged = priceAtBooking` for every line. `totalActualPrice = totalPrice`.
  - **A6: Customer has loyalty points and `tenants.settings.loyalty.pointsPerCurrencyUnit > 0`** → Staff applies a points-based discount during completion:
    1. System shows a loyalty strip: customer's active balance + currency equivalent (e.g. "João tem 350 pontos = R$ 35,00", based on `pointsPerCurrencyUnit = 10`).
    2. Staff enters how many points to use, or clicks "Usar todos". Points capped at `min(currentPoints, totalActualPrice × pointsPerCurrencyUnit)` so the discount never exceeds the booking total.
    3. System shows live discount: "Desconto (200 pts): − R$ 20,00 · Total a cobrar: R$ 40,00".
    4. Staff clicks "Confirmar conclusão". System calls a single `PATCH /bookings/:id/complete` (body includes `discountByPoints: { pointsUsed, amountDeducted }`) — the booking is saved as COMPLETED with the discount already applied to `totalActualPrice`; no second HTTP call is made by the client.
    5. The `BookingCompleted` event (carrying `discountByPoints`) triggers the Loyalty Context asynchronously: the customer's balance is decremented and a `LoyaltyRedemption` is recorded, linked to the booking.
    6. Completion summary (returned synchronously in the `PATCH` response) shows per-line charges plus the loyalty discount row.
    - Only shown when `customerId != null` AND `pointsPerCurrencyUnit > 0`. Not available for guest bookings (A4).
    - `amountDeducted` exceeding the booking's actual total → `422 Unprocessable` — discount cannot exceed the amount charged.

- **Postconditions:** Booking is COMPLETED. `actualPriceCharged` set on every line; `totalActualPrice` cached on the booking. For authenticated customers: N new `LoyaltyEntry` rows (N = number of lines, points based on `pointsValueAtBooking` regardless of price). When A6 applies: customer's loyalty balance decremented and a `LoyaltyRedemption` recorded, linked to the booking. Notification email shows both quoted and actual amounts.
- **Events Triggered:** `BookingCompleted` (once), `ServicePointsEarned` (once per line, only when `customerId != null`).

---

## Schedule Management Use Cases

### **UC-010: Staff Manages Schedule Closures and Openings**

#### **UC-010a: STAFF | MANAGER Creates a Schedule Closure (Full Day or Partial)**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /v1/schedule/closures`
- **Preconditions:** Admin is authenticated. Date is not in the past.
- **Trigger:** Admin clicks "Close Schedule" in the dashboard.
- **Main Flow (Full-Day Closure):**
  1. Admin selects date to close.
  2. Admin selects closure reason: `STAFF_DAY_OFF`, `MAINTENANCE`, or `HOLIDAY`.
  3. Admin leaves start/end time empty (= full-day closure).
  4. Admin optionally enters notes.
  5. Admin confirms.
  6. System validates: date is not past; no overlapping closure exists for `(tenantId, date)`.
  7. System creates `ScheduleClosure` with `startTime = null, endTime = null`.
  8. Calendar blocks the entire day for new bookings.
  9. Admin sees confirmation: "Schedule closed for [date]."

- **Main Flow (Partial Closure):**
  1. Admin selects date and enters `startTime` and `endTime` (e.g., 10:00–12:00).
  2. Admin selects reason and optional notes.
  3. Admin confirms.
  4. System validates: date is not past; `endTime > startTime`; the time window does not overlap any existing closure on that date; no full-day closure exists for that date.
  5. System creates `ScheduleClosure` with `startTime = "10:00", endTime = "12:00"`.
  6. Only the blocked window is unavailable; bookings outside it remain possible.
  7. Admin sees confirmation: "Schedule closed [10:00–12:00] on [date]."

- **Alternative Flows:**
  - **A1: Date is in the past** → `422 Unprocessable` — "Não é possível fechar datas passadas."
  - **A2: Overlapping closure already exists** → `409 Conflict` — "Já existe um bloqueio nesse período."
  - **A3: Full-day closure conflicts with an existing partial closure (or vice versa)** → `409 Conflict` — "Conflito com bloqueio parcial existente na mesma data."
  - **A4: Bookings already approved in the closed window** → System shows warning: "[X] agendamentos existem nesse período. Reagende ou cancele manualmente."

- **Postconditions:** `ScheduleClosure` persisted. Availability recalculated for that date.
- **Events Triggered:** None (availability is computed on read, not via events).

---

#### **UC-010b: STAFF | MANAGER Removes a Schedule Closure**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `DELETE /v1/schedule/closures/:id`
- **Preconditions:** Closure exists and belongs to the tenant.
- **Trigger:** Admin clicks "Remove" on a closure entry.
- **Main Flow:**
  1. System finds `ScheduleClosure` by `(id, tenantId)`.
  2. System deletes it.
  3. The previously blocked window becomes bookable again.
- **Alternative Flows:**
  - **A1: Closure not found or belongs to another tenant** → `404 Not Found`.
- **Postconditions:** Closure deleted. Availability recalculated on next read.
- **Events Triggered:** None.

---

#### **UC-010c: STAFF | MANAGER Opens a Normally-Closed Day (Schedule Opening)**

Used when `businessHours[dayOfWeek] = null` (e.g., Sunday is always closed) but the business wants to open on a specific date (e.g., a special event on a Sunday).

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /v1/schedule/openings`
- **Preconditions:** Admin is authenticated. The day-of-week for the selected date is closed in `businessHours`.
- **Trigger:** Admin clicks "Open Schedule" on a normally-closed day in the calendar.
- **Main Flow:**
  1. Admin selects date (must be a day-of-week that is `null` in `businessHours`).
  2. Admin enters `startTime` and `endTime` for the opening window (e.g., 09:00–14:00).
  3. Admin optionally enters notes.
  4. Admin confirms.
  5. System validates: date is not past; day-of-week is closed in `businessHours`; no `ScheduleOpening` already exists for `(tenantId, date)`; `endTime > startTime`.
  6. System creates `ScheduleOpening`.
  7. Calendar shows the date as partially available within the specified window.
  8. Admin sees confirmation: "Agenda aberta [09:00–14:00] em [date]."

- **Alternative Flows:**
  - **A1: Date is in the past** → `422 Unprocessable`.
  - **A2: Day-of-week is already open in `businessHours`** → `422 Unprocessable` — "Esse dia já está aberto nas configurações regulares. Ajuste os horários de funcionamento em vez disso."
  - **A3: Opening already exists for this date** → `409 Conflict`.

- **Postconditions:** `ScheduleOpening` persisted. That date now shows availability within the opening window.
- **Events Triggered:** None.

---

#### **UC-010d: STAFF | MANAGER Removes a Schedule Opening**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `DELETE /v1/schedule/openings/:id`
- **Preconditions:** Opening exists and belongs to the tenant.
- **Trigger:** Admin clicks "Remove" on an opening entry.
- **Main Flow:**
  1. System finds `ScheduleOpening` by `(id, tenantId)`.
  2. System deletes it.
  3. The date reverts to its default closed state per `businessHours`.
- **Alternative Flows:**
  - **A1: Opening not found or belongs to another tenant** → `404 Not Found`.
  - **A2 (M21 Cluster 1): Opening is tenant-wide (`resourceId = null`) and one or more resource-scoped openings still depend on it for the same date** → `409 Conflict` (`BOOKING_TENANT_OPENING_HAS_RESOURCE_DEPENDENTS`) — the resource-scoped openings must be removed first. Never applies when deleting a resource-scoped opening directly.
- **Postconditions:** Opening deleted.
- **Events Triggered:** None.

---

#### **UC-010e: MANAGER Creates a Resource-Scoped Schedule Closure**

> Extends UC-010a's exact mechanism with an optional `resourceId` — see the `Resource` aggregate (Resource Management Use Cases, below). Introduced alongside `Resource` (M21 — Multi-Vertical Scheduling, Cluster 1/Foundation). Leaving `resourceId` unset behaves identically to UC-010a (tenant-wide) and stays open to STAFF|MANAGER; setting `resourceId` is deliberately **MANAGER-only** — the same restriction the discovery applies to every Resource Management use case below (dev-notes.md's own review call, no existing precedent to derive it from).

- **Actor:** MANAGER (when `resourceId` is set) — STAFF | MANAGER still applies to the unscoped, tenant-wide case (UC-010a)
- **Endpoint:** `POST /schedule/closures` (existing endpoint, `resourceId` is a new optional body field)
- **Preconditions:** Resource exists and belongs to the tenant, when `resourceId` is provided.
- **Trigger:** Admin creates a closure and selects a specific resource instead of leaving "whole business" selected (e.g. "Maria — day off").
- **Main Flow:**
  1. Admin selects date (+ optional time window) and reason, same as UC-010a.
  2. Admin selects a specific resource instead of leaving the resource field blank.
  3. System validates no overlapping closure exists for `(tenantId, resourceId, date)` and saves with `resourceId` set.
- **Alternative Flows:**
  - **A1: Resource left unselected** → Falls back to UC-010a's tenant-wide behavior, `resourceId = null`.
  - **A2: An overlapping closure already exists for `(tenantId, resourceId, date)`** → `409 Conflict`, naming the conflicting closure.
  - **A3: `resourceId` does not exist or belongs to another tenant** → `404 Not Found`.
- **Postconditions:** The resource's calendar shows this window blocked; other resources at the same tenant are unaffected. A tenant-wide closure (`resourceId = null`) still blocks every resource, per the `Resource` aggregate's "everything" sentinel.
- **Events Triggered:** None (mirrors UC-010a, which also publishes nothing).

---

#### **UC-010f: MANAGER Creates a Resource-Scoped Schedule Opening**

> Extends UC-010c's exact mechanism with an optional `resourceId`, same relationship as UC-010e has to UC-010a. Introduced alongside `Resource` (M21 — Multi-Vertical Scheduling, Cluster 1/Foundation). Setting `resourceId` is **MANAGER-only**, same restriction as UC-010e.

- **Actor:** MANAGER (when `resourceId` is set) — STAFF | MANAGER still applies to the unscoped, tenant-wide case (UC-010c)
- **Endpoint:** `POST /schedule/openings` (existing endpoint, `resourceId` is a new optional body field)
- **Preconditions:** Resource exists and belongs to the tenant, when `resourceId` is provided. The target day is closed in the *effective* hours source for the scope being opened: the resource's own `workingHours[day]` when the resource has a non-null `workingHours`, falling back to the tenant's `businessHours[day]` when the resource inherits (`workingHours: null`) — see `docs/13-DATABASE_SCHEMA.md` § `booking.schedule_openings` Rules.
- **Trigger:** Admin opens a normally-closed day for one resource only (e.g. a stylist takes an extra Saturday).
- **Main Flow:** Same as UC-010c, with `resourceId` set.
- **Alternative Flows:**
  - Same as UC-010c's (A1, A2).
  - **A3: `resourceId` does not exist or belongs to another tenant** → `404 Not Found`.
  - **A4: the target day is normally closed for the tenant (`businessHours[day]` is `null`) and no tenant-wide opening exists yet for that date** → `422 Unprocessable Entity` (`BOOKING_TENANT_OPENING_REQUIRED`). The manager/staff must open the tenant level for that date first, then open the specific resource.
  - **A5: the requested window extends beyond the bounding tenant window for the same date** → `422 Unprocessable Entity` (`BOOKING_OPENING_EXCEEDS_TENANT_WINDOW`). Which window bounds it depends on the tenant's own day state: when the day is normally *open* for the tenant (A4 doesn't apply), the bound is the tenant's own `businessHours[day]` window directly, no explicit opening row needed — this is the case whenever the resource is closed on a day the *tenant* is open (e.g. one stylist's day off). When the day is normally *closed* for the tenant (A4 applies first), the bound is that prerequisite tenant-wide opening's own window.
- **Postconditions:** Only that resource's calendar opens for the date, and always within the bounding tenant window (A5); the rest of the tenant is unaffected. **Constraint note:** `schedule_openings`' `UNIQUE(tenant_id, date)` is replaced by two partial unique indexes — `UNIQUE(tenant_id, date) WHERE resource_id IS NULL` and `UNIQUE(tenant_id, resource_id, date) WHERE resource_id IS NOT NULL` — so a tenant-wide opening and a resource-scoped opening for the same date no longer collide (see `docs/13-DATABASE_SCHEMA.md`).
- **Events Triggered:** None.

---

### **UC-011: Guest Views Real-Time Calendar Availability**

- **Actor:** Guest (any user, authenticated or not)
- **Preconditions:** User has added at least one service to their booking basket.
- **Trigger:** User clicks "Choose Date/Time" after selecting services.

#### **Scheduling Algorithm (MVP)**

**Slot Structure:**
- Slot unit: `tenants.settings.booking.slotGranularityMinutes` (default: 30 min, valid: 15/30/60)
- Valid start times are multiples of the granularity within business hours (e.g., 09:00, 09:30, 10:00, … for 30-min slots)
- Tenant's business hours (`settings.businessHours`) determine the available window

**Booking Duration Calculation:**
```
booking_duration_minutes = SUM(service.duration_minutes for each service in basket)
                         + tenants.settings.booking.serviceBufferMinutes
```

Example: basket = [Basic Wash (30 min), Wax (25 min)], buffer = 60 min, granularity = 30 min:
- Raw duration: 30 + 25 + 60 = 115 minutes
- Required slots: CEIL(115 / 30) = 4 consecutive 30-min slots

**Availability Calculation — Three-Layer Schedule Resolution:**

For each date in the query window, the effective operating hours are resolved in priority order:

```
1. ScheduleOpening  (highest — opens a normally-closed day for a specific window)
2. ScheduleClosure  (blocks the whole day or a time window within it)
3. businessHours   (lowest — the recurring weekly default)
```

Resolution per date:
```
if ScheduleOpening exists for (tenantId, date):
    effectiveHours = { open: opening.startTime, close: opening.endTime }
    (ScheduleClosure and businessHours are ignored for this date)
elif businessHours[dayOfWeek] = null:
    return []  ← default-closed day, no opening exception
elif full-day ScheduleClosure exists for (tenantId, date):
    return []  ← entire day blocked
else:
    effectiveHours = businessHours[dayOfWeek]

// Within effectiveHours, remove any slots overlapping a partial ScheduleClosure:
partialClosures = ScheduleClosures for (tenantId, date) where startTime IS NOT NULL
for each candidate slot in effectiveHours at slotGranularityMinutes:
    blockedByPartialClosure = partialClosures.any(c => slot overlaps [c.startTime, c.endTime])
    blockedByBooking = APPROVED bookings.any(b => slot overlaps b window)
    if not blockedByPartialClosure and not blockedByBooking:
        → slot is available
```

**Resource-scoped variant (M21 Cluster 1):** the resolution above is the tenant-wide case — UC-011's own Guest flow doesn't select a resource today, so this stays exactly what a Guest query resolves. `GET /schedule/availability(/summary)` also accepts an optional `resourceId` (staff/manager-facing use, e.g. checking one professional's calendar) that scopes the same three-layer resolution to that resource's own closures/openings/workingHours — see `docs/02-DOMAIN_MODEL.md` § Three-Layer Schedule Resolution for the full resource-aware precedence, not duplicated here to avoid the two copies drifting apart.

1. Load `slotGranularityMinutes`, `serviceBufferMinutes`, business hours, and timezone from `tenants.settings`
2. Compute `bookingDurationMins` from basket + buffer
3. Compute `requiredSlots = CEIL(bookingDurationMins / slotGranularityMinutes)`
4. For each date: resolve effective hours using 3-layer logic above
5. For each potential start-time in effectiveHours:
   - Check all `requiredSlots` consecutive slots are free (no partial closure overlap, no APPROVED booking overlap)
   - Check all slots fall within effectiveHours
   - If yes → available; if no → unavailable

**Example Timeline (30-min granularity, requiredSlots = 2):**
```
14:00–14:30: Free ✓
14:30–15:00: Free ✓
15:00–15:30: APPROVED booking ✗
15:30–16:00: Free ✓

Start 14:00: ✓ (14:00 free + 14:30 free = available)
Start 14:30: ✗ (14:30 free + 15:00 occupied = unavailable)
Start 15:00: ✗ (15:00 occupied)
Start 15:30: ✓ (15:30 free + 16:00 free = available — if fits in business hours)
```

#### **Two-Phase Calendar Flow**

UC-011 is implemented as two distinct API calls that match the UI interaction model:

**Phase 1 — Calendar Overview (week/month navigation)**

Called once per calendar view (e.g. user opens the booking page or presses `>` to go to the next week). Returns a lightweight per-day summary — no slot times, just green/grey per day.

```
GET /v1/schedule/availability/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&serviceIds=uuid,uuid
```

Backend loads ScheduleClosures, ScheduleOpenings, and APPROVED bookings for the **full date range in 3 DB queries**, then runs `AvailabilityService.calculate()` per day (pure in-memory). Returns:
```json
[
  { "date": "2026-06-01", "available": true,  "slotCount": 12 },
  { "date": "2026-06-02", "available": false, "slotCount": 0  }
]
```

Constraints: `from ≤ to`; range ≤ 90 days (tenant's `maxBookingAdvanceDays`). Past dates return `available: false, slotCount: 0` without an error.

**Phase 2 — Day Detail (user clicks a specific day)**

Called when the user selects a specific green day from the calendar. Returns the full list of available time slots for that date.

```
GET /v1/schedule/availability?date=YYYY-MM-DD&serviceIds=uuid,uuid
```

Returns:
```json
{ "date": "2026-06-01", "available": true, "slots": [{ "startsAt": "2026-06-01T12:00:00.000Z", "endsAt": "2026-06-01T13:00:00.000Z" }] }
```

#### **Main Flow:**
1. Frontend loads calendar view → calls Phase 1 summary for the current week/month range.
2. System loads in one pass: `ScheduleClosures`, `ScheduleOpenings`, APPROVED bookings for the range + tenant settings.
3. For each date in the range, system runs the 3-layer resolution algorithm and returns `{ date, available, slotCount }`.
4. Frontend renders the calendar: green days (`available: true`), grey days (`available: false`).
5. User navigates to next/previous week → repeat from step 1 for the new range.
6. User clicks a green day → calls Phase 2 detail for that specific date.
7. System returns the full slot list with UTC `startsAt`/`endsAt` for each available slot.
8. User picks a slot → proceeds to the booking form with `scheduledAt = startsAt`.

- **Alternative Flows:**
   - **A1: Entire week is grey** → Calendar shows no available days; user presses `>` to try next week.
   - **A2: User clicks a day but no slots are available** → Phase 2 returns `{ available: false, slots: [] }`. Frontend re-greys the day and shows message.
   - **A3: User changes basket after opening Phase 2** → Frontend invalidates the slot list and calls Phase 2 again with updated `serviceIds`.
   - **A4: Range > 90 days** → 422 error; frontend should cap requests to `maxBookingAdvanceDays`.

- **Postconditions:** User has selected a date/time with start slot = available start time, duration = calculated booking duration.
- **Events Triggered:** None (read operation).


---

## Resource Management Use Cases

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 1 (Foundation). `Resource` is a new aggregate in the Booking Context — see `docs/02-DOMAIN_MODEL.md` § Booking Context. Every existing tenant receives one active `LOCATION` resource during migration (M21-S0x's backfill story); `resourceId = null` on a closure/opening remains a separate "close/open the whole business" sentinel, not a legacy path. Resource-scoped closures/openings are UC-010e/UC-010f above.

### **UC-044: MANAGER Views the Resource List**

- **Actor:** MANAGER
- **Endpoint:** `GET /resources?type=&isActive=`
- **Preconditions:** None beyond an active tenant.
- **Trigger:** Admin opens the Resources section in dashboard settings.
- **Main Flow:**
  1. System lists every `Resource` for the tenant, filterable by `type` (`LOCATION` | `STAFF` | `ROOM` | `EQUIPMENT`) and `isActive`.
  2. Each row shows name, type, a working-hours summary, and active/inactive state.
- **Alternative Flows:** None.
- **Postconditions:** None (read operation).
- **Events Triggered:** None.

---

### **UC-045: MANAGER Creates a Resource**

- **Actor:** MANAGER
- **Endpoint:** `POST /resources`
- **Preconditions:** None beyond an active tenant.
- **Trigger:** Admin clicks "Add Resource" in dashboard settings.
- **Main Flow:**
  1. Admin selects resource type: `STAFF` (picks an existing `Staff` row to wrap), `ROOM`, or `EQUIPMENT`. (`LOCATION` is never manually created — every tenant already has exactly one, created by the M21 backfill migration; see `docs/02-DOMAIN_MODEL.md` § Booking Context.)
  2. For `ROOM`/`EQUIPMENT`, admin enters a display name.
  3. Admin sets initial working hours (defaults to the tenant's `businessHours` if left blank); every window must be a subset of the tenant's recurring hours.
  4. System creates the `Resource` row, `isActive = true`.
- **Alternative Flows:**
  - **A1: `STAFF` type, and that staff member is already wrapped by a `Resource`** → `409 Conflict` — one `Resource` per `Staff` row.
  - **A2: No working hours set and the tenant has no `businessHours` either** → `422 Unprocessable` — a resource must have some schedule.
- **Postconditions:** `Resource` exists, available for a `Service`'s resource requirements to reference (M21 Cluster 2).
- **Events Triggered:** None (config-only, same as `ScheduleClosure`/`ScheduleOpening`).

---

### **UC-046: MANAGER Edits a Resource**

> Originally scoped to working hours only; broadened so a manager can correct any mistake made at creation — including `type`/`refId` — without deactivate+recreate (user decision, PR #457 round 9+).

- **Actor:** MANAGER
- **Endpoint:** `PATCH /resources/:id`
- **Preconditions:** Resource exists and belongs to the tenant.
- **Trigger:** Admin edits the resource in dashboard settings, or corrects a data-entry mistake (wrong name, wrong type, wrong capacity).
- **Main Flow:**
  1. Admin opens the resource's edit form. Every field is independently editable and optional in the request — unsent fields keep their current value.
  2. Admin changes any combination of `name`, `type`, `refId`, `workingHours`, `turnoverMinutes`, `maxCapacity`.
  3. System validates the fully-resolved (current + changed) state exactly as it would at creation — `STAFF`⟺`refId` pairing, `maxCapacity` rules (`>0` when set, never set for `STAFF`), working-hours subset of tenant hours — and saves.
- **Alternative Flows:**
  - **A1: Existing approved appointments now fall outside the new hours** → System warns before saving; does not auto-cancel existing bookings. **Not reachable in M21-S01** — no `Service`/`Booking` references a `Resource` yet (`Service.resourceRequirements` is Cluster 2 work), so no approved appointment can exist to fall outside anything; `PATCH` saves directly with no impact check until Cluster 2 makes an appointment-to-resource reference possible (mirrors UC-047 step 1's identical "empty for a Cluster-1-only tenant" deferral).
  - **A2: Resource not found or belongs to another tenant** → `404 Not Found`.
  - **A3: `type` is changing to or from `LOCATION`** → `409 Conflict` — a tenant's `LOCATION` resource can never change type, and no other resource can become `LOCATION` (both are backfill-only, same invariant `DELETE` already enforces — UC-047).
  - **A4: `type` is changing to `STAFF`** → System re-runs UC-045's own staff-wrap validation (staff exists, active, not already wrapped by a *different* resource) against the new `refId`; re-saving the same `refId` this resource already holds is not a conflict.
  - **A5: `type` is changing away from `STAFF` without clearing `refId`** → `400`/`422` (`STAFF`⟺`refId` pairing violated) — the request must explicitly send `refId: null` when moving away from `STAFF`.
  - **A6: `workingHours` is set (non-null) while the resource's type is (or is being changed to) `LOCATION`** → `409 Conflict` — a `LOCATION` resource is the stand-in for "the whole tenant is the resource" and always inherits the tenant's own business hours; it can never carry a custom schedule (added during M21-S04 live review, 2026-09-02 — avoids a second, silently-diverging source of truth for the business's operating hours).
- **Postconditions:** Every changed field takes effect immediately for future availability queries and resource listings; existing bookings untouched.
- **Events Triggered:** None.

---

### **UC-047: MANAGER Deactivates a Resource**

- **Actor:** MANAGER
- **Endpoint:** `DELETE /resources/:id`
- **Preconditions:** Resource exists, belongs to the tenant, and is active.
- **Trigger:** Admin clicks "Deactivate" on a resource (e.g. a stylist leaves, equipment is retired).
- **Main Flow:**
  1. System shows future approved appointments and materialized sessions referencing this resource as explicit commitments (populated once Clusters 2–4 exist; empty for a Cluster-1-only tenant).
  2. System sets `isActive = false` immediately for new scheduling and stops future generation using the resource.
  3. Admin receives a resolution worklist for the existing commitments; none is silently cancelled or demoted.
- **Alternative Flows:**
  - **A1: Resource is part of an active class-schedule-template bundle** (Cluster 4) → System ends/deactivates that template for future generation and lists any materialized future sessions for resolution.
  - **A2: Resource not found or belongs to another tenant** → `404 Not Found`.
- **Postconditions:** Resource no longer offered for new bookings; existing history intact. Returns `204 No Content`.
- **Events Triggered:** None.

---

### **UC-048: System Cascades a Staff Deactivation to the Wrapping STAFF Resource**

> Closes a gap where `UC-029` (admin deactivates staff member) and this discovery's `Resource` wrapper were otherwise never wired together. This is `StaffDeactivated`'s first consumer — see `docs/03-DOMAIN_EVENTS.md` and `docs/05-BOUNDED_CONTEXTS.md`.

- **Actor:** System
- **Preconditions:** A `Staff` row is deactivated via `UC-029`, and a `Resource` row exists with `type = STAFF` and `refId` pointing at that staff member.
- **Trigger:** `StaffDeactivated` event (published by `UC-029`), consumed by the Booking Context.
- **Main Flow:**
  1. System locates the `Resource` row with `refId = staffId` for the deactivated staff member.
  2. System applies UC-047's exact effect to that `Resource`: `isActive = false` for new scheduling, future generation using it stops, and any active template bundle containing it is ended for future generation (UC-047 A1).
  3. Existing approved appointments and materialized sessions referencing the resource remain explicit commitments — the manager gets the same resolution worklist UC-047 produces, never a silent cancellation.
- **Alternative Flows:**
  - **A1: No `Resource` row wraps this staff member** → No-op; nothing to cascade.
- **Postconditions:** A deactivated staff member's wrapping resource is deactivated for new work in the same event-handling step as their `Staff` row, never left stale.
- **Events Triggered:** None new — consumes `StaffDeactivated`; produces the same (lack of) events as UC-047.

---

### **UC-049: MANAGER Reactivates a Resource**

- **Actor:** MANAGER
- **Endpoint:** `POST /resources/:id/reactivate`
- **Preconditions:** Resource exists, belongs to the tenant, and is inactive.
- **Trigger:** Admin reactivates a previously deactivated resource.
- **Main Flow:**
  1. Admin reactivates the resource.
  2. Admin confirms its working hours/eligibility are still correct (via UC-046 if changes are needed).
  3. System sets `isActive = true` — available only for future availability calculations. It does not recreate cancelled sessions or silently alter existing commitments.
- **Alternative Flows:**
  - **A1: Working hours/eligible-service setup is incomplete** → Admin must complete it (UC-046) before the resource can be selected for new work.
  - **A2: Resource not found, belongs to another tenant, or is already active** → `404 Not Found` / `409 Conflict`.
- **Postconditions:** Future bookings may use the resource according to its current configuration.
- **Events Triggered:** None (config-only, matching UC-045/046/047 — no consumer exists yet)

---

## Service Management Use Cases

### **UC-012: Admin Creates New Service**

- **Actor:** STAFF | MANAGER
- **Preconditions:** Admin is authenticated
- **Trigger:** Admin clicks "Manage Services" → "Add Service"
- **Main Flow:**
  1. Admin enters service details:
     - Name (e.g., "Coleta e Entrega")
     - Description
     - Price
     - Duration (minutes)
     - Loyalty points value
     - **Requires pickup address** (toggle, default off) — enable for services that require the customer to provide a pickup location (e.g. "Coleta e Entrega", "Busca em domicílio")
     - `isActive` flag (default: `true`; set `false` to create as inactive) — backend supports this (`CreateServiceSchema`/`Service.create()` both accept it); the "new service" dashboard page has no UI toggle for it yet, so it's create-time-active-only from the browser today
  2. Admin clicks "Create"
  3. System validates: name unique within tenant, price must be greater than zero (> 0), duration > 0
  4. System creates Service aggregate with `requiresPickupAddress` flag
  5. Admin sees confirmation: "Serviço criado"

- **Alternative Flows:**
  - **A1: Service name already exists** → System shows error, admin changes name
  - **A2: Price/duration invalid** → System shows validation error

- **Postconditions:** Service available for booking. If `requiresPickupAddress = true`, the booking form will show the address field whenever this service is selected.
- **Events Triggered:** None

---

### **UC-013: Admin Edits Service Details**

- **Actor:** STAFF | MANAGER
- **Preconditions:** Service exists
- **Trigger:** Admin clicks "Manage Services" → selects service → "Edit"
- **Main Flow:**
  1. Admin modifies: name, description, price, duration, loyalty points value, `requiresPickupAddress` toggle. (Active/inactive status is **not** part of this payload — it only changes via the separate deactivate/activate endpoints in A1/A4 below; `Service.update()` throws `ServiceDeactivatedError` if called while the service is inactive.)
  2. Admin clicks "Save"
  3. System validates changes
  4. System updates Service aggregate
  5. Admin sees confirmation: "Serviço atualizado"

- **Alternative Flows:**
  - **A1: Deactivate service** → Admin calls deactivate (`DELETE /v1/services/:id`) → sets `isActive = false` → service hidden from booking page. Pure soft delete — existing bookings referencing this service are untouched; only *new* bookings against it are blocked.
  - **A2: Price change** → Past bookings unaffected (snapshots are immutable); future bookings use new price
  - **A3: Toggle `requiresPickupAddress`** → Only affects future bookings. Existing `booking_lines` retain their snapshotted `requiresPickupAddressAtBooking` value.
  - **A4: Reactivate service** (`M13-S24`) → Admin calls `PATCH /v1/services/:id/activate` → sets `isActive = true`. The edit form shows a locked "Reativar" view instead of editable fields while a service is inactive.

- **Postconditions:** Service updated. New bookings reflect all changes including `requiresPickupAddress`.
- **Events Triggered:** None

---

## Service Extensions & Availability Engine Use Cases (M21 Cluster 2)

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 2 (Service extensions + availability/exclusivity engine). Depends on Cluster 1 (`Resource`). See `docs/02-DOMAIN_MODEL.md` § Booking Context (`Service` aggregate, `resource_occupancy`) and `docs/13-DATABASE_SCHEMA.md` for the full schema. UC-050–055 configure a `Service`; UC-056 chooses its booking model at creation; UC-057–060 are the availability/exclusivity engine both appointment and (eventually, Cluster 4) session bookings depend on.

### **UC-050: STAFF | MANAGER Configures a Service's Resource Requirement**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `PATCH /services/:id/resource-requirements`
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`.
- **Trigger:** Admin edits the service's "who/what is needed" setting.
- **Main Flow:**
  1. Admin picks resource type (`LOCATION` default / `STAFF` / `ROOM` / `EQUIPMENT`).
  2. Admin picks selection mode: `NONE` (today's default), `CUSTOMER_CHOICE`, `AUTO_ANY`, or `AUTO_FUNGIBLE_POOL`.
  3. If a pool restriction applies, admin picks which specific active resources are eligible.
  4. System saves `resourceRequirements[0]`.
- **Alternative Flows:**
  - **A1: No active resources of the chosen type exist** → `422 Unprocessable` — blocks save until at least one exists.
  - **A2: Service has `legs` set** → `409 Conflict` — a service is either flat-with-requirements or legged, not both (UC-052).
- **Postconditions:** New bookings for this service are checked/locked against the configured resource(s).
- **Events Triggered:** None.

---

### **UC-051: STAFF | MANAGER Configures a Bundled Resource Requirement**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `PATCH /services/:id/resource-requirements` (same endpoint as UC-050 — a bundle is `resourceRequirements.length > 1`)
- **Preconditions:** Service exists; at least two distinct resource types have active resources (e.g. staff + equipment for a dentist).
- **Trigger:** Admin adds a second resource requirement to the same service.
- **Main Flow:**
  1. Admin adds a second `ResourceRequirement` entry (e.g. `EQUIPMENT`, `AUTO_ANY`).
  2. System saves `resourceRequirements` as an array of ≥ 2 — every entry must be free for the same window; all get locked together.
- **Alternative Flows:**
  - **A1: Admin tries to combine a bundle with `legs`** → `409 Conflict` — see UC-052.
- **Postconditions:** Booking this service now requires *all* listed resources free for the same window.
- **Events Triggered:** None.

---

### **UC-052: STAFF | MANAGER Configures Service Legs (Sequential Multi-Stage)**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `PUT /services/:id/legs`
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`.
- **Trigger:** Admin switches the service from "single resource" to "multi-stage journey."
- **Main Flow:**
  1. Admin adds ordered legs, each with a name, duration, one or more resource requirements, and a transition-gap-after.
  2. System computes and displays the total appointment span (`sum(leg durations) + sum(transition gaps)`), distinct from total billable time.
  3. System clears `resourceRequirements`/`bufferAfterMinutes` on the service (mutually exclusive with `legs`).
- **Alternative Flows:**
  - **A1: Fewer than 2 legs** → `422 Unprocessable` — a single leg is just the flat model (UC-050).
- **Postconditions:** Booking this service locks every leg's resource(s) independently for that leg's own sub-window.
- **Events Triggered:** None.

---

### **UC-053: STAFF | MANAGER Sets a Service's Buffer Override**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `PATCH /services/:id` (existing endpoint, `bufferAfterMinutes` is a new field)
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`, no `legs` set.
- **Trigger:** Admin edits the service's cleanup/prep buffer.
- **Main Flow:**
  1. Field is pre-filled from the tenant's `serviceBufferMinutes` default at service-creation time.
  2. Admin overrides with a service-specific value.
  3. System saves `Service.bufferAfterMinutes`.
- **Alternative Flows:**
  - **A1: Service has `legs`** → Field disabled; legs use per-leg transition gaps and per-resource turnover instead (UC-059).
- **Postconditions:** Availability calculations for this service use `max(service.bufferAfterMinutes, resource.turnoverMinutes)`.
- **Events Triggered:** None.

---

### **UC-054: STAFF | MANAGER Configures a Service's Booking-Intake Schema**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /services/:id/intake-schema`
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`.
- **Trigger:** Admin sets up or edits the service's booking-review questions (e.g. a dentist wants a health-history question; a mobile groomer wants a pickup address).
- **Main Flow:**
  1. Admin adds one or more questions (free text, a named-attendees list, or a typed marker such as pickup address) and marks each required or optional.
  2. Admin sets whether the service requires a participant count, named attendees, both, or neither.
  3. Admin writes/updates the consent text customers must accept.
  4. System publishes a new `service_booking_intake_schema` version — `is_active = true` on the new row, `is_active = false` on the previous one. The previous version is never edited in place.
- **Alternative Flows:**
  - **A1: Service already has bookings in flight against the current version** → Existing bookings keep their already-snapshotted `intakeSchemaVersion`/`intakeAnswers`; only new bookings see the new version.
  - **A2: Admin adds a `PICKUP_ADDRESS`-typed question** → System also sets `services.requires_pickup_address = true` in the same transaction — the legacy boolean stays the single source of truth for whether `bookings.pickup_address` must be populated.
- **Postconditions:** The service has exactly one active intake schema version.
- **Events Triggered:** None.

---

### **UC-055: STAFF | MANAGER Configures an Appointment Service's Booking Policy**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `PATCH /services/:id/booking-policy`
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`.
- **Trigger:** Admin edits the service's booking policy.
- **Main Flow:**
  1. Admin sets approval mode (`AUTO_CONFIRM`/`MANUAL_APPROVAL`, inheriting the tenant default when left blank) and, if `MANUAL_APPROVAL`, the hold duration.
  2. Admin sets the cancellation window, minimum notice, and maximum advance (all inheriting tenant defaults when left blank).
  3. Admin toggles whether the service allows recurring private reservations and availability alerts (Cluster 3).
  4. If the service has `durationPolicy = CUSTOMER_SELECTED`, admin also sets minimum/maximum/increment duration, the per-increment price, and optional minimum charge.
  5. System saves the policy on `Service`; every subsequent booking snapshots the effective values at submission time.
- **Alternative Flows:**
  - **A1: Admin reduces the cancellation window or approval hold below a value already relied on by an in-flight booking** → No retroactive effect; only bookings created after the change use the new values.
  - **A2: Admin sets `durationPolicy = CUSTOMER_SELECTED` without a `pricingPolicy`** → `422 Unprocessable` — a variable-duration service must declare how it prices.
- **Postconditions:** The service has a complete, self-contained booking policy; no field silently falls back to an undocumented default.
- **Events Triggered:** None.

---

### **UC-056: STAFF | MANAGER Chooses a Service's Booking Model at Creation**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /services` (existing endpoint, `bookingModel` is a new field, default `APPOINTMENT`)
- **Preconditions:** None beyond an active tenant.
- **Trigger:** Admin creates a new service.
- **Main Flow:**
  1. Admin picks `APPOINTMENT` (a private appointment, today's default) or `SESSION` (a class with capacity).
  2. If `APPOINTMENT`: proceeds to UC-050 (or UC-052 for legs).
  3. If `SESSION`: admin declares this service's eligible resource pool per slot (`Service.classResourceSlots`) — same eligibility checklist as UC-050's flat case, just without a selection mode, since nothing resolves dynamically per booking. **Not actionable until Cluster 4 ships** `ClassScheduleTemplate` — the schema field exists from this cluster onward, but nothing consumes it yet; a SESSION service created in Cluster 2/3 has no way to actually be booked until then.
- **Alternative Flows:**
  - **A1: Admin tries to change `bookingModel` on a service with existing bookings** → `409 Conflict` — booking model is immutable once the service has history.
- **Postconditions:** Service exists with a fixed `bookingModel`.
- **Events Triggered:** None.

---

### **UC-057: MANAGER Views a Combined Multi-Resource Day Grid**

- **Actor:** MANAGER (deliberately manager-only, like Equipe/Configurações/Hotsite/Recursos — a broader oversight surface than any single-resource view)
- **Endpoint:** `GET /schedule/day-grid?date=`
- **Preconditions:** Tenant has ≥ 2 active resources.
- **Trigger:** Manager opens "Horários" (role-adaptive: a STAFF viewer keeps the tenant-wide timeline unchanged — UC-010e/f's resource-scoped picker/view is deliberately MANAGER-only, never shown to STAFF, per M21-S05 — a MANAGER viewer gets this grid instead).
- **Main Flow:**
  1. System shows a grid: columns = active resources (any type), rows = time slots for the selected day.
  2. Each cell shows a booking/session if that resource is occupied then, reusing the same visual block as the single-resource timeline.
  3. Manager clicks any cell to drill into that booking/session's detail.
- **Alternative Flows:**
  - **A1: Too many resources to fit on screen** → Horizontal scroll, plus a resource-type filter (Profissionais / Salas / Equipamentos) to narrow the visible columns.
- **Postconditions:** None (read-only).
- **Events Triggered:** None.

---

### **UC-058: System Computes Availability Scoped to a Resource or Bundle**

- **Actor:** System
- **Preconditions:** Service has `resourceRequirements` referencing one or more resources.
- **Trigger:** Any availability query (extends UC-011) for a resource-scoped or bundled service.
- **Main Flow:**
  1. `IBookingAvailabilityPort` is queried with `tenantId` + `resourceId(s)` instead of `tenantId` alone (see `docs/02-DOMAIN_MODEL.md`).
  2. For a bundle, a slot is available only if **every** required resource is simultaneously free (intersection).
  3. For `AUTO_FUNGIBLE_POOL`, a slot is available if **any** pool member is free (union, not intersection).
- **Alternative Flows:**
  - **A1: No active resource of the required type exists for the service** → Query returns zero available slots, same shape as today's "no availability" result; not an error.
  - **A2: A `resourceId` in the query doesn't belong to the querying tenant** → Excluded by the mandatory `tenantId` scoping in step 1; never reaches steps 2–3.
- **Postconditions:** Extends today's `AvailabilityService` rather than replacing it.
- **Events Triggered:** None (read path).
- **Forward reference (not reachable in Cluster 2 alone):** once Cluster 3 ships `RecurringBookingSchedule`, "free" also excludes any active schedule whose recurrence rule produces an occurrence at the candidate time; once Cluster 4 ships `ClassScheduleTemplate`, the same applies to an active template's recurrence rule — both evaluated directly against the pattern, not against a materialized row, since a not-yet-generated future occurrence is still a real commitment.

---

### **UC-059: System Applies Resource Turnover and Leg Transition Gaps**

- **Actor:** System
- **Preconditions:** Resource has `turnoverMinutes > 0`, and/or the service has legs with `transitionGapAfterMinutes > 0`.
- **Trigger:** Same availability computation as UC-058.
- **Main Flow:**
  1. For a flat service: effective gap before the next booking on a resource = `max(service.bufferAfterMinutes, resource.turnoverMinutes)`.
  2. For a legged service: each leg's own resource turnover applies at that leg's resource; `transitionGapAfterMinutes` is added between legs regardless of resource turnover.
- **Alternative Flows:**
  - **A1: Resource has `turnoverMinutes = 0` and the service has no legs (or all gaps are 0)** → No extra gap beyond `service.bufferAfterMinutes`; behaves identically to today's single-number buffer model.
- **Postconditions:** Candidate slots correctly reflect both cleanup time and customer transition time, without conflating the two.
- **Events Triggered:** None.

---

### **UC-060: System Rejects Overlapping Bookings Across a Shared Resource — Same-Family (Cross-Family from Cluster 4)**

- **Actor:** System
- **Preconditions:** Two different APPOINTMENT-style services share the same resource (e.g. one piece of equipment used by two different appointment types). Cross-family (an APPOINTMENT service and a SESSION `ClassScheduleTemplate` sharing a resource) is not testable until Cluster 4 ships.
- **Trigger:** A booking attempt would overlap an already-committed window on the shared resource.
- **Main Flow:**
  1. Availability computation for the new request is scoped to `tenantId` + the shared `resourceId`, same as UC-058 step 1, and includes existing approved bookings against that shared resource via `booking.resource_occupancy` (see `docs/13-DATABASE_SCHEMA.md`).
  2. Overlapping candidate slots are excluded or blocked at both the query layer and, for a genuine race, the DB's shared GIST exclusion constraint.
- **Alternative Flows:**
  - **A1: The two windows are adjacent, not overlapping** (one ends exactly when the other starts, ignoring buffer/turnover which UC-059 already accounts for separately) → Not a conflict; both are allowed.
  - **A2: The "conflicting" commitment belongs to the same booking being edited** → Excluded from the conflict check; a commitment never conflicts with itself.
- **Postconditions:** A resource's exclusivity holds at the DB level, structurally, not just as a query-time check.
- **Events Triggered:** None.

---

## Customer/Guest Appointment Booking & Extensions Use Cases (M21 Cluster 3)

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 3 (Customer/guest appointment booking + extensions). Depends on Cluster 1 (`Resource`) and Cluster 2 (`Service` extensions, availability engine). See `docs/02-DOMAIN_MODEL.md` § `RecurringBookingSchedule`/`AvailabilityAlert`/`FutureCommitmentException` and `docs/13-DATABASE_SCHEMA.md`. Approval throughout: every CAND below uses the service's effective approval policy (UC-055) — `AUTO_CONFIRM` creates `APPROVED`, `MANUAL_APPROVAL` creates capacity-holding `PENDING` with the snapshotted hold duration.

### **UC-061: Customer Books With a Specific Chosen Staff Member**

- **Actor:** Customer or Guest
- **Endpoint:** `POST /bookings` (existing UC-001/002 endpoint; resource-scoped internally per UC-058)
- **Preconditions:** Service has `resourceRequirements = [{ type: STAFF, selectionMode: CUSTOMER_CHOICE }]`.
- **Trigger:** Customer selects the service and is prompted to choose a staff member.
- **Main Flow:**
  1. Customer sees the list of active `STAFF`-type resources offering this service.
  2. Customer picks one; calendar shows **only that resource's** availability.
  3. Customer picks a slot; remainder matches UC-001/UC-002.
  4. System locks the chosen resource (not the whole tenant) for the booked window.
- **Alternative Flows:**
  - **A1: Chosen staff member has no availability in the visible range** → Customer picks a different staff member or a later date.
- **Postconditions:** Booking exists with a resolved resource assignment for the chosen staff.
- **Events Triggered:** `BookingRequested` (unchanged envelope, now implies a resource-scoped slot).

---

### **UC-062: Customer Books Auto-Assigned From a Fungible Resource Pool**

- **Actor:** Customer or Guest
- **Endpoint:** `POST /bookings`
- **Preconditions:** Service has `resourceRequirements = [{ type: ROOM|EQUIPMENT, selectionMode: AUTO_FUNGIBLE_POOL }]`.
- **Trigger:** Customer selects the service (e.g. "book a court").
- **Main Flow:**
  1. Calendar shows availability aggregated across the whole pool — a slot is open if **any** pool member is free.
  2. Customer picks a slot; system auto-assigns whichever pool resource is free (no identity shown).
  3. Remainder matches UC-001/UC-002.
- **Alternative Flows:**
  - **A1: All pool members already booked for that window** → Slot doesn't appear as available at all.
- **Postconditions:** Booking locks one specific pool resource, invisibly to the customer.
- **Events Triggered:** `BookingRequested`.

---

### **UC-063: Customer Books a Service Configured for System-Auto-Assigned Named Staff**

- **Actor:** Customer or Guest
- **Endpoint:** `POST /bookings`
- **Preconditions:** Service has `resourceRequirements = [{ type: STAFF, selectionMode: AUTO_ANY }]`.
- **Trigger:** Customer selects the service.
- **Main Flow:**
  1. Customer goes directly to the calendar/slot picker — no staff-selection step (unlike UC-061).
  2. Availability is the union across every active `STAFF` resource offering this service.
  3. Customer picks a slot and submits; system assigns whichever eligible staff member is free.
  4. Confirmation reveals the assigned staff member's name (unlike UC-062, where no identity is shown).
- **Alternative Flows:**
  - **A1: More than one staff member is free for the chosen slot** → System selects the one with the least already-locked workload on that tenant-local day; `resourceId` is the stable tie-breaker.
- **Postconditions:** Booking exists with a resolved resource assignment the customer did not choose.
- **Events Triggered:** `BookingRequested`.

---

### **UC-064: Customer Books a Bundled-Resource Appointment**

- **Actor:** Customer or Guest
- **Endpoint:** `POST /bookings`
- **Preconditions:** Service has `resourceRequirements.length >= 2` (e.g. dentist + chair).
- **Trigger:** Customer selects the service.
- **Main Flow:**
  1. For each `CUSTOMER_CHOICE` requirement, customer picks (e.g. which dentist).
  2. Calendar shows slots where **all** required resources are simultaneously free.
  3. Customer books; system locks every resource in the bundle for the same window.
- **Alternative Flows:**
  - **A1: Chosen staff is free but the auto-assigned equipment isn't** → Slot doesn't appear as available (intersection, not union).
  - **A2: A bundle member becomes unavailable between page load and submit (race)** → System re-validates the whole bundle atomically at submit time; `409 Conflict` — "part of this booking is no longer available."
- **Postconditions:** Booking's resource assignments list every locked resource.
- **Events Triggered:** `BookingRequested`.

---

### **UC-065: Customer Books a Multi-Leg Appointment**

- **Actor:** Customer or Guest
- **Endpoint:** `POST /bookings`
- **Preconditions:** Service has `legs.length >= 2` (e.g. spa journey).
- **Trigger:** Customer selects the service.
- **Main Flow:**
  1. Customer picks `CUSTOMER_CHOICE` resources per leg where applicable.
  2. Calendar shows start times where the **entire chained itinerary** fits — every leg's resource(s) free at that leg's computed sub-window, honoring transition gaps.
  3. Customer books; confirmation shows the full itinerary (per-leg time + resource(s)).
- **Alternative Flows:**
  - **A1: A middle leg's resource(s) become unavailable between page load and submit** → System re-validates the whole chain atomically at submit time; `409 Conflict` — "one part of this journey is no longer available."
- **Postconditions:** One `BookingLine` with a full leg-assignment snapshot.
- **Events Triggered:** `BookingRequested`.

---

### **UC-066: Customer Views a Specific Staff Member's Own Calendar**

- **Actor:** Customer or Guest
- **Endpoint:** `GET /resources/:id/availability`
- **Preconditions:** Tenant has `STAFF`-type resources with `CUSTOMER_CHOICE` on at least one service.
- **Trigger:** Customer browses a staff directory before booking.
- **Main Flow:**
  1. Customer picks a staff member from a directory/profile view.
  2. System shows that resource's availability across every service they're eligible for.
  3. Customer proceeds into UC-061 once a slot/service is chosen.
- **Alternative Flows:**
  - **A1: Staff member is inactive** → Not shown in the directory.
- **Postconditions:** None (read-only browse).
- **Events Triggered:** None.

---

### **UC-067: Customer Books a Variable-Duration Resource Reservation**

- **Actor:** Customer or Guest
- **Endpoint:** `POST /bookings` — body includes `startsAt`, `durationMinutes`, `participantCount`
- **Preconditions:** APPOINTMENT service has `durationPolicy = CUSTOMER_SELECTED` and a resource/bundle requirement.
- **Trigger:** Customer selects an eligible room, court, bay, desk, or equipment service.
- **Main Flow:**
  1. Customer chooses a start and duration within the service's minimum, maximum, and increment rules.
  2. System validates the whole interval, required quantity, and participant limit.
  3. System quotes the service-level per-increment price (`docs/13-DATABASE_SCHEMA.md`'s round-up rule), resolves every required resource atomically.
  4. System creates the normal booking under its snapshotted approval policy.
- **Alternative Flows:**
  - **A1: Another booking takes any required resource before submission** → `409 Conflict`; customer keeps their chosen criteria and selects another compatible interval.
  - **A2: Interval crosses midnight** → Allowed only when the full span is within the configured maximum and every required resource is open for its own occupied window. Hotel/accommodation stays out of scope.
  - **A3: Fungible requirement has `requiredQuantity > 1`** → System assigns that many distinct eligible units in the same transaction or offers no slot; never partially creates a reservation.
- **Postconditions:** The selected span is protected by normal occupancy; fixed-duration services remain unchanged.
- **Events Triggered:** Existing appointment booking events, per the resulting `PENDING`/`APPROVED` state.

---

### **UC-068: Customer Submits Versioned Booking Intake and Attendees**

- **Actor:** Customer or Guest
- **Endpoint:** `POST /bookings` — body includes `intakeSchemaVersion`, `intakeAnswers`, optional named attendees
- **Preconditions:** Service declares intake fields, participant/count rules, or both.
- **Trigger:** Customer reaches booking review for a service with intake or attendee requirements.
- **Main Flow:**
  1. Customer completes the service's current intake schema (`GET /services/:id/intake-schema`).
  2. System validates required answers, projects operational values (e.g. pickup address, participant count) into typed booking fields.
  3. System snapshots schema version, answers, consent, and optional named attendees with the submitted booking.
- **Alternative Flows:**
  - **A1: The service form changes while the customer is completing it** → Submission validates against the displayed schema version; a removed/changed field never silently rewrites already-completed answers.
  - **A2: A minor attends** → A responsible authenticated adult may be the booker; no family-account hierarchy implied.
  - **A3: A required intake question or the consent checkbox is left unanswered** → `422 Unprocessable` — inline validation error naming the missing field(s).
- **Postconditions:** Historical bookings remain readable under the form version used at submission.
- **Events Triggered:** None beyond the resulting booking-request event.

---

### **UC-069: Customer Reschedules an Appointment or Reservation**

- **Actor:** Customer, or audited staff acting for the customer
- **Endpoint:** `PATCH /bookings/:id/reschedule` (existing UC-008 endpoint, extended — see `docs/14-API_CONTRACTS.md`)
- **Preconditions:** Booking is eligible under its snapshotted per-service reschedule policy (`rescheduleWindowHoursOverride`, UC-055).
- **Trigger:** Customer chooses "Reagendar" on an eligible future appointment/reservation.
- **Main Flow:**
  1. System validates and locks the replacement resource/span before releasing the original one.
  2. System recalculates and displays the new quote.
  3. System records an append-only `booking_quote_revisions` row and a link to the prior arrangement.
  4. System notifies the customer after commit (`BookingRescheduled`, extended scope — see `docs/03-DOMAIN_EVENTS.md`).
- **Alternative Flows:**
  - **A1: Replacement is no longer available** → Original remains intact; customer selects another option.
  - **A2: Bundle/journey** → Every resource/leg revalidated as one atomic change; no partial move possible.
  - **A3: Staff policy override** → Staff records reason and actor, but never bypasses capacity, verification, or resource exclusivity.
- **Postconditions:** Customer never loses the original slot merely because a replacement submit races.
- **Events Triggered:** `BookingRescheduled`.

---

### **UC-070: Customer (or Staff) Manages a Recurring Private Reservation Schedule**

- **Actor:** Authenticated customer, or Staff acting on their behalf
- **Endpoint:** `POST /recurring-booking-schedules`, `PATCH /recurring-booking-schedules/:id` (skip/reschedule occurrence, pause, end)
- **Preconditions:** Service enables recurrence (`recurrenceEligible`, UC-055); guest bookings are not eligible.
- **Trigger:** Customer or staff confirms a supported weekly/private recurrence pattern.
- **Main Flow:**
  1. System resource-conflict-checks the proposed schedule with `FIXED_ASSIGNMENT` (customer/staff-selected resource) or `RESOLVE_PER_OCCURRENCE` (eligible automatic/fungible service).
  2. Branches on the service's effective approval mode: `AUTO_CONFIRM` → `RecurringBookingSchedule` created `ACTIVE` directly, blocks the future pattern, and materializes normal linked bookings through the rolling horizon (90-day default) immediately. `MANUAL_APPROVAL` → created `PENDING_APPROVAL` with a snapshotted `approvalHoldExpiresAt`; **no occurrences generated yet** — staff resolves it once via UC-071; only on approval does it become `ACTIVE` and generation begin.
  3. **Once `ACTIVE`:** every occurrence auto-confirms as `APPROVED` regardless of the service's own `defaultApprovalMode` — the standing schedule was already vetted once, at the point it became `ACTIVE`. `MANUAL_APPROVAL` still governs a genuinely one-off booking of the same service (UC-061–065) — only occurrences generated by an already-`ACTIVE` schedule bypass per-occurrence review.
- **Alternative Flows:**
  - **A1: A future pattern conflicts at creation** → `409 Conflict`; no partial schedule exists (checked before either branch above).
  - **A2: Customer skips/reschedules one occurrence, pauses, or ends** → A persistent exception preserves history and prevents unwanted regeneration. Only applies once `ACTIVE`; a `PENDING_APPROVAL` request is withdrawn outright instead.
  - **A3: A later resource/configuration change makes a commitment invalid** → UC-073 queues a manager exception; the system never silently double-books or moves the customer.
  - **A4: The resource(s) are already at `MAX_ACTIVE_SCHEDULES_PER_RESOURCE`/`MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE` (50 each)** → `409 Conflict`, same messaging as A1.
  - **A5: `PENDING_APPROVAL` request reaches `approvalHoldExpiresAt` with no staff decision** → System auto-cancels it, `cancellationReason = APPROVAL_EXPIRED`, same mechanic as an expired manual-approval appointment hold. Customer is notified and may request again.
- **Postconditions:** Recurrence is a standing commitment, not a best-effort reminder, once `ACTIVE`. A `PENDING_APPROVAL` request is not yet a commitment and blocks no one else's booking beyond the resource-conflict check already performed at request time.
- **Events Triggered:** `RecurringBookingScheduleCreated` (`AUTO_CONFIRM`) or `RecurringBookingScheduleApprovalRequested` (`MANUAL_APPROVAL`) at creation; `RecurringBookingSchedulePaused`/`Ended`; ordinary booking events for each materialized occurrence.

---

### **UC-071: Staff Approves or Rejects a Recurring Schedule Request**

> Closes a `MANUAL_APPROVAL` bypass loophole: without this UC, a customer could evade a service's review gate entirely by requesting a recurring schedule instead of a one-off booking (create, let one occurrence generate, cancel — repeatable at will).

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /recurring-booking-schedules/:id/approve`, `POST /recurring-booking-schedules/:id/reject`
- **Preconditions:** `RecurringBookingSchedule` exists, `status = PENDING_APPROVAL`.
- **Trigger:** A request reaches `PENDING_APPROVAL` through UC-070 and appears in staff's approval queue (same surface as UC-098's guest-reservation queue, or the existing manual-approval-appointment queue).
- **Main Flow:**
  1. Staff reviews the request: customer, service, recurrence pattern, and resolved/eligible resource(s).
  2. Staff approves or rejects in one action.
  3. On approval: schedule transitions to `ACTIVE`, `approvedByStaffId`/`approvedAt` set, rolling-horizon generation begins (UC-070's `AUTO_CONFIRM` branch, from this point forward).
  4. On rejection: schedule transitions to `CANCELLED`, `cancellationReason = APPROVAL_REJECTED`. No occurrences were ever generated, so nothing to release.
- **Alternative Flows:**
  - **A1: Request was already resolved by another staff member before this decision commits (race)** → Shown as already-resolved; this action becomes a no-op.
  - **A2: `approvalHoldExpiresAt` passes before staff decides** → UC-070 A5's expiry worker resolves it first; this action is no longer available.
- **Postconditions:** A request is never left in `PENDING_APPROVAL` past its hold deadline, and never becomes a standing commitment without an explicit staff decision (or expiry).
- **Events Triggered:** `RecurringBookingScheduleCreated` (approval) or `RecurringBookingScheduleRejected` (rejection/expiry).

---

### **UC-072: Authenticated Customer Creates an Availability Alert**

- **Actor:** Authenticated customer
- **Endpoint:** `POST /availability-alerts`
- **Preconditions:** Service permits alerts (`availabilityAlertEligible`, UC-055) and has availability criteria the customer can express.
- **Trigger:** Customer sees no suitable appointment/reservation availability.
- **Main Flow:**
  1. Customer selects service, optional preferred resource, duration/participant criteria, and either a finite absolute range or a weekly local-time preference.
  2. System stores an expiring alert attached to that customer without reserving anything.
  3. When a released slot matches, system records one deduplicated email/in-app notification attempt for that alert/window.
- **Alternative Flows:**
  - **A1: Unauthenticated visitor** → Directed to login/account creation before an alert can be saved; chosen criteria return with them after authentication.
  - **A2: Alert expires, is cancelled, or was already notified for the matching window** → No new notification is sent and no capacity is held.
- **Postconditions:** Alert is an intent only; customer still books normally after notification.
- **Events Triggered:** `AvailabilityAlertCreated`, later `AvailabilityAlertMatched`/`Expired`/`Cancelled`.

---

### **UC-073: System Identifies and Queues a Future Commitment Exception**

- **Actor:** System
- **Preconditions:** A future materialized booking or standing recurrence is affected by a committed resource, hours, closure, or schedule change — **excluding** a manager-initiated range cancellation (Cluster 4), whose own step is already that change's explicit, audited resolution. This covers a change *nobody explicitly reviewed per-session*: a resource deactivation, an hours reduction, or a side effect of an otherwise-unrelated config edit.
- **Trigger:** A resource is deactivated, closed/maintained, its hours shrink, or a schedule change affects a future commitment.
- **Main Flow:** System creates one idempotent manager-owned worklist entry per affected commitment, records the impact/deadline, and calculates eligible resource/time alternatives. It never changes the booking itself.
- **Alternative Flows:**
  - **A1: The same unresolved impact already has an open worklist entry** → Update/reuse that entry; never create duplicate manager work.
  - **A2: No safe alternative exists** → The item remains open with an explicit "no compatible alternative" result; manager still chooses keep, contact/reschedule, or cancel in UC-077.
- **Postconditions:** Existing commitments are never silently invalidated or automatically moved; UC-077 is the only resolution flow.
- **Events Triggered:** `FutureCommitmentExceptionRaised`.

---

### **UC-074: Staff or Manager Marks an Appointment as No-Show**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /bookings/:id/no-show`
- **Preconditions:** The appointment's scheduled end time has passed; the booking is not already terminal.
- **Trigger:** Staff or manager closes the appointment outcome and confirms the customer did not attend.
- **Main Flow:**
  1. System transitions the appointment to terminal `NO_SHOW` and appends an auditable status transition.
  2. System publishes `BookingNoShow` through the transactional outbox.
  3. Notification Context sends an email using the booking contact snapshot, retrying delivery independently if needed.
- **Alternative Flows:**
  - **A1: Appointment has not ended** → `422 Unprocessable`.
  - **A2: Booking is already terminal** → `409 Conflict` — a manager correction follows the correction flow instead.
  - **A3: Manager corrects a mistaken no-show** → System appends a correction transition with actor, reason, and timestamp, then emits the appropriate resulting event. Loyalty is awarded only if the resulting state is `COMPLETED`.
- **Postconditions:** No loyalty points are awarded for `NO_SHOW`; no completion event is emitted for the no-show outcome. **Changes CLAUDE.md §5's booking state machine** — see that file's own update alongside this promotion.
- **Events Triggered:** `BookingNoShow`, or the correction/resulting completion event.

---

### **UC-075: System Bootstraps a New Tenant From a Preset**

- **Actor:** Manager, during tenant onboarding
- **Endpoint:** `POST /onboarding/bootstrap`
- **Preconditions:** Tenant has no published scheduling configuration and the manager has supplied every minimum answer for a supported preset.
- **Trigger:** Manager confirms a business preset and its minimum answers.
- **Main Flow:**
  1. System creates the tenant's default `LOCATION` resource (if the Cluster 1 backfill hasn't already run for this tenant — normally it has, since this UC only applies to a genuinely new tenant).
  2. System creates services, resources/pools, and working hours in dependency order.
  3. System creates service policies.
  4. **Presets A/B/C/G only in this cluster** — a purely-appointment preset completes here. **SESSION presets (D/E/F) additionally create the first `ClassScheduleTemplate`(s) once Cluster 4 ships** — not actionable until then.
  5. System shows the generated configuration as an editable review.
- **Alternative Flows:**
  - **A1: A mixed preset (e.g. Preset F, appointment + session)** → May create more than one service family in the same bootstrap; the session half is inert until Cluster 4 ships.
  - **A2: Invalid minimum answers** → Returns to the relevant wizard step.
  - **A3: Bootstrap failure at any point** → Rolls back the whole configuration; no partially configured tenant is ever published.
- **Postconditions:** Tenant has at least one valid bookable-service configuration without requiring a circular resource/service setup.
- **Events Triggered:** `TenantSchedulingBootstrapped` after the complete configuration commits.

---

### **UC-076: Customer Manages an Availability Alert**

- **Actor:** Authenticated customer
- **Endpoint:** `GET /availability-alerts`, `PATCH /availability-alerts/:id`, `DELETE /availability-alerts/:id`
- **Preconditions:** Customer owns an active availability alert for the tenant.
- **Trigger:** Customer opens "Meus avisos."
- **Main Flow:**
  1. Customer opens "Meus avisos" and views their active alerts.
  2. Customer edits matching criteria or expiry, or cancels an alert.
  3. System expires alerts automatically and sends at most one deduplicated notification per matching availability window.
- **Alternative Flows:**
  - **A1: Alert already notified or expired** → Remains visible as history but cannot be edited/reactivated; customer creates a new alert instead.
- **Postconditions:** Alerts remain non-reserving customer intent; every notification attempt is auditable. An alert is never auto-cancelled just because the customer's underlying need was met through a different channel — independent intents by design.
- **Events Triggered:** `AvailabilityAlertUpdated`/`AvailabilityAlertCancelled`/`AvailabilityAlertExpired`.

---

### **UC-077: Manager Resolves a Future Commitment Exception**

- **Actor:** MANAGER
- **Endpoint:** `GET /scheduling-exceptions`, `POST /scheduling-exceptions/:id/resolve`, `POST /scheduling-exceptions/:id/dismiss`
- **Preconditions:** An open UC-073 worklist item exists and the manager can view the affected commitment.
- **Trigger:** A resource/hours change affects a future booking.
- **Main Flow:**
  1. Manager reviews the impact and any safe alternatives on an open worklist item.
  2. Manager explicitly chooses: keep, reassign, reschedule, or cancel.
  3. System records the decision, actor, reason, and notification outcome after the chosen change commits.
- **Alternative Flows:**
  - **A1: A proposed reassignment/reschedule becomes unavailable at commit (race)** → Revalidated at commit time; if now unavailable, the worklist stays open and the original commitment remains intact.
  - **A2: Item is genuinely resolved or non-impacting** → Manager may dismiss it with a reason, instead of choosing one of the four actions above.
- **Postconditions:** No future commitment is silently moved or invalidated.
- **Events Triggered:** `FutureCommitmentExceptionResolved`/`Dismissed` and any resulting booking event.

---

## Classes/Sessions Use Cases (M21 Cluster 4)

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 4 (Classes/Sessions), the final and largest cluster. Depends on Clusters 1–3. See `docs/02-DOMAIN_MODEL.md` § `ClassScheduleTemplate`/`ClassSession`/`ClassSessionBooking`/`RecurringEnrollment`/`ClassAccessContract` and `docs/13-DATABASE_SCHEMA.md`. This cluster also completes UC-056's SESSION branch (`Service.classResourceSlots` becomes actionable) and UC-058's forward-referenced class-template availability check, and delivers UC-075's Presets D/E/F.

### **UC-078: Staff/Manager Configures a Session Service's Guest Access Policy**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `PATCH /services/:id/guest-access-policy`
- **Preconditions:** Service exists, `bookingModel = SESSION`.
- **Trigger:** Staff configures whether and how guests (non-contract customers) can book this SESSION service.
- **Main Flow:**
  1. Staff toggles `guestAccessEnabled` (default off — authenticated access via `ClassAccessContract` is the SESSION default).
  2. Staff picks `guestTrialPolicy`: `NONE` or `FIRST_FREE_PER_EMAIL`.
  3. System saves both fields on `Service`. Per-session non-member capacity (`trialSlots`) is configured per class-schedule-template instead (UC-079/UC-083).
- **Alternative Flows:**
  - **A1: Staff disables `guestAccessEnabled` with `PENDING_APPROVAL`/`PENDING_EMAIL_VERIFICATION` guest reservations already in flight** → Existing in-flight reservations are honored to their natural conclusion; only new guest requests are blocked going forward.
- **Postconditions:** UC-097's guest-verification flow and UC-098's approval flow have a real, staff-set configuration to read.
- **Events Triggered:** None.

---

### **UC-079: Staff/Manager Creates a Recurring Class Schedule Template**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /class-schedule-templates`
- **Preconditions:** Service exists with `bookingModel = SESSION`.
- **Trigger:** Staff sets up the class's recurring pattern.
- **Main Flow:**
  1. For each slot in the service's already-declared eligible pool (UC-056 step 3), staff picks exactly one resource — the picker only ever shows that pool's members.
  2. Staff sets a recurrence rule (days of week, start time — duration comes from `Service.durationMinutes`).
  3. Staff sets `capacity` and, when the service has `guestAccessEnabled`, `trialSlots` (default 0).
  4. System creates the `ClassScheduleTemplate`, `isActive = true`.
  5. System (async) begins generating `ClassSession` rows on the rolling horizon (UC-081).
- **Alternative Flows:**
  - **A1: Chosen resources already committed to an overlapping template** → `409 Conflict`.
  - **A2: A chosen resource already has an `APPROVED` appointment `Booking` or active `RecurringBookingSchedule` matching the new recurrence** → `409 Conflict`, listing the conflicting commitment(s); staff must resolve before the template can be created.
  - **A3: Requested `capacity` exceeds the lowest `maxCapacity` ceiling among the template's `ROOM`/capacity-bearing `EQUIPMENT` resources** → `422 Unprocessable`.
  - **A4: A chosen resource already has `MAX_ACTIVE_TEMPLATES_PER_RESOURCE` (50) active templates** → `409 Conflict`, naming the resource.
- **Postconditions:** Template active; sessions begin appearing on the booking calendar.
- **Events Triggered:** None.

---

### **UC-080: Staff/Manager Edits or Deactivates a Template**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `PATCH /class-schedule-templates/:id`, `DELETE /class-schedule-templates/:id`
- **Preconditions:** Template exists.
- **Trigger:** Staff changes the recurrence, resources, default capacity, or `trialSlots`, or turns the template off.
- **Main Flow:**
  1. Staff edits the template.
  2. System applies the change only to future, not-yet-generated sessions — already-materialized sessions are untouched.
  3. Deactivating stops future generation; existing future sessions remain bookable unless separately cancelled (UC-084).
- **Alternative Flows:**
  - **A1: Staff wants existing future sessions to also change** → Out of scope; edit each `ClassSession` individually (UC-083) or cancel and recreate.
  - **A2: New default capacity is below the `reservedCount` of one of the template's own already-materialized, not-yet-started sessions** → `409 Conflict`; directs staff to resolve those sessions individually via UC-083 first.
- **Postconditions:** Template reflects new config; historical/already-generated sessions unaffected.
- **Events Triggered:** None.

---

### **UC-081: System Generates Upcoming Class Sessions**

- **Actor:** System (scheduled job — same shape as the existing loyalty-expiry cron)
- **Preconditions:** At least one active `ClassScheduleTemplate` exists.
- **Trigger:** An idempotent rolling-horizon generation job runs every 15 minutes. Platform default horizon 90 days; a service may configure a shorter one.
- **Main Flow:**
  1. For each active template, system computes the next occurrence(s) within the horizon not yet materialized.
  2. System creates a `ClassSession` per occurrence, snapshotting `resourceIds`/`capacity`/`trialSlots` from the template.
  3. Idempotency: a `(templateId, startTime)` uniqueness check prevents double-generation on retry.
- **Alternative Flows:**
  - **A1: The worker fails or misses a run** → The next run recomputes the complete target horizon, skips already-materialized keys, retries safely, records an operational failure/metric. No duplicate session.
  - **A2: A resource is closed or outside its hours for that occurrence** → Session is not generated.
  - **A3: A resource has an overlapping approved appointment** → Rejected by the shared `resource_occupancy` constraint; staff resolves the existing commitment.
- **Postconditions:** `ClassSession` rows exist far enough ahead for customers to book into.
- **Events Triggered:** None.

---

### **UC-082: Staff/Manager Views a List of Upcoming Class Sessions**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `GET /class-sessions?scope=mine|all&from=&to=`
- **Preconditions:** At least one active template has generated future sessions.
- **Trigger:** Staff opens "Turmas."
- **Main Flow:**
  1. System lists upcoming sessions grouped by day (today first), each showing service name, time, resources, and `capacity - reservedCount` remaining seats.
  2. Defaults to "my turmas" for STAFF (sessions where one of their own `Resource`-wrapped rows is in `resourceIds`) vs. "all turmas" for MANAGER — same spirit as Agenda's queue scope.
  3. Selecting a session opens its roster and applicable actions (UC-083, UC-084, UC-098, UC-101).
  4. A secondary link leads to template CRUD (UC-079/080), a config action, not a daily one.
- **Alternative Flows:**
  - **A1: No upcoming sessions** → "Nenhuma turma nos próximos dias."
- **Postconditions:** None (read-only).
- **Events Triggered:** None.

---

### **UC-083: Staff/Manager Overrides a Single Session's Capacity or Resources**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `PATCH /class-sessions/:id`
- **Preconditions:** `ClassSession` exists, `status = SCHEDULED`.
- **Trigger:** Staff needs a one-off change (e.g. instructor injury caps today's class lower, or swaps the room).
- **Main Flow:**
  1. Staff edits the session's `capacity`, `trialSlots`, and/or `resourceIds`.
  2. System validates the new resource(s) are free for the window (if changed).
  3. System saves — this instance only; the template is untouched.
- **Alternative Flows:**
  - **A1: New capacity < current `reservedCount`** → `409 Conflict` — confirmed/pending guests are never silently demoted or cancelled.
  - **A2: New capacity exceeds the lowest `maxCapacity` ceiling among the session's resources** → `422 Unprocessable`.
- **Postconditions:** This session reflects the override; future template-generated sessions unaffected.
- **Events Triggered:** None.

---

### **UC-084: Staff/Manager Cancels a Class Session With Existing Bookings**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /class-sessions/:id/cancel`
- **Preconditions:** `ClassSession` exists with >= 1 `ClassSessionBooking` in `CONFIRMED` or `WAITLISTED` status.
- **Trigger:** Staff cancels a session (e.g. instructor unavailable, no substitute).
- **Main Flow:**
  1. Staff confirms cancellation.
  2. System sets `ClassSession.status = CANCELLED`.
  3. System transitions every active booking on it to `CANCELLED`.
  4. System publishes `ClassSessionCancelled`.
- **Alternative Flows:**
  - **A1: Financial treatment** — no refund/credit workflow; Ikaro does not process payments.
- **Postconditions:** Session and its bookings cancelled; customers notified.
- **Events Triggered:** `ClassSessionCancelled`.

---

### **UC-085: Customer Browses Upcoming Sessions With Remaining Capacity**

- **Actor:** Customer or Guest
- **Endpoint:** `GET /class-sessions?serviceId=&from=`
- **Preconditions:** Service has `bookingModel = SESSION` with an active template generating sessions.
- **Trigger:** Customer selects a class-type service.
- **Main Flow:**
  1. System lists upcoming sessions, each showing `capacity - reservedCount` remaining spots.
  2. Sessions at 0 remaining show "Full — join waitlist" instead of a book button.
- **Alternative Flows:**
  - **A1: No upcoming sessions in range** → "No upcoming classes."
- **Postconditions:** None (read-only).
- **Events Triggered:** None.

---

### **UC-086: Contract Customer Books Into a Session (Single Unit)**

- **Actor:** Customer
- **Endpoint:** `POST /class-session-bookings`
- **Preconditions:** `ClassSession` exists, `reservedCount < capacity`, customer has an active `ClassAccessContract` covering the session's service/date.
- **Trigger:** Customer clicks "Book" on a session with remaining capacity.
- **Main Flow:**
  1. Customer confirms contact details.
  2. System atomically checks `reservedCount < capacity` and creates a one-seat `ClassSessionBooking(status=CONFIRMED)`.
  3. Confirmation shown/sent.
- **Alternative Flows:**
  - **A1: Session fills between page load and submit (race)** → Falls through to UC-090 (waitlist) instead of failing outright.
  - **A2: Customer has no active contract covering this session** → `409 Conflict`, directed to UC-087 (pay-per-class) if the service allows it, or told to arrange a contract otherwise.
- **Postconditions:** `ClassSessionBooking` exists, `CONFIRMED`.
- **Events Triggered:** `ClassSessionBookingConfirmed`.

---

### **UC-087: Authenticated Customer Without a Contract Books a Session Pay-Per-Class**

- **Actor:** Customer (authenticated, no active contract for this service)
- **Endpoint:** `POST /class-session-bookings`
- **Preconditions:** Service has `bookingModel = SESSION` and `guestAccessEnabled = true`.
- **Trigger:** Customer selects a session on a service they have no contract for, and the service allows non-member bookings.
- **Main Flow:**
  1. Customer confirms — no email verification (already authenticated).
  2. System applies the same `trialSlots`/`reservedNonMemberCount` threshold check UC-097 uses. Below threshold → `CONFIRMED`; at/above → `PENDING_APPROVAL` (UC-098).
  3. `ClassSessionBooking` created with `type = CUSTOMER`, `contractId = null`, `paymentSource = IN_PERSON`.
  4. No payment processed by Ikaro; staff may record an externally reported outcome at close-out (UC-107).
- **Alternative Flows:**
  - **A1: `guestAccessEnabled = false`** → Not offered; customer told to arrange a contract.
  - **A2: Session fills / trial-slots threshold reached** → Same branches as UC-086 A1 / UC-097 step 3.
- **Postconditions:** `ClassSessionBooking` exists, owned by the real `customerId`, no contract required.
- **Events Triggered:** `ClassSessionBookingConfirmed` or none yet (`PENDING_APPROVAL`).

---

### **UC-088: Verified Guest Books Multiple Named Units in One Action**

- **Actor:** Guest
- **Endpoint:** `POST /class-session-bookings` (guest path, after UC-097's email verification)
- **Preconditions:** Guest path enabled; guest has verified email; `capacity - reservedCount >= requested quantity`.
- **Trigger:** Guest requests N spots in one checkout.
- **Main Flow:**
  1. Guest sets quantity (bounded by remaining capacity) and names every attendee.
  2. After verification, system atomically checks remaining >= quantity, creates one named-attendee guest reservation, increments `reservedCount` by N.
  3. A group reservation is always `paymentSource = IN_PERSON`; `FIRST_FREE_PER_EMAIL` is a solo-guest benefit only.
- **Alternative Flows:**
  - **A1: Requested quantity exceeds remaining capacity** → UI caps the selectable quantity.
  - **A2: Guest selects one attendee and has an unused first-free entitlement** → Resulting solo reservation uses `GUEST_TRIAL`.
- **Postconditions:** One `ClassSessionBooking` row consuming N units.
- **Events Triggered:** `ClassSessionBookingConfirmed` when confirmed; none until a `PENDING_APPROVAL` group is decided.

---

### **UC-089: Customer Cancels a Single (Non-Recurring) Class Session Booking**

- **Actor:** Customer (guests ask staff to cancel)
- **Endpoint:** `POST /class-session-bookings/:id/cancel`
- **Preconditions:** `ClassSessionBooking` exists, `status = CONFIRMED`, `seriesId = null`. Time to `ClassSession.startTime` >= `tenants.settings.booking.classCancellationWindowHours`.
- **Trigger:** Customer clicks "Cancelar" on an upcoming class booking (Minha Conta).
- **Main Flow:**
  1. System validates the cancellation window.
  2. Customer confirms.
  3. System transitions `CONFIRMED → CANCELLED`, frees `quantity` back to `ClassSession.reservedCount`.
  4. System promotes the earliest-queued waitlisted booking, if any (UC-091).
  5. System publishes `ClassSessionBookingCancelled`.
- **Alternative Flows:**
  - **A1: Inside the cancellation window** → `422 Unprocessable`.
  - **A2: Booking is `WAITLISTED`, not `CONFIRMED`** → No time restriction; transitions straight to `CANCELLED`, no promotion triggered.
  - **A3: Booking has `seriesId != null`** → Redirects to UC-094 (skip one occurrence) or UC-095 (cancel whole enrollment).
  - **A4: Staff/manager cancels on the customer's behalf** → Same mechanism, from the session roster, same window check.
- **Postconditions:** Booking `CANCELLED`; freed capacity offered to the waitlist if one exists.
- **Events Triggered:** `ClassSessionBookingCancelled`.

---

### **UC-090: Authenticated Customer Joins a Waitlist When a Session Is Full**

- **Actor:** Authenticated customer
- **Endpoint:** `POST /class-sessions/:id/waitlist`
- **Preconditions:** `ClassSession.reservedCount = capacity`; customer has selected a qualifying contract or the service-permitted pay-per-class path.
- **Trigger:** Customer clicks "Join waitlist" on a full session.
- **Main Flow:**
  1. System shows one V1 choice: qualifying contract when one exists, or pay-per-class when permitted. One authenticated customer, one seat — guest groups never join a waitlist.
  2. System creates `ClassSessionBooking(status=WAITLISTED, quantity=1)`, snapshots `waitlistAccessIntent`. Does not consume capacity.
  3. Customer told their position (computed at read time from queue order, not stored).
- **Alternative Flows:**
  - **A1: Customer already has a capacity-holding/`WAITLISTED`/`PROMOTION_PENDING` booking on this session** → `409 Conflict`, no duplicate entries.
  - **A2: No qualifying contract and pay-per-class disabled** → Unavailable; told to arrange a contract.
  - **A3: Visitor is not authenticated** → Routed to login/account creation. No waitlist row created before authentication.
- **Postconditions:** Waitlisted `ClassSessionBooking` exists.
- **Events Triggered:** `ClassSessionBookingWaitlisted`.

---

### **UC-091: System Auto-Promotes the Next Waitlisted Customer**

- **Actor:** System
- **Preconditions:** Capacity is released on a future session with a non-empty waitlist.
- **Trigger:** Any capacity-releasing change: cancellation/rejection, attendee removal, an expired offer, or a safe capacity increase.
- **Main Flow:**
  1. System calculates newly available capacity after the release.
  2. System finds the earliest-queued `WAITLISTED` booking with `quantity <=` freed capacity.
  3. Atomically reserves its seat and promotes it to `PROMOTION_PENDING`.
  4. Sends an in-app and email offer with a tenant-configured deadline (default 24h, never later than session start).
- **Alternative Flows:**
  - **A1: Multiple seats released** → Continue offering entries in FIFO order while capacity remains.
  - **A2: Customer declines or offer expires** → Release capacity, cancel the offer, repeat for the next fitting entry.
- **Postconditions:** Waitlisted customer holds a time-bounded offer; acceptance becomes `CONFIRMED`.
- **Events Triggered:** `WaitlistPromoted` (offer created), then `ClassSessionBookingConfirmed` when accepted.

---

### **UC-092: System Auto-Cancels Unpromoted Waitlist Entries When a Session Ends**

- **Actor:** System
- **Preconditions:** `ClassSession.endTime` has passed; >= 1 `ClassSessionBooking` on it is still `WAITLISTED`.
- **Trigger:** Same time-based check as UC-081's generation job (or piggybacked onto it).
- **Main Flow:** System finds every `WAITLISTED` booking on an ended session and transitions each to `CANCELLED`.
- **Alternative Flows:**
  - **A1: No `WAITLISTED` entries on the ended session** → No-op.
- **Postconditions:** No `WAITLISTED` row persists past the session it was waiting on.
- **Events Triggered:** None (routine cleanup).

---

### **UC-093: Customer Enrolls in a Recurring Weekly Session**

- **Actor:** Customer
- **Endpoint:** `POST /recurring-enrollments`
- **Preconditions:** Customer has an active `ClassAccessContract` covering the template's service; template exists and is active. Enrollment cannot extend beyond the contract's end date.
- **Trigger:** Customer opts into "book this every week" instead of a single session.
- **Main Flow:**
  1. Customer confirms enrollment start date.
  2. System creates `RecurringEnrollment(status=ACTIVE)` ending on or before the contract end date.
  3. For each upcoming matching session within the current horizon, system creates a `ClassSessionBooking(seriesId = enrollmentId)`, respecting capacity/waitlist per occurrence.
  4. As new sessions materialize, the enrollment attaches a fresh booking to each.
- **Alternative Flows:**
  - **A1: A given occurrence is full** → That occurrence's booking is `WAITLISTED`; the enrollment stays `ACTIVE`.
- **Postconditions:** Standing enrollment exists only for the qualifying-contract period; contract expiry/cancellation ends it.
- **Events Triggered:** None on the enrollment itself; each generated booking triggers UC-086/090's events.

---

### **UC-094: Customer Cancels a Single Occurrence of a Recurring Enrollment**

- **Actor:** Customer
- **Endpoint:** `PATCH /recurring-enrollments/:id/occurrences/:sessionId` (action: SKIP)
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`; a booking with matching `seriesId` exists for the target occurrence; time to `ClassSession.startTime` >= `tenants.settings.booking.classSkipWindowHours`.
- **Trigger:** Customer cancels just next week's class, keeping the standing enrollment.
- **Main Flow:**
  1. Customer picks the specific occurrence to skip.
  2. System cancels only that booking; `RecurringEnrollment` stays `ACTIVE`.
  3. Freed capacity triggers UC-091 if a waitlist exists.
  4. Customer may instead reschedule to a same-modality replacement session (UC-102, "reposição") when the tenant allows it.
- **Alternative Flows:**
  - **A1: Target occurrence's booking is already `CANCELLED` or doesn't exist yet** → Nothing to skip.
  - **A2: Target occurrence's `startTime` has already passed** → `422 Unprocessable`.
  - **A3: Inside the skip window** → `422 Unprocessable`.
- **Postconditions:** One occurrence skipped; series continues.
- **Events Triggered:** Same as UC-089's cancellation.

---

### **UC-095: Customer Cancels an Entire Recurring Enrollment**

- **Actor:** Customer
- **Endpoint:** `POST /recurring-enrollments/:id/cancel`
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`.
- **Trigger:** Customer stops the standing enrollment entirely.
- **Main Flow:**
  1. System sets `RecurringEnrollment.status = CANCELLED`.
  2. Future bookings stop generating; already-existing future ones for materialized sessions are cancelled, freeing capacity, triggering UC-091 per session.
- **Alternative Flows:**
  - **A1: Enrollment already `CANCELLED`** → No-op, idempotent.
- **Postconditions:** Enrollment and its future bookings cancelled.
- **Events Triggered:** Same per-session cancellation events as UC-094, fired once per affected future session.

---

### **UC-096: Staff/Manager Cancels Template Occurrences for a Date Range or From a Date Forward**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /class-schedule-templates/:id/cancel-range`
- **Preconditions:** Template exists; selected dates are future dates.
- **Trigger:** Staff needs to cancel one holiday range or stop a timetable from a future date.
- **Main Flow:**
  1. Staff chooses a bounded date range or "from this date forward."
  2. For a range, system creates a persistent `ClassScheduleTemplateException` so generation will not recreate those occurrences.
  3. For "from" scope, system ends/deactivates the template at the preceding date.
  4. System cancels every already-materialized affected future session, every active reservation on it, and its locked resource occupancy; customers notified.
- **Alternative Flows:**
  - **A1: Selected range/date is entirely in the past** → `422 Unprocessable`.
  - **A2: An existing exception already overlaps part of the requested range** → System extends/merges the existing exception.
- **Postconditions:** Earlier/history sessions intact; no affected future occurrence can be regenerated. This bulk cancellation is itself the explicit, audited resolution — it does **not** additionally raise a UC-073 worklist entry (see that UC's precondition).
- **Events Triggered:** `ClassSessionCancelled` per cancelled session, through the transactional outbox.

---

### **UC-097: Guest Verifies Email Before Requesting a Class Seat**

- **Actor:** Guest
- **Endpoint:** `POST /class-session-bookings/guest-verification`, `POST /class-session-bookings/guest-verification/:token/confirm`
- **Preconditions:** The SESSION service enables guest access.
- **Trigger:** Guest enters contact details and one or more named attendees for a trial/drop-in.
- **Main Flow:**
  1. System stores a non-capacity-holding `PENDING_EMAIL_VERIFICATION` draft and emails a one-time verification link.
  2. Guest verifies before token expiry.
  3. System re-checks capacity and the non-member threshold atomically. `reservedNonMemberCount + quantity <= trialSlots` → `CONFIRMED`; overall capacity fits but threshold exceeded → `PENDING_APPROVAL`; otherwise no booking created, visitor offered login/account creation to join the waitlist.
  4. `FIRST_FREE_PER_EMAIL` is consumed exactly when a solo reservation reaches `CONFIRMED`.
- **Alternative Flows:**
  - **A1: Verification token expires before confirmation** → Draft discarded; guest restarts. No capacity was ever held.
  - **A2: An authenticated customer without a qualifying contract attempts this path** → Blocked, unconditionally — this flow is anonymous-only by construction. Directed to UC-087 instead.
  - **A3: Capacity fills while the guest is completing verification** → Cannot become `WAITLISTED`; offered login/account creation, then UC-090.
- **Postconditions:** Only verified guest requests can reserve capacity.
- **Events Triggered:** None until confirmed/pending (see UC-086/098's events).

---

### **UC-098: Staff Approves or Rejects a Verified Guest Class Reservation**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /class-session-bookings/:id/approve`, `POST /class-session-bookings/:id/reject`
- **Preconditions:** Reservation is `PENDING_APPROVAL` because its non-member group exceeded that session's `trialSlots` threshold while overall capacity still fit.
- **Trigger:** A verified guest reservation reaches `PENDING_APPROVAL` and appears in the staff session roster's approval queue.
- **Main Flow:**
  1. Staff reviews the reservation and named attendees.
  2. Staff approves or rejects in one action.
  3. On approval: `FIRST_FREE_PER_EMAIL` consumed atomically only when solo and available; becomes `CONFIRMED` without changing already-reserved capacity.
  4. On rejection: becomes `CANCELLED`, releases capacity, triggers UC-091.
- **Alternative Flows:**
  - **A1: Already resolved by another staff member (race)** → Shown as already-resolved; no-op.
  - **A2: Session already started/ended before decision** → UC-100 auto-expires it first; this action no longer available.
- **Postconditions:** A group above the session threshold is never silently approved.
- **Events Triggered:** `ClassSessionBookingConfirmed` or `ClassSessionBookingCancelled`.

---

### **UC-099: Manager Creates or Cancels a Customer Class-Access Contract**

- **Actor:** MANAGER
- **Endpoint:** `POST /class-access-contracts`, `POST /class-access-contracts/:id/cancel`
- **Preconditions:** Customer exists; selected services do not overlap an active eligibility period already granted to that customer.
- **Trigger:** Manager sets up a new customer's session-service access, or ends an existing contract early.
- **Main Flow:**
  1. Manager selects customer, inclusive start/end dates, and eligible SESSION services.
  2. System creates the contract. Grants booking eligibility, reserves no capacity.
  3. An authenticated customer may book exactly one seat in any eligible session within the contract window.
  4. If cancelled early, system cancels every future booking funded by it, ends dependent recurring enrollments, releases capacity.
- **Alternative Flows:**
  - **A1: Contract reaches its end date** → Expires it and ends dependent enrollments; a later contract never silently resumes.
  - **A2: One or more selected services already has an active, overlapping eligibility period** → `409 Conflict`, naming the conflicting service(s) and contract.
- **Postconditions:** One contract may cover several services; a customer may hold overlapping contracts only where eligibility does not overlap.
- **Events Triggered:** Candidate contract-created/cancelled events; per-booking cancellation events for affected future reservations.

---

### **UC-100: System Expires Unresolved Guest Requests at Session Start**

- **Actor:** System
- **Preconditions:** A session has started and contains `PENDING_APPROVAL` guest reservations.
- **Trigger:** Same time-based check as UC-081's generation job and UC-092's waitlist cleanup.
- **Main Flow:** System cancels each unresolved guest reservation and attendee rows. Does not promote a waitlist after the class begins.
- **Alternative Flows:**
  - **A1: No `PENDING_APPROVAL` guest reservations exist** → No-op.
- **Postconditions:** No unapproved guest seat persists into attendance.
- **Events Triggered:** `ClassSessionBookingCancelled` as applicable.

---

### **UC-101: Staff Closes a Session With Individual Attendance and Optional Manual Charge Record**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /class-sessions/:id/close`
- **Preconditions:** Session has ended and is `AWAITING_ATTENDANCE`.
- **Trigger:** Staff opens the session's roster after `endTime` has passed.
- **Main Flow:**
  1. Roster defaults every attendee to `PRESENT`; staff flags individual `NO_SHOW` exceptions.
  2. For a payable reservation, staff records an append-only manual charge record (amount, method, outcome). Contract and approved-free-trial reservations don't require one.
  3. System closes attendee rows and parent reservations atomically, marks the session `CLOSED`.
  4. Eligible attendance publishes `ClassSessionBookingCompleted`; a no-show attendee publishes `ClassSessionBookingNoShow` instead, earning no points.
- **Alternative Flows:**
  - **A1: Session already `CLOSED`** → `409 Conflict`.
  - **A2: Attempted before `endTime` has passed** → `422 Unprocessable`.
- **Postconditions:** Attendance never inferred by a timer. A session at end time stays visibly `AWAITING_ATTENDANCE` until this action occurs.
- **Events Triggered:** `ClassSessionBookingCompleted` per eligible attendee; `ClassSessionBookingNoShow` per no-show.

---

### **UC-102: Customer Reschedules a Skipped Fixed-Class Occurrence to a Replacement Slot**

- **Actor:** Customer
- **Endpoint:** `POST /recurring-enrollments/:id/occurrences/:sessionId/reschedule`
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`; tenant has `classAllowsReschedule = true`; the skipped occurrence is within `classRescheduleWindowDays`; if `classMaxReschedulesPerCycle` is set, not already used for the current cycle.
- **Trigger:** Immediately after skipping an occurrence (UC-094), customer chooses "Reagendar" instead of a plain skip.
- **Main Flow:**
  1. System lists available sessions of the same service within the reschedule window, grouped by day, with remaining capacity.
  2. Customer picks a replacement session.
  3. System atomically checks capacity on the replacement and creates a new one-off booking (`seriesId = null`, `rescheduledFromId` = the skipped occurrence's booking).
  4. The original occurrence's booking is cancelled in the same transaction.
- **Alternative Flows:**
  - **A1: Replacement fills between page load and submit (race)** → Falls through to waitlist on the replacement; original is still cancelled.
  - **A2: `classMaxReschedulesPerCycle` already reached** → Reschedule option not offered; customer can still plain-skip (UC-094).
  - **A3: Customer lets the reschedule window lapse** → No further system-initiated action; original stays skipped, without a make-up.
- **Postconditions:** Original occurrence cancelled; one new one-off booking exists, linked via `rescheduledFromId`.
- **Events Triggered:** `ClassSessionBookingCancelled` (original) and `ClassSessionBookingConfirmed`/`Waitlisted` (replacement) — no new event type.

---

### **UC-103: Staff/Manager Views Enrollments for a Class Type**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `GET /class-schedule-templates/:serviceId/enrollments?status=&type=`
- **Preconditions:** Service has `bookingModel = SESSION`.
- **Trigger:** Staff opens "Matrículas" for a class type.
- **Main Flow:**
  1. System lists `RecurringEnrollment`s and one-off `ClassSessionBooking`s for the class type, grouped into tabs: active series, one-off/drop-in, waitlist, history.
  2. Staff can cancel an enrollment/booking inline, or manually promote a waitlisted entry (UC-091's mechanism, staff-triggered).
- **Alternative Flows:**
  - **A1: No enrollments exist yet** → Empty state per tab.
- **Postconditions:** None for the list itself; inline actions trigger their underlying UC's postconditions/events.
- **Events Triggered:** None directly.

---

### **UC-104: Staff Manually Creates an Enrollment on a Customer's Behalf**

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /class-session-bookings` / `POST /recurring-enrollments` with `createdByStaff: true`
- **Preconditions:** Customer exists and is eligible through a qualifying contract or the service's pay-per-class policy. Staff cannot bypass the same eligibility/capacity checks self-service applies.
- **Trigger:** Staff creates a booking or enrollment on behalf of a customer (e.g. a phone request).
- **Main Flow:**
  1. Staff selects the customer, the class type, and either a specific session (one-off) or a recurring pattern (standing enrollment, contract-only).
  2. System creates the booking/enrollment exactly as the customer-initiated path would, tagged `createdByStaff = true`.
- **Alternative Flows:** Same as UC-086/093 (capacity fills → waitlist, etc.), plus:
  - **A1: Staff selects a customer with no qualifying contract, and the service doesn't permit pay-per-class** → `409 Conflict`; staff directed to arrange a contract or enable pay-per-class first.
  - **A2: The customer's own self-service action creates a competing booking/enrollment concurrently (race)** → Same atomic re-check as UC-086 A1 resolves it.
- **Postconditions:** Same as UC-086/093.
- **Events Triggered:** Same as UC-086/093.

---

### **UC-105: Customer Edits a Group Reservation's Attendees**

- **Actor:** Authenticated booking customer
- **Endpoint:** `PATCH /class-session-bookings/:id/attendees`
- **Preconditions:** The customer's own SESSION booking has named attendees, is before its service cutoff, and has >= 1 attendee remaining after the requested removal.
- **Trigger:** Customer opens their eligible group class reservation and selects "Editar participantes."
- **Main Flow:**
  1. Customer selects one or more named attendees to remove.
  2. System records the removal actor, time, and reason.
  3. System atomically reduces `quantity` and the quoted total, releasing freed seats.
  4. System starts normal waitlist-offer promotion (UC-091) for the released seats.
- **Alternative Flows:**
  - **A1: Adding/replacing attendees, changing an anonymous guest group, or partially changing APPOINTMENT attendees** → Deferred; not supported.
  - **A2: Would leave zero attendees** → `422 Unprocessable`.
  - **A3: Past the service cutoff** → `422 Unprocessable`.
- **Postconditions:** `quantity`/quote/attendee rows updated atomically; a `booking_quote_revisions` row records the price change.
- **Events Triggered:** None new beyond the resulting waitlist-promotion events.

---

### **UC-106: System Expires a Waitlist Offer**

- **Actor:** System
- **Preconditions:** A `ClassSessionBooking` is `PROMOTION_PENDING` past its `offerExpiresAt`, or the session has started with an unresolved offer.
- **Trigger:** An idempotent worker checks offer deadlines (same shape as UC-081's generation job) and always at session start.
- **Main Flow:** System releases the held capacity, transitions the booking to `CANCELLED` with `cancellationReason = WAITLIST_OFFER_EXPIRED`(or `_AT_START`), notifies the customer, and promotes the next fitting waitlist entry where time remains (UC-091).
- **Alternative Flows:**
  - **A1: No `PROMOTION_PENDING` offers past deadline** → No-op.
- **Postconditions:** No expired offer holds capacity indefinitely.
- **Events Triggered:** `ClassSessionBookingCancelled`, then `WaitlistPromoted` if a next entry fits.

---

### **UC-107: Staff Records a Manually Reported Charge at Session Close-Out**

> Elaborates the manual operational record inside UC-101 step 2 — not payment processing.

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /class-session-bookings/:id/payment`, `POST /class-session-bookings/:id/payment/:paymentId/reverse`
- **Preconditions:** A payable guest or pay-per-class customer attended the session; any charge happened outside Ikaro.
- **Trigger:** Staff closes the class roster and sees a payable attendee reservation.
- **Main Flow:**
  1. Staff records the externally reported amount, method, outcome (`PAID`/`UNPAID`/`WAIVED`), collector, and time.
  2. If a correction is needed, staff never overwrites the original — system creates an audited reversal/correction entry instead.
- **Alternative Flows:**
  - **A1: A contract or solo free-trial reservation** → No payment-due action.
  - **A2: A duplicate collection attempt** → Blocked unless it's an explicit reversal/correction.
- **Postconditions:** Attendance and the minimal operational charge record are independently auditable. Payment processing, invoicing, and reconciliation remain out of scope.
- **Events Triggered:** `InPersonPaymentRecorded` / `InPersonPaymentReversed`.

---

## Authentication & User Management Use Cases

> **Note:** UC-014 and UC-015 have been consolidated into UC-021 and UC-022 to support multi-tenancy.
> See UC-021 and UC-022 below for the current, canonical authentication use cases.

---

## Loyalty & Analytics Use Cases

### **UC-016: View Customer Loyalty Metrics**

- **Actor:** Authenticated Customer (own metrics) **or** Admin/Staff (viewing any customer in their tenant via dedicated endpoints)
- **Preconditions:** Customer exists in the tenant. They may or may not have completed bookings yet.
- **Trigger:** Customer clicks "My Loyalty" or Admin opens a customer's profile
- **Main Flow (Customer — own data):**
  1. System reads `loyalty_balances.current_points` for the customer — O(1), no SUM needed (balance is maintained atomically by M10-S04 and M10-S08).
  2. System queries `loyalty_entries` to find the next expiry: `MIN(expires_at) WHERE expires_at > now()` and the sum of points expiring on that date.
  3. System returns `{ currentPoints, nextExpiryDate, nextExpiryPoints, conversionRate }` — `conversionRate` is the tenant's live `settings.loyalty.pointsPerCurrencyUnit` (`M13-S12`), read directly from `RequestContext.settings` at the source, never recomputed/cached at the BFF. Drives the "N pts = R$1" conversion hint shown on every loyalty screen.
  4. System separately returns paginated `loyalty_entries` (earning history) with `isActive` flag (`expiresAt > now()`). Service names are resolved via `ILoyaltyBookingPort`.
  5. System separately returns paginated `loyalty_redemptions` (redemption history).

- **Main Flow (Admin/Staff — any customer):**
  Same data shape and queries as the customer flow, but the `customerId` comes from the URL path (`/customers/:customerId/loyalty/*`) instead of the JWT. Admin can view any customer in their tenant.

- **Alternative Flows:**
  - **A1: No completed bookings yet** → Balance endpoint returns `{ currentPoints: 0, nextExpiryDate: null, nextExpiryPoints: null }`. Entries and redemptions endpoints return empty paginated lists.
  - **A2: Customer not found** → `404` (admin variant only — customerId path param does not exist in tenant).

- **Postconditions:** User sees current active-points view. No state changes.
- **Events Triggered:** None (read operation).
- **Out of scope (MVP):** No tier labels (BRONZE/SILVER/GOLD), no per-service breakdown (deferred to M13 dashboard). Gifts and rewards are offered by the admin outside the system.

> **Undocumented endpoint found via `/docs-audit` (2026-08-04):** `POST /v1/loyalty/redeem` (`apps/bff/src/features/loyalty/loyalty.controller.ts`, `@Roles('MANAGER', 'STAFF')`, body `{ customerId, pointsToRedeem, notes?, bookingId? }`) is fully implemented but has no corresponding UC — this contradicted the "no manual admin point adjustments" out-of-scope line above, which has been removed since the feature evidently exists. **Do not treat this note as the UC** — write a real `UC-032` (or next available number) covering this flow's actual preconditions/main flow/alt flows before citing it in a story.

---

### **UC-016b: Weekly Loyalty Expiry Warning**

- **Actor:** System (GCP Cloud Scheduler)
- **Preconditions:** At least one tenant has customers with `LoyaltyEntry` rows whose `expires_at` falls within the warning window.
- **Trigger:** GCP Cloud Scheduler publishes to the `ikaro-cron-loyalty-expiry-warning` Pub/Sub topic once a week (Mondays 06:00 UTC); the push subscription dispatches to `NotifyExpiringPointsTriggerHandler`, which calls `NotifyExpiringPointsJob.run()` (M17-S03 — local dev: `POST /cron/loyalty-expiry-warning` publishes the same trigger).
- **Main Flow:**
  1. Job fetches all `LoyaltyEntry` rows where `expires_at BETWEEN now() AND now() + expiryWarningDays` across all tenants in a single query (all-tenant pass, same pattern as the daily expiry job).
  2. Groups entries by `(tenant_id, customer_id)`.
  3. For each group: computes `pointsExpiringSoon` (sum of `points`) and `earliestExpiresAt` (minimum `expires_at`).
  4. Publishes one `PointsExpiringSoon` event per customer.
  5. Notification context consumer receives the event, looks up the customer email via `INotificationCustomerPort`, and sends the warning email using the `points-expiring-soon` template.
  6. `NotifyExpiringPointsJob.run()` returns `{ customersNotified: N }` internally (used for logging); the `POST /cron/loyalty-expiry-warning` HTTP response itself is just `{ ok: true }` once the trigger is published — it does not wait for the job to finish.

- **Alternative Flows:**
  - **A1: No expiring entries found** → `NotifyExpiringPointsJob.run()` returns `{ customersNotified: 0 }` internally; no events published. The HTTP response (when triggered via `POST /cron/loyalty-expiry-warning`) is unaffected — still `{ ok: true }`, since it responds once the trigger is published, not once the job finishes.
  - **A2: Customer not found in Notification context** → Consumer skips silently (logs a warning). Idempotency log is not written.
  - **A3: Duplicate delivery (handler called twice)** → Consumer checks `notification_logs` by `eventId`; second call is a no-op.

- **Postconditions:** One warning email sent per customer with expiring points. No DB rows written by the cron itself (state-free read + publish).
- **Events Triggered:** `PointsExpiringSoon` (one per affected customer per tenant).
- **Config key:** `settings.loyalty.expiryWarningDays` (integer, default 7, range 1–90, must be less than `expiryDays`).
- **Out of scope (MVP):** No per-service breakdown in the email. No opt-out mechanism.

---

### **UC-017: Admin Views Booking Analytics (Future)**

- **Actor:** Staff/Admin
- **Preconditions:** Admin is authenticated
- **Trigger:** Admin clicks "Reports" or "Analytics" (future feature)
- **Main Flow:**
  1. System displays:
     - Total bookings this month
     - Completion rate (completed / total)
     - Cancellation rate
     - Top services
     - Repeat customers
     - Revenue trends
  2. Admin can filter by date range
  3. Admin can export report (PDF, CSV)

- **Alternative Flows:**
  - None for MVP (stub for future)

- **Postconditions:** Admin views analytics
- **Events Triggered:** None

---

## Chatbot Use Cases

Promoted from `docs/discovery/CHATBOT/CHATBOT.md` (discovery doc kept as the permanent design rationale — not superseded by these entries). Folds into the Platform context, not a new bounded context (`docs/05-BOUNDED_CONTEXTS.md`). MVP scope boundary: informational-only — the bot never confirms/creates/modifies a booking, never quotes a binding price as a commitment, never accesses any customer/staff/booking record.

### **UC-033: Guest Asks Chatbot a Question**

- **Actor:** Guest (unauthenticated public hotsite visitor)
- **Preconditions:** Tenant's hotsite has a `CHATBOT` module with `enabled: true` in its published layout. UC-034's pre-flight availability check has already returned `available: true` for this tenant — the widget is never rendered otherwise.
- **Trigger:** Guest types a message into the chat widget (`bubble` or `inline` variant) and submits it.
- **Main Flow:**
   1. Widget `POST`s the message to `POST /public/platform/chatbot/messages` (BFF, public, `X-Tenant-Slug` header) with `{ sessionId?, message }`. First message of a session omits `sessionId`.
   2. If `sessionId` is omitted: backend enforces the volume caps (`COUNT`-based, against `chatbot_sessions`) — `maxConversationsPerDay` (30, per tenant), `maxConversationsPerIpPerDay` (5, per tenant+IP), `maxConcurrentConversations` (5, per tenant, live-ness proxy `last_message_at > now() - interval '2 minutes'`) — then creates a new `chatbot_sessions` row and returns a new `sessionId` for the widget to hold in `sessionStorage`.
   3. If `sessionId` is present: backend enforces `maxMessagesPerConversation` (20 = 10 exchanges, `COUNT` of all `chatbot_messages` rows for that session, both roles).
   4. BFF validates `message.length <= maxMessageLengthChars` (1000, tenant-overridable) — a DTO-level check, before the request reaches the backend or the LLM.
   5. BFF assembles the system prompt (`chatbot.mapper.ts`'s `buildSystemPrompt()`): live services/prices from Booking context (`BackendHttpService.getForPublic('/services', tenantId)` — the same call the `SERVICE_LIST` module already makes), business info + `settings.chatbot.knowledgeText` from Platform tenant settings (via `CachingTenantRepository`, not a fresh query per message), and the hardcoded `buildAssistantRules(locale)` guardrail section — never sourced from tenant data, never admin-editable.
   6. BFF truncates history to the last `maxHistoryMessagesSentToLlm` (10 = last 5 exchanges) messages from `chatbot_messages` and forwards `{ systemPrompt, sessionId, history, userMessage }` to backend's Platform "send chat message" use case.
   7. Backend resolves the tenant's LLM provider (`tenant.settings.chatbot?.llmProvider ?? process.env.CHATBOT_LLM_PROVIDER`) via a provider registry, calls `ILlmProvider.complete()` with `maxOutputTokensPerResponse` (300) as a hard ceiling.
   8. Backend persists both the user message and the assistant's reply as two `chatbot_messages` rows (`role USER`/`ASSISTANT`, `input_tokens`/`output_tokens`/`model_id` from the adapter's result), updates `chatbot_sessions.last_message_at`/`message_count`.
   9. Backend returns the reply; BFF forwards `{ sessionId, reply }` to the widget, which renders it as a chat bubble.

- **Alternative Flows:**
   - **A1: Daily/per-IP/concurrency cap exceeded on session creation** → `429`, specific cap-exceeded error code; widget shows the interrupted state — input disables, tenant's phone/WhatsApp offered as a fallback contact.
   - **A2: `maxMessagesPerConversation` reached mid-conversation** → same interrupted-state behavior as A1, distinct error code.
   - **A3: `message.length > maxMessageLengthChars`** → `400`, rejected before reaching the backend or the LLM; inline validation message, input stays enabled (not conversation-ending).
   - **A4: LLM provider call fails mid-conversation** (timeout, `insufficient credits`, upstream error) after being healthy at the last pre-flight check → interrupted state, generic "assistant unavailable" message, phone/WhatsApp fallback offered.
   - **A5: Visitor attempts prompt injection** (e.g. "ignore your instructions," a fake-authority booking-confirmation attempt) → the hardcoded guardrail section causes the model to refuse/redirect; empirically validated 7/7 in `docs/discovery/CHATBOT/eval/` (2026-08-07). This is a model-behavior outcome, not a server-side detection branch — the bot has zero tools/write access (§2 scope boundary), so even an unlikely successful jailbreak has nothing to execute.
   - **A6: Platform-wide daily spend circuit breaker or provider balance floor already tripped** → new session creation refused for every tenant simultaneously, `429` (same status as A1 — decided during M19-S05 story-discovery, 2026-08-12). Normally caught earlier at UC-034's pre-flight check; listed here too since the breaker could trip between one visitor's session-start and the next visitor's. **New-session creation only** — an already-open conversation is exempt, per `CHATBOT.md` §8.9: "already-open conversations remain bounded by their own per-session caps regardless" (clarified after a PR #360 review finding that an earlier implementation misread this alternative flow as also blocking existing sessions).

- **Postconditions:** One or more `chatbot_messages` rows persisted per exchange; `chatbot_sessions.message_count`/`last_message_at` updated. No booking, customer, or staff record is ever read or written.
- **Events Triggered:** None — no other bounded context needs to react synchronously to a chat message (`docs/03-DOMAIN_EVENTS.md` deliberately unchanged by this feature).
- **Out of scope (MVP):** availability-aware answers (reading live schedule data), booking actions from chat, multi-turn memory across sessions (visitor is anonymous).

---

### **UC-034: Guest Checks Chatbot Availability**

- **Actor:** Guest
- **Preconditions:** None — this is the widget's own mount-time check, run before any message can be sent.
- **Trigger:** Chat widget mounts on the hotsite page (its `CHATBOT` module is `enabled: true` on the cached manifest).
- **Main Flow:**
   1. Widget calls `GET /public/platform/chatbot/status` (BFF, public, `X-Tenant-Slug` header) — always fresh, never cached (unlike the manifest's 5-minute cache), since availability depends on live state.
   2. Backend evaluates, for this tenant, whether any of five conditions is currently true: (a) tenant's daily cap already exhausted, (b) tenant's concurrency cap already exhausted, (c) the resolved LLM provider (`tenant override ?? platform default`) failing a health check, (d) the platform-wide daily spend circuit breaker already tripped, (e) the resolved provider's balance floor already tripped (reads the periodically-polled `chatbot_provider_balance` row — no live external call in this hot path).
   3. Backend returns `{ available: boolean }`.
   4. Widget renders the bubble/inline widget only if `available: true`; renders nothing at all otherwise — a visitor never sees a chat button that then fails when clicked.

- **Alternative Flows:**
   - **A1: `CHATBOT` module `enabled: false` on the manifest** → handled entirely client-side by the existing generic module-render filter (`buildHotsiteModuleRenderPlan()`, `apps/web/features/platform/hotsite/page-model.ts`) — this status check is never even called, since the module isn't rendered at all.
- **Postconditions:** None (pure read).
- **Events Triggered:** None.

---

### **UC-035: System Purges Expired Chatbot Conversations**

- **Actor:** System (GCP Cloud Scheduler)
- **Preconditions:** `chatbot_messages`/`chatbot_sessions` rows exist older than the retention window.
- **Trigger:** GCP Cloud Scheduler publishes to a `ikaro-cron-chatbot-retention-purge` Pub/Sub topic daily; the push subscription dispatches to the retention-purge trigger handler (local dev: `POST /cron/chatbot-retention-purge` publishes the same trigger — mirrors UC-016b's cron pattern).
- **Main Flow:**
   1. Job deletes every `chatbot_messages` row where `created_at < now() - interval '180 days'`, across all tenants in one pass.
   2. Job deletes every `chatbot_sessions` row whose `started_at < now() - interval '180 days'` **and** that now has zero remaining `chatbot_messages` rows (avoids orphaning a session record with no messages left).
   3. Job logs `{ messagesDeleted, sessionsDeleted }`.
- **Alternative Flows:**
   - **A1: No rows past the retention window** → no-op, logs `{ messagesDeleted: 0, sessionsDeleted: 0 }`.
- **Postconditions:** No `chatbot_messages`/`chatbot_sessions` row older than 180 days remains for any tenant.
- **Events Triggered:** None.
- **Config key:** retention window is a code constant (180 days) — not a tenant-editable setting.
- **Out of scope (MVP):** partial truncation (keeping token counts while dropping `content`) — full row deletion only.

---

### **UC-036: System Polls LLM Provider Balance**

- **Actor:** System (GCP Cloud Scheduler)
- **Preconditions:** At least one LLM provider adapter with a prepaid-balance concept is configured (OpenRouter, for MVP — Anthropic/OpenAI billing don't have the same prepaid-balance concept and are out of scope for this specific check).
- **Trigger:** GCP Cloud Scheduler publishes to a `ikaro-cron-chatbot-balance-poll` Pub/Sub topic every 15–30 minutes; the push subscription dispatches to the balance-poll trigger handler (local dev: `POST /cron/chatbot-balance-poll` publishes the same trigger).
- **Main Flow:**
   1. Job calls OpenRouter's account API (`GET /api/v1/credits`) using the platform's own API key.
   2. Job upserts the result into `chatbot_provider_balance` (`provider = 'openrouter'`, `remaining_usd`, `checked_at = now()`) — one row per provider, not appended.
   3. UC-034's pre-flight status check reads this stored value on every widget mount — no external call in that hot path.
- **Alternative Flows:**
   - **A1: OpenRouter's account API call fails/times out** → job logs a warning and leaves the existing `chatbot_provider_balance` row unchanged; the last known value keeps being served until the next successful poll (a stale reading in either direction costs a few extra minutes, not a correctness problem at this cost scale).
- **Postconditions:** `chatbot_provider_balance` row for `openrouter` reflects the balance as of the last successful poll.
- **Events Triggered:** None.
- **Config key:** poll interval is deploy-time Cloud Scheduler config, not a tenant setting; `CHATBOT_MIN_PROVIDER_BALANCE_USD = 2` is the threshold UC-034 compares against.

---

## Lead Form Use Cases

Promoted from `docs/discovery/lead-form-module/lead-form-module.md` (M20). A new `LEAD_FORM` hotsite module lets a manager configure up to 20 custom questions which guests and/or logged-in customers answer on a dedicated page — a genuine lead-capture tool (name/email/phone mandatory on every submission), protected by Cloudflare Turnstile + per-IP/per-tenant rate limits. Full domain/data-model rationale: the discovery doc (kept as the permanent *why*, not archived).

### **UC-037: Manager Configures the Lead Form Module**

- **Actor:** Staff member with `MANAGER` role
- **Preconditions:** Manager is authenticated and on the hotsite editor (`/dashboard/hotsite`).
- **Trigger:** Manager opens the `LEAD_FORM` module's config panel (adds it to the layout, or edits an existing one).
- **Main Flow:**
   1. Manager toggles the module `enabled` flag — same inline toggle every other module's Layout-tab row already has, via the existing `PATCH /v1/tenants/hotsite`, not part of this UC's own save action (step 5).
   2. Manager opens the drill-down config panel and sets teaser copy (title, subtitle, CTA label).
   3. Manager sets `audienceMode`: "Visitantes e clientes" (`GUEST_AND_CUSTOMER`) or "Somente clientes logados" (`CUSTOMER_ONLY`).
   4. Manager adds a question inline, on the same page (expandable card — never a separate screen per question): picks a type (free text / single-choice / multiple-choice), types a label, marks required or not, and — for choice types — adds 2–10 options. A small constants-file catalog of starter question templates (e.g. "Qual serviço te interessa?") is offered as a starting point; every question stays freely editable.
   5. Manager repeats step 4 up to 20 questions, reordering as needed.
   6. Manager clicks "Aplicar" once — commits the complete edit (teaser + `audienceMode` + `questions`) to the hotsite editor's own temporary local draft, no network request yet (same "Aplicar defers to Publicar" contract every other module panel uses). Manager clicks "Publicar" — `PATCH /v1/tenants/hotsite`, a single request carrying the whole editor draft plus `audienceMode`/`questions` as two extra fields (folded into this generic endpoint at M20-S08), saved atomically in one backend transaction (spanning `HotsiteConfig`'s layout entry and `LeadFormConfig` — see `docs/02-DOMAIN_MODEL.md` § `LeadFormConfig` "Cross-aggregate save"). Not two independent REST calls — an earlier draft of this design had the teaser save and the audience/questions save as two separate, unsynchronized requests, which could leave the manager's edit half-applied on a partial failure; that design was replaced.
- **Alternative Flows:**
   - **A1: 20-question cap reached** → "Adicionar pergunta" disabled with an inline note; existing questions can still be edited/removed. `400 PLATFORM_LEAD_FORM_QUESTION_LIMIT_REACHED` if bypassed client-side.
   - **A2: Choice-type question with < 2 or > 10 options** → blocked on save: "Adicione entre 2 e 10 opções." `400 PLATFORM_LEAD_FORM_QUESTION_OPTIONS_INVALID`.
   - **A3: Empty question label** → blocked on save: "Informe o texto da pergunta." `400 GENERIC_FIELD_REQUIRED` (`field: questions[n].label` — a plain required-string check with no dedicated VO behind it, same category as `AddressErrorCode.FIELD_REQUIRED` reused across address fields).
   - **A4: Manager removes a question that already has submissions** → allowed; a confirmation dialog explains existing submissions keep their own snapshot of the question (`docs/02-DOMAIN_MODEL.md` § `LeadFormSubmission`) and won't be affected.
   - **A5: Manager disables the module entirely** → teaser stops rendering on the hotsite; `/[slug]/lead-form` checks the manifest's `layout` array for a `LEAD_FORM` module with `enabled: true` and renders the existing `<Unavailable/>` component when absent/disabled — **new logic**, not a reuse of an existing "disabled module → dedicated page unavailable" precedent (none existed prior to this milestone; verified against `apps/web/app/[slug]/booking/page.tsx`, which only checks `!manifest.isPublished`, never per-module `enabled`). Existing submissions and config are preserved, not deleted.
- **Postconditions:** `lead_form_configs` row reflects the new config; teaser section in `hotsite_configs.layout` updated.
- **Events Triggered:** none (config change, matches how other module config edits behave).

### **UC-038: Visitor Sees the Lead Form Teaser on the Hotsite**

- **Actor:** Guest | Customer
- **Preconditions:** `LEAD_FORM` module `enabled: true` in the tenant's manifest `layout`.
- **Trigger:** Visitor scrolls to the module's position in page order.
- **Main Flow:**
   1. `LeadFormModule` server component renders the teaser (title/subtitle/CTA), branded via `var(--ba-*)`, same shape as `BookingCtaModule` (`apps/web/shells/hotsite/components/BookingCtaModule.tsx`).
   2. Visitor clicks the CTA → navigates to `/[slug]/lead-form`.
- **Alternative Flows:**
   - **A1: Module `enabled: false`** → not rendered in the layout loop (filtered upstream in `buildHotsiteModuleRenderPlan`, `apps/web/features/platform/hotsite/page-model.ts`), same generic behavior as any disabled module.
- **Postconditions:** none (read-only render).
- **Events Triggered:** none.

### **UC-039: Guest Submits the Lead Form**

- **Actor:** Guest
- **Preconditions:** `audienceMode === 'GUEST_AND_CUSTOMER'`. Tenant hasn't exceeded `maxSubmissionsPerDay`. Visitor's IP hasn't exceeded `maxSubmissionsPerIpPerDay`.
- **Trigger:** Guest navigates to `/[slug]/lead-form` (directly or via the teaser CTA).
- **Main Flow:**
   1. Page fetches the live question catalog: `GET /public/platform/lead-form/:slug`.
   2. Guest fills mandatory name, email, phone, and any questions marked `required` (others optional).
   3. Guest completes the Turnstile challenge (widget auto-renders).
   4. Guest clicks "Enviar". Client sends `{ name, email, phone, answers[], turnstileToken }` to `POST /public/platform/lead-form/:slug/submissions`.
   5. Backend verifies `turnstileToken` via Cloudflare `siteverify` — as the first step of submission processing, before any other validation (moved here from the BFF in M20-S14; the BFF's `ALL_TRAFFIC` egress has no Cloud NAT, so its own outbound `siteverify` call had no route out).
   6. Backend validates required fields + `Email`/`PhoneNumber` VOs, then — before creating the row — checks `maxSubmissionsPerDay`/`maxSubmissionsPerIpPerDay` via repository count queries against `lead_form_submissions` (mirrors Chatbot's `checkNewSessionVolumeCaps`/`countByTenantAndDate`/`countByTenantIpAndDate` pattern exactly — this enforcement lives in the **backend**, not the BFF, correcting the discovery doc's original sketch).
   7. Backend creates `LeadFormSubmission`, snapshotting each answer's `{questionId, questionLabel, questionType, answerValue}`, computes `expiresAt` from the tenant's current `retentionMonths`.
   8. `LeadFormSubmissionReceived` published.
   9. Guest sees a success confirmation.
- **Alternative Flows:**
   - **A1: Turnstile challenge fails/expires** → inline error, "Verificação de segurança expirou, tente novamente"; form data preserved.
   - **A2: Rate limit exceeded (tenant-wide or per-IP)** → `429 PLATFORM_LEAD_FORM_DAILY_CAP_REACHED`, friendly message: "Muitas solicitações no momento, tente novamente mais tarde." — one code covers both layers, same grouping rationale as `CHATBOT_DAILY_CAP_REACHED`.
   - **A3: Required question left blank** → inline validation, full form re-shown with the error highlighted (never just the errored section). `400 GENERIC_FIELD_REQUIRED`.
   - **A4: Invalid email/phone format** → `400 EMAIL_FORMAT_INVALID` / `400 PHONE_FORMAT_INVALID` (reuses the existing VOs' own codes — never a bespoke code for the identical rule), same as guest booking's A1.
   - **A5: `audienceMode === 'CUSTOMER_ONLY'`** → this flow doesn't apply; see UC-040 A1.
   - **A6: Module was disabled between teaser render and page load** → "unavailable" state (see UC-037 A5), no form shown.
- **Postconditions:** `LeadFormSubmission` persisted, scoped to tenant, `customerId: null`.
- **Events Triggered:** `LeadFormSubmissionReceived` (`data.customerId: null`).

### **UC-040: Logged-In Customer Submits the Lead Form**

- **Actor:** Customer
- **Preconditions:** Customer authenticated (JWT `role: CUSTOMER`). Same rate-limit preconditions as UC-039.
- **Trigger:** Customer navigates to `/[slug]/lead-form`.
- **Main Flow:**
   1. Same as UC-039 steps 1–2, except name/email/phone are **pre-filled from the `Customer` profile** (editable) — visible autofill, not a hidden field.
   2. Turnstile + submit, same as UC-039 steps 3–8.
   3. Backend sets `customerId` on the submission from the JWT `sub`.
- **Alternative Flows:**
   - **A1: `audienceMode === 'CUSTOMER_ONLY'` and visitor is NOT authenticated** → redirected to a login-required gate screen (`plan/journey/guest/prototypes/lead-form/`, newly built by this milestone — no existing canonical `plan/journey/` precedent for this gate screen existed prior) with a link into the existing customer login flow (`plan/journey/customer/prototypes/login/00-login.html`); after login, returns to `/[slug]/lead-form`. `401 AUTH_UNAUTHORIZED`.
   - **A2–A5:** same as UC-039 A1–A4.
- **Postconditions:** `LeadFormSubmission` persisted with `customerId` set.
- **Events Triggered:** `LeadFormSubmissionReceived` (`data.customerId` set).

### **UC-041: Staff/Manager Views Leads Submissions**

- **Actor:** STAFF | MANAGER
- **Preconditions:** Authenticated staff/manager session.
- **Trigger:** Clicks "Leads" in the sidebar — a top-level nav item (`MAIN_NAV_KEYS`, `apps/web/shells/dashboard/components/Sidebar.tsx`), visible to both roles when shown, own dedicated screen (not nested inside hotsite editing), mirroring how Agenda/bookings get their own screen. **Gated, not unconditional**: only rendered when `GET /v1/tenants/lead-form/status` reports `enabled: true` for this tenant (fetched server-side in the dashboard shell layout) — a tenant that has never enabled the `LEAD_FORM` module never sees this item, since it would otherwise point at a screen that's permanently empty (unlike the always-on Agenda/Loyalty items, which are core capabilities every tenant uses).
- **Main Flow:**
   1. `GET /v1/tenants/lead-form/submissions?page=&pageSize=` — paginated, ordered `submitted_at DESC`.
   2. List renders one row per submission: name, email, phone.
   3. Staff/manager optionally types a non-empty term into a **basic** search box and clicks "Aplicar" (button-driven, not live/debounced — M20-S13); `GET .../submissions?page=&pageSize=&search=` — matches partially, case-insensitively, across name, email, and any question's label/answer, OR-ed together (M20-S12).
   4. Staff/manager optionally opens **advanced filters** instead and adds one or more rows, each picking a question from a dropdown (populated by `GET .../submissions/filter-options`, which includes questions from past submissions even if since edited/removed from the live form) and typing a non-empty value to match, then clicks "Aplicar filtros"; `GET .../submissions?page=&pageSize=&filters=` — every filter row must match (AND), each scoped to its own specific question — e.g. "estado civil contém casado" AND "mora contém São Paulo" returns only submissions matching both, never a submission that merely contains both words somewhere unrelated (M20-S12/S13).
   5. Staff/manager optionally sets a **date range** ("De" / "Até"), independent of and combinable with either search mode above — `GET .../submissions?page=&pageSize=&submittedFrom=&submittedTo=`. Interpreted in the tenant's own timezone (`settings.businessHours.timezone`), both dates inclusive — "leads from Aug 1–15" (M20-S12/S13).
   6. Staff/manager clicks a row → `GET /v1/tenants/lead-form/submissions/:id` → detail view: full name/email/phone + every question label + submitted answer, in question order, plus `submittedAt` and whether the submitter was an authenticated customer or a guest (`customerId` presence, M20-S10).
- **Alternative Flows:**
   - **A1: No submissions yet** → empty state with a short explainer and a link back to the module config (if not yet enabled).
   - **A2: A submission's `answers` snapshot references a question no longer in the current config** → renders fine regardless, since the snapshot is self-contained (no live lookup needed) — this is also why the advanced filter's question dropdown includes historical, now-removed questions (A4).
   - **A3: Search/filters/date range yield no matches** → distinct empty state from A1 ("nenhum resultado para esta busca", not "nenhum envio ainda") — the module may well have real submissions, just none matching the current criteria.
   - **A4: Advanced filter's question dropdown includes a question no longer in the live `LeadFormConfig`** → selectable and searchable like any other; matches by the snapshotted `questionLabel` text, never a live lookup against the current config (see `docs/13-DATABASE_SCHEMA.md` § `platform.lead_form_answers`).
   - **A5: `submittedFrom` is after `submittedTo`** → `400`, rejected before the query runs.
   - **A6: `search` and `filters` both provided in the same request** → `400 GENERIC_VALUE_INVALID`, rejected before the query runs (they are mutually exclusive — see `docs/14-API_CONTRACTS.md`).
- **Postconditions:** none (read-only).
- **Events Triggered:** none.
- **Not implemented:** CSV export — removed from this milestone's scope entirely, not merely deferred behind a smaller replacement. This is a real, accepted trade-off, not an oversight: `UC-043`'s daily retention purge is unconditional and permanent (no export, no backup, no bulk-download path exists before a submission is deleted at the end of its retention window). A manager who wants to preserve lead data long-term today has only the read-only detail view, one submission at a time.

### **UC-042: Manager Configures Lead Form Settings**

- **Actor:** Staff member with `MANAGER` role
- **Preconditions:** Manager on the tenant settings page (`/dashboard/settings`, UC-026 pattern).
- **Trigger:** Manager edits any field in the "Formulário de contato" settings section.
- **Main Flow:**
   1. Manager sets "Retenção de leads" — 1–24 months (default shown: 6).
   2. Manager optionally sets "Limite de envios por dia" — 1–1000 (default shown: 100) — a tenant-wide daily cap, abuse protection, not cost protection (this platform incurs no per-submission cost, unlike Chatbot's LLM-call caps, so there's no reason to keep this Ikaro-only).
   3. Manager optionally sets "Limite por visitante por dia" — 1–100 (default shown: 3) — raise this if legitimate visitors are being falsely blocked (e.g. a tenant with heavy mobile traffic behind carrier-shared IPs).
   4. `PATCH /v1/tenants/settings` (existing endpoint, extended with `leadForm.retentionMonths`/`leadForm.maxSubmissionsPerDay`/`leadForm.maxSubmissionsPerIpPerDay` — any subset, partial update).
   5. Each field validated against its own bound by `LeadFormSettingsValidator` (mirrors `BookingSettingsValidator`'s per-field dedicated-code pattern); persisted.
- **Alternative Flows:**
   - **A1: `retentionMonths` outside 1–24** → `400 PLATFORM_SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID`.
   - **A2: `maxSubmissionsPerDay` outside 1–1000** → `400 PLATFORM_SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_DAY_INVALID`.
   - **A3: `maxSubmissionsPerIpPerDay` outside 1–100** → `400 PLATFORM_SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_IP_PER_DAY_INVALID`.
- **Postconditions:** `settings.leadForm.{retentionMonths,maxSubmissionsPerDay,maxSubmissionsPerIpPerDay}` updated (whichever were included). `retentionMonths` affects only **future** submissions' `expiresAt` — already-stored submissions keep the `expiresAt` computed at their own insert time. The two caps take effect on the *next* submission attempt after saving — no retroactive effect on already-accepted submissions.
- **Events Triggered:** none.

### **UC-043: System Purges Expired Lead Form Submissions**

- **Actor:** System (Cloud Scheduler cron)
- **Preconditions:** none — runs daily regardless of tenant activity.
- **Trigger:** GCP Cloud Scheduler → `ikaro-cron-lead-form-retention` Pub/Sub topic (mirrors `ikaro-cron-loyalty-expiry`), daily.
- **Main Flow:**
   1. Handler deletes every `lead_form_submissions` row where `expires_at < now()`, a cross-tenant scan using the standalone `(expires_at)` index (not the `(tenant_id, expires_at)` composite, which this unscoped query can't seek).
   2. `POST /cron/lead-form-retention` provides the same trigger locally/manually (M17-S03 precedent).
- **Alternative Flows:**
   - **A1: No expired rows** → no-op, idempotent.
- **Postconditions:** expired submissions permanently removed.
- **Events Triggered:** none (matches `ExpirePointsJob`'s own "no event on expiry" precedent).

---

## Admin Reminders & Notifications

### **UC-018: Admin Receives Daily Schedule Reminder**

> **Cron scheduling note (applies to UC-018, UC-019, UC-020):** A single global cron fires every 30 minutes. On each fire it queries `tenants` for records whose current local time (UTC offset from `settings.businessHours.timezone`) equals 06:00. Only those tenants are processed. This ensures "6 AM tenant-local" without per-tenant scheduled jobs.

- **Actor:** System (scheduled job) & Staff/Admin
- **Preconditions:** Admin has active account and bookings for today
- **Trigger:** System cron job runs at 6 AM tenant-local time
- **Main Flow:**
  1. System queries all APPROVED bookings for today
  2. System fetches customer details, service details
  3. System sends email to admin with:
     - List of customers arriving today
     - Service each customer booked
     - Appointment times
     - Customer phone (for contact)
     - Any notes from booking
  4. Admin receives email at 6 AM
  5. Admin can review day's schedule

- **Alternative Flows:**
  - **A1: No bookings today** → System sends: "You have no bookings scheduled for today"
  - **A2: Multiple staff members** → Each active staff member receives email (future: per-staff scheduling)

- **Postconditions:** Admin informed about today's bookings
- **Events Triggered:** `AdminDailyScheduleReminder`

---

### **UC-019: Customer Receives Booking Reminder (Day Before)**

- **Actor:** System (scheduled job) & Customer
- **Preconditions:** Booking is APPROVED and appointment is tomorrow
- **Trigger:** System cron job runs at 6 AM
- **Main Flow:**
  1. System queries all APPROVED bookings scheduled for tomorrow
  2. For each booking:
     - If guest (not authenticated): send email to guest email
     - If customer (authenticated): send email to customer email
  3. Email contains:
     - Service name & details
     - Appointment date & time
     - Location
     - Any preparation instructions
  4. Customer/guest receives reminder email

- **Alternative Flows:**
  - **A1: Customer cancelled** → Skip (booking not APPROVED)
  - **A2: Multiple reminders** → Only one reminder per booking (check history)

- **Postconditions:** Customer reminded of upcoming appointment
- **Events Triggered:** `BookingReminderDue` (emitted by cron; Notification Context sends the email)

---

### **UC-020: Customer Receives Booking Reminder (Day Of)**

- **Actor:** System (scheduled job) & Customer
- **Preconditions:** Booking is APPROVED and appointment is today
- **Trigger:** System cron job runs at 6 AM
- **Main Flow:**
  1. System queries all APPROVED bookings scheduled for today
  2. For each booking:
     - If guest (not authenticated): send email to guest email
     - If customer (authenticated): send email to customer email
  3. Email contains:
     - Service name
     - Appointment time (e.g., "Your appointment is at 10:00 AM")
     - Location
     - Reminder to arrive on time
  4. Customer/guest receives reminder email

- **Alternative Flows:**
  - **A1: Customer cancelled** → Skip (booking not APPROVED)

- **Postconditions:** Customer reminded of appointment today
- **Events Triggered:** `BookingReminderDueToday` (emitted by cron; Notification Context sends the email)

---

## Authentication & Login

### **UC-021: Customer Login**

- **Actor:** Customer (unauthenticated)
- **Preconditions:** Customer has Google account.
- **Trigger:** Customer clicks "Entrar" on a specific tenant's hotsite (the OAuth flow always carries that tenant's slug)
- **Main Flow:**
  1. System redirects to Google OAuth, with the tenant slug encoded in the OAuth state
  2. Customer logs in with Google account
  3. Google returns: googleOAuthId, email, name
  4. System finds or creates a Customer record scoped to that tenant (`handleTenantLogin` → `POST /internal/customers`)
  5. Session created for that tenant; customer redirected to the tenant's hotsite (`/{slug}`), now in logged-in state

- **Alternative Flows:**
  - **A1: No existing bookings in this tenant** → Customer can choose any service to start booking
  - **A2: First time customer** → System creates the Customer record in this tenant (main flow step 4)
  - **A3: Customer's profile has no phone number** → After landing on the tenant's hotsite (main flow step 5), an inline, non-dismissible "Complete seu perfil" prompt collects `phone`. Submits via `PATCH /customers/me`. Once set, this step is skipped on all future logins. (Unblocks UC-002's phone precondition — see UC-002 A11.) Implemented in `M13-S14`.

- **Postconditions:** Customer logged in to one tenant. Session scoped to that tenant.
- **Events Triggered:** None (read operation)

> **Descoped — Case B, multi-tenant selection at login (decided 2026-06-24, `M13-S14` discovery session):** an earlier design considered a tenant-selection screen (`/select-tenant`) for a customer logging in via a generic, tenant-agnostic entry point not tied to any specific hotsite — analogous to staff's `/select-staff-tenant`. No such entry point exists in this product: every customer login starts from a specific tenant's hotsite, which always supplies the tenant slug directly (main flow step 1), so the BFF's multi-tenant OAuth branch (`handleMultiTenantLogin`'s 2+-tenant case, `POST /auth/token`) is unreachable from any shipped UI and was removed. **Multi-tenant customers are still fully supported** (see invariant 5 in `CLAUDE.md` §2) — they simply log into whichever tenant's hotsite they started from, then use UC-023 below to move between tenants they already belong to. If a tenant-agnostic entry point is ever built, login-time selection should be redesigned then against real requirements, not resurrected from this draft.

---

### **UC-022: Staff Login (Single or Multi-Tenant)**

> **Updated (`M13-S13`/`M13-S15`):** staff are multi-tenant-capable, the same way customers are (`UNIQUE(tenant_id, google_oauth_id)`, not a global unique constraint — see `CLAUDE.md` §2 invariant 6). A staff member is always provisioned `is_active=true` at invite time; there is no "invite not yet accepted" `is_active=false` state to activate from. The `/auth/first-login` flow this UC previously routed into was deleted — Google-callback login either succeeds directly or redirects to `/auth/error?reason=<code>`.

- **Actor:** Staff member (unauthenticated)
- **Preconditions:** Staff has a Google account already linked to at least one active `Staff` record (via a prior accepted invite — see UC-028).
- **Trigger:** Staff clicks "Login" on `/dashboard/login` (requires `?tenantSlug=` — see UC-025's linked note on invite-link format)
- **Main Flow:**
  1. System redirects to Google OAuth
  2. Staff logs in with Google account
  3. Google returns: googleOAuthId, email, name
  4. System queries every active `Staff` record with this `google_oauth_id`
  5. **Case A: Exactly one active `Staff` record found**
     - Session created scoped to that tenant; staff redirected to `/dashboard`
  6. **Case B: 2+ active `Staff` records found (multiple tenants)**
     - System issues a short-lived selection token and redirects to `/select-staff-tenant` (an **authenticated** post-login screen — not a pre-login chooser) — see Alternative Flow A1
  7. **Case C: No matching `Staff` record found, or the matched record is `is_active=false`**
     - System redirects to `/auth/error?reason=<code>`, one of: `not-a-staff-member`, `invite-not-found`, `staff-deactivated`, `email-mismatch`, `account-linked-elsewhere`, `tenant-not-found`

- **Alternative Flows:**
  - **A1: Staff selects a tenant from `/select-staff-tenant`** → Session created scoped to the chosen tenant. This same screen/endpoint (`GET /auth/staff-tenants`, `POST /auth/switch-staff-tenant`) also supports switching tenants **after** login, not just at initial sign-in. (`GET /staff/me/tenants` is a separate, internal-only backend route — not the BFF-exposed one the client actually calls.)

- **Postconditions:** Staff logged in, session scoped to the selected tenant.
- **Events Triggered:** None (read operation)

---

### **UC-023: Customer Switches Tenant**

- **Actor:** Authenticated customer (logged in)
- **Preconditions:** Customer belongs to multiple tenants. Currently in one tenant.
- **Trigger:** Customer clicks "Trocar empresa" in `HotsiteAuthBar`'s avatar dropdown — shown only when `GET /v1/customers/tenants` returns at least one other tenant (the JWT itself carries no tenant count, just `{ sub, tenantId, tenantSlug, role }`)
- **Endpoint:** `GET /v1/customers/tenants` (list) + `POST /v1/auth/switch-tenant { targetTenantId }` (CUSTOMER)
- **Main Flow:**
  1. System shows list of other tenants customer belongs to (excluding current), via `/switch-tenant` page
  2. Customer selects: "SuperClean"
  3. Old JWT expires client-side — no active revocation (stateless JWT)
  4. BFF validates customer belongs to target tenant; issues new JWT scoped to `tenant_b`
  5. Customer redirected to SuperClean's hotsite
  6. Customer sees: SuperClean's bookings and SuperClean's loyalty (8 active points)

- **Alternative Flows:**
  - **A1: Customer has only one tenant** → "Trocar empresa" item hidden entirely (not disabled)

- **Postconditions:** Customer switched to different tenant. Session scoped to new tenant.
- **Events Triggered:** None
- Implemented in `M13-S14` (folded in from the original `M13-S30`).

---

## Platform & Tenant Management

### **UC-024: Platform Operator Provisions New Tenant (REST API)**

- **Actor:** Ikaro platform operator (developer / internal ops)
- **Preconditions:** Operator can open an IAP SSH session to the on-demand relay VM; the relay service account has backend `roles/run.invoker` and Secret Manager access to `PLATFORM_ADMIN_KEY` plus `INTERNAL_API_KEY`. No self-service signup UI exists in MVP.
- **Trigger:** A new car-wash company is signed up and needs a tenant provisioned on the platform.
- **Security:** Four independent layers (M17):
  1. **Cloud Run internal ingress** — the backend is not publicly reachable.
  2. **IAP relay VM + IAM identity** — the operator reaches the VM through IAP; its service account reaches the internal backend with `roles/run.invoker`.
  3. **`INTERNAL_API_KEY`** — global `InternalApiGuard` validates `X-Internal-Key`.
  4. **`PLATFORM_ADMIN_KEY`** — `PlatformAdminGuard` validates `X-Platform-Admin-Key`.

- **Main Flow:**
   1. Operator calls:
      ```http
      POST /internal/tenants
      X-Platform-Admin-Key: <PLATFORM_ADMIN_KEY>
      X-Internal-Key: <INTERNAL_API_KEY>
      Content-Type: application/json

      {
        "name": "AutoWash Pro",
        "slug": "autowash-pro",
        "adminEmail": "owner@autowashpro.com.br",
        "country_code": "BR",
        "timezone": "America/Sao_Paulo"
      }
      ```
   2. `InternalApiGuard` validates `X-Internal-Key`; then `PlatformAdminGuard` validates `X-Platform-Admin-Key` using `crypto.timingSafeEqual` → rejects with `401` if either key is invalid.
   3. System validates inputs: slug format (`/^[a-z0-9-]+$/`), slug uniqueness, email format, supported two-letter ISO `country_code`, and IANA timezone.
   4. System creates `platform.tenants` row with default settings.
   5. System creates `platform.hotsite_configs` row (`is_published = false`).
   6. System publishes `TenantProvisioned` event.
   7. Returns `201`:
      ```json
      { "tenantId": "uuid-v7", "name": "AutoWash Pro", "slug": "autowash-pro" }
      ```
   8. **Asynchronously** — Staff context (M04-S06) handles `TenantProvisioned` → creates first MANAGER `Staff` row (`is_active = false`) → publishes `StaffInvited`.
   9. **Asynchronously** — Notification context (M11) handles `StaffInvited` → sends invitation email to `adminEmail` in pt-BR.

- **Alternative Flows:**
   - **A1: Missing or invalid `X-Internal-Key` or `X-Platform-Admin-Key` header** → `401` Problem Detail
   - **A2: Slug already taken** → `409` Problem Detail: `"Slug 'autowash-pro' is already in use"`
   - **A3: Invalid slug format** → `400` Problem Detail
   - **A4: Invalid email** → `400` Problem Detail
   - **A5: Invalid `country_code` format** → `400` Problem Detail: country code must be exactly two letters
   - **A6: Unsupported `country_code`** → `400` Problem Detail: country is not supported by the platform
   - **A7: Invalid IANA timezone** → `400` Problem Detail

- **Postconditions:** `platform.tenants` + `platform.hotsite_configs` rows created. `TenantProvisioned` event published. First MANAGER staff and invitation email handled asynchronously by M04-S06 and M11.
- **Events Triggered:** `TenantProvisioned` (synchronous) → triggers `StaffInvited` (asynchronous, via M04-S06)

---

### **UC-025: Admin First Login (Accepts Invite)**

> **Updated (`M13-S13`):** a staff row is provisioned `is_active=true` at invite time (see UC-028) — it is never created inactive. "Pending" is signaled by `google_oauth_id IS NULL`, not by `is_active`. This use case only **links** a Google account to an already-active row (`LinkGoogleAccountUseCase`); it never flips `is_active`. The invite link format is `/dashboard/login?tenantSlug=<slug>` (see the anti-pattern note in `CLAUDE.md`/`docs/ANTI_PATTERNS.md` on staff hotsite login links needing `?tenantSlug=`).

- **Actor:** Invited staff member (received invitation email from UC-024 or UC-028)
- **Preconditions:** Staff row exists for the invited email with `is_active = true` and `google_oauth_id IS NULL`. Tenant is active.
- **Trigger:** Staff member clicks the invitation link in the email and authenticates with Google OAuth.
- **Main Flow:**
   1. System redirects to Google OAuth login.
   2. Staff member authenticates with Google using the invited email address.
   3. System receives Google callback with `google_oauth_id` and `email`.
   4. System finds the `staff` row by `(tenant_id, email)` where `google_oauth_id IS NULL`.
   5. System links the account: sets `google_oauth_id` on the row (`is_active` is already `true`, untouched).
   6. System creates a JWT session (`tenantId`, `tenantSlug`, `role`).
   7. System redirects to the dashboard.
   8. Staff member sees: "Bem-vindo(a)! Sua conta está pronta."

- **Alternative Flows:**
   - **A1: Google email does not match invited email** → System shows error: "Por favor, use o e-mail para o qual você foi convidado(a)."
   - **A2: Staff already linked (`google_oauth_id` already set)** → System treats as normal login (UC-022).
   - **A3: Tenant deactivated** → System shows error: "Este estabelecimento está desativado."
   - **A4: Staff row is `is_active = false` (deactivated)** → System redirects to `/auth/error?reason=staff-deactivated` — linking never reactivates a deactivated staff member (see UC-031).

- **Postconditions:** `staff.google_oauth_id` set. Staff logged in and on the dashboard.
- **Events Triggered:** None

---

### **UC-026: Admin Edits Tenant Settings**

- **Actor:** Staff member with `MANAGER` role (to save changes)
- **Preconditions:** Admin is authenticated. `GET /tenants/settings` (viewing the screen) allows `STAFF`|`MANAGER`; `PATCH /tenants/settings` (saving changes) is `MANAGER`-only — STAFF can view the settings screen but not edit it.
- **Trigger:** Admin clicks "Configurações" → "Geral" in the dashboard.
> **Scope expanded (`M13-S31`):** the shipped settings form covers substantially more than the original draft below — `booking.autoApproveEnabled` (accepted in the UI but currently inert; no booking use case reads it yet), `minBookingAdvanceHours`, `maxBookingAdvanceDays`, `slotGranularityMinutes`, `welcomeStaffScreenDays`; `loyalty.expiryWarningDays`, `enableNotifications`, `notificationMinPoints`; a full **Notificações** section (`notification.fromEmail`); read-only **Localização** (`countryCode`-driven, see `docs/21-TENANTS_SETTINGS_SCHEMA.md`); and `businessInfo.socialLinks`. See `docs/21-TENANTS_SETTINGS_SCHEMA.md` for the authoritative field list — the list below is illustrative, not exhaustive.

- **Main Flow:**
   1. System loads current `tenants.settings` JSONB and displays form with current values:
      - **Nome do estabelecimento** (edit allowed — saved via a **separate** `PATCH /tenants` call, not part of the settings PATCH, since `name`/`slug` are plain columns, not part of the `settings` JSONB)
      - **Slug** (read-only after creation — shown as info only)
      - **Janela de cancelamento** (horas) — default 48 h
      - **Validade dos pontos de fidelidade** (dias) — default 180 d
      - **Horário de funcionamento** — days of week + open/close times
      - **Fuso horário** — required; default `America/Sao_Paulo`
      - **Buffer entre agendamentos** (minutos) — prep time between bookings, default 60
      - **Endereço, telefone e e-mail do estabelecimento** — `settings.businessInfo` (M12-S06); all optional. Shown on the hotsite `CONTACT` module when its `showAddress`/`showPhone`/`showEmail`/`showMap` flags are enabled (`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4 CONTACT, `docs/21-TENANTS_SETTINGS_SCHEMA.md` §6)
      - **Conhecimento do assistente (chatbot)** — `settings.chatbot.knowledgeText` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §7); free-form textarea (policies, FAQ, tone notes), max 4000 characters (`maxKnowledgeTextLength`, a fixed platform default, not shown in this form — see below). Read by UC-033's system-prompt assembly alongside live services/prices. The other `settings.chatbot` fields (the 8 volume/cost caps, `llmProvider`/`llmModel`) are deliberately **not** in this form — fixed platform defaults for MVP, resolved `tenant override ?? platform default` at read time, only ever set by a developer directly on a specific tenant's row when Ikaro grants an explicit override (see `docs/21-TENANTS_SETTINGS_SCHEMA.md` §7 for the full rationale)
      - (see scope-expansion note above for the full M13-S31 field set)
   2. Admin updates values.
   3. Admin clicks "Salvar".
   4. System validates all fields (see `docs/21-TENANTS_SETTINGS_SCHEMA.md` for rules).
   5. System updates `tenants.settings` JSONB, and `tenants.name` via a separate call if changed.
   6. Admin sees: "Configurações salvas com sucesso."

- **Alternative Flows:**
   - **A1: Invalid field value** → System highlights the specific field with an error message and prevents save.
   - **A2: Slug change attempted** → Slug field is read-only; system ignores any manipulation attempt.
   - **A3: Rename fails after settings already saved** → Since settings-save and rename are two independent calls, the system distinguishes this partial-failure case in its error messaging rather than showing one generic error that would incorrectly imply nothing was saved.

- **Postconditions:** `tenants` row updated. New settings apply to all future operations (bookings, loyalty) for this tenant.
- **Events Triggered:** None (settings are read fresh on each request)
- **Not implemented:** no audit log of settings changes exists (who/what/when) — do not assume one when building on top of this use case.

---

### **UC-027: Tenant Admin Manages Hotsite Content & Branding**

- **Actor:** Staff member with `MANAGER` role.
- **Preconditions:** Admin is authenticated. `hotsite_configs` row exists for this tenant (created on tenant onboarding or first access).
- **Trigger:** Admin clicks "Branding" or "Hotsite" in the dashboard
- **Main Flow:**
   1. System loads current `hotsite_configs` for this tenant
   2. System displays two sections:
      
      **Section A: Branding**
      - Primary color (hex picker)
      - Secondary color (hex picker)
      - Background color (hex picker)
      - Text color (hex picker)
      - Logo URL (text input or upload)
      - Heading font family (dropdown or text)
      - Body font family (dropdown or text)
      - Border radius (`sharp` | `rounded` | `pill`)
      - Button style (`filled` | `outline` | `ghost`)
      - Spacing (`compact` | `comfortable` | `spacious`)
      - Shadow style (`none` | `subtle` | `strong`)
      - Button background color (optional, overrides primary color on buttons)
      - Button text color (optional)
      
      **Section B: Layout / Modules** (drag-drop list of module types — the 8 types built in M12/M13-S36: HERO, SERVICE_LIST, GALLERY, TESTIMONIALS, BOOKING_CTA, ABOUT, CONTACT, FOOTER; CHATBOT added as a 9th type)
      - [x] HERO (title, subtitle, optional background image upload) — toggle on/off
      - [x] SERVICE_LIST (services from catalog, with price/points badges) — toggle on/off
      - [x] GALLERY (booking after-photos + curated images) — toggle on/off + limit (6 default)
      - [x] BOOKING_CTA (call-to-action linking to the booking page) — toggle on/off
      - [x] TESTIMONIALS (author, text, optional rating; grid or carousel) — toggle on/off
      - [x] ABOUT (markdown body + optional image, configurable position) — toggle on/off
      - [x] CONTACT (address/phone/email/WhatsApp/map, each independently toggleable) — toggle on/off
      - [x] CHATBOT (AI-assisted FAQ widget scoped to the tenant's own business data) — toggle on/off; drill-down config carries only `variant` (`bubble`|`inline`), `accentColor`, `botName`, `welcomeMessage` — everything cost/security-sensitive (`knowledgeText`, the volume/cost caps) is deliberately excluded from this module data and lives on the tenant settings page instead (UC-026) or isn't tenant-editable at all (`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § CHATBOT). This config screen also carries a standing (non-dismissible) disclosure note: the assistant depends on Ikaro-managed AI provider credits, and a temporary provider/credit shortfall disables the widget automatically until resolved — no tenant action needed

      **Section C: SEO** (M12-S09; share image added M18-S03)
      - Title (text input, max 60 chars) — overrides the generated `<title>` for search results and social sharing
      - Description (textarea, max 158 chars) — overrides the generated meta description
      - Both optional; left blank (`null`) → hotsite falls back to a generated title/description based on the tenant's name and city/state
      - Share image (upload) — a dedicated landscape image for the Open Graph card shown when the hotsite link is shared on social media/WhatsApp; auto-cropped to 1200×630 on upload. Separate from the Branding tab's Logo — the logo is a small/square brand mark (login page, topbar, footer), not sized for a share card. Optional; left blank → no share image is included (no fallback to the logo)

      **Section D: Manifesto** (M18-S02) — always the last tab
      - A single JSON textarea showing the exact `{ branding, layout, seo }` object Sections A–C together produce and Publish sends — a direct-edit escape hatch for admins who find raw JSON faster than the structured UI, not a separate config surface
      - "Aplicar" parses and structurally validates the edited JSON (valid syntax; `branding`/`seo` fields have the right primitive types; `layout` items have a known, unique module `type` and data matching that type's own schema) before merging it into the same draft Sections A–C edit — an invalid edit is rejected inline and the draft is left unchanged
      - Deep business rules (hex color format, SEO length caps, exact enum values) are not re-validated client-side here — a structurally-valid-but-business-invalid edit (e.g. a non-hex color) still surfaces the normal Publish-time error, exactly as if it had been typed into Section A directly
   
   3. Admin updates:
      - Colors, logo, fonts in branding section
      - Enables/disables modules
      - Reorders modules (drag-drop) — order preserved in JSONB array
      - SEO title/description overrides
      - Or edits the equivalent raw JSON directly in the Manifesto tab (Section D)
   
   4. Admin clicks "Preview" to see hotsite live (optional) — reachable from the main tabs view, and (M18-S08) from within a module's own config screen (`Configurar`) via a **Preview** button alongside Aplicar/Cancelar. In the latter case, clicking Back returns to that same module's config screen with the in-progress edit intact, not discarded. Separately, Admin can click "Visitar site" (M18-S08, main tabs view only) at any time to open the real, currently-published public hotsite in a new browser tab — unlike Preview, this always reflects the last-published version, never the draft
   5. Admin clicks "Publish Changes"
   6. System updates `hotsite_configs.branding` and `hotsite_configs.layout`
   7. System sets `is_published = true`
   8. System logs: "[admin] published hotsite on [date]"
   9. Admin sees confirmation: "Hotsite updated and live"

- **Alternative Flows:**
   - **A1: Invalid color (not hex)** → System shows error and prevents save
   - **A2: Image upload fails** → System falls back to URL input
   - **A3: Malformed/invalid JSON in the Manifesto tab** → "Aplicar" shows an inline error and does not merge the edit into the draft; leaving the tab without clicking "Aplicar" discards the pending edit
   - **A4: Admin leaves a module's config screen with unapplied edits (M18-S08)** → "Cancelar" or the topbar back arrow shows a confirm-discard prompt, only when the edit actually differs from the module's last-applied value. "Descartar alterações" discards the edit and returns to the tabs view (same end state as before this story); "Continuar editando" or pressing Escape keeps the admin on the same config screen with the edit intact — clicking outside the dialog does not dismiss it, matching how confirm/destructive dialogs work everywhere (deliberate, not a gap)
   - **A5: CHATBOT module's daily conversation cap already reached today** → the CHATBOT module's config screen (only — no other module type shows this) displays a red banner reading that today's conversation limit was reached and the widget resumes automatically tomorrow. Driven by a small authenticated read (`GET /v1/tenants/chatbot/cap-status`, MANAGER-only) reusing the same per-tenant daily-cap `COUNT` query UC-033's cap enforcement already runs — not a new counting mechanism. Other backstops (concurrency cap, platform-wide spend breaker, provider balance floor) are **not** surfaced here; they stay covered by the visitor-facing "not available" widget state (UC-034) only, since they aren't specific to — or actionable by — this one tenant

- **Postconditions:** `hotsite_configs` updated. Hotsite public page reflects new branding and layout immediately (cached at edge if needed).
- **Events Triggered:** None

---

---

### **UC-028: Admin Invites New Staff Member**

> **Updated (`M13-S13`/`M13-S44`):** a new staff row is provisioned `is_active = true` from creation (never inactive — see UC-025's note). `InviteStaffUseCase` rejects an email that has **ever** linked a Google account (`google_oauth_id IS NOT NULL`), regardless of whether that row is currently active or deactivated — re-inviting can never reactivate a deactivated staff member. The only path back for a deactivated staff member is UC-031 (Admin Reactivates Staff Member).

- **Actor:** Staff member with `MANAGER` role
- **Preconditions:** Admin is authenticated with MANAGER role.
- **Trigger:** Admin clicks "Equipe" → "Convidar membro" in the dashboard.
- **Main Flow:**
   1. Admin enters: first name, last name, email address, role (`MANAGER` or `STAFF`).
   2. System validates: email format valid; no existing `staff` row for this `(tenant_id, email)` with a non-null `google_oauth_id`.
   3. System creates `staff` row: `email`, `name` (concatenated from first + last name input), `role`, `tenant_id`, `is_active = true`, `google_oauth_id = null`.
   4. System publishes `StaffInvited` event.
   5. Notification Context sends invitation email: "Você foi convidado(a) para gerenciar [Nome do Estabelecimento]. Clique aqui para aceitar."
   6. Admin sees: "Convite enviado para [email]."

- **Alternative Flows:**
   - **A1: Email has ever linked a Google account for this tenant (active or deactivated)** → System shows: "Este e-mail já está cadastrado na sua equipe." No reactivation happens here — see UC-031.
   - **A2: Email has a still-pending invite (`google_oauth_id IS NULL`, never linked)** → One-click "Reenviar convite" resends the same invitation email; no new row is created.

- **Postconditions:** `staff` row created (`is_active = true`, `google_oauth_id = null`). Invitation email sent. Staff member links their Google account via UC-025.
- **Events Triggered:** `StaffInvited`

---

### **UC-029: Admin Deactivates Staff Member**

- **Actor:** Staff member with `MANAGER` role
- **Preconditions:** Admin is authenticated with MANAGER role. Target staff member is active and belongs to the same tenant.
- **Trigger:** Admin clicks "Desativar" on a staff member's profile in the dashboard.
- **Main Flow:**
   1. Admin selects a staff member from the team list.
   2. Admin clicks "Desativar membro".
   3. System shows confirmation: "Tem certeza? [Nome] perderá o acesso imediatamente."
   4. Admin confirms.
   5. System sets `staff.is_active = false`.
   6. System publishes `StaffDeactivated` event.
   7. Any active JWT for this staff member will be rejected on next API call (JWT still valid until expiry; revocation is eventual via short TTL).
   8. Admin sees: "[Nome] foi desativado(a) com sucesso."

- **Alternative Flows:**
   - **A1: Admin tries to deactivate themselves** → System prevents: "Você não pode desativar sua própria conta."
   - **A2: Last MANAGER** → System prevents: "O estabelecimento precisa de pelo menos um gerente ativo."

- **Postconditions:** `staff.is_active = false`. Staff member can no longer log in. All their past actions remain in the audit log.
- **Events Triggered:** `StaffDeactivated`

---

### **UC-030: Admin Edits Staff Member Profile**

- **Actor:** Staff member with `MANAGER` role
- **Preconditions:** Admin is authenticated with MANAGER role. Target staff member belongs to the same tenant.
- **Trigger:** Admin clicks a staff member's row in the team list.
- **Main Flow:**
   1. Admin selects a staff member from the team list, landing on that member's detail page.
   2. Admin edits `name` and/or `role` (`MANAGER` or `STAFF`). `email` is always read-only — it is the lookup key used on every staff Google login and is never editable from this screen.
   3. Admin clicks "Salvar".
   4. System validates `name` is non-empty.
   5. System updates `staff.name` and `staff.role`.
   6. Admin sees the updated values reflected on the page.

- **Alternative Flows:**
   - **A1: Empty name** → System shows: "Informe o nome."
   - **A2: Demoting the last active MANAGER to STAFF** → System prevents: "O estabelecimento precisa de pelo menos um gerente ativo." (same guard as UC-029 A2)

- **Postconditions:** `staff.name`/`staff.role` updated. No domain event is published — no other bounded context currently needs to react to a profile edit (consistent with `Service.update()` and `Staff.linkGoogleAccount()`, which also don't emit events).
- **Events Triggered:** none

---

### **UC-031: Admin Reactivates Staff Member**

- **Actor:** Staff member with `MANAGER` role
- **Preconditions:** Admin is authenticated with MANAGER role. Target staff member is currently deactivated (`staff.is_active = false`) and belongs to the same tenant.
- **Trigger:** Admin clicks "Ativar" on a deactivated staff member's row in the team list.
- **Main Flow:**
   1. Admin selects a deactivated staff member from the team list.
   2. Admin clicks "Ativar".
   3. System sets `staff.is_active = true` and clears `staff.deactivated_by`.
   4. System publishes `StaffActivated` event.
   5. Admin sees the member's row update to "Ativo" with no page navigation.

- **Alternative Flows:**
   - **A1: Admin tries to reactivate themselves** → System prevents: same guard family as UC-029 A1. Not reachable via normal navigation (a deactivated actor's session cannot reach the team list), but the API defensively blocks it in case a still-valid, not-yet-expired JWT from just before deactivation is reused.
   - **A2: Member is already active** → System prevents with a conflict response; not reachable via normal navigation since "Ativar" only renders on deactivated rows, but the API defensively blocks it against a stale client view.

- **Postconditions:** `staff.is_active = true`. `staff.deactivated_by` cleared. Staff member can log in again.
- **Events Triggered:** `StaffActivated`

---

| UC | Name | Actor | Domain Impact |
|----|------|-------|----------------|
| UC-001 | Guest requests booking | Guest | Creates PENDING booking with 1..N lines + photos |
| UC-002 | Customer requests booking | Customer | Creates PENDING booking (auth'd) with 1..N lines |
| UC-003 | Admin approves booking | STAFF \| MANAGER | PENDING\|INFO_REQUESTED → APPROVED; line list frozen |
| UC-004 | Admin rejects booking | STAFF \| MANAGER | PENDING \| INFO_REQUESTED → REJECTED |
| UC-005 | Admin requests info | STAFF \| MANAGER (main); CUSTOMER \| GUEST (A2) | PENDING → INFO_REQUESTED (main); INFO_REQUESTED → PENDING (A2) |
| UC-006 | Customer views bookings | Customer | Read operation |
| UC-007 | Customer cancels booking | Customer | APPROVED (with time window) \| PENDING \| INFO_REQUESTED → CANCELLED |
| UC-008 | Admin cancels / reschedules booking | Admin | APPROVED/PENDING/INFO_REQUESTED → CANCELLED (`BookingCancelled`) or scheduledAt updated (`BookingRescheduled`) |
| UC-009 | Mark booking complete | Staff | APPROVED → COMPLETED + photos + N LoyaltyEntry rows (one per line) |
| UC-010 | Manage schedule closures and openings | STAFF \| MANAGER | ScheduleClosure or ScheduleOpening created/removed |
| UC-011 | View calendar | Any | Read available slots filtered by basket's total duration |
| UC-012 | Create service | STAFF \| MANAGER | Service created with points value |
| UC-013 | Edit service | STAFF \| MANAGER | Service updated |
| UC-016 | View loyalty metrics | Customer/Admin | Read-only: `current_points` (O(1) balance), next expiry date/points, paginated earning entries + redemptions |
| UC-016b | Weekly loyalty expiry warning | System (cron) | Monday 06:00 UTC — emit `PointsExpiringSoon` per customer with expiring points; Notification context sends email |
| UC-017 | View analytics | Admin | Future feature |
| UC-018 | Admin receives daily schedule | System | Scheduled reminder email at 6 AM |
| UC-019 | Customer reminder (day before) | System | Cron emits `BookingReminderDue`; Notification sends email at 6 AM |
| UC-020 | Customer reminder (day of) | System | Cron emits `BookingReminderDueToday`; Notification sends email at 6 AM |
| UC-021 | Customer login | Customer | OAuth, tenant-scoped (login-time multi-tenant selection descoped — see UC-021 note) |
| UC-022 | Staff login (single or multi-tenant) | Staff | OAuth; 2+ active tenants → `/select-staff-tenant`, also used to switch post-login |
| UC-023 | Customer switches tenant | Customer | Switch session to different tenant |
| UC-024 | Platform operator provisions new tenant (REST API) | Platform operator | `tenants` row + first MANAGER staff row; invite email sent |
| UC-025 | Admin first login (accepts invite) | Invited staff | `staff.google_oauth_id` set (row is already `is_active=true` from invite) |
| UC-026 | Admin edits tenant settings | MANAGER staff | `tenants.settings` JSONB updated |
| UC-027 | Admin manages hotsite content | MANAGER staff | `hotsite_configs` updated + published |
| UC-028 | Admin invites new staff member | MANAGER staff | `staff` row created (`is_active=true`, `google_oauth_id=null`); `StaffInvited` event |
| UC-029 | Admin deactivates staff member | MANAGER staff | `staff.is_active = false`; `StaffDeactivated` event |
| UC-030 | Admin edits staff member profile | MANAGER staff | `staff.name`/`staff.role` updated; no event |
| UC-031 | Admin reactivates staff member | MANAGER staff | `staff.is_active = true`; `deactivated_by` cleared; `StaffActivated` event |
| UC-033 | Guest asks chatbot a question | Guest | `chatbot_messages` rows persisted (USER+ASSISTANT); no booking/customer/staff record touched |
| UC-034 | Guest checks chatbot availability | Guest | Read-only: `{ available: boolean }` |
| UC-035 | System purges expired chatbot conversations | System (cron) | Daily — deletes `chatbot_messages`/`chatbot_sessions` rows past 180-day retention |
| UC-036 | System polls LLM provider balance | System (cron) | Every 15-30 min — upserts `chatbot_provider_balance` row |
| UC-037 | Manager configures the lead form module | MANAGER staff | `lead_form_configs` upserted |
| UC-038 | Visitor sees the lead form teaser | Guest \| Customer | Read-only render |
| UC-039 | Guest submits the lead form | Guest | `lead_form_submissions` row created (`customerId: null`); `LeadFormSubmissionReceived` |
| UC-040 | Logged-in customer submits the lead form | Customer | `lead_form_submissions` row created (`customerId` set); `LeadFormSubmissionReceived` |
| UC-041 | Staff/manager views leads submissions | STAFF \| MANAGER | Read-only |
| UC-042 | Manager configures the lead form retention window | MANAGER staff | `settings.leadForm.retentionMonths` updated |
| UC-043 | System purges expired lead form submissions | System (cron) | Daily — deletes `lead_form_submissions` rows past retention |
| UC-010e | Manager creates a resource-scoped schedule closure | MANAGER | `ScheduleClosure` created with `resourceId` set |
| UC-010f | Manager creates a resource-scoped schedule opening | MANAGER | `ScheduleOpening` created with `resourceId` set |
| UC-044 | Manager views the resource list | MANAGER | Read operation |
| UC-045 | Manager creates a resource | MANAGER | `Resource` created |
| UC-046 | Manager edits a resource's working hours | MANAGER | `Resource.workingHours` updated |
| UC-047 | Manager deactivates a resource | MANAGER | `Resource.isActive = false`; resolution worklist for existing commitments |
| UC-048 | System cascades a staff deactivation to the wrapping STAFF resource | System | Consumes `StaffDeactivated`; `Resource.isActive = false` |
| UC-049 | Manager reactivates a resource | MANAGER | `Resource.isActive = true` |
| UC-050 | Staff/manager configures a service's resource requirement | STAFF \| MANAGER | `Service.resourceRequirements[0]` set |
| UC-051 | Staff/manager configures a bundled resource requirement | STAFF \| MANAGER | `Service.resourceRequirements` (≥2) set |
| UC-052 | Staff/manager configures service legs | STAFF \| MANAGER | `Service.legs` set; `resourceRequirements`/`bufferAfterMinutes` cleared |
| UC-053 | Staff/manager sets a service's buffer override | STAFF \| MANAGER | `Service.bufferAfterMinutes` updated |
| UC-054 | Staff/manager configures a service's booking-intake schema | STAFF \| MANAGER | New `service_booking_intake_schema` version created |
| UC-055 | Staff/manager configures an appointment service's booking policy | STAFF \| MANAGER | `Service` booking-policy fields updated |
| UC-056 | Staff/manager chooses a service's booking model at creation | STAFF \| MANAGER | `Service.bookingModel` set (immutable once bookings exist) |
| UC-057 | Manager views a combined multi-resource day grid | MANAGER | Read operation |
| UC-058 | System computes availability scoped to a resource or bundle | System | Read path — extends `AvailabilityService` |
| UC-059 | System applies resource turnover and leg transition gaps | System | Read path |
| UC-060 | System rejects overlapping bookings across a shared resource | System | DB-enforced via `booking.resource_occupancy`'s shared exclusion constraint |
| UC-061 | Customer books with a specific chosen staff member | Customer \| Guest | Booking with a resolved STAFF resource assignment |
| UC-062 | Customer books auto-assigned from a fungible resource pool | Customer \| Guest | Booking locks one pool resource, invisibly |
| UC-063 | Customer books a service with system-auto-assigned named staff | Customer \| Guest | Booking with a system-resolved STAFF assignment |
| UC-064 | Customer books a bundled-resource appointment | Customer \| Guest | Booking locks every bundle resource |
| UC-065 | Customer books a multi-leg appointment | Customer \| Guest | One `BookingLine` with a full leg-assignment snapshot |
| UC-066 | Customer views a specific staff member's own calendar | Customer \| Guest | Read operation |
| UC-067 | Customer books a variable-duration resource reservation | Customer \| Guest | Booking with customer-selected duration + per-increment quote |
| UC-068 | Customer submits versioned booking intake and attendees | Customer \| Guest | `bookings.intakeSchemaVersion`/`intakeAnswers` snapshotted |
| UC-069 | Customer reschedules an appointment or reservation | Customer | `BookingRescheduled`; `booking_quote_revisions` row on a price change |
| UC-070 | Customer (or staff) manages a recurring private reservation schedule | Customer | `RecurringBookingSchedule` created `ACTIVE` or `PENDING_APPROVAL` |
| UC-071 | Staff approves or rejects a recurring schedule request | STAFF \| MANAGER | `RecurringBookingSchedule.status` → `ACTIVE`\|`CANCELLED` |
| UC-072 | Authenticated customer creates an availability alert | Customer | `AvailabilityAlert` created |
| UC-073 | System identifies and queues a future commitment exception | System | `FutureCommitmentException` created |
| UC-074 | Staff or manager marks an appointment as no-show | STAFF \| MANAGER | `Booking.status → NO_SHOW`; `BookingNoShow` event |
| UC-075 | System bootstraps a new tenant from a preset | MANAGER | `TenantSchedulingBootstrapped`; initial Resource/Service graph |
| UC-076 | Customer manages an availability alert | Customer | `AvailabilityAlert` updated/cancelled |
| UC-077 | Manager resolves a future commitment exception | MANAGER | `FutureCommitmentException.status → RESOLVED`\|`DISMISSED` |
| UC-078 | Staff/manager configures a session service's guest access policy | STAFF \| MANAGER | `Service.guestAccessEnabled`/`guestTrialPolicy` updated |
| UC-079 | Staff/manager creates a recurring class schedule template | STAFF \| MANAGER | `ClassScheduleTemplate` created |
| UC-080 | Staff/manager edits or deactivates a template | STAFF \| MANAGER | Template updated; future sessions only |
| UC-081 | System generates upcoming class sessions | System | `ClassSession` rows materialized on rolling horizon |
| UC-082 | Staff/manager views a list of upcoming class sessions | STAFF \| MANAGER | Read operation |
| UC-083 | Staff/manager overrides a single session's capacity or resources | STAFF \| MANAGER | `ClassSession` instance override |
| UC-084 | Staff/manager cancels a class session with existing bookings | STAFF \| MANAGER | `ClassSession.status → CANCELLED`; bookings cancelled |
| UC-085 | Customer browses upcoming sessions with remaining capacity | Customer \| Guest | Read operation |
| UC-086 | Contract customer books into a session | Customer | `ClassSessionBooking` created `CONFIRMED` |
| UC-087 | Authenticated customer without a contract books pay-per-class | Customer | `ClassSessionBooking` created, no contract |
| UC-088 | Verified guest books multiple named units in one action | Guest | One `ClassSessionBooking` consuming N units |
| UC-089 | Customer cancels a single class session booking | Customer | `ClassSessionBooking.status → CANCELLED` |
| UC-090 | Authenticated customer joins a waitlist when a session is full | Customer | `ClassSessionBooking(status=WAITLISTED)` |
| UC-091 | System auto-promotes the next waitlisted customer | System | `ClassSessionBooking.status → PROMOTION_PENDING` |
| UC-092 | System auto-cancels unpromoted waitlist entries when a session ends | System | Waitlisted bookings → `CANCELLED` |
| UC-093 | Customer enrolls in a recurring weekly session | Customer | `RecurringEnrollment` created `ACTIVE` |
| UC-094 | Customer cancels a single occurrence of a recurring enrollment | Customer | One occurrence's booking cancelled |
| UC-095 | Customer cancels an entire recurring enrollment | Customer | `RecurringEnrollment.status → CANCELLED` |
| UC-096 | Staff/manager cancels template occurrences for a date range | STAFF \| MANAGER | `ClassScheduleTemplateException` created; sessions cancelled |
| UC-097 | Guest verifies email before requesting a class seat | Guest | `PENDING_EMAIL_VERIFICATION` → `CONFIRMED`\|`PENDING_APPROVAL` |
| UC-098 | Staff approves or rejects a verified guest class reservation | STAFF \| MANAGER | `ClassSessionBooking.status → CONFIRMED`\|`CANCELLED` |
| UC-099 | Manager creates or cancels a customer class-access contract | MANAGER | `ClassAccessContract` created/cancelled |
| UC-100 | System expires unresolved guest requests at session start | System | `PENDING_APPROVAL` → `CANCELLED` |
| UC-101 | Staff closes a session with individual attendance | STAFF \| MANAGER | `ClassSession.status → CLOSED`; attendee outcomes recorded |
| UC-102 | Customer reschedules a skipped fixed-class occurrence | Customer | New one-off booking linked via `rescheduledFromId` |
| UC-103 | Staff/manager views enrollments for a class type | STAFF \| MANAGER | Read operation |
| UC-104 | Staff manually creates an enrollment on a customer's behalf | STAFF \| MANAGER | Same as UC-086/093, `createdByStaff = true` |
| UC-105 | Customer edits a group reservation's attendees | Customer | Attendee removed; `quantity`/quote adjusted |
| UC-106 | System expires a waitlist offer | System | `PROMOTION_PENDING` → `CANCELLED`; next entry promoted |
| UC-107 | Staff records a manually reported charge at session close-out | STAFF \| MANAGER | `class_session_payments` row created |
