# Dev Notes — GUEST: Book a Service

> **Status:** ✅ Done (M12-S07). Updated 2026-07-31 — this file cited pre-domain-slice paths (`apps/web/components/booking/**`, `apps/web/lib/api/**`) which no longer exist, and didn't document 3 real capabilities added since the original build: authenticated-customer auto-detection, a calendar/carousel date-picker toggle, and i18n phone/address props.

---

## Overview

The guest booking flow is a 4-step React form orchestrated by `BookingForm`. All step components live under `apps/web/features/booking/components/public/`. No shadcn/ui is currently used in this path — components use Tailwind + `--ba-*` custom properties directly.

**Also handles the authenticated-customer path** (see `customer/prototypes/book-a-service/`): `BookingForm` calls `getHotsiteCustomerProfile(slug)` on mount; if it resolves, it switches to `createAuthenticatedBooking()` and passes `hideContactFields={true}` + a pre-filled `pickupAddress` to `PersonalInfoStep`. This isn't a separate flow/component — it's the same `BookingForm` reused for both actors.

---

## File map

| File | Status | Role |
|---|---|---|
| `apps/web/app/[slug]/booking/page.tsx` | ✅ EXISTS | Server component — fetches services, renders `<BookingForm>` |
| `apps/web/features/booking/components/public/BookingForm.tsx` | ✅ EXISTS | Orchestrator — owns all step state, handles submit, detects authenticated customers |
| `apps/web/features/booking/components/public/ServiceSelectionStep.tsx` | ✅ EXISTS | Step 1 |
| `apps/web/features/booking/components/public/AvailabilityCarousel.tsx` | ✅ EXISTS | Step 2 — carousel date picker (one of two variants — see below) |
| `apps/web/features/booking/components/public/AvailabilityCalendar.tsx` | ✅ EXISTS | Step 2 — calendar date picker, selected via the tenant's `datePickerType` setting; not shown in this prototype (only the carousel variant is) |
| `apps/web/features/booking/components/public/SlotPicker.tsx` | ✅ EXISTS | Step 2 — time slots |
| `apps/web/features/booking/components/public/PersonalInfoStep.tsx` | ✅ EXISTS | Step 3 — also reused for the authenticated-customer path (`hideContactFields`) |
| `apps/web/features/booking/components/public/AddressFields.tsx` | ✅ EXISTS | Used in Steps 1 + 3; takes an `addressSpec` prop for country-specific field sets |
| `apps/web/features/booking/components/public/PhotoUpload.tsx` | ✅ EXISTS | Used in Step 3 |
| `apps/web/features/booking/components/public/ConfirmationStep.tsx` | ✅ EXISTS | Step 4 |
| `apps/web/features/booking/api/public.ts` — `createBooking()`, `createAuthenticatedBooking()` | ✅ EXISTS | `POST /bookings` / `POST /bookings/authenticated` |
| `apps/web/features/platform/hotsite/api/schedule.ts` | ✅ EXISTS | Calls `GET /schedule/availability/summary` + `/availability` — **note:** `apps/web/features/booking/api/schedule.ts` is a different, real file (staff-facing closure/opening management), not this one — easy to grep the wrong file |
| `apps/web/shared/utils/phone-format.ts` | ✅ EXISTS | Country-specific phone masks (`phonePrefix` prop: `+55`/`+1`), replacing the old guest-only `formatPhoneBR()` |

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
| `04d-success.html` | 4 | `status = 'success'` | `booking-success` | Terminal state |

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

**Phone formatting:** `apps/web/shared/utils/phone-format.ts`, driven by a `phonePrefix` prop (`+55`/`+1`) — the old BR-only `formatPhoneBR()` no longer exists; the field is now i18n-aware per tenant country.

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

**Submit → `createBooking(slug, payload)` in `apps/web/features/booking/api/public.ts`:**
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
| `'success'` | — | — | Success view replaces step (data-testid: `booking-success`) |
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

## Known limitations (all resolved — kept for history)

These were real component-behavior gaps found while building this prototype. All four are now fixed in production; the fixes matched what was proposed below.

