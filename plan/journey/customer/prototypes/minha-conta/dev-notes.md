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

## ❓ GAP — M21 Cluster 3 extension (UC-070, UC-072, UC-076, not yet built)

> Everything above is shipped. Everything below is new, unimplemented scope promoted from `docs/discovery/multivertical-booking/`. See `docs/02-DOMAIN_MODEL.md` § `RecurringBookingSchedule`/`AvailabilityAlert`, `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules / Availability Alerts.

**New prototype screens (relocated from the discovery folder):**

| File | Screen | Production route (proposed) | Story |
|---|---|---|---|
| `06-reserva-recorrente.html` | Manage a standing recurring reservation | `/{slug}/my-account/recurring-reservations/[id]` | ❓ Gap |
| `06b-reserva-recorrente-erro.html` | Future-pattern conflict at creation | same route | ❓ Gap |
| `06c-recorrente-em-analise.html` | Recurring request pending manual approval | same route | ❓ Gap |
| `07-availability-alert.html` | Create/manage an availability alert | `/{slug}/my-account/alerts` | ❓ Gap |

**File map (❓ none exist yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/components/account/RecurringPrivateReservationManager.tsx` | ❓ Gap |
| `apps/web/features/booking/components/account/AvailabilityAlertForm.tsx` | ❓ Gap |

**BFF calls:**
```
GET/POST/PATCH  /recurring-booking-schedules[/:id]           -- UC-070
POST            /recurring-booking-schedules/:id/pause|end    -- UC-070 A2
POST/GET/PATCH/DELETE  /availability-alerts[/:id]              -- UC-072, UC-076
```

**Open questions / gaps:**
- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] Nav placement (new top-level tab vs. folded into existing Agendamentos) is a UI decision for the implementing story.

---

## ❓ GAP — M21 Cluster 4 extension (UC-089–095, UC-102, not yet built)

> Relocated from `docs/discovery/multivertical-booking/prototype/customer-minhasturmas-*.html` and `customer-08*.html` — already implementation-grade (route tables, BFF contracts) per `docs/discovery/multivertical-booking/minha-conta-turmas-journey.md`, which this section carries forward. See `docs/02-DOMAIN_MODEL.md` § `ClassSessionBooking`/`RecurringEnrollment`, `docs/14-API_CONTRACTS.md` § Classes & Sessions.

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
- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] Reposição (UC-102) has no implementation-grade prototype screen — the discovery-stage `customer-04d-reagendada.html` was never promoted to this rigor; design fresh from `10-pular-sessao.html`'s existing "reagendar" link, not copy that screen as-is.
