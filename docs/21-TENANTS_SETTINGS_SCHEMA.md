# Tenants Settings Schema - BeloAuto

**Status:** Phase 2 - Technical Architecture  
**Audience:** Backend developers, AI agents, database teams  
**Last Updated:** 2026-05-11

---

## Overview

The `tenants.settings` column is a JSONB field that stores per-tenant configuration. This document defines the canonical schema, validation rules, and defaults.

---

## Schema Definition

### **Root Structure**

```json
{
  "loyalty": { ... },
  "booking": { ... },
  "business_hours": { ... },
  "localization": { ... }
}
```

---

## Settings by Category

### **1. Loyalty Settings** (`settings.loyalty`)

Controls how the loyalty system behaves for this tenant.

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `expiry_days` | integer | 180 | 1 | 3650 | Days until loyalty points expire after earning |
| `enable_notifications` | boolean | true | — | — | Send email when points expiring soon |
| `expiry_warning_days` | integer | 7 | 1 | 90 | Look-ahead window for expiring-soon check (weekly cron) |

**Example:**
```json
{
  "loyalty": {
    "expiry_days": 180,
    "enable_notifications": true,
    "expiry_warning_days": 7
  }
}
```

**Validation Rules:**
- `expiry_days` must be between 1 and 3650 (1 year to 10 years)
- `expiry_warning_days` must be > 0 and < `expiry_days`
- `enable_notifications` must be boolean

---

### **2. Booking Settings** (`settings.booking`)

Controls booking lifecycle and rules.

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `cancellation_window_hours` | integer | 48 | 0 | 720 | Hours before appointment when customer can still cancel (0 = no self-cancellation) |
| `auto_approve_enabled` | boolean | false | — | — | **Reserved — post-MVP only. Currently ignored.** Automatically approve bookings without admin review. |
| `min_booking_advance_hours` | integer | 0 | 0 | 8760 | Minimum hours in advance customer must book (0 = can book same day) |
| `max_booking_advance_days` | integer | 90 | 1 | 365 | Maximum days in advance customer can book |
| `service_buffer_minutes` | integer | 60 | 0 | 120 | Buffer time between service end and next booking (cleaning, prep time) |
| `slot_granularity_minutes` | integer | 30 | 15 | 60 | Calendar slot unit in minutes. Valid values: 15, 30, 60. Controls granularity of available start times shown in UC-011. |

**Example:**
```json
{
  "booking": {
    "cancellation_window_hours": 48,
    "auto_approve_enabled": false,
    "min_booking_advance_hours": 0,
    "max_booking_advance_days": 90,
    "service_buffer_minutes": 60,
    "slot_granularity_minutes": 30
  }
}
```

**Validation Rules:**
- `cancellation_window_hours` must be 0–720 (0–30 days)
- `min_booking_advance_hours` must be ≥ 0
- `max_booking_advance_days` must be ≥ 1
- `min_booking_advance_hours` / 24 must be < `max_booking_advance_days`
- `slot_granularity_minutes` must be one of: 15, 30, 60

---

### **3. Business Hours** (`settings.business_hours`)

Defines when the car wash operates. Used for availability calculations and reminders.

**Timezone Model: Single Tenant Timezone**
- All bookings, staff, and customers in a tenant operate in the **same timezone**
- No per-user timezone override in MVP
- Timezone is configured once per tenant and applies globally
- All times stored in database as UTC (ISO 8601)
- All times displayed to users in tenant's configured timezone

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `timezone` | string | "America/Sao_Paulo" | IANA timezone identifier (e.g., "America/Sao_Paulo", "America/Manaus", "America/Fortaleza") |
| `monday` | object | `{ open: "09:00", close: "18:00" }` | Hours for this day (null = closed), interpreted in tenant timezone |
| `tuesday` | object | `{ open: "09:00", close: "18:00" }` | — |
| `wednesday` | object | `{ open: "09:00", close: "18:00" }` | — |
| `thursday` | object | `{ open: "09:00", close: "18:00" }` | — |
| `friday` | object | `{ open: "09:00", close: "18:00" }` | — |
| `saturday` | object | `{ open: "09:00", close: "17:00" }` | — |
| `sunday` | object | null | — |

**Example:**
```json
{
  "business_hours": {
    "timezone": "America/Sao_Paulo",
    "monday": { "open": "09:00", "close": "18:00" },
    "tuesday": { "open": "09:00", "close": "18:00" },
    "wednesday": { "open": "09:00", "close": "18:00" },
    "thursday": { "open": "09:00", "close": "18:00" },
    "friday": { "open": "09:00", "close": "18:00" },
    "saturday": { "open": "09:00", "close": "17:00" },
    "sunday": null
  }
}
```

