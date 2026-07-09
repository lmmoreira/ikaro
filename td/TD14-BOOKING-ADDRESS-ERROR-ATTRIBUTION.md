# TD14 — Booking form can't tell which address a backend rejection is about

## Status
- **State**: Superseded by [`td/TD23-EXCEPTION-HANDLING-I18N-PATTERN.md`](./TD23-EXCEPTION-HANDLING-I18N-PATTERN.md)
- **Type**: Technical Debt / UX gap
- **Priority**: Low (the form shows a correct, actionable message today — "check your address" — just not which of the two address fields specifically)
- **Context**: `apps/web/features/booking/components/public/BookingForm.tsx`, `apps/backend/src/contexts/booking/infrastructure/http/booking-error.mapper.ts`
- **Created**: 2026-06-25 (surfaced during M13-S14 follow-up, fixing the related "generic error message" bug)
- **Superseded**: 2026-07-09

---

## Why this was superseded

Investigating this TD's scope surfaced that the same problem — a domain error crossing an HTTP boundary with no stable machine-readable identifier, only a free-text message — exists systemically across every backend context, the BFF, and 40+ frontend error-consumption sites, not just the two address fields on the booking form. Fixing this TD's narrow case in isolation (a one-off `field` discriminator on `AddressValidationError`) would have meant re-deriving the same pattern piecemeal for every other error in the app, and two live production bugs of the exact same shape (raw untranslated backend text rendered directly in `ScheduleRemovalDialog.tsx`/`ScheduleDateTimeRangeSheet.tsx`) were found along the way.

TD23 establishes one canonical `code`/`field`/`violations` contract, backend → BFF → UI, with a full literal inventory of every exception in the codebase and an ordered set of implementation stories. This TD's original fix is now **Story 3** of TD23 (booking context: codes + the `AddressValidationError` field discriminator for `pickupAddress` vs. `contactAddress`), and the second call site this TD had already identified (`InformationCompletionPrompt.tsx`) is covered by the same story via the shared mapper.

No further action needed on this file — implement via TD23 Story 3.

---

## Original problem (preserved for history)

A booking can carry **two** separate addresses: `pickupAddress` (collected in step 1, `ServiceSelectionStep`, only for services with `requiresPickupAddress`) and `contactAddress` (collected in step 3, `PersonalInfoStep`, optional). Both are validated by the same shared `Address.create()` value object, and both failures were mapped by `mapBookingError` into the same flat shape:

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

There was no field discriminator anywhere in this response — `BookingForm.tsx`'s `handleSubmit` could detect "this 400 is an address problem" but not tell *which* address, since `pickupAddress` and `contactAddress` live in different steps of the form. A second call site, `apps/web/features/customer/components/InformationCompletionPrompt.tsx`, shared the exact same gap.

## Original workaround (superseded, no longer the target state)

`BookingForm.tsx` shows a single address-specific message regardless of which address actually failed. Not pinpointing the field was a real UX gap but not a correctness bug — the user was told accurately that *an* address needed checking. TD23 Story 3 replaces this with a `code`+`field`-driven message that routes to the correct step.
