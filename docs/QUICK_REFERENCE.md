# Quick Reference - Ikaro Architecture

**One-page cheat sheet for developers & AI agents**

---

## Project at a Glance

**What:** Multi-tenant car wash booking SaaS
**Why:** Enable multiple car wash companies on single platform
**How:** DDD + Event-driven + Hexagonal architecture
**Where:** Cloud-Agnostic (Docker-centric)

---

## ⭐ Core Engineering Principles

**→ Full Details:** See `docs/07-ENGINEERING_PRINCIPLES.md`

- **Simplicity:** Choose the simplest solution; avoid overengineering.
- **SaaS Mindset:** Build for reliability, scalability, and security from day one.
- **Professionalism:** Follow clean code, DRY, and SOLID principles.
- **Quality:** Mandatory automated tests and CI-compatible code.
- **Verification:** Always validate changes through testing and linting.

---

## ✅ DO's and ❌ DON'Ts

| ✅ DO | ❌ DON'T |
|-------|----------|
| Filter all queries by `tenant_id` | Query without tenant scope |
| Include `tenantId` in all events | Emit events without tenant context |
| Write tests first (TDD) | Code first, test later |
| Run `pnpm test && pnpm lint` locally | Commit without running tests |
| Use environment variables | Hardcode config/secrets |
| Ask for clarification | Assume requirements |
| Fix linting warnings | Suppress warnings with comments |
| Keep functions < 20 lines | Write monolithic functions |
| Verify customer multi-tenant rules | Treat all entities as multi-tenant |
| Enforce staff single-tenant constraint | Allow staff across multiple tenants |

---

## Standard Tech Stack

| Component | Technology | Role |
|-----------|------------|------|
| **Backend** | NestJS (Node.js) | Core DDD Business Logic |
| **Frontend** | React (TypeScript) | Web Dashboard & Hotsite |
| **BFF** | NestJS | Backend-for-Frontend Gateway |
| **Database** | PostgreSQL | Multi-tenant Relational Storage |
| **Event Bus** | GCP Pub/Sub (Emulator locally) | Asynchronous Communication |
| **Observability** | Prometheus & Grafana | Metrics & Dashboards |
| **Tracing** | OpenTelemetry (OTel) | Distributed Tracing |
| **Logging** | Loki / JSON to stdout | Centralized Logging |
| **Orchestration** | Docker / Managed Platform | Container Runtime |

---

## 6 Bounded Contexts

| Context | Owns | Key Aggregates | Key Events |
|---------|------|----------------|-----------|
| **Booking** (Core) | Bookings, BookingLines, Services, ScheduleClosures | Booking, Service, ScheduleClosure | BookingRequested, BookingApproved, BookingCompleted, BookingCancelled, BookingRescheduled |
| **Customer** (Support) | Authenticated users (multi-tenant) | Customer | — |
| **Loyalty** (Support) | Points earned, running balances, redemptions | LoyaltyEntry, LoyaltyBalance, LoyaltyRedemption | ServicePointsEarned, PointsExpiringSoon |
| **Notification** (Support) | Email sending | NotificationTemplate, NotificationLog | EmailSent, EmailFailed |
| **Staff** (Support) | Employees (single-tenant) | Staff | — |
| **Platform** (Foundational) | Tenants, hotsite config | Tenant, HotsiteConfig | StaffInvited, StaffDeactivated |

---

## Multi-Tenancy Model

| Aspect | Customer | Staff |
|--------|----------|-------|
| # Tenants | Multiple ✓ | Single Only |
| Login | Selection if 2+ | Direct |
| Records | Separate per tenant | One record only |
| Loyalty | Separate per tenant | N/A |
| DB Constraint | None on email | UNIQUE(email, tenantId) |

**Query Pattern:**
```sql
SELECT * FROM [table] WHERE tenant_id = ? AND [other filters]
```

---

## 27 Active Use Cases (UC-014 and UC-015 superseded by UC-021/022)

| Category | Use Cases |
|----------|-----------|
| Booking | UC-001 (guest), UC-002 (customer), UC-003–008 (approve/reject/cancel/reschedule), UC-009 (complete) |
| Calendar | UC-010 (close schedule), UC-011 (view calendar) |
| Services | UC-012 (create), UC-013 (edit/deactivate) |
| Auth | UC-021 (customer login + tenant selection), UC-022 (staff login), UC-023 (switch tenant) |
| Loyalty | UC-016 (view active points + per-service breakdown) |
| Notifications | UC-018 (admin daily digest @ 6 AM), UC-019 (day-before reminder), UC-020 (day-of reminder) |
| Analytics | UC-017 (future, out of MVP) |
| Platform | UC-024 (provision tenant CLI), UC-025 (first login / accept invite), UC-026 (edit settings), UC-027 (manage hotsite), UC-028 (invite staff), UC-029 (deactivate staff) |

