# Tenant Isolation Strategy - Ikaro

## Overview

Ikaro is a **multi-tenant SaaS platform** designed for absolute data isolation and professional scalability. This document defines how we separate car wash companies (tenants) at both the **Business Logic** level (User-Tenant Model) and the **Infrastructure** level (Data Isolation).

---

## 1. User-Tenant Model

We distinguish between two types of users to balance flexibility for customers and security for staff.

### **Customers: Multi-Tenant ✓**
- **Person:** `maria@email.com` can use multiple car wash companies.
- **Isolation:** Each company = separate `Customer` record + separate `Loyalty` record.
- **Login:** If Maria has bookings in 2+ tenants, she sees a **Tenant Selection** screen after Google OAuth.
- **Switching:** Customers can switch between their tenants via a "Switch Car Wash" button.

### **Staff: Multi-Tenant ✓** (updated `M13-S13`/`M13-S22`)
- **Person:** `john@autowash.com` can work for multiple companies — same model as customers, not a single-tenant restriction.
- **Isolation:** Each company = separate `Staff` record. `UNIQUE(tenant_id, google_oauth_id)` (per-tenant, not global) is enforced at the database level, so the same Google account can hold an active `Staff` row at 2+ tenants.
- **Login:** If John has an active `Staff` row at exactly one tenant, he's directed straight to his dashboard. If he has active rows at 2+ tenants, he's issued a selection token and redirected to `/select-staff-tenant` — the same shape as the customer selection screen, and also reusable post-login to switch tenants (`POST /auth/switch-staff-tenant`).
- **Provisioning:** A staff row is always created `is_active=true` (never inactive) — "pending invite" is signaled by `google_oauth_id IS NULL`, not by `is_active`. See `CLAUDE.md` §2 invariant 6.

---

## 2. Data Isolation Strategy

Ikaro uses the **"Shared Database, Shared Schema"** pattern for simplicity and cost-effectiveness, but enforces isolation through strict software patterns.

### **Logical Isolation (tenant_id)**
- **Every Table:** Every single table in the database includes a `tenant_id` column.
- **Query Pattern:** Every query **MUST** include a `tenant_id` filter.
  ```sql
  -- CORRECT
  SELECT * FROM bookings WHERE tenant_id = 'company_a' AND id = '123';
  
  -- WRONG (Security Breach)
  SELECT * FROM bookings WHERE id = '123';
  ```

### **The "Tenant Context" Flow**
1. **Detection:** The BFF extracts the `X-Tenant-ID` from the request (header or JWT).
2. **Injection:** The `RequestInterceptor` injects this ID into the Request Context.
3. **Enforcement:** The Repository layer automatically appends the `tenant_id` to all database operations.

### **Documented exemption: transport infrastructure (`shared.outbox` / `shared.inbox`)**

- `shared.outbox` and `shared.inbox` (TD24) are **not** tenant-first business tables — they are transport infrastructure, the same category as Pub/Sub itself, and their primary keys are `eventId` (`shared.outbox.id`) and `(eventId, consumerName)` (`shared.inbox`), not `tenant_id`-scoped.
- `shared.outbox` still carries a `tenant_id` column, but only for observability (logs/metrics/tracing) — never as a query filter, since the relay sweep and retention GC operate across all tenants' rows in one pass by design.
- `shared.inbox` carries no `tenant_id` at all — a consumer's dedup key is the event's own `eventId` plus its `consumerName`, which is already globally unique per event.
- **LGPD data inventory:** `shared.outbox.payload` persists the full event envelope — including customer names, emails, and phones for booking/customer events — in Postgres for `OUTBOX_RETENTION_DAYS` (default 14 days). This is not a new *class* of PII exposure (Pub/Sub already retains the same payload up to 7 days), but it is a new *store* and belongs in the data inventory alongside the tables above.

---

## 3. Communication Isolation

### **Domain Events**
All events emitted by the system include the `tenant_id`.
```json
{
  "eventName": "BookingCompleted",
  "tenantId": "autowash-pro-001",
  "payload": { "bookingId": "..." }
}
```
**Subscribers** must only process events that match their own tenant context or explicitly handle multi-tenancy (e.g., Notification service).

---

## 4. Resource Isolation

- **File Storage:** Photos are stored in paths prefixed by the tenant: `/storage/tenant_a/bookings/photo_1.jpg`.
- **Logs & Metrics:** Every log entry and Prometheus metric includes a `tenant_id` label for granular monitoring and debugging.
- **Branding:** Email templates and hotsite content are fetched dynamically based on the `tenant_id`.

