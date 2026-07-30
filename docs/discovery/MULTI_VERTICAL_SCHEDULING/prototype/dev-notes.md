# Dev Notes — Multi-Vertical Scheduling Discovery Prototype

**Status:** Discovery-stage, illustrative. Lighter than a `plan/journey/` prototype's dev-notes — no full state-coverage checklist, no mandatory unhappy-path variants. Purpose is to show direction, not to be implementation-ready.

Full model: `../MULTI_VERTICAL_SCHEDULING.md`. Full candidate use-case list: `../MULTI_VERTICAL_SCHEDULING_USECASES.md`.

## What's real vs. invented here

- **Real:** `--ba-*` tokens, dashboard shell (sidebar/topbar/bottom-nav/bottom-sheet), card/form/badge conventions — all copied from `plan/journey/shared/` and existing staff/manager prototypes, unmodified.
- **Invented:** the tenant "Vitta Studio" and all its data (staff names, service names, prices, capacities, session times). Chosen so one resource (Camila Duarte) can plausibly be both a hair stylist (1:1) and a Pilates instructor (capacity 4) — the concrete instance of discovery §2 model #13.
- **New nav items, not in today's IA:** "Recursos" (manager-only, like Equipe/Configurações/Hotsite) and "Turmas" (staff+manager, like Serviços).

## Components referenced (all GAP — none exist today)

| Component | Screen(s) | BFF call sketched |
|---|---|---|
| `StaffPickerStep` | public-01 | `GET /resources?type=STAFF&serviceId=` |
| `ClassSessionList` / `ClassSessionCard` | public-02, public-03 | `GET /class-sessions?serviceId=&from=&to=` |
| `BundleSlotPicker` | public-04 | `GET /schedule/availability?serviceId=` (intersection across resources + across services) |
| `MultiLegItineraryReview` | public-05 | `POST /bookings` (leg chain in body) |
| `RecurringEnrollmentToggle` | customer-01 | `POST /recurring-enrollments` |
| `RecurringEnrollmentManager` | customer-03, 04, 05, 06 | `GET .../occurrences`, `DELETE .../occurrences/{id}`, `DELETE /recurring-enrollments/{id}` |
| `MyAgendaList` | staff-01 | `GET /bookings?resourceId=&date=today` |
| `ClassSessionRoster` | staff-02 | `GET /class-sessions/{id}/bookings` |
| `SessionCapacityOverrideForm` | staff-03 | `PATCH /class-sessions/{id}` |
| `ResourceList` | manager-01 | `GET /resources` |
| `ServiceResourceConfigSection` | manager-02 | `PATCH /services/{id}` (new fields only) |
| `ClassTemplateList` / `ClassTemplateForm` | manager-03 | `GET /class-templates`, `POST /class-templates` |

## Cross-links to real, existing prototypes

Two screens deliberately hand off into the **real** `guest/prototypes/book-a-service/` files rather than inventing new ones, to show the existing components are reused, not replaced:

- `public-01-staff-picker.html` → `02-calendar-slot.html` (same `SlotPicker`, now called with a `resourceId`)
- `public-02-class-session-picker.html` → `04-confirmation.html` (same confirmation screen, different summary content)

## Review findings (2026-07-29) and what got fixed

A full pass cross-checking prototypes against all 31 candidates found:

