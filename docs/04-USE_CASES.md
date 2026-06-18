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
  11. System creates the `Booking` aggregate with status = PENDING and one `BookingLine` per selected service. Each line snapshots `price`, `duration_mins`, `points_value`, and `requiresPickupAddress`. `Booking.contactAddress` stored if provided. `Booking.pickupAddress` is set if any pickup service was selected. Photos stored. All rows scoped to tenant.
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
  1. System displays customer's bookings in sections:
     - **Upcoming:** APPROVED bookings with date ≥ today
     - **Past:** COMPLETED or CANCELLED bookings with date < today
     - **Pending:** PENDING bookings awaiting admin approval
  2. Each booking shows: the list of services in the booking, date, time, status, total price, total duration.
  3. For APPROVED upcoming bookings: customer can see "Cancel" button.
  4. For PENDING / INFO_REQUESTED bookings: customer can see "Cancel Request" button.
  5. Clicking a booking shows the full detail including every line (service name, line price, line duration) and any photos.
  6. Customer can view loyalty summary (full breakdown lives in UC-016):
     - Total active points (across all services)
     - Total washes completed (lifetime)
     - Most recently completed service

- **Alternative Flows:**
  - **A1: No bookings** → System shows "You haven't booked yet"
  - **A2: Cancellation not eligible** → Cancel button hidden with note: "Cancellation available up to `tenants.settings.booking.cancellation_window_hours` hours before your appointment"

- **Postconditions:** Customer sees booking history and loyalty status
- **Events Triggered:** None (read operation)

---

### **UC-007: Customer Cancels Booking**

- **Actor:** Authenticated Customer
- **Preconditions:** Booking belongs to the customer and is in APPROVED, PENDING, or INFO_REQUESTED state.
  - For APPROVED bookings: time to booking ≥ `tenants.settings.booking.cancellation_window_hours`.
  - For PENDING / INFO_REQUESTED bookings: no time restriction — customer may cancel a pending request at any time.
- **Trigger:** Customer clicks "Cancel Booking" (APPROVED) or "Cancel Request" (PENDING / INFO_REQUESTED)
- **Endpoint:** `PATCH /v1/bookings/:id/cancel` (CUSTOMER | STAFF | MANAGER — BFF dispatches to `/cancel-customer` for CUSTOMER, `/cancel-admin` for staff)
- **Main Flow:**
  1. If booking is APPROVED: System validates that `scheduledAt − now() ≥ tenants.settings.booking.cancellation_window_hours`. If not, returns error (A1).
  2. If booking is PENDING or INFO_REQUESTED: no time validation needed — proceed directly.
  3. Customer sees confirmation: "Cancelar este agendamento?"
  4. Customer clicks "Confirmar"
  5. System transitions booking: `APPROVED | PENDING | INFO_REQUESTED → CANCELLED`
  6. System records `cancelledBy` (customer id), `cancelledAt`, `cancellationReason` (optional)
  7. System publishes `BookingCancelled` event
  8. System shows success: "Agendamento cancelado."

- **Alternative Flows:**
  - **A1: Inside cancellation window (APPROVED bookings only)** → System shows error: "Cancelamentos devem ser feitos com pelo menos `tenants.settings.booking.cancellation_window_hours` horas de antecedência."
  - **A2: Booking is COMPLETED, REJECTED, or CANCELLED** → System shows error: "Este agendamento não pode ser cancelado."

- **Postconditions:** Booking is CANCELLED. Customer receives cancellation confirmation email. Admin notified.
- **Events Triggered:** `BookingCancelled`

---

### **UC-008: Admin Cancels or Reschedules Booking**

