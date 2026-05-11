# Domain Model - BeloAuto (DDD)

This document defines the domain model using Domain-Driven Design (DDD) principles: bounded contexts, aggregates, entities, value objects, and domain events.

---

## Bounded Contexts

A bounded context is an autonomous domain with clear boundaries and its own model. **Each context is scoped to a tenant** - no cross-tenant data mixing.

### **Context 1: Booking Context**
**Purpose:** Manage booking lifecycle from request to completion, **per tenant**.

**Responsibilities:**
- Accept booking requests (guest & authenticated customers) for a specific tenant
- Validate calendar availability for that tenant
- Manage approval/rejection workflow
- Track booking state changes
- Support cancellations with business rules

**Key Aggregates:**
- Booking (root) - scoped to tenant
- Service (root) - scoped to tenant
- ScheduleClosure (root) - scoped to tenant

---

### **Context 2: Customer Context**
**Purpose:** Manage customer identity and profiles, **per tenant**.

**Responsibilities:**
- Store customer information (authenticated users) for a specific tenant
- Manage customer authentication
- Link Google OAuth to customer account
- Store customer preferences

**Key Aggregates:**
- Customer (root) - scoped to tenant

**Note:** Same person can be a customer in multiple tenants (different email contexts), but each tenant sees their own customer records.

---

### **Context 3: Loyalty Context**
**Purpose:** Track customer loyalty metrics (wash counts, cancellations), **per tenant**.

**Responsibilities:**
- Record wash completions per tenant
- Track cancellations per tenant
- Calculate loyalty status per tenant
- Foundation for future: promotion eligibility per tenant

**Key Aggregates:**
- LoyaltyRecord (root) - scoped to tenant

---

### **Context 4: Notification Context**
**Purpose:** Handle email notifications and communication templates, **per tenant**.

**Responsibilities:**
- Listen to domain events from other contexts (tenant-scoped)
- Compose and send emails (branded per tenant)
- Track notification delivery
- Handle notification failures

**Key Aggregates:**
- NotificationTemplate (root) - scoped to tenant
- NotificationLog (root) - scoped to tenant

---

### **Context 5: Staff Context**
**Purpose:** Manage staff information and permissions, **per tenant**.

**Responsibilities:**
- Store staff member details for a specific tenant
- Link Google OAuth to staff account
- Track staff scheduling (days off, closures)
- Foundation for future: role-based permissions per tenant

**Key Aggregates:**
- Staff (root) - scoped to tenant
- ScheduleClosure (shared with Booking Context) - scoped to tenant

---

## Aggregates, Entities, and Value Objects

### **Booking Context**

#### **Aggregate: Booking** (Root Entity)
Represents a single car wash appointment request/confirmation.

**Entities within:**
- `Booking` (root)
- `BookingLine` (service details for this booking)
- `BookingAuditLogEntry` (immutable log)

**Value Objects:**
- `BookingId` (unique identifier)
- `BookingStatus` (PENDING, APPROVED, REJECTED, COMPLETED, CANCELLED)
- `BookingType` (GUEST, CUSTOMER)
- `TimeSlot` (date, startTime, endTime)
- `Money` (price, currency)

**Properties:**
```
Booking {
  bookingId: BookingId
  tenantId: TenantId (which company this booking belongs to)
  status: BookingStatus
  type: BookingType
  customerId: CustomerId (null if guest)
  guestEmail: Email
  guestPhone: Phone
  guestName: String
  serviceId: ServiceId
  preferredTimeSlot: TimeSlot
  actualTimeSlot: TimeSlot (null until approved)
  price: Money
  carPhotoUrls: String[] (multiple photos, GCS paths, optional)
  createdAt: DateTime
  approvedAt: DateTime (null until approved)
  completedAt: DateTime (null until completed)
  cancelledAt: DateTime (null until cancelled)
  reasonForRejection: String (optional)
  adminNotes: String (optional)
  afterServicePhotoUrls: String[] (uploaded by staff after completion, optional)
  auditLog: BookingAuditLogEntry[]
}
```

**Key Methods:**
- `requestBooking()` → creates PENDING booking, publishes `BookingRequested` event
- `approveBooking()` → transitions to APPROVED, publishes `BookingApproved` event
- `rejectBooking(reason)` → transitions to REJECTED, publishes `BookingRejected` event
- `requestMoreInfo()` → stays PENDING, publishes `BookingInfoRequested` event
- `completeBooking(afterServicePhotos)` → transitions to COMPLETED, stores photos, publishes `BookingCompleted` event
- `cancelBooking()` → validates 48h rule, transitions to CANCELLED, publishes `BookingCancelled` event
- `isEligibleForCancellation()` → checks 48h rule
- `uploadCarPhotos(photoUrls)` → adds/updates pre-booking photos
- `uploadAfterServicePhotos(photoUrls)` → adds post-completion photos

---

#### **Aggregate: Service** (Root Entity)
Represents a car wash service type (e.g., Basic Wash, Premium Wash).