**Validation Rules:**
- `timezone` must be a valid IANA identifier (from Olson database)
- Each day's `open` and `close` must be HH:MM format (24-hour)
- `close` time must be > `open` time
- Day objects must be either null (closed) or `{ open: string, close: string }`

**Usage in Availability Calculation (UC-011):**
1. System loads tenant's `settings.business_hours.timezone` (e.g., "America/New_York")
2. System converts current time to tenant timezone
3. System calculates available slots within business hours (in tenant timezone)
4. When displaying to user: show times in tenant timezone
5. When storing in database: convert to UTC (ISO 8601 always use Z suffix)
6. When retrieving for business logic: convert from UTC to tenant timezone

**Example Code (NestJS):**
```typescript
// Read tenant timezone
const tenantTimezone = tenant.settings.business_hours.timezone; // "America/New_York"

// Convert UTC time to tenant timezone for display
const bookingTimeUTC = booking.scheduledAt; // "2026-05-12T18:00:00Z" (always UTC)
const bookingTimeLocal = DateTime.fromISO(bookingTimeUTC).setZone(tenantTimezone);
console.log(bookingTimeLocal.toFormat("HH:mm")); // "14:00" (2 PM EST)

// Check if time is within business hours
const businessHours = tenant.settings.business_hours;
const dayOfWeek = bookingTimeLocal.weekdayLong; // "Monday"
const dayHours = businessHours[dayOfWeek.toLowerCase()]; // { open: "09:00", close: "18:00" }
const isWithinHours = bookingTimeLocal.toFormat("HH:mm") >= dayHours.open &&
                      bookingTimeLocal.toFormat("HH:mm") <= dayHours.close;
```

---

### **4. Notification Settings** (`settings.notification`)

Controls per-tenant email delivery behaviour.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `from_email` | string \| null | null | Custom sender address for this tenant's emails (e.g. `"lavagem@beloauto.com.br"`). When null, the global `EMAIL_FROM` environment variable is used. Must be a valid email address. |

**Example:**
```json
{
  "notification": {
    "from_email": "lavagem@beloauto.com.br"
  }
}
```

**Validation Rules:**
- `from_email` must be a valid email address when present
- If null or absent, falls back to the global `EMAIL_FROM` env var
- The address must be verified in SendGrid (Sender Authentication → Single Sender Verification) before emails will be delivered in staging/production

**Usage in code:**
```typescript
// EmailDeliveryChannelAdapter resolves from address:
const tenantInfo = await tenantPort.getTenantInfo(message.tenantId);
const from = tenantInfo?.fromEmail ?? config.get('EMAIL_FROM');
```

---

### **5. Localization Settings** (`settings.localization`)

Currency, language, and regional preferences.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `currency` | string | "BRL" | ISO 4217 currency code. BeloAuto is Brazil-only — always BRL. |
| `currency_symbol` | string | "R$" | Display symbol (used in UI). Brazilian Real symbol. |
| `language` | string | "pt-BR" | BCP-47 language tag. All customer-facing text in Brazilian Portuguese. |
| `decimal_places` | integer | 2 | Decimal precision for money display |

**Example:**
```json
{
  "localization": {
    "currency": "BRL",
    "currency_symbol": "R$",
    "language": "pt-BR",
    "decimal_places": 2
  }
}
```

