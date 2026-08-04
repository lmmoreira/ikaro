# Value Objects — Agent Reference

**Load when:** working with aggregate fields, repository mappers, JSONB columns, or in-memory repo comparisons.

---

## Catalog (`src/shared/value-objects/`)

| Field | VO Class | File | Rule |
|---|---|---|---|
| Email address | `Email` | `email.vo.ts` | validates format; normalises to lowercase; getter: `.address` |
| Phone number | `PhoneNumber` | `phone-number.vo.ts` | strict E.164 (`+<prefix><digits>`, e.g. `+5511912345678`) via `isValidPhoneNumber` from `@ikaro/validation`; no digit-stripping or normalization — `create()` throws on anything else; getter: `.value` |
| Physical address | `Address` | `address.ts` | structured fields; `create(props, spec: AddressSpec)` validates against a country-specific spec (postal regex, state pattern, neighborhood requirement) — takes a mandatory `spec` param, not a fixed Brazilian-CEP-length check; `reconstitute()` skips validation |
| Money amount | `Money` | `money.ts` | currency code + decimal precision — never a plain `number`; fully implemented, used across aggregates/use cases/repositories |
| Hex colour | `HexColor` | `hex-color.vo.ts` | must match `#RRGGBB`; normalises to uppercase; getter: `.value` |
| IANA timezone | `Timezone` | `timezone.vo.ts` | validates against `Intl.supportedValuesOf('timeZone')`; getter: `.value` |
| HH:MM time | `TimeOfDay` | `time-of-day.vo.ts` | validates HH:MM string; `isBefore()` comparison; getter: `.value` |
| URL-safe slug | `Slug` | `slug.vo.ts` | `/^[a-z0-9-]+$/`; used for tenant slugs; getter: `.value` |

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
| `PhoneNumber`, `Slug`, `HexColor`, `Timezone`, `TimeOfDay` | `.value` |
| `Address` | `.toJSON()` (for JSONB) |

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