- **Actor:** STAFF | MANAGER
- **Preconditions:** Booking is APPROVED, PENDING, or INFO_REQUESTED
- **Trigger:** Admin clicks "Cancel" or "Reschedule" in dashboard
- **Endpoint (cancel):** `PATCH /v1/bookings/:id/cancel` (STAFF | MANAGER — BFF dispatches to backend `/cancel-admin`)
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
  - **A6: Customer has loyalty points and `tenants.settings.loyalty.points_per_currency_unit > 0`** → Staff applies a points-based discount during completion:
    1. System shows a loyalty strip: customer's active balance + currency equivalent (e.g. "João tem 350 pontos = R$ 35,00", based on `points_per_currency_unit = 10`).
    2. Staff enters how many points to use, or clicks "Usar todos". Points capped at `min(currentPoints, totalActualPrice × points_per_currency_unit)` so the discount never exceeds the booking total.
    3. System shows live discount: "Desconto (200 pts): − R$ 20,00 · Total a cobrar: R$ 40,00".
    4. Staff clicks "Confirmar conclusão". System calls `PATCH /bookings/:id/complete` (body includes `discountByPoints: { pointsUsed, amountDeducted }`) and then `POST /loyalty/redeem { customerId, pointsToRedeem, bookingId }`.
    5. Customer's balance is decremented. Redemption recorded linked to the booking.
    6. Completion summary shows per-line charges plus the loyalty discount row.
    - Only shown when `customerId != null` AND `points_per_currency_unit > 0`. Not available for guest bookings (A4).

- **Postconditions:** Booking is COMPLETED. `actualPriceCharged` set on every line; `totalActualPrice` cached on the booking. For authenticated customers: N new `LoyaltyEntry` rows (N = number of lines, points based on `pointsValueAtBooking` regardless of price). Notification email shows both quoted and actual amounts.
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

Used when `business_hours[dayOfWeek] = null` (e.g., Sunday is always closed) but the business wants to open on a specific date (e.g., a special event on a Sunday).

- **Actor:** STAFF | MANAGER
- **Endpoint:** `POST /v1/schedule/openings`
- **Preconditions:** Admin is authenticated. The day-of-week for the selected date is closed in `business_hours`.
- **Trigger:** Admin clicks "Open Schedule" on a normally-closed day in the calendar.
- **Main Flow:**
  1. Admin selects date (must be a day-of-week that is `null` in `business_hours`).
  2. Admin enters `startTime` and `endTime` for the opening window (e.g., 09:00–14:00).
  3. Admin optionally enters notes.
  4. Admin confirms.
  5. System validates: date is not past; day-of-week is closed in `business_hours`; no `ScheduleOpening` already exists for `(tenantId, date)`; `endTime > startTime`.
  6. System creates `ScheduleOpening`.
  7. Calendar shows the date as partially available within the specified window.
  8. Admin sees confirmation: "Agenda aberta [09:00–14:00] em [date]."

- **Alternative Flows:**
  - **A1: Date is in the past** → `422 Unprocessable`.
  - **A2: Day-of-week is already open in `business_hours`** → `422 Unprocessable` — "Esse dia já está aberto nas configurações regulares. Ajuste os horários de funcionamento em vez disso."
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
  3. The date reverts to its default closed state per `business_hours`.
- **Alternative Flows:**
  - **A1: Opening not found or belongs to another tenant** → `404 Not Found`.
- **Postconditions:** Opening deleted.
- **Events Triggered:** None.

---

### **UC-011: Guest Views Real-Time Calendar Availability**

- **Actor:** Guest (any user, authenticated or not)
- **Preconditions:** User has added at least one service to their booking basket.
- **Trigger:** User clicks "Choose Date/Time" after selecting services.

#### **Scheduling Algorithm (MVP)**

**Slot Structure:**
- Slot unit: `tenants.settings.booking.slot_granularity_minutes` (default: 30 min, valid: 15/30/60)
- Valid start times are multiples of the granularity within business hours (e.g., 09:00, 09:30, 10:00, … for 30-min slots)
- Tenant's business hours (`settings.business_hours`) determine the available window

**Booking Duration Calculation:**
```
booking_duration_minutes = SUM(service.duration_minutes for each service in basket)
                         + tenants.settings.booking.service_buffer_minutes
```

Example: basket = [Basic Wash (30 min), Wax (25 min)], buffer = 60 min, granularity = 30 min:
- Raw duration: 30 + 25 + 60 = 115 minutes
- Required slots: CEIL(115 / 30) = 4 consecutive 30-min slots