- ~~`AvailabilityCarousel` has no "fully booked" empty state.~~ — **Resolved.** Renders `data-testid="fully-booked-message"` with `t('availability.noSlots')` when `days.every(d => !d.available)`. See `02d-fully-booked.html`.
- ~~`AvailabilityCarousel` fetch-error has no retry action.~~ — **Resolved.** Has `retryCount` state + `handleRetry()` wired into `ErrorAlert onRetry`. See `02c-availability-error.html`.
- ~~`SlotPicker` fetch-error has no retry action.~~ — **Resolved.** `SlotPicker.tsx` has the identical `retryCount`/`handleRetry()` pattern. See `02f-slot-fetch-error.html`.
- ~~`PhotoUpload` errored items are a dead end.~~ — **Resolved.** "Remover" now renders for `status === 'done' || status === 'error'`. See `03c-photo-states.html`.

## Accessibility note (also resolved)

The "Inline validation errors are plain `<p>` elements with no `role=\"alert\"`" note above is stale — all of these now render through a shared `ErrorAlert` component whose wrapping `<div>` already has `role="alert"`.

## No new files needed

Every component for the guest path already exists (M12-S07), plus the 3 capabilities added since (auth-detection, calendar variant, i18n props — see Overview). This prototype is for UX review only.

---

## ❓ GAP — M21 Cluster 3 extension (UC-061–068, not yet built)

> Everything above this line is shipped (`M12-S07`). Everything below is new, unimplemented scope promoted from `docs/discovery/multivertical-booking/`. See `docs/02-DOMAIN_MODEL.md` § `Service`/`Resource`, `docs/13-DATABASE_SCHEMA.md`, `docs/14-API_CONTRACTS.md` § Booking Lifecycle for the full contract.

**New prototype screens (relocated from the discovery folder's `public-XX-*.html`):**

| File | Screen | UC |
|---|---|---|
| `05-staff-picker.html` | Choose a specific staff member | UC-061 |
| `06-auto-staff.html` | System-auto-assigned named staff (no picker shown) | UC-063 |
| `07-fungible-resource.html` | Auto-assigned from a fungible pool (no identity shown) | UC-062 |
| `08-staff-calendar.html` | Browse a specific staff member's own calendar | UC-066 |
| `09-bundle-booking.html` / `09b-bundle-booking-erro.html` | Bundled-resource booking + race-condition error | UC-064 |
| `10-multi-leg-itinerary.html` / `10b-multi-leg-itinerary-erro.html` | Multi-leg itinerary + race-condition error | UC-065 |
| `11-appointment-availability.html` | Shared availability step reused by every resource-scoped/bundled/legged flow above | UC-058 (Cluster 2) |
| `12-reserva-por-tempo.html` / `12b-reserva-por-tempo-erro.html` | Variable-duration reservation + unavailable error | UC-067 |
| `13-intake-e-confirmacao.html` / `13b-intake-e-confirmacao-erro.html` | Versioned booking intake + missing-field error | UC-068 |
| `14-pending-approval.html` | Manual-approval hold display (30-min countdown example) | Booking policy (UC-055) |
| `15-login-required.html` | Auth boundary before a waitlist/alert action | UC-072 A1 |
| `16-service-type-selector.html` | Multi-service-type catalogue entry point | Canonical IA entry, dev-notes.md §"Canonical public information architecture" |

**File map (❓ none exist yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/components/guest/StaffPickerStep.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/AutoAssignedStaffSlotPicker.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/FungibleResourceSlotPicker.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/MultiLegItineraryReview.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/VariableDurationReservationStep.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/BookingIntakeStep.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/ManualApprovalHoldState.tsx` | ❓ Gap |

**BFF calls (new/extended — see `docs/14-API_CONTRACTS.md`):**
```
GET  /resources/:id/availability                          -- UC-066
GET  /schedule/availability?serviceId=&resourceId=         -- extended (UC-058), resource-scoped
POST /bookings                                              -- extended body: resourceSelections, legSelections,
                                                                startsAt/durationMinutes (variable-duration),
                                                                intakeSchemaVersion/intakeAnswers, attendees
GET  /services/:id/intake-schema                            -- feeds BookingIntakeStep
```

**Known limitation, found during this promotion:** `16-service-type-selector.html`'s "browse a class" link points at `public-02b-class-agenda.html` (Cluster 4, not yet promoted) — left as a documented gap.

**Open questions / gaps:**
- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] Reconciling `16-service-type-selector.html` with the existing single-service-type `ServiceSelectionStep` (does one replace the other, or does the existing step gain a resource-type branch?) is a UI/routing decision for the implementing story.
