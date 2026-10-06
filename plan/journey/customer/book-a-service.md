# CUSTOMER — Book a Service

**Actor(s):** CUSTOMER  
**Goal:** Submit a booking request on a tenant's hotsite as an authenticated customer  
**UCs covered:** UC-021, UC-002, UC-011, UC-061–068 (the multi-vertical steps and the intake step — ✅ built by `M23-S11a` and `M23-S11b` (duration step, journey confirmation, combined baskets); on top of `M23-S29`)  
**Status:** Reviewed

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Start(["Hotsite /{slug}"]) --> LoginCTA(("Click 'Entrar'"))
    LoginCTA --> LoginPage["/{slug}/login<br/>UC-021 — M13-S42"]
    LoginPage --> OAuth(("Google OAuth"))
    OAuth --> Callback["BFF GET /v1/auth/google/callback<br/>Sets httpOnly JWT cookie<br/>(no Next.js route — BFF handles OAuth end to end)"]
    Callback --> Hotsite["/{slug}"]

    Hotsite --> CTA(("Click 'Agendar'"))
    CTA --> S1["/[slug]/booking<br/>Step 1: Select Services"]

    S1 --> Pickup{"requiresPickupAddress?"}
    Pickup -- yes --> PickupField["AddressFields — pickup (pre-filled from defaultAddress)"]
    Pickup -- no --> S2
    PickupField --> S2

    S2["/[slug]/booking<br/>Step 2: Calendar |UC-011|"] --> DayClick(("Click green day"))
    DayClick --> SlotPicker["SlotPicker"]
    SlotPicker --> S3
    S2 -->|"'Avise-me quando abrir' (exactly one alert-eligible service; every state of the step)"| AlertBtn["❓ GAP: alert button on the calendar step<br/>(M23-S31)"]
    AlertBtn --> AlertPage["❓ GAP: alert page, prefilled<br/>(§ Availability alert page below)"]
    AlertPage -->|"saved"| AlertDone["❓ GAP: confirmation + 'Voltar ao site'"]
    class AlertBtn,AlertPage,AlertDone gap

    S3["/[slug]/booking<br/>Step 3: Review — PersonalInfoStep (reused)<br/>hideContactFields=true, detected via getHotsiteCustomerProfile(slug)"] -->|"service has an active intake schema"| Intake["✅ Step 4 — IntakeAnswersStep<br/>(03b-intake-answers, M23-S11a / UC-068)<br/>Passo 3 de 5 = 03d-review-confirm-with-intake<br/>Passo 5 de 5 = 04e-confirmation-with-intake"]
    S3 -->|"no intake schema"| S4
    Intake -->|"Próximo (no submit)"| S4

    S4["/[slug]/booking<br/>Step 4: Confirm & Submit"]
    S4 --> Submit(("Confirmar agendamento"))
    Submit --> POST["POST /bookings/authenticated<br/>Auth: JWT cookie → X-Actor-* headers"]
    POST --> SlotOk{"HTTP status?"}
    SlotOk -- 201 Created --> Done["'Solicitação enviada!<br/>Aguarde confirmação por email'<br/>+ booking-details box (04d, M23-S11a)"]
    SlotOk -- 409 Conflict --> S2Error["'Horário indisponível'<br/>→ back to step 2<br/>(shipped: BOOKING_SLOT_UNAVAILABLE routes to the availability step;<br/>no screen here — guest's 02e-slot-conflict.html is the pattern)"]

    class S1,PickupField,S2,DayClick,SlotPicker,S4,Submit,POST,Done,LoginPage,Callback,Hotsite,CTA,S3,S2Error,Intake existing
```

> **M23 extension (✅ built by `M23-S11a` and `M23-S11b`):** between Step 1 and the calendar the flow can add one resource-picker step per unit that has a customer choice (none when everything is automatic), a duration step for a variable-duration service, and — after Personal Info — the intake step; a legged service ends with the journey confirmation. The authenticated customer uses the **same screens and the same step engine as the guest** — see the flow diagram in `guest/book-a-service.md` § M23; only the auth bar and `hideContactFields` differ.

**Note (2026-07-31 docs audit):** this flowchart previously described a generic `/auth/login` + `/api/auth/callback/google` + `/select-tenant` architecture that was never built and has since been superseded — see `customer/login.md`'s 2026-06-24 scope-change note for the canonical, shipped design (tenant-scoped `/{slug}/login`, BFF-only OAuth callback, `/select-tenant` permanently descoped). This file now matches that canonical design instead of duplicating it.

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/{slug}/login` | `LoginPage` | M13-S42 | ✅ Existing |
| BFF `GET /v1/auth/google/callback` | BFF-only, no Next.js route | M13-S42 | ✅ Existing |
| ~~`/select-tenant`~~ | ~~New page (multi-tenant picker)~~ | — | ❌ Descoped — see `customer/login.md` |
| `/[slug]/booking` Step 1 | `ServiceSelectionStep` + `ServiceCard` (extended by M23-S11a: type-aware cards, APPOINTMENT-only list) | M12-S07, M23-S11a | ✅ Existing / ✅ extension |
| `/[slug]/booking` Step 2 | `AvailabilityCarousel` + `SlotPicker` (extended by M23-S11a/b: `resourceSelections`/`durationMinutes`; ❓ plus the "Avise-me quando abrir" button — M23-S31) | M12-S07, M23-S11a, M23-S31 | ✅ Existing / ✅ extension / ❓ Gap (alert button) |
| `/[slug]/booking/availability-alert` | `NewAvailabilityAlertForm` / `AvailabilityAlertLoginGate` — the alert page of the booking flow (tenant branding; a login-required card for a guest), opened from the calendar step's button, prefilled with the service, the single resource pick and the duration | M23-S31 | ❓ Gap — screens `16`–`16i` in this prototype folder |
| `/[slug]/booking` Step 3 | `PersonalInfoStep` (reused, `hideContactFields` prop) | M13-S14 | ✅ Existing |
| `/[slug]/booking` Step 4 (only for intake-bearing services) | `IntakeAnswersStep` (new, shared with the guest path; Confirmation then becomes "Passo 5 de 5") | M23-S11a | ✅ Built |
| `/[slug]/booking` final step | `ConfirmationStep` (M23-S11a adds the booking-details box on success; M23-S11b the journey confirmation) | M12-S07, M23-S11a | ✅ Existing / ✅ details box / ✅ journey confirmation (S11b) |
| `/[slug]/booking` resource picker step (only when the customer has a real choice — automatic resources have no screen) | `ResourcePicker` + `ResourcePickerStep`, the same components and screens as the guest path (`guest/book-a-service.md` § M23) | M23-S11a | ✅ Built |
| `/[slug]/booking` variable-duration step · journey confirmation | `VariableDurationStep` · `LegItineraryStep`, same as the guest path | M23-S11b | ✅ Built |