**Availability Calculation — Three-Layer Schedule Resolution:**

For each date in the query window, the effective operating hours are resolved in priority order:

```
1. ScheduleOpening  (highest — opens a normally-closed day for a specific window)
2. ScheduleClosure  (blocks the whole day or a time window within it)
3. business_hours   (lowest — the recurring weekly default)
```

Resolution per date:
```
if ScheduleOpening exists for (tenantId, date):
    effectiveHours = { open: opening.startTime, close: opening.endTime }
    (ScheduleClosure and business_hours are ignored for this date)
elif business_hours[dayOfWeek] = null:
    return []  ← default-closed day, no opening exception
elif full-day ScheduleClosure exists for (tenantId, date):
    return []  ← entire day blocked
else:
    effectiveHours = business_hours[dayOfWeek]

// Within effectiveHours, remove any slots overlapping a partial ScheduleClosure:
partialClosures = ScheduleClosures for (tenantId, date) where startTime IS NOT NULL
for each candidate slot in effectiveHours at slot_granularity_minutes:
    blockedByPartialClosure = partialClosures.any(c => slot overlaps [c.startTime, c.endTime])
    blockedByBooking = APPROVED bookings.any(b => slot overlaps b window)
    if not blockedByPartialClosure and not blockedByBooking:
        → slot is available
```

1. Load `slot_granularity_minutes`, `service_buffer_minutes`, business hours, and timezone from `tenants.settings`
2. Compute `bookingDurationMins` from basket + buffer
3. Compute `requiredSlots = CEIL(bookingDurationMins / slot_granularity_minutes)`
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