---

## Domain Model (Key Aggregates)

### Booking Aggregate (parent of ≥ 1 BookingLine)
```
Booking {
  bookingId, tenantId
  status: PENDING|INFO_REQUESTED|APPROVED|REJECTED|COMPLETED|CANCELLED
  type: GUEST|CUSTOMER
  customerId (if customer)
  contactEmail, contactPhone, contactName
  scheduledAt
  totalDurationMins   = SUM(lines.durationMinsAtBooking)   -- denormalised, derived
  totalPrice          = SUM(lines.priceAtBooking)          -- denormalised, derived
  beforeServicePhotoUrls[]
  afterServicePhotoUrls[]
  adminNotes, rejectionReason, cancellationReason
  infoRequestText, infoSubmittedPayload, infoRequested/SubmittedAt/By
  createdAt, approvedAt, completedAt, cancelledAt
  lines: BookingLine[]   -- ≥ 1
}

BookingLine {
  lineId, bookingId, tenantId, serviceId
  priceAtBooking          -- snapshot, immutable
  durationMinsAtBooking   -- snapshot, immutable
  pointsValueAtBooking    -- snapshot, immutable → becomes LoyaltyEntry.points on completion
}
```
**Rules:** ≥ 1 line; same serviceId may repeat; lines frozen once status = APPROVED.

### Customer Aggregate
```
Customer {
  customerId, tenantId
  googleOAuthId (NOT unique - same person multi-tenant)
  email, phone, name
  createdAt
}
```

### Staff Aggregate
```
Staff {
  staffId, tenantId
  googleOAuthId (UNIQUE with tenantId)
  email, role, isActive
  createdAt
}
```

### Service Aggregate
```
Service {
  serviceId, tenantId
  name, description
  price, durationMinutes
  loyaltyPointsValue (e.g., 1, 2, 3)
  createdAt, updatedAt
}
```

### LoyaltyEntry Aggregate (append-only)
```
LoyaltyEntry {
  entryId, tenantId, customerId
  bookingId, bookingLineId, serviceId
  points       (positive int — = BookingLine.pointsValueAtBooking, frozen)
  earnedAt
  expiresAt    (= earnedAt + tenants.settings.loyalty.expiryDays; never null)
}
```

**One row per BookingLine.** A 3-line booking → 3 LoyaltyEntry rows on completion. Idempotent on `UNIQUE(tenant_id, booking_line_id)`. Insert-only, never updated, never deleted.

### LoyaltyBalance Aggregate (O(1) balance)
```
LoyaltyBalance {
  tenantId, customerId  (composite PK — no surrogate id)
  currentPoints         (int ≥ 0 — running total; CHECK constraint at DB level)
  updatedAt
}
```

PRIMARY KEY (tenant_id, customer_id). Upserted on earn, decremented on redemption or daily expiry trigger (GCP Cloud Scheduler → POST /cron/loyalty-expiry). Read this for balance — do NOT compute SUM over entries.

### LoyaltyRedemption Aggregate (append-only)
```
LoyaltyRedemption {
  id, tenantId, customerId
  pointsRedeemed  (positive int)
  redeemedBy      (staffId)
  notes?
  redeemedAt
}
```

Insert-only audit log. Written in same transaction as LoyaltyBalance decrement.

**Out of MVP scope:** manual adjustments, tier labels (BRONZE/SILVER/GOLD). Gifts beyond point redemption are admin-driven outside the system.

---

## Event Catalog

### Booking Events
Every event has the standard envelope `{ eventId, tenantId, occurredAt, correlationId, data: {...} }`. The fields below are the `data` payload.

```
BookingRequested        { bookingId, type, email, scheduledAt, totalPrice, totalDurationMins, lines[…], beforeServicePhotoUrls[] }
BookingApproved         { bookingId, customerId?, approvedBy, approvedSlot, totalPrice, lineSummary[] }
BookingRejected         { bookingId, reason, rejectedBy }
BookingInfoRequested    { bookingId, informationNeeded, requestedBy }
BookingInfoSubmitted    { bookingId, infoPayload, submittedBy }
BookingCompleted        { bookingId, completedBy, completedSlot, afterServicePhotoUrls[], lines[] }
BookingCancelled        { bookingId, cancelledBy, isBusiness, reason? }
BookingRescheduled      { bookingId, newSlot, previousSlot, rescheduledBy }
BookingReminderDue         { bookingId, recipientEmail, appointmentSlot, lines[] }   ← cron emits; Notification sends email
BookingReminderDueToday    { bookingId, recipientEmail, appointmentSlot, lines[] }   ← cron emits; Notification sends email
AdminDailyScheduleReminder { staffEmail, bookingsToday[] }                           ← cron emits; Notification sends digest
```

