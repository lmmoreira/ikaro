# Quick Reference - BeloAuto Architecture

**One-page cheat sheet for developers & AI agents**

---

## Project at a Glance

**What:** Multi-tenant car wash booking SaaS
**Why:** Enable multiple car wash companies on single platform
**How:** DDD + Event-driven + Hexagonal architecture
**Where:** GCP (cloud-agnostic)

---

## 5 Bounded Contexts

| Context | Owns | Key Aggregates | Key Events |
|---------|------|----------------|-----------|
| **Booking** (Core) | Bookings, Services, Closures | Booking, Service | BookingRequested, BookingApproved, BookingCompleted, BookingCancelled |
| **Customer** (Support) | Authenticated users | Customer | - |
| **Loyalty** (Support) | Points & rewards | LoyaltyRecord | ServicePointsEarned, PointsExpired, PointsRedeemed |
| **Notification** (Support) | Email sending | NotificationTemplate, NotificationLog | EmailSent, EmailFailed |
| **Staff** (Support) | Employees | Staff, ScheduleClosure | - |

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

## 23 Use Cases

| Category | Use Cases |
|----------|-----------|
| Booking | UC-001 (guest), UC-002 (customer), UC-003-008 (approve/cancel), UC-009 (complete) |
| Calendar | UC-010 (close schedule), UC-011 (view calendar) |
| Services | UC-012 (create), UC-013 (edit) |
| Auth | UC-021 (customer login), UC-022 (staff login), UC-023 (switch tenant) |
| Loyalty | UC-016 (view metrics) |
| Notifications | UC-018-020 (reminders @ 6 AM) |
| Analytics | UC-017 (future) |

**Key UCs to implement Phase 2:**
- UC-021: Customer login (Google OAuth + tenant selection)
- UC-022: Staff login (Google OAuth, no selection)
- UC-001: Guest booking request

---

## Domain Model (Key Aggregates)

### Booking Aggregate
```
Booking {
  bookingId, tenantId
  status: PENDING|APPROVED|REJECTED|COMPLETED|CANCELLED
  type: GUEST|CUSTOMER
  customerId (if customer)
  guestEmail, guestPhone, guestName
  serviceId, preferredDate/time
  carPhotoUrls[] (multiple)
  afterServicePhotoUrls[] (multiple, optional)
  price, notes
  createdAt, approvedAt, completedAt, cancelledAt
}
```

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

### LoyaltyRecord Aggregate
```
LoyaltyRecord {
  loyaltyId, tenantId, customerId
  serviceLoyal[]: {
    serviceId, serviceName
    totalPoints
    completions
    expiresAt (configurable: 180 days, etc.)
    pointEntries[] (history)
  }
  createdAt, updatedAt
}
```

---

## Event Catalog

### Booking Events
```
BookingRequested {tenantId, bookingId, type, email, serviceId, date}
BookingApproved {tenantId, bookingId, customerId?, approvedBy}
BookingRejected {tenantId, bookingId, reason}
BookingCompleted {tenantId, bookingId, completedBy, photos[]}
BookingCancelled {tenantId, bookingId, cancelledBy}
BookingReminderSentCustomer {tenantId, bookingId, email}
BookingReminderSentCustomerDay {tenantId, bookingId, email}
AdminDailyScheduleReminder {tenantId, bookings[]}
```

### Loyalty Events
```
ServicePointsEarned {tenantId, customerId, serviceId, points}
PointsExpired {tenantId, customerId, serviceId, points}
PointsRedeemed {tenantId, customerId, serviceId, reward}
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
| Auth model | USER_TENANT_MODEL.md |
| Multi-tenancy | MULTI_TENANCY_ARCHITECTURE.md |
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
