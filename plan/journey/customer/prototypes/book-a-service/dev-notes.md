# Dev Notes — CUSTOMER: Book a Service

> **Status:** ✅ Done. Updated 2026-07-31 — this file previously described a design (dedicated login screens, a `BookingForm` `mode` prop, a new `AuthenticatedBookingReviewStep` component) that was never built. The real implementation is simpler: one shared `BookingForm` auto-detects an authenticated customer and reuses the existing guest step components with different props.

---

## Overview

The authenticated customer path shares all of its steps with the guest path (4 by default; the real indicator is computed — M23-S11a adds an intake step, resource/duration steps and the booking-details success box) — there is no separate component or route branch. `BookingForm` calls `getHotsiteCustomerProfile(slug)` on mount; if it resolves, the form treats the visitor as an authenticated customer for the rest of the flow (step 3 hides contact fields and pre-fills the pickup address; submit calls a different endpoint).

---

## File map (all ✅ shipped)

| File | Notes |
|---|---|
| `apps/web/app/[slug]/login/page.tsx` | Real login route — tenant-scoped, not a generic `/auth/login` |
| `apps/web/features/booking/components/public/BookingForm.tsx` | Auto-detects auth via `getHotsiteCustomerProfile(slug)` — no `mode` prop |
| `apps/web/features/booking/api/public.ts` | `createAuthenticatedBooking()`, `createBooking()` |
| `apps/web/features/booking/components/public/PersonalInfoStep.tsx` | Reused for step 3 in both paths, via `hideContactFields` prop |
| `apps/web/features/booking/components/public/{ServiceSelectionStep,AvailabilityCarousel,SlotPicker,ConfirmationStep,PhotoUpload,AddressFields}.tsx` | Shared with the guest flow (M23-S11a extends `ServiceSelectionStep`, the availability components and `ConfirmationStep` for both actors) |

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

**File:** `apps/web/features/booking/api/public.ts` (shipped; uses `bffClient`, not a raw `fetch`)

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
      // M23: resourceSelections?, durationMinutes?, participantCount?, intakeSchemaVersion?,
      //      intakeAnswers?, consentAccepted?, attendees?  (identical to the guest endpoint)
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

New files require Vitest unit tests (`*.spec.tsx` alongside each new component); `apps/web` has no integration-test tier (the BFF `POST /bookings/authenticated` is covered in the BFF/backend suites and by Playwright). Reused components (`ServiceSelectionStep`, etc.) do not need new tests.

`PersonalInfoStep` (authenticated branch) key test cases:
- `hideContactFields={true}` → no name/email/phone fields rendered
- `requiresPickupAddress: true` → `AddressFields` rendered, pre-filled from `pickupAddress`
- `requiresPickupAddress: false` → no address fields
- PhotoUpload present regardless of `requiresPickupAddress`

---

## ✅ Intake step (M23-S11a, UC-068; backend/BFF shipped in M23-S02, frontend built by M23-S11a)

For a service with an active `service_booking_intake_schema`, the authenticated-customer flow gains one step between Review (Step 3) and Confirmation: Services → Calendar → Review → **Intake (`IntakeAnswersStep`)** → Confirm ("Passo N de 5"). Services without a schema skip it and the flow stays 4 steps.

- Prototype: `03b-intake-answers.html` + `03c-intake-answers-error.html` (client field errors) + `03e-intake-answers-erro-servidor.html` (server rejection, summary only) — the same component and behavior as the guest path; full spec (schema-driven rendering, version kept as `intakeSchemaVersion`, no submit on this step, `#b91c1c` error text, `422 intake-answer-missing`) lives in `plan/journey/guest/prototypes/book-a-service/dev-notes.md` § Intake step placement.
- Customer-specific: the final `POST /bookings/authenticated` on Confirmation carries `intakeSchemaVersion`/`intakeAnswers`/`consentAccepted`/`attendees`/`participantCount` (identical shape to the guest endpoint, `docs/14-API_CONTRACTS.md`).
- Files: `apps/web/features/booking/components/public/IntakeAnswersStep.tsx` (+ `IntakeQuestionField.tsx`, `IntakeAttendeesList.tsx`) — one component for both actors, not duplicated.

**Validation (client-side, `IntakeAnswersStep`; the backend re-validates and returns `422 BOOKING_INTAKE_ANSWER_MISSING`, whose missing field names are only in `detail` and never rendered — field-level errors here are client-side only; a server-only rejection shows the summary banner (`03e`)):**

