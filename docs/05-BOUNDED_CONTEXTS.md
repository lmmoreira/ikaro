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
┌────────────────────────────────────────────────────────────────────────┐
│                           BeloAuto System                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      BOOKING CONTEXT  (Core)                      │ │
│  │  Aggregates: Booking (root + BookingLine), Service,               │ │
│  │             ScheduleClosure, ScheduleOpening                      │ │
│  │  Published: BookingRequested, BookingApproved, BookingRejected,   │ │
│  │             BookingInfoRequested, BookingInfoSubmitted,            │ │
│  │             BookingCompleted, BookingCancelled, BookingRescheduled,│ │
│  │             BookingReminderDue, BookingReminderDueToday,           │ │
│  │             AdminDailyScheduleReminder                             │ │
│  └──────────┬──────────────────────────────────────────┬─────────────┘ │
│             │ BookingCompleted only                    │ all events     │
│             ▼                                          ▼               │
│  ┌──────────────────────┐              ┌───────────────────────────┐  │
│  │   LOYALTY CONTEXT    │              │   NOTIFICATION CONTEXT    │  │
│  │   (Supporting)       │              │   (Supporting)            │  │
│  │                      │              │                           │  │
│  │  Aggregates:         │              │  Aggregates:              │  │
│  │  - LoyaltyEntry      │              │  - NotificationTemplate   │  │
│  │    (append-only)     │              │  - NotificationLog        │  │
│  │                      │  ServicePointsEarned, PointsExpiringSoon │  │
│  │  Published:          │──────────────►                           │  │
│  │  - ServicePointsEarned              │  Sends email via          │  │
│  │  - PointsExpiringSoon│              │  IEmailSender port        │  │
│  │                      │              │  (default: SendGrid)      │  │
│  └──────────────────────┘              │                           │  │
│                                        │  Published:               │  │
│                                        │  - EmailSent              │  │
│                                        │  - EmailFailed            │  │
│                                        └───────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────┐  ┌────────────────────┐  ┌───────────────┐  │
│  │   CUSTOMER CONTEXT   │  │   STAFF CONTEXT    │  │PLATFORM CONTEXT│ │
│  │   (Supporting)       │  │   (Supporting)     │  │(Foundational) │  │
│  │                      │  │                    │  │               │  │
│  │  Aggregates:         │  │  Aggregates:       │  │  Aggregates:  │  │
│  │  - Customer (root)   │  │  - Staff (root)    │  │  - Tenant     │  │
│  │    (multi-tenant)    │  │    (single-tenant) │  │  - Hotsite-   │  │
│  │                      │  │                    │  │    Config     │  │
│  │  No published events │  │  Published:        │  │               │  │
│  │  (passive context)   │  │  - StaffInvited    │  │  Published:   │  │
│  └──────────────────────┘  │  - StaffDeactivated│  │  - TenantProv.│ │
│                             └────────────────────┘  └───────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Context Descriptions

### **1. Booking Context (Core Domain, Tenant-Scoped)**

**Purpose:** The heart of BeloAuto. Manages the complete booking lifecycle **for a specific tenant**.

**Owned Aggregates:**
- `Booking` (root) — a customer visit; parent of 1..N `BookingLine` child entities (tenant-scoped). The Booking aggregate enforces ≥1 line, snapshots line fields at request time, and computes `totalPrice` / `totalDurationMins` from its lines.
- `Service` — type of car wash offered (tenant-scoped). Edits to a service NEVER retroactively affect past bookings — the `BookingLine` snapshot is the source of truth for an existing booking.
- `ScheduleClosure` — blocks the schedule for a full day or a partial time window (tenant-scoped).
- `ScheduleOpening` — opens a normally-closed day (per `business_hours`) for a specific time window (tenant-scoped). Inverse of `ScheduleClosure`.

**Responsibilities:**
- Accept booking requests (guest & authenticated customers) for a specific tenant
- Validate calendar availability for that tenant only
- Manage approval/rejection workflow (tenant-scoped)
- Track booking state changes (tenant-scoped)
- Support cancellations with business rules (48h, tenant-scoped)
- Trigger workflow changes

**Database:** `beloauto_booking` schema
- Tables: bookings, services, schedule_closures, schedule_openings, booking_audit_logs
- Every row has: `tenant_id` (required, indexed)
- Queries: Always filtered by `WHERE tenant_id = ?`

**Published Events** (every event carries `tenantId`, `eventId`, `occurredAt`, `correlationId`):
- `BookingRequested` → consumed by **Notification only**
- `BookingApproved` → consumed by **Notification only**
- `BookingRejected` → consumed by Notification
- `BookingInfoRequested` (PENDING → INFO_REQUESTED) → consumed by Notification
- `BookingInfoSubmitted` (INFO_REQUESTED → PENDING) → consumed by Notification
- `BookingCompleted` → consumed by **Loyalty** (inserts LoyaltyEntry per line) and **Notification**
- `BookingCancelled` → consumed by Notification
- `BookingRescheduled` → consumed by Notification
- Cron-emitted reminder events: `BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder` → all consumed by Notification

