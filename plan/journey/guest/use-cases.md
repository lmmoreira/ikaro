# GUEST — Use Case Inventory

Source: `docs/04-USE_CASES.md`. Working checklist for journeys in this folder — the unauthenticated visitor on a tenant's public hotsite.

| UC | Title | Notes | Journey file |
|---|---|---|---|
| UC-001 | Guest Requests Booking (No Authentication) | | `book-a-service.md` |
| UC-011 | Guest Views Real-Time Calendar Availability | Shared algorithm with `customer/` booking flow | `book-a-service.md` |
| UC-005 (A2) | Guest submits requested info | Alt flow only — main flow (admin requests info) lives in `staff/use-cases.md`. Fully implemented (`M13-S38`/`S39`/`S40`, all ✅ Done), incl. guest tokenised-link endpoint (`PATCH /v1/bookings/:id/submit-info/guest?token=`). Email link uses `/bookings/:id/submit-info?token=` (renamed from `/responder` as part of the same story). | `guest/submit-info.md` |
| UC-033 | Guest Asks Chatbot a Question | Promoted from `docs/discovery/CHATBOT/CHATBOT.md` (2026-08-08). Draft — nothing implemented yet, no story number assigned. | `ask-chatbot.md` |
| UC-034 | Guest Checks Chatbot Availability | Widget mount-time pre-flight check; same status as UC-033. | `ask-chatbot.md` |

## Exit point

A guest who clicks "Entrar com Google" leaves this folder's journeys and enters `customer/login.md` (UC-021).