## Availability alert page (UC-072, M23-S31 — design settled 2026-10-06, `/story-discovery` done)

Creating an alert starts at the calendar step: an "Avise-me quando abrir" button sits in the nav row (Voltar · Avise-me quando abrir · Próximo), in every state of the step, **only when the basket holds exactly one service and it is alert-eligible** (an alert is for one service — matching evaluates one service's slots, so a multi-service basket never shows it). It opens the **alert page, a page of the booking flow itself** — same shell, tenant branding. The page has no use outside a booking attempt, so it is **not** a Minha Conta page; "Meus avisos" (`customer/minha-conta.md`, screen `07`) only lists and cancels what was created here (through a detail page and a confirmation page).

```mermaid
flowchart TD
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Cal["Calendar step<br/>(guest 02 / 02d, customer 02)"] -->|"'Avise-me quando abrir'<br/>(exactly one alert-eligible service)"| Page{"alert page:<br/>customer session?"}
    Page -->|"no (guest)"| Gate["❓ GAP: login-required card<br/>(guest 17-login-aviso) → /login?returnTo=<alert URL> → back to the alert page"]
    Page -->|"yes"| Form
    Gate --> Form["❓ GAP: /{slug}/booking/availability-alert<br/>16-novo-aviso — prefilled from the link:<br/>service, the single resource pick, duration<br/>(16h: a legged service, no resource field)"]
    Form -->|"Criar aviso (POST /availability-alerts)"| Saving["❓ GAP: 16c salvando"]
    Saving -->|"201"| Done["❓ GAP: 16d aviso criado<br/>'Voltar ao site'"]
    Saving -->|"422 criteria"| Err["❓ GAP: 16b / 16g / 16i erro de validação<br/>(intervalo · semanal · período no passado)"]
    Saving -->|"409 cap (10 ativos)"| Cap["❓ GAP: 16e limite — leva a Meus avisos"]
    Saving -->|"422 ineligible service"| Inel["❓ GAP: 16f serviço sem aviso"]
    Cap --> Lista["Meus avisos<br/>(minha-conta 07, M23-S12)"]
    class Gate,Form,Saving,Done,Err,Cap,Inel gap
```

- The criteria travel as **query parameters on the button's link** (`serviceId`, `preferredResourceId` only when a flat service has exactly one resource pick, `durationMinutes`; **no participant count**), so the only thing a login round-trip must preserve is the destination URL, with its query string.
- The alert API is customer-only; the guest gate is client-side (a login-required card on the page itself, like the lead form's), not a redirect.
- For a legged, bundled or multi-pick service the page shows **no resource field** and a note: the alert matches when the whole journey fits, with any professional or room.
- The last screen is a confirmation with a single "Voltar ao site" action.

## Open questions / gaps

- [x] **UC-021 frontend** (login + OAuth callback + tenant selection) — **Resolved/shipped** via `M13-S42` (login) and `M13-S14` (auth detection in the booking flow). This journey is fully reachable end-to-end.
- [x] **Step 3 personal-info handling** — **Resolved.** No dedicated `AuthenticatedBookingReviewStep` was built. `BookingForm` reuses the existing `PersonalInfoStep` with `hideContactFields={isAuthenticatedCustomer}`, and pre-fills `pickupAddress` from `customerProfile.defaultAddress`.
- [x] **`BookingForm` branching** — **Resolved.** No `mode` prop or cookie inspection in `page.tsx`. `BookingForm` calls `getHotsiteCustomerProfile(slug)` on mount; if it resolves, the form switches to `createAuthenticatedBooking()` (`POST /bookings/authenticated`) instead of the guest path.
- [x] **Customer `defaultAddress` source** — **Resolved as Option B.** `getHotsiteCustomerProfile(slug)` (equivalent to `GET /customers/me` for the hotsite context) supplies `defaultAddress` on mount.
