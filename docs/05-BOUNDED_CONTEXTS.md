# Bounded Contexts & Communication - BeloAuto

This document describes how the independent bounded contexts in BeloAuto interact and communicate, ensuring loose coupling and high cohesion, **while maintaining complete tenant isolation**.

---

## Multi-Tenancy Architecture

### **Tenant Isolation Principle**

Every bounded context is **tenant-scoped**. No context can ever access or modify data from another tenant:

```
Tenant A (AutoWash Pro)
├── Booking Context (Tenant A's bookings only)
├── Customer Context (Tenant A's customers only)
├── Loyalty Context (Tenant A's loyalty records only)
├── Notification Context (Tenant A's emails only)
└── Staff Context (Tenant A's staff only)

Tenant B (SuperClean)
├── Booking Context (Tenant B's bookings only)
├── Customer Context (Tenant B's customers only)
├── Loyalty Context (Tenant B's loyalty records only)
├── Notification Context (Tenant B's emails only)
└── Staff Context (Tenant B's staff only)

NEVER: Tenant A's Booking Context talks to Tenant B's data
NEVER: Queries cross tenant boundaries
NEVER: Events leak between tenants
```

### **Data Filtering Pattern**

Every query is filtered by tenant:
```sql
-- Correct (tenant-scoped)
SELECT * FROM bookings WHERE tenant_id = ? AND status = 'APPROVED'

-- Wrong (crosses tenant boundary - never allowed)
SELECT * FROM bookings WHERE status = 'APPROVED'  -- No tenant_id filter!
```

### **Event Isolation Pattern**

Events include tenantId and are only processed within tenant:
```
Event: BookingRequested (tenantId: "tenant1", ...)
↓
Event Bus (in-memory or pub/sub)
↓
Notification Context subscribes: 
  "If BookingRequested and tenantId = 'tenant1', send email"
  
(Never processes BookingRequested from 'tenant2')
```

---

## Context Map (Tenant-Scoped)