| Field | Source in the schema | Control | Rule | Error message | `data-testid` |
|---|---|---|---|---|---|
| each question, `type = FREE_TEXT` | `questions[]` | text input / textarea | required only when `required = true`; whitespace-only counts as missing | `"Este campo é obrigatório."` | `intake-field-error-<fieldKey>` |
| each question, `type = BOOLEAN`, optional | `questions[]` | single checkbox | none (unchecked = `false` or omitted) | — | — |
| each question, `type = BOOLEAN`, `required = true` | `questions[]` | **Sim / Não radio pair** | an explicit answer is required; `false` ("Não") is valid — the backend checks the key is present, not that it is `true` | `"Este campo é obrigatório."` | `intake-field-error-<fieldKey>` |
| `participantCount` | shown only if `participantCountRequired` | number input | integer > 0 (BFF `z.number().int().positive()`) | `"Informe a quantidade de participantes."` | `intake-field-error-participants` |
| `attendees[]` | shown only if `requiresNamedAttendees` | repeatable rows: name input + "Menor de idade" checkbox + Remover; "Adicionar participante" | each row `{ name: 1–255 chars trimmed, isMinor?: boolean (default false) }`; **no minimum count** — the backend never requires ≥ 1 attendee nor ties the count to `participantCount` (decided: no minimum is enforced in the UI) | row name blank → `"Informe o nome do participante."` (client-only) | `intake-field-error-attendees` |
| `consentAccepted` | `consentText` (always shown) | checkbox, label = `consentText` | must be `true` | `"Você precisa aceitar os termos para continuar."` | `intake-consent-error` |

Summary banner on any failure: `data-testid="intake-error-summary"`, `role="alert"`. The step holds no async state — it never submits, so there is no loading/success state of its own (the POST and its states stay on Confirmation).

**Two clickable paths in this prototype set (step numbering):**

| Path | Screens | Indicators |
|---|---|---|
| Default — service **without** an intake schema (4 steps) | `01` → `02` → `03-review-confirm` → `04-confirmation` (→ `04b`/`04c`/`04d`) | Passo 1–4 de 4 |
| Service **with** an intake schema (5 steps) | `01` → `02` → `03d-review-confirm-with-intake` → `03b-intake-answers` (`03c` error) → `04e-confirmation-with-intake` | Passo 3 de 5 → 4 de 5 → 5 de 5 |

`04b`/`04c`/`04d` are shared by both paths (only the step number differs on the 5-step path). `03d` and `04e` are copies of `03`/`04` apart from the step indicator and the Próximo/Voltar targets.

---

### M23-S11a (✅ built) / M23-S11b (✅ built) — the other new steps (reuse of the guest screens)

The authenticated-customer flow uses the **same components and the same screens** as the guest flow; the clickable prototype for them lives in `plan/journey/guest/prototypes/book-a-service/` and is not duplicated here. Only the auth bar (avatar → Minha conta / Sair) and Step 3's `hideContactFields` differ, and both are already drawn in this folder (`01`–`04`).

| Customer step | Screens (guest folder) | Customer-specific difference |
|---|---|---|
| Step 1 type-aware cards, schema loading/error, multiple-variable error | `01c`–`01g` | none |
| Resource picker (only when there is a `CUSTOMER_CHOICE` requirement — **automatic resources have no screen**) | `05`–`05h` | none |
| Variable duration · journey confirmation | `12`–`12d` · `10` | none; the journey confirmation submits `POST /bookings/authenticated` |
| Availability step (the existing `02`, unchanged UI) · slot / bundle / leg errors | `02` · `02e`, `09b`, `10b` | none |
| Intake step · errors | `03b`/`03c`/`03e` here (same as `13`/`13b`/`13c`) | none |
| Combined baskets — summary card · confirmation · journey review · success | `03e` · `04g`/`04i` · `10c` · `04h` (guest folder) | none; only the submit endpoint differs |
| Success box | `04d` here (plain, CTA → Agendamentos; the resource-line variants are in the guest `04d`) · `04f` (guest folder) | the primary CTA links to the Agendamentos list |

Error routing, step paths and the design decisions: `plan/journey/guest/prototypes/book-a-service/dev-notes.md` § M23 Cluster 3 extension.

## ❓ GAP — "Avise-me quando abrir": the button and the alert page (M23-S31, UC-072; not built yet)

