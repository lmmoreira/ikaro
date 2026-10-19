# Multi-Tenancy Architecture - BeloAuto

**Status:** Phase 1 Updated with Multi-Tenancy

---

## Overview

BeloAuto is a **multi-tenant SaaS platform** where multiple car wash companies (tenants) operate independently on a single shared platform.

**Key Principle:** Complete data isolation - tenants never see each other's data, even in the same database.

---

## Tenant Structure

### **What is a Tenant?**
- A tenant = A car wash company (e.g., "AutoWash Pro", "SuperClean", "QuickWash")
- BeloAuto platform hosts multiple tenants
- Each tenant is completely isolated

### **Tenant Lifecycle**

```
1. CREATION (Super Admin)
   - Super admin creates new tenant in admin panel
   - Assigns: Tenant name, tenant_id (unique identifier)
   - Example: tenant_id = "autowash-pro-001"

2. CONFIGURATION (Tenant Admin)
   - Tenant admin logs in
   - System knows: "You belong to tenant_id: autowash-pro-001"
   - Creates: Services, Staff, Email templates (all scoped to this tenant)

3. OPERATION
   - Customers book services (scoped to this tenant)
   - Staff manages bookings (sees only their tenant's data)
   - Loyalty tracked per-tenant
   - Emails sent with tenant-specific branding

4. ISOLATION
   - Tenant A cannot see Tenant B's bookings
   - Tenant A cannot access Tenant B's customers
   - Tenant A cannot view Tenant B's staff
   - Tenant A's loyalty points isolated from Tenant B
```

---

## Data Isolation Strategy

### **Single Database, Tenant-Scoped Queries**

```
PostgreSQL Database (Single instance)
│
├─ bookings table (with tenant_id column)
│  ├─ tenant_id: "autowash-pro-001", booking_id: 1, ...
│  ├─ tenant_id: "autowash-pro-001", booking_id: 2, ...
│  ├─ tenant_id: "superclean-002", booking_id: 1, ...  ← Different tenant
│  └─ ...
│
├─ customers table (with tenant_id column)
│  ├─ tenant_id: "autowash-pro-001", customer_id: 1, ...
│  ├─ tenant_id: "superclean-002", customer_id: 1, ...  ← Different tenant
│  └─ ...
│
├─ loyalty_records table (with tenant_id column)
├─ services table (with tenant_id column)
├─ staff table (with tenant_id column)
└─ ... (all tables have tenant_id)
```

### **Query Pattern**

**CORRECT (Tenant-Scoped):**
```sql
SELECT * FROM bookings 
WHERE tenant_id = 'autowash-pro-001' 
AND status = 'APPROVED'
```

**WRONG (Not Allowed):**
```sql
SELECT * FROM bookings 
WHERE status = 'APPROVED'  -- Missing tenant_id filter!
```

### **Every Database Operation**

```
Booking.findByTenantAndStatus(tenantId, status)
  → SELECT * FROM bookings WHERE tenant_id = ? AND status = ?
  
Customer.getAll(tenantId)
  → SELECT * FROM customers WHERE tenant_id = ?
  
Service.findByIdAndTenant(serviceId, tenantId)
  → SELECT * FROM services WHERE id = ? AND tenant_id = ?
  
LoyaltyRecord.findByCustomerAndTenant(customerId, tenantId)
  → SELECT * FROM loyalty_records WHERE customer_id = ? AND tenant_id = ?
```

---

## User-Tenant Association

### **Customer: Can Belong to Multiple Tenants**
- **One customer email can have bookings in multiple tenants**
- Each tenant = separate Customer record + separate Loyalty record
- On login, if customer has multiple tenants → must select which tenant to enter
- Session: {userId, tenantId} (scoped to ONE tenant at a time)

### **Staff: Belongs to ONLY ONE Tenant**
- **One staff member can work for exactly ONE tenant**
- Staff cannot work for multiple tenants
- On login, directly enters their single tenant (no selection needed)

### **Example: Customer with Multiple Tenants**

