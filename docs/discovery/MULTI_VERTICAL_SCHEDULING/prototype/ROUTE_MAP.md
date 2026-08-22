# Cross-role route map — Multi-Vertical Scheduling discovery

**Status:** Canonical navigation decision for this discovery. It maps a user goal to
the authoritative prototype (or to an explicit out-of-scope destination). It does not
turn every historical `href="#"` in a component exploration into a real product route.

## Navigation principles

1. A public visitor starts at the service catalogue. Staff, calendar, resource and
   availability screens are steps or permitted deep links, never competing generic starts.
2. The authenticated customer has a distinct account area. Waitlist offers, alerts and
   booking history belong there; the public hotsite must route an unauthenticated person
   through login and return context without holding capacity.
3. Staff operate their own day and classes. Managers get the same operational routes plus
   configuration, resources, enrollment administration and exception resolution.
4. A nav item without a screen in this discovery is labelled **out of discovery scope**.
   It must be absent/disabled in a future prototype, not implemented as `#`.

## Public booking

| User goal | Canonical route | Next route / outcome |
|---|---|---|
| Choose a service | `public-03-service-type-selector.html` | Booking model below |
| Customer chooses a professional | `public-01-staff-picker.html` | `public-08-staff-calendar.html` → `public-14-appointment-availability.html` |
| Appointment, automatic staff | `public-07-auto-staff.html` | `public-14-appointment-availability.html` |
| Appointment, fungible resource | `public-09-fungible-resource.html` | `public-14-appointment-availability.html` |
| Bundle / multi-leg service | `public-04-bundle-booking.html` / `public-05-multi-leg-itinerary.html` | Shared availability, then intake/review |
| Variable-duration resource | `public-11-reserva-por-tempo.html` | `public-14-appointment-availability.html` → `public-12-intake-e-confirmacao.html` |
| Browse a session service | `public-02b-class-agenda.html` | `public-06-class-access.html` |
| Guest email verification | `public-06-class-access.html` | email-sent state → `public-06c-guest-verified.html` or `public-16-guest-verification-expired.html` |
| Manual approval result | `public-13-pending-approval.html` | Customer account/email notification |
| Public full/unavailable state | `public-15-login-required.html` | Login/create account → return to selected context and recheck availability |

`public-02-class-session-picker.html` is superseded by agenda-first `public-02b` and
must not be presented as a parallel public route.

## Customer account

| Customer goal | Canonical route | Notes |
|---|---|---|
| View bookings / account home | `customer-03-minha-conta-agendamentos.html` | Account-root shell: desktop tabs and mobile navigation |
| View/manage class enrollment | `plan/journey/customer/prototypes/minha-conta/06-minhas-turmas.html` | Canonical plan/journey artifact; discovery variants are illustrative only |
| Accept or decline waitlist offer | `customer-08-waitlist-offer.html` | Acceptance → `customer-08b-waitlist-confirmed.html`; never activates recurrence |
| Create/manage availability alert | `public-12-availability-alert.html` | This is an authenticated customer detail despite its historic filename |
| Manage recurring private or class reservation | `customer-04-*.html`, `customer-09-reserva-recorrente.html` | Detail shell, back navigation to account root |
| Edit named group attendees | `customer-10-editar-grupo.html` | Own class-session booking only; no guest self-service route |

## Staff operations

| Staff goal | Canonical route | Escalation |
|---|---|---|
| My appointments | `staff-01-my-agenda.html` | Booking detail actions remain within agenda flow |
| My resource availability | `staff-05-horarios-recurso.html` | Manager changes resource policy/configuration |
| Upcoming classes | `staff-04-turmas-proximas.html` | Class detail → `staff-02-session-roster.html` |
| Class roster / waitlist visibility | `staff-02-session-roster.html` | Capacity/sala override → `staff-03-session-capacity-override.html` |
| Attendance and in-person collection | `staff-02b-fechar-turma.html` | Close-out is session-scoped |
| Resolve non-member approval | `staff-06-guest-approval.html` | One group decision with audit trail |

**Not staff routes:** Resources, service configuration, template configuration,
enrollment administration, tenant configuration and exception worklist are manager-only.

## Manager operations and configuration

| Manager goal | Canonical route | Follow-up |
|---|---|---|
| Start-of-day overview | `manager-dashboard.html` | Day agenda → `manager-agenda-dia.html` |
| First-time tenant setup | `manager-14-onboarding-preset.html` | Preset choice → minimum questions → editable review; CAND-51 bootstrap |
| Combined resources/day view | `manager-05-visao-geral.html` | Resource day management → `manager-08-schedule-controls.html` |
| Session roster | `manager-agenda-dia.html` | `manager-roster-dia.html` |
| Create/manage resources | `manager-01-resources-list.html` | Create → `manager-04-criar-recurso.html`; schedule → `manager-08-schedule-controls.html` |
| Configure appointment/service model and policy | `manager-02-service-resource-config.html` | Service policy → `manager-13-service-booking-policies.html` |
| Manage classes | `manager-turmas-list.html` | Create type → `manager-nova-aula.html` → `manager-adicionar-horario.html` → optional `manager-definir-staff.html` |
| Edit historical template reference | `manager-03-class-templates.html` / `manager-11-edit-template.html` | Historical only; use the new class flow for new work |
| Enrollment administration | `manager-09-matriculas.html` | New manual enrollment → `manager-09b-nova-matricula.html` |
| Resolve future commitment conflict | `manager-12-exception-worklist.html` | Explicit reassign/reschedule/cancel/keep decision |

## Explicitly outside this discovery

The following existing dashboard navigation labels do **not** get a discovery destination:
`Fidelidade`, `Equipe`, tenant-wide `Configurações`, `Hotsite`, customer profile and
notification preference management. They are existing/product-wide areas outside this
scheduling discovery. A future interactive prototype must use a disabled label with
“Fora deste fluxo” or omit it—not a dead anchor.

## Prototype handoff rule

When promoting a discovery screen to `plan/journey/`, replace its sidebar/bottom-nav
with only the routes applicable to its role from this map. Validate each link in the
browser and document the real web route/BFF contract; a static file path here is visual
navigation evidence, not an implementation URL contract.
