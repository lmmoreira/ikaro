# Value Objects — Agent Reference

> **When to load:** working with aggregate fields, repository mappers, JSONB columns or in-memory repo comparisons: the shared value-object catalog and the aggregate props pattern; aggregate shapes are in `docs/DOMAIN_MODEL.md`.
> **Tags:** backend, agent-process

---

## Catalog (`src/shared/value-objects/`)

| Field | VO Class | File | Rule |
|---|---|---|---|
| Email address | `Email` | `email.vo.ts` | validates format; normalises to lowercase; getter: `.address` |
| Phone number | `PhoneNumber` | `phone-number.vo.ts` | strict E.164 (`+<prefix><digits>`, e.g. `+5511912345678`) via `isValidPhoneNumber` from `@ikaro/validation`; no digit-stripping or normalization — `create()` throws on anything else; getter: `.value` |
| Physical address | `Address` | `address.ts` | structured fields; `create(props, spec: AddressSpec)` validates against a country-specific spec (postal regex, state pattern, neighborhood requirement) — takes a mandatory `spec` param, not a fixed Brazilian-CEP-length check; `reconstitute()` skips validation |
| Money amount | `Money` | `money.ts` | currency code + decimal precision — never a plain `number`; fully implemented, used across aggregates/use cases/repositories |
| Hex colour | `HexColor` | `hex-color.vo.ts` | must match `#RRGGBB`; normalises to uppercase; getter: `.value` |
| IANA timezone | `Timezone` | `timezone.vo.ts` | validates through `isValidTimezone` from `@ikaro/validation` (an `Intl.DateTimeFormat` construction in a try/catch); getter: `.value` |
| HH:MM time | `TimeOfDay` | `time-of-day.vo.ts` | validates HH:MM string; `isBefore()` comparison; getter: `.value` |
| YYYY-MM-DD calendar date | `CalendarDate` | `calendar-date.vo.ts` | validates a real calendar date via `isValidCalendarDate` from `@ikaro/validation` (Zod's `z.iso.date()` — rejects `2026-02-30`, non-leap Feb 29); `isBefore()` comparison; `today()` (UTC); getter: `.value` |
| URL-safe slug | `Slug` | `slug.vo.ts` | `/^[a-z0-9-]+$/`; used for tenant slugs; getter: `.value` |
| ISO country code | `CountryCode` | `country-code.vo.ts` | validates against supported country list; getter: `.value` |
| SEO page title | `SeoTitle` | `seo-title.vo.ts` | length-bounded per SEO best practice; getter: `.value` |
| SEO meta description | `SeoDescription` | `seo-description.vo.ts` | length-bounded per SEO best practice; getter: `.value` |

**Booking-only value objects (`src/contexts/booking/domain/`, TD56-S03):**

| Field | VO Class | File | Rule |
|---|---|---|---|
| Service public-page address | `ServicePublicSlug` | `service-public-slug.vo.ts` | `/^[a-z0-9]+(-[a-z0-9]+)*$/`, 3–60 chars, never typed by a user: `fromName(name, uniqueSuffix?)` derives it (accents stripped; a name with no usable text becomes `servico`; the suffix is appended and the base shortened so it always fits 60) on the first publish; `create()` validates and lowercases/trims, `reconstitute()` skips validation; typed error `ServicePublicSlugInvalidError` (`BOOKING_SERVICE_PUBLIC_SLUG_INVALID`, defensive only: the slug is always generated, never user input); getter: `.value` |
| Service public-page content | `ServicePublicProfile` | `service-public-profile.vo.ts` | cover + gallery (≤ 8) image paths (never a URL or traversal), `longDescription` ≤ 4000 (restricted Markdown), `inclusions` ≤ 12 × 120 (blank rows dropped), `preparationNotes` ≤ 1000; each image path ≤ 512 characters; limits from `SERVICE_PUBLIC_PROFILE_LIMITS` (`@ikaro/types`); typed error `ServicePublicProfileInvalidError` with seven reasons (`gallery-too-large`, `long-description-too-long`, `inclusions-too-many`, `inclusion-too-long`, `preparation-notes-too-long`, `image-path-invalid`, `image-not-uploaded`) — the two image reasons always report the field `coverImageUrl`, even when the bad path is a gallery entry; `imagePaths()`/`mapImagePaths()` expose and rewrite the paths for promotion; persisted as one JSONB column via `toJSON()`/`reconstitute()` |

The folder also holds two plain type files that are not validated VOs and have no `create()`: `business-hours.vo.ts` (the `BusinessHours`/`DayHours` shapes and `DAYS_OF_WEEK`) and `tenant-settings-data.ts` (the typed `tenants.settings` sections). Do not copy them as a VO template.

---

## Aggregate props pattern (Option A — mandatory)

Props interfaces use VO types. Getters return the VO — never a derived string.

```typescript
export interface CustomerProps {
  email: Email;
  phone: PhoneNumber | null;
  defaultAddress: Address | null;
  slug: Slug;
}

get email(): Email { return this.props.email; }
get phone(): PhoneNumber | null { return this.props.phone; }
```

`create()` factory receives raw strings and constructs VOs:

```typescript
static create(raw: { email: string; phone: string | null }): Customer {
  return new Customer({
    email: Email.create(raw.email),
    phone: raw.phone === null ? null : PhoneNumber.create(raw.phone),
  });
}
```

---

## Repository mapper pattern

### `toDomain()` — DB row → aggregate

```typescript
toDomain(entity: CustomerEntity): Customer {
  return Customer.reconstitute({
    email: Email.create(entity.email),
    phone: entity.phone ? PhoneNumber.create(entity.phone) : null,
    slug: Slug.create(entity.slug),
    // JSONB column — skip re-validation with reconstitute()
    defaultAddress: entity.defaultAddress
      ? Address.reconstitute(entity.defaultAddress as unknown as AddressProps)
      : null,
  });
}
```

### `toEntity()` — aggregate → DB row

```typescript
toEntity(customer: Customer): CustomerEntity {
  const entity = new CustomerEntity();
  entity.email = customer.email.address;          // Email VO
  entity.phone = customer.phone?.value ?? null;   // PhoneNumber / Slug / HexColor / etc.
  entity.slug = customer.slug.value;
  // JSONB column — extract plain object
  entity.defaultAddress =
    (customer.defaultAddress?.toJSON() as unknown as Record<string, unknown>) ?? null;
  return entity;
}
```

### VO getter reference

| VO | How to extract primitive |
|---|---|
| `Email` | `.address` |
| `PhoneNumber`, `Slug`, `HexColor`, `Timezone`, `TimeOfDay`, `CalendarDate`, `CountryCode`, `SeoTitle`, `SeoDescription` | `.value` |
| `Address` | `.toJSON()` (for JSONB) |
| `Money` | `.amount` (a `Decimal`, not a JavaScript `number`) and `.currency` (a string) |

---

## In-memory repo comparisons

In-memory repos must extract the primitive before comparing:

```typescript
// ✅ correct
if (tenant.slug.value === slug) { … }
if (customer.email.address === email) { … }

// ❌ wrong — comparing VO object reference
if (tenant.slug === slug) { … }
```