```
┌──────────────────────────────────────────────────────────────────┐
│                         BeloAuto System                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              BOOKING CONTEXT                                │ │
│  │  (Core domain - manages booking lifecycle)                  │ │
│  │                                                              │ │
│  │  Aggregates:                                                │ │
│  │  - Booking (root)                                           │ │
│  │  - Service (root)                                           │ │
│  │  - ScheduleClosure (root)                                   │ │
│  │                                                              │ │
│  │  Published Events:                                          │ │
│  │  - BookingRequested                                         │ │
│  │  - BookingApproved                                          │ │
│  │  - BookingRejected                                          │ │
│  │  - BookingInfoRequested                                     │ │
│  │  - BookingInfoSubmitted                                     │ │
│  │  - BookingCompleted                                         │ │
│  │  - BookingCancelled                                         │ │
│  └────────────┬────────────────┬───────────────────────────────┘ │
│               │                │                                  │
│       ┌───────▼─────┐  ┌──────▼───────┐                          │
│       │Consumes:    │  │Consumes:     │                          │
│       │WashCompleted│  │Cancellation  │                          │
│       │             │  │Recorded      │                          │
│       └─────────────┘  └──────────────┘                          │
│               │                │                                  │
│       ┌───────▼────────────────▼───────┐                         │
│       │                                 │                         │
│       ▼                                 ▼                         │
│  ┌──────────────────┐          ┌──────────────────┐             │
│  │ LOYALTY CONTEXT  │          │ NOTIFICATION CTX │             │
│  │ (Supporting)     │          │ (Supporting)     │             │
│  │                  │          │                  │             │
│  │ Aggregates:      │          │ Aggregates:      │             │
│  │ - LoyaltyEntry   │          │ - EmailTemplate  │             │
│  │   (append-only) │          │                  │             │
│  │   (root)         │          │ - NotificationLog│             │
│  │                  │          │   (root)         │             │
│  │ Published:       │          │                  │             │
│  │ - WashCompleted  │          │ Published:       │             │
│  │ - Cancellation   │          │ - EmailSent      │             │
│  │   Recorded       │          │ - EmailFailed    │             │
│  │ - Loyalty        │          │                  │             │
│  │   StatusChanged  │          │ Calls external:  │             │
│  └──────────────────┘          │ SendGrid/SES     │             │
│       │                         │                  │             │
│       │                         │ Listens to ALL   │             │
│       │                         │ other contexts   │             │
│       │                         │ for events       │             │
│       │                         │                  │             │
│       └─────────────────────────┘                 │             │
│                                                   │             │
│       ┌───────────────────────────────────────────▼──────┐      │
│       │         CUSTOMER CONTEXT                         │      │
│       │  (Supporting - auth'd users only)                │      │
│       │                                                   │      │
│       │  Aggregates:                                      │      │
│       │  - Customer (root)                                │      │
│       │                                                   │      │
│       │  No published events                              │      │
│       │  (Passive context, referenced by others)          │      │
│       └───────────────────────────────────────────────────┘      │
│                                                                    │
│       ┌───────────────────────────────────────────────────┐      │
│       │         STAFF CONTEXT                             │      │
│       │  (Supporting - employees only)                    │      │
│       │                                                   │      │
│       │  Aggregates:                                      │      │
│       │  - Staff (root)                                   │      │
│       │  - ScheduleClosure (shared with Booking)          │      │
│       │                                                   │      │
│       │  No published events                              │      │
│       │  (Passive context, referenced by others)          │      │
│       └───────────────────────────────────────────────────┘      │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Context Descriptions

### **1. Booking Context (Core Domain, Tenant-Scoped)**

**Purpose:** The heart of BeloAuto. Manages the complete booking lifecycle **for a specific tenant**.

**Owned Aggregates:**
- `Booking` (root) — a customer visit; parent of 1..N `BookingLine` child entities (tenant-scoped). The Booking aggregate enforces ≥1 line, snapshots line fields at request time, and computes `totalPrice` / `totalDurationMins` from its lines.
- `Service` — type of car wash offered (tenant-scoped). Edits to a service NEVER retroactively affect past bookings — the `BookingLine` snapshot is the source of truth for an existing booking.
- `ScheduleClosure` — when the schedule is closed (tenant-scoped).

**Responsibilities:**
- Accept booking requests (guest & authenticated customers) for a specific tenant
- Validate calendar availability for that tenant only
- Manage approval/rejection workflow (tenant-scoped)
- Track booking state changes (tenant-scoped)
- Support cancellations with business rules (48h, tenant-scoped)
- Trigger workflow changes

**Database:** `beloauto_booking` schema
- Tables: bookings, services, schedule_closures, booking_audit_logs
- Every row has: `tenant_id` (required, indexed)
- Queries: Always filtered by `WHERE tenant_id = ?`

**Published Events** (every event carries `tenantId`, `eventId`, `occurredAt`, `correlationId`):
- `BookingRequested` → consumed by Notification, Loyalty
- `BookingApproved` → consumed by Notification, Loyalty
- `BookingRejected` → consumed by Notification
- `BookingInfoRequested` (PENDING → INFO_REQUESTED) → consumed by Notification
- `BookingInfoSubmitted` (INFO_REQUESTED → PENDING) → consumed by Notification
- `BookingCompleted` → consumed by Loyalty, Notification
- `BookingCancelled` → consumed by Loyalty, Notification
- Reminder events: `BookingReminderSentCustomer`, `BookingReminderSentCustomerDay`, `AdminDailyScheduleReminder`

**Dependencies:**
- **Input:** Requires Customer data (optional), Staff data (optional) to validate - all tenant-scoped
- **Output:** Publishes tenant-scoped events

**Tech Stack:**
- Repository pattern (tenant-scoped queries)
- Domain services for business logic (availability check, 48h cancellation rule)
- Event emitter to publish tenant-scoped events

**Tenant Isolation Guarantees:**
- ✓ Cannot query other tenant's bookings
- ✓ Cannot access other tenant's services
- ✓ Cannot view other tenant's schedule closures
- ✓ Events are tagged with tenantId
- ✓ Staff member from Tenant A sees only Tenant A bookings

---

### **2. Loyalty Context (Supporting Domain, Tenant-Scoped)**

**Purpose:** Track points earned by customers for completed services, with per-tenant expiration. Intentionally minimal — earn-only, no redemption, no tiers.

**Owned Aggregates:**
- `LoyaltyEntry` — one immutable row per booking completion. Append-only. Expiration is a query-time filter on `expires_at`, not a state change.

**Responsibilities:**
- Listen to `BookingCompleted` from Booking Context (tenant-scoped). When the booking has a `customerId`, insert a `LoyaltyEntry`.
- Compute the customer's active balance on demand (total + per-service).
- Run a daily cron to emit `PointsExpired` notifications for entries that just crossed their expiration window.

**Database:** `beloauto_loyalty` schema
- Single table: `loyalty_entries` (see `docs/13-DATABASE_SCHEMA.md`)
- Every row has `tenant_id` (required, indexed)
- Queries always filtered by `WHERE tenant_id = ?`
- `UNIQUE(tenant_id, booking_id)` guarantees idempotent processing of `BookingCompleted`

**Published Events** (every event carries `tenantId`, `eventId`, `occurredAt`, `correlationId`):
- `ServicePointsEarned` → consumed by Notification. **One event per `BookingLine`** — a 3-line booking produces 3 events.
- `PointsExpiringSoon` → consumed by Notification. Forward-looking weekly warning (NOT a post-fact "points expired" event).

**Consumed Events:**
- `BookingCompleted` (from Booking) — for each line in `data.lines[]`, insert one `LoyaltyEntry` when `customerId != null`. **This is the only event Loyalty subscribes to.** Other booking events (`BookingRequested`, `BookingApproved`, `BookingRejected`, `BookingInfoRequested`, `BookingInfoSubmitted`, `BookingCancelled`) do not change loyalty state, so Loyalty does not consume them.

**Dependencies:**
- **Input:** Event subscriber (tenant-scoped)
- **Output:** Read-only API for balance queries; published tenant-scoped events

**Tech Stack:**
- Event listener / subscriber pattern (tenant-scoped, idempotent via `UNIQUE(tenant_id, booking_line_id)`)
- Repository for `loyalty_entries` (insert + select only — no update/delete)
- Domain service for balance calculation
- **Weekly cron** (Mondays 06:00 tenant-local) for `PointsExpiringSoon` warnings — writes no DB rows

**Tenant Isolation Guarantees:**
- ✓ Cannot read another tenant's `loyalty_entries`
- ✓ Cannot insert across tenants — composite FKs `(tenant_id, customer_id)` and `(tenant_id, service_id)` block it at the DB
- ✓ Events filtered by `tenantId` on consume
- ✓ Expiration window is per-tenant via `tenants.settings.loyalty_expiry_days`

**Example flow (tenant-scoped, multi-line booking):**
```
TENANT A: customer completes a booking with 3 lines:
  • Basic Wash    (points_value = 1)
  • Wax           (points_value = 3)
  • Interior Vac  (points_value = 1)
  (tenants.settings.loyalty_expiry_days = 180)

