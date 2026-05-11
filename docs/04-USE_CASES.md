# Use Cases - BeloAuto

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
- **Preconditions:** Guest is on tenant's hotsite or booking page (e.g., beloauto.com/tenant1). System has available time slots. Guest is requesting for a specific tenant.
- **Trigger:** Guest clicks "Request Booking"
- **Main Flow:**
  1. System identifies tenant from URL path (e.g., /tenant1)
  2. Guest enters: name, email, phone
  3. Guest selects service (from that tenant's services only)
  4. System displays calendar with available slots (that tenant's admin's schedule)
  5. Guest selects preferred date/time
  6. Guest optionally uploads one or more car photos (PNG/JPG) - encouraged with text "Help us understand your car's condition"
  7. System validates: email format, phone format, slot availability, file sizes
  8. Guest clicks "Submit"
  9. System creates Booking aggregate with status = PENDING, stores all photos, **scoped to tenant**
  10. System publishes `BookingRequested` event (with tenantId)
  11. Guest sees confirmation screen: "Your request is pending. You'll hear from us soon."

- **Alternative Flows:**
  - **A1: Invalid email** → System shows error, guest corrects
  - **A2: No available slots** → System shows "No availability, try another date"
  - **A3: Photo upload fails** → System allows submission without photos (optional)
  - **A4: Multiple photos** → Guest can add/remove photos before submitting
  - **A5: Wrong tenant URL** → Guest is requesting booking for Tenant A, sees Tenant A's services/calendar only

- **Postconditions:** Booking exists in PENDING state, **scoped to tenant**. Admin of that tenant is notified. Guest receives email.
- **Events Triggered:** `BookingRequested` (includes tenantId)

---

### **UC-002: Authenticated Customer Requests Booking**

- **Actor:** Customer (logged in via Google OAuth)
- **Preconditions:** Customer is authenticated. System has available slots. Customer has previous booking history (optional).
- **Trigger:** Customer clicks "Request Booking"
- **Main Flow:**
  1. System pre-fills: name, email, phone (from customer profile)
  2. Customer selects service
  3. System displays calendar with available slots
  4. Customer selects preferred date/time
  5. Customer optionally uploads car photos
  6. System validates input
  7. Customer clicks "Submit"
  8. System creates Booking with status = PENDING, links customerId
  9. System publishes `BookingRequested` event
  10. System displays: "Request submitted. View your bookings in your profile."
  11. System displays customer's loyalty status (e.g., "You have 3 completed washes")

- **Alternative Flows:**
  - Same as UC-001, plus:
  - **A4: Customer views past bookings** → System shows completed/cancelled history

- **Postconditions:** Booking created and linked to customer. Loyalty record updated if not first booking.
- **Events Triggered:** `BookingRequested`

---

### **UC-003: Admin Approves Booking**

- **Actor:** Staff/Admin
- **Preconditions:** Booking in PENDING state. Admin is authenticated. Admin has access to dashboard.
- **Trigger:** Admin clicks "Approve" on pending booking
- **Main Flow:**
  1. Admin views pending booking request with details:
     - Customer name, email, phone
     - Service selected
     - Preferred date/time
     - Car photos (if any)
  2. Admin reviews all information
  3. Admin clicks "Approve"
  4. System confirms actual time slot is still available
  5. System transitions booking: PENDING → APPROVED
  6. System records approvalTimestamp and approvedBy (staff email)
  7. System publishes `BookingApproved` event
  8. Admin sees success message: "Booking approved"

- **Alternative Flows:**
  - **A1: Slot no longer available** → System shows error, suggests alternatives
  - **A2: Admin adds internal notes** → System stores notes in booking (optional)

- **Postconditions:** Booking is APPROVED. Customer receives confirmation email with date/time. Calendar slot reserved.
- **Events Triggered:** `BookingApproved`

---

### **UC-004: Admin Rejects Booking**

- **Actor:** Staff/Admin
- **Preconditions:** Booking in PENDING state
- **Trigger:** Admin clicks "Reject"
- **Main Flow:**
  1. Admin selects pending booking
  2. Admin clicks "Reject"
  3. Admin enters reason (e.g., "Service unavailable", "Schedule full")
  4. Admin clicks "Submit"
  5. System transitions booking: PENDING → REJECTED
  6. System records rejectionReason and rejectedBy
  7. System publishes `BookingRejected` event
  8. Admin sees confirmation

- **Alternative Flows:**
  - **A1: No reason provided** → System allows (reason optional)

- **Postconditions:** Booking is REJECTED. Guest/customer receives email explaining reason.
- **Events Triggered:** `BookingRejected`

---

### **UC-005: Admin Requests More Information**

- **Actor:** Staff/Admin
- **Preconditions:** Booking in PENDING state
- **Trigger:** Admin clicks "Request More Info"
- **Main Flow:**
  1. Admin selects pending booking
  2. Admin clicks "Request More Info"
  3. Admin enters message (e.g., "Please provide car photos")
  4. Admin clicks "Submit"
  5. System keeps booking in PENDING state
  6. System publishes `BookingInfoRequested` event
  7. Admin sees confirmation

- **Alternative Flows:**
  - None (straightforward request flow)

- **Postconditions:** Booking stays PENDING. Guest/customer receives email with request. Guest can submit more info and resubmit.
- **Events Triggered:** `BookingInfoRequested`

---

### **UC-006: Customer Views and Manages Bookings**

- **Actor:** Authenticated Customer
- **Preconditions:** Customer is logged in
- **Trigger:** Customer clicks "My Bookings" or "Booking History"
- **Main Flow:**
  1. System displays customer's bookings in sections:
     - **Upcoming:** APPROVED bookings with date ≥ today
     - **Past:** COMPLETED or CANCELLED bookings with date < today
     - **Pending:** PENDING bookings awaiting admin approval
  2. Each booking shows: service, date, time, status, price
  3. For APPROVED upcoming bookings: customer can see "Cancel" button
  4. For PENDING bookings: customer can see "Cancel Request" button
  5. Clicking booking details shows full info (service description, location, etc.)
  6. Customer can view loyalty metrics:
     - Total washes completed: [X]
     - Total cancellations: [Y]
     - Loyalty status: [BRONZE/SILVER/GOLD]

- **Alternative Flows:**
  - **A1: No bookings** → System shows "You haven't booked yet"
  - **A2: Cancellation not eligible (< 48h)** → Cancel button hidden with note: "Cancellation available 48h before appointment"

- **Postconditions:** Customer sees booking history and loyalty status
- **Events Triggered:** None (read operation)

---

### **UC-007: Customer Cancels Approved Booking**

- **Actor:** Authenticated Customer
- **Preconditions:** Booking is APPROVED. Time to booking ≥ 48 hours.
- **Trigger:** Customer clicks "Cancel Booking"
- **Main Flow:**
  1. System validates: current time + 48h ≤ booking time
  2. If validation passes:
     - Customer sees confirmation: "Cancel this booking?"
  3. Customer clicks "Confirm Cancel"
  4. System transitions booking: APPROVED → CANCELLED
  5. System records cancelledBy (customer email), cancelDate, reason (optional)
  6. System publishes `BookingCancelled` event
  7. System shows success: "Booking cancelled"

- **Alternative Flows:**
  - **A1: Less than 48h remaining** → System shows error: "Too late to cancel"
  - **A2: Booking already completed/cancelled** → System shows error: "Cannot cancel this booking"

- **Postconditions:** Booking is CANCELLED. Customer receives cancellation confirmation email. Admin notified. Loyalty system records cancellation.
- **Events Triggered:** `BookingCancelled`

---

### **UC-008: Admin Cancels or Reschedules Booking**

- **Actor:** Staff/Admin
- **Preconditions:** Booking is APPROVED or PENDING
- **Trigger:** Admin clicks "Cancel" or "Reschedule" in dashboard
- **Main Flow:**
  1. Admin selects booking
  2. Admin clicks "Cancel Booking"
  3. Admin enters reason (e.g., "Emergency closure", "Staff unavailable")
  4. Admin clicks "Confirm"
  5. System transitions: APPROVED/PENDING → CANCELLED
  6. System records cancelledBy (staff email) and reason
  7. System publishes `BookingCancelled` event (with isBusiness = true)
  8. Admin sees success confirmation

- **Alternative Flows:**
  - **A1: Admin reschedules instead of cancelling** → Admin selects new date/time → republish for customer confirmation

- **Postconditions:** Booking cancelled or rescheduled. Customer receives notification email.
- **Events Triggered:** `BookingCancelled`

---

### **UC-009: Admin Marks Booking Complete**

- **Actor:** Staff/Admin (after completing wash)
- **Preconditions:** Booking is APPROVED. Scheduled time has passed (or is current).
- **Trigger:** Admin/Staff clicks "Mark Complete" or "Wash Done" in dashboard
- **Main Flow:**
  1. Staff/Admin navigates to today's bookings or specific booking
  2. Staff/Admin clicks "Mark as Completed"
  3. Staff/Admin may add notes (e.g., "Extra shine applied")
  4. Staff/Admin optionally uploads one or more after-service photos (PNG/JPG) - encouraged with text "Help customer see the result & use for marketing"
  5. Staff/Admin clicks "Confirm"
  6. System transitions booking: APPROVED → COMPLETED
  7. System records completedBy (staff email), completedDate, and all after-service photos
  8. System publishes `BookingCompleted` event
  9. System shows success
  10. If customer is authenticated: System processes loyalty points (calls Loyalty Context), publishes `ServicePointsEarned`

- **Alternative Flows:**
  - **A1: No-show** → Admin marks as NO_SHOW instead of COMPLETED (optional state for future)
  - **A2: Multiple photos** → Staff can add/remove photos before confirming
  - **A3: Photo upload fails** → System allows completion without photos (optional)

- **Postconditions:** Booking is COMPLETED. If authenticated customer: loyalty points added for service, status recalculated. Notification email sent. Photos stored for marketing.
- **Events Triggered:** `BookingCompleted`, `ServicePointsEarned`

---

## Schedule Management Use Cases

### **UC-010: Admin Closes Schedule (Days Off, Maintenance)**

- **Actor:** Staff/Admin
- **Preconditions:** Admin is authenticated and has dashboard access
- **Trigger:** Admin clicks "Manage Schedule" or "Close Schedule"
- **Main Flow:**
  1. Admin navigates to "Schedule Management"
  2. Admin selects date(s) to close (single day or date range)
  3. Admin selects closure type: STAFF_DAY_OFF, MAINTENANCE, HOLIDAY
  4. Admin optionally enters reason/notes
  5. Admin clicks "Close Schedule"
  6. System creates ScheduleClosure aggregate
  7. System removes those dates from available calendar
  8. Admin sees confirmation: "Schedule closed [date range]"

- **Alternative Flows:**
  - **A1: Bookings already exist on closed dates** → System shows warning: "[X] bookings exist. Admin must reschedule or cancel manually."
  - **A2: Admin opens previously closed date** → Admin clicks "Reopen Schedule" → ScheduleClosure deleted → date becomes available again

- **Postconditions:** Calendar reflects closed dates. Guests cannot book closed dates.
- **Events Triggered:** None directly (but impacts UC-001, UC-002 availability)

---

### **UC-011: Guest Views Real-Time Calendar Availability**

- **Actor:** Guest (any user, authenticated or not)
- **Preconditions:** User is on booking page
- **Trigger:** User selects service and "Choose Date/Time"
- **Main Flow:**
  1. System fetches:
     - All ScheduleClosures (closed dates)
     - All APPROVED bookings in next 90 days
     - Service duration
  2. System calculates available time slots:
     - Exclude closed dates
     - Exclude booked time slots
     - Show only business hours (e.g., 8 AM - 6 PM)
  3. System displays calendar with green (available) and gray (booked) slots
  4. User clicks available slot → system confirms selection
  5. User proceeds to booking form

- **Alternative Flows:**
  - **A1: No slots in next 7 days** → System suggests dates further out
  - **A2: Service duration > available slots** → System hides those slots

- **Postconditions:** User has selected date/time, proceeds to booking
- **Events Triggered:** None (read operation)

---

## Service Management Use Cases

### **UC-012: Admin Creates New Service**

- **Actor:** Staff/Admin
- **Preconditions:** Admin is authenticated
- **Trigger:** Admin clicks "Manage Services" → "Add Service"
- **Main Flow:**
  1. Admin enters service details:
     - Name (e.g., "Basic Wash")
     - Description (e.g., "Exterior wash + dry")
     - Price
     - Duration (minutes)
     - Status (ACTIVE/INACTIVE)
  2. Admin clicks "Create"
  3. System validates: name unique, price > 0, duration > 0
  4. System creates Service aggregate
  5. Admin sees confirmation: "Service created"

- **Alternative Flows:**
  - **A1: Service name already exists** → System shows error, admin changes name
  - **A2: Price/duration invalid** → System shows validation error

- **Postconditions:** Service available for guests to book
- **Events Triggered:** None (system event, not domain event)

---

### **UC-013: Admin Edits Service Details**

- **Actor:** Staff/Admin
- **Preconditions:** Service exists
- **Trigger:** Admin clicks "Manage Services" → selects service → "Edit"
- **Main Flow:**
  1. Admin modifies: name, description, price, duration, status
  2. Admin clicks "Save"
  3. System validates changes
  4. System updates Service aggregate
  5. Admin sees confirmation: "Service updated"

- **Alternative Flows:**
  - **A1: Deactivate service** → Admin sets status = INACTIVE → service hidden from booking page
  - **A2: Price increase impacts future bookings** → Past bookings unaffected, future bookings use new price

- **Postconditions:** Service updated. New bookings reflect changes.
- **Events Triggered:** None

---

## Authentication & User Management Use Cases

### **UC-014: Customer Logs In (Google OAuth)**

- **Actor:** Customer or Guest
- **Preconditions:** User is on login page
- **Trigger:** User clicks "Login with Google"
- **Main Flow:**
  1. System redirects to Google OAuth consent screen
  2. User authenticates with Google
  3. Google returns access token + user info (sub, email, name)
  4. System checks: does customer exist with this googleOAuthId?
  5. **If new:** System creates Customer aggregate with googleOAuthId
  6. **If existing:** System updates last login
  7. System sets session/JWT token
  8. System redirects to customer dashboard or booking page
  9. User is authenticated

- **Alternative Flows:**
  - **A1: User denies Google OAuth consent** → Redirect to login page with message: "Authentication cancelled"

- **Postconditions:** User is logged in. Future requests include auth token.
- **Events Triggered:** None (auth event, not domain event)

---

### **UC-015: Staff Logs In (Google OAuth)**

- **Actor:** Staff/Admin
- **Preconditions:** User is on staff login page. Staff account exists.
- **Trigger:** Staff clicks "Login with Google"
- **Main Flow:**
  1. System redirects to Google OAuth consent screen
  2. Staff authenticates with Google
  3. Google returns access token + user info (sub, email, name)
  4. System checks: does staff exist with this googleOAuthId?
  5. **If exists and isActive = true:** Grant dashboard access
  6. **If not exists or isActive = false:** Show error: "Not authorized"
  7. System sets session/JWT token
  8. System redirects to admin dashboard
  9. Staff is authenticated

- **Alternative Flows:**
  - **A1: Staff deactivated** → System shows: "Your account is inactive"
  - **A2: New staff member** → Superadmin must create staff account + googleOAuthId first

- **Postconditions:** Staff authenticated. Access to admin dashboard.
- **Events Triggered:** None

---

## Loyalty & Analytics Use Cases

### **UC-016: View Customer Loyalty Metrics**

- **Actor:** Authenticated Customer or Admin (viewing customer profile)
- **Preconditions:** Customer has at least one completed booking
- **Trigger:** Customer clicks "My Loyalty" or Admin views customer profile
- **Main Flow:**
  1. System fetches LoyaltyRecord for customer
  2. System displays loyalty data **per service type**:
     - For each service the customer has used:
       - Service name
       - Total completions
       - Accumulated points
       - Points status (BRONZE/SILVER/GOLD per service)
       - When points expire (e.g., "+180 days")
       - Progress to next tier (e.g., "3 points, 2 more to reach SILVER")
  3. User sees information organized by service
  4. Example display:
     ```
     Basic Wash: 5 points (SILVER) - expires in 120 days
       5 completions - 1 point each
       
     Premium Wash: 3 points (BRONZE) - expires in 150 days
       1 completion - 2 points
       + 1 manual point (admin bonus)
       
     Wax: 0 points (no history)
     ```
  5. Optional: Show historical log (when earned, when expired)

- **Alternative Flows:**
  - **A1: No bookings yet** → System shows: "No loyalty record yet. Book your first service!"
  - **A2: Points expired** → System shows expired points grayed out, recalculates available

- **Postconditions:** User views loyalty metrics per service
- **Events Triggered:** None (read operation)

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

- **Actor:** System (scheduled job) & Staff/Admin
- **Preconditions:** Admin has active account and bookings for today
- **Trigger:** System cron job runs at 6 AM each day
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
- **Events Triggered:** `BookingReminderSentCustomer`

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
- **Events Triggered:** `BookingReminderSentCustomerDay`

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
     - System shows tenant selection screen:
       ```
       "Which car wash would you like to book with?
        - AutoWash Pro [50 points, SILVER]
        - SuperClean [8 points, BRONZE]"
       ```
     - Customer selects: "AutoWash Pro"
     - Session created: {userId: customer_id, tenantId: "tenant_a"}
  7. Customer logged in and sees selected tenant's data only

- **Alternative Flows:**
  - **A1: No existing bookings in any tenant** → Customer can choose any tenant to start booking
  - **A2: First time customer** → System creates Customer record in selected tenant

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
  5. **Case A: Staff found in exactly ONE tenant**
     - Session automatically created for that tenant
     - Staff redirected to admin dashboard
     - No selection screen needed
  6. **Case B: Staff not found in any tenant**
     - Error: "Staff account not found. Contact your administrator."

- **Alternative Flows:**
  - **A1: Staff tries to access multiple tenants** → Not possible (staff belongs to one tenant only)

- **Postconditions:** Staff logged in to their single tenant. Session scoped to that tenant.
- **Events Triggered:** None (read operation)

---

### **UC-023: Customer Switches Tenant**

- **Actor:** Authenticated customer (logged in)
- **Preconditions:** Customer belongs to multiple tenants. Currently in one tenant.
- **Trigger:** Customer clicks "Switch Car Wash" or "Switch Tenant"
- **Main Flow:**
  1. System shows list of other tenants customer belongs to
  2. Customer selects: "SuperClean"
  3. Current session invalidated
  4. New session created: {userId: customer_id, tenantId: "tenant_b"}
  5. Customer redirected to SuperClean dashboard
  6. Customer sees: SuperClean's bookings, loyalty (8 points, BRONZE)

- **Alternative Flows:**
  - **A1: Customer has only one tenant** → "Switch" button hidden/disabled

- **Postconditions:** Customer switched to different tenant. Session scoped to new tenant.
- **Events Triggered:** None

---

| UC | Name | Actor | Domain Impact |
|----|------|-------|----------------|
| UC-001 | Guest requests booking | Guest | Creates PENDING booking with photos |
| UC-002 | Customer requests booking | Customer | Creates PENDING booking (auth'd) |
| UC-003 | Admin approves booking | Admin | PENDING → APPROVED |
| UC-004 | Admin rejects booking | Admin | PENDING → REJECTED |
| UC-005 | Admin requests info | Admin | PENDING (awaiting info) |
| UC-006 | Customer views bookings | Customer | Read operation |
| UC-007 | Customer cancels booking | Customer | APPROVED → CANCELLED |
| UC-008 | Admin cancels booking | Admin | APPROVED/PENDING → CANCELLED |
| UC-009 | Mark booking complete | Staff | APPROVED → COMPLETED + photos + points |
| UC-010 | Close schedule | Admin | ScheduleClosure created |
| UC-011 | View calendar | Any | Read available slots |
| UC-012 | Create service | Admin | Service created with points value |
| UC-013 | Edit service | Admin | Service updated |
| UC-014 | Customer login (OAuth) | Customer | Customer created/updated or tenant selection |
| UC-015 | Staff login (OAuth) | Staff | Staff authenticated (no selection) |
| UC-016 | View loyalty metrics | Customer/Admin | LoyaltyRecord per-service read |
| UC-017 | View analytics | Admin | Future feature |
| UC-018 | Admin receives daily schedule | System | Scheduled reminder email at 6 AM |
| UC-019 | Customer reminder (day before) | System | Scheduled reminder email at 6 AM |
| UC-020 | Customer reminder (day of) | System | Scheduled reminder email at 6 AM |
| UC-021 | Customer login with tenant selection | Customer | OAuth + tenant selection if multiple |
| UC-022 | Staff login (no selection) | Staff | OAuth (direct to single tenant) |
| UC-023 | Customer switches tenant | Customer | Switch session to different tenant |