**The button.** `02-calendar-slot.html` shows it for every alert-eligible service (`bookingPolicy.availabilityAlertEligible`), with or without slots, and not while loading or on fetch-error states. It is one shared pattern (same component, label and look in guest `02`/`02d` and here — one button in the nav row between Voltar and Próximo), specified in the guest folder's `dev-notes.md` § Availability-alert entry § Pattern. An authenticated customer goes straight to the alert page below; a guest passes through login first.

**The alert page is a page of the booking flow** — same shell and tenant branding as the booking steps (`--ba-*`), reachable only while logged in, with no use outside a booking attempt. It is **not** a Minha Conta page. "Meus avisos" (`../minha-conta/07-availability-alert.html`) only lists and cancels.

| File | Screen / state | Story |
|---|---|---|
| `16-novo-aviso.html` | Alert form, prefilled from the button's link (the guest arrives here after `../../../guest/prototypes/book-a-service/17-login-aviso.html`) | M23-S31 |
| `16b-novo-aviso-erro.html` | Validation error (422 `BOOKING_ALERT_CRITERIA_INVALID`) and submit failure | M23-S31 |
| `16c-novo-aviso-salvando.html` | Saving | M23-S31 |
| `16g-novo-aviso-erro-semanal.html` | Validation errors in weekly mode — no weekday chosen, end time not after start (422 `BOOKING_ALERT_CRITERIA_INVALID`) | M23-S31 |
| `16d-novo-aviso-salvo.html` | Aviso criado — confirmation with "Voltar ao site" | M23-S31 |
| `16e-novo-aviso-limite.html` | 10 active alerts reached (409 `BOOKING_ALERT_CAP_REACHED`) — points to Meus avisos | M23-S31 |
| `16f-novo-aviso-servico-indisponivel.html` | Service not alert-eligible (422 `BOOKING_ALERT_INELIGIBLE_SERVICE`, e.g. a stale or hand-typed link) | M23-S31 |

**Route and page:** `/[slug]/booking/availability-alert` (expected; final path at `/story-discovery`), a thin `page.tsx` that requires a logged-in customer (guest → login → back to this URL), with `NewAvailabilityAlertForm` under `apps/web/features/booking/components/public/`.

**Prefill (query parameters on the button's link):** `serviceId` (required — without a valid one the page shows `16f`), `preferredResourceId` (the alert holds **one** preferred resource, so a flow with several picks passes none or the first that applies — decided at `/story-discovery`), `durationMinutes`, `participantCount` (only for group services).

**Fields:** criteria type — one-time range (`acceptableStartAt`/`acceptableEndAt`) or weekly preference (`weekdays`, `localStartTime`/`localEndTime`, tenant timezone, never sent); optional `expiresAt` (default 30 days, at most 365, clamped to the range end).

| Rule | Source | Error |
|---|---|---|
| Range: end after start; weekly: at least one weekday and end time after start time | `docs/14-API_CONTRACTS.md` § Availability Alerts | `422 BOOKING_ALERT_CRITERIA_INVALID` → `16b` |
| Service must be alert-eligible | UC-055 | `422 BOOKING_ALERT_INELIGIBLE_SERVICE` → `16f` |
| At most 10 active alerts per customer | UC-072 A3 | `409 BOOKING_ALERT_CAP_REACHED` → `16e` |

**State machine:** `16` (idle) → `16c` (saving) → `16d` (saved, "Voltar ao site") | `16b` / `16e` / `16f` (errors; `16b` / `16g` keep the form editable — `16b` for the one-time range, `16g` for the weekly preference).

**UI building blocks:** hotsite tree — tenant branding via `--ba-*`, the booking flow's own form styling (as `PersonalInfoStep`); the page is a full-page hotsite component and paints its own `backgroundColor: 'var(--ba-background)'`. Do **not** use dashboard/account patterns here, and do not import shadcn primitives (their colors come from shadcn tokens) unless discovery confirms they can be driven by `--ba-*` (check `calendar`, `time-picker`). Rule: `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` §2, `docs/ENGINEERING_RULES_FRONTEND.md` § Hotsite full-page components.

**BFF call:** `POST /availability-alerts` (customer-only) — body `{ serviceId, preferredResourceId?, criteriaType, acceptableStartAt?, acceptableEndAt?, weekdays?, localStartTime?, localEndTime?, durationMinutes?, participantCount?, expiresAt? }`.
