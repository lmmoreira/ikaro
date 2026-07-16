# Tenants Settings Schema - Ikaro

**Status:** Phase 2 - Technical Architecture  
**Audience:** Backend developers, AI agents, database teams  
**Last Updated:** 2026-06-10

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
  "businessHours": { ... },
  "notification": { ... },
  "localization": { ... },
  "businessInfo": { ... }
}
```

---

## Settings by Category

### **1. Loyalty Settings** (`settings.loyalty`)

Controls how the loyalty system behaves for this tenant.

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `expiryDays` | integer | 180 | 1 | 3650 | Days until loyalty points expire after earning |
| `enableNotifications` | boolean | true | — | — | Send email when points expiring soon |
| `expiryWarningDays` | integer | 7 | 1 | 90 | Look-ahead window for expiring-soon check (weekly cron) |
| `notificationMinPoints` | integer | 50 | 0 | 10000 | Minimum active point balance a customer must have for the `PointsExpiringSoon` notification's threshold check (used by `notify-expiring-points.use-case.ts` and `loyalty-platform.port.ts`) |
| `pointsPerCurrencyUnit` | integer | 0 | 0 | 10000 | How many points equal 1 currency unit (e.g. `10` = 10 pts → R$1 / $1). `0` = loyalty redemption feature disabled — the discount strip will not appear during booking completion (UC-009 A6). |

**Example:**
```json
{
  "loyalty": {
    "expiryDays": 180,
    "enableNotifications": true,
    "expiryWarningDays": 7,
    "notificationMinPoints": 50,
    "pointsPerCurrencyUnit": 10
  }
}
```

**Validation Rules:**
- `expiryDays` must be between 1 and 3650 (1 year to 10 years)
- `expiryWarningDays` must be > 0 and < `expiryDays`
- `enableNotifications` must be boolean
- `notificationMinPoints` must be 0–10000
- `pointsPerCurrencyUnit` must be 0–10000 (`0` disables redemption)

---

### **2. Booking Settings** (`settings.booking`)

Controls booking lifecycle and rules.

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `cancellationWindowHours` | integer | 48 | 0 | 720 | Hours before appointment when customer can still cancel (0 = no self-cancellation) |
| `autoApproveEnabled` | boolean | false | — | — | **Reserved — post-MVP only. Currently ignored.** Automatically approve bookings without admin review. |
| `minBookingAdvanceHours` | integer | 0 | 0 | 8760 | Minimum hours in advance customer must book (0 = can book same day) |
| `maxBookingAdvanceDays` | integer | 90 | 1 | 365 | Maximum days in advance customer can book |
| `serviceBufferMinutes` | integer | 60 | 0 | 120 | Buffer time between service end and next booking (cleaning, prep time) |
| `slotGranularityMinutes` | integer | 30 | 15 | 60 | Calendar slot unit in minutes. Valid values: 15, 30, 60. Controls granularity of available start times shown in UC-011. |
| `welcomeStaffScreenDays` | integer | — | 1 | 90 | (`M13-S17`) Size of the configurable date window shown/filtered on the staff booking queue's day-strip navigator (`/dashboard/bookings`). |

**Example:**
```json
{
  "booking": {
    "cancellationWindowHours": 48,
    "autoApproveEnabled": false,
    "minBookingAdvanceHours": 0,
    "maxBookingAdvanceDays": 90,
    "serviceBufferMinutes": 60,
    "slotGranularityMinutes": 30
  }
}
```

**Validation Rules:**
- `cancellationWindowHours` must be 0–720 (0–30 days)
- `minBookingAdvanceHours` must be ≥ 0
- `maxBookingAdvanceDays` must be ≥ 1
- `minBookingAdvanceHours` / 24 must be < `maxBookingAdvanceDays`
- `slotGranularityMinutes` must be one of: 15, 30, 60

---

### **3. Business Hours** (`settings.businessHours`)

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
  "businessHours": {
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
1. System loads tenant's `settings.businessHours.timezone` (e.g., "America/New_York")
2. System converts current time to tenant timezone
3. System calculates available slots within business hours (in tenant timezone)
4. When displaying to user: show times in tenant timezone
5. When storing in database: convert to UTC (ISO 8601 always use Z suffix)
6. When retrieving for business logic: convert from UTC to tenant timezone

**Example Code (NestJS):**
```typescript
// Read tenant timezone
const tenantTimezone = tenant.settings.businessHours.timezone; // "America/New_York"

// Convert UTC time to tenant timezone for display
const bookingTimeUTC = booking.scheduledAt; // "2026-05-12T18:00:00Z" (always UTC)
const bookingTimeLocal = DateTime.fromISO(bookingTimeUTC).setZone(tenantTimezone);
console.log(bookingTimeLocal.toFormat("HH:mm")); // "14:00" (2 PM EST)

