# Review: Two New Use Cases - Documentation Update Plan

**Date:** 2026-05-12  
**Status:** Comprehensive Review Complete

---

## Executive Summary

You've requested two new features:

1. **Actual Price Charged**: Staff can record the actual price charged when completing a booking (may differ from service price)
2. **Address Fields**: Add address support for customers and guests (for pickup service)

Both requirements are **compatible** with the current architecture and require surgical updates to documentation and domain model.

---

## 1. ACTUAL PRICE CHARGED FEATURE

### Current State
- UC-009 allows staff to mark bookings complete with optional notes and after-service photos
- The `totalPrice` is set at booking request time and remains immutable
- No mechanism to adjust or record a different actual price

### Required Changes

#### **1.1 Use Cases Document (04-USE_CASES.md)**

**Location:** UC-009 "Admin Marks Booking Complete" (lines 263-288)

**Changes:**
- Add new step between main flow steps 4 and 5:
  ```
  4a. Staff/Admin optionally enters the actual price charged 
      (if different from the quoted totalPrice).
  4b. System validates: actualPrice >= 0.
  ```

- Add new alternative flow:
  ```
  A5: Price adjustment on completion
      - Staff marks booking with different actual price than quoted
      - Example: Quoted $80, but charged $75 due to loyalty discount 
                 applied at service time
      - Example: Quoted $80, but charged $100 due to additional 
                 services performed
      - System records both: quotedPrice and actualPrice
      - Booking entity snapshots both for audit trail
      - Event carries both prices for potential accounting integration
  ```

- Update Postconditions:
  ```
  Before: "Booking is COMPLETED. For authenticated customers: N new LoyaltyEntry rows..."
  After:  "Booking is COMPLETED with both quotedPrice and actualPrice recorded. 
           For authenticated customers: N new LoyaltyEntry rows (earned on quotedPrice, 
           not actualPrice)..."
  ```

**Note:** Loyalty points are earned based on SERVICE points_value (not price), so no impact there.

#### **1.2 Domain Model (02-DOMAIN_MODEL.md)**

**Location:** Booking Aggregate properties (lines 115-156)

**Changes:**
- Add to Booking root entity properties:
  ```
  actualPrice:         Money | null      (UC-009 alternative A5 — staff-entered price at completion)
  actualPriceEnteredAt: DateTime | null  (when this was recorded)
  actualPriceEnteredBy: StaffId | null   (which staff member recorded it)
  ```

- Add to Key Methods (for Booking aggregate root):
  ```
  completeBooking(afterServicePhotoUrls, adminNotes?, actualPrice?) 
    → validates actualPrice (if provided), records it with timestamp & staff ID
  ```

**Location:** BookingCompleted event section (lines 453-461)

- Update event description:
  ```
  `BookingCompleted`     Carries both quotedPrice (total_price) and actualPrice 
                         (if recorded); useful for accounting reconciliation
  ```

#### **1.3 Database Schema (13-DATABASE_SCHEMA.md)**

**Location:** Bookings table (lines 72-104)

**Changes:** Add three new columns:
```
| actual_price | DECIMAL(12,2) | NULL — staff-entered actual charge amount (UC-009 A5) |
| actual_price_entered_at | TIMESTAMP WITH TIME ZONE | NULL — when recorded |
| actual_price_entered_by | UUID | FK -> staff(id) — which staff member recorded it |
```

- Add to Bookings **Rules** section:
  ```
  - `actual_price` may be NULL (price not recorded) or a non-negative number
  - If provided, it is immutable after insertion (staff cannot edit — only record once)
  - If different from `total_price`, the difference is captured for accounting/reporting
  ```

#### **1.4 API Contracts (14-API_CONTRACTS.md)**

**Location:** Completion endpoint (line 282)

**Changes:** 
```
PATCH /bookings/:id/complete
Body:
  {
    "notes": "...",
    "photoUrls": ["..."],
    "actualPrice": { "amount": 75.00, "currency": "USD" }  // NEW, optional
  }

Response:
  {
    "bookingId": "...",
    "status": "COMPLETED",
    "quotedPrice": { "amount": 80.00, "currency": "USD" },
    "actualPrice": { "amount": 75.00, "currency": "USD" },  // NEW
    "actualPriceEnteredBy": "uuid",  // NEW
    "actualPriceEnteredAt": "ISO8601",  // NEW
    ...
  }

Error:
  - 400 invalid-actual-price — actualPrice is negative or invalid format
```

#### **1.5 Domain Events (03-DOMAIN_EVENTS.md)**

**Location:** BookingCompleted event (lines 451-461)

**Changes:**
- Update event payload description to include:
  ```
  BookingCompleted carries:
    - bookingId
    - customerId (if any)
    - lines (full line list)
    - quotedPrice (total_price)
    - actualPrice (if recorded by staff)  [NEW]
    - completedAt
    - completedBy
  ```

