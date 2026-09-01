# GUEST — Book a Service

**Actor(s):** GUEST  
**Goal:** Submit a booking request on a tenant's public hotsite without authentication  
**UCs covered:** UC-001, UC-011 (✅ Reviewed) · UC-061, UC-062, UC-063, UC-064, UC-065, UC-066, UC-067, UC-068 (❓ Gap — M21 Cluster 3, resource-scoped/bundle/leg/variable-duration/intake booking extensions)  
**Status:** Base flow reviewed — M21 Cluster 3 extension not yet built, see the ❓ GAP section in `dev-notes.md`

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3

    Start(["Hotsite /{slug}"]) --> CTA(("Click 'Agendar'"))
    CTA --> S1["/[slug]/booking<br/>Step 1: Select Services"]

    S1 --> Pickup{"requiresPickupAddress?"}
    Pickup -- yes --> PickupField["AddressFields — pickup address"]
    Pickup -- no --> S2
    PickupField --> S2

    S2["/[slug]/booking<br/>Step 2: Calendar — AvailabilityCarousel |UC-011|"] --> DayClick(("Click green day"))
    DayClick --> SlotPicker["SlotPicker — time slots |UC-011|"]
    SlotPicker --> S3

    S3["/[slug]/booking<br/>Step 3: Personal Info |UC-001|"] --> S4
    S4["/[slug]/booking<br/>Step 4: Review & Confirm"]
    S4 --> Submit(("Confirmar agendamento"))
    Submit --> POST["POST /bookings<br/>Header: X-Tenant-Slug"]
    POST --> SlotOk{"HTTP status?"}
    SlotOk -- 201 Created --> Done["'Solicitação enviada!<br/>Aguarde confirmação por email'"]
    SlotOk -- 409 Conflict --> S2Error["'Horário indisponível'<br/>→ back to step 2"]

    class Start,CTA,S1,PickupField,S2,DayClick,SlotPicker,S3,S4,Submit,POST,Done,S2Error existing
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/[slug]/booking` | `BookingForm` (orchestrates steps) | M12-S07 | ✅ Existing |
| Step 1 | `ServiceSelectionStep` + `AddressFields` | M12-S07 | ✅ Existing |
| Step 2 | `AvailabilityCarousel` + `SlotPicker` | M12-S07 | ✅ Existing |
| Step 3 | `PersonalInfoStep` + `PhotoUpload` | M12-S07 | ✅ Existing |
| Step 4 | `ConfirmationStep` | M12-S07 | ✅ Existing |

## Open questions / gaps

- No open gaps for the guest booking path — fully built as of M12-S07.
- UC-005 (A2) — guest submits admin-requested info: backend complete (`PATCH /bookings/:id/submit-info/guest?token=`), but frontend page `/[slug]/bookings/:id/submit-info` does not exist. Tracked in `guest/use-cases.md`. Out of scope for this journey.
- When a session is full or an appointment has no matching availability, a guest cannot create a waitlist entry or availability alert. Preserve the selected session/criteria through login/account creation, then return the authenticated customer to the action.

## M21 — Multi-Vertical Scheduling, Cluster 3 extension (❓ Gap, not yet built)

> Promoted from `docs/discovery/multivertical-booking/`. Step 1 ("Select Services") now branches on the selected service's `bookingModel`/`resourceRequirements`/`legs`/`durationPolicy` before reaching the existing Step 2 calendar. Full implementation-handoff detail lives in `dev-notes.md`'s own ❓ GAP section — not duplicated here.

```mermaid
flowchart TD
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    S1b["❓ GAP: /[slug]/booking<br/>Step 1b: resource branch<br/>(16-service-type-selector)"] -->|"STAFF, CUSTOMER_CHOICE"| StaffPicker["❓ GAP: staff picker<br/>(05-staff-picker)"]
    S1b -->|"STAFF, AUTO_ANY"| AutoStaff["❓ GAP: auto-assigned staff<br/>(06-auto-staff)"]
    S1b -->|"ROOM/EQUIPMENT, AUTO_FUNGIBLE_POOL"| Fungible["❓ GAP: fungible pool<br/>(07-fungible-resource)"]
    S1b -->|"resourceRequirements.length >= 2"| Bundle["❓ GAP: bundle booking<br/>(09-bundle-booking)"]
    S1b -->|"legs.length >= 2"| MultiLeg["❓ GAP: multi-leg itinerary<br/>(10-multi-leg-itinerary)"]
    S1b -->|"durationPolicy=CUSTOMER_SELECTED"| VarDuration["❓ GAP: variable-duration reservation<br/>(12-reserva-por-tempo)"]

    StaffPicker --> Availability["❓ GAP: shared availability step<br/>(11-appointment-availability)"]
    AutoStaff --> Availability
    Fungible --> Availability
    Bundle --> Availability
    MultiLeg --> Availability
    VarDuration --> Availability

    Availability --> Intake["❓ GAP: intake + confirmation<br/>(13-intake-e-confirmacao)"]
    Intake -->|"POST /bookings"| Result{"Approval mode?"}
    Result -->|"AUTO_CONFIRM"| Done
    Result -->|"MANUAL_APPROVAL"| Pending["❓ GAP: pending-approval hold<br/>(14-pending-approval)"]

    StaffPicker -->|"no availability"| LoginRequired["❓ GAP: login/alert boundary<br/>(15-login-required)"]
```

**Prototype:** `guest/prototypes/book-a-service/05-staff-picker.html` through `16-service-type-selector.html` (relocated from the discovery folder's `public-XX-*.html` screens).

**Open questions:**
- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] Whether `16-service-type-selector.html` replaces or precedes the existing `ServiceSelectionStep` (Step 1) is a UI/routing decision for the implementing story — this discovery screen was built standalone and never reconciled against the shipped car-wash-only selector.
- [ ] Pre-existing dangling links found during this promotion, not fixed here: `16-service-type-selector.html`'s "browse sessions" link (`public-02b-class-agenda.html`, Cluster 4) is not yet promoted.