// Check if time is within business hours
const businessHours = tenant.settings.businessHours;
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
| `fromEmail` | string \| null | null | Custom sender address for this tenant's emails (e.g. `"lavagem@<ikaro-domain>"`). When null, the global `EMAIL_FROM` environment variable is used. Must be a valid email address. |

**Example:**
```json
{
  "notification": {
    "fromEmail": "lavagem@<ikaro-domain>"
  }
}
```

**Validation Rules:**
- `fromEmail` must be a valid email address when present
- If null or absent, falls back to the global `EMAIL_FROM` env var
- The address must be verified as a sender in Brevo before emails will be delivered in staging/production (confirm Brevo's exact sender/domain-verification menu path at implementation time)

**Usage in code:**
```typescript
// EmailDeliveryChannelAdapter resolves from address:
const tenantInfo = await tenantPort.getTenantInfo(message.tenantId);
const from = tenantInfo?.fromEmail ?? config.get('EMAIL_FROM');
```

---

### **5. Localization Settings** (`settings.localization`)

Country, currency, language, and regional preferences.

> **Updated (`TD02-LOCALIZATION`, merged 2026-06-21, before M13 started):** Ikaro is no longer Brazil-only. `countryCode` is the primary field — a `CountrySpec` registry (`packages/i18n/src/country-defaults.ts`) derives sensible defaults for `currency`/`language`/`decimalPlaces`/address format/phone prefix from it per tenant, overridable individually. This is what M13-S14's phone-mask and address-spec work (`InformationCompletionPrompt`, `shared/utils/phone-format.ts`) consumes directly.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `countryCode` | string | — | ISO 3166-1 alpha-2 country code (e.g. `"BR"`, `"US"`). Drives the `CountrySpec` defaults below. |
| `currency` | string | "BRL" | ISO 4217 currency code. Defaults from `countryCode`'s `CountrySpec`; overridable per tenant. |
| `currencySymbol` | string | "R$" | Display symbol (used in UI). |
| `language` | string | "pt-BR" | BCP-47 language tag. Defaults from `countryCode`'s `CountrySpec`; overridable per tenant. |
| `decimalPlaces` | integer | 2 | Decimal precision for money display |

**Example:**
```json
{
  "localization": {
    "countryCode": "BR",
    "currency": "BRL",
    "currencySymbol": "R$",
    "language": "pt-BR",
    "decimalPlaces": 2
  }
}
```

**Validation Rules:**
- `countryCode` must be a 2-letter alpha code (case-insensitive)
- `currency` must be a valid ISO 4217 code
- `currencySymbol` must be 1–3 characters
- `language` must be a BCP-47 language tag (e.g. `pt-BR`, not bare ISO 639-1 `pt`)
- `decimalPlaces` must be 0–8

---

### **6. Business Info Settings** (`settings.businessInfo`)

Public-facing contact details for the tenant's hotsite (M12-S06 `CONTACT` module). Optional — admins fill these in via UC-026; until then every field is `null` and the hotsite `CONTACT` module renders nothing for the corresponding `showXxx` flag.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `phone` | string \| null | null | Business phone, digits only (10–11 digits, no country code) — same format as `Customer.phone` |
| `email` | string \| null | null | Business contact email |
| `address` | object \| null | null | Business address — see sub-fields below |
| `socialLinks` | object \| null | null | Social/contact links — see sub-fields below |

**`address` sub-fields** (all required when `address` is non-null, except `complement`):

| Key | Type | Description |
|-----|------|-------------|
| `street` | string | Street name |
| `number` | string | Street number |
| `complement` | string (optional) | Suite / unit / floor |
| `neighborhood` | string | Neighborhood / district |
| `city` | string | City |
| `state` | string | UF — 2-letter Brazilian state code |
| `zipCode` | string | CEP, 8 digits, no hyphen |

**`socialLinks` sub-fields** (all optional/nullable independently):

| Key | Type | Description |
|-----|------|-------------|
| `whatsapp` | string \| null | WhatsApp contact number; validated as a phone number (`PhoneNumber.isValid`) when present |
| `instagram` | string \| null | Instagram profile URL |
| `facebook` | string \| null | Facebook page URL |

**Example:**
```json
{
  "businessInfo": {
    "phone": "31999999999",
    "email": "contato@lavacar.com.br",
    "address": {
      "street": "Rua das Flores",
      "number": "123",
      "complement": "Loja 2",
      "neighborhood": "Centro",
      "city": "Belo Horizonte",
      "state": "MG",
      "zipCode": "30130000"
    },
    "socialLinks": {
      "whatsapp": "31999999999",
      "instagram": "https://instagram.com/lavacar",
      "facebook": "https://facebook.com/lavacar"
    }
  }
}
```

**Validation Rules:**
- `phone`, when present, must be 10–11 digits (`PhoneNumber.isValid`)
- `email`, when present, must be a valid email address (`Email.isValid`)
- `address`, when present, requires `street`, `number`, `neighborhood`, `city`, `state`, `zipCode`; `complement` is optional
- `zipCode` must be exactly 8 digits (no hyphen)
- `state` must be a 2-letter uppercase Brazilian UF code
- `socialLinks.whatsapp`, when present, must be a valid phone number (`PhoneNumber.isValid`); `instagram`/`facebook` are unvalidated URL strings
- Any top-level field may be `null`/absent — partial business info is valid (e.g. `phone` set, `address` not yet filled)

**Usage:** Resolved into the public hotsite manifest's `business` field (camelCase) by `GetHotsiteManifestUseCase` — see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4 CONTACT.

---

## Complete Settings Example

```json
{
  "loyalty": {
    "expiryDays": 180,
    "enableNotifications": true,
    "expiryWarningDays": 7,
    "notificationMinPoints": 50,
    "pointsPerCurrencyUnit": 0
  },
  "booking": {
    "cancellationWindowHours": 48,
    "autoApproveEnabled": false,
    "minBookingAdvanceHours": 0,
    "maxBookingAdvanceDays": 90,
    "serviceBufferMinutes": 60,
    "slotGranularityMinutes": 30
  },
  "businessHours": {
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
    "fromEmail": null
  },
  "localization": {
    "countryCode": "BR",
    "currency": "BRL",
    "currencySymbol": "R$",
    "language": "pt-BR",
    "decimalPlaces": 2
  },
  "businessInfo": {
    "phone": "31999999999",
    "email": "contato@lavacar.com.br",
    "address": {
      "street": "Rua das Flores",
      "number": "123",
      "complement": "Loja 2",
      "neighborhood": "Centro",
      "city": "Belo Horizonte",
      "state": "MG",
      "zipCode": "30130000"
    },
    "socialLinks": {
      "whatsapp": "31999999999",
      "instagram": "https://instagram.com/lavacar",
      "facebook": "https://facebook.com/lavacar"
    }
  }
}
```

---

## Defaults (MVP Tenant Creation)

When a developer provisions a new tenant (UC-024), if settings are not provided, the system creates:

```json
{
  "loyalty": {
    "expiryDays": 180,
    "enableNotifications": true,
    "expiryWarningDays": 7,
    "notificationMinPoints": 50,
    "pointsPerCurrencyUnit": 0
  },
  "booking": {
    "cancellationWindowHours": 48,
    "autoApproveEnabled": false,
    "minBookingAdvanceHours": 0,
    "maxBookingAdvanceDays": 90,
    "serviceBufferMinutes": 60,
    "slotGranularityMinutes": 30
  },
  "businessHours": {
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
    "fromEmail": null
  },
  "localization": {
    "countryCode": "BR",
    "currency": "BRL",
    "currencySymbol": "R$",
    "language": "pt-BR",
    "decimalPlaces": 2
  },
  "businessInfo": {
    "phone": null,
    "email": null,
    "address": null,
    "socialLinks": null
  }
}
```

---

## Reading Settings in Code

### **Backend (NestJS)**

```typescript
// Inject the tenant context
constructor(private tenantContext: RequestContext) {}

// Access settings
const loyaltyExpiryDays = this.tenantContext.settings.loyalty.expiryDays; // 180
const cancellationWindow = this.tenantContext.settings.booking.cancellationWindowHours; // 48
const timezone = this.tenantContext.settings.businessHours.timezone; // "America/Sao_Paulo"
const currency = this.tenantContext.settings.localization.currency; // "BRL"
```

### **Example: Validating Cancellation Window (UC-007)**

```typescript
async canCancelBooking(booking: Booking, now: DateTime, tenantId: string): Promise<boolean> {
  const tenant = await this.tenantsRepository.findById(tenantId);
  const cancellationWindowHours = tenant.settings.booking.cancellationWindowHours;
  
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
- `staff.maxConcurrentBookings`: Limit bookings per staff member
- `services.showPricesOnHotsite`: Toggle price visibility
- `notifications.smsEnabled`: SMS delivery (future)
- `analytics.dataRetentionDays`: How long to keep analytics
- `api.rateLimitPerHour`: API rate limiting
- `payments.stripeAccountId`: Payment gateway config (future)

Add these via gradual migration — JSONB schema is designed for flexibility.

---

## Migration & Backward Compatibility

- **New tenants:** Created with full default settings (as shown above)
- **Existing tenants:** If any key is missing, use the default value for that key (at read time, not migration time)
- **Validation:** Always validate on write, use defaults on read if missing

Example (defensive code):

```typescript
const expiryDays = tenant.settings?.loyalty?.expiryDays ?? 180; // Use default if missing
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

**Status:** Complete — UC-026 (Tenant Settings Edit) implemented in `M13-S31`  
**Reference:** 04-USE_CASES.md UC-026, 02-DOMAIN_MODEL.md tenants section
