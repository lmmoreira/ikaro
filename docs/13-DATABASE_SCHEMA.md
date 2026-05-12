# Database Schema - BeloAuto

## Overview

BeloAuto uses a **Single Database, Shared Schema** pattern on PostgreSQL. Absolute data isolation is enforced via a mandatory `tenant_id` column on every table and composite indexing strategy.

---

## Global Standards

### 1. **Primary & Foreign Keys**
- All IDs are **UUID v4** (Global uniqueness, easier migrations).
- Foreign keys **MUST** include `tenant_id` for composite integrity (where applicable).

### 2. **Mandatory Audit Columns**
Every table includes:
- `tenant_id`: UUID (NOT NULL).
- `created_at`: TIMESTAMP WITH TIME ZONE (DEFAULT now()).
- `updated_at`: TIMESTAMP WITH TIME ZONE (DEFAULT now()).
- `deleted_at`: TIMESTAMP WITH TIME ZONE (For Soft Deletes).
- `created_by`: UUID (UserId).
- `updated_by`: UUID (UserId).

---

## Tables Design

### **1. Tenants (Platform Level)**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(100) | UNIQUE, NOT NULL |
| settings | JSONB | { "loyalty_expiry_days": 180, "cancellation_window_hours": 48 } |
| is_active | BOOLEAN | DEFAULT true |

### **2. Customers (Tenant Scoped)**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | FK -> tenants(id) |
| google_oauth_id | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | NOT NULL |
| phone | VARCHAR(20) | |
| first_name | VARCHAR(100) | |
| last_name | VARCHAR(100) | |
| **INDEX** | (tenant_id, google_oauth_id) | |

### **3. Staff (Tenant Scoped)**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | FK -> tenants(id) |
| google_oauth_id | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | NOT NULL |
| role | VARCHAR(50) | 'MANAGER', 'STAFF' |
| is_active | BOOLEAN | DEFAULT true |
| **UNIQUE** | (tenant_id, google_oauth_id) | Staff belongs to 1 tenant |

### **4. Services (Tenant Scoped)**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | FK -> tenants(id) |
| name | VARCHAR(255) | NOT NULL |
| description | TEXT | |
| price | DECIMAL(12,2) | NOT NULL |
| duration_mins | INT | NOT NULL |
| points_value | INT | DEFAULT 1 |
| is_active | BOOLEAN | DEFAULT true (UC-013) |

