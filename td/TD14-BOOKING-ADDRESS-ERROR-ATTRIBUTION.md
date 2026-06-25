# TD14 — Booking form can't tell which address a backend rejection is about

## Status
- **Type**: Technical Debt / UX gap
- **Priority**: Low (the form shows a correct, actionable message today — "check your address" — just not which of the two address fields specifically)
- **Context**: `apps/web/components/booking/BookingForm.tsx`, `apps/backend/src/contexts/booking/infrastructure/http/booking-error.mapper.ts`
- **Created**: 2026-06-25 (surfaced during M13-S14 follow-up, fixing the related "generic error message" bug)

---

## Problem

A booking can carry **two** separate addresses: `pickupAddress` (collected in step 1, `ServiceSelectionStep`, only for services with `requiresPickupAddress`) and `contactAddress` (collected in step 3, `PersonalInfoStep`, optional). Both are validated by the same shared `Address.create()` value object, and both failures are mapped by `mapBookingError` into the same flat shape:

```typescript
if (err instanceof AddressValidationError) {
  const body: ProblemDetail = {
    type: 'about:blank',
    title: 'Bad Request',
    status: HttpStatus.BAD_REQUEST,
    detail: err.message, // e.g. "Invalid ZIP Code: 12245-500"
  };
  throw new HttpException(body, HttpStatus.BAD_REQUEST);
}
```

There's no field discriminator anywhere in this response — `BookingForm.tsx`'s `handleSubmit` can detect "this 400 is an address problem" (and does, since the M13-S14 follow-up fix), but cannot tell *which* address, since `pickupAddress` and `contactAddress` live in different steps of the form. Pointing the user at the wrong step, or guessing, would be worse than the current behavior (a single message: "Verifique o endereço informado e tente novamente.").

---

## Fix (if ever needed)

Give `AddressValidationError` an optional `field` discriminator the caller can set when constructing it (e.g. `pickupAddress` vs `contactAddress`), and have `mapBookingError` include it as a single-element `violations` array entry — mirroring the shape Zod-pipe validation already produces, so the frontend's existing violations-based routing (see the `InformationCompletionPrompt`/`BookingForm` anti-pattern entry in `docs/ANTI_PATTERNS.md`) could route to the correct step without any new mechanism.

## Workaround (current behavior, considered acceptable)

`BookingForm.tsx` shows a single address-specific message regardless of which address actually failed. Not pinpointing the field is a real UX gap but not a correctness bug — the user is told accurately that *an* address needs checking.