Constraints: `from ≤ to`; range ≤ 90 days (tenant's `max_booking_advance_days`). Past dates return `available: false, slotCount: 0` without an error.

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
   - **A4: Range > 90 days** → 422 error; frontend should cap requests to `max_booking_advance_days`.

- **Postconditions:** User has selected a date/time with start slot = available start time, duration = calculated booking duration.
- **Events Triggered:** None (read operation).


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
     - `isActive` flag (default: `true`; set `false` to create as inactive) **(requires a backend change to `Service.create()`/`CreateServiceSchema` to accept this parameter — not yet implemented as of this audit; flag for `M13-S05`)**
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
  1. Admin modifies: name, description, price, duration, loyalty points value, `requiresPickupAddress` toggle, status
  2. Admin clicks "Save"
  3. System validates changes
  4. System updates Service aggregate
  5. Admin sees confirmation: "Serviço atualizado"

- **Alternative Flows:**
  - **A1: Deactivate service** → Admin calls deactivate (`DELETE /v1/services/:id`) → sets `isActive = false` → service hidden from booking page
  - **A2: Price change** → Past bookings unaffected (snapshots are immutable); future bookings use new price
  - **A3: Toggle `requiresPickupAddress`** → Only affects future bookings. Existing `booking_lines` retain their snapshotted `requiresPickupAddressAtBooking` value.

- **Postconditions:** Service updated. New bookings reflect all changes including `requiresPickupAddress`.
- **Events Triggered:** None

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
  3. System returns `{ currentPoints, nextExpiryDate, nextExpiryPoints }`.
  4. System separately returns paginated `loyalty_entries` (earning history) with `isActive` flag (`expiresAt > now()`). Service names are resolved via `ILoyaltyBookingPort`.
  5. System separately returns paginated `loyalty_redemptions` (redemption history).

- **Main Flow (Admin/Staff — any customer):**
  Same data shape and queries as the customer flow, but the `customerId` comes from the URL path (`/customers/:customerId/loyalty/*`) instead of the JWT. Admin can view any customer in their tenant.

- **Alternative Flows:**
  - **A1: No completed bookings yet** → Balance endpoint returns `{ currentPoints: 0, nextExpiryDate: null, nextExpiryPoints: null }`. Entries and redemptions endpoints return empty paginated lists.
  - **A2: Customer not found** → `404` (admin variant only — customerId path param does not exist in tenant).

- **Postconditions:** User sees current active-points view. No state changes.
- **Events Triggered:** None (read operation).
- **Out of scope (MVP):** No tier labels (BRONZE/SILVER/GOLD), no manual admin point adjustments, no per-service breakdown (deferred to M13 dashboard). Gifts and rewards are offered by the admin outside the system.

---

### **UC-016b: Weekly Loyalty Expiry Warning**

- **Actor:** System (GCP Cloud Scheduler)
- **Preconditions:** At least one tenant has customers with `LoyaltyEntry` rows whose `expires_at` falls within the warning window.
- **Trigger:** GCP Cloud Scheduler fires `POST /cron/loyalty-expiry-warning` once a week (Mondays 06:00 UTC).
- **Main Flow:**
  1. Handler fetches all `LoyaltyEntry` rows where `expires_at BETWEEN now() AND now() + expiry_warning_days` across all tenants in a single query (all-tenant pass, same pattern as `POST /cron/loyalty-expiry`).
  2. Groups entries by `(tenant_id, customer_id)`.
  3. For each group: computes `pointsExpiringSoon` (sum of `points`) and `earliestExpiresAt` (minimum `expires_at`).
  4. Publishes one `PointsExpiringSoon` event per customer.
  5. Notification context consumer receives the event, looks up the customer email via `INotificationCustomerPort`, and sends the warning email using the `points-expiring-soon` template.
  6. Returns `{ processed: N }` where N is the number of customers notified.

- **Alternative Flows:**
  - **A1: No expiring entries found** → Handler returns `{ processed: 0 }` immediately. No events published.
  - **A2: Customer not found in Notification context** → Consumer skips silently (logs a warning). Idempotency log is not written.
  - **A3: Duplicate delivery (handler called twice)** → Consumer checks `notification_logs` by `eventId`; second call is a no-op.

- **Postconditions:** One warning email sent per customer with expiring points. No DB rows written by the cron itself (state-free read + publish).
- **Events Triggered:** `PointsExpiringSoon` (one per affected customer per tenant).
- **Config key:** `settings.loyalty.expiry_warning_days` (integer, default 7, range 1–90, must be less than `expiry_days`).
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

## Admin Reminders & Notifications

### **UC-018: Admin Receives Daily Schedule Reminder**

> **Cron scheduling note (applies to UC-018, UC-019, UC-020):** A single global cron fires every 30 minutes. On each fire it queries `tenants` for records whose current local time (UTC offset from `settings.business_hours.timezone`) equals 06:00. Only those tenants are processed. This ensures "6 AM tenant-local" without per-tenant scheduled jobs.

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

### **UC-021: Customer Login (with Tenant Selection)**

- **Actor:** Customer (unauthenticated)
- **Preconditions:** Customer has Google account. Customer may have bookings in one or more tenants.
- **Trigger:** Customer clicks "Login with Google" on any hotsite
- **Main Flow:**
  1. System redirects to Google OAuth
  2. Customer logs in with Google account
  3. Google returns: googleOAuthId, email, name
  4. System queries: Which tenants does this customer belong to?
  5. **Case A: Customer in ONE tenant only**
     - Session automatically created for that tenant
     - Customer redirected to dashboard
  6. **Case B: Customer in MULTIPLE tenants**
     - System shows tenant selection screen with the customer's active-point balance at each tenant:
       ```
       "Which car wash would you like to book with?
        - AutoWash Pro  · 50 active points
        - SuperClean    ·  8 active points"
       ```
     - Customer selects: "AutoWash Pro"
     - Session created: {userId: customer_id, tenantId: "tenant_a"}
  7. Customer logged in and sees selected tenant's data only

- **Alternative Flows:**
  - **A1: No existing bookings in any tenant** → Customer can choose any tenant to start booking
  - **A2: First time customer** → System creates Customer record in selected tenant
  - **A3: Customer's profile has no phone number** → After tenant resolution (Case A or B), before redirecting to the dashboard, system shows a one-time "Complete seu perfil" prompt collecting `phone`. Submits via `PATCH /customers/me`. Once set, this step is skipped on all future logins. (Unblocks UC-002's phone precondition — see UC-002 A11.)

