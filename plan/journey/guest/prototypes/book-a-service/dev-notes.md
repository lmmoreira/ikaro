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
| `03d-personal-info-with-intake.html` | 3 of 5 | Intake-path copy of `03` (service with an intake schema) | — | M23-S11a; Próximo → `13` |
| `13b-intake-answers-error.html` | 4 of 5 | Required answer / consent missing; alt A1 notice | `intake-error-summary` | M23-S11a |
| `04e-confirmation-with-intake.html` | 5 of 5 | Intake-path copy of `04` | — | M23-S11a; Voltar → `13` |

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

## M23 Cluster 3 extension (UC-061–068; backend/BFF shipped in M23-S01–S03 and M23-S29; frontend = M23-S11a ✅ built, M23-S11b ❓ GAP, not yet built)

> Everything above this line is shipped (`M12-S07`). Below: the screens tagged **M23-S11a** are built (✅); the screens tagged **M23-S11b** are still unimplemented (❓ GAP). Backend/BFF: `M23-S01`–`S03` (shipped) and `M23-S29` (public resource options, duration quote, requirement-aware availability, whitelisted public service shape). Frontend: **`M23-S11a`** (groups A, B, E — step engine, intake, service cards, resource picker, success box) and **`M23-S11b`** (groups C, D — bundle/journey and variable duration). See `docs/02-DOMAIN_MODEL.md` § `Service`/`Resource`, `docs/13-DATABASE_SCHEMA.md`, `docs/14-API_CONTRACTS.md` § Booking Requests.

### Design decisions (settled in the 2026-10-03 prototype review)