**Entities within:**
- `Service` (root)

**Value Objects:**
- `ServiceId` (unique identifier)
- `ServiceName` (string)
- `Money` (price)
- `Duration` (minutes)
- `ServiceStatus` (ACTIVE, INACTIVE)
- `LoyaltyPoints` (points earned per completion, configurable)

**Properties:**
```
Service {
  serviceId: ServiceId
  tenantId: TenantId (which company this service belongs to)
  name: ServiceName
  description: String
  price: Money
  durationMinutes: Duration
  loyaltyPointsValue: LoyaltyPoints (e.g., Basic=1pt, Premium=2pts, Wax=3pts)
  status: ServiceStatus
  createdAt: DateTime
  updatedAt: DateTime
}
```

---

#### **Aggregate: ScheduleClosure** (Root Entity)
Represents when staff/admin closes the schedule (days off, maintenance).

**Entities within:**
- `ScheduleClosure` (root)

**Value Objects:**
- `ScheduleClosureId` (unique identifier)
- `ClosureType` (STAFF_DAY_OFF, MAINTENANCE, HOLIDAY)
- `DateRange` (startDate, endDate)

**Properties:**
```
ScheduleClosure {
  closureId: ScheduleClosureId
  tenantId: TenantId (which company this closure belongs to)
  staffId: StaffId
  type: ClosureType
  startDate: Date
  endDate: Date
  reason: String (optional)
  createdAt: DateTime
}
```

---

### **Customer Context**

#### **Aggregate: Customer** (Root Entity)
Represents an authenticated user with a profile.

**Entities within:**
- `Customer` (root)

**Value Objects:**
- `CustomerId` (unique identifier, from Google OAuth sub)
- `Email`
- `Phone`
- `FullName`

**Properties:**
```
Customer {
  customerId: CustomerId
  tenantId: TenantId (which company this customer is booking with)
  googleOAuthId: String (unique from Google)
  email: Email
  phone: Phone
  firstName: String
  lastName: String
  createdAt: DateTime
  updatedAt: DateTime
}

Note: Same person (Google email) CAN be a customer in multiple tenants.
Each tenant has separate Customer record with:
  - Different customerId
  - Different loyalty record
  - Different booking history
  - Completely isolated

Example:
  maria@email.com in Tenant A: Customer(id=1, tenantId="tenant_a", ...)
  maria@email.com in Tenant B: Customer(id=2, tenantId="tenant_b", ...)
  (Two separate records, no cross-tenant data)
```

---

### **Loyalty Context**

#### **Aggregate: LoyaltyRecord** (Root Entity)
Represents customer loyalty metrics **per service type** (not total washes).

**Entities within:**
- `LoyaltyRecord` (root)
- `ServiceLoyalty` (per-service tracking)
- `LoyaltyPointEntry` (immutable log of points earned/expired)

**Value Objects:**
- `LoyaltyRecordId`
- `CustomerId`
- `ServiceId`
- `LoyaltyPoints` (accumulated points for this service)
- `ExpirationDays` (e.g., 180 days = 6 months, 365 days = 1 year)

**Properties:**
```
LoyaltyRecord {
  loyaltyId: LoyaltyRecordId
  tenantId: TenantId (which company this loyalty belongs to)
  customerId: CustomerId
  createdAt: DateTime
  updatedAt: DateTime
  serviceLoyal: ServiceLoyalty[] (one per service customer uses)
}

ServiceLoyalty {
  serviceId: ServiceId
  serviceName: String
  totalPoints: LoyaltyPoints
  pointsExpirationDays: ExpirationDays (configurable, e.g., 180 or 365)
  completions: Integer (total completions of this service)
  lastCompletionDate: DateTime (optional)
  pointEntries: LoyaltyPointEntry[]
}

LoyaltyPointEntry {
  entryId: String
  action: LoyaltyAction (POINTS_EARNED, POINTS_EXPIRED, POINTS_REDEEMED)
  serviceId: ServiceId
  bookingId: BookingId (optional, if earned from booking)
  pointsAmount: LoyaltyPoints
  expiresAt: DateTime (when these points expire)
  timestamp: DateTime
  details: String (optional)
}
```

**Key Methods:**
- `recordServiceCompletion(serviceId, bookingId)` → add points to service loyalty, check expiration rules, publish `ServicePointsEarned`
- `getServiceLoyalty(serviceId)` → retrieve loyalty for specific service
- `calculateExpiredPoints()` → identify expired points, publish `PointsExpired`
- `redeemPoints(serviceId, pointsAmount)` → reduce points when gift claimed, publish `PointsRedeemed`

**Loyalty Status (Per Service):**
- BRONZE: 1-4 points
- SILVER: 5-9 points
- GOLD: 10+ points

(Can be customized per service if needed)

---

### **Notification Context**

#### **Aggregate: NotificationTemplate** (Root Entity)
Email template definitions **per tenant**.