- **Postconditions:** Customer logged in to one tenant. Session scoped to that tenant.
- **Events Triggered:** None (read operation)

---

### **UC-022: Staff Login (No Tenant Selection)**

- **Actor:** Staff member (unauthenticated)
- **Preconditions:** Staff has Google account. Staff belongs to exactly ONE tenant.
- **Trigger:** Staff clicks "Login" on admin dashboard
- **Main Flow:**
  1. System redirects to Google OAuth
  2. Staff logs in with Google account
  3. Google returns: googleOAuthId, email, name
  4. System queries: Which tenant does this staff member belong to?
  5. **Case A: Staff found in exactly ONE tenant and `is_active = true`**
     - Session automatically created for that tenant
     - Staff redirected to admin dashboard
     - No selection screen needed
  6. **Case B: Staff found but invite not yet accepted (`is_active = false`)**
     - System redirects to first-login flow (UC-025 handles activation from here).
  7. **Case C: Staff not found in any tenant**
     - System redirects to error: "Staff account not found. Contact your administrator."

- **Alternative Flows:**
  - **A1: Staff tries to access multiple tenants** → Not possible (staff belongs to one tenant only)

- **Postconditions:** Staff logged in to their single tenant. Session scoped to that tenant.
- **Events Triggered:** None (read operation)

---

### **UC-023: Customer Switches Tenant**

- **Actor:** Authenticated customer (logged in)
- **Preconditions:** Customer belongs to multiple tenants. Currently in one tenant.
- **Trigger:** Customer clicks "Trocar empresa" in the avatar dropdown (only shown when JWT indicates 2+ tenants)
- **Endpoint:** `POST /v1/auth/switch-tenant { targetTenantId }` (CUSTOMER)
- **Main Flow:**
  1. System shows list of other tenants customer belongs to (excluding current)
  2. Customer selects: "SuperClean"
  3. Old JWT expires client-side — no active revocation (stateless JWT)
  4. BFF validates customer belongs to target tenant; issues new JWT scoped to `tenant_b`
  5. Customer redirected to SuperClean's hotsite or customer area
  6. Customer sees: SuperClean's bookings and SuperClean's loyalty (8 active points)

- **Alternative Flows:**
  - **A1: Customer has only one tenant** → "Switch" button hidden/disabled

- **Postconditions:** Customer switched to different tenant. Session scoped to new tenant.
- **Events Triggered:** None

---

## Platform & Tenant Management

### **UC-024: Platform Operator Provisions New Tenant (REST API)**

- **Actor:** Ikaro platform operator (developer / internal ops)
- **Preconditions:** Operator holds `PLATFORM_ADMIN_KEY`. No self-service signup UI exists in MVP.
- **Trigger:** A new car-wash company is signed up and needs a tenant provisioned on the platform.
- **Security:** Three-layer defence-in-depth (decided 2026-05-15):
  1. **Cloud Armor** (M15-S12) — blocks `/internal/*` from the public internet at the infrastructure level
  2. **Cloud IAP** (M15-S12) — Google identity gate; only allowlisted Google accounts can reach the endpoint
  3. **`PLATFORM_ADMIN_KEY`** (M02-S05) — static API key validated by `PlatformAdminGuard` at the application level

- **Main Flow:**
   1. Operator calls:
      ```http
      POST /internal/tenants
      Authorization: Bearer <PLATFORM_ADMIN_KEY>
      Content-Type: application/json

      {
        "name": "AutoWash Pro",
        "slug": "autowash-pro",
        "adminEmail": "owner@autowashpro.com.br",
        "timezone": "America/Sao_Paulo"
      }
      ```
   2. `PlatformAdminGuard` validates the Bearer token using `crypto.timingSafeEqual` → rejects with `401` if invalid.
   3. System validates inputs: slug format (`/^[a-z0-9-]+$/`), slug uniqueness, email format, IANA timezone.
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
   - **A1: Missing or invalid `Authorization` header** → `401` Problem Detail
   - **A2: Slug already taken** → `409` Problem Detail: `"Slug 'autowash-pro' is already in use"`
   - **A3: Invalid slug format** → `400` Problem Detail
   - **A4: Invalid email** → `400` Problem Detail
   - **A5: Invalid IANA timezone** → `400` Problem Detail