1. **Systemic actor mislabel** — CAND-06 through CAND-15 said `Staff (MANAGER)`, contradicting `plan/journey/README.md`'s own STAFF-vs-MANAGER split (Service/Schedule management is STAFF+MANAGER today, per `staff/prototypes/servicos/` existing, not `manager/servicos/`). Fixed: CAND-06–12, 14, 15 now say `Staff (STAFF or MANAGER)`. CAND-01–05 (Resource Management) stays MANAGER-only — a deliberate, self-consistent new judgment call with no existing precedent to derive it from.
2. **Two mislabeled CAND citations** — `public-01`'s "any available professional" option cited CAND-17 (which is ROOM/EQUIPMENT-only); `staff-01` cited CAND-20 (a customer-facing use case, not a staff-agenda one). Both comments corrected in place.
3. **One missing use case** — no CAND existed for "customer books a service with system-auto-assigned *named* staff" (taxonomy model #3), even though CAND-06 already lists it as a configurable selection mode. Added as CAND-17b.
4. **Four gaps with zero prior screens**, now closed: bundles (public-04, CAND-18), multi-leg/spa (public-05, CAND-19), recurring enrollment (customer-01–06, CAND-26–28), session capacity-override (staff-03, CAND-14).
5. **Recurring enrollment rebuilt as a real navigable sequence** — the first pass (`public-06`, since deleted) stacked "opt-in" and "manage" into one static file with no actual before/after navigation. Rebuilt as `customer-01` through `customer-06`, reusing the real Minha Conta shell, with `customer-04`/`customer-05` as a genuine before/after pair for skipping one occurrence.
6. **`manager-02`'s resource-type control was radio buttons (single-select)**, making CAND-07 (bundles) structurally impossible to configure even though the customer-facing bundle experience (`public-04`) already assumed it existed. Switched to checkboxes with a per-type nested selection-mode, and changed the edited service to "Massagem Relaxante" so this screen is now the actual config behind `public-04`.
7. **`manager-01`'s Recursos list was missing 4 resources** (Renata Souza, Sala de Terapia, Sala de Sauna, Sala de Relaxamento) that `public-04`/`public-05` already assumed existed. Added.
8. **"Turmas" nav was wired inconsistently**, in two passes. First pass: every STAFF screen's "Turmas" link pointed at the roster (`staff-02`) itself, with zero path to the template CRUD (`manager-03`). Second pass, on further review: pointing "Turmas" at `manager-03` directly was itself wrong — `manager-03` is the recurring *pattern* config (an occasional, config-style action), not a daily list, and there was still no screen showing "my next several classes" at all — the same gap `Agenda` solves for bookings (`00-agenda.html`, a list, before `01-booking-detail.html`, a detail) had no equivalent here. Added `staff-04-turmas-proximas.html` (CAND-13b, new) as the real landing target everywhere; `manager-03` is now reached via a secondary "Configurar turmas recorrentes" link, with a breadcrumb back. `manager-03`'s "Criar turma" button was also a dead `<button>` with no destination — fixed to land on `staff-04`, where the new template's first generated occurrence is visible, tagged "Nova".
9. `staff-03` was also missing a bottom-nav entirely (every other screen has one) — added.

10. **CAND-01 (create a Resource)** was still the acknowledged gap from the earlier review — `manager-01`'s "+" FAB linked to `#`. Added `manager-04-criar-recurso.html`; the FAB now links there, and Juliana Prado appears in `manager-01`'s list afterward, tagged "Novo," same closure pattern as the Turmas fix above.
11. **`resourcePoolIds` (discovery §5) had no UI anywhere** — checking "Profissional" in `manager-02` implicitly meant "anyone on staff," when the model always supported restricting eligibility to a subset (e.g. only the actual massage therapists, not every stylist). Added Maria Santos (2nd massage therapist), João Mendes + Fábio Ramos (2nd/3rd CrossFit instructors) to `manager-01`, added an eligible-pool checklist to `manager-02` for both Profissional and Sala, fixed `public-04` (which had contradicted its own CUSTOMER_CHOICE setting by presenting Renata as a fixed given — now shows a real 2-therapist choice), and reworked `manager-03`'s create-panel to show CrossFit's 3-instructor eligible pool with one picked per template, adding a second CrossFit template (Fábio) to make the pool→pick-one relationship concrete rather than asserted.

12. **`staff-04`'s own filter-tab counts contradicted its own day-group counts on the same page** — "Minhas turmas (2)" while the Hoje (1) + Próximos (2) groups below it summed to 3. Fixed to (3)/(5), and added the second CrossFit occurrence (Fábio's template) that was missing from the "Todas" bucket entirely.
13. **`public-04`'s blocked-slot example became timeline-inconsistent** after the resourcePoolIds fix added a 2nd eligible room — blocking 15:00 "because Sala de Terapia is in use" no longer makes sense once Sala has a 2-member fungible pool (only *both* rooms busy would block it), and Jornada Spa (13:00–14:45) is over by 15:00 regardless — nothing was actually still busy then. Fixed: moved the blocked slot to 13:30 (genuinely inside Jornada Spa's massage leg) and attributed the block correctly to Renata specifically (a `CUSTOMER_CHOICE` pick, not substitutable) rather than the room (which has a fungible pool and can't be the blocker anymore).
14. **CAND-03 (deactivate a resource) and CAND-12 (edit/deactivate a template) have zero entry points** — not even a dead link. `manager-01`'s rows have a "Horários" action but no "Desativar"; `manager-03`'s template rows have no "Editar"/"Desativar" at all. Not fixed — flagged as a real gap, lower priority than the four closed earlier.

15. **`manager-04` made interactive on request** — the type picker (Profissional/Sala/Equipamento) previously only ever showed the STAFF-specific fields regardless of which card was clicked. Added real JS: selecting Sala or Equipamento now swaps the staff-picker for a display-name field, with label/placeholder/hint/button text all updating per type (CAND-01 main flow step 2). Closed the loop for both new paths the same way as the STAFF path: "Sala de Ioga" and "Kit Halteres (Rack 2)" now appear in `manager-01`, tagged "Novo" — the second deliberately named to read as a fungible pair with "Rack 1" (CAND-17).

16. **Every "Horários" nav link across all 8 dashboard screens pointed at `#`**, disconnected from the real existing screen entirely. Grounded on request (2026-07-29) against `plan/journey/staff/prototypes/horarios/00-schedule-next.html`, which turned out to clarify a real modeling distinction: that screen is a booking/closure week TIMELINE (its FAB "Bloquear período" is where `ScheduleClosure` gets created today) — not a weekly-pattern settings form, which is what CAND-02 actually describes. The two had been conflated. Fixed: every top-level "Horários" nav link now points to the real screen (tenant-wide default, matching today's implicit LOCATION resource); added `staff-05-horarios-recurso.html`, a resource-scoped extension of that exact real screen (same classes, same structure, copied not reinvented) for Camila Duarte, wired from her row in `manager-01`. Also fixed on the same pass: `staff-05` initially had only a back-arrow topbar, less complete than the real screen's own full sidebar+bottom-nav — added those too.

17. **No combined manager view existed at all** — asked directly: "as a manager, can I see all staff + salas + equipamentos, or is everything fragmented?" It was fragmented: `manager-01` is a flat list (no calendar), `staff-05`/CAND-04 is one resource's own timeline, `staff-04`/CAND-13b is sessions only. Added two things: (a) the same "mine vs all" toggle already proven on Turmas, now also on Agenda (`staff-01`) — no new CAND needed, it's a delta to the existing UC-003 etc., same as the rest of Agenda; (b) a genuinely new capability, `manager-05-visao-geral.html` (CAND-13c, new) — a combined multi-resource day grid, deliberately manager-only. "Horários" is now role-adaptive across every screen: STAFF → `staff-05` (own timeline), MANAGER → `manager-05` (combined grid), instead of everyone sharing one generic link.

18. **Documentation catch-up (2026-07-29)** — three things this prototype's findings had exposed but never made it back into the two core docs: (a) the "Agenda vs. Turmas" clarification promised earlier in conversation, now added to the main doc's §4; (b) four open questions that had only ever lived in scattered file comments (SESSION-type resource eligibility, `Resource.maxCapacity`, CAND-04's actor scoping, CAND-17b's tie-breaking rule) — now centralized in the main doc's §9; (c) both core docs now cross-reference this prototype folder as a third artifact, since findings have been flowing in both directions, not just doc → prototype.

## What this prototype still deliberately does NOT cover

- Unhappy-path variants (loading/error/empty states) — none created. If this direction is promoted to a real `plan/journey/` prototype, those become mandatory per that folder's README.
- A full "Serviços" or "Horários" list screen — sidebar/bottom-nav items not central to this discovery point to `#` placeholders.
- Session-cancellation refund policy (staff-02) — still an open question, surfaced visibly on purpose (see discovery doc §9), not answered here.
- CAND-12 (edit/deactivate a template) and CAND-02/04/05 (resource working-hours editor, resource-scoped closure/opening) — still no dedicated screens; lower priority than the four closed above since they're closer to today's existing settings-editor patterns and less novel.

## If this gets promoted to a real journey

Per `CLAUDE.md` §15: run `/docs-audit` clean first, then write the actor `<slug>.md` + update `use-cases.md` + `plan/journey/README.md`'s index — *before* creating any file under `plan/journey/<actor>/prototypes/`. This folder is not a shortcut around that process; it's a separate, lighter-weight sketch that would need to be redone properly at that point, using these screens as a starting reference rather than copying them over as-is.