→ BookingCompleted (envelope.tenantId = "tenant_a") published by Booking,
  data.lines = [3 entries]

→ Loyalty Context consumes the SINGLE event and inserts 3 rows into loyalty_entries:
     (entry1, tenant_id="tenant_a", booking_id, booking_line_id=L1, service_id=basic, points=1, expires_at=now+180d)
     (entry2, tenant_id="tenant_a", booking_id, booking_line_id=L2, service_id=wax,   points=3, expires_at=now+180d)
     (entry3, tenant_id="tenant_a", booking_id, booking_line_id=L3, service_id=vac,   points=1, expires_at=now+180d)
  All idempotent on UNIQUE(tenant_id, booking_line_id).

→ Loyalty Context publishes 3 ServicePointsEarned events (one per inserted line).

Notification Context may aggregate the 3 events into ONE email:
  "You earned 5 points across 3 services. Active total: 47 — expires Nov 8."

~173 days later, the weekly cron runs Monday morning and notices entry1's
expires_at falls within the next 7 days:
→ PointsExpiringSoon published (envelope.tenantId = "tenant_a"); NO DB write.
→ Notification sends: "Heads up — 1 point on Basic Wash will expire on [date].
                       Book a wash to keep earning."

When the date actually passes, the entry stops contributing to active balance.
No event, no row write. The customer was already warned.

