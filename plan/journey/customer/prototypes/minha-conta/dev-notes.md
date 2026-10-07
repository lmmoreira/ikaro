# Dev Notes — Customer: Minha Conta

Journey spec: `customer/minha-conta.md`
Stories: `M13-S27` (list) · `M13-S28` (detail/cancel/info-submit) · `M13-S29` (loyalty) · `M13-S30`/`M13-S14` (switch tenant) — ✅ Done

> Updated 2026-07-31 — this file previously described the whole journey as unbuilt and cited the old milestone codes (`M12X`/`M126`/`M124`, since retired/renumbered into M13) and Portuguese route segments (`minha-conta`/`agendamentos`/`fidelidade`) that were never the real route names — the shipped routes use English segments (`my-account`/`bookings`/`loyalty`).

---

## Routes (all ✅ shipped)

| File | Next.js Route | Component |
|---|---|---|
| `01-minha-conta.html` | `/{slug}/my-account` | `MinhaContaPage` |
| `02-*.html` | `/{slug}/my-account/bookings/[id]` | `AgendamentoDetailPage` |
| `03-cancel-confirm.html` | `/{slug}/my-account/bookings/[id]/cancel` — a dedicated page, not a bottom sheet | `CancelConfirmPage` |
| `03b-cancel-error.html` | `/{slug}/my-account/bookings/[id]/cancel/error` | — |
| `04-*.html` | `/{slug}/my-account/loyalty` | `MinhaFidelidadePage` |
| `05-trocar-empresa.html` | `/switch-tenant` (not tenant-scoped — no `[slug]` prefix) | `SwitchTenantClient` |

## Auth guard

Both pages require a valid httpOnly `access_token` cookie with `role: CUSTOMER`.  
On 401 → redirect to `/{slug}/login`.

## BFF calls

