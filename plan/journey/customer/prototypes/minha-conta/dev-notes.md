# Dev Notes — Customer: Minha Conta

Journey spec: `customer/minha-conta.md`  
Stories: M12X-S01 (list page) · M12X-S02 (detail + cancel + info-submit)

---

## Routes

| File | Next.js Route | Component |
|---|---|---|
| `shared/customer-dashboard.html` | `/{slug}/minha-conta` (Início tab) | `MinhaContaPage` |
| `01-minha-conta.html` | `/{slug}/minha-conta` (Agendamentos tab) | `MinhaContaPage` |
| `02-*.html` | `/{slug}/minha-conta/agendamentos/[id]` | `AgendamentoDetailPage` |

Both tabs live on the same `/{slug}/minha-conta` route — tab state is managed client-side (not separate routes for MVP).

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

## Missing types (open question from journey spec)

`CustomerBookingListResponse` does not exist in `packages/types/src/`. Needs to be added in M12X-S01:

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

## File map — per-screen status

| File | Production target | Status |
|---|---|---|
| `00-hotsite-logged-in.html` | `shared/hotsite-logged-in.html` (entry point) | ❌ GAP |
| `01-minha-conta.html` | `/{slug}/minha-conta` (Agendamentos tab) | ❌ GAP — M12X-S01 |
| `01b-minha-conta-empty.html` | `/{slug}/minha-conta` — empty state (UC-006 A1) | ❌ GAP — M12X-S01 |
| `02-agendamento-detail.html` | `/{slug}/minha-conta/agendamentos/[id]` (APPROVED/PENDING) | ❌ GAP — M12X-S02 |
| `02b-agendamento-info-requested.html` | same route — INFO_REQUESTED + response form | ❌ GAP — M12X-S02 |
| `02c-agendamento-historico.html` | same route — COMPLETED (read-only) | ❌ GAP — M12X-S02 |
| `02d-info-sent.html` | same route — inline state after successful submit-info | ❌ GAP — M12X-S02 |
| `02e-submit-error.html` | same route — inline state after failed submit-info | ❌ GAP — M12X-S02 |
| `03-cancel-confirm.html` | `CancelSheet` bottom sheet | ❌ GAP — M12X-S02 |
| `03b-cancel-error.html` | `CancelErrorState` inline (UC-007 A1) | ❌ GAP — M12X-S02 |
| `04-fidelidade.html` | `/{slug}/minha-conta/fidelidade` | ❌ GAP — M126-S03 |
| `04b-fidelidade-empty.html` | same route — empty state (0 points) | ❌ GAP — M126-S03 |
| `05-trocar-empresa.html` | tenant-switch modal/page (UC-023) | ❌ GAP — M124-S02 |

No screen in this prototype maps to an already-`EXISTS` production component — the entire Minha Conta area is net-new (M12X/M126/M124 stories).