TENANT B (completely separate):
→ Same customer can also use Tenant B
→ Tenant B's loyalty_entries rows are stored under tenant_id="tenant_b"
→ Earnings, expirations, balances are computed independently per tenant
```

---

### **3. Notification Context (Supporting Domain)**

**Purpose:** Centralized email communication.

**Owned Aggregates:**
- `NotificationTemplate` - Email template definitions
- `NotificationLog` - Record of sent/failed emails

**Responsibilities:**
- Listen to ALL domain events (from Booking, Loyalty, others)
- Compose emails from templates
- Send via SendGrid/SES
- Retry failed emails
- Log all notifications

**Database:** `beloauto_notification` schema
- Tables: notification_templates, notification_logs

**Published Events:**
- `EmailSent` → for audit
- `EmailFailed` → for retry queue

**Consumed Events:**
- All events from Booking Context
- All events from Loyalty Context
- (Future: Staff, Customer context events)

**Event-to-Email Mapping:**
```
BookingRequested → Email #1: Admin notification "New request from [name]"
                 → Email #2: Guest notification "Your request is pending"

BookingApproved → Email: Customer "Your booking is confirmed for [date/time]"

BookingRejected → Email: Customer "Your booking was declined. Reason: [reason]"

BookingInfoRequested → Email: Customer "We need: [info]. Please reply."

BookingCompleted → Email: Customer "Thanks for your wash!"

BookingCancelled → Email #1: Customer "Cancellation confirmed"
                 → Email #2: Admin "[name] cancelled booking"

BookingReminderSentCustomer → Email: Customer "Reminder: your appointment is tomorrow at [time]"

BookingReminderSentCustomerDay → Email: Customer "Reminder: your appointment is today at [time]"

AdminDailyScheduleReminder → Email: Admin "Today's schedule: [X] appointments, see details below"

ServicePointsEarned → (Notification may batch per booking) Email: Customer "You earned [total] points across [N] services in your last visit. Active total: [Y] points."

PointsExpiringSoon → Email (weekly digest): Customer "Heads up — [X] points on [Service] will expire on [date]. Book again to keep earning."
```

**Dependencies:**
- **Input:** Event stream from all contexts (decoupled via event bus)
- **Output:** Calls SendGrid/SES API

**Tech Stack:**
- Event listener/subscriber pattern
- Email template engine (Handlebars, EJS)
- HTTP client for SendGrid/SES
- Retry logic with exponential backoff

---

### **4. Customer Context (Supporting Domain, Multi-Tenant)**

**Purpose:** Store and manage authenticated customers (users with Google OAuth accounts) across multiple tenants.

**Owned Aggregates:**
- `Customer` - Authenticated user profile (can exist in multiple tenants)

**Responsibilities:**
- Store customer information per tenant
- Link Google OAuth ID to customer (same person can have multiple Customer records across tenants)
- Provide customer profile lookup per tenant
- Reference for other contexts

**Database:** `beloauto_customer` schema
- Tables: customers
- Every row has: `tenant_id` (required, indexed)
- Queries: Always filtered by `WHERE tenant_id = ?`
- **KEY DIFFERENCE:** No UNIQUE constraint on googleOAuthId alone
  - Same person (googleOAuthId) can appear in multiple tenants as separate Customer records
  - Example: maria@email.com → customer_id=1 in tenant_a, customer_id=2 in tenant_b

**Published Events:**
- None (purely supporting)

**Consumed Events:**
- None directly, but referenced by Booking events (tenant-scoped)

**Dependencies:**
- **Input:** None
- **Output:** Referenced by Booking Context (lookups, tenant-scoped), Loyalty Context (ownership, tenant-scoped)
- **External:** Google OAuth

**Tech Stack:**
- Repository pattern (tenant-scoped queries)
- Simple CRUD operations (all filtered by tenant_id)

**Tenant Isolation Model:**
```
Same Person, Multiple Tenants:
  
  maria@email.com (googleOAuthId: xyz123)
  
  Tenant A:
    → Customer(tenantId="tenant_a", customerId=1, googleOAuthId="xyz123", ...)
    → Loyalty(tenantId="tenant_a", customerId=1, points=50, ...)
    
  Tenant B:
    → Customer(tenantId="tenant_b", customerId=1, googleOAuthId="xyz123", ...)
    → Loyalty(tenantId="tenant_b", customerId=1, points=8, ...)
  
  On Login:
    - System finds: maria has Customer records in Tenant A and Tenant B
    - Shows selection: "Which car wash? [AutoWash Pro / SuperClean]"
    - Creates session: {userId: maria, tenantId: selected}
    - Session scoped to ONE tenant at a time
