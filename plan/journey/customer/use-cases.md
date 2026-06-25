# CUSTOMER — Use Case Inventory

Source: `docs/04-USE_CASES.md`. Working checklist for journeys in this folder — the authenticated `CUSTOMER` role.

| UC | Title | Notes | Journey file |
|---|---|---|---|
| UC-021 | Customer Login | Entry point — login-time multi-tenant selection descoped, see `customer/login.md` | `customer/login.md` |
| UC-023 | Customer Switches Tenant | Action within customer area post-login | `customer/login.md` |
| UC-002 | Authenticated Customer Requests Booking | | `book-a-service.md` |
| UC-005 (A2) | Customer submits requested info | Alt flow only — main flow (admin requests info) lives in `staff/use-cases.md`. Authenticated customer email links to `/dashboard/bookings/:id` (existing stub) — submission form embedded in `BookingDetailPage`. Guest path documented in `guest/submit-info.md`. | `customer/minha-conta.md` (form in booking detail — IA gap) |
| UC-006 | Customer Views and Manages Bookings | | `customer/minha-conta.md` |
| UC-007 | Customer Cancels Booking | | `customer/minha-conta.md` |
| UC-016 | View Customer Loyalty Metrics (own data) | Admin-viewing-any-customer variant lives in `staff/use-cases.md`; balance summary covered in `minha-conta.md`; full breakdown TBD | `customer/minha-conta.md` |
| UC-019 | Customer Receives Booking Reminder (Day Before) | ⚠️ Email-only, no dashboard page — likely N/A for journey mapping | _TBD_ |
| UC-020 | Customer Receives Booking Reminder (Day Of) | ⚠️ Email-only, no dashboard page — likely N/A for journey mapping | _TBD_ |

## Entry point

Reached from `guest/use-cases.md` via the "Entrar com Google" CTA (UC-021).