> **Loyalty only subscribes to `BookingCompleted`.** It does not consume any other Booking event.

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
- ✓ Cannot view other tenant's schedule closures or openings
- ✓ Events are tagged with tenantId
- ✓ Staff member from Tenant A sees only Tenant A bookings

---

### **2. Loyalty Context (Supporting Domain, Tenant-Scoped)**

**Purpose:** Track points earned by customers for completed services, with per-tenant expiration, and allow admins to record point redemptions.

**Owned Aggregates:**
- `LoyaltyEntry` — one immutable row per booking line completion. Append-only. Never updated or deleted.
- `LoyaltyBalance` — running active point total per `(tenant_id, customer_id)`. O(1) reads. Updated atomically on earn, redeem, and expiry.
- `LoyaltyRedemption` — append-only audit record of each admin-recorded redemption.

**Responsibilities:**
- Listen to `BookingCompleted` from Booking Context. When the booking has a `customerId`, insert a `LoyaltyEntry` and increment `LoyaltyBalance` in one transaction.
- Allow admin to record a redemption via `POST /v1/loyalty/redeem` — insert `LoyaltyRedemption` and decrement `LoyaltyBalance` atomically.
- Run a **daily expiry cron** at 02:00 UTC: compute points from `loyalty_entries` that expired that day and decrement `loyalty_balances.current_points` accordingly. Idempotent via `balance_expiry_log`.
- Run a **weekly cron** (Mondays 06:00 tenant-local) to emit `PointsExpiringSoon` warnings for entries expiring within the next 7 days.

**Database:** `loyalty` schema
- `loyalty_entries` — INSERT-only, UNIQUE(tenant_id, booking_line_id)
- `loyalty_balances` — UNIQUE(tenant_id, customer_id); current_points CHECK >= 0
- `loyalty_redemptions` — INSERT-only
- `balance_expiry_log` — PK(tenant_id, customer_id, expiry_date) — idempotency for cron
- `processed_events` — event consumer dedup table
- See `docs/13-DATABASE_SCHEMA.md` for full column definitions.

**Published Events** (every event carries `tenantId`, `eventId`, `occurredAt`, `correlationId`):
- `ServicePointsEarned` → consumed by Notification. **One event per `BookingLine`** — a 3-line booking produces 3 events.
- `PointsExpiringSoon` → consumed by Notification. Forward-looking weekly warning.

**Consumed Events:**
- `BookingCompleted` (from Booking) — **the only event Loyalty subscribes to.** For each line in `data.lines[]`, insert one `LoyaltyEntry` when `customerId != null`.

**Tech Stack:**
- Event subscriber pattern (GCP Pub/Sub via `IEventBus` port — idempotent via `UNIQUE(tenant_id, booking_line_id)`)
- Repositories for `loyalty_entries`, `loyalty_balances`, `loyalty_redemptions` (insert + select; balances also update)
- `@Cron('0 2 * * *')` NestJS scheduler for daily expiry
- **Weekly cron** (Mondays 06:00 tenant-local) for `PointsExpiringSoon` warnings

**Tenant Isolation Guarantees:**
- ✓ Cannot read another tenant's rows — all queries filter `tenant_id`
- ✓ Expiration window is per-tenant via `tenants.settings.loyalty.expiry_days`
- ✓ Events filtered by `tenantId` on consume

**Example flow (tenant-scoped, multi-line booking):**
```
TENANT A: customer completes a booking with 3 lines:
  • Basic Wash    (points_value = 1)
  • Wax           (points_value = 3)
  • Interior Vac  (points_value = 1)
  (tenants.settings.loyalty.expiry_days = 180)

→ BookingCompleted (envelope.tenantId = "tenant_a") published by Booking

→ Loyalty Context inserts 3 LoyaltyEntry rows and increments LoyaltyBalance by 5 (all in one tx):
     balance: current_points = 5

→ Loyalty Context publishes 3 ServicePointsEarned events (one per line).

~173 days later, weekly cron notices entry1 expires within 7 days:
→ PointsExpiringSoon published; NO DB write.

Day 180 (02:00 UTC), daily expiry cron:
→ Finds entries with expires_at::date = today for this customer.
→ Inserts into balance_expiry_log (ON CONFLICT DO NOTHING — idempotent).
→ Decrements loyalty_balances.current_points by 1 (basic wash point).
→ Balance: current_points = 4.

Admin records a redemption (customer exchanges 4 points for a free wash):
→ POST /v1/loyalty/redeem { customerId, pointsToRedeem: 4, notes: "free wash voucher" }
→ LoyaltyRedemption inserted + current_points decremented to 0 in one transaction.

TENANT B (completely separate):
→ Same customer can also use Tenant B
→ All tables scoped to tenant_id="tenant_b" — completely independent
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

BookingRescheduled → Email: Customer/guest "Your booking has been rescheduled to [new date/time]"

BookingReminderDue → Email: Customer/guest "Reminder: your appointment is tomorrow at [time]"

BookingReminderDueToday → Email: Customer/guest "Reminder: your appointment is today at [time]"

AdminDailyScheduleReminder → Email: Admin "Today's schedule: [X] appointments, see details below"

ServicePointsEarned → (Notification may batch per booking) Email: Customer "You earned [total] points across [N] services in your last visit."

PointsExpiringSoon → Email (weekly digest): Customer "Heads up — [X] points on [Service] will expire on [date]. Book again to keep earning."
```