```

**Tenant Isolation Guarantees:**
- ✓ Cannot view customers from other tenants
- ✓ Same person as separate Customer records per tenant
- ✓ Completely isolated loyalty records per tenant
- ✓ On login, customer must select which tenant to enter

---

### **5. Staff Context (Supporting Domain, Tenant-Scoped)**

**Purpose:** Store and manage staff information **per tenant only** (staff belongs to exactly one tenant).

**Owned Aggregates:**
- `Staff` - Employee profile (tenant-scoped)
- `ScheduleClosure` - Shared with Booking Context (staff days off, maintenance, tenant-scoped)

**Responsibilities:**
- Store staff information for a specific tenant
- Link Google OAuth ID to staff (with tenant constraint)
- Manage staff status (active/inactive) per-tenant
- Foundation for future role-based access control per-tenant

**Database:** `beloauto_staff` schema
- Tables: staff_members, (schedule_closures in shared reference)
- Every row has: `tenant_id` (required, indexed)
- Queries: Always filtered by `WHERE tenant_id = ?`
- Unique constraint: UNIQUE(tenantId, googleOAuthId) - staff can ONLY belong to one tenant

**Published Events:**
- None (purely supporting)

**Consumed Events:**
- None

**Dependencies:**
- **Input:** None
- **Output:** None

**Tenant Isolation Guarantees:**
- ✓ Cannot view other tenant's staff
- ✓ Staff can ONLY work for one tenant
- ✓ Same person cannot be staff in multiple tenants
- ✓ Staff login directly enters their single tenant
- ✓ Staff from Tenant A never sees Tenant B data
- **Output:** Referenced by Booking (approvedBy, completedBy), Notification (recipient), Loyalty (audit)
- **External:** Google OAuth

**Tech Stack:**
- Repository pattern
- Simple CRUD operations
- Admin-only staff management

---

## Communication Patterns

### **1. Event-Driven Communication (Asynchronous)**

**Most contexts communicate via domain events:**

```
Booking Context publishes BookingCompleted
       ↓
Event Bus (GCP Pub/Sub Emulator locally · GCP Pub/Sub in production)
       ↓
Loyalty Context subscribes, inserts LoyaltyEntry, publishes ServicePointsEarned
       ↓
Event Bus
       ↓
Notification Context subscribes, composes email, sends
```

**Benefits:**
- Loose coupling (Booking doesn't know about Loyalty or Notification)
- Resilience (if Notification fails, doesn't block Booking)
- Scalability (can add new subscribers without changing Booking)
- Testability (can mock events)

**MVP Approach:**
- Start with synchronous event handling (simple, no queue needed)
- Migrate to async/queue-based as system grows

---

### **2. Direct API Calls (Synchronous)**

**The BFF Gateway as the Orchestrator:**
- The BFF is the only entry point for the **Web Layer** (Hotsite & Dashboard).
- When a Hotsite loads, the BFF queries the **Tenant Context** to build the **Hotsite Manifest**.
- When a Dashboard loads, the BFF validates the JWT and aggregates data from multiple contexts (e.g., Bookings + Loyalty) to provide a unified "Customer Profile" or "Admin Dashboard" response.

---

### **3. Shared Schema Reference (Minimal)**

**ScheduleClosure exists in Booking, but referenced by Staff:**

```
Staff.ScheduleClosure ← FK to Booking.ScheduleClosure
```

For MVP: Keep simple. Only ScheduleClosure is truly "shared."

**Future:** If sharing grows, consider separate shared module or service.

---

## Data Ownership & Consistency

### **Each context owns its data:**

| Context | Owns | Reads | Watches |
|---------|------|-------|---------|
| Booking | Bookings, Services, ScheduleClosures | - | - |
| Customer | Customers | - | - |
| Staff | Staff members | - | - |
| Loyalty | LoyaltyEntry (append-only) | Customer, Booking (via events) | BookingCompleted (only event Loyalty consumes — inserts one entry per line) |
| Notification | Templates, Logs | - | All events |

### **Consistency Model:**

- **Strong Consistency:** Within a bounded context (single transaction)
- **Eventual Consistency:** Between contexts (event-driven)

Example:
```
1. Booking Context: Booking transitions APPROVED → COMPLETED (strong)
2. Booking publishes: BookingCompleted event
3. Loyalty Context asynchronously: receives event, inserts one `LoyaltyEntry` per `BookingLine` (idempotent on `(tenant_id, booking_line_id)`)
4. Notification Context: Sends confirmation email