---

## 2. ADDRESS FIELDS FEATURE

### Current State
- Customers have: email, phone, firstName, lastName, googleOAuthId
- Guests have: guestInfo JSONB with name, email, phone
- No address information captured

### Required Changes

#### **2.1 Use Cases Document (04-USE_CASES.md)**

**New UC-001A: Guest Provides Address for Pickup (Enhancement to UC-001)**

**Location:** After UC-001, before UC-002

```
UC-001A: Guest Provides Address for Pickup Service

- Actor: Guest (unauthenticated user)
- Preconditions: Guest is on tenant's hotsite booking page. Guest has selected services. 
  Tenant offers pickup/delivery service (if not, address fields are optional).
- Trigger: Guest selects "Pickup at my home" option during booking.
- Main Flow:
  1. System displays address form (if not already filled):
     - Street address (required for pickup)
     - City (required)
     - State/Province (required)
     - Postal/ZIP code (required)
     - Country (required)
  2. Guest enters address details
  3. Guest optionally uploads photos
  4. Guest clicks "Submit"
  5. System validates: all address fields non-empty, valid format
  6. System creates Booking with guest address in guestInfo
  7. Rest of UC-001 flow applies

- Alternative Flows:
  - A1: Guest does not want pickup → Address fields optional/hidden; guest provides delivery address or N/A
  - A2: Guest address invalid → System shows error with specific field, guest corrects

- Postconditions: Booking created with complete guest address in guestInfo
- Events Triggered: BookingRequested (now includes guestInfo.address)
```

**Also Update:**
- **UC-002 (Customer Requests Booking)**: Add note about address pre-fill from customer profile
  ```
  Step 2a: If customer has address on profile, system pre-fills address form 
           (customer can edit for this specific booking if different)
  ```

- **UC-006 (View Bookings)**: Add address display
  ```
  Step 5: Clicking a booking shows full detail including:
    - For customers: customer address (from profile) + any address overrides
    - For guests: guest address (from booking)
  ```

#### **2.2 Domain Model (02-DOMAIN_MODEL.md)**

**Location:** Customer Aggregate (lines 278-315)

**Changes:** Add Address Value Object to Customer:
```
Customer {
  customerId: CustomerId
  tenantId: TenantId
  googleOAuthId: String
  email: Email
  phone: Phone
  firstName: String
  lastName: String
  address: Address | null  [NEW - optional for customers]
  createdAt: DateTime
  updatedAt: DateTime
}

Value Object: Address {
  streetAddress: String (required)
  city: String (required)
  stateProvince: String (required)
  postalCode: String (required)
  country: String (required)
}
```

**Location:** Booking Aggregate (lines 115-156)

**Changes:** Update guestInfo JSONB structure:
```
Before:
  guestInfo: {
    "name": "",
    "email": "",
    "phone": ""
  }

After:
  guestInfo: {
    "name": "",
    "email": "",
    "phone": "",
    "address": {  [NEW]
      "streetAddress": "",
      "city": "",
      "stateProvince": "",
      "postalCode": "",
      "country": ""
    }
  }
```

- **Add note:** "For authenticated customers: address is pulled from Customer.address at booking time; guests enter address during booking request."

#### **2.3 Database Schema (13-DATABASE_SCHEMA.md)**

**Location:** Customers table (lines 37-47)

**Changes:** Add address fields:
```
| address | JSONB | NULL — structured address: 
  { "streetAddress": "", "city": "", "stateProvince": "", 
    "postalCode": "", "country": "" }
```

- Add to Customers **Rules**:
  ```
  - address is optional (NULL when not provided)
  - address is mutable (customer can update their profile)
  - all address fields follow standard address formatting (no special validation in MVP)
  ```

**Location:** Bookings table guestInfo description (line 84)

**Changes:** Update description:
```
Before:
  guest_info | JSONB | NULL when customer_id IS NOT NULL; 
             | { "name": "", "email": "", "phone": "" } otherwise

After:
  guest_info | JSONB | NULL when customer_id IS NOT NULL; 
             | { "name": "", "email": "", "phone": "", 
             |   "address": { "streetAddress": "", ... } } otherwise
             | (address is optional within guest_info)
```

#### **2.4 API Contracts (14-API_CONTRACTS.md)**

**Location:** Booking Requests section (lines 230-269)

**Changes:** Update request body for POST /bookings:
```
POST /bookings
Body:
  {
    "serviceIds": ["uuid-basic-wash", "uuid-wax"],
    "scheduledAt": "ISO8601",
    "guestInfo": {
      "name": "...",
      "email": "...",
      "phone": "...",
      "address": {  // NEW, optional
        "streetAddress": "123 Main St",
        "city": "Springfield",
        "stateProvince": "IL",
        "postalCode": "62701",
        "country": "USA"
      }
    },
    "carPhotoUrls": ["https://..."]
  }

For authenticated customers:
  - omit guestInfo entirely
  - system uses customer's address from profile
  - if customer provides override address for this booking: 
    store in booking.guest_info temporarily (or add booking.customer_address_override)
```