**Properties:**
```
NotificationTemplate {
  templateId: TemplateId
  tenantId: TenantId (which company this template belongs to)
  name: String (e.g., "BookingApprovedTemplate")
  subject: String (can include variables like {{customerName}})
  htmlBody: String (template with placeholders)
  variables: String[] (e.g., ["customerName", "bookingDate"])
  createdAt: DateTime
}
```

#### **Aggregate: NotificationLog** (Root Entity)
Record of sent notifications (audit trail) **per tenant**.

**Properties:**
```
NotificationLog {
  logId: NotificationLogId
  tenantId: TenantId (which company this notification belongs to)
  templateName: String
  recipient: Email
  subject: String
  sentAt: DateTime
  status: NotificationStatus (SENT, FAILED, PENDING)
  retryCount: Integer
  errorMessage: String (if failed)
}
```

---

### **Staff Context**

#### **Aggregate: Staff** (Root Entity)
Represents an employee.

**Entities within:**
- `Staff` (root)

**Value Objects:**
- `StaffId` (unique identifier)
- `Email`
- `FullName`
- `StaffRole` (ADMIN, STAFF) [foundation for future role-based access]

**Properties:**
```
Staff {
  staffId: StaffId
  tenantId: TenantId (UNIQUE - staff belongs to exactly ONE tenant)
  googleOAuthId: String (unique from Google)
  email: Email
  firstName: String
  lastName: String
  role: StaffRole
  isActive: Boolean
  createdAt: DateTime
  updatedAt: DateTime
}

Constraint: UNIQUE(googleOAuthId, tenantId)
  This means: Same person can NEVER be staff in multiple tenants
  (But same person CAN be customer in multiple tenants)
```

---

## Domain Events

Domain events represent significant business occurrences that other contexts may need to react to.

### **Booking Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `BookingRequested` | New booking submitted | Notification Context, Loyalty Context |
| `BookingApproved` | Admin approves booking | Notification Context, Loyalty Context |
| `BookingRejected` | Admin rejects booking | Notification Context |
| `BookingInfoRequested` | Admin requests more info | Notification Context |
| `BookingCancelled` | Customer/admin cancels booking | Notification Context, Loyalty Context |
| `BookingCompleted` | Staff marks booking complete | Notification Context, Loyalty Context |

### **Loyalty Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `WashCompleted` | Booking marked complete, loyalty updated | Notification Context |
| `CancellationRecorded` | Booking cancelled, loyalty updated | Notification Context |
| `LoyaltyStatusUpdated` | Loyalty record recalculated | Notification Context |

### **Notification Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `EmailSent` | Email successfully sent | Audit (optional) |
| `EmailFailed` | Email delivery failed | Retry queue |

---

## Value Objects Reference

### **Email**
- Validates RFC 5322 format
- Immutable
- Comparable by value

### **Phone**
- Validates phone number format
- Stores in international format
- Immutable

### **Money**
- Amount (decimal)
- Currency (default: USD)
- Supports operations: add, subtract, multiply
- Immutable

### **TimeSlot**
- startTime: DateTime
- endTime: DateTime
- Validates: endTime > startTime
- Overlaps with other slots: no

### **BookingStatus**
Enum: `PENDING | APPROVED | REJECTED | COMPLETED | CANCELLED`

### **BookingType**
Enum: `GUEST | CUSTOMER`

### **LoyaltyStatus** (Per Service)
- BRONZE: 1-4 points
- SILVER: 5-9 points
- GOLD: 10+ points

Example: Customer "John" for "Basic Wash" service:
- 3 completions × 1 point = 3 points → BRONZE status
- Still working toward SILVER (needs 5 points = 5 completions)

Separate from other services (John could be GOLD on Premium Wash but BRONZE on Basic Wash)

### **ExpirationDays**
Configurable per system (not per service). Options: 180 days (6 months), 365 days (1 year).
When points expire: auto-removed from loyalty, `PointsExpired` event published.

---

## Context Map & Communication

```
┌─────────────────────────────────────────────────────────┐
│                   Booking Context                        │
│  (Request, Approve, Complete, Cancel bookings)          │
│  Events: BookingRequested, BookingApproved,             │
│          BookingCompleted, BookingCancelled             │
└──────────────┬──────────────────────────────────────────┘
               │
         ┌─────┴─────┬──────────────┬──────────────┐
         │            │              │              │
    ┌────▼────┐  ┌───▼───┐  ┌──────▼──┐  ┌──────▼──┐
    │Customer │  │Loyalty│  │ Notify  │  │ Staff  │
    │Context  │  │Context│  │ Context │  │Context │
    └─────────┘  └───────┘  └─────────┘  └────────┘

Booking → Loyalty: "Hey, booking completed, increment wash count"
Booking → Notification: "Hey, new booking request, send email"
Booking → Staff: "Booking awaiting approval in dashboard"
```

---

## Anti-Corruption Layer (Future)

When integrating external services (e.g., payment provider, SMS service), create an anti-corruption layer to translate external models to our domain models. Not needed for MVP.