**Loyalty consumer rule:** Loyalty Context consumes ONLY `BookingCompleted`. None of the other Booking events change loyalty state.

### Loyalty Events
```
ServicePointsEarned  { tenantId, customerId, bookingLineId, serviceId, pointsEarned, expiresAt }
PointsExpiringSoon   { tenantId, customerId, serviceId, pointsExpiringSoon, earliestExpiresAt }
```

---

## Authentication Flows

### Customer Login (UC-021)
```
1. Google OAuth
2. Query: which tenants?
3. If 1 → dashboard
4. If 2+ → selection screen
5. Session: {userId, tenantId}
```

### Staff Login (UC-022)
```
1. Google OAuth
2. Query: which tenant? (must be exactly 1)
3. Dashboard
4. Session: {userId, tenantId, role}
```

### Switch Tenant (UC-023)
```
1. Customer clicks "Switch"
2. Logout current session
3. Back to selection
4. New session: {userId, tenantId}
```

---

## Common Patterns

**Tenant-Scoped Repository:**
```typescript
async findByTenant(id: string, tenantId: string): Promise<T>
async findAllByTenant(tenantId: string): Promise<T[]>
async save(entity: T, tenantId: string): Promise<void>
```

**Event Handler:**
```typescript
@EventHandler(BookingCompleted)
async handle(event: BookingCompleted) {
  if (!this.isMyTenant(event.tenantId)) return;
  // Process only if event is for my tenant
}
```

**Database Query:**
```sql
SELECT * FROM bookings 
WHERE tenant_id = $1 AND status = $2
```

---

## Database Schema Pattern

```sql
-- Every table has tenant_id
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id UUID,
  service_id UUID NOT NULL,
  status VARCHAR(50),
  -- ... other fields
  
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(tenant_id, service_id) REFERENCES services(tenant_id, id),
  
  INDEX(tenant_id),
  INDEX(tenant_id, status)
);

-- Staff can only be in one tenant
CREATE TABLE staff (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  google_oauth_id VARCHAR(255) NOT NULL,
  role VARCHAR(50),
  
  UNIQUE(tenant_id, google_oauth_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  INDEX(tenant_id, google_oauth_id)
);

-- Customer can be in multiple tenants
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  google_oauth_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  
  -- NO unique constraint on google_oauth_id
  -- Because: maria can be customer in tenant_a AND tenant_b
  
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  INDEX(tenant_id, google_oauth_id)
);
```

---

## Implementation Checklist

### When Creating Endpoint/Service
- [ ] Queries filter by `tenant_id`
- [ ] Events include `tenantId`
- [ ] Aggregates have `tenantId` field
- [ ] Multi-tenant customer logic correct
- [ ] Staff single-tenant constraint enforced
- [ ] Database migration includes `tenant_id`
- [ ] Tests verify tenant isolation

### For Code Generation
- [ ] Reference specific UC number
- [ ] Include use case main flow
- [ ] Add alt flows as error handling
- [ ] Follow aggregate structure from DOMAIN_MODEL.md
- [ ] Emit events to event bus
- [ ] Return proper status codes

---

## Where to Find Details

| Need | File |
|------|------|
| Business rules | docs/01-BUSINESS_CONTEXT.md |
| Specific aggregate | docs/02-DOMAIN_MODEL.md (search name) |
| Specific event | docs/03-DOMAIN_EVENTS.md (search name) |
| Specific UC | docs/04-USE_CASES.md (search UC#) |
| Architecture | docs/05-BOUNDED_CONTEXTS.md |
| Multi-tenancy | docs/06-TENANT_ISOLATION_STRATEGY.md |
| This summary | docs/QUICK_REFERENCE.md |

---

## Token Budget by Task

| Task | Budget | Approach |
|------|--------|----------|
| Quick question | 3K | Read this page + ask |
| Design review | 20K | QUICK_REFERENCE.md + relevant context |
| Code generation | 40K | UC + domain model + events |
| Full feature | 70K | UC + all related contexts + tests |
| Architecture | 100K | Multiple contexts + patterns |

---

## Quick Answers

**Q: tenant_id missing?** → Add it
**Q: Staff in 2 tenants?** → Invalid (constraint prevents it)
**Q: Customer in 2 tenants?** → Valid (separate records)
**Q: Event without tenantId?** → Invalid (add tenantId)
**Q: Query without tenant filter?** → Invalid (add WHERE clause)
**Q: Same email template for all?** → No (each tenant branded)
**Q: Cache needed?** → Not for Phase 1 (small startup)
**Q: Custom domains?** → Phase 2+ (start with subdomains)

---

**Last Updated:** 2026-05-11
**Status:** Phase 1 complete | Phase 2 ready
**Next:** Implement UC-021, UC-022, database schema
