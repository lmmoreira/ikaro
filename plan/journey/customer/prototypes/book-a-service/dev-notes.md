# Dev Notes — CUSTOMER: Book a Service

> **Status:** ✅ Done. Updated 2026-07-31 — this file previously described a design (dedicated login screens, a `BookingForm` `mode` prop, a new `AuthenticatedBookingReviewStep` component) that was never built. The real implementation is simpler: one shared `BookingForm` auto-detects an authenticated customer and reuses the existing guest step components with different props.

---

## Overview

The authenticated customer path shares all 4 steps with the guest path — there is no separate component or route branch. `BookingForm` calls `getHotsiteCustomerProfile(slug)` on mount; if it resolves, the form treats the visitor as an authenticated customer for the rest of the flow (step 3 hides contact fields and pre-fills the pickup address; submit calls a different endpoint).

---

## File map (all ✅ shipped)

| File | Notes |
|---|---|
| `apps/web/app/[slug]/login/page.tsx` | Real login route — tenant-scoped, not a generic `/auth/login` |
| `apps/web/features/booking/components/public/BookingForm.tsx` | Auto-detects auth via `getHotsiteCustomerProfile(slug)` — no `mode` prop |
| `apps/web/features/booking/api/public.ts` | `createAuthenticatedBooking()`, `createBooking()` |
| `apps/web/features/booking/components/public/PersonalInfoStep.tsx` | Reused for step 3 in both paths, via `hideContactFields` prop |
| `apps/web/features/booking/components/public/{ServiceSelectionStep,AvailabilityCarousel,SlotPicker,ConfirmationStep,PhotoUpload,AddressFields}.tsx` | Unchanged, shared with the guest flow |

There is no `/api/auth/callback/google` Next.js route and no `/select-tenant` page — OAuth is handled entirely by the BFF (`GET /v1/auth/google/callback`), and login-time tenant selection was permanently descoped (see `customer/login.md`).

---

## Authenticated-customer detection (real design)

```tsx
// Inside BookingForm, on mount:
const customerProfile = await getHotsiteCustomerProfile(slug); // resolves to null if not authenticated
const isAuthenticatedCustomer = customerProfile !== null;

// Step 3:
<PersonalInfoStep
  hideContactFields={isAuthenticatedCustomer}
  pickupAddress={isAuthenticatedCustomer ? customerProfile.defaultAddress : undefined}
  ...
/>

// Submit:
const submit = isAuthenticatedCustomer
  ? () => createAuthenticatedBooking(buildCustomerPayload(...))
  : () => createBooking(slug, buildGuestPayload(...));
```

No separate review component was built — `PersonalInfoStep` handles both paths via props, and no `GET /customers/me` call is needed since `getHotsiteCustomerProfile` already returns `defaultAddress`.

---

## Screen 4 — Confirmation + Submit (`ConfirmationStep`)

**States:** `idle → submitting → success / error`

| Status | Button text | Button state | UI |
|---|---|---|---|
| `'idle'` | "Confirmar agendamento" | enabled | Normal view |
| `'submitting'` | "Enviando..." | disabled | Normal view — see `04b-submitting.html` |
| `'success'` | — | — | Success view replaces step (data-testid: `booking-success`) — see `04d-success.html` |
| `'error'` | "Confirmar agendamento" | enabled | Error message shown (data-testid: `confirmation-error`) — see `04c-submission-error.html` |

**Error messages:**
- `errorMessage = 'Não foi possível enviar sua solicitação. Tente novamente.'` (all non-409 errors)
- 409 → navigate back to step 2, not shown in step 4

---

## New fetcher — `createAuthenticatedBooking()`

**File:** `apps/web/lib/api/bookings.ts` (add to existing file)

```ts
export async function createAuthenticatedBooking(
  payload: AuthenticatedBookingRequest,
): Promise<BookingResponse> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/bookings/authenticated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // JWT cookie sent automatically by browser (httpOnly, sameSite=lax)
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new CreateBookingError(res.status, 'Failed to create authenticated booking');
  return res.json() as Promise<BookingResponse>;
}
```

**BFF endpoint (EXISTS):**
```
POST /bookings/authenticated
  @Roles('CUSTOMER')  — requires valid JWT cookie
  Body (AuthenticatedBookingBodySchema):
    {
      scheduledAt:             string,     // ISO-8601 UTC
      serviceIds:              string[],   // uuid[]
      pickupAddress?:          Address,
      beforeServicePhotoUrls?: string[],
    }
  201 Created → BookingResponse
  409 Conflict → slot taken
```

---

## Photo upload — authenticated variant

`PhotoUpload` is reused unchanged. The BFF endpoint `POST /bookings/attachments/signed-url` handles both paths:

- **Guest** (no auth): send `{ fileName, contentType, tenantSlug: slug }` in body
- **Customer** (auth): send `{ fileName, contentType }` — BFF reads `tenantId` from JWT (Scenario 1 in `bookings.controller.ts`)

`PhotoUpload` already calls `createAttachmentSignedUrl(slug, ...)` which passes `tenantSlug`. For the customer path, pass the JWT via `credentials: 'include'` instead — or update `PhotoUpload` to accept a `mode` prop. Simpler: pass `tenantSlug` for customer too (BFF accepts it if user is authenticated).

---

## Auth header bar

A small bar showing `"{name} · {email}"` at the top of steps 1–4 for the customer path. Options:
- **Option A:** Rendered by `page.tsx` (reads JWT from cookie), passed as prop to `BookingForm`
- **Option B:** Rendered by a layout wrapper at `app/[slug]/booking/layout.tsx`
- **Recommended:** Option A — keeps the layout simple, `BookingForm` controls its own chrome

---

## Testing notes

New files require Vitest unit tests (`*.spec.tsx` alongside each new component) and at least one integration test for `POST /bookings/authenticated`. Reused components (`ServiceSelectionStep`, etc.) do not need new tests.

`PersonalInfoStep` (authenticated branch) key test cases:
- `hideContactFields={true}` → no name/email/phone fields rendered
- `requiresPickupAddress: true` → `AddressFields` rendered, pre-filled from `pickupAddress`
- `requiresPickupAddress: false` → no address fields
- PhotoUpload present regardless of `requiresPickupAddress`