---

## 5. Summary Table

| Aspect | Customer | Staff |
|--------|----------|-------|
| **Tenancy** | Multi-tenant | Multi-tenant |
| **Google ID** | Shared across records (no unique constraint) | Shared across records, but `UNIQUE(tenant_id, google_oauth_id)` per tenant |
| **Login Flow** | Selection screen (if 2+) | Direct entry (1 active tenant) or selection screen (2+ active tenants) |
| **Data Scope** | Own history per tenant | Full tenant dashboard, scoped to the selected tenant |
| **Switching** | Allowed | Allowed |

---

## Security Guarantees

1. **No Cross-Tenant Leaks:** Even if a user knows a `booking_id` from another tenant, the mandatory `WHERE tenant_id = ?` clause ensures the query returns 404/Empty.
2. **Authorized Access:** Every API request is validated: `user.tenant_id === requested.tenant_id`.
3. **Database Constraints:** Composite foreign keys `(tenant_id, id)` prevent referencing entities across boundaries.

---

**Status:** Phase 2 - Consolidated Strategy  
**Replaces:** `06-USER_TENANT_MODEL.md`, `07-MULTI_TENANCY_ARCHITECTURE.md`

---

## 4. Timezone Handling (Single Tenant Timezone Model)

### **Principle: One Timezone per Tenant**
- Each tenant operates in **exactly one timezone**
- All staff, customers, and bookings use the **tenant's timezone**
- No per-user timezone override (MVP simplicity)

### **Implementation:**

**Storage Layer (Always UTC):**
- All timestamps stored in database as **UTC (ISO 8601 with Z suffix)**
- Example: `2026-05-12T18:00:00Z` (database row)

**Tenant Configuration (Timezone Reference):**
- Tenant's timezone defined in `tenants.settings.businessHours.timezone`
- Example: `"America/New_York"`
- Configured once by tenant admin (UC-026), applies to entire tenant

**Display/Query Layer (Tenant Timezone):**
- When displaying times to user, convert UTC → tenant timezone
- When showing availability (UC-011), calculate in tenant timezone
- When sending emails/reminders, times shown in tenant timezone

**Example (UC-011 Availability):**
```
Database (UTC):        2026-05-12T18:00:00Z
Tenant Timezone:       America/New_York (UTC-4 in May)
Display to Customer:   2026-05-12 14:00 (2 PM local time)
Business Hours:        09:00–18:00 (interpreted as 09:00–18:00 EDT)
Result:                Available slot at 14:00 ET
```

**Example (UC-007 Cancellation Window):**
```
Booking Time (UTC):        2026-05-13T14:00:00Z (10 AM EDT)
Current Time (UTC):        2026-05-12T23:00:00Z (7 PM EDT)
Cancellation Window:       48 hours
Tenant Timezone:           America/New_York

Time Remaining:            15 hours
Cancellation Allowed:      No (< 48 hours)
Message to User:           "Cancellation available 48 hours before appointment.
                            Your appointment is May 13 at 10 AM ET.
                            (You have 15 hours remaining)"
```

### **Code Pattern (NestJS):**

```typescript
import { DateTime } from 'luxon';

// Get tenant's timezone
const tenantTimezone = tenant.settings.businessHours.timezone; // "America/New_York"

// Convert UTC timestamp to tenant timezone
const bookingTimeUTC = booking.scheduledAt; // ISO 8601 UTC string
const bookingTimeLocal = DateTime.fromISO(bookingTimeUTC)
  .setZone(tenantTimezone);

console.log(bookingTimeLocal.toFormat("yyyy-MM-dd HH:mm")); // "2026-05-13 10:00"

// When storing: always use UTC
const nowUTC = DateTime.now().toUTC().toISO(); // "2026-05-12T23:00:00Z"
booking.createdAt = nowUTC; // Database row
```

### **Tenant Admin Control:**
- Timezone configured in UC-026 (Tenant Settings Edit)
- Impacts: business hours interpretation, availability calculations, email timestamps
- Change applies to **future bookings only** (past bookings unaffected)
- Recommendation: do not change timezone mid-operation (confusing for existing bookings)

### **Multi-Location Future (Post-MVP):**
- If a tenant needs multiple locations with different timezones, model as separate tenants or Phase 2 enhancement
- MVP: One tenant = one timezone = one location