**Dependencies:**
- **Input:** Event stream from all contexts (decoupled via event bus)
- **Output:** Calls SendGrid/SES API

**Tech Stack:**
- Event subscriber pattern (GCP Pub/Sub via `IEventBus`)
- Email template engine (Handlebars or EJS)
- `IEmailSender` port with SendGrid adapter as default implementation (swappable)
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

> `ScheduleClosure` is **owned by the Booking Context** — it directly controls calendar availability. Staff Context references `ScheduleClosure` read-only (by `tenant_id` and `staff_id`) when displaying staff schedules. No writes to `schedule_closures` originate from the Staff Context.

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
- GCP Pub/Sub Emulator (Docker) locally; GCP Pub/Sub (managed) in production
- All event handling is asynchronous from day one via the `IEventBus` port

---

### **2. Direct API Calls (Synchronous)**

**The BFF Gateway as the Orchestrator:**
- The BFF is the only entry point for the **Web Layer** (Hotsite & Dashboard).
- When a Hotsite loads, the BFF queries the **Tenant Context** to build the **Hotsite Manifest**.
- When a Dashboard loads, the BFF validates the JWT and aggregates data from multiple contexts (e.g., Bookings + Loyalty) to provide a unified "Customer Profile" or "Admin Dashboard" response.

---

### **3. ScheduleClosure Reference**

`ScheduleClosure` is owned by the **Booking Context**. When a staff member creates a day-off entry, the write goes through the Booking Context use case (UC-010). The Staff Context never writes to `schedule_closures` directly — it reads closures for display purposes only (filtered by `tenant_id` and `staff_id`).

---

## Context Isolation Contract

These rules are **non-negotiable**. Any violation creates cross-context coupling — the spaghetti that eventually prevents independent testing, deployment, and evolution of each context. CI code review MUST reject PRs that break them.

---

### Rule 1 — No Cross-Context Module Imports

A NestJS module belonging to Context A **MUST NOT** import any code from Context B's module path (`src/contexts/<B>/`).

```typescript
// ❌ FORBIDDEN — Loyalty module importing from Customer context
import { CustomerRepository } from '../../customer/infrastructure/persistence/customer.repository';
import { Customer } from '../../customer/domain/entities/customer.entity';

// ✅ ALLOWED — importing from src/shared/ (cross-cutting concerns only)
import { IEventBus } from '../../../shared/ports/event-bus.interface';
import { Money } from '../../../shared/value-objects/money';

// ✅ ALLOWED — importing from within the same context
import { LoyaltyEntry } from '../domain/entities/loyalty-entry.entity';
```

NestJS module files (`*.module.ts`) MUST NOT `imports:` or `providers:` any class from another context's module.

---

### Rule 2 — Communication via Events or BFF Only

| Need | Allowed pattern | Forbidden |
|---|---|---|
| Notify another context of a state change | Publish a domain event via `IEventBus` | Direct method call |
| Read data from another context (Web Layer) | BFF aggregates from each context's own API | Context A calling Context B's service |
| React to another context's state change | Subscribe to that context's event | Polling or shared DB query |

```typescript
// ❌ FORBIDDEN — Booking use case calling Loyalty directly
class CompleteBookingUseCase {
  constructor(private loyaltyService: LoyaltyService) {}  // cross-context injection
}

// ✅ CORRECT — Booking publishes; Loyalty subscribes independently
class CompleteBookingUseCase {
  constructor(private eventBus: IEventBus) {}  // only the shared port
  async execute(...) {
    // ... domain logic ...
    await this.eventBus.publish(new BookingCompleted(...));
  }
}
```

---

### Rule 3 — Database Schema Isolation

Each context owns its own **PostgreSQL schema**. TypeORM entities in a context only reference tables within that context's schema.