**New Endpoints:**

**Location:** Customer Management section (lines 317-325)

```
PATCH /customers/me/address  [NEW]
  - Updates current customer's address on profile
  - Body: { "streetAddress": "...", "city": "...", ... }
  - Response: 200 OK with updated customer profile

PATCH /customers/:id/address  [NEW - Admin only]
  - Admin updates any customer's address
  - Requires ADMIN role, same tenant
```

#### **2.5 Domain Events (03-DOMAIN_EVENTS.md)**

**Location:** BookingRequested event (lines 451-456)

**Changes:**
- Update event payload:
  ```
  `BookingRequested`  Now carries complete guest info (name, email, phone, address)
                      For authenticated customers: customerEmail + optional address override
  ```

---

## 3. IMPACT SUMMARY TABLE

| Document | Section | Change Type | Priority |
|----------|---------|-------------|----------|
| **04-USE_CASES.md** | UC-009 | Extend existing | Medium |
| **04-USE_CASES.md** | New UC-001A | New use case | Medium |
| **04-USE_CASES.md** | UC-002, UC-006 | Enhance existing | Low |
| **02-DOMAIN_MODEL.md** | Booking aggregate | Add actualPrice fields | Medium |
| **02-DOMAIN_MODEL.md** | Customer aggregate | Add address | Medium |
| **02-DOMAIN_MODEL.md** | Booking guestInfo | Extend JSONB | Medium |
| **13-DATABASE_SCHEMA.md** | Bookings table | Add 3 columns | Medium |
| **13-DATABASE_SCHEMA.md** | Customers table | Add 1 JSONB column | Medium |
| **14-API_CONTRACTS.md** | POST /bookings | Update body schema | Medium |
| **14-API_CONTRACTS.md** | PATCH /bookings/:id/complete | Add actualPrice | Medium |
| **14-API_CONTRACTS.md** | Customer endpoints | Add PATCH /customers/me/address | Low |
| **03-DOMAIN_EVENTS.md** | BookingCompleted | Update payload | Low |
| **03-DOMAIN_EVENTS.md** | BookingRequested | Update payload | Low |

---

## 4. BACKWARD COMPATIBILITY NOTES

✅ **Actual Price Charged:**
- Field is **optional** → no breaking changes
- Existing bookings with NULL actualPrice continue to work
- Old API consumers can omit actualPrice in requests

✅ **Address Fields:**
- Customer address is **optional** (NULL) → no breaking changes
- Guest address is **optional within guestInfo** → no breaking changes
- Old API consumers can omit address fields
- Existing bookings without address continue to work

---

## 5. IMPLEMENTATION PRIORITIES

### Phase 1 (Core):
1. Update **02-DOMAIN_MODEL.md** (Booking + Customer aggregates)
2. Update **13-DATABASE_SCHEMA.md** (add columns)
3. Update **04-USE_CASES.md** (UC-009 extension + UC-001A)
4. Update **14-API_CONTRACTS.md** (request/response schemas)

### Phase 2 (Supporting):
5. Update **03-DOMAIN_EVENTS.md** (event payloads)
6. Update **05-BOUNDED_CONTEXTS.md** (if Customer Context responsibilities change)

### Phase 3 (Optional):
7. Review **15-HOTSITE_DYNAMIC_ARCHITECTURE.md** (if address form rendering needed)
8. Review **16-DASHBOARD_FRONTEND_ARCHITECTURE.md** (if admin UI for address management)

---

## 6. RECOMMENDATIONS

✅ **Both features are architecturally sound:**
- No breaking changes (all new fields are optional)
- Fit naturally into existing aggregates
- Can be implemented independently or together
- No new bounded contexts needed
- Leverage existing event patterns

✅ **Address is more urgent** if pickup service is a core requirement

⚠️ **Actual Price** is valuable for accounting/reconciliation—prioritize if business model involves flexible pricing

---

## Questions for Clarification (Optional)

1. **Address Priority**: Is pickup service launching soon? If yes, prioritize address implementation.
2. **Actual Price Scope**: Should it affect loyalty points? (Current design: NO — points earned on service.points_value only)
3. **Customer Address Updates**: Can customers edit their address in profile? (Recommended: YES)
4. **Guest Address Storage**: Persist guest addresses for future bookings? (Recommended: NO in MVP—re-enter each time)
5. **Address Validation**: Should addresses be geo-validated (e.g., Google Maps API)? (Recommended: NOT in MVP—simple string validation OK)

---

**Next Steps:** Ready to implement these updates. Shall I proceed with updating all affected documents?
