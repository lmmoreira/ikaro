# Business Context - BeloAuto

## Executive Summary

**BeloAuto** is a multi-tenant car wash service management platform enabling multiple autonomous car wash companies (tenants) to each manage customer bookings, service scheduling, and customer loyalty tracking through a modern, cloud-native web application. Each tenant is completely isolated with their own services, customers, staff, and loyalty programs.

**Key:** Single BeloAuto platform, multiple independent companies.

---

## Multi-Tenancy Architecture

### **Tenant Structure**

- **Tenant = Company** (e.g., "AutoWash Pro", "SuperClean", "QuickWash")
- **Single Platform, Multiple Companies:** All tenants share one BeloAuto instance
- **Complete Isolation:** Each tenant's data is completely isolated from others
- **User Constraint:** One user can belong to only ONE tenant (no cross-tenant access)

### **Data Isolation**

Every entity in BeloAuto belongs to a tenant:
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
- `beloauto.com/tenant1` → "AutoWash Pro" hotsite
- `beloauto.com/tenant2` → "SuperClean" hotsite
- Dynamic content (services, testimonials, branding) per tenant
- Future: Custom domains (autowashpro.com → beloauto.com/tenant1)

### **User Roles & Tenants**

**Customers: Can belong to MULTIPLE tenants**
- One person can book services at multiple car wash companies
- Each car wash company = separate Customer record + separate Loyalty record
- On login, if customer has bookings in multiple tenants → must select which to enter
- Can switch between tenants (switch session)

**Staff: Belong to ONLY ONE tenant**
- One staff member works for exactly ONE car wash company
- Staff cannot work for multiple companies
- On login, directly enters their single tenant (no selection)

**Example:**
```
Person: maria@email.com

As Customer:
  - Bookings with AutoWash Pro (Tenant A)
    • 15 washes, 50 loyalty points, SILVER status
  - Bookings with SuperClean (Tenant B)
    • 2 washes, 8 loyalty points, BRONZE status
  
  Login: "Which car wash would you like to use?
          - AutoWash Pro (50 points)
          - SuperClean (8 points)"

As Staff:
  - Works for AutoWash Pro ONLY (Tenant A)
  - Cannot work for SuperClean
  
  Login: Direct entry to AutoWash Pro dashboard (no selection)
```

---

Small car wash businesses face challenges:
- Manual booking management (phone calls, spreadsheets)
- No visibility into customer loyalty or repeat business
- Inability to manage staff schedules efficiently
- Limited customer reach (no online presence)
- No audit trail for service delivery and cancellations

**BeloAuto solves this** by providing:
- Self-service online booking with staff approval workflow
- Real-time schedule availability
- Customer loyalty tracking (wash counts, cancellations)
- Email notifications for all stakeholders
- Professional hotsite for customer discovery

---

## Target Users

### 1. **Public Visitor** (Unauthenticated)
- Browse services, testimonials, before/after photos
- Discover BeloAuto through marketing hotsite
- Learn about services and pricing
- **Cannot book** (must authenticate first)

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
- Cancel bookings (with 48-hour notice)
- View loyalty metrics (wash count, loyalty status)
- Receive booking reminders (24h before appointment)
- Build history for future loyalty programs

### 4. **Staff / Admin** (Google OAuth + staff flag)
- Dashboard to manage bookings (approve, reject, request-info, mark complete)
- Email notification: "New booking request from [customer name]"
- View all bookings and customer history
- Close personal schedule (days off, maintenance)
- Mark bookings as completed (triggers loyalty tracking)
- View customer wash logs and loyalty history
- Upload photos, internal notes on bookings
- **No granular permissions yet** (all staff can do all actions)

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
6. Can cancel with 48h notice → loyalty system updated
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
2. Clicks "Cancel" (only if > 48h before appointment)
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
- ✓ Booking cancellation (48h policy)
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
- ✓ All staff can perform all actions (no role-based permissions yet)

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

---

## Out of Scope (MVP)

- ❌ Payment processing (business handles cash/card at location)
- ❌ SMS notifications (email only for now)
- ❌ Multi-location support (single location MVP)
- ❌ Role-based permissions (all staff equal)
- ❌ Loyalty promotions (tracking only, business logic later)
- ❌ Reporting/analytics dashboard (foundation ready, UI later)
- ❌ Mobile app (responsive web only)
- ❌ Appointment reminders (email only, no push notifications)

---

## Technical Constraints & Decisions

- **Cloud Provider:** GCP primary, but cloud-agnostic via Terraform (multi-cloud ready)
- **No lock-in:** Standard PostgreSQL, portable code
- **Architecture:** Hexagonal (ports & adapters) with DDD principles
- **Stack:** NestJS backend, React frontend, BFF gateway
- **Authentication:** Google OAuth 2.0 (staff & customers)
- **Email:** SendGrid or AWS SES (async, reliable)
- **Storage:** Google Cloud Storage for photos
- **No cache needed:** Small business, predictable load
- **IaC:** Terraform for all infrastructure

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