```
Person: maria@email.com (Google OAuth ID: xyz123)

Tenant A ("AutoWash Pro"): maria is Customer
  → Customer record: tenantId="autowash-pro-001", customerId=1
  → Loyalty record: tenantId="autowash-pro-001", points=50, status=SILVER
  → Bookings: 15 completed washes

Tenant B ("SuperClean"): maria is also Customer
  → Customer record: tenantId="superclean-002", customerId=1
  → Loyalty record: tenantId="superclean-002", points=8, status=BRONZE
  → Bookings: 2 completed washes

Login Flow (Customer):
  1. maria@email.com enters Google credentials
  2. System finds: maria is customer in Tenant A and Tenant B
  3. System shows selection screen:
     "Which car wash would you like to book with?
      - AutoWash Pro (Tenant A) [50 points, SILVER]
      - SuperClean (Tenant B) [8 points, BRONZE]"
  4. maria clicks: "AutoWash Pro"
  5. Session established: {userId: maria, tenantId: "tenant_a"}
  6. maria sees: Only Tenant A data (bookings, services, loyalty)
  7. If maria wants to switch: Logs out and back in, or "Switch Tenant" button

Result: Same person, two completely separate loyalty records, independent histories
```

### **Example: Staff with Single Tenant**

```
Person: john@autowashpro.com (Google OAuth ID: abc123)

ONLY Tenant A: john is Staff
  → Staff record: tenantId="autowash-pro-001", staffId=1, role="MANAGER"

NEVER: john is staff in Tenant B (not possible)

Login Flow (Staff):
  1. john@autowashpro.com enters Google credentials
  2. System finds: john is staff in Tenant A only
  3. Login successful (no selection needed)
  4. Session: {userId: john, tenantId: "tenant_a", role: "MANAGER"}
  5. john sees: Only Tenant A data (bookings, staff, services)
  6. john cannot access Tenant B (different employer)
```

---

## Event-Driven Communication (Tenant-Scoped)

### **All Events Include tenantId**

```
Event: BookingRequested
{
  tenantId: "autowash-pro-001",
  bookingId: "booking-123",
  customerId: "customer-456",
  serviceId: "service-789",
  timestamp: "2026-05-11T15:37:29Z"
}
```

### **Event Processing**

```
Booking Context:
  Creates: BookingRequested event (with tenantId)
  ↓
Event Bus (in-memory or pub/sub)
  ↓
Loyalty Context:
  Subscribes: "If BookingCompleted AND tenantId = 'autowash-pro-001'"
  Processes: Updates loyalty for this tenant only
  ↓
Notification Context:
  Subscribes: "If BookingRequested"
  Filters: Only process if tenantId matches sending context
  Sends: Email using Tenant A's templates
```

---

## Hotsite & Frontend

### **Path-Based Routing**

```
beloauto.com/autowash-pro-001
  ├─ Shows: AutoWash Pro's hotsite
  ├─ Services: AutoWash Pro's services only
  ├─ Testimonials: AutoWash Pro's testimonials
  └─ Booking: Requests scoped to AutoWash Pro

beloauto.com/superclean-002
  ├─ Shows: SuperClean's hotsite
  ├─ Services: SuperClean's services only
  ├─ Testimonials: SuperClean's testimonials
  └─ Booking: Requests scoped to SuperClean

beloauto.com/  (root)
  └─ Tenant selection or SaaS landing page
```

### **Frontend Implementation**

```typescript
// Frontend detects tenant from URL
const tenantId = extractTenantFromUrl(); // "autowash-pro-001"

// All API calls include tenant
fetch('/api/bookings', {
  headers: {
    'X-Tenant-ID': tenantId  // OR in JWT token
  }
})

// Backend validates: requestor's tenant === URL tenant
if (req.user.tenantId !== req.headers['X-Tenant-ID']) {
  throw new Error("Unauthorized: Wrong tenant");
}
```

### **Future: Custom Domains**

```
Now:   beloauto.com/autowash-pro-001
Later: autowashpro.com → (CNAME points to beloauto.com/autowash-pro-001)
```

---

## Database Schema Example

```sql
-- Services table (tenant-scoped)
CREATE TABLE services (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,  -- CRITICAL
  name VARCHAR(255),
  price DECIMAL,
  loyalty_points_value INT,
  created_at TIMESTAMP,
  UNIQUE(tenant_id, name),  -- Service name unique per tenant
  INDEX(tenant_id)
);

-- Bookings table (tenant-scoped)
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,  -- CRITICAL
  customer_id UUID,
  service_id UUID NOT NULL,
  status VARCHAR(50),
  created_at TIMESTAMP,
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id),
  INDEX(tenant_id),
  INDEX(tenant_id, status),  -- Query bookings by tenant & status
  INDEX(tenant_id, customer_id)
);

-- Customers table (tenant-scoped)
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,  -- CRITICAL
  email VARCHAR(255),
  google_oauth_id VARCHAR(255),
  created_at TIMESTAMP,
  INDEX(tenant_id),
  INDEX(tenant_id, google_oauth_id)  -- Lookup customer by tenant & google ID
);

-- All other tables follow same pattern...
```