- **Postconditions:** `platform.tenants` + `platform.hotsite_configs` rows created. `TenantProvisioned` event published. First MANAGER staff and invitation email handled asynchronously by M04-S06 and M11.
- **Events Triggered:** `TenantProvisioned` (synchronous) → triggers `StaffInvited` (asynchronous, via M04-S06)

---

### **UC-025: Admin First Login (Accepts Invite)**

- **Actor:** Invited staff member (received invitation email from UC-024 or UC-028)
- **Preconditions:** Staff row exists for the invited email with `is_active = false`. Tenant is active.
- **Trigger:** Staff member clicks the invitation link in the email and authenticates with Google OAuth.
- **Main Flow:**
   1. System redirects to Google OAuth login.
   2. Staff member authenticates with Google using the invited email address.
   3. System receives Google callback with `google_oauth_id` and `email`.
   4. System finds the `staff` row by `(tenant_id, email)` where `is_active = false`.
   5. System activates the staff record: sets `google_oauth_id`, `is_active = true`.
   6. System creates a JWT session (`tenantId`, `tenantSlug`, `role`).
   7. System redirects to the dashboard.
   8. Staff member sees: "Bem-vindo(a)! Sua conta está pronta."

- **Alternative Flows:**
   - **A1: Google email does not match invited email** → System shows error: "Por favor, use o e-mail para o qual você foi convidado(a)."
   - **A2: Staff already active** → System treats as normal login (UC-022).
   - **A3: Tenant deactivated** → System shows error: "Este estabelecimento está desativado."

- **Postconditions:** `staff.is_active = true`, `staff.google_oauth_id` set. Staff logged in and on the dashboard.
- **Events Triggered:** None

---

### **UC-026: Admin Edits Tenant Settings**