> BeloAuto is a Brazil-only product. All tenants use BRL and pt-BR. The `currency` and `language` fields are stored for completeness but should not be changed in MVP.
```

**Validation Rules:**
- `currency` must be a valid ISO 4217 code
- `currency_symbol` must be 1–3 characters
- `language` must be ISO 639-1 format
- `decimal_places` must be 0–8

---

## Complete Settings Example

```json
{
  "loyalty": {
    "expiry_days": 180,
    "enable_notifications": true,
    "expiry_warning_days": 7
  },
  "booking": {
    "cancellation_window_hours": 48,
    "auto_approve_enabled": false,
    "min_booking_advance_hours": 0,
    "max_booking_advance_days": 90,
    "service_buffer_minutes": 60,
    "slot_granularity_minutes": 30
  },
  "business_hours": {
    "timezone": "America/Sao_Paulo",
    "monday": { "open": "09:00", "close": "18:00" },
    "tuesday": { "open": "09:00", "close": "18:00" },
    "wednesday": { "open": "09:00", "close": "18:00" },
    "thursday": { "open": "09:00", "close": "18:00" },
    "friday": { "open": "09:00", "close": "18:00" },
    "saturday": { "open": "09:00", "close": "17:00" },
    "sunday": null
  },
  "notification": {
    "from_email": null
  },
  "localization": {
    "currency": "BRL",
    "currency_symbol": "R$",
    "language": "pt-BR",
    "decimal_places": 2
  }
}
```

---

## Defaults (MVP Tenant Creation)

When a developer provisions a new tenant (UC-024), if settings are not provided, the system creates:

```json
{
  "loyalty": {
    "expiry_days": 180,
    "enable_notifications": true,
    "expiry_warning_days": 7
  },
  "booking": {
    "cancellation_window_hours": 48,
    "auto_approve_enabled": false,
    "min_booking_advance_hours": 0,
    "max_booking_advance_days": 90,
    "service_buffer_minutes": 60,
    "slot_granularity_minutes": 30
  },
  "business_hours": {
    "timezone": "America/Sao_Paulo",
    "monday": { "open": "09:00", "close": "18:00" },
    "tuesday": { "open": "09:00", "close": "18:00" },
    "wednesday": { "open": "09:00", "close": "18:00" },
    "thursday": { "open": "09:00", "close": "18:00" },
    "friday": { "open": "09:00", "close": "18:00" },
    "saturday": { "open": "09:00", "close": "17:00" },
    "sunday": null
  },
  "notification": {
    "from_email": null
  },
  "localization": {
    "currency": "BRL",
    "currency_symbol": "R$",
    "language": "pt-BR",
    "decimal_places": 2
  }
}
```

---

## Reading Settings in Code

### **Backend (NestJS)**

```typescript
// Inject the tenant context
constructor(private tenantContext: TenantContext) {}

// Access settings
const loyaltyExpiryDays = this.tenantContext.settings.loyalty.expiry_days; // 180
const cancellationWindow = this.tenantContext.settings.booking.cancellation_window_hours; // 48
const timezone = this.tenantContext.settings.business_hours.timezone; // "America/Sao_Paulo"
const currency = this.tenantContext.settings.localization.currency; // "BRL"
```

### **Example: Validating Cancellation Window (UC-007)**

```typescript
async canCancelBooking(booking: Booking, now: DateTime, tenantId: string): Promise<boolean> {
  const tenant = await this.tenantsRepository.findById(tenantId);
  const cancellationWindowHours = tenant.settings.booking.cancellation_window_hours;
  
  const cutoffTime = booking.scheduledAt.minus({ hours: cancellationWindowHours });
  return now < cutoffTime; // true = can still cancel
}
```

---

## Updating Settings (UC-026)

Tenant admin edits settings via dashboard → updates `tenants.settings` JSONB.

**Validation:**
1. Parse incoming JSON
2. Validate each field against schema rules above
3. Return validation errors if any field invalid
4. If valid, UPDATE tenants SET settings = $1 WHERE id = $2
5. Invalidate any cached settings for this tenant

**Important:** Settings changes apply to **future bookings only**. Past bookings keep their original snapshotted values.

---

## Future Extensions (Post-MVP)

Possible future settings keys:
- `staff.max_concurrent_bookings`: Limit bookings per staff member
- `services.show_prices_on_hotsite`: Toggle price visibility
- `notifications.sms_enabled`: SMS delivery (future)
- `analytics.data_retention_days`: How long to keep analytics
- `api.rate_limit_per_hour`: API rate limiting
- `payments.stripe_account_id`: Payment gateway config (future)

Add these via gradual migration — JSONB schema is designed for flexibility.

---

## Migration & Backward Compatibility

- **New tenants:** Created with full default settings (as shown above)
- **Existing tenants:** If any key is missing, use the default value for that key (at read time, not migration time)
- **Validation:** Always validate on write, use defaults on read if missing

Example (defensive code):

```typescript
const expiryDays = tenant.settings?.loyalty?.expiry_days ?? 180; // Use default if missing
```

---

## AI-Agent Implementation Note

When implementing any feature that reads tenant configuration:

1. ✅ Always read from `tenant.settings`, never hardcode
2. ✅ Use the key path from this schema
3. ✅ Provide a sensible fallback (the "Default" value from the table above)
4. ✅ On UC-026 (settings edit), re-validate the entire settings object against this schema
5. ✅ Do NOT update or delete existing bookings when settings change (snapshot principle)

---

**Status:** Complete  
**Next:** Implement UC-026 (Tenant Settings Edit) using this schema  
**Reference:** 04-USE_CASES.md UC-026, 02-DOMAIN_MODEL.md tenants section
