# Business Context - Ikaro

> **When to load:** understanding what Ikaro is, who the tenants and users are, the MVP scope and out-of-scope list, success metrics or the glossary; the use cases themselves are in `docs/USE_CASES.md`, technology choices in `docs/TECH_STACK_DECISIONS.md`.
> **Tags:** product

## Executive Summary

**Ikaro** is a multi-tenant booking and loyalty platform for local service businesses. Car wash is the flagship vertical and the one this document's examples use; the platform also supports appointment-style services through resources and scheduling rules (`docs/BOUNDED_CONTEXTS.md`). It enables multiple autonomous companies (tenants) to each manage customer bookings, service scheduling, and customer loyalty tracking through a modern, cloud-native web application. Each tenant is completely isolated with their own services, customers, staff, and loyalty programs.

**Key:** Single Ikaro platform, multiple independent companies.

---

## Multi-Tenancy Architecture

### **Tenant Structure**

- **Tenant = Company** (e.g., "AutoWash Pro", "SuperClean", "QuickWash")
- **Single Platform, Multiple Companies:** All tenants share one Ikaro instance
- **Complete Isolation:** Each tenant's data is completely isolated from others
- **User Constraint:** Customers and staff can each belong to several tenants, with one record per tenant (never shared data); a session is always scoped to a single tenant

### **Data Isolation**

