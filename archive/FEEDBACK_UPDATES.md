# Phase 1 Update - Your Feedback Incorporated ✓

**Date:** 2025-05-11
**Status:** Documentation updated based on your feedback

---

## Changes Made

### 📧 **Reminder Emails** (6 AM scheduling)

#### Added to 01-BUSINESS_CONTEXT.md:
- Email: Booking reminder (1 day before, 6 AM)
- Email: Booking reminder (day of appointment, 6 AM)
- Email: Admin daily schedule (6 AM - today's customers & services)

#### New Events Added (03-DOMAIN_EVENTS.md):
- `BookingReminderSentCustomer` → 6 AM, 1 day before appointment
- `BookingReminderSentCustomerDay` → 6 AM, day of appointment
- `AdminDailyScheduleReminder` → 6 AM, list today's bookings

#### New Use Cases (04-USE_CASES.md):
- UC-018: Admin receives daily schedule reminder
- UC-019: Customer receives booking reminder (day before)
- UC-020: Customer receives booking reminder (day of)

**Implementation Note:** System uses scheduled cron job (6 AM daily)

---

### 📸 **Multiple Photos** (Per Booking & After-Service)

#### Updated 02-DOMAIN_MODEL.md:
**Booking Aggregate:**
- `carPhotoUrls: String[]` (multiple photos, not single)
- `afterServicePhotoUrls: String[]` (staff uploads after completion)
- New methods: `uploadCarPhotos()`, `uploadAfterServicePhotos()`

#### Updated 01-BUSINESS_CONTEXT.md:
- Photo management: "multiple car photos when booking"
- "Staff uploads multiple photos after service completion"
- "optional but encouraged" with incentive messaging

#### Updated 04-USE_CASES.md:
- UC-001: Guest can upload/remove multiple photos
- UC-009: Staff can upload/remove multiple after-service photos
- Both support optional uploads with encouragement text

**Encouragement Strategy:**
- Booking: "Help us understand your car's condition"
- After-service: "Help customer see the result & use for marketing"

---

### 🎯 **Service-Specific Loyalty with Points** (Option 3)

#### Updated 02-DOMAIN_MODEL.md:

**Service Aggregate:**
- New field: `loyaltyPointsValue: LoyaltyPoints` (e.g., Basic=1pt, Premium=2pts, Wax=3pts)
- Admin can configure points per service

**LoyaltyRecord Aggregate (Complete Redesign):**
- **OLD:** Total wash count, single status (BRONZE/SILVER/GOLD)
- **NEW:** Per-service tracking with points & expiration

```
LoyaltyRecord {
  customerId: CustomerId
  serviceLoyal: ServiceLoyalty[] (one per service customer uses)
}

ServiceLoyalty {
  serviceId: ServiceId
  serviceName: String
  totalPoints: LoyaltyPoints
  completions: Integer
  pointsExpirationDays: ExpirationDays (180 or 365)
  pointEntries: LoyaltyPointEntry[] (log of points earned/expired/redeemed)
}

LoyaltyPointEntry {
  action: (POINTS_EARNED, POINTS_EXPIRED, POINTS_REDEEMED)
  pointsAmount: LoyaltyPoints
  expiresAt: DateTime
  timestamp: DateTime
}
```

**Example:**
```
Customer "John":
  Basic Wash:    5 points (SILVER) - expires in 120 days
    5 completions × 1 point = 5 points
  
  Premium Wash:  3 points (BRONZE) - expires in 150 days
    1 completion × 2 points = 2 points
    + 1 admin bonus point = 3 total
  
  Wax:           0 points (no history)
```

---

### ⏰ **Points Expiration** (Configurable: 6 months, 1 year, etc.)

#### New field on LoyaltyRecord:
- `pointsExpirationDays: Integer` (e.g., 180 = 6 months, 365 = 1 year)
- Configurable per system (not per service, not per customer)

#### New Event (03-DOMAIN_EVENTS.md):
- `PointsExpired` → When points past expiration date
  - Triggers automatic cleanup
  - Notification Context can send optional email

#### Behavior:
- Points awarded with expiration date
- System cron job checks daily for expired points
- Expired points removed from total
- `PointsExpired` event published
- Admin & customer can view when points expire

---

### 💰 **Loyalty Status Calculation** (Simple 3-tier)

**Per Service (Independent):**
- BRONZE: 1-4 points
- SILVER: 5-9 points
- GOLD: 10+ points

**Not based on:**
- ❌ Total washes (per-service instead)
- ❌ Cancellations (ignored in points system)
- ✓ Points accumulated per service

**Example:**
- "Basic Wash" status: BRONZE (3 points)
- "Premium Wash" status: GOLD (12 points) ← Can be different!
- NOT: "Overall" status based on total washes

---

### 📊 **Loyalty Events Updated** (03-DOMAIN_EVENTS.md)

**OLD Events → NEW Events:**
- ❌ `WashCompleted` → ✓ `ServicePointsEarned`
- ❌ `CancellationRecorded` → ✓ (removed, not relevant to points)
- ❌ `LoyaltyStatusUpdated` → ✓ `PointsExpired`, `PointsRedeemed`

**New Event Data:**
`ServicePointsEarned` includes:
- `serviceId` (which service)
- `serviceName` (service name for email)
- `pointsEarned` (how many points)
- `totalServicePoints` (new total for that service)
- `serviceStatus` (BRONZE/SILVER/GOLD for that service)
- `expiresAt` (when these points expire)

---

### 📋 **Updated Use Cases** (04-USE_CASES.md)

#### Modified:
- **UC-001:** Guest can upload multiple photos (encourage)
- **UC-009:** Staff uploads multiple after-service photos (encourage)
- **UC-016:** View per-service loyalty (not total wash count)

#### New:
- **UC-018:** Admin daily schedule reminder (6 AM)
- **UC-019:** Customer reminder day before (6 AM)
- **UC-020:** Customer reminder day of (6 AM)

**Total Use Cases:** 17 → 20

---

## Context Loyalty Example

**Before:**
```
Booking completed
→ WashCompleted event
→ Loyalty: totalWashes += 1
→ Recalculate: BRONZE/SILVER/GOLD
```

**After (New Design):**
```
Booking completed for "Premium Wash"
→ ServicePointsEarned event (serviceId, serviceName, points=2)
→ Loyalty: Basic Wash loyalty unchanged
→ Loyalty: Premium Wash += 2 points
→ Loyalty: Premium Wash status recalculated (e.g., SILVER)
→ Notification: "You earned 2 points on Premium Wash! Total: 7 points"

Separate from:
Booking completed for "Basic Wash" (1 point each)
→ Independent loyalty per service
```

---

## Future-Ready Design

✓ Supports gift milestones per service:
```
Basic Wash: 10 points → $5 gift
Premium Wash: 5 points → $15 gift (more expensive service)
Wax: 20 points → $50 gift (premium service)
```

✓ Supports points expiration:
```
Admin sets: expirationDays = 180
Earned: May 11, 2026
Expires: November 8, 2026
```

✓ Supports admin bonuses:
```
Admin manually adds points (e.g., loyalty bonus, referral)
→ Treated same as earned points
→ Subject to same expiration rules
```

---

## Files Updated

1. ✓ **docs/01-BUSINESS_CONTEXT.md**
   - Reminder emails (6 AM)
   - Photo management (multiple, encouraged)
   - Loyalty (per-service points, expiration)

2. ✓ **docs/02-DOMAIN_MODEL.md**
   - Booking: multiple photo URLs
   - Service: loyaltyPointsValue field
   - LoyaltyRecord: complete redesign (per-service, points-based)
   - Methods: uploadCarPhotos(), uploadAfterServicePhotos()

3. ✓ **docs/03-DOMAIN_EVENTS.md**
   - New: BookingReminderSentCustomer
   - New: BookingReminderSentCustomerDay
   - New: AdminDailyScheduleReminder
   - Updated: ServicePointsEarned (was WashCompleted)
   - New: PointsExpired
   - New: PointsRedeemed

4. ✓ **docs/04-USE_CASES.md**
   - UC-001: Multiple photo upload
   - UC-009: Multiple after-service photos + points
   - UC-016: Per-service loyalty view
   - New: UC-018, UC-019, UC-020 (reminders)

5. ✓ **docs/05-BOUNDED_CONTEXTS.md**
   - Loyalty Context: Updated responsibilities (per-service, points, expiration)
   - Event-to-Email mapping: Updated with new events

---

## Summary of Changes

| Item | Before | After |
|------|--------|-------|
| Photos | Single per booking | Multiple per booking + after-service |
| Reminders | 24h before only | Day before (6 AM) + Day of (6 AM) + Admin daily (6 AM) |
| Loyalty Tracking | Wash count + status | Points per service + expiration |
| Service Field | No points | Points value (configurable) |
| Loyalty Status | Overall BRONZE/SILVER/GOLD | Per-service independent status |
| Points | Not tracked | Tracked with expiration date |
| Use Cases | 17 | 20 |

---

## Next Steps

✓ All documentation updated
✓ Ready for Phase 2 (Technical Architecture)
✓ No breaking changes to existing design
✓ Fully backward compatible with bounded contexts

**Your feedback has been fully incorporated into Phase 1.**

Ready to proceed with Phase 2?