If Loyalty or Notification fails, event retried. Booking already committed.
```

---

## Integration Points

### **External Systems**

1. **Google OAuth (all contexts)**
   - Customer Context: validate and store OAuth ID
   - Staff Context: validate and store OAuth ID

2. **SendGrid / AWS SES (Notification Context)**
   - Calls external email service
   - Handles API failures and retries

3. **GCS (Booking Context)**
   - Stores car photos
   - Separate from Booking domain, but accessed by Booking

---

## Anti-Corruption Layer (Future)

When integrating future third-party services (e.g., payment provider, SMS), create an anti-corruption layer:

```
External Service → Adapter (Anti-Corruption Layer) → Domain Model
```

This prevents external system models from polluting domain.

**Example (future):**
```
PaymentGateway API → PaymentAdapter → Payment domain model
```

For MVP: Not needed.

---

## Deployment & CI/CD Implications

Each context can be deployed independently:

```
Backend Service 1: Booking Context API
Backend Service 2: Loyalty Context Worker
Backend Service 3: Notification Context Worker
Frontend Service: React SPA
BFF Service: API Gateway

Each has own pipeline, tests, database schema.
```

For MVP: All deployed as single service, but code organized as separate modules (monolith).

---

---

### **6. Platform Context (Foundational Domain)**

**Purpose:** Lifecycle management for tenants — configuration, hotsite, and staff.

**Owned Aggregates:**
- `Tenant` — name, slug, settings JSONB, is_active
- `HotsiteConfig` — branding, layout modules, publish flag

**Responsibilities:**
- Provision new tenants (developer CLI in MVP; no super-admin UI)
- Allow MANAGER-role staff to edit `tenants.settings` (UC-026)
- Allow MANAGER-role staff to edit and publish the hotsite (UC-027)
- Allow MANAGER-role staff to invite new staff members (UC-025) and deactivate existing ones (UC-028)
- Validate that `slug` is globally unique on create

**Database:** `tenants` + `hotsite_configs` tables (see `docs/13-DATABASE_SCHEMA.md`)

**Published Events:**
- `StaffInvited` → consumed by Notification (sends invitation/welcome email to new staff member's Google email)
- `StaffDeactivated` → no consumers in MVP

**Consumed Events:** none — Platform is the source for its own data.

**Dependencies:**
- **Output:** All other contexts read `tenant_id` and `tenants.settings` from here (via repository, not API)
- **External:** Google OAuth (to validate the invited email belongs to a Google account at login time)

**Tenant Isolation:**
- `Tenant` itself is NOT scoped by `tenant_id` (it IS the tenant).
- `HotsiteConfig` is scoped by `tenant_id`.
- Staff invite/deactivate use cases are scoped to the actor's `tenant_id` — a MANAGER can only manage staff in their own tenant.

**Tech Stack:**
- Repository pattern for `Tenant` and `HotsiteConfig`
- Slug uniqueness enforced at DB level (`UNIQUE(slug)`) and validated at application level before insert

---

## Future Scaling: Microservices

If BeloAuto grows beyond single business:

```
Current (MVP Monolith):
  Single PostgreSQL
  All contexts in one Node.js process
  Event bus: in-memory (Node EventEmitter)

Future (Microservices):
  Database per context (Loyalty DB, Notification DB, etc.)
  Separate Node.js processes per context
  Event bus: GCP Pub/Sub (Emulator locally, managed in production)
  API Gateway (BFF) routes to appropriate service
```

Current architecture supports this evolution without major changes.

