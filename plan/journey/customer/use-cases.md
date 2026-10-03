# CUSTOMER — Use Case Inventory

Source: `docs/04-USE_CASES.md`. Working checklist for journeys in this folder — the authenticated `CUSTOMER` role.

| UC | Title | Notes | Journey file |
|---|---|---|---|
| UC-021 | Customer Login | Entry point — login-time multi-tenant selection descoped, see `customer/login.md` | `customer/login.md` |
| UC-023 | Customer Switches Tenant | Action within customer area post-login | `customer/login.md` |
| UC-002 | Authenticated Customer Requests Booking | | `book-a-service.md` |
| UC-005 (A2) | Customer submits requested info | Alt flow only — main flow (admin requests info) lives in `staff/use-cases.md`. Authenticated customer email links to `/dashboard/bookings/:id` (existing stub) — submission form embedded in `BookingDetailPage`. Guest path documented in `guest/submit-info.md`. | `customer/minha-conta.md` (form in booking detail — IA gap) |
| UC-006 | Customer Views and Manages Bookings | A booking marked as a no-show (UC-074) appears in Histórico as read-only — prototype `02f` (added 2026-09-30) | `customer/minha-conta.md` |
| UC-007 | Customer Cancels Booking | | `customer/minha-conta.md` |
| UC-016 | View Customer Loyalty Metrics (own data) | Admin-viewing-any-customer variant lives in `staff/use-cases.md`; balance summary covered in `minha-conta.md`; full breakdown TBD | `customer/minha-conta.md` |
| UC-061–068 | Resource-scoped/bundled/legged/variable-duration/intake booking extensions (authenticated customer) | Same flow as the guest path (`guest/use-cases.md`). Backend/BFF shipped (M23-S01–S03) plus `M23-S29` (public read APIs); frontend = `M23-S11a` (✅ built) + `M23-S11b` (❓ not built); same components and screens as the guest path (`guest/prototypes/book-a-service/`, only the auth bar and `hideContactFields` differ). Intake step (UC-068) sits before the final confirm — prototypes `03b`/`03c`/`03d`/`03e`/`04e`. | `book-a-service.md` |
| UC-069 | Customer Reschedules an Appointment or Reservation | Promoted 2026-08-31 from `docs/discovery/multivertical-booking/` for `M23` (Cluster 3). Extends the existing `PATCH /bookings/:id/reschedule` endpoint. Backend shipped (M23-S03); the customer screen is **`M23-S30`** (prototype `customer/prototypes/minha-conta/15`–`15k`, not built): date and time only, the picks and duration are kept. | `customer/minha-conta.md` |
| UC-070, UC-072, UC-076 | Recurring private reservation creation and management + availability alerts | Same promotion. Draft — not yet shipped. Stories in `plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md`: `M23-S12` (list + manage + alerts management), `M23-S17` (creating a recurring reservation), `M23-S18` (creation-time fixed term, hours and closures). UC-070 recurrences are fixed-term (an end date up to the service's maximum term, every occurrence created once) since 2026-09-29; there is no Pause (removed by `M23-S20`); the renewal path is `M23-S21` (reminder email) and `M23-S22` ("Renovar"). UC-070 itself does not state which services can recur: only a flat, single-resource-requirement service today (`td/TD49-RECURRING-SCHEDULE-BUNDLED-SERVICES.md` tracks bundles). | `customer/minha-conta.md` |
| UC-085, UC-086, UC-087, UC-090, UC-093 | Browse/book/enroll into class sessions | Promoted 2026-08-31 from `docs/discovery/multivertical-booking/` for `M24` (Cluster 4). Draft — not yet shipped, no story assigned. | `customer/reservar-aula.md` |
| UC-089, UC-091, UC-094, UC-095, UC-102 | Manage an existing class enrollment (cancel, skip, waitlist offer, reposição) | Same promotion. Draft — not yet shipped, no story assigned. | `customer/minha-conta.md` |
| UC-019 | Customer Receives Booking Reminder (Day Before) | ⚠️ Email-only, no dashboard page — likely N/A for journey mapping | _TBD_ |
| UC-020 | Customer Receives Booking Reminder (Day Of) | ⚠️ Email-only, no dashboard page — likely N/A for journey mapping | _TBD_ |
| UC-040 | Logged-In Customer Submits the Lead Form | Same page/component as `guest/submit-lead-form.md`, prefilled from profile. Draft — promoted 2026-08-23 for `M20-LEAD-FORM-MODULE`, no story assigned. | `submit-lead-form.md` |

## Entry point

Reached from `guest/use-cases.md` via the "Entrar com Google" CTA (UC-021).