| Context | Schema |
|---|---|
| Booking | `booking` |
| Customer | `customer` |
| Staff | `staff` |
| Loyalty | `loyalty` |
| Notification | `notification` |
| Platform | `platform` |

**Cross-context UUID references have no DB-level FK constraint.** If `loyalty.loyalty_entries` needs to reference a booking, it stores `booking_id UUID` with no `REFERENCES booking.bookings(id)`. Referential integrity across contexts is the application's responsibility (enforced by events and idempotency keys).

```sql
-- ✅ Intra-context FK (within booking schema) — ALLOWED
ALTER TABLE booking.booking_lines
  ADD CONSTRAINT fk_booking_lines_booking
  FOREIGN KEY (booking_id) REFERENCES booking.bookings(id);

-- ❌ Cross-context FK — FORBIDDEN
ALTER TABLE loyalty.loyalty_entries
  ADD CONSTRAINT fk_loyalty_booking
  FOREIGN KEY (booking_id) REFERENCES booking.bookings(id);  -- couples schemas

-- ✅ Correct: store UUID, no constraint
-- booking_id UUID NOT NULL  ← just a column, no FK
```

**One exception:** every table keeps `tenant_id` with a FK to `platform.tenants`. Tenant existence is a foundational platform invariant — not a context coupling.

```sql
-- ✅ tenant_id FK to platform.tenants is the one allowed cross-schema FK
ALTER TABLE booking.bookings
  ADD CONSTRAINT fk_bookings_tenant
  FOREIGN KEY (tenant_id) REFERENCES platform.tenants(id);
```

---

### Rule 4 — Self-Contained Events

Events carry all data their consumers need. A consumer **MUST NOT** query another context to fill in data missing from an event.

```typescript
// ❌ FORBIDDEN — Notification handler querying Customer context
async handle(event: BookingApproved) {
  const customer = await this.customerRepo.findById(event.customerId); // cross-context query
  await this.send(customer.email, ...);
}

// ✅ CORRECT — event carries everything Notification needs
async handle(event: BookingApproved) {
  await this.send(event.contactEmail, ...);  // email is in the event payload
}
```

If a consumer needs data that the event does not carry, the fix is to **add that data to the event payload** — not to add a cross-context query.

---

### Rule 5 — Shared Folder for Cross-Cutting Concerns Only

`src/shared/` is the **only** place code is shared across contexts.

| What belongs in `src/shared/` | What does NOT |
|---|---|
| `IEventBus` port | Any entity or aggregate |
| `IEmailSender` port | Any use case |
| Base classes: `AggregateRoot`, `DomainEvent`, `ValueObject` | Any repository implementation |
| Value objects used by multiple contexts: `Money`, `Address` | Any context-specific domain service |
| `TenantContext` (request-scoped tenant identity) | Any controller |
| Logger, OTel utilities | Any context-specific DTO |
| Pagination DTOs, RFC 9457 error base type | |

If you find yourself wanting to put a domain concept in `shared/`, it is a signal that either (a) it belongs to a specific context, or (b) it should become its own context.

---

### Rule 6 — No Shared Domain State

If two contexts represent the same real-world data, each owns its own copy. Data reaches a context via events and is stored locally if queries need it.

```
✅ Correct:
  booking.bookings.contact_email        VARCHAR  ← Booking owns this copy
  notification.notification_logs.recipient  VARCHAR  ← Notification owns its copy
  Both received the email from the BookingRequested event.

❌ Wrong:
  Notification queries customer.customers to get the email.
```

---

## Data Ownership & Consistency

### **Each context owns its data:**

| Context | Owns | Reads | Watches |
|---------|------|-------|---------|
| Booking | Bookings, Services, ScheduleClosures, BookingLines | — | — |
| Customer | Customers | — | — |
| Staff | Staff members | — | — |
| Loyalty | LoyaltyEntry (append-only, insert only) | Customer, Booking (via events) | `BookingCompleted` only — inserts one `LoyaltyEntry` per line; idempotent on `UNIQUE(tenant_id, booking_line_id)` |
| Notification | NotificationTemplates, NotificationLogs | — | All events from all contexts |
| Platform | Tenants, HotsiteConfigs | — | — |

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
Current (MVP Modular Monolith):
  Single PostgreSQL
  All contexts in one Node.js process (NestJS modules)
  Event bus: GCP Pub/Sub Emulator (Docker locally) · GCP Pub/Sub (production)
  BFF: separate NestJS service in apps/bff/

Future (Microservices — only if needed at scale):
  Database per context (Loyalty DB, Notification DB, etc.)
  Separate Node.js processes per context
  Event bus: same GCP Pub/Sub (or Kafka via IEventBus swap)
  API Gateway (BFF) routes to appropriate service
```

Current architecture supports this evolution without major changes.

