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
│  │ - LoyaltyRecord  │          │ - EmailTemplate  │             │
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
- `Booking` - A service request from guest/customer (tenant-scoped)
- `Service` - Type of car wash offered (tenant-scoped, e.g., Tenant A has 3 services, Tenant B has 5)
- `ScheduleClosure` - When schedule is closed (tenant-scoped)

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

**Published Events:**
- `BookingRequested` (includes tenantId) → consumed by Notification, Loyalty
- `BookingApproved` (includes tenantId) → consumed by Notification, Loyalty
- `BookingRejected` (includes tenantId) → consumed by Notification
- `BookingInfoRequested` (includes tenantId) → consumed by Notification
- `BookingCompleted` (includes tenantId) → consumed by Loyalty, Notification
- `BookingCancelled` (includes tenantId) → consumed by Loyalty, Notification
- Reminder events (includes tenantId)

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

**Purpose:** Tracks customer loyalty metrics **per service type, per tenant**, with points-based system and expiration.

**Owned Aggregates:**
- `LoyaltyRecord` - Customer's loyalty profile (per-service points tracking, tenant-scoped)

**Responsibilities:**
- Listen to `BookingCompleted` from Booking Context (tenant-scoped events only)
- Listen to `BookingCancelled` from Booking Context (tenant-scoped events only)
- Calculate and award points per service (based on service's points value, tenant-scoped)
- Track point expiration (configurable per tenant: 6 months, 1 year, etc.)
- Handle point expiration (auto-remove expired points, tenant-scoped)
- Provide per-service loyalty data for customer views (tenant-scoped)
- Support point redemption (when customer claims gift, tenant-scoped)

**Database:** `beloauto_loyalty` schema
- Tables: loyalty_records, service_loyalty, loyalty_point_entries
- Every row has: `tenant_id` (required, indexed)
- Queries: Always filtered by `WHERE tenant_id = ?`

**Published Events:**
- `ServicePointsEarned` (includes tenantId) → consumed by Notification
- `PointsExpired` (includes tenantId) → consumed by Notification
- `PointsRedeemed` (includes tenantId) → consumed by Notification

**Consumed Events:**
- `BookingCompleted` (from Booking, filters by tenantId)
- `BookingCancelled` (from Booking, filters by tenantId)

**Dependencies:**
- **Input:** Listens to Booking events (tenant-scoped, event-driven)
- **Output:** Publishes tenant-scoped events

**Tech Stack:**
- Event listener/subscriber pattern (tenant-scoped)
- Repository for persistence (tenant-scoped queries)
- Domain service for point calculation & expiration
- Scheduled job for point expiration cleanup (tenant-aware)

**Tenant Isolation Guarantees:**
- ✓ Cannot view other tenant's loyalty records
- ✓ Cannot access other tenant's points
- ✓ Loyalty status is per-service and per-tenant
- ✓ Events only processed within tenant boundary
- ✓ Point expiration calculated per-tenant

**Example Flow (Tenant-Scoped):**
```
TENANT A: Customer completes "Basic Wash" (points value = 1)
→ BookingCompleted event published (tenantId: "tenant_a")
→ Loyalty Context receives event (filters: tenantId = "tenant_a")
→ Adds 1 point to customer's "Basic Wash" loyalty (within Tenant A)
→ Point expires in 180 days (Tenant A's config)
→ Publishes ServicePointsEarned event (tenantId: "tenant_a")

TENANT B: (Completely separate)
→ Same customer could be member of Tenant B
→ Has separate loyalty record (different LoyaltyRecord aggregate)
→ Earns points independently for Tenant B's services
→ No cross-tenant data
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

ServicePointsEarned → Email: Customer "You earned [X] points on [Service]! Total: [Y] points"

PointsExpired → Email (optional): Customer "[X] points on [Service] have expired"

PointsRedeemed → Email: Customer "Reward claimed! [X] points remaining"
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
Event Bus (RabbitMQ, Google Pub/Sub, or in-memory for MVP)
       ↓
Loyalty Context subscribes, processes, publishes WashCompleted
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

### **2. Direct API Calls (Synchronous, Limited)**

**Only for reads or admin operations:**

```
Notification Context → GET /bookings?customerId=X (read from Booking)
Loyalty Context → GET /customer/X (read from Customer)
```

**Rules:**
- Never call APIs for business state changes
- Only for lookup/read operations
- Prefer event-driven for changes

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
| Loyalty | LoyaltyRecords, LoyaltyLog | Customer, Booking (via events) | BookingCompleted, BookingCancelled |
| Notification | Templates, Logs | - | All events |

### **Consistency Model:**

- **Strong Consistency:** Within a bounded context (single transaction)
- **Eventual Consistency:** Between contexts (event-driven)

Example:
```
1. Booking Context: Booking transitions APPROVED → COMPLETED (strong)
2. Booking publishes: BookingCompleted event
3. Loyalty Context asynchronously: Receives event, updates LoyaltyRecord
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
  Event bus: RabbitMQ or Google Pub/Sub
  API Gateway (BFF) routes to appropriate service
```

Current architecture supports this evolution without major changes.

