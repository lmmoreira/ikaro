# Dev Notes — GUEST: Book a Class (Trial/Drop-In)

## Overview

New guest-facing journey for M21 — Multi-Vertical Scheduling, Cluster 4. Nothing here is built yet; relocated from `docs/discovery/multivertical-booking/prototype/public-{02b,06,06b,06c,10,10b,16}*.html`. See `docs/02-DOMAIN_MODEL.md` § `ClassSessionBooking`.

## File map (❓ none exist yet)

| File | Status |
|---|---|
| `apps/web/features/booking/components/guest/ClassAgendaPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/ClassAccessFlow.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/ClassWaitlistStatus.tsx` | ❓ Gap |
| `apps/web/features/booking/components/guest/GuestClassEmailVerification.tsx` | ❓ Gap |

## BFF calls (endpoints not yet implemented — contract per `docs/14-API_CONTRACTS.md` § Classes & Sessions)

```
GET  /v1/class-sessions?serviceId=&from=
POST /v1/class-session-bookings/guest-verification
  Body: { sessionId, quantity, attendees: [{ name }], contactEmail, contactName, contactPhone }
POST /v1/class-session-bookings/guest-verification/:token/confirm
  Response: { status: 'CONFIRMED'|'PENDING_APPROVAL', classSessionBookingId }
POST /v1/class-sessions/:id/waitlist   -- requires authentication; guest hits UC-090 A3's login boundary
```

## Screen notes

- **`02-class-access.html`** — a single screen with 3 states depending on auth: anonymous guest (verification flow), authenticated customer without a contract (UC-087, no verification step), authenticated customer with a contract (UC-086). The implementing story must confirm this one screen genuinely handles all three, or split as needed.
- **Email verification token** needs a real landing state, expiry/restart, and post-verification-full state (i.e. capacity fills while the guest is completing verification, UC-097 A3) — per the discovery's own finalized journey rules (`docs/discovery/multivertical-booking/prototype/dev-notes.md` § "Finalized journey rules to carry into formal journeys").
- **`03-waitlist.html`** — guest cannot join a waitlist; this screen is the boundary explaining that and routing to login/account creation (UC-090 A3), not an anonymous waitlist form.

## Known limitations

- No `index.html`/`dev-notes.md` existed in the discovery folder for this consolidated set — added as part of this promotion.
- `04-business-profile.html` has no corresponding CAND — relocated as a supplementary screen, not a promoted use case.

## Open questions / gaps

- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] `04-business-profile.html`'s scope (in vs. out of this milestone) needs confirmation.