- **Actor:** Staff member with `MANAGER` role
- **Preconditions:** Admin is authenticated with MANAGER role.
- **Trigger:** Admin clicks "Configurações" → "Geral" in the dashboard.
- **Main Flow:**
   1. System loads current `tenants.settings` JSONB and displays form with current values:
      - **Nome do estabelecimento** (edit allowed)
      - **Slug** (read-only after creation — shown as info only)
      - **Janela de cancelamento** (horas) — default 48 h
      - **Validade dos pontos de fidelidade** (dias) — default 180 d
      - **Horário de funcionamento** — days of week + open/close times
      - **Fuso horário** — required; default `America/Sao_Paulo`
      - **Buffer entre agendamentos** (minutos) — prep time between bookings, default 60
      - **Endereço, telefone e e-mail do estabelecimento** — `settings.business_info` (M12-S06); all optional. Shown on the hotsite `CONTACT` module when its `showAddress`/`showPhone`/`showEmail`/`showMap` flags are enabled (`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4 CONTACT, `docs/21-TENANTS_SETTINGS_SCHEMA.md` §6)
   2. Admin updates values.
   3. Admin clicks "Salvar".
   4. System validates all fields (see `docs/21-TENANTS_SETTINGS_SCHEMA.md` for rules).
   5. System updates `tenants.settings` JSONB and `tenants.name` if changed.
   6. System logs audit entry: who changed what and when.
   7. Admin sees: "Configurações salvas com sucesso."

- **Alternative Flows:**
   - **A1: Invalid field value** → System highlights the specific field with an error message and prevents save.
   - **A2: Slug change attempted** → Slug field is read-only; system ignores any manipulation attempt.

- **Postconditions:** `tenants` row updated. New settings apply to all future operations (bookings, loyalty) for this tenant.
- **Events Triggered:** None (settings are read fresh on each request)

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
      
      **Section B: Layout / Modules** (drag-drop list of module types — the 7 types built in M12)
      - [x] HERO (title, subtitle, optional background image upload) — toggle on/off
      - [x] SERVICE_LIST (services from catalog, with price/points badges) — toggle on/off
      - [x] GALLERY (booking after-photos + curated images) — toggle on/off + limit (6 default)
      - [x] BOOKING_CTA (call-to-action linking to the booking page) — toggle on/off
      - [x] TESTIMONIALS (author, text, optional rating; grid or carousel) — toggle on/off
      - [x] ABOUT (markdown body + optional image, configurable position) — toggle on/off
      - [x] CONTACT (address/phone/email/WhatsApp/map, each independently toggleable) — toggle on/off

      **Section C: SEO** (M12-S09)
      - Title (text input, max 70 chars) — overrides the generated `<title>` for search results and social sharing
      - Description (textarea, max 160 chars) — overrides the generated meta description
      - Both optional; left blank (`null`) → hotsite falls back to a generated title/description based on the tenant's name and city/state
   
   3. Admin updates:
      - Colors, logo, fonts in branding section
      - Enables/disables modules
      - Reorders modules (drag-drop) — order preserved in JSONB array
      - SEO title/description overrides
   
   4. Admin clicks "Preview" to see hotsite live (optional)
   5. Admin clicks "Publish Changes"
   6. System updates `hotsite_configs.branding` and `hotsite_configs.layout`
   7. System sets `is_published = true`
   8. System logs: "[admin] published hotsite on [date]"
   9. Admin sees confirmation: "Hotsite updated and live"

- **Alternative Flows:**
   - **A1: Invalid color (not hex)** → System shows error and prevents save
   - **A2: Image upload fails** → System falls back to URL input

- **Postconditions:** `hotsite_configs` updated. Hotsite public page reflects new branding and layout immediately (cached at edge if needed).
- **Events Triggered:** None

---

---

### **UC-028: Admin Invites New Staff Member**

- **Actor:** Staff member with `MANAGER` role
- **Preconditions:** Admin is authenticated with MANAGER role.
- **Trigger:** Admin clicks "Equipe" → "Convidar membro" in the dashboard.
- **Main Flow:**
   1. Admin enters: first name, last name, email address, role (`MANAGER` or `STAFF`).
   2. System validates: email format valid; no existing active `staff` row for this `(tenant_id, email)`.
   3. System creates `staff` row: `email`, `name` (concatenated from first + last name input), `role`, `tenant_id`, `is_active = false`.
   4. System publishes `StaffInvited` event.
   5. Notification Context sends invitation email: "Você foi convidado(a) para gerenciar [Nome do Estabelecimento]. Clique aqui para aceitar."
   6. Admin sees: "Convite enviado para [email]."

- **Alternative Flows:**
   - **A1: Email already has active staff record** → System shows: "Este e-mail já está cadastrado na sua equipe."
   - **A2: Email has inactive staff record** → System reactivates instead (A2-flow: sets `is_active = true`, resends invite).

- **Postconditions:** `staff` row created (`is_active = false`). Invitation email sent. Staff member activates account via UC-025.
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
| UC-021 | Customer login with tenant selection | Customer | OAuth + tenant selection if multiple |
| UC-022 | Staff login (no selection) | Staff | OAuth (direct to single tenant) |
| UC-023 | Customer switches tenant | Customer | Switch session to different tenant |
| UC-024 | Platform operator provisions new tenant (REST API) | Platform operator | `tenants` row + first MANAGER staff row; invite email sent |
| UC-025 | Admin first login (accepts invite) | Invited staff | `staff.is_active = true`, `google_oauth_id` set |
| UC-026 | Admin edits tenant settings | MANAGER staff | `tenants.settings` JSONB updated |
| UC-027 | Admin manages hotsite content | MANAGER staff | `hotsite_configs` updated + published |
| UC-028 | Admin invites new staff member | MANAGER staff | `staff` row created (`is_active=false`); `StaffInvited` event |
| UC-029 | Admin deactivates staff member | MANAGER staff | `staff.is_active = false`; `StaffDeactivated` event |

