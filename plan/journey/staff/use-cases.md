# STAFF — Use Case Inventory

Source: `docs/04-USE_CASES.md`. Working checklist for journeys in this folder — shared by `STAFF` and `MANAGER` roles. UCs restricted to `MANAGER` only live in `manager/use-cases.md`.

| UC | Title | Notes | Journey file |
|---|---|---|---|
| UC-022 | Staff Login (No Tenant Selection) | Entry point | `staff/login.md` |
| UC-025 | Admin First Login (Accepts Invite) | First-time staff onboarding | `staff/login.md` |
| UC-003 | Admin Approves Booking | | `staff/agenda.md` |
| UC-004 | Admin Rejects Booking | | `staff/agenda.md` |
| UC-005 (main flow) | Admin Requests More Information | Alt flow A2 (info submission) lives in `customer/` / `guest/` | `staff/agenda.md` |
| UC-008 | Admin Cancels or Reschedules Booking | Extends the same `/dashboard/bookings/[id]` detail page as UC-003/004/005, branched by status | `staff/agenda.md` |
| UC-009 | Admin Marks Booking Complete | Extends the same `/dashboard/bookings/[id]` detail page as UC-003/004/005, branched by status | `staff/agenda.md` |
| UC-010a–d | Staff Manages Schedule Closures and Openings | Confirmed STAFF + MANAGER (`@Roles('MANAGER','STAFF')`) | `staff/horarios.md` |
| UC-010e–f | Resource-Scoped Schedule Closure/Opening | Promoted 2026-08-31 from `docs/discovery/multivertical-booking/` for `M21` (Cluster 1/Foundation). Extends UC-010a/c's exact mechanism with an optional `resourceId` — **MANAGER-only** when `resourceId` is set (see `manager/use-cases.md`); the base STAFF\|MANAGER case is unchanged. Draft — not yet shipped, no story assigned. | `staff/horarios.md` |
| UC-012 | Admin Creates New Service | Confirmed STAFF + MANAGER (`@Roles('MANAGER','STAFF')`) | `staff/servicos.md` |
| UC-013 | Admin Edits Service Details | Confirmed STAFF + MANAGER (`@Roles('MANAGER','STAFF')`) | `staff/servicos.md` |
| UC-050–056 | Service Extensions (resource requirements, bundles, legs, buffer, intake schema, booking policy, booking model) | Promoted 2026-08-31 from `docs/discovery/multivertical-booking/` for `M21` (Cluster 2). STAFF\|MANAGER, same as UC-012/013. Draft — not yet shipped, no story assigned. | `staff/servicos.md` |
| UC-057 | Manager Views a Combined Multi-Resource Day Grid | **MANAGER-only** — see `manager/use-cases.md`. | `staff/horarios.md` |
| UC-061–068 | Customer/guest appointment booking extensions | Cross-listed — see `guest/use-cases.md`/`customer/use-cases.md`. Backend/BFF portions shared with `staff/servicos.md`'s Service extensions. | — |
| UC-071 | Staff Approves or Rejects a Recurring Schedule Request | Promoted 2026-08-31 from `docs/discovery/multivertical-booking/` for `M21` (Cluster 3). STAFF\|MANAGER. Draft — not yet shipped, no story assigned. | `staff/agenda.md` |
| UC-074 | Staff or Manager Marks an Appointment as No-Show | Same promotion. STAFF\|MANAGER. Draft — not yet shipped, no story assigned. | `staff/agenda.md` |
| UC-079, UC-080, UC-096, UC-103, UC-104 | Class template CRUD, range cancellation, enrollment views/manual creation | Promoted 2026-08-31 from `docs/discovery/multivertical-booking/` for `M21` (Cluster 4). STAFF\|MANAGER, matches today's Service management pattern (not manager-exclusive). Draft — not yet shipped, no story assigned. | `manager/turmas.md` |
| UC-082, UC-083, UC-091, UC-098, UC-101 | Session list, capacity override, waitlist promotion, guest approval, close-out | Same promotion. STAFF\|MANAGER. Draft — not yet shipped, no story assigned. | `staff/turmas.md` |
| UC-016 | View Customer Loyalty Metrics (admin/staff variant) | Staff/Manager looks up ANY customer's balance, earning history, and redemption history | `staff/fidelidade.md` |
| UC-017 | Admin Views Booking Analytics | Future — out of MVP, low priority | _TBD_ |
| UC-018 | Admin Receives Daily Schedule Reminder | Email-based; relates to the "today's schedule" dashboard gap identified during M13 review | _TBD_ |