Every entity in Ikaro belongs to a tenant:
- ✓ Services (each tenant defines own services)
- ✓ Customers (each tenant has own customer base)
- ✓ Staff (each tenant has own employees)
- ✓ Bookings (each tenant's bookings isolated)
- ✓ Loyalty records (per-tenant loyalty tracking)
- ✓ Email templates (branded per tenant)
- ✓ Hotsite (per-tenant content)
- ✓ Configurations (pricing, loyalty expiration, points values)

### **Multi-Tenant Query Pattern**

Every database query is scoped to tenant:
```
SELECT * FROM bookings WHERE tenant_id = ? AND status = 'APPROVED'
```

System ensures:
- ✓ API filters all results by current user's tenant
- ✓ No tenant can access another's data
- ✓ No cross-tenant joins or queries

### **Hotsite Strategy**

Each tenant has dedicated hotsite accessible via path:
- `<ikaro-domain>/tenant1` → "AutoWash Pro" hotsite
- `<ikaro-domain>/tenant2` → "SuperClean" hotsite
- Dynamic content (services, testimonials, branding) per tenant
- Future: Custom domains (autowashpro.com → <ikaro-domain>/tenant1)

### **User Roles & Tenants**

**Customers: Can belong to MULTIPLE tenants**
- One person can book services at multiple car wash companies
- Each car wash company = separate Customer record + separate Loyalty record
- Every customer login starts from one tenant's own hotsite login (`/{slug}/login`), so the session is scoped to that tenant from the start; there is no tenant-selection screen at login (descoped, `journeys/customer/login.md`)
- Can switch between tenants after login (`POST /auth/switch-tenant`)

**Staff: Can belong to MULTIPLE tenants**
- One person can work for several car wash companies: one Staff record per tenant (`UNIQUE(tenant_id, google_oauth_id)`, see `docs/TENANT_ISOLATION_STRATEGY.md`)
- Staff login is per-tenant: it starts from a specific tenant (`tenantSlug` carried in the OAuth state) and enters that tenant directly, with no selection step
- With several active records, can switch tenant after login (`/select-staff-tenant`, `POST /auth/switch-staff-tenant`)

**Example:**
```
Person: maria@email.com

As Customer:
  - Bookings with AutoWash Pro (Tenant A)
    • 15 completed washes (lifetime), 50 active loyalty points
  - Bookings with SuperClean (Tenant B)
    • 2 completed washes (lifetime), 8 active loyalty points
  
  Login: from AutoWash Pro's hotsite → a session scoped to AutoWash Pro.
  Switching: "Switch car wash" after login → SuperClean (a new session
             scoped to SuperClean, with its own 8 points)

As Staff:
  - Works for AutoWash Pro (Tenant A)
  - Also works for SuperClean (Tenant B)

  Login: starts from one tenant and enters it directly; the "Which car wash would you
  like to manage?" screen (`/select-staff-tenant`) appears only as a post-login switch,
  when more than one active Staff record exists
```

---

## Problem and Solution

Small car wash businesses face challenges:
- Manual booking management (phone calls, spreadsheets)
- No visibility into customer loyalty or repeat business
- Inability to manage staff schedules efficiently
- Limited customer reach (no online presence)
- No audit trail for service delivery and cancellations

**Ikaro solves this** by providing:
- Self-service online booking with staff approval workflow
- Real-time schedule availability
- Customer loyalty tracking (wash counts, cancellations)
- Email notifications for all stakeholders
- Professional hotsite for customer discovery

---

## Target Users

### 1. **Public Visitor** (Unauthenticated)
- Browse services, testimonials, before/after photos
- Discover Ikaro through marketing hotsite
- Learn about services and pricing
- Can book without an account as a guest (see Guest Customer below)

### 2. **Guest Customer** (Booking without authentication)
- Request booking: name, email, phone, service, preferred date/time
- View real-time available calendar slots
- Upload car photos for admin review
- Receive email confirmation of booking request (pending approval)
- Receive email when admin approves/rejects or requests more info
- **No customer account created** (transactional only)

### 3. **Authenticated Customer** (Google OAuth)
- All guest features, plus:
- Customer account with booking history
- View past/upcoming bookings
- Cancel bookings (default 48-hour notice, configurable per tenant through `cancellationWindowHours`)
- View loyalty metrics (wash count, loyalty status)
- Receive booking reminders (sent between 06:00 and 06:29 tenant-local time, for tomorrow's and today's bookings)
- Build history for future loyalty programs

### 4. **Staff / Admin** (Google OAuth + staff flag)
- Dashboard to manage bookings (approve, reject, request-info, mark complete)
- Email notification: "New booking request from [customer name]"
- View all bookings and customer history
- Close personal schedule (days off, maintenance)
- Mark bookings as completed (triggers loyalty tracking)
- View customer wash logs and loyalty history
- Upload photos, internal notes on bookings
- **Two roles:** `STAFF` and `MANAGER` (`MANAGER` is a superset; the manager-only areas are settings, team, hotsite, resources and scheduling exceptions)

---

## Core User Journeys

### **Journey 1: Guest Requests Booking (Unauthenticated)**
```
1. Guest visits hotsite → clicks "Request Booking"
2. Guest enters: name, email, phone, service choice
3. System shows real-time available slots (admin's calendar)
4. Guest selects date/time and uploads car photos (optional)
5. Guest submits → booking enters PENDING state
6. Admin receives email: "New booking request from [name]"
7. Guest receives email: "Your booking request is pending. You'll hear from us soon."
8. Admin reviews photos, contacts guest if needed
9. Admin approves → Customer receives confirmation email with date/time
   OR Admin requests more info → Customer receives email
   OR Admin rejects → Customer receives notification
```

### **Journey 2: Authenticated Customer Books Appointment**
```
1. Logged-in customer → "Book Service"
2. System pre-fills: name, email, phone (from profile)
3. Customer selects service and preferred date/time
4. Booking follows same workflow as Journey 1
5. **Difference:** System knows customer history (wash count, etc.)
6. Can cancel within the tenant's cancellation window (default 48h notice) → loyalty system updated
```

### **Journey 3: Complete Wash (Staff/Admin)**
```
1. Staff member completes customer wash
2. Staff marks booking as COMPLETED in dashboard
3. System triggers:
   - Loyalty tracking: increment wash count
   - Email to customer: "Thanks for your wash! Your loyalty count: X"
   - Log entry in audit trail
```

### **Journey 4: Customer Cancels Booking**
```
1. Customer views upcoming booking
2. Clicks "Cancel" (only if outside the tenant's cancellation window, default 48h before the appointment)
3. Booking state: APPROVED → CANCELLED
4. System triggers:
   - Loyalty tracking: mark cancellation (for future: may affect promotions)
   - Email to customer: "Cancellation confirmed"
   - Email to admin: "Customer [name] cancelled booking for [date]"
   - Log entry in audit trail
```

### **Journey 5: Staff Closes Schedule**
```
1. Staff/Admin marks specific date(s) as unavailable
2. System removes those slots from available calendar
3. Existing bookings on closed days: handled separately (e.g., admin reschedules)
```

---

## Core Features (MVP)

### **Booking Management**
- ✓ Guest booking requests (pending workflow)
- ✓ Real-time calendar availability
- ✓ Admin approval/rejection workflow
- ✓ Request additional info workflow
- ✓ Authenticated customer bookings
- ✓ Booking cancellation (tenant cancellation window, 48h by default)
- ✓ Mark booking complete

### **Service Management**
- ✓ Admin creates/edits services
- ✓ Service attributes: name, description, price, duration, default values
- ✓ Admin can override defaults per-service

### **Schedule Management**
- ✓ Real-time calendar view (available/blocked slots)
- ✓ Admin closes schedule (days off, maintenance)

### **Customer Management**
- ✓ Google OAuth login for customers
- ✓ Customer profile (name, email, phone)
- ✓ View booking history
- ✓ Loyalty tracking (wash count, cancellations)

### **Staff Management**
- ✓ Google OAuth login for staff
- ✓ Dashboard to manage bookings
- ✓ View all customer bookings and history
- ✓ Two roles, `STAFF` and `MANAGER` (`MANAGER` is a superset)

### **Photo Management**
- ✓ Guest/customer uploads multiple car photos when booking (optional but encouraged)
- ✓ Admin views photos before approving
- ✓ Staff uploads multiple photos after service completion (optional but encouraged)
- ✓ Photos stored in cloud storage (GCS)
- ✓ Photos used for marketing (before/after gallery)

### **Notification System**
- ✓ Email: Booking request to admin
- ✓ Email: Booking confirmation to customer
- ✓ Email: Rejection / info-request to customer
- ✓ Email: Booking reminder (1 day before, 6 AM)
- ✓ Email: Booking reminder (day of appointment, 6 AM)
- ✓ Email: Admin daily schedule (6 AM - today's customers & services)
- ✓ Email: Cancellation confirmation

### **Public Hotsite**
- ✓ Service showcase
- ✓ Testimonials/reviews
- ✓ Before/after photo gallery
- ✓ Business information
- ✓ Call-to-action: "Request Booking"

### **Audit & Loyalty**
- ✓ Audit log: every action (booking created, approved, completed, cancelled)
- ✓ Loyalty tracking: points per service type (configurable points per service)
- ✓ Loyalty expiration: points expire after configurable period (6 months, 1 year, etc.)
- ✓ Foundation for future: promotions & rewards based on points milestones

### **Shipped since the original MVP scope (pointers, not a feature spec)**
The lists above describe the original MVP. These have since shipped; the canonical behaviour is in `docs/USE_CASES.md` (find the UC with `grep -n 'UC-0NN'`) and the milestone files indexed in `plan/README.md`:
- Resource-based scheduling: resources, per-resource closures/openings, service resource requirements, booking policy and intake schema (M21–M23).
- Recurring reservations, availability alerts, the future-commitment ("Reservas a resolver") worklist and no-show handling (M23, UC-070 to UC-074, UC-076, UC-077).
- Staff-created bookings on a customer's behalf (UC-108).
- Hotsite chatbot (M19, UC-033 to UC-036) and the hotsite lead form (M20, UC-037 to UC-043).
- Class sessions, waitlists and class access are *planned*, not built (M24, UC-075 and UC-078 to UC-107).

---

## Out of Scope (MVP)

- ❌ Payment processing (business handles cash/card at location)
- ❌ SMS notifications (email only for now)
- ❌ Multi-location support (single location MVP)
- ❌ Loyalty promotions (tracking only, business logic later)
- ❌ Reporting/analytics dashboard (foundation ready, UI later)
- ❌ Mobile app (responsive web only)
- ❌ Push notifications (appointment reminders are email only)

---

## Target Market & Localization

| Aspect | Value |
|--------|-------|
| **Country** | Brazil 🇧🇷 |
| **Language** | Portuguese (pt-BR) — all customer-facing text, email templates, and UI copy |
| **Currency** | BRL (R$) — displayed as `R$ 1.234,56` (Brazilian number format) |
| **Timezone** | One timezone per tenant, stored in `settings.businessHours.timezone`. Default: `America/Sao_Paulo` (UTC-3). All DB timestamps in UTC. |
| **Compliance** | Brazil — all customer data stored in Brazil or Brazilian-approved regions. |

---

## Technical Constraints & Decisions

- **Architecture:** Hexagonal (ports & adapters) with DDD principles.
- **Deployment:** **Docker-centric**. The entire platform is containerized and runs on GCP Cloud Run (the committed, GCP-only target; see `docs/TECH_STACK_DECISIONS.md`).
- **No Vendor Lock-in:** 
  - Strict use of standard PostgreSQL (no proprietary extensions).
  - Observability using open standards: **OpenTelemetry** exported to Google Cloud Trace, Logging and Managed Service for Prometheus.
  - Infrastructure as Code (Terraform) focused on portable resources.
- **Stack:** NestJS backend and BFF gateway, Next.js 16 / React 19 frontend.
- **Authentication:** Google OAuth 2.0 (standard implementation, not cloud-specific).
- **Email:** Standard SMTP or API adapters with easy swapability — see `docs/TECH_STACK_DECISIONS.md` §9 for the current provider.
- **Storage:** behind the `IStorageService` port (`shared/ports/storage.service.port.ts`); production uses Google Cloud Storage (signed URLs), local development uses the GCS emulator from `docker/docker-compose.yml`.

---

## Success Metrics

- ✓ Reduce manual booking time by 80%
- ✓ Increase online visibility (hotsite)
- ✓ Enable loyalty tracking for future retention programs
- ✓ Build foundation for future features (promotions, reporting)
- ✓ Professional, maintainable codebase (scalable to team)

---

## Glossary

| Term | Definition |
|------|-----------|
| **Guest** | Unauthenticated user requesting a booking |
| **Customer** | Authenticated user (Google OAuth) with account |
| **Staff/Admin** | Employee managing bookings and schedule |
| **Booking** | Service request from guest/customer for specific date/time |
| **Service** | Type of car wash offered (e.g., Basic Wash, Premium Wash) |
| **Loyalty** | Tracking wash completion and cancellations for future rewards |
| **Hotsite** | Public marketing website (no authentication) |
| **BFF** | Backend-for-Frontend gateway (API layer between frontend & backend) |

