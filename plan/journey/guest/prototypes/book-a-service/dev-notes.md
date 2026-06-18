# Dev Notes — GUEST: Book a Service

> **Status:** All components for this path already exist. Zero new files required. Use this doc as an implementation reference if `BookingForm` needs modification, or as a handoff spec for future refactors.

---

## Overview

The guest booking flow is a 4-step React form orchestrated by `BookingForm`. All step components already exist in `apps/web/components/booking/`. No shadcn/ui is currently used in this path — components use Tailwind + `--ba-*` custom properties directly.

---

## File map

| File | Status | Role |
|---|---|---|
| `apps/web/app/[slug]/booking/page.tsx` | ✅ EXISTS | Server component — fetches services, renders `<BookingForm>` |
| `apps/web/components/booking/BookingForm.tsx` | ✅ EXISTS | Orchestrator — owns all step state, handles submit |
| `apps/web/components/booking/ServiceSelectionStep.tsx` | ✅ EXISTS | Step 1 |
| `apps/web/components/booking/AvailabilityCarousel.tsx` | ✅ EXISTS | Step 2 — month carousel |
| `apps/web/components/booking/SlotPicker.tsx` | ✅ EXISTS | Step 2 — time slots |
| `apps/web/components/booking/PersonalInfoStep.tsx` | ✅ EXISTS | Step 3 |
| `apps/web/components/booking/AddressFields.tsx` | ✅ EXISTS | Used in Steps 1 + 3 |
| `apps/web/components/booking/PhotoUpload.tsx` | ✅ EXISTS | Used in Step 3 |
| `apps/web/components/booking/ConfirmationStep.tsx` | ✅ EXISTS | Step 4 |
| `apps/web/lib/api/bookings.ts` — `createBooking()` | ✅ EXISTS | Calls `POST /bookings` |
| `apps/web/lib/api/schedule.ts` | ✅ EXISTS | Calls `GET /schedule/availability/summary` + `/availability` |

---

## Prototype variants — alternate states

In addition to the 4 happy-path screens (`01`–`04`), this prototype includes clickable
variants for every error/loading/empty/success state referenced in the sections below.
None of these are new routes — each is the same component in a different state.

| Screen | Step | Scenario | `data-testid` | Notes |
|---|---|---|---|---|
| `01b-pickup-address-error.html` | 1 | Pickup address required, fields empty, "Próximo" clicked | `step1-error` | |
| `02b-loading.html` | 2 | `fetchAvailabilitySummary()` pending | — | |
| `02c-availability-error.html` | 2 | `fetchAvailabilitySummary()` rejected | — | No retry button — see Known limitations |
| `02d-fully-booked.html` | 2 | All days `available: false` | — | No explanatory copy — see Known limitations |
| `02e-slot-conflict.html` | 2 | 409 on submit → back to step 2 | `step2-error` | |
| `02f-slot-fetch-error.html` | 2 | `SlotPicker` day fetch rejected | — | Retry button shown is a **proposed fix, not yet built** — see Known limitations |
| `03b-validation-error.html` | 3 | Invalid e-mail, "Próximo" clicked | `personal-info-error` | |
| `03c-photo-states.html` | 3 | Photo items: done / uploading / error | — | Error item has no "Remover" — see Known limitations |
| `04b-submitting.html` | 4 | `status = 'submitting'` | — | |
| `04c-submission-error.html` | 4 | `status = 'error'` (non-409) | `confirmation-error` | |
| `04d-success.html` | 4 | `status = 'success'` | `confirmation-success` | Terminal state |

---

## Step 1 — Service Selection (`ServiceSelectionStep`)

**Data source:** `HotsiteServiceResponse[]` — fetched server-side in `page.tsx` via `lib/api/services.ts`, passed as props. No client-side fetch on step 1.

**State (in `BookingForm`):**
- `selectedServiceIds: string[]`
- `pickupAddress: Address` (from `personalInfo.pickupAddress`)

**Conditional UI:**
- `requiresPickupAddress = services.some(s => selectedServiceIds.includes(s.id) && s.requiresPickupAddress)`
- When `true` → `<AddressFields idPrefix="pickup-address">` appears below card list

