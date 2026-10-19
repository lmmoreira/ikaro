# User-Tenant Model - BeloAuto

**Updated:** Corrected user-tenant association model

---

## Model Summary

### **Customers: Multi-Tenant ✓**
- One person can book at multiple car wash companies
- Each company = separate Customer record + separate Loyalty record
- On login, if customer has multiple tenants → select which to enter
- Can switch between tenants

### **Staff: Single-Tenant Only ✓**
- One staff member works for exactly ONE car wash company
- Staff cannot work for multiple companies
- On login, directly enters their single tenant (no selection)

---

## Detailed User Models

### **CUSTOMER MODEL (Multi-Tenant)**

```
Person: maria@email.com
Google OAuth ID: xyz123

Tenant A ("AutoWash Pro"):
├─ Customer Record: 
│  ├─ customerId: "cust_1"
│  ├─ tenantId: "autowash-pro-001"
│  ├─ googleOAuthId: "xyz123"
│  ├─ email: "maria@email.com"
│  └─ createdAt: 2025-01-15
│
└─ Loyalty Record:
   ├─ loyaltyId: "loyalty_1"
   ├─ tenantId: "autowash-pro-001"
   ├─ customerId: "cust_1"
   ├─ totalPoints: 50
   ├─ status: SILVER
   └─ bookings: 15 completed

Tenant B ("SuperClean"):
├─ Customer Record:
│  ├─ customerId: "cust_1"  (different from Tenant A)
│  ├─ tenantId: "superclean-002"
│  ├─ googleOAuthId: "xyz123"  (same person)
│  ├─ email: "maria@email.com"
│  └─ createdAt: 2025-03-20
│
└─ Loyalty Record:
   ├─ loyaltyId: "loyalty_1"  (different from Tenant A)
   ├─ tenantId: "superclean-002"
   ├─ customerId: "cust_1"
   ├─ totalPoints: 8
   ├─ status: BRONZE
   └─ bookings: 2 completed

Result: 
  Two COMPLETELY SEPARATE customer records
  Two COMPLETELY SEPARATE loyalty records
  Same person, different tenants
```

### **STAFF MODEL (Single-Tenant Only)**

```
Person: john@autowashpro.com
Google OAuth ID: abc123

Tenant A ("AutoWash Pro"):
├─ Staff Record:
│  ├─ staffId: "staff_1"
│  ├─ tenantId: "autowash-pro-001"  (ONLY tenant)
│  ├─ googleOAuthId: "abc123"
│  ├─ email: "john@autowashpro.com"
│  ├─ role: "MANAGER"
│  └─ isActive: true

Tenant B ("SuperClean"):
└─ Staff Record: NONE
   └─ john CANNOT work for SuperClean
   └─ john is ONLY staff in Tenant A

Database Constraint:
  UNIQUE(tenantId, googleOAuthId)
  
  This means:
    ✓ john can be in (tenant_a, abc123)
    ✗ john CANNOT also be in (tenant_b, abc123)

Result:
  One staff record only
  One tenant only
  john cannot work for multiple companies
```

---

## Login Flows

### **Customer Login Flow**

```
Step 1: Google OAuth
   maria@email.com clicks "Login with Google"
   → Google OAuth redirects
   → maria logs in with Google
   → System receives: googleOAuthId="xyz123", email="maria@email.com"

Step 2: Check Tenants
   System queries: 
     SELECT DISTINCT tenantId FROM customers 
     WHERE googleOAuthId = 'xyz123'
   
   Result: ["tenant_a", "tenant_b"]

Step 3: Tenant Selection (if multiple)
   System shows:
   
   "Which car wash would you like to use?
   
   ○ AutoWash Pro
     50 loyalty points • SILVER status
     15 bookings
   
   ○ SuperClean
     8 loyalty points • BRONZE status
     2 bookings"

Step 4: Selection
   maria clicks: "AutoWash Pro"

Step 5: Session Created
   Session: {
     userId: "maria",
     tenantId: "tenant_a",
     customerId: "cust_1",
     role: "CUSTOMER"
   }

Step 6: Dashboard
   maria sees ONLY:
   - AutoWash Pro's services
   - maria's 15 bookings with AutoWash Pro
   - maria's loyalty: 50 points, SILVER
   - maria's 15 washes history

Step 7: Switch Tenant (Optional)
   maria clicks: "Switch Car Wash"
   → Log out current session
   → Back to tenant selection
   → Choose SuperClean
   → Session updated: tenantId="tenant_b"
   → See SuperClean data only
```

### **Staff Login Flow**

