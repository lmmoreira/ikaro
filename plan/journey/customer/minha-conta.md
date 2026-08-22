# CUSTOMER — Minha Conta (UC-006 + UC-007 + UC-016 summary)

**Actor(s):** CUSTOMER  
**Goal:** Logged-in customer views their booking history, checks loyalty balance, and cancels eligible bookings — all scoped to the current tenant  
**UCs covered:** UC-006, UC-007, UC-016 (balance summary + full breakdown), UC-023 (trigger), UC-005 A2 (authenticated customer path); Turmas section: CAND-25, CAND-27, CAND-28, CAND-38 (`docs/discovery/MULTI_VERTICAL_SCHEDULING_USECASES.md`)
**Status:** Mixed. Bookings/loyalty sections — Reviewed, implemented via `M13-S27`–`M13-S30` (all ✅ Done in `plan/M13-DASHBOARD-FRONTEND.md`). **Turmas section (added 2026-08-21) — Draft, discovery-complete prototype, no story/milestone yet** (❓ GAP throughout). See the promotion-status note in `docs/discovery/MULTI_VERTICAL_SCHEDULING.md` and `plan/journey/README.md`.

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Hotsite["/{slug}<br/>Hotsite (logged in)"] -->|"Clica 'Minha Conta' no nav"| MinhaConta
    BookingConfirm["/{slug}/booking<br/>Confirmação (UC-002 step 10)"] -->|"'Ver meus agendamentos'"| MinhaConta
    InfoEmail["E-mail de info solicitada<br/>(UC-005 main flow)"] -->|"Link direto → detalhe"| Detail

    MinhaConta["/{slug}/my-account<br/>Minha Conta"] --> LoyaltySummary["Cartão: pontos ativos + próxima expiração<br/>GET /v1/loyalty/balance"]
    LoyaltySummary -->|"Toca cartão"| LoyaltyFull["/{slug}/my-account/loyalty<br/>Minha Fidelidade (UC-016)"]
    MinhaConta --> AvatarMenu(("Avatar dropdown"))
    AvatarMenu -->|"'Trocar empresa'<br/>(2+ tenants apenas)"| SwitchTenant["/switch-tenant<br/>POST /v1/auth/switch-tenant"]
    SwitchTenant -->|"Sucesso"| NewTenant["Hotsite nova empresa"]
    MinhaConta --> BookingList["Seções de agendamentos<br/>GET /v1/bookings"]

    BookingList --> Upcoming["Próximos<br/>APPROVED · data ≥ hoje"]
    BookingList --> Pending["Pendentes<br/>PENDING · INFO_REQUESTED"]
    BookingList --> Past["Histórico<br/>COMPLETED · CANCELLED · REJECTED"]

    Upcoming -->|"Clica card"| Detail
    Pending -->|"Clica card"| Detail
    Past -->|"Clica card (read-only)"| Detail

    Upcoming -->|"Clica 'Cancelar' (dentro da janela)"| CancelPage["Página: Confirmar cancelamento<br/>(não é um sheet — página completa)"]
    Pending -->|"Clica 'Cancelar solicitação'"| CancelPage

    Detail["/{slug}/my-account/bookings/[id]<br/>Detalhe do Agendamento<br/>GET /v1/bookings/:id"] -->|"APPROVED · PENDING · INFO_REQUESTED<br/>→ botão Cancelar"| CancelPage

    Detail -->|"INFO_REQUESTED<br/>→ mostra mensagem do admin + form UC-005 A2"| InfoSubmit(("PATCH /v1/bookings/:id/submit-info"))
    InfoSubmit -->|"200 → status volta a PENDING"| Detail

    CancelPage -->|"Confirma"| CancelCall(("PATCH /v1/bookings/:id/cancel"))
    CancelCall -->|"200 → status CANCELLED"| MinhaConta
    CancelCall -->|"422 fora da janela (APPROVED)"| CancelError["Erro inline:<br/>'Cancelamento fora do prazo'"]

    MinhaConta -->|"Tab 'Turmas' (nav)"| MinhasTurmas["❓ GAP: /{slug}/my-account/turmas<br/>Minhas Turmas (06-minhas-turmas)"]
    MinhasTurmas -->|"Clica card ativo"| TurmaDetail
    MinhasTurmas -->|"Clica card em fila"| TurmaWaitlist["❓ GAP: mesma rota, status WAITLIST<br/>Fila de espera (07b-turma-waitlist)"]
    MinhasTurmas -->|"'Ver agenda de turmas'"| Catalog["❓ GAP: /{slug}/aulas<br/>(journey: reservar-aula.md)"]

    TurmaDetail["❓ GAP: /{slug}/my-account/turmas/[id]<br/>Detalhe (07-turma-detail)"] -->|"tipo série"| TurmaSerieDetail["❓ GAP: mesma rota, variante série<br/>(07c-turma-serie-detail)"]
    TurmaDetail -->|"'Pular' (sessão futura)"| PularSessao
    TurmaDetail -->|"'Cancelar matrícula'"| CancelarMatricula

    TurmaWaitlist -.->|"e-mail: vaga promovida<br/>(sistema, automático)"| Promovida["❓ GAP: banner por 24h no detalhe<br/>(07d-waitlist-promovida)"]
    Promovida --> TurmaDetail

    PularSessao["❓ GAP: .../pular<br/>Pular sessão (08-pular-sessao)"] -->|"Confirma"| PularOk(("PATCH /v1/enrollments/:id/skip-session"))
    PularOk -->|"200"| PularConfirmado["❓ GAP: mesma rota, sucesso<br/>(08-pular-sessao-confirmado)"]
    PularOk -->|"422 janela / erro rede/5xx"| PularErro["❓ GAP: mesma rota, erro<br/>(08c-skip-error)"]

    CancelarMatricula["❓ GAP: .../cancelar<br/>Cancelar matrícula (08b-cancelar-matricula)"] -->|"Confirma"| CancelMatriculaCall(("DELETE /v1/enrollments/:id"))
    CancelMatriculaCall -->|"200"| MinhasTurmas
    CancelMatriculaCall -->|"erro rede/5xx"| CancelMatriculaErro["❓ GAP: mesma rota, erro<br/>(08d-cancelar-matricula-error)"]

    class Hotsite,BookingConfirm,MinhaConta,Detail,CancelPage,LoyaltyFull,SwitchTenant,NewTenant existing
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/{slug}` (hotsite, logged-in nav) | `HotsiteLayout` logged-in state | M12 | ✅ Existente |
| `/{slug}/booking` (post-booking CTA) | `BookingForm` / confirmation | M12-S07 | ✅ Existente |
| `/{slug}/my-account` | `MinhaContaPage` | M13-S27 | ✅ Existente |
| `/{slug}/my-account/bookings/[id]` | `AgendamentoDetailPage` | M13-S28 | ✅ Existente |
| Cancel confirmation — full page, not a sheet | dedicated `.../bookings/[id]/cancel` page | M13-S28 | ✅ Existente |
| Info submit form (UC-005 A2) | inline section on detail page (customer auth path) | M13-S28 | ✅ Existente |
| `/{slug}/my-account/loyalty` | `MinhaFidelidadePage` | M13-S29 | ✅ Existente |
| Tenant switch modal/page (UC-023) | `TrocarEmpresaPage` — avatar dropdown trigger | M13-S30 | ✅ Existente |
| `/{slug}/my-account/turmas` | `MinhasTurmasPage` | — | ❓ GAP |
| `/{slug}/my-account/turmas/[enrollmentId]` | `TurmaDetailPage` | — | ❓ GAP |
| `/{slug}/my-account/turmas/[enrollmentId]/pular` | `PularSessaoPage` | — | ❓ GAP |
| `/{slug}/my-account/turmas/[enrollmentId]/cancelar` | `CancelarMatriculaPage` | — | ❓ GAP |

## BFF calls in this flow

| Call | When | Roles |
|---|---|---|
| `GET /v1/bookings` | Minha-conta page load — full booking list | CUSTOMER (filtered to own bookings) |
| `GET /v1/loyalty/balance` | Minha-conta page load — points card | CUSTOMER |
| `GET /v1/loyalty/entries` | Fidelidade page — earning history (paginated) | CUSTOMER |
| `GET /v1/loyalty/redemptions` | Fidelidade page — redemption history (paginated) | CUSTOMER |
| `POST /v1/auth/switch-tenant { targetTenantId }` | UC-023 — customer selects new tenant | CUSTOMER |
| `GET /v1/bookings/:id` | Detail page load | CUSTOMER (ownership enforced) |
| `PATCH /v1/bookings/:id/cancel` | Customer confirms cancel — BFF routes to `/cancel-customer` | CUSTOMER |
| `PATCH /v1/bookings/:id/submit-info` | Customer submits info on INFO_REQUESTED booking (UC-005 A2) | CUSTOMER |
| `GET /v1/enrollments?status=ACTIVE,WAITLIST` | Minhas Turmas — page load | CUSTOMER (filtered to own enrollments) |
| `GET /v1/enrollments/:id` | Detalhe da matrícula | CUSTOMER (ownership enforced — 404 if `customerId ≠ JWT.sub`) |
| `PATCH /v1/enrollments/:id/skip-session` | Pular sessão (`{ sessionId, reason?: string }`) | CUSTOMER |
| `DELETE /v1/enrollments/:id` | Cancelar matrícula (soft delete → CANCELLED) | CUSTOMER |

## Section logic (UC-006 step 1)

| Section | Statuses shown | Date filter | Action |
|---|---|---|---|
| **Próximos** | APPROVED | `scheduledAt ≥ today` | Cancel button (if within window) |
| **Pendentes** | PENDING, INFO_REQUESTED | any | "Cancelar solicitação" always shown |
| **Histórico** | COMPLETED, CANCELLED, REJECTED | any | Read-only; no action |

Cancel button visibility for **Próximos** (APPROVED): hidden with note when `scheduledAt − now() < tenants.settings.booking.cancellation_window_hours` (UC-006 A2).

## Open questions / gaps

- [ ] **"Total washes completed" + "Most recently completed service" (UC-006 step 6):** `GET /v1/loyalty/balance` returns only `{ currentPoints, nextExpiryDate, nextExpiryPoints }`. Neither "total washes" nor "last service" is available from this endpoint. Options: (a) add fields to balance endpoint, (b) derive from `GET /v1/loyalty/entries` pagination `total` + first entry's `serviceName`, (c) drop from MVP minha-conta. Decide before `M13-S27` starts.
- [ ] **`CustomerBookingListResponse` DTO missing from `packages/types/src/`:** only a backend-internal `BookingListItem` exists. Add to `packages/types/` in `M13-S27`.
- [ ] **UC-005 A2 scope:** should the info submission form live in this journey's detail page or a separate journey? Recommendation: include it inline in `M13-S28` (detail page) since the customer reaches it from "My Bookings" — it's not a separate navigation destination.
- [x] **Post-cancel destination:** after successful cancel from the detail page, navigate back to `/{slug}/my-account` list (recommended) or show inline CANCELLED state on the detail page and let the customer navigate back manually? — **Resolved.** Redirects to the my-account list, implemented in `M13-S28`.
- [ ] **Empty state CTA (UC-006 A1):** when customer has no bookings, what does the CTA say? "Fazer um agendamento" → `/{slug}/booking`?
- [ ] **`GET /v1/bookings` query params for customer:** the existing endpoint accepts `status` filter. Should the frontend call it once (all statuses) and split client-side, or call it three times (one per section)? Single call + client split is simpler.
- [x] **Pagination:** UC-006 doesn't specify pagination behaviour. The backend supports `limit`/`offset`. — **Resolved.** `limit=50`, no infinite scroll, implemented in `M13-S27`.
- [x] **Loyalty conversion-rate display (`04-fidelidade.html` balance card):** shows a points→currency conversion rate ("10 pts = R$ 1,00 · Valor total: R$ 12,00"), gated on `points_per_currency_unit > 0`. — **Resolved/shipped.** The real `LoyaltyPage.tsx` renders this conversion row exactly when `balance.conversionRate > 0`, matching the prototype. Not cut from MVP.
- [ ] **Turmas section (added 2026-08-21): no story/milestone exists for any of these routes.** Needs `/discovery-to-milestone` before implementation — see the promotion-status note in `docs/discovery/MULTI_VERTICAL_SCHEDULING.md`.
- [x] **Waitlist promotion:** automatic, no accept step — resolved, `MULTI_VERTICAL_SCHEDULING.md` §9 item 15/16.
- [x] **Skip-session minimum-notice window:** dedicated `classSkipWindowHours`, separate from `classCancellationWindowHours` — resolved 2026-08-21, `CAND-27` A3.
- [ ] **Reposição (`CAND-38`) has no prototype screen in this folder yet.** It's `customer-04d-reagendada.html` under `docs/discovery/MULTI_VERTICAL_SCHEDULING/prototype/` — a discovery-stage screen, not built to this folder's implementation-grade bar. Needs its own prototype pass here (linked from `08-pular-sessao.html`) before a story can be written for it.
- [ ] **`07d-waitlist-promovida.html`'s 24h banner window** ("shown while `promotedAt < 24h atrás`") is checked client-side on the enrollment's own GET response — confirm this is sufficient or needs a dedicated "unseen promotion" flag server-side.
- [ ] **`dev-notes.md`'s `EnrollmentSession` interface (`UPCOMING\|SKIPPED\|ATTENDED\|NO_SHOW`) has no equivalent in the canonical model and needs replacing, not reconciling** — canonically, a recurring occurrence is its own `ClassSessionBooking` row (`seriesId` set, own `status`), and attendance lives on `ClassSessionAttendee.attendance` (`PRESENT\|NO_SHOW`). "Pulou" is derived at display time (`status=CANCELLED AND seriesId≠null`), not a stored enum value.
- [ ] **`dev-notes.md`'s "Pular sessão — lógica" section ("Backend marca `session.status = SKIPPED`") predates and doesn't reflect either 2026-08-21 decision**: no mention of the `classSkipWindowHours` notice check (`CAND-27` A3), and no mention of the `CAND-38` reschedule alternative. Needs a rewrite once this journey is promoted, not just a schema update.
- [ ] Same `ClassType`/`Enrollment` naming reconciliation flagged in `reservar-aula.md`'s open questions applies here too (`classType` field on `CustomerEnrollment`, the `type: DROP_IN | SERIES` split) — one fix, shared by both journeys.

## Prototype

Folder: `customer/prototypes/minha-conta/`

| File | Screen | UC | Story | Status |
|---|---|---|---|---|
| `index.html` | Navigation hub | — | — | ✅ Criado |
| `00-hotsite-logged-in.html` | Hotsite logged-in state (entry point) | — | — | ✅ Criado |
| `01-minha-conta.html` | Minha Conta — booking list + loyalty strip (clickable) | UC-006 | M13-S27 | ✅ Criado |
| `01b-minha-conta-empty.html` | Minha Conta — estado vazio (nenhum agendamento) | UC-006 A1 | M13-S27 | ✅ Criado |
| `02-agendamento-detail.html` | Detalhe do Agendamento (APPROVED/PENDING) | UC-006 step 5 | M13-S28 | ✅ Criado |
| `02b-agendamento-info-requested.html` | Detalhe — INFO_REQUESTED + form de resposta | UC-005 A2 | M13-S28 | ✅ Criado |
| `02c-agendamento-historico.html` | Detalhe — COMPLETED (read-only, sem ações) | UC-006 step 5 | M13-S28 | ✅ Criado |
| `02d-info-sent.html` | Detalhe — após envio de resposta (booking volta a PENDING) | UC-005 A2 | M13-S28 | ✅ Criado |
| `02e-submit-error.html` | Detalhe — erro ao enviar resposta (rede/5xx no PATCH submit-info) | UC-005 A2 | M13-S28 | ✅ Criado |
| `03-cancel-confirm.html` | Sheet de confirmação de cancelamento | UC-007 | M13-S28 | ✅ Criado |
| `03b-cancel-error.html` | Erro — cancelamento fora da janela de prazo | UC-007 A1 | M13-S28 | ✅ Criado |
| `04-fidelidade.html` | Minha Fidelidade — saldo + tabs ganhos/resgates | UC-016 | M13-S29 | ✅ Criado |
| `04b-fidelidade-empty.html` | Fidelidade — estado vazio (0 pontos) | UC-016 | M13-S29 | ✅ Criado |
| `05-trocar-empresa.html` | Trocar empresa — seleção de tenant (UC-023 trigger) | UC-023 | M13-S30 | ✅ Criado |
| `06-minhas-turmas.html` | Minhas Turmas — lista de matrículas | CAND-25/27/28 | — | ❓ GAP |
| `07-turma-detail.html` | Detalhe da matrícula (turma fixa) | CAND-27 | — | ❓ GAP |
| `07b-turma-waitlist.html` | Detalhe — status WAITLIST | CAND-24/25 | — | ❓ GAP |
| `07c-turma-serie-detail.html` | Detalhe — variante série com fim | CAND-27 | — | ❓ GAP |
| `07d-waitlist-promovida.html` | Detalhe — banner pós-promoção (24h) | CAND-25 | — | ❓ GAP |
| `08-pular-sessao.html` | Pular sessão — form | CAND-27 | — | ❓ GAP |
| `08-pular-sessao-confirmado.html` | Pular sessão — sucesso | CAND-27 | — | ❓ GAP |
| `08b-cancelar-matricula.html` | Cancelar matrícula — confirmação | CAND-28 | — | ❓ GAP |
| `08c-skip-error.html` | Pular sessão — erro (janela/rede) | CAND-27 | — | ❓ GAP |
| `08d-cancelar-matricula-error.html` | Cancelar matrícula — erro | CAND-28 | — | ❓ GAP |
| `dev-notes.md` | Implementation handoff | — | M13-S27–M13-S30; Turmas section — | ✅ Criado |

## Discovery reconciliation — required before implementation

The automatic-promotion banner is superseded by the actionable offer lifecycle `WAITLISTED → PROMOTION_PENDING → CONFIRMED|CANCELLED`. The customer must see deadline, group quantity, accept/decline and expiry states.

The read model is derived from canonical `RecurringEnrollment`, `ClassSessionBooking`, and attendee attendance. It may simplify display, but must not persist obsolete `EnrollmentSession` statuses. The skip flow uses `classSkipWindowHours`, describes a waitlist **offer** rather than automatic confirmation, and offers a make-up only when contract, date window and monthly cap permit it.
