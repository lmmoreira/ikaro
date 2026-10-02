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
| `03d-personal-info-with-intake.html` | 3 of 5 | Intake-path copy of `03` (service with an intake schema) | — | M23-S11; Próximo → `13` |
| `13b-intake-answers-error.html` | 4 of 5 | Required answer / consent missing; alt A1 notice | `intake-error-summary` | M23-S11 |
| `04e-confirmation-with-intake.html` | 5 of 5 | Intake-path copy of `04` | — | M23-S11; Voltar → `13` |

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

## ❓ GAP — M23 Cluster 3 extension (UC-061–068; backend/BFF shipped in M23-S01–S03, frontend = M23-S11, not yet built)

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
| `13-intake-answers.html` / `13b-intake-answers-error.html` | Intake step — its own step after Personal Info, before Confirmation (versioned schema questions + consent; no submit) + missing-field error | UC-068 |
| `14-pending-approval.html` | Manual-approval hold display (30-min countdown example) | Booking policy (UC-055) |
| `15-login-required.html` | Auth boundary before a waitlist/alert action — **out of M23-S11's scope** (belongs with the availability-alert stories, M23-S12/S17) | UC-072 A1 |

**File map (❓ none exist yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/components/public/ResourcePicker.tsx` (staff/pool/bundle selection) | ❓ Gap |
| `apps/web/features/booking/components/public/AutoAssignedStaffSlotPicker.tsx` | ❓ Gap |
| `apps/web/features/booking/components/public/FungibleResourceSlotPicker.tsx` | ❓ Gap |
| `apps/web/features/booking/components/public/MultiLegItineraryReview.tsx` | ❓ Gap |
| `apps/web/features/booking/components/public/VariableDurationReservationStep.tsx` | ❓ Gap |
| `apps/web/features/booking/components/public/IntakeAnswersStep.tsx` | ❓ Gap |
| `apps/web/features/booking/components/public/ManualApprovalHoldState.tsx` | ❓ Gap |

**BFF calls (new/extended — see `docs/14-API_CONTRACTS.md`):**
```
GET  /resources/:id/availability                          -- UC-066
GET  /schedule/availability?serviceId=&resourceId=         -- extended (UC-058), resource-scoped
POST /bookings                                              -- extended body: resourceSelections, legSelections,
                                                                startsAt/durationMinutes (variable-duration),
                                                                intakeSchemaVersion/intakeAnswers, attendees
GET  /services/:id/intake-schema/public                     -- feeds IntakeAnswersStep (active version only, no auth)
```

**Removed (2026-10-02):** `16-service-type-selector.html` — today's Step 1 service list already is the catalogue and a class is just another service (M24), so no separate selector is built. Step 1's cards adapt to the service type instead (e.g. "por hora" for a per-time service). `15-login-required.html` still links to the Cluster 4 class agenda (`public-02b-class-agenda.html`, not yet promoted) — left as a documented gap, out of M23-S11's scope.

**Open questions / gaps:**
- [ ] Story: `M23-S11` (depends on `M23-S29`, the backend/BFF prerequisites) (`plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md`) — run `/story-discovery M23-S11` before implementing.
- [x] `16-service-type-selector.html` removed — the existing `ServiceSelectionStep` gains type-aware cards and a resource-type branch instead of being replaced.

### Intake step placement (decided before M23-S11 story-discovery)

Intake is **its own step**, not merged into the final summary: Services → Availability → Personal Info (Step 3) → **Intake (`IntakeAnswersStep`)** → Confirmation (the existing final summary + submit).

- Rendered only when the selected service has an active `service_booking_intake_schema`; otherwise Step 3 goes straight to Confirmation and the flow stays 4 steps. With intake the indicator reads "Passo N de 5" and Confirmation becomes "Passo 5 de 5".
- Schema-driven, never hardcoded: one control per `questions[]` entry (`FREE_TEXT` -> text input; `BOOLEAN` -> checkbox when optional, Sim/Não radio pair when required; `required` flag), "Quantidade de participantes" only when `participantCountRequired`, "Participantes nomeados" (repeatable `{ name, isMinor }` rows) only when `requiresNamedAttendees`, consent checkbox (`consentText`) always required.
- The displayed `version` is kept in form state and submitted as `intakeSchemaVersion`; answers are validated against that version, never silently re-validated against a newer one (UC-068 A1).
- The step does **not** submit. `POST /bookings` (guest) / `POST /bookings/authenticated` (customer) stays on Confirmation, which carries `intakeSchemaVersion`/`intakeAnswers`/`consentAccepted`/`attendees`/`participantCount` in the payload.
- Error handling: the backend `422 intake-answer-missing` names the missing field(s); `13b-intake-answers-error.html` is the client mirror (inline per-field errors + summary). Error text on `--ba-secondary` must use `#b91c1c`, not `#dc2626` (see § Accessibility / color contrast above).
- Personal Info stays before it: contact data (name, phone, email, address, photos) is not part of the intake schema.
- The authenticated customer path reuses the same step before its review-confirm step (see `customer/prototypes/book-a-service/`).

**Validation (client-side, `IntakeAnswersStep`; the backend re-validates and returns `422 intake-answer-missing` naming the missing field(s) — it names question `fieldKey`s, `participantCount` and `consentAccepted`, never attendee problems):**

| Field | Source in the schema | Control | Rule | Error message | `data-testid` |
|---|---|---|---|---|---|
| each question, `type = FREE_TEXT` | `questions[]` | text input / textarea | required only when `required = true`; whitespace-only counts as missing | `"Este campo é obrigatório."` | `intake-field-error-<fieldKey>` |
| each question, `type = BOOLEAN`, optional | `questions[]` | single checkbox | none (unchecked = `false` or omitted) | — | — |
| each question, `type = BOOLEAN`, `required = true` | `questions[]` | **Sim / Não radio pair** | an explicit answer is required; `false` ("Não") is valid — the backend checks the key is present, not that it is `true` | `"Este campo é obrigatório."` | `intake-field-error-<fieldKey>` |
| `participantCount` | shown only if `participantCountRequired` | number input | integer > 0 (BFF `z.number().int().positive()`) | `"Informe a quantidade de participantes."` | `intake-field-error-participants` |
| `attendees[]` | shown only if `requiresNamedAttendees` | repeatable rows: name input + "Menor de idade" checkbox + Remover; "Adicionar participante" | each row `{ name: 1–255 chars trimmed, isMinor?: boolean (default false) }`; **no minimum count** — the backend never requires ≥ 1 attendee nor ties the count to `participantCount` (open decision for story-discovery: enforce a minimum in the UI?) | row name blank → `"Informe o nome do participante."` (client-only) | `intake-field-error-attendees` |
| `consentAccepted` | `consentText` (always shown) | checkbox, label = `consentText` | must be `true` | `"Você precisa aceitar os termos para continuar."` | `intake-consent-error` |

Summary banner on any failure: `data-testid="intake-error-summary"`, `role="alert"`. The step holds no async state — it never submits, so there is no loading/success state of its own (the POST and its states stay on Confirmation).

**Two clickable paths in this prototype set (step numbering):**

| Path | Screens | Indicators |
|---|---|---|
| Default — service **without** an intake schema (4 steps) | `01` → `02` → `03-personal-info` → `04-confirmation` (→ `04b`/`04c`/`04d`) | Passo 1–4 de 4 |
| Service **with** an intake schema (5 steps) | `11`/`12`/`12b` → `03d-personal-info-with-intake` → `13-intake-answers` (`13b` error) → `04e-confirmation-with-intake` | Passo 3 de 5 → 4 de 5 → 5 de 5 |

The `04b`/`04c`/`04d` states (submitting / error / success) are shared by both paths; on the 5-step path only the step number differs ("Passo 5 de 5") — they are not duplicated. `03d` and `04e` are exact copies of `03`/`04` apart from the step indicator and the Próximo/Voltar targets.