---

## Admin Levels

### **Tenant Admin**
- Login: OAuth (Google account)
- Scope: Can only access own tenant
- Can:
  - ✓ Manage own services
  - ✓ Manage own staff
  - ✓ View own bookings
  - ✓ Configure own loyalty settings
  - ✓ View own email templates
- Cannot:
  - ✗ Create new tenants
  - ✗ Access other tenants
  - ✗ View platform-wide metrics

### **Super Admin**
- Login: OAuth (Google account) + special flag
- Scope: Access to all tenants
- Can:
  - ✓ Create new tenants
  - ✓ View all tenants' data (for support)
  - ✓ Manage platform-wide settings
  - ✓ View usage metrics per tenant
  - ✓ (Future) Manage subscriptions/billing
- Used for:
  - Support team investigations
  - Platform health monitoring
  - Onboarding new tenants

---

## Bounded Contexts (All Tenant-Scoped)

### **Booking Context**
- Services: Per-tenant (Tenant A has 3 services, Tenant B has 5)
- Bookings: Per-tenant
- ScheduleClosures: Per-tenant
- Queries: Always `WHERE tenant_id = ?`

### **Customer Context**
- Customers: Per-tenant
- One person can have different Customer records in different tenants
- Queries: Always `WHERE tenant_id = ?`

### **Loyalty Context**
- LoyaltyRecords: Per-tenant, per-customer
- Points: Isolated per-tenant
- Expiration: Per-tenant configuration
- Queries: Always `WHERE tenant_id = ?`

### **Notification Context**
- EmailTemplates: Per-tenant (Tenant A has branded templates)
- NotificationLogs: Per-tenant
- Queries: Always `WHERE tenant_id = ?`

### **Staff Context**
- Staff: Per-tenant
- One person can be staff in different tenants (separate Staff records)
- Queries: Always `WHERE tenant_id = ?`

---

## Security Guarantees

✓ **No Cross-Tenant Data Leakage**
  - Every query filtered by tenant_id
  - Code review ensures no bypasses

✓ **Authorized Access Only**
  - User must belong to tenant
  - Request must include valid tenant context
  - Backend validates: user.tenantId === requestTenantId

✓ **Event Isolation**
  - Events include tenantId
  - Subscribers filter by tenantId
  - Tenant A's events never processed by Tenant B's handlers

✓ **Database Constraints**
  - FOREIGN KEY constraints include tenant_id
  - Indexes on (tenant_id, ...) for fast filtering
  - Cannot create records without tenant_id

---

## Scaling Considerations

### **MVP (Phase 1)**
- Single PostgreSQL database
- Logical isolation (tenant_id column)
- All tenants in same schema
- Sufficient for 100s of tenants

### **Phase 2 (Growth)**
- Monitor database size
- Consider table partitioning by tenant
- Setup read replicas if needed

### **Phase 3 (Scale)**
- Option A: Shard by tenant_id (each tenant on different shard)
- Option B: Separate databases per tenant tier (enterprise vs. SMB)
- Event bus can scale independently

---

## Configuration Per Tenant

Each tenant can configure:
- ✓ Services (name, price, description, points value)
- ✓ Loyalty points expiration (6 months, 1 year, etc.)
- ✓ Email templates (branded per company)
- ✓ Business hours (8 AM - 6 PM, etc.)
- ✓ Cancellation policy (48h, 24h, etc.)
- ✓ Hotsite branding (colors, logo, testimonials)
- ✓ Staff roles and permissions (future)

---

## No Data Sharing Between Tenants

**EVER**

Example violations (all prevented):
```
❌ Showing Tenant A's bookings to Tenant B staff
❌ Comparing Tenant A's loyalty points to Tenant B
❌ Merging email lists from both tenants
❌ Cross-tenant reporting
❌ Shared customer records
```

---

## Implementation Checklist

- [x] Add `tenant_id` to all aggregates (Domain Model)
- [x] Add `tenant_id` to all events (Domain Events)
- [x] Update all use cases with tenant context
- [x] Update all database tables with tenant_id column
- [x] Implement tenant filtering in all repositories
- [x] Add tenant validation in all APIs
- [x] Add tenant isolation tests
- [x] Document tenant-aware error handling

---

**Next:** Phase 2 will detail:
- Tenant-scoped API endpoints
- JWT token structure with tenantId
- Tenant-scoped Terraform IaC
- Multi-tenant Docker Compose

