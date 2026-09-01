# GUEST — Use Case Inventory

Source: `docs/04-USE_CASES.md`. Working checklist for journeys in this folder — the unauthenticated visitor on a tenant's public hotsite.

| UC | Title | Notes | Journey file |
|---|---|---|---|
| UC-001 | Guest Requests Booking (No Authentication) | | `book-a-service.md` |
| UC-011 | Guest Views Real-Time Calendar Availability | Shared algorithm with `customer/` booking flow | `book-a-service.md` |
| UC-061–068 | Resource-scoped/bundled/legged/variable-duration/intake booking extensions | Promoted 2026-08-31 from `docs/discovery/multivertical-booking/` for `M21` (Cluster 3). Draft — not yet shipped, no story assigned. | `book-a-service.md` |
| UC-085, UC-088, UC-090, UC-097 | Browse class agenda, guest multi-attendee group booking, waitlist boundary, guest email verification | Promoted 2026-08-31 from `docs/discovery/multivertical-booking/` for `M21` (Cluster 4). Draft — not yet shipped, no story assigned. | `book-a-class.md` |
| UC-005 (A2) | Guest submits requested info | Alt flow only — main flow (admin requests info) lives in `staff/use-cases.md`. Fully implemented (`M13-S38`/`S39`/`S40`, all ✅ Done), incl. guest tokenised-link endpoint (`PATCH /v1/bookings/:id/submit-info/guest?token=`). Email link uses `/bookings/:id/submit-info?token=` (renamed from `/responder` as part of the same story). | `guest/submit-info.md` |
| UC-033 | Guest Asks Chatbot a Question | Implemented M19 (M19-S05 backend, M19-S09 BFF, M19-S11 widget). | `ask-chatbot.md` |
| UC-034 | Guest Checks Chatbot Availability | Widget mount-time pre-flight check. Implemented M19 (M19-S06 backend, M19-S09 BFF, M19-S11 widget). | `ask-chatbot.md` |
| UC-038 | Visitor Sees the Lead Form Teaser | Draft — promoted 2026-08-23 for `M20-LEAD-FORM-MODULE`, no story assigned. Teaser renders on `shared/hotsite.html`, no dedicated screen. | `submit-lead-form.md` |
| UC-039 | Guest Submits the Lead Form | Draft — promoted 2026-08-23 for `M20-LEAD-FORM-MODULE`, no story assigned. | `submit-lead-form.md` |
| UC-040 (A1) | Guest hits the `CUSTOMER_ONLY` login gate | Alt flow only — main flow (authenticated customer submits) lives in `customer/use-cases.md`. Draft — promoted 2026-08-23 for `M20-LEAD-FORM-MODULE`. | `submit-lead-form.md` |

## Exit point

A guest who clicks "Entrar com Google" leaves this folder's journeys and enters `customer/login.md` (UC-021).
