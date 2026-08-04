# CUSTOMER — Book a Service

**Actor(s):** CUSTOMER  
**Goal:** Submit a booking request on a tenant's hotsite as an authenticated customer  
**UCs covered:** UC-021, UC-002, UC-011  
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

    S3["/[slug]/booking<br/>Step 3: Review — PersonalInfoStep (reused)<br/>hideContactFields=true, detected via getHotsiteCustomerProfile(slug)"] --> S4

    S4["/[slug]/booking<br/>Step 4: Confirm & Submit"]
    S4 --> Submit(("Confirmar agendamento"))
    Submit --> POST["POST /bookings/authenticated<br/>Auth: JWT cookie → X-Actor-* headers"]
    POST --> SlotOk{"HTTP status?"}
    SlotOk -- 201 Created --> Done["'Solicitação enviada!<br/>Aguarde confirmação por email'"]
    SlotOk -- 409 Conflict --> S2Error["❓ GAP: 'Horário indisponível'<br/>→ back to step 2<br/>(no prototype screen here — guest's<br/>02e-slot-conflict.html is the pattern to reuse)"]

    class S1,PickupField,S2,DayClick,SlotPicker,S4,Submit,POST,Done,LoginPage,Callback,Hotsite,CTA,S3 existing
    class S2Error gap
```

**Note (2026-07-31 docs audit):** this flowchart previously described a generic `/auth/login` + `/api/auth/callback/google` + `/select-tenant` architecture that was never built and has since been superseded — see `customer/login.md`'s 2026-06-24 scope-change note for the canonical, shipped design (tenant-scoped `/{slug}/login`, BFF-only OAuth callback, `/select-tenant` permanently descoped). This file now matches that canonical design instead of duplicating it.

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/{slug}/login` | `LoginPage` | M13-S42 | ✅ Existing |
| BFF `GET /v1/auth/google/callback` | BFF-only, no Next.js route | M13-S42 | ✅ Existing |
| ~~`/select-tenant`~~ | ~~New page (multi-tenant picker)~~ | — | ❌ Descoped — see `customer/login.md` |
| `/[slug]/booking` Step 1 | `ServiceSelectionStep` (reuse, no changes) | M12-S07 | ✅ Existing |
| `/[slug]/booking` Step 2 | `AvailabilityCarousel` + `SlotPicker` (reuse) | M12-S07 | ✅ Existing |
| `/[slug]/booking` Step 3 | `PersonalInfoStep` (reused, `hideContactFields` prop) | M13-S14 | ✅ Existing |
| `/[slug]/booking` Step 4 | `ConfirmationStep` (reuse, no changes) | M12-S07 | ✅ Existing |

## Open questions / gaps

- [x] **UC-021 frontend** (login + OAuth callback + tenant selection) — **Resolved/shipped** via `M13-S42` (login) and `M13-S14` (auth detection in the booking flow). This journey is fully reachable end-to-end.
- [x] **Step 3 personal-info handling** — **Resolved.** No dedicated `AuthenticatedBookingReviewStep` was built. `BookingForm` reuses the existing `PersonalInfoStep` with `hideContactFields={isAuthenticatedCustomer}`, and pre-fills `pickupAddress` from `customerProfile.defaultAddress`.
- [x] **`BookingForm` branching** — **Resolved.** No `mode` prop or cookie inspection in `page.tsx`. `BookingForm` calls `getHotsiteCustomerProfile(slug)` on mount; if it resolves, the form switches to `createAuthenticatedBooking()` (`POST /bookings/authenticated`) instead of the guest path.
- [x] **Customer `defaultAddress` source** — **Resolved as Option B.** `getHotsiteCustomerProfile(slug)` (equivalent to `GET /customers/me` for the hotsite context) supplies `defaultAddress` on mount.