### **5. Bookings (Core)**
A booking is the parent of one or more `booking_lines`. Service-level details (which service, what price, what duration, what points) live on the lines.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK -> tenants(id) |
| customer_id | UUID | FK -> customers(id) (NULL for Guests) |
| status | VARCHAR(50) | NOT NULL — PENDING, INFO_REQUESTED, APPROVED, REJECTED, COMPLETED, CANCELLED |
| scheduled_at | TIMESTAMP WITH TIME ZONE | NOT NULL — start of the appointment slot |
| total_duration_mins | INT | NOT NULL, CHECK (total_duration_mins > 0) — denormalised sum of `booking_lines.duration_mins_at_booking` |
| total_price | DECIMAL(12,2) | NOT NULL, CHECK (total_price >= 0) — denormalised sum of `booking_lines.price_at_booking` |
| guest_info | JSONB | NULL when customer_id IS NOT NULL; `{ "name": "", "email": "", "phone": "" }` otherwise |
| car_photo_urls | JSONB | `string[]` of customer-uploaded photos (UC-001) |
| after_service_photo_urls | JSONB | `string[]` of staff-uploaded photos (UC-009) |
| internal_notes | TEXT | (UC-003, UC-009) |
| rejection_reason | TEXT | (UC-004) |
| cancellation_reason| TEXT | (UC-008) |
| info_request_text | TEXT | (UC-005 — admin's prompt) |
| info_submitted_payload | JSONB | (UC-005 — customer's reply) |
| approved_at | TIMESTAMP WITH TIME ZONE | |
| approved_by | UUID | FK -> staff(id) |
| completed_at | TIMESTAMP WITH TIME ZONE | |
| completed_by | UUID | FK -> staff(id) |
| cancelled_at | TIMESTAMP WITH TIME ZONE | |
| cancelled_by | UUID | NULL — Staff id or Customer id |
| info_requested_at | TIMESTAMP WITH TIME ZONE | |
| info_requested_by | UUID | FK -> staff(id) |
| info_submitted_at | TIMESTAMP WITH TIME ZONE | |

**Rules:**
- A booking MUST have ≥ 1 `booking_lines` row. Enforced by a deferred trigger / application invariant — Postgres cannot express "≥ 1 child row" declaratively without a workaround. The application is the gate; an additional integrity check runs as part of the data-quality cron.
- `total_price` and `total_duration_mins` are denormalised for fast list views. They are computed by the aggregate on every line change and verified by an integrity check (`SELECT id FROM bookings b WHERE b.total_price <> (SELECT COALESCE(SUM(price_at_booking),0) FROM booking_lines WHERE booking_id=b.id)` — must return zero rows).

### **5a. Booking Lines (Core — child of bookings)**
One row per service unit inside a booking. Snapshots from `services` so later edits to the service do not retroactively change past bookings.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL — denormalised, same as parent booking |
| booking_id | UUID | NOT NULL, FK -> bookings(id) ON DELETE CASCADE |
| service_id | UUID | NOT NULL, FK -> services(id) — same `serviceId` MAY repeat in one booking |
| price_at_booking | DECIMAL(12,2) | NOT NULL, CHECK (price_at_booking >= 0) — snapshot of `services.price` |
| duration_mins_at_booking | INT | NOT NULL, CHECK (duration_mins_at_booking > 0) — snapshot of `services.duration_mins` |
| points_value_at_booking | INT | NOT NULL, CHECK (points_value_at_booking >= 0) — snapshot of `services.points_value` |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL, DEFAULT now() |
| **FK (composite)** | (tenant_id, booking_id) REFERENCES bookings(tenant_id, id) | Tenant-safe parent reference |
| **FK (composite)** | (tenant_id, service_id) REFERENCES services(tenant_id, id) | Tenant-safe service reference |
| **INDEX** | (tenant_id, booking_id) | Fast load of all lines for a booking |
| **INDEX** | (tenant_id, service_id) | "Find all bookings that included service X" |

**Rules:**
- `INSERT` and `DELETE` only allowed while parent booking is in `PENDING` or `INFO_REQUESTED`. Once approved, lines are frozen (enforced by application; verified by an integrity check).
- All three snapshot fields are immutable after insert.
- Cascade delete is permitted (only when a booking is hard-deleted — soft delete is preferred via `deleted_at`).

### **6. Loyalty Entries (append-only)**
*One immutable row per **booking line** completed for an authenticated customer. No row is written when points expire — expiration is a query-time filter on `expires_at`.*

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK -> tenants(id) |
| customer_id | UUID | NOT NULL, FK -> customers(id) |
| booking_id | UUID | NOT NULL, FK -> bookings(id) — parent booking |
| booking_line_id | UUID | NOT NULL, FK -> booking_lines(id) — the exact line this entry was earned for |
| service_id | UUID | NOT NULL, FK -> services(id) — denormalised from `booking_lines` for fast per-service queries |
| points | INT | NOT NULL, CHECK (points > 0) — = `booking_lines.points_value_at_booking` (frozen at completion) |
| earned_at | TIMESTAMP WITH TIME ZONE | NOT NULL, DEFAULT now() |
| expires_at | TIMESTAMP WITH TIME ZONE | NOT NULL — `earned_at + tenants.settings.loyalty_expiry_days` |
| **FK (composite)** | (tenant_id, booking_id) REFERENCES bookings(tenant_id, id) | Tenant-safe |
| **FK (composite)** | (tenant_id, booking_line_id) REFERENCES booking_lines(tenant_id, id) | Tenant-safe |
| **INDEX** | (tenant_id, customer_id, expires_at) | Fast active-balance query |
| **INDEX** | (tenant_id, customer_id, service_id, expires_at) | Fast per-service breakdown |
| **UNIQUE** | (tenant_id, booking_line_id) | One entry per line — guards against duplicate event processing |

**Rules:**
- `INSERT` only. No `UPDATE`, no `DELETE` (audit / immutability).
- `UNIQUE(tenant_id, booking_line_id)` makes the consumer idempotent: replaying `BookingCompleted` is a no-op at the line level.
- A booking with N lines produces N rows on completion (one per line).
- Active balance: `SELECT SUM(points) FROM loyalty_entries WHERE tenant_id=$1 AND customer_id=$2 AND expires_at > now();`
- Per-service active points: same query plus `AND service_id=$3` (or `GROUP BY service_id`).

### **7. Schedule Closures (UC-010)**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK -> tenants(id) |
| staff_id | UUID | FK -> staff(id), NULLABLE — null = system-wide, set = staff-specific |
| start_at | TIMESTAMP | NOT NULL |
| end_at | TIMESTAMP | NOT NULL |
| closure_type | VARCHAR(50) | NOT NULL — 'MAINTENANCE' (system-wide), 'HOLIDAY' (system-wide), 'STAFF_DAY_OFF' (staff-specific) |
| reason | TEXT | |
| **FK (composite)** | (tenant_id, staff_id) REFERENCES staff(tenant_id, id) | Staff-safe parent reference (when staff_id is set) |
| **INDEX** | (tenant_id, start_at, end_at) | Fast availability queries |
| **INDEX** | (tenant_id, staff_id, start_at) | Fast per-staff closure queries |

**Rules:**
- If `staff_id` IS NOT NULL: closure_type MUST be 'STAFF_DAY_OFF', closure is staff-specific
- If `staff_id` IS NULL: closure_type MUST be 'MAINTENANCE' or 'HOLIDAY', closure is system-wide (affects all staff)
- `UNIQUE(tenant_id, staff_id, start_at, end_at)` when staff_id is NOT NULL — no duplicate per-staff closures

### **8. Notification Templates (Tenant Scoped)**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | FK -> tenants(id) |
| trigger_event | VARCHAR(100) | e.g., 'BookingApproved' |
| subject | VARCHAR(255) | |
| body_html | TEXT | Branded per tenant |

### **9. Notification Logs (Audit Trail - UC-019)**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | FK -> tenants(id) |
| booking_id | UUID | FK -> bookings(id) |
| recipient | VARCHAR(255) | |
| template_id | UUID | FK -> notification_templates(id) |
| sent_at | TIMESTAMP | DEFAULT now() |
| status | VARCHAR(50) | 'SENT', 'FAILED' |

### **10. Hotsite Configs (Tenant Scoped - UC-001, UC-011)**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | FK -> tenants(id), UNIQUE |
| branding | JSONB | { "primary_color": "", "logo_url": "", "font": "" } |
| layout | JSONB | Array of modules: [{ "type": "HERO", "data": {...} }, ...] |
| is_published | BOOLEAN | DEFAULT false |
| **INDEX** | (tenant_id) | |

---

## Indexing Strategy

1. **Isolation Indexing:** Every index **MUST** start with `tenant_id`.
   - `CREATE INDEX idx_bookings_tenant_scheduled ON bookings (tenant_id, scheduled_at);`
   - `CREATE INDEX idx_loyalty_tenant_customer_expires ON loyalty_entries (tenant_id, customer_id, expires_at);`
2. **Search Indexing:** 
   - `CREATE INDEX idx_customers_tenant_google ON customers (tenant_id, google_oauth_id);`
   - `CREATE INDEX idx_staff_tenant_google ON staff (tenant_id, google_oauth_id);`

---

## Database Constraints Enforcement

- **Composite Foreign Keys:** 
  `FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id)`
  This ensures a booking for Tenant A cannot reference a service from Tenant B.

---

**Status:** Phase 2 - Technical Architecture (Validated against Use Cases)  
**Next:** `14-API_CONTRACTS.md`
