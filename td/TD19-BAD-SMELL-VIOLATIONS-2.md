# TD19 — Pre-existing Bad-Smell Violations (Round 2)

## Status
- **Type**: Technical Debt / Code Quality
- **Priority**: Low (no functional bug; concern is maintainability and DRY)
- **Contexts affected**: `booking`
- **Discovered**: 2026-07-01 (pre-PR audit on `feat/td17-requestcontext-decoupling`)

---

## Problem

Two categories of pre-existing bad smells were found in the `booking` context during the TD17 pre-PR bad-smell audit. Neither was introduced by TD17 — both existed on `main` before the branch was created.

---

## Findings

### BE-2 — Inline regex patterns duplicating shared Value Object validators (5 occurrences)

The `PhoneNumber` VO defines `E164_PATTERN = /^\+[1-9]\d{6,14}$/` and exposes a static `isValid()` method. The `TimeOfDay` VO defines `HHMM_PATTERN = /^\d{2}:\d{2}$/` and exposes a static `isValid()` method. Three Zod DTO schemas copy these patterns inline instead of delegating to the VO:

| File | Line | Pattern | Should use |
|---|---|---|---|
| `apps/backend/src/contexts/booking/application/dtos/request-booking.dto.ts` | 16 | `/^\+[1-9]\d{6,14}$/` | `PhoneNumber.isValid` |
| `apps/backend/src/contexts/booking/application/dtos/close-schedule.dto.ts` | 9 | `/^\d{2}:\d{2}$/` | `TimeOfDay.isValid` |
| `apps/backend/src/contexts/booking/application/dtos/close-schedule.dto.ts` | 13 | `/^\d{2}:\d{2}$/` | `TimeOfDay.isValid` |
| `apps/backend/src/contexts/booking/application/dtos/open-schedule.dto.ts` | 6 | `/^\d{2}:\d{2}$/` | `TimeOfDay.isValid` |
| `apps/backend/src/contexts/booking/application/dtos/open-schedule.dto.ts` | 7 | `/^\d{2}:\d{2}$/` | `TimeOfDay.isValid` |

**Fix pattern:**
```typescript
// Before
contactPhone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid phone'),

// After
contactPhone: z.string().refine(PhoneNumber.isValid, { message: 'Invalid E.164 phone number' }),
```

```typescript
// Before
startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time'),

// After
startTime: z.string().refine(TimeOfDay.isValid, { message: 'Invalid HH:MM time' }),
```

---

### BE-3 — Module-level `makeXxx()` factory helper in spec file (1 occurrence)

`apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts:38` defines a `makeApprovedBooking()` function that wires `BookingBuilder` + `BookingLineBuilder` into a fixed `APPROVED` state. It is called in 15+ tests across the file.

```typescript
// Current (smell)
function makeApprovedBooking() {
  const line = new BookingLineBuilder()...build();
  return new BookingBuilder()...withStatus('APPROVED').withLines([line]).build();
}
```

**Fix pattern:** Add a named preset to `BookingBuilder`:
```typescript
// In BookingBuilder
static approved(tenantId: string): Booking {
  const line = new BookingLineBuilder().build();
  return new BookingBuilder()
    .withTenantId(tenantId)
    .withStatus('APPROVED')
    .withLines([line])
    .build();
}

// In spec
const booking = BookingBuilder.approved(TENANT_A);
```

---

## Implementation

### Wave 1 — Fix inline regex patterns (3 DTO files, 5 occurrences)

1. Import `PhoneNumber` / `TimeOfDay` VOs in the relevant DTO files
2. Replace `.regex(...)` with `.refine(VO.isValid, { message: '...' })`
3. Verify type-check and unit tests still pass

### Wave 2 — Extract `makeApprovedBooking` to BookingBuilder preset

1. Add `static approved(tenantId: string): Booking` to `BookingBuilder`
2. Replace all `makeApprovedBooking()` calls in `complete-booking.use-case.spec.ts` with `BookingBuilder.approved(TENANT_A)`
3. Remove the local `makeApprovedBooking()` function

---

## Acceptance Criteria

- [ ] `request-booking.dto.ts` uses `PhoneNumber.isValid` refine instead of inline E164 regex
- [ ] `close-schedule.dto.ts` uses `TimeOfDay.isValid` refine for both `startTime` and `endTime`
- [ ] `open-schedule.dto.ts` uses `TimeOfDay.isValid` refine for both `startTime` and `endTime`
- [ ] `BookingBuilder.approved()` static preset exists and is used in `complete-booking.use-case.spec.ts`
- [ ] `makeApprovedBooking()` local helper removed from the spec file
- [ ] All unit tests pass; pre-PR bad-smell-audit reports 0 new issues for these checks