**Validation (in `ServiceSelectionStep.handleNext`):**
- `selected.length === 0` → button disabled (no error shown)
- `requiresPickupAddress && !isAddressFilled(pickupAddress)` → `"Informe o endereço de coleta para continuar."` (data-testid: `step1-error`)

**Address ZIP autocomplete:** `lib/address/viacep-address-lookup.adapter.ts` — fetches `https://viacep.com.br/ws/{cep}/json/` and fills street/neighborhood/city/state.

---

## Step 2 — Calendar + Slot (`AvailabilityCarousel` + `SlotPicker`)

**BFF call 1 — carousel month view:**
```
GET /schedule/availability/summary
  ?from=YYYY-MM-DD&to=YYYY-MM-DD&serviceIds=uuid,uuid
  Header: X-Tenant-Slug: {slug}

Response: AvailabilitySummaryResponse
  { dates: { date: string; available: boolean }[] }
```
Fetcher: `lib/api/schedule.ts`

**BFF call 2 — slot picker (triggered when day is clicked):**
```
GET /schedule/availability
  ?date=YYYY-MM-DD&serviceIds=uuid,uuid
  Header: X-Tenant-Slug: {slug}

Response: AvailabilityResponse
  { slots: { startsAt: string; endsAt: string }[] }
```

**State (in `BookingForm`):**
- `selectedDate: string | null`
- `selectedSlot: AvailableSlot | null`
- `step2Error: string | null`

**409 handling:** After `POST /bookings` returns 409 → `setStep(2)` + `setStep2Error('Horário indisponível, escolha outro')` (data-testid: `step2-error`).

**Loading states:** `AvailabilityCarousel` renders skeleton placeholders while fetching (already implemented).

---

## Step 3 — Personal Info (`PersonalInfoStep`)

**Fields and validation (client-side, in `PersonalInfoStep.validate()`):**

| Field | Type | Rule | Error message |
|---|---|---|---|
| `contactName` | `string` | min 1 | `"Informe seu nome."` |
| `contactEmail` | `string` | `z.email()` | `"Informe um e-mail válido."` |
| `contactPhone` | `string` | 10–11 BR digits | `"Informe seu telefone."` |
| `contactAddress` | `Address` | optional (toggle) | — |
| `photoFilePaths` | `string[]` | optional | — |

**Phone formatting:** `formatPhoneBR()` from `lib/utils.ts` — applied on every `onChange`, strips non-numeric, formats `(11) 91234-5678`.

**Optional contact address:** Toggle button (`aria-expanded`) — renders `<AddressFields idPrefix="contact-address" required={false}>`. Sent as `contactAddress` in payload only if `isAddressFilled(contactAddress)` returns true.

**Photo upload flow (`PhotoUpload`):**
1. User selects file
2. `POST /bookings/attachments/signed-url` with `{ fileName, contentType, tenantSlug: slug }`
3. Receive `{ signedUrl: string; key: string }`
4. `PUT` file bytes directly to `signedUrl` (GCS signed URL — CORS pre-configured)
5. Push `key` (e.g. `tenants/{id}/uploads/{bookingId}/photo.jpg`) to `photoFilePaths[]`
6. `photoFilePaths` sent as `beforeServicePhotoUrls` in step 4 payload

---

## Step 4 — Confirmation + Submit (`ConfirmationStep`)

**Submit → `createBooking(slug, payload)` in `lib/api/bookings.ts`:**
```
POST /bookings
  Header: X-Tenant-Slug: {slug}
  Header: Content-Type: application/json

Body (CreateBookingRequest from @ikaro/types):
{
  contactName:             string
  contactEmail:            string
  contactPhone:            string          // 10–11 digits, no formatting
  scheduledAt:             string          // ISO-8601 UTC, e.g. "2026-06-18T13:00:00.000Z"
  serviceIds:              string[]        // uuid[]
  contactAddress?:         Address         // optional
  pickupAddress?:          Address         // optional, only when requiresPickupAddress
  beforeServicePhotoUrls?: string[]        // GCS keys, optional
}
```

**Status transitions (managed in `BookingForm`):**

| Status | Button text | Button state | UI |
|---|---|---|---|
| `'idle'` | "Confirmar agendamento" | enabled | Normal view |
| `'submitting'` | "Enviando..." | disabled | Normal view |
| `'success'` | — | — | Success view replaces step (data-testid: `confirmation-success`) |
| `'error'` | "Confirmar agendamento" | enabled | Error message shown (data-testid: `confirmation-error`) |