```
Step 1: Google OAuth
   john@autowashpro.com clicks "Login"
   → Google OAuth redirects
   → john logs in with Google
   → System receives: googleOAuthId="abc123", email="john@autowashpro.com"

Step 2: Check Tenants
   System queries:
     SELECT DISTINCT tenantId FROM staff 
     WHERE googleOAuthId = 'abc123'
   
   Result: ["tenant_a"]  (exactly one)

Step 3: No Selection Needed
   System finds exactly one tenant
   Login directly (no selection screen)

Step 4: Session Created
   Session: {
     userId: "john",
     tenantId: "tenant_a",
     staffId: "staff_1",
     role: "MANAGER"
   }

Step 5: Admin Dashboard
   john sees ONLY:
   - AutoWash Pro's admin dashboard
   - AutoWash Pro's bookings
   - AutoWash Pro's staff
   - AutoWash Pro's services

Step 6: Cannot Switch Tenants
   "Switch Tenant" button: NOT VISIBLE
   john can only see AutoWash Pro
   (john doesn't work for SuperClean)

Case: If john tries to access SuperClean's data
   → API request rejected
   → Error: "Unauthorized: Wrong tenant"
```

---

## Data Isolation Examples

### **Example 1: Same Customer, Different Tenants**

```
Database Query:
  SELECT * FROM customers WHERE googleOAuthId = 'xyz123'
  
  Result (2 rows):
    1. customerId=1, tenantId="tenant_a", email="maria@email.com"
    2. customerId=1, tenantId="tenant_b", email="maria@email.com"
  
  (Different customerId because different tenant)

API Call (Tenant A):
  GET /api/customers/me
  Header: X-Tenant-ID: "tenant_a"
  
  Result:
    {
      customerId: 1,
      tenantId: "tenant_a",
      email: "maria@email.com",
      loyalty: { points: 50, status: "SILVER" }
    }

API Call (Tenant B):
  GET /api/customers/me
  Header: X-Tenant-ID: "tenant_b"
  
  Result:
    {
      customerId: 1,
      tenantId: "tenant_b",
      email: "maria@email.com",
      loyalty: { points: 8, status: "BRONZE" }
    }
```

### **Example 2: Staff Cannot Access Other Tenants**

```
Staff john in Tenant A tries to access Tenant B:

  GET /api/bookings
  Header: X-Tenant-ID: "tenant_b"
  
  Backend checks:
    user.tenantId = "tenant_a"
    requestTenantId = "tenant_b"
    
    if (user.tenantId !== requestTenantId) {
      throw Unauthorized("Wrong tenant")
    }
  
  Result: 403 Forbidden
  Message: "You do not have access to this tenant"
```

---

## Login Scenarios

| Scenario | User Type | # Tenants | Login Action | Result |
|----------|-----------|-----------|--------------|--------|
| Customer, new | Customer | 0 | Click login | Create customer in selected tenant |
| Customer, one tenant | Customer | 1 | Click login | Direct to dashboard (no selection) |
| Customer, multi-tenant | Customer | 2+ | Click login | Show tenant selection screen |
| Customer, switch | Customer | 2+ | Click "Switch" | Logout → relogin with selection |
| Staff, new | Staff | 0 | Click login | ERROR: Staff not found |
| Staff, existing | Staff | 1 | Click login | Direct to admin (one tenant only) |
| Staff, multi-tenant | Staff | 2+ | Click login | ERROR: Cannot be staff in 2 tenants |

---

## Database Schema

### **Customers Table**

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  google_oauth_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  -- Indexes for performance
  INDEX(tenant_id),
  INDEX(tenant_id, google_oauth_id),
  
  -- Foreign key
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  
  -- Constraint: same person can appear in multiple tenants
  -- But NOT: UNIQUE(google_oauth_id)
  -- Because: maria can be in tenant_a AND tenant_b
);
```

### **Staff Table**

```sql
CREATE TABLE staff (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  google_oauth_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50),
  is_active BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  -- Indexes
  INDEX(tenant_id),
  INDEX(tenant_id, google_oauth_id),
  
  -- Foreign key
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  
  -- CRITICAL: staff can ONLY work for one tenant
  UNIQUE(google_oauth_id, tenant_id),
  
  -- This means: john (abc123) can ONLY appear once across all tenants
  -- john CANNOT be in both tenant_a and tenant_b
);
```

---

## Key Differences Summary

| Aspect | Customer | Staff |
|--------|----------|-------|
| Tenants | Multiple (2+) | Single (1 only) |
| Login | May need selection | No selection |
| Google ID | Can appear in multiple tenants | Can appear in only ONE tenant |
| Loyalty | Separate per tenant | N/A (not applicable) |
| Bookings | Separate per tenant | Can see own tenant's bookings |
| Records | Multiple Customer records | One Staff record |
| Database Constraint | No unique on googleOAuthId | UNIQUE(googleOAuthId, tenantId) |
| Switch Tenants | Yes (logout + select) | No (only one tenant) |

---

## Implementation Checklist

- [x] Customer can belong to multiple tenants
- [x] Staff belongs to exactly one tenant
- [x] Login shows tenant selection if customer has multiple
- [x] Staff login direct (no selection)
- [x] Use cases updated (UC-021, UC-022, UC-023)
- [x] Database schema documented
- [x] Data isolation examples
- [x] Scenario table

---

**Status:** User-tenant model corrected and fully documented