1. **One resource-picker step component for every resource type and service type, shown once per unit of the booking.** `ResourcePicker` is built from `GET /public/services/:id/resource-options` → `requirements[]` (grouped by `legIndex`). A **flat service (or bundle) is one unit**: one "Escolha" step with one section per `CUSTOMER_CHOICE` requirement — staff, room and/or equipment, any combination (`05`, `05f`). A **legged service has one unit per leg**: each leg that has a `CUSTOMER_CHOICE` requirement gets its **own full picker step**, headed with the leg name ("Etapa 2 de 3 — Massagem", `05g`/`05h`), so a 3-leg journey can show the step up to three times; a leg with only automatic resources (Sauna) has no step. **A unit with nothing to choose has no step at all**, whatever its type (`AUTO_ANY`, `AUTO_FUNGIBLE_POOL`, `NONE`). All picker steps come **before** availability (the slot search needs every pick pinned); going back keeps earlier picks and one leg's pick never invalidates another's. A room or equipment picker is the same screen with another heading. **An empty options list never reaches the picker:** a service whose `CUSTOMER_CHOICE` requirement has no active resource cannot be booked, so Step 1 shows an inline "serviço indisponível" message and stays put (`01g`, fails closed) — there is no empty-picker screen.
2. **Automatic resources have no screen and no note.** `AUTO_ANY` staff, `AUTO_FUNGIBLE_POOL` units and an automatic room/equipment never produce a section; when the options response has no `CUSTOMER_CHOICE` requirement the step is **omitted** from the step list and the customer goes from Serviços straight to the next step. The assigned name is shown only **after** booking, on the success box (`04d`); a pool shows no unit name at all (`04d`). `06-auto-staff`, `07-fungible-resource` and `09-bundle-booking` were **deleted** (the old "three stations" copy claimed pool data the API never sends).
3. **A pool with `requiredQuantity > 1` needs nothing** (no screen, no hint). **Two same-type picks in one bundle** are two sections; the leg or requirement position in the heading tells them apart. **Duplicate service lines cannot happen** (Step 1 is a toggle set) — `resourceSelections` follow the `serviceIds` order.
4. **Variable duration is a duration choice only (`12`).** Date and time come from the existing availability step (`02`, unchanged UI), re-fetched with `durationMinutes`. No free date/time input, no client-side midnight logic (the API's slot list is authoritative), "Total" from `/quote` with loading (`12d`) and error (`12c`) states; `BOOKING_DURATION_OUT_OF_RANGE` → `12b`.
5. **The legs review (`10`) is the final Confirmation step of a legged service**, not an extra step; a taken slot, a bundle race and a leg race return to the **availability step** with only the slot cleared (`02e`, `09b`, `10b`).
6. **Customer rescheduling is a separate story and prototype** (see `plan/journey/customer/minha-conta.md` § Reagendar) — it is no longer part of the booking flow.
7. **Attendees are optional with no UI minimum** (the backend never requires one) — confirmed at `/story-discovery M23-S11a`.

**Screens:**

| File | Screen | UC | Story |
|---|---|---|---|
| `01c-servico-por-tempo.html` | Step 1 — per-time service card (rate, duration range) and "a partir de" total | UC-067 | M23-S11a |
| `01d-erro-varios-servicos-variaveis.html` | Step 1 — inline `BOOKING_INVALID_MULTIPLE_VARIABLE_SERVICES` | UC-067 A4 / UC-068 A4 | M23-S11a |
| `01e-carregando-formulario.html` | Step 1 — "Próximo" while the intake schemas load | UC-068 | M23-S11a |
| `01f-erro-formulario.html` | Step 1 — schema fetch failed (fails closed, retry) | UC-068 | M23-S11a |
| `01g-servico-indisponivel.html` | Step 1 — a `CUSTOMER_CHOICE` requirement has no options: inline message on the service, flow stays on Step 1 | UC-061 | M23-S11a |
| `05-staff-picker.html` | Resource picker (one section per `CUSTOMER_CHOICE` requirement) | UC-061 (UC-066: the picked staff's slots follow) | M23-S11a |
| `05b`…`05e` | Picker states: nothing picked · loading · fetch error · 422 selection invalid | UC-061 | M23-S11a |
| `05f-picker-varias-secoes.html` | Picker for a flat service with three choices (staff + room + equipment); fewer sections when some are automatic | UC-061 / UC-064 | M23-S11a |
| `05g-picker-etapa-massagem.html` / `05h-picker-etapa-relaxamento.html` | Legged journey: one picker step per leg that has a choice (leg 2 asks for staff + room, leg 3 for equipment; leg 1 has none and no step) | UC-065 | M23-S11a |
| `13-intake-answers.html` / `13b` / `13c` | Intake step · client field errors · server-only rejection (summary banner) | UC-068 | M23-S11a |
| `04d-success.html` | Success box = a summary of the booking; the resource line varies (none · chosen staff · auto-assigned staff), shown in a prototype-only "Variantes" panel | UC-061 / UC-062 / UC-063 / all | M23-S11a |
| `09b-bundle-booking-erro.html` | Availability step — `BOOKING_BUNDLE_PARTIALLY_UNAVAILABLE` | UC-064 A2 | M23-S11b |
| `10-multi-leg-itinerary.html` / `10b` | Journey confirmation (leg timeline) · availability step — `BOOKING_LEG_UNAVAILABLE` | UC-065 / UC-065 A1 | M23-S11b |
| `12-reserva-por-tempo.html` / `12b` / `12c` / `12d` | Duration + quote · `OUT_OF_RANGE` · quote error · quote loading | UC-067 | M23-S11b |
| `04f-success-details-resources.html` | Success box with the leg timeline — every leg's assigned resources named (the response `itinerary` lists them all, automatic ones included) | UC-065 | M23-S11b |
| `03e-resumo-cesta-combinada.html` | Summary card ("Revisar pedido") of a combined basket — fixed + journey + variable duration, one total | UC-061–068 | M23-S11b |
| `04g-confirmacao-cesta-fixo-jornada.html` | Confirmation of fixed + journey: ordinary row + the leg timeline inside the journey row, one total | UC-065 | M23-S11b |
| `10c-jornada-com-tempo-variavel.html` | Journey review in a basket that also holds a variable-duration line (chosen duration + quote on its row) | UC-065 / UC-067 | M23-S11b |
| `04h-sucesso-cesta-combinada.html` | Success box of the combined basket — every line, assigned resources named from the response (pools never) | UC-065 / UC-067 | M23-S11b |
| `04i-confirmacao-pacote-na-cesta.html` | Confirmation of a bundle (staff pick + automatic room) next to a fixed service — only the pick is named | UC-064 | M23-S11b |
| `15-login-required.html` | A **class-waitlist** login screen (Pilates, "fila de espera") — an M24 screen, **out of M23-S11a/S11b's scope**; it is not the appointment availability-alert entry (see the IA gap below) | M24 | — |

**Removed:** `06-auto-staff`, `07-fungible-resource`, `09-bundle-booking` (2026-10-03, decisions 1–2); `11-appointment-availability` (2026-10-03 — it redrew the date/time step in a different format; the existing `02-calendar-slot` day-pill carousel + slot buttons stays the single availability step for every flow, extended only by optional `resourceSelections`/`durationMinutes` props — documented in `02`'s header comment); `16-service-type-selector` (2026-10-02, Step 1's list already is the catalogue; class entry is `M24-S20`); `08-staff-calendar` (a public staff-profile page needing data that does not exist; UC-066 is served by the picker flow); `14-pending-approval` (replaced by the booking-details box).

**File map (S11a built ✅; S11b ❓ not yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/model/booking-steps.ts` — `resolveBookingSteps()`, `resolveBookingSubmitErrorRoute()`, `resolveErrorStep()` (moved from `useBookingSubmission.ts`); `resource-picks.ts`, `intake-answers.ts`, `booking-payload.ts`, `selection-totals.ts` beside it | ✅ Built (S11a) |
| `apps/web/features/booking/hooks/useBookingFlow.ts` (symbolic step ids + per-step errors), `useBookingFormData.ts` (intake schemas + resource options, fetched once per selection), `useBookingSelections.ts`, `useBookingFormController.ts` | ✅ Built (S11a) |
| `apps/web/features/booking/components/public/ResourcePicker.tsx` + `ResourcePickerStep.tsx` (`05`…`05h`) | ✅ Built (S11a) |
| `apps/web/features/booking/components/public/IntakeAnswersStep.tsx` + `IntakeQuestionField.tsx` + `IntakeAttendeesList.tsx` (`13`/`13b`/`13c`) | ✅ Built (S11a) |
| `apps/web/features/booking/components/public/ServiceCard.tsx` (`01c`/`01g`) | ✅ Built (S11a) |
| `apps/web/features/booking/components/public/BookingSubmittedDetails.tsx` (`04d`; `04f` is S11b) | ✅ Built (S11a) |
| `apps/web/features/booking/components/public/LegItineraryStep.tsx` (`10`) | ❓ Gap (S11b) |
| `apps/web/features/booking/components/public/VariableDurationStep.tsx` (`12`…`12d`) | ❓ Gap (S11b) |

**BFF calls (new/extended — see `docs/14-API_CONTRACTS.md` and `plan/M23-…md` § M23-S29):**
```
GET  /public/services/:id/resource-options                  -- feeds ResourcePicker (CUSTOMER_CHOICE options, names only)  [M23-S29]
GET  /public/services/:id/quote?durationMinutes=            -- "Total" on the variable-duration step               [M23-S29]
GET  /public/services/:id/intake-schema                     -- feeds IntakeAnswersStep (active version only, no auth); backend path is /services/:id/intake-schema/public
GET  /schedule/availability(/summary)?serviceIds=&resourceSelections=&durationMinutes=   -- requirement-aware availability  [M23-S29]
POST /bookings, POST /bookings/authenticated               -- body gains resourceSelections, durationMinutes,
                                                              participantCount, intakeSchemaVersion/intakeAnswers/consentAccepted, attendees
```
Per-leg picks go in `resourceSelections[].legIndex` (there is no `legSelections` field); the start is `scheduledAt` (there is no `startsAt`); the explicit `resourceId` availability param is a single-resource view and is not used by this flow.

**Error routing — every `BOOKING_*` code the flow can receive, and the screen it lands on** (static catalogue copy from `packages/i18n/locales/*/errors.json` is the headline; the second line on a screen is screen copy and needs its own `web.json` key):

| Code | Lands on | Screen | Keeps | Clears |
|---|---|---|---|---|
| `BOOKING_SLOT_UNAVAILABLE` | availability | `02e` | everything | slot |
| `BOOKING_BUNDLE_PARTIALLY_UNAVAILABLE` | availability | `09b` | services, picks, duration | slot |
| `BOOKING_LEG_UNAVAILABLE` | availability | `10b` | services, picks, duration | slot |
| `BOOKING_DURATION_OUT_OF_RANGE` (`field = durationMinutes`) | duration step | `12b` | services, picks | duration |
| `BOOKING_RESOURCE_SELECTION_REQUIRED`, `BOOKING_SERVICE_RESOURCE_TYPE_UNAVAILABLE` | resource picker — the first picker step whose pick is missing/invalid after the options are re-fetched (the error names no leg) | `05e` | services, other picks | invalid pick |
| `BOOKING_INTAKE_ANSWER_MISSING` | intake step | `13c` (summary only — no field names) | all answers | — |
| `BOOKING_INVALID_MULTIPLE_VARIABLE_SERVICES` | Step 1 | `01d` | selection | — |
| `BOOKING_SERVICE_NOT_ACTIVE` (verify the wire name in `error-codes.ts`) | Step 1 | `01d`-style inline error | rest of selection | — |
| `field = pickupAddress` / `contactAddress` | their steps | existing `01b` / `03b` | — | — |
| `401` (authenticated path) | hotsite login | existing handling | — | — |
| anything else | Confirmation, generic message | `04c` | — | — |

### UX rules (docs audit, 2026-10-03) — apply to every new screen in this set

1. **No option is pre-selected** in a picker — the initial state is `05b` (nothing picked, Próximo disabled until every section has an explicit pick); `05`, `05f`, `05g` and `05h` illustrate states *after* the customer has picked.
2. Each picker section is a **radio group in a `fieldset` with a `legend`** (the resource-type label) so screen readers announce the group.
3. On any **error return to a step** (picker, duration, intake, availability, Step 1) keyboard **focus moves to the error alert** (`role="alert"`) — the intake step already specified it; the rest now follow it.
4. The per-leg picker heading is the **leg name with a small subtitle** "Etapa N de M da jornada"; the page's "Passo N de M" indicator stays the only step counter.
5. The variable-duration total reads **"Total"** (the quote is exactly what booking creation persists); "a partir de…" appears only before a duration is chosen.
6. **Contrast:** error text on a red tint uses `#b91c1c` (5.9:1) — not `#dc2626` (4.41:1); hint text never goes below `opacity: .6` (`.5` is 3.4:1). The shipped legacy screens (`02`, `02e`, customer `02`) still use the old values and are not changed here; fix when those components are next touched.

### IA gap — availability-alert entry in the booking flow (unowned)

UC-072's trigger ("Customer sees no suitable availability") has no screen in the public booking flow: `02d-fully-booked` shows only "Entre em contato conosco para agendar", there is no "Avise-me quando abrir" action, and no login redirect that preserves the chosen criteria for **appointments** (`15-login-required` is a class-waitlist screen). It needs its own prototype pass and story (depends on `M23-S06`, `M23-S11a`); `M23-S12` is the Minha Conta management surface (`07-availability-alert`) only.

**Open questions / gaps:**
- [ ] Stories: `M23-S11a` then `M23-S11b` (`/story-discovery` each) — `plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md`. S11a must land first (the step engine S11b plugs into).
- [x] Decisions 1–7 above (resolves the former open items: per-leg picker, non-staff pickers, pool quantity, midnight, same-type picks, duplicate lines, reschedule preview).
- [x] `16-service-type-selector.html`, `08-staff-calendar.html`, `14-pending-approval.html`, `06`, `07`, `09` removed — see above.

### Intake step placement (decided before M23-S11a story-discovery)

Intake is **its own step**, not merged into the final summary: Services → Availability → Personal Info (Step 3) → **Intake (`IntakeAnswersStep`)** → Confirmation (the existing final summary + submit).

- Rendered only when the selected service has an active `service_booking_intake_schema`; otherwise Step 3 goes straight to Confirmation and the flow stays 4 steps. With intake the indicator reads "Passo N de 5" and Confirmation becomes "Passo 5 de 5".
- Schema-driven, never hardcoded: one control per `questions[]` entry (`FREE_TEXT` -> text input; `BOOLEAN` -> checkbox when optional, Sim/Não radio pair when required; `required` flag), "Quantidade de participantes" only when `participantCountRequired`, "Participantes nomeados" (repeatable `{ name, isMinor }` rows) only when `requiresNamedAttendees`, consent checkbox (`consentText`) always required.
- The displayed `version` is kept in form state and submitted as `intakeSchemaVersion`; answers are validated against that version, never silently re-validated against a newer one (UC-068 A1).
- The step does **not** submit. `POST /bookings` (guest) / `POST /bookings/authenticated` (customer) stays on Confirmation, which carries `intakeSchemaVersion`/`intakeAnswers`/`consentAccepted`/`attendees`/`participantCount` in the payload.
- Error handling: field-level errors come from client validation of the displayed schema (`13b-intake-answers-error.html` shows them plus the summary banner); the backend `422 BOOKING_INTAKE_ANSWER_MISSING` names the missing fields only in its `detail` text, which is never rendered, so a server-side rejection shows the summary banner only. Error text on `--ba-secondary` must use `#b91c1c`, not `#dc2626` (see § Accessibility / color contrast above).
- Personal Info stays before it: contact data (name, phone, email, address, photos) is not part of the intake schema.
- The authenticated customer path reuses the same step before its review-confirm step (see `customer/prototypes/book-a-service/`).

**Validation (client-side, `IntakeAnswersStep`; the backend re-validates and returns `422 BOOKING_INTAKE_ANSWER_MISSING`, whose missing field names are only in `detail` and never rendered — the field-level errors in this table are client-side):**

| Field | Source in the schema | Control | Rule | Error message | `data-testid` |
|---|---|---|---|---|---|
| each question, `type = FREE_TEXT` | `questions[]` | text input / textarea | required only when `required = true`; whitespace-only counts as missing | `"Este campo é obrigatório."` | `intake-field-error-<fieldKey>` |
| each question, `type = BOOLEAN`, optional | `questions[]` | single checkbox | none (unchecked = `false` or omitted) | — | — |
| each question, `type = BOOLEAN`, `required = true` | `questions[]` | **Sim / Não radio pair** | an explicit answer is required; `false` ("Não") is valid — the backend checks the key is present, not that it is `true` | `"Este campo é obrigatório."` | `intake-field-error-<fieldKey>` |
| `participantCount` | shown only if `participantCountRequired` | number input | integer > 0 (BFF `z.number().int().positive()`) | `"Informe a quantidade de participantes."` | `intake-field-error-participants` |
| `attendees[]` | shown only if `requiresNamedAttendees` | repeatable rows: name input + "Menor de idade" checkbox + Remover; "Adicionar participante" | each row `{ name: 1–255 chars trimmed, isMinor?: boolean (default false) }`; **no minimum count** — the backend never requires ≥ 1 attendee nor ties the count to `participantCount` (decided: no minimum is enforced in the UI) | row name blank → `"Informe o nome do participante."` (client-only) | `intake-field-error-attendees` |
| `consentAccepted` | `consentText` (always shown) | checkbox, label = `consentText` | must be `true` | `"Você precisa aceitar os termos para continuar."` | `intake-consent-error` |

Summary banner on any failure: `data-testid="intake-error-summary"`, `role="alert"`. The step holds no async state — it never submits, so there is no loading/success state of its own (the POST and its states stay on Confirmation).

**Step paths — the real indicator is computed ("Passo N de M", M from `resolveBookingSteps()`); each prototype screen shows the value of the path it illustrates and then re-joins the existing screens:**

| Path | Steps | Illustrated by |
|---|---|---|
| Default (4) | Serviços · Data e horário · Seus dados · Confirmar | `01` → `02` → `03` → `04` (→ `04b`/`04c`/`04d`) |
| + intake (5) | … · Dados do serviço (after Seus dados) | `03d` → `13` (`13b`/`13c`) → `04e` |
| + resource choice (5; with intake 6) | Serviços · **Escolha** · Data e horário · Seus dados [· Dados do serviço] · Confirmar | `05`…`05f` → `02` → `09b`/`02e` → `04d` |
| + variable duration (5; with intake 6) | Serviços · **Duração** · Data e horário · … | `12`…`12d` → `02` |
| + resource choice **and** variable duration (6; with intake 7) | Serviços · **Escolha(s)** · **Duração** · Data e horário · … — the order is fixed: every picker step first, then the duration step, then availability (the duration can depend on the chosen resource, and the slot search needs all of them) | `05`…`05f` → `12` → `02` |
| Legged journey (one step per leg that has a choice; the review replaces the final summary) | Serviços · **Escolha leg 2 · Escolha leg 3** · Data e horário · Seus dados · **Confirmar jornada** (6 here) | `05g` → `05h` → `02` → `10`/`10b` → `04f` |

**Combined baskets (decided 2026-10-03, M23-S11b).** Any mix of fixed services, one variable-duration service, a bundle and journeys is a valid basket (only one `CUSTOMER_SELECTED` service per basket). `03e`/`04g`/`10c`/`04h`/`04i` draw the combinations the pure screens (`03`/`04`/`10`/`04d`/`04f`) do not. Rules, shared by the summary card, the Confirmation/journey review and the success box (one shared row-composition helper, so the three can never disagree):
- **One row per line, one total.** Total = fixed prices + the quoted amount of the variable line (the "a partir de" form only before a duration is chosen). Duration = the sum of the line durations; a journey counts its legs **plus the transitions between them** (90 + 15 = 105 min).
- **Back-to-back from the chosen slot, in basket (`serviceIds`) order** — the backend's cursor. A journey that is not the first line starts when the previous lines end, so its leg times are the line start plus offsets, not the slot plus offsets.
- **Per-line time ranges appear only when the basket contains a journey**; a multi-line basket without one keeps today's price-and-duration rows and one start time (`04i`).
- **Names:** before booking only the customer's own picks are named (`04g`/`10c`/`04i`); after booking every assigned resource from the response is named, automatic rooms included, a fungible pool never (`04h`).
- **Step counts** (no intake): fixed + journey = 6 (`04g`); journey + variable duration = 7 (`10c`, `03e`, `04h`); bundle + fixed = 5 (`04i`).
- **Duration preselection:** the duration step opens with `durationMinMinutes` selected and its quote fetched (`12` now shows 1 hora / R$ 50,00).

`03d` and `04e` are exact copies of `03`/`04` apart from the step indicator and the Próximo/Voltar targets. A path with both a choice and a duration adds one step to each count (6 / 7 with intake). The `04b`/`04c`/`04d` states are shared by every path and are not duplicated.