**Error messages:**
- `errorMessage = 'Não foi possível enviar sua solicitação. Tente novamente.'` (all non-409 errors)
- 409 → navigate back to step 2, not shown in step 4

---

## Mobile layout

All steps use `max-w-2xl mx-auto px-6` (from `BookingForm` wrapper).

| Step | Mobile-specific behavior |
|---|---|
| Step 1 | Cards stack full-width; address fields single-column |
| Step 2 | Carousel scrolls horizontally; slot pills wrap |
| Step 3 | `grid-cols-1 sm:grid-cols-2` — phone field spans 1 col on mobile |
| Step 4 | Single column; summary list + button stack vertically |

---

## Accessibility notes

- **Inline validation errors** (`step1-error`, `step2-error`, `personal-info-error`, `confirmation-error`) are plain `<p>` elements with no `role="alert"` / `aria-live`. Screen reader users get no announcement when these appear after clicking "Próximo" / "Confirmar agendamento". Add `role="alert"` (or `aria-live="assertive"`) to each.
- **Focus management on validation failure** is unspecified — clicking "Próximo" with invalid input doesn't currently move focus to the error message or the first invalid field, leaving keyboard/screen-reader users on the button with no indication anything happened. Recommend moving focus to the error `<p>` (`tabindex="-1"` + `.focus()`) or the first invalid input.
- **Color contrast — error red `#dc2626`:**
  - On `--ba-background` (`#ffffff`): 4.83:1 — passes WCAG AA (4.5:1) for normal text, fails AAA (7:1).
  - On `--ba-secondary` (`#eff6ff`) — e.g. if an error appears inside a card/section using the secondary background: ~4.44:1 — **fails WCAG AA** for normal-size text by a small margin. Avoid placing `#dc2626` error text directly on `--ba-secondary`; use `--ba-background`, or a darker red such as `#b91c1c` (~5.9:1 on `#eff6ff`).

## Known limitations (flagged, deferred — not addressed in this prototype)

These are real component-behavior gaps found while building this prototype. They are **not fixed here** — flagged for a separate product/engineering decision.

- **`AvailabilityCarousel` has no "fully booked" empty state.** When every day in the 14-day window has `available: false`, the carousel renders 14 disabled pills with no explanatory copy — a guest can't tell "fully booked" from "broken page". Possible fix: a message such as "Nenhum horário disponível nos próximos dias. Entre em contato connosco." when `days.every(d => !d.available)`. See `02d-fully-booked.html`.
- **`AvailabilityCarousel` fetch-error has no retry action.** The error message ends with "Tente novamente" but there is no button — the `useEffect` fetch runs once on mount (deps `[slug, serviceIds]`); only a full page reload re-triggers it. See `02c-availability-error.html`.
- **`02f-slot-fetch-error.html`'s retry button is a proposed fix, not a reflection of current `SlotPicker` code.** The HTML shows a fully-styled "Tentar novamente" button (matching `02c`'s visual pattern), but as of this writing `SlotPicker.tsx` has the same gap as `AvailabilityCarousel`: its day-fetch effect has no `retryCount` state and no retry handler wired up — only a full page reload re-triggers the fetch. The two screens look inconsistent (`02c` undecorated error, `02f` styled retry button) because `02f` is intentionally showing what the fix *should* look like once built, using the same button markup proposed for `02c`. Recommendation: implement the `retryCount`-driven re-fetch in both `AvailabilityCarousel` and `SlotPicker` together, so the two error states stay visually and behaviorally consistent — do not ship `02f`'s button without also fixing `02c`.
- **`PhotoUpload` errored items are a dead end.** An item with `status === 'error'` shows "Erro ao enviar" but only `status === 'done'` items render the "Remover" button — there's no way to retry or remove a failed upload. Low risk for MVP since photos are optional (`beforeServicePhotoUrls?`), but worth fixing before any flow makes photos required. See `03c-photo-states.html`.

## No new files needed

Every component for the guest path already exists. The implementation task for this flow is complete (M12-S07). This prototype is for UX review only.
