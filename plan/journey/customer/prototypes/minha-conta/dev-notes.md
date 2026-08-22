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
| `06-minhas-turmas.html` | `/{slug}/my-account/turmas` | ⬜ GAP |
| `07-turma-detail.html` | `/{slug}/my-account/turmas/[enrollmentId]` | ⬜ GAP |
| `07b-turma-waitlist.html` | mesma rota — enrollment.status = WAITLIST | ⬜ GAP |
| `07d-waitlist-promovida.html` | mesma rota — pós-promoção, banner 24h | ⬜ GAP |
| `08-pular-sessao.html` | `/{slug}/my-account/turmas/[id]/pular` | ⬜ GAP |
| `08-pular-sessao-confirmado.html` | mesma rota — estado sucesso | ⬜ GAP |
| `08b-cancelar-matricula.html` | `/{slug}/my-account/turmas/[id]/cancelar` | ⬜ GAP |
| `08c-skip-error.html` | mesma rota de pular — estado erro rede/5xx | ⬜ GAP |
| `08d-cancelar-matricula-error.html` | mesma rota de cancelar — estado erro | ⬜ GAP |

---

## Minhas Turmas — seção nova (GAP)

> Adicionada 2026-08-21. Cobre o ciclo pós-inscrição em turmas: ver matrículas, acompanhar fila, pular sessões, cancelar. Para o fluxo de inscrição (antes desta seção), ver `reservar-aula/dev-notes.md`.

### Rotas

| Arquivo | Rota Next.js | Componente |
|---|---|---|
| `06-minhas-turmas.html` | `/{slug}/my-account/turmas` | `MinhasTurmasPage` |
| `07-turma-detail.html` | `/{slug}/my-account/turmas/[enrollmentId]` | `TurmaDetailPage` |
| `08-pular-sessao.html` | `/{slug}/my-account/turmas/[enrollmentId]/pular` | `PularSessaoPage` |
| `08b-cancelar-matricula.html` | `/{slug}/my-account/turmas/[enrollmentId]/cancelar` | `CancelarMatriculaPage` |

### BFF Calls (todas GAP)

| Screen | Call | Endpoint | Notes |
|---|---|---|---|
| Lista de turmas | `GET /v1/enrollments` | enrollment context | Filter: `status=ACTIVE,WAITLIST` — separação client-side |
| Detalhe | `GET /v1/enrollments/:id` | enrollment context | Ownership: 404 se `customerId ≠ JWT.sub` |
| Pular sessão | `POST /v1/enrollments/:id/skip-session` | body: `{ sessionId, reason?: string }` | 422 se sessão já passou ou já foi pulada |
| Cancelar matrícula | `DELETE /v1/enrollments/:id` | enrollment context | Soft delete — status → CANCELLED; libera vagas e notifica fila |

### Tipos

```ts
interface CustomerEnrollment {
  id: string;
  classType: { id: string; name: string; color: string; };
  type: 'DROP_IN' | 'SERIES';
  status: 'ACTIVE' | 'WAITLIST' | 'CANCELLED';
  enrolledAt: string;
  promotedAt?: string;          // WAITLIST → ACTIVE — usado para banner de 24h
  waitlistPosition?: number;    // derivado, só presente quando status = WAITLIST
  // SERIES
  slots?: { dayOfWeek: string; startTime: string; endTime: string; }[];
  sessions?: EnrollmentSession[];
  // DROP_IN
  session?: { startsAt: string; endsAt: string; location: string; instructorName: string; };
}

interface EnrollmentSession {
  id: string;
  startsAt: string;
  status: 'UPCOMING' | 'SKIPPED' | 'ATTENDED' | 'NO_SHOW';
}
```

### Separação client-side na lista (06)

```ts
const active    = enrollments.filter(e => e.status === 'ACTIVE');
const waitlisted = enrollments.filter(e => e.status === 'WAITLIST');
// Histórico: GET /v1/enrollments?status=CANCELLED — chamada separada, lazy
```

### Pular sessão — lógica (08)

1. Cliente seleciona a sessão que quer pular (lista de upcoming sessions do enrollment)
2. Informa motivo opcional
3. `POST /v1/enrollments/:id/skip-session` com `{ sessionId, reason }`
4. Backend marca `session.status = SKIPPED` e notifica o primeiro da fila daquela sessão
5. On 200 → navega para `08-pular-sessao-confirmado.html`
6. On erro rede/5xx → re-habilita form, preserva texto, banner vermelho (08c)

### Cancelar matrícula — lógica (08b)

1. Cliente acessa a página de confirmação (check explícito obrigatório antes do botão)
2. `DELETE /v1/enrollments/:id`
3. Backend seta `status = CANCELLED`, libera todas as vagas futuras, notifica fila
4. On 200 → redirect para `06-minhas-turmas.html`
5. On erro rede/5xx → reset do checkbox, banner vermelho, "Tentar novamente" (08d)

### Banner de promoção (07d)

Visível quando: `enrollment.status === 'ACTIVE' && enrollment.promotedAt && horasDesde(promotedAt) < 24`

```ts
const showPromoBanner =
  enrollment.status === 'ACTIVE' &&
  enrollment.promotedAt &&
  Date.now() - new Date(enrollment.promotedAt).getTime() < 24 * 60 * 60 * 1000;
```

Dismissível via botão ×. Dismissal é apenas local (não persiste no backend). Após 24h some automaticamente.
