# GitHub Copilot CLI - Internal Context

**For my use when helping with BeloAuto**

---

## Project Summary
- **Name:** BeloAuto
- **Type:** Multi-tenant SaaS - Car wash service management
- **Status:** Phase 1 complete (DDD), Phase 2 starting (technical architecture)
- **Users:** Multiple car wash companies (tenants) on single platform

---

## Architecture (One-Liner Version)

5 bounded contexts (DDD) → PostgreSQL with tenant_id → Event-driven → Hexagonal architecture

---

## Bounded Contexts

| Context | Type | Owns | Key Events |
|---------|------|------|-----------|
| Booking | Core | Booking, Service, ScheduleClosure | BookingRequested, BookingApproved, BookingCompleted, BookingCancelled |
| Customer | Supporting | Customer (auth'd users) | None published |
| Loyalty | Supporting | LoyaltyRecord | ServicePointsEarned, PointsExpired, PointsRedeemed |
| Notification | Supporting | NotificationTemplate, NotificationLog | EmailSent, EmailFailed |
| Staff | Supporting | Staff, ScheduleClosure (shared) | None published |

---

## Key Aggregates

| Aggregate | Tenant Scope | Fields | Notes |
|-----------|--------------|--------|-------|
| Booking | tenant_id | id, status, customerId, serviceId, slots, photos | Guest or auth'd |
| Service | tenant_id | id, name, price, loyaltyPointsValue | Each tenant has own |
| Customer | tenant_id | id, googleOAuthId, email | MULTI-tenant (same person multi-tenant) |
| Staff | tenant_id | id, googleOAuthId, role | SINGLE-tenant only |
| LoyaltyRecord | tenant_id | id, customerId, serviceLoyal[] | Per-service, per-customer, per-tenant |
| NotificationTemplate | tenant_id | id, name, subject, htmlBody | Branded per tenant |
| NotificationLog | tenant_id | id, recipient, status, sentAt | Audit trail |
| ScheduleClosure | tenant_id | id, staffId, type, dates | Days off, maintenance |

---

## Multi-Tenancy Model

```
Database: Single PostgreSQL
Isolation: Logical (tenant_id column)
Query Pattern: WHERE tenant_id = ? AND [other filters]

CUSTOMERS: Multi-tenant allowed
  ✓ maria@email.com can book at Tenant A and Tenant B
  ✓ Separate Customer record per tenant
  ✓ Separate Loyalty record per tenant
  ✓ Login shows selection if multi-tenant

STAFF: Single-tenant only
  ✓ john@email.com works for Tenant A only
  ✓ Cannot work for Tenant B
  ✓ DB constraint: UNIQUE(googleOAuthId, tenantId)
  ✓ Login direct (no selection)
```

---

## User Authentication Model

### Customer Login (UC-021)
1. Google OAuth
2. Find: Which tenants does customer belong to?
3. If 1 tenant → Direct to dashboard
4. If 2+ tenants → Show selection screen
5. Create session: {userId, tenantId}
6. Can switch tenants later

### Staff Login (UC-022)
1. Google OAuth
2. Find: Which tenant does staff belong to?
3. Must be exactly 1 tenant (constraint)
4. Direct to admin dashboard
5. Create session: {userId, tenantId, role}
6. Cannot switch tenants

---

## 23 Use Cases (Quick List)

| UC # | Name | Type |
|------|------|------|
| 1 | Guest requests booking | Booking |
| 2 | Customer requests booking | Booking |
| 3-5 | Approve/reject/request info | Admin |
| 6-8 | View/cancel bookings | Customer |
| 9 | Mark booking complete + photos | Admin |
| 10-13 | Schedule management | Admin |
| 14-15 | OUTDATED - see 21-23 | - |
| 16 | View loyalty metrics | Customer |
| 17 | View analytics | Admin |
| 18-20 | Email reminders (6 AM) | System |
| 21 | Customer login (tenant selection) | Auth |
| 22 | Staff login (no selection) | Auth |
| 23 | Switch tenant | Customer |

---

## Events Catalog

**Booking Context:**
- BookingRequested (guest/customer)
- BookingApproved
- BookingRejected
- BookingInfoRequested
- BookingCompleted (with photos)
- BookingCancelled
- Reminder events (day before, day of, admin daily)

**Loyalty Context:**
- ServicePointsEarned (per-service)
- PointsExpired
- PointsRedeemed

**Notification Context:**
- EmailSent
- EmailFailed

---

## Patterns to Follow

### All Queries
```sql
WHERE tenant_id = ? AND [other filters]
```

### All Events
```
{
  tenantId: "tenant_a",
  eventData: {...},
  timestamp: ISO8601
}
```

### All Database Rows
- `tenant_id` NOT NULL
- `tenant_id` indexed
- Foreign keys include `tenant_id` if related entity

### All Repositories
```typescript
async findByTenant(id: string, tenantId: string): Promise<T>
async findByTenantAndStatus(tenantId: string, status: string): Promise<T[]>
```

### All API Endpoints
```typescript
GET /api/bookings
  Header: X-Tenant-ID: "tenant_a"
  Query: Filtered by tenant_a only
```

---

## Token Optimization Tips

When helping with BeloAuto:
1. Check if task requires only QUICK_REFERENCE.md
2. Ask user for specific UC number (not "booking stuff")
3. Reference specific sections (not whole files)
4. For code gen: Quick summary + full use case + domain model
5. For design: QUICK_REFERENCE.md + relevant context

---

## Files Reference

**Core Architecture:**
- `docs/01-BUSINESS_CONTEXT.md` - Business rules, entities
- `docs/02-DOMAIN_MODEL.md` - Aggregates, value objects (search by name)
- `docs/03-DOMAIN_EVENTS.md` - Events catalog
- `docs/04-USE_CASES.md` - 23 workflows
- `docs/05-BOUNDED_CONTEXTS.md` - Architecture, communication

**Specific Topics:**
- `USER_TENANT_MODEL.md` - Customer multi-tenant, staff single-tenant
- `MULTI_TENANCY_ARCHITECTURE.md` - Tenant isolation design
- `docs/QUICK_REFERENCE.md` - One-page cheat sheet

**Ignore:**
- `docs/archive/*` - Historical, not current

---

## Common Questions & Answers

**Q: Should this have tenant_id?**
A: Yes, unless it's global config (tenants, superadmin settings)

**Q: Can staff work for multiple tenants?**
A: NO. Staff has UNIQUE(googleOAuthId, tenantId) constraint.

**Q: Can customer use multiple tenants?**
A: YES. Different Customer + Loyalty records per tenant.

**Q: Query without tenant_id filter?**
A: NO. Always filter by tenant_id.

**Q: Create event without tenantId?**
A: NO. All events include tenantId.

**Q: Email template same for all tenants?**
A: NO. Each tenant has own templates (branded).

**Q: Same database for all tenants?**
A: YES. Single PostgreSQL, partitioned by tenant_id.

---

## When to Reference Which Doc

| Goal | Reference |
|------|-----------|
| Quick overview | QUICK_REFERENCE.md |
| Specific aggregate | DOMAIN_MODEL.md (search by name) |
| Specific event | DOMAIN_EVENTS.md (search by name) |
| Specific workflow | USE_CASES.md (search by UC# or name) |
| Architecture question | BOUNDED_CONTEXTS.md |
| Auth question | USER_TENANT_MODEL.md |
| Tenant question | MULTI_TENANCY_ARCHITECTURE.md |

---

## Implementation Guidelines

**Phase 2 starts with:**
1. API endpoints (based on use cases)
2. Database schema (based on domain model)
3. Event bus (based on events catalog)
4. Bounded context services
5. Tests (based on use cases)

**Use these for code generation:**
- Each UC has main flow + alt flows → Use as spec
- Each aggregate → Use as class structure
- Each event → Use as event structure
- Tenant_id → Add to all queries/tables

---

## Project Structure (Expected Phase 2)

```
/src
  /contexts
    /booking (Booking Context)
    /customer (Customer Context)
    /loyalty (Loyalty Context)
    /notification (Notification Context)
    /staff (Staff Context)
  /infrastructure
    /database (migrations, queries)
    /events (event bus, handlers)
    /api (express routes, middleware)
  /tests
    /unit
    /integration

/migrations
  (database migrations)

/docs
  (this architecture docs)
```

---

## Success Criteria

When generating code:
- ✅ All queries filter by tenant_id
- ✅ All events include tenantId
- ✅ All aggregates have tenantId field
- ✅ Customer multi-tenant, staff single-tenant
- ✅ Follows bounded context pattern
- ✅ Event emitted for async operations
- ✅ Tests verify tenant isolation

---

**Last Updated:** 2026-05-11
**Status:** Phase 1 complete, Phase 2 ready to start