| Screen | Call | Endpoint | Notes |
|---|---|---|---|
| Minha Conta (list) | `GET /v1/bookings` | booking context | No status filter — split client-side into 3 sections |
| Minha Conta (list) | `GET /v1/loyalty/balance` | loyalty context | Compact strip: `currentPoints` + `nextExpiryDate` + `nextExpiryPoints` |
| Detail | `GET /v1/bookings/:id` | booking context | Ownership check: backend returns 404 if `customerId ≠ JWT.sub` (deliberate — doesn't reveal booking existence to a non-owner) |
| Cancel | `PATCH /v1/bookings/:id/cancel` | BFF routes to `/cancel-customer` | 422 if outside `cancellation_window_hours` |
| Info submit (UC-005 A2) | `PATCH /v1/bookings/:id/submit-info` | booking context | Body: `{ message: string }` |

## Client-side section logic

```ts
const upcoming = bookings.filter(b =>
  b.status === 'APPROVED' && new Date(b.scheduledAt) >= today
);
const pending = bookings.filter(b =>
  b.status === 'PENDING' || b.status === 'INFO_REQUESTED'
);
const history = bookings.filter(b =>
  ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(b.status)
);
```

## Cancel button visibility (UC-006 A2)

Show "Cancelar" on APPROVED bookings only when:
```ts
const windowHours = tenant.settings.booking.cancellation_window_hours; // default: 48
const deadline = new Date(booking.scheduledAt);
deadline.setHours(deadline.getHours() - windowHours);
const canCancel = new Date() < deadline;
```
When `canCancel === false`: hide button, show note "Prazo de cancelamento encerrado".

## Cancel flow (UC-007)

1. Customer clicks "Cancelar" → open `CancelSheet` component (bottom sheet over current page)
2. Customer confirms → `PATCH /v1/bookings/:id/cancel`
3. On 200 → close sheet, navigate to `/{slug}/minha-conta`, show booking in Histórico as CANCELLED
4. On 422 → close sheet, show `CancelErrorState` inline (03b-cancel-error prototype)

## Info-submit flow (UC-005 A2)

1. Customer lands on detail page with `status === INFO_REQUESTED`
2. Sees admin's message + textarea form
3. Submits → `PATCH /v1/bookings/:id/submit-info` with `{ message: string }`
4. On 200 → booking status returns to `PENDING`; update UI accordingly (status badge + remove form) — see `02d-info-sent.html`
5. On non-2xx (network/5xx) → re-enable form, preserve typed text, show inline error banner — see `02e-submit-error.html`

**Validation:**

| Field | Rule | Error message |
|---|---|---|
| `response` (textarea) | must not be empty | "Informe sua resposta antes de enviar." |

> The textarea in `02b-agendamento-info-requested.html` has no `required` attribute and no validation-error prototype screen today — this is an implicit rule, not yet shown as a clickable state. The error copy above follows the repo's established "Informe..." tone (see guest `03b-validation-error.html`: "Informe um e-mail válido."). Confirm exact copy with product before implementation; no variant screen exists for this specific state.

**States:** `idle → submitting → success / error` (submitting state has no dedicated prototype screen — button text/disabled treatment should follow the same pattern as `customer/prototypes/book-a-service/04b-submitting.html`).

## Types (resolved — shipped as part of M13-S27)

The type shape below was the pre-implementation proposal; verify the exact current name/shape in `packages/types/src/` directly rather than trusting this table, since the feature has since shipped and the type may have been named or structured differently during implementation.

```ts
export interface CustomerBookingListItem {
  id: string;
  status: BookingStatus;
  scheduledAt: string | null; // ISO-8601
  services: Array<{ name: string; durationMinutes: number; unitPrice: number }>;
  totalPrice: number;
}
export interface CustomerBookingListResponse {
  items: CustomerBookingListItem[];
  total: number;
}
```

## Shell pattern

Customer area uses `dashboard-topbar` + `dashboard-layout` + `main-content` (same tokens as staff dashboard) — but NO sidebar. The 3-tab bottom nav (Início / Agendamentos / Fidelidade) mirrors mobile navigation.

Detail pages (drill-down) use `dashboard-topbar` with a back link replacing the brand slot. No bottom-nav on detail pages.

Reference shell: `plan/journey/shared/customer-dashboard.html`

## File map — per-screen status (all ✅ shipped)

| File | Production target | Status |
|---|---|---|
| `00-hotsite-logged-in.html` | `shared/hotsite-logged-in.html` (entry point) | ✅ Done |
| `01-minha-conta.html` | `/{slug}/my-account` | ✅ Done — M13-S27 |
| `01b-minha-conta-empty.html` | same route — empty state (UC-006 A1) | ✅ Done — M13-S27 |
| `02-agendamento-detail.html` | `/{slug}/my-account/bookings/[id]` (APPROVED/PENDING) | ✅ Done — M13-S28 |
| `02b-agendamento-info-requested.html` | same route — INFO_REQUESTED + response form | ✅ Done — M13-S28 |
| `02c-agendamento-historico.html` | same route — COMPLETED (read-only) | ✅ Done — M13-S28 |
| `02d-info-sent.html` | same route — inline state after successful submit-info | ✅ Done — M13-S28 |
| `02e-submit-error.html` | same route — inline state after failed submit-info | ✅ Done — M13-S28 |
| `03-cancel-confirm.html` | `/{slug}/my-account/bookings/[id]/cancel` — dedicated page, not a sheet | ✅ Done — M13-S28 |
| `03b-cancel-error.html` | `/{slug}/my-account/bookings/[id]/cancel/error` | ✅ Done — M13-S28 |
| `04-fidelidade.html` | `/{slug}/my-account/loyalty` | ✅ Done — M13-S29 |
| `04b-fidelidade-empty.html` | same route — empty state (0 points) | ✅ Done — M13-S29 |
| `05-trocar-empresa.html` | `/switch-tenant` (UC-023) | ✅ Done — M13-S14/S30 |

---

## ❓ GAP — M23 Cluster 3 extension (UC-070 create + manage, UC-072, UC-076, not yet built)

> Everything above is shipped. Everything below is new, unimplemented scope promoted from `docs/discovery/multivertical-booking/`. See `docs/02-DOMAIN_MODEL.md` § `RecurringBookingSchedule`/`AvailabilityAlert`, `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules / Availability Alerts.

### Overview

Stories: `M23-S12` (list + manage + alerts management), `M23-S31` (alert creation — a page of the booking flow, screens in `customer/prototypes/book-a-service/16*`), `M23-S17` (creating a recurring reservation — the `13*`, `06b`, `06c` screens), `M23-S18` (the shared hours-and-closures check and the single `409` occurrence-list payload, backend — it lands before `M23-S05`; `06d` is only its proposed UI, built in `M23-S17` if S18 rejects at creation). The creation screens were added on 2026-09-29 as a deliberately simple first pass, all inside the account shell `08-turmas-lista.html` established (Vitta Studio tenant, Agendamentos tab active); every choice is a default to recheck at each story's discovery. The flow diagram is in `../../minha-conta.md`.

### File map (❓ none exist yet)

| File | Status | Story |
|---|---|---|
| `apps/web/app/[slug]/my-account/recurring-schedules/page.tsx` | ❓ Gap | M23-S12 |
| `apps/web/app/[slug]/my-account/recurring-schedules/new/page.tsx` | ❓ Gap | M23-S17 |
| `apps/web/app/[slug]/my-account/recurring-schedules/[id]/page.tsx` | ❓ Gap | M23-S12 |
| `apps/web/app/[slug]/my-account/alerts/page.tsx` | ❓ Gap | M23-S12 |
| `apps/web/app/[slug]/my-account/alerts/[id]/page.tsx` | ❓ Gap — detail page (central detail + action pane) | M23-S12 |
| `apps/web/app/[slug]/my-account/alerts/[id]/cancel/page.tsx` | ❓ Gap — cancel confirmation page, same pattern as `bookings/[id]/cancel` | M23-S12 |
| `apps/web/features/customer/components/my-account/RecurringScheduleList.tsx` | ❓ Gap | M23-S12 |
| `apps/web/features/customer/components/my-account/RecurringScheduleOccurrenceActions.tsx` | ❓ Gap | M23-S12 |
| `apps/web/features/customer/components/my-account/NewRecurringScheduleForm.tsx` (+ Review, Result) | ❓ Gap | M23-S17 |
| `apps/web/features/customer/hooks/useRecurringSchedules.ts` / `useCreateRecurringSchedule.ts` | ❓ Gap | M23-S12 / S17 |
| `packages/i18n/locales/{pt-BR,en}/web.json` — `myAccount.recurringSchedules.*` | ❓ Gap | M23-S12 / S17 |

> Supersedes the earlier draft names (`features/booking/components/account/RecurringPrivateReservationManager.tsx`, route `/my-account/recurring-reservations/[id]`): `M23-S12` already chose `recurring-schedules` and `features/customer/components/my-account/` after checking the real precedent, and that story's own verification note applies here too — re-check at implementation time.

### Prototype screens

| File | Screen | Route | Story |
|---|---|---|---|
| `14-recorrentes-lista.html` | List: ativas / em análise / encerradas, each with its term ("até dd/mm") and "Renovar" | `/{slug}/my-account/recurring-schedules` | M23-S12 (S17 adds the create button) |
| `14b-recorrentes-lista-vazia.html` | List, empty state + create button | same | M23-S12 / S17 |
| `13-nova-recorrencia.html` | Pattern: service, resource, weekdays, start time, period | `/{slug}/my-account/recurring-schedules/new` | M23-S17 |
| `13b-nova-recorrencia-revisar.html` | Review and confirm (step 2, same route) | same | M23-S17 |
| `13c-nova-recorrencia-sucesso.html` | Created — `ACTIVE` | same, success state | M23-S17 |
| `06c-recorrente-em-analise.html` | Created — `PENDING_APPROVAL` | same, pending state | M23-S17 |
| `06b-reserva-recorrente-erro.html` | `409` conflict, with the conflicting dates | same, error state | M23-S17 |
| `06d-reserva-recorrente-erro-horario.html` | `409` conflict, mixed list (closed day, outside hours, already booked) — same component as `06b`, different data | same, error state | M23-S17 (payload from M23-S18) |
| `13f-renovar-recorrencia.html` | Renewal: the form pre-filled from an ended/ending schedule (state A) and the not-found fallback (state B) | `/{slug}/my-account/recurring-schedules/new?renewFrom=<id>` | M23-S22 |
| `13d-nova-recorrencia-limite.html` | `409` active-schedule cap reached | same, error state | M23-S17 |
| `13e-nova-recorrencia-erro.html` | Validation errors + submit failure | same, error states | M23-S17 |
| `06-reserva-recorrente.html` | Manage: skip / reschedule occurrence, end (no Pause). Since `M23-S08` an occurrence is its linked booking: skip = cancel that booking and reschedule = the ordinary reschedule, both subject to the tenant's cancellation / reschedule windows (the screen needs a window-expired message the prototype does not draw yet) | `/{slug}/my-account/recurring-schedules/[id]` | M23-S12 |
| `06e-pular-fora-do-prazo.html` / `06f-reagendar-fora-do-prazo.html` | Skip / reschedule refused because the tenant's cancellation / reschedule window has passed (same wording as one-off `03b`; the occurrence is a booking, decided in `M23-S08`) | same, error state | M23-S12 |
| `07-availability-alert.html` | "Meus avisos": list and cancel — no create button, no edit yet (creation is a page of the booking flow, `book-a-service/16*`); entered from the "Meus avisos" link on `01-minha-conta.html` | `/{slug}/my-account/alerts` | M23-S12 |
| `07b-avisos-vazio.html` | Empty state — points the customer to "Avise-me quando abrir" in the booking flow | same, empty | M23-S12 |
| `07c-avisos-carregando.html` | Loading skeleton | same, loading | M23-S12 |
| `07d-avisos-erro.html` | `GET /availability-alerts` failed — retry | same, error | M23-S12 |
| `07e-aviso-nao-editavel.html` | `409 BOOKING_ALERT_NOT_EDITABLE` on cancel (already notified or expired, reached from `07h`) — the list refreshes, the alert moves to history | same, error | M23-S12 |
| `07f-aviso-detalhe.html` | Alert detail (ACTIVE) — central detail + action pane with "Cancelar aviso"; same layout as `02-agendamento-detail` | `/{slug}/my-account/alerts/[id]` | M23-S12 |
| `07g-aviso-detalhe-historico.html` | Alert detail (NOTIFIED / EXPIRED) — read-only, no cancel action | same, history | M23-S12 |
| `07h-cancelar-aviso.html` | Cancel confirmation — central detail + action pane; same layout as `03-cancel-confirm`, `DELETE /availability-alerts/:id` | `/{slug}/my-account/alerts/[id]/cancel` | M23-S12 |
| `07i-cancelar-aviso-erro.html` | Cancel failed (network / 5xx) — the alert stays active, retry | same, error | M23-S12 |

### Screen 13 — Nova reserva recorrente: padrão (`NewRecurringScheduleForm`)

**File:** `apps/web/features/customer/components/my-account/NewRecurringScheduleForm.tsx` (GAP)

**BFF call:**
```
POST /recurring-booking-schedules
  Body: { serviceId, recurrence: { frequency: "WEEKLY", daysOfWeek, startTime, durationMinutes },
          assignmentPolicy: "FIXED_ASSIGNMENT" | "RESOLVE_PER_OCCURRENCE",
          resourceIds?: [uuid]   // exactly one when FIXED_ASSIGNMENT
          startsOn: "YYYY-MM-DD", endsOn: "YYYY-MM-DD" }   // endsOn REQUIRED, <= startsOn + the service's maximum term (recurringHorizonDays, 90 days by default)
  Response 201: { id, status: "ACTIVE" | "PENDING_APPROVAL", approvalHoldExpiresAt: string | null }
```

**Which services the form offers:** there is **no server-side filter** for recurrence. The BFF service type exposes `recurrenceEligible`, `bookingModel`, `resourceRequirements` and `legs`, so the client would filter on `recurrenceEligible`, `bookingModel = APPOINTMENT`, no `legs` and exactly one requirement — replicating `assertServiceEligible`. `M23-S17` should decide whether to expose an eligibility indicator from the API instead of duplicating the rule in the client.

**Resource field:** shown only when the service's requirement is `CUSTOMER_CHOICE` (→ `FIXED_ASSIGNMENT`, one resource). For `AUTO_ANY` / `AUTO_FUNGIBLE_POOL` it is omitted and the policy is `RESOLVE_PER_OCCURRENCE`.

**Validation** (the rules the backend actually enforces):
| Field | Rule | Error message |
|---|---|---|
| daysOfWeek | at least one weekday (`RecurrenceRuleSchema`, `.min(1)`) | "Escolha pelo menos um dia da semana." |
| resourceIds | exactly one when `FIXED_ASSIGNMENT` (schema `.length(1)` + refine) | not drawn — the resource list preselects one |
| endsOn | **required**, not before `startsOn` (equal is allowed) and not later than `startsOn` + the service's maximum term (before start → `422` `BOOKING_RECURRING_SCHEDULE_INVALID_DATE_RANGE`; over the cap → `422` `BOOKING_RECURRING_SCHEDULE_TERM_EXCEEDED` with `params { maxTermDays, latestEndsOn }`; missing → `400` request validation) | before start: "A data de término não pode ser anterior à data de início." · missing: "Escolha a data em que a recorrência termina." · over the cap: "A data final passa do limite de 90 dias (até dd/mm). Escolha uma data anterior — depois você pode renovar." (`13e` states A1/A2/A3) |
| durationMinutes | positive integer — read-only, defined by the service | — |

**States:** idle → reviewing (`13b`) → submitting → created (`13c`) | pending approval (`06c`) | conflict (`06b`) | hours / closed-day / occupied list (`06d`, same component as `06b`) | cap reached (`13d`) | failure (`13e`).

**Outcome → screen:**
| Outcome | Screen |
|---|---|
| `201` `ACTIVE` | `13c` |
| `201` `PENDING_APPROVAL` | `06c` |
| `409` `BOOKING_RECURRING_SCHEDULE_CONFLICT` | `06b` |
| `409` `BOOKING_RECURRING_SCHEDULE_CONFLICT` whose `conflicts` carry `CLOSED` / `OUTSIDE_HOURS` reasons (M23-S18 rejects at creation) | `06d` — same component as `06b`; occupancy and hours reasons can appear together in one list |
| `409` `BOOKING_RECURRING_SCHEDULE_CAP_REACHED` | `13d` |
| `422` `BOOKING_RECURRING_SCHEDULE_INVALID_DATE_RANGE` (A1) · `400` request validation for a missing end date (A2) · `422` `BOOKING_RECURRING_SCHEDULE_TERM_EXCEEDED` (A3) | `13e`, state A (A1 / A2 / A3) |
| `422` `BOOKING_RECURRING_SCHEDULE_INELIGIBLE_SERVICE` | should be unreachable (the service list is filtered); treat as generic failure |
| network / `5xx` | `13e`, state B — the typed pattern is preserved |

**Mobile notes:** the shell provides the bottom nav; the form is a single column, weekday chips wrap.

### Known limitations of this prototype (gap variants, not silently dropped)

- ⚠ **`06b` shows data the API now returns (M23-S18) but the screen is not built yet.** It lists the conflicting occurrences from the `409` body's `conflicts: [{ occurrenceStart, reason }]` (`reason` `OCCUPIED` / `CLOSED` / `OUTSIDE_HOURS`); `M23-S17` only renders it, falling back to the generic message when the body has no list (which is also what an overlap with the customer's own active schedule returns — see S17's decision G). The alternative-resource suggestion the original discovery prototype showed was removed — the API cannot compute it.
- ⚠ **`06b`'s original dates were inconsistent** ("a cada quatro semanas" between dates two weeks apart, on days that were not Tuesdays); corrected to 26 ago and 23 set.
- ⚠ **Duration is read-only.** A `durationPolicy = CUSTOMER_SELECTED` service needs the variable-duration control (`guest/prototypes/book-a-service/12-reserva-por-tempo.html`), not drawn.
- ⚠ **`06d` shows data the API now returns (M23-S18) but the screen is not built yet.** Working hours and closures are validated at creation (decided 2026-09-29: reject the whole request with the occurrence list, `CLOSED` / `OUTSIDE_HOURS` mixed with `OCCUPIED` in one payload); `M23-S17` builds the screen.
- ⚠ **Fixed term (2026-09-29).** The whole term is created at once (immediately, or when staff approve), the end date is required and capped, and there is no Pause, no rolling generation and no open-ended schedule. `13`/`13b`/`13c`/`13e`/`06`/`14` were updated for it. A finished schedule shows as "Encerrada" (`ENDED`, set by a job in `M23-S05`).
- ⚠ **Renewal (`13f`) has no story-level rule for when "Renovar" appears on an active schedule** — drawn for the window of the reminder e-mail (`M23-S21`); to be fixed in `M23-S22`'s `/story-discovery`. The by-id read that `13f` needs is not built yet (`M23-S21`).
- ⚠ **A bundled service cannot recur**, so the form never shows a multi-resource picker. Tracked in `td/TD49-RECURRING-SCHEDULE-BUNDLED-SERVICES.md`.
- ⚠ **Staff creating on a customer's behalf** (allowed by UC-070) has no prototype.

### Alert creation is not in this folder

The "Avise-me quando abrir" alert page is a page of the booking flow (tenant branding, login-required), so its screens (`16`–`16i`) live in `customer/prototypes/book-a-service/` and are specified in that folder's `dev-notes.md` § "Avise-me quando abrir": the button and the alert page. This folder holds only "Meus avisos" (`07`, M23-S12): list and cancel (no edit yet).

**BFF calls (whole extension):**
```
GET/POST/PATCH  /recurring-booking-schedules[/:id]           -- UC-070
POST            /recurring-booking-schedules/:id/end          -- UC-070 A2 (the `…/pause` route was removed by M23-S20)
POST/GET/PATCH/DELETE  /availability-alerts[/:id]              -- UC-072, UC-076
```

**Open questions / gaps:**
- [x] Stories exist: `M23-S12`, `M23-S17`, `M23-S18`, `M23-S20` (remove Pause), `M23-S21` (renewal reminder e-mail), `M23-S22` ("Renovar", `13f`) — each still begins with `/story-discovery`.
- [ ] **Entry point** (default drawn): a "Reservas recorrentes" link on the Agendamentos page → `14`, with the create button on the list. Alternatives: a "repetir toda semana" option inside the one-off booking flow, or an entry on the service page. Nav placement (a new top-level tab vs. folded into Agendamentos) is still a UI decision for the implementing story.
- [ ] Every "known limitation" above.

---

## ❓ GAP — M23 Cluster 3 — Reagendar uma reserva (UC-069, story `M23-S30`, not yet built)

The customer area had **no reschedule screen** (only the staff `RescheduleBookingPage` in the dashboard and the recurring-occurrence panel in `06`). This pass adds it; `06`'s inline reschedule panel (a slot `<select>` with "Preço será recalculado") was **removed** — an occurrence is an ordinary booking, so "Reagendar esta ocorrência" opens the same `15-reagendar` screen.

**Decisions (2026-10-03):**
1. **Only date and time change.** A `CUSTOMER_CHOICE` pick (staff, room, equipment) is **kept and shown read-only** (`15b`); there is no picker. Changing a pick = cancel and rebook. Automatic resources are not listed (they are re-resolved for the new window and an automatic room may change).
2. **The duration is kept.** No duration control, therefore **no price change and no quote preview** (the old S11 "recomputed quote before confirming" item no longer exists). `PATCH` carries `{ scheduledAt }` only — never `resourceSelections`/`durationMinutes`.
3. **Only `APPROVED` bookings** (the aggregate rejects any other status); a `PENDING` booking offers only "Cancelar". The button is hidden once the reschedule window has closed.
4. The booking **stays `APPROVED`** after a reschedule (no re-approval); the customer gets the `BookingRescheduled` email.

**Screens:** `15` default · `15b` kept picks (journey) · `15c` loading · `15d` no slots · `15e` fetch error · `15f` submitting · `15g` success · `15h` `409 BOOKING_SLOT_UNAVAILABLE` · `15i` `409 BOOKING_BUNDLE_PARTIALLY_UNAVAILABLE`/`BOOKING_LEG_UNAVAILABLE` · `15j` `422 BOOKING_RESCHEDULE_WINDOW_EXPIRED` · `15k` network/other (incl. `BOOKING_INVALID_TRANSITION`/`BOOKING_ALREADY_TERMINAL`). Entry: `02-agendamento-detail` ("Reagendar") and `06-reserva-recorrente` (each occurrence row).

**File map (❓ none exist yet — M23-S30):**

| File | Status |
|---|---|
| `apps/web/app/[slug]/my-account/bookings/[id]/reschedule/page.tsx` (thin) | ❓ Gap |
| `apps/web/features/booking/components/customer/CustomerReschedulePage.tsx` | ❓ Gap |
| `apps/web/features/booking/api/` — `rescheduleBookingAsCustomer` fetcher (`PATCH /bookings/:id/reschedule`) | ❓ Gap |

**To resolve at `/story-discovery M23-S30` (found while drawing — not decided here):**
- **Kept picks cannot be shown or pinned today.** `BookingLineResponse` exposes `assignedResourceName` only for `AUTO_ANY` and `itinerary` for legs; a `CUSTOMER_CHOICE` pick is not returned by `GET /bookings/:id` for the customer, so `15b`'s read-only list and the pinned availability query both need the customer booking read to expose the kept picks (names for display, ids for `resourceSelections`) — a backend/BFF change.
- **Availability for a reschedule.** The staff `RescheduleBookingPage` lists slots with `serviceIds` only, ignoring the booking's own occupancy and picks. For resource-scoped bookings the list must pin the kept picks and the kept duration (S29 params), and ideally ignore the booking's own current window (the commit already releases it inside the same transaction) — decide whether a read-side `excludeBookingId`-style parameter is needed.
- Confirm the `BookingRescheduled` customer email exists and its copy matches "Enviamos a confirmação por email".

**UX rules (docs audit, 2026-10-03):** a **"De … Para …" change summary** (current and newly chosen date/time) sits directly above "Confirmar novo horário" (`15`, `15b`); error text on a red tint is `#b91c1c` and hint text never below `opacity: .6`; on any error the focus moves to the alert (`role="alert"`).

**Error copy:** headlines are the catalogue texts (`BOOKING_SLOT_UNAVAILABLE`, `BOOKING_BUNDLE_PARTIALLY_UNAVAILABLE`, `BOOKING_LEG_UNAVAILABLE`, `BOOKING_RESCHEDULE_WINDOW_EXPIRED`); supporting lines are screen copy needing `web.json` keys in both locales. Error text on a fixed red tint uses `#dc2626`/`#991b1b` with fixed backgrounds (customer area, SaaS design system — no `--ba-*`).

## ❓ GAP — M24 Cluster 4 extension (UC-089–095, UC-102, not yet built)

> Relocated from `docs/discovery/multivertical-booking/prototype/customer-minhasturmas-*.html` and `customer-08*.html` — already implementation-grade (route tables, BFF contracts) per `docs/discovery/multivertical-booking/prototype/minha-conta-turmas-journey.md`, which this section carries forward. See `docs/02-DOMAIN_MODEL.md` § `ClassSessionBooking`/`RecurringEnrollment`, `docs/14-API_CONTRACTS.md` § Classes & Sessions.

**New prototype screens:**

| File | Screen | Production route (proposed) |
|---|---|---|
| `08-turmas-lista.html` | Minhas Turmas — lista de matrículas | `/{slug}/my-account/turmas` |
| `09-turma-detail.html` / `09b`/`09c`/`09d` | Detalhe da matrícula + variantes (série, waitlist, promovida) | `/{slug}/my-account/turmas/[id]` |
| `10-pular-sessao.html` / `10b` / `10c` | Pular sessão + sucesso + erro | `/{slug}/my-account/turmas/[id]/pular` |
| `11-cancelar-matricula.html` / `11b` | Cancelar matrícula + erro | `/{slug}/my-account/turmas/[id]/cancelar` |
| `12-waitlist-offer.html` / `12b` | Aceitar/recusar oferta de vaga + confirmação | same route as `09b`, inline action |

**File map (❓ none exist yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/components/account/MinhasTurmasPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/account/TurmaDetailPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/account/WaitlistOfferDecision.tsx` | ❓ Gap |

**BFF calls:** see the Cluster 4 section of `../../minha-conta.md` above.

**Important — read model reconciliation (carried forward from the discovery's own note, still unresolved):** the original prototype's `EnrollmentSession` interface is superseded — canonically, a recurring occurrence is its own `ClassSessionBooking` row (`seriesId` set, own `status`), and attendance lives on `ClassSessionAttendee.attendance`. "Pulou" is derived at display time (`status=CANCELLED AND seriesId!=null`), never a stored enum value. The implementing story must remove any obsolete interface rather than reconcile it.

**Open questions / gaps:**
- [ ] Stories for this extension live in `plan/M24-MULTIVERTICAL-CLASSES-SESSIONS.md`; each still begins with `/story-discovery`.
- [ ] Reposição (UC-102) has no implementation-grade prototype screen — the discovery-stage `customer-04d-reagendada.html` was never promoted to this rigor; design fresh from `10-pular-sessao.html`'s existing "reagendar" link, not copy that screen as-is.

### Screen 06 — window and resource notes (added with `M23-S08`, 2026-09-30)

- **The windows apply.** Skipping an occurrence is the ordinary customer cancel of its booking and rescheduling is the ordinary customer reschedule, so a refusal inside the tenant's cancellation / reschedule window is shown as `06e` / `06f`, worded like the one-off `03b` ("… com pelo menos N horas de antecedência", the deadline, and a contact-the-business hint). The "48 horas" in the prototype is the example value; the real number is the tenant's setting.
- **Occurrences are listed with `GET /bookings?recurringScheduleId=<id>`** and each row's actions call the ordinary booking cancel / reschedule (`PATCH /bookings/:id/cancel`, `PATCH /bookings/:id/reschedule`). There is no per-occurrence route any more.
- **The resource on each row is unresolved.** `06` draws "Sala Aurora" on every occurrence, but the customer booking list item carries no resource (`assignedResources` is staff-only). `M23-S12`'s discovery decides whether to add it for customers; until then the copy is illustrative. A row must never read the resource from the schedule's own assignment (it only records what was requested).
