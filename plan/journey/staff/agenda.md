# STAFF — Agenda (Booking Queue & Lifecycle Management)

**Actor(s):** STAFF | MANAGER  
**Goal:** Review the daily booking queue, action each request — approve, reject, or request more information — and manage an approved booking through to completion, cancellation, or reschedule  
**UCs covered:** UC-003, UC-004, UC-005, UC-008, UC-009 (incl. A6 — loyalty redemption during completion) · UC-070 (staff creating a recurrence on a customer's behalf), UC-071, UC-074, UC-108 (staff creating a one-off booking on a customer's behalf) (M23 Cluster 3 — UC-074 appointment no-show ✅ Criado by M23-S27; ❓ Gap for recurring-schedule creation on behalf + approval)  
**Status:** Reviewed — lifecycle screens built in `M13-S19`/`M13-S20`; the M23 extensions are partly built (see the ❓ Gap items below)

> Note: the lifecycle screens referenced here were later implemented in M13-S19 and M13-S20; this document remains the prototype and journey reference.
>
> Validation note (2026-06-29): `apps/web/e2e/staff-booking-lifecycle.spec.ts` now covers the queue card detail shortcut, quick approve, reject, request info, complete success, reschedule success, and cancel success flows.

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Start(["Dashboard /{slug}/dashboard"]) --> Queue["/dashboard/bookings<br/>Booking Queue"]
    Queue --> CardClick(("Click booking card"))
    CardClick --> Detail["/dashboard/bookings/[id]<br/>Booking Detail"]

    Detail --> StatusBranch{"Status?"}
    Detail -->|"has an open 'Reservas a resolver' entry (M23-S46)"| Marked["🆕 banner 'Precisa de decisão' (03j / 03k):<br/>MANAGER → decision panel Reatribuir · Reagendar · Cancelar<br/>STAFF → 'Peça a um gerente', no actions<br/>(see manager/scheduling-exceptions.md)"]

    StatusBranch -->|"PENDING / INFO_REQUESTED"| ActionChoice{"Ação"}

    ActionChoice -->|"UC-003 Aprovar"| ApproveBtn(("Click Aprovar"))
    ApproveBtn --> SlotCheck{"409 Conflict?"}
    SlotCheck -- "não → PATCH 200" --> ApproveSuccess["estado inline<br/>PENDING → APPROVED<br/>toast verde + badge atualiza"]
    SlotCheck -- "sim → 409" --> SlotConflict["estado de erro inline<br/>Mostra slots adjacentes livres"]
    SlotConflict --> AltSlot(("Seleciona slot alternativo"))
    AltSlot --> ApproveSuccess

    ActionChoice -->|"UC-004 Rejeitar"| RejectBtn(("Click Rejeitar"))
    RejectBtn --> RejectSheet["Bottom sheet<br/>Motivo (≥ 10 chars)"]
    RejectSheet --> RejectValid{"reason ≥ 10?"}
    RejectValid -- não --> RejectSheet
    RejectValid -- sim --> RejectSubmit(("Confirmar rejeição"))
    RejectSubmit --> RejectSuccess["estado inline<br/>PENDING → REJECTED<br/>toast vermelho + badge"]

    ActionChoice -->|"UC-005 Pedir info"| InfoBtn(("Click Pedir info"))
    InfoBtn --> InfoSheet["Bottom sheet<br/>Texto da pergunta"]
    InfoSheet --> InfoSubmit(("Enviar pergunta"))
    InfoSubmit --> InfoSuccess["estado inline<br/>PENDING → INFO_REQUESTED<br/>badge azul"]

    ApproveSuccess --> Back(("Voltar à agenda"))
    RejectSuccess --> Back
    InfoSuccess --> Back

    StatusBranch -->|"APPROVED"| ApprovedActionChoice{"Ação"}

    ApprovedActionChoice -->|"UC-009 Marcar concluído"| CompleteBtn(("Click Marcar concluído"))
    CompleteBtn --> CompleteSheet["MarkCompleteBookingPage<br/>Ajusta preço cobrado por linha<br/>+ faixa de fidelidade (UC-009 A6)<br/>+ upload fotos + notas"]
    CompleteSheet --> LoyaltyChoice{"Usar pontos?<br/>(se customerId + points_per_currency_unit > 0)"}
    LoyaltyChoice -->|"Não"| CompleteSubmit(("Confirmar conclusão"))
    LoyaltyChoice -->|"Sim — UC-009 A6"| PointsInput(("Insere pontos / Usar todos"))
    PointsInput --> CompleteSubmit
    CompleteSubmit --> CompleteSuccess["estado inline<br/>APPROVED → COMPLETED<br/>resumo cotado vs cobrado + desconto pontos"]

    ApprovedActionChoice -->|"UC-008 Cancelar"| AdminCancelBtn(("Click Cancelar"))
    AdminCancelBtn --> AdminCancelSheet["AdminCancelBookingSheet<br/>Motivo (opcional)"]
    AdminCancelSheet --> AdminCancelSubmit(("Confirmar cancelamento"))
    AdminCancelSubmit --> AdminCancelSuccess["estado inline<br/>APPROVED → CANCELLED<br/>toast vermelho"]

    ApprovedActionChoice -->|"UC-008 A1 Reagendar"| RescheduleBtn(("Click Reagendar"))
    RescheduleBtn --> RescheduleCalendar["RescheduleBookingPage<br/>Seleciona novo slot no calendário"]
    RescheduleCalendar --> RescheduleSlotCheck{"Novo slot livre?"}
    RescheduleSlotCheck -- "não → 409" --> RescheduleConflict["estado de erro<br/>Sugere slots alternativos"]
    RescheduleConflict --> RescheduleCalendar
    RescheduleSlotCheck -- "sim → PATCH 200" --> RescheduleSuccess["estado inline<br/>scheduledAt atualizado<br/>permanece APPROVED"]

    CompleteSuccess --> Back
    AdminCancelSuccess --> Back
    RescheduleSuccess --> Back

    Back --> Queue

    class Queue,Detail,SlotConflict,ApproveSuccess,RejectSuccess,InfoSuccess,CompleteSheet,CompleteSuccess,AdminCancelSheet,AdminCancelSuccess,RescheduleCalendar,RescheduleConflict,RescheduleSuccess existing
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/dashboard/bookings` | `BookingQueuePage` | M125-S03 | ✅ Done |
| `/dashboard/bookings/[id]` | `BookingDetailPage` + `BookingActionPanel` | M125-S05 | ✅ Done |
| Slot conflict inline state | `SlotConflictAlert` within `BookingActionPanel` | M125-S05 | ✅ Done |
| Approve success inline state | inline banner within `BookingDetailPage` | M125-S05 | ✅ Done |
| Reject bottom sheet | `RejectBookingSheet` within `BookingDetailPage` | M125-S05 | ✅ Done |
| Request info bottom sheet | `RequestInfoSheet` within `BookingDetailPage` | M125-S05 | ✅ Done |
| Mark-complete screen | `MarkCompleteBookingPage` (per-line `actualPriceCharged` override + loyalty redemption strip UC-009 A6 + after-photo upload + notes) | M13 | ✅ Done |
| Complete success inline state | inline banner within `BookingDetailPage` (shows per-line cotado vs cobrado + optional loyalty discount row) | M13 | ✅ Done |
| Admin cancel bottom sheet | `AdminCancelBookingSheet` within `BookingDetailPage` | M13 | ✅ Done |
| Reschedule screen | `RescheduleBookingPage` (reuses UC-011 availability calendar) | M13 | ✅ Done |
| Reschedule slot-conflict state | inline within `RescheduleBookingPage` | M13 | ✅ Done |

## Open questions / gaps

- [x] **Success state UX** — **Resolved.** The admin stays on the detail page after approval; production renders the inline success banner in place (no navigation). The prototype shows `02-approve-success.html` as a separate page only for review clarity — see its `STATE`/`PROTOTYPE` HTML comment, which states "same page, no navigation" explicitly. The aside panel's only action is "Voltar à agenda", a manual back-link, not an auto-redirect.
- [x] **Reject/info success** — **Resolved.** Same pattern as approval: after REJECTED or INFO_REQUESTED, the admin stays on the detail page with an inline banner (`01c-reject-success.html`, `01d-info-success.html`) and a manual "Voltar à agenda" link — no auto-navigate. The same pattern is also used for cancel (`03b-cancel-success.html`), complete (`04b-complete-success.html`), and reschedule (`05c-reschedule-success.html`), confirming this is the system-wide convention for every booking-lifecycle action, not just approve.
- [x] **Queue scope** — **Resolved 2026-06-16; the filter sentence below was superseded 2026-10-08 by M23-S13 (see the M23 section).** Grouped by urgency, not by date: "Precisa de ação" (ALL PENDING + INFO_REQUESTED, any date, sorted by `scheduledAt`) → "Hoje" (today's APPROVED, actionable) → "Próximos dias" (future APPROVED, read-only glance, no quick actions). The previous date-first grouping split same-kind triage work across day sections (a PENDING booking for tomorrow was separated from today's PENDING items). Decorative filter tabs (Pendentes/Info solicitada/Confirmados/Todos) were removed — the sections themselves were the filter. *(2026-10-08: once recurrence requests join "Precisa de ação" the sections can no longer tell the two kinds apart, so M23-S13 adds one real, floating "Filtrar agenda" balloon — not tabs — that shows or hides the four blocks.)*
- [ ] **Queue real-time updates** — polling interval or WebSocket? Two staff members might be viewing the same booking simultaneously.
- [ ] **Slot conflict suggestion count** — prototype shows 3 adjacent free slots. Is 3 the right number? What if all remaining slots in the day are taken?
- [ ] **Notification on approve** — `BookingApproved` event triggers email to customer. Confirm the "email enviado" note in the success banner is accurate for the MVP notification flow.
- [ ] **INFO_REQUESTED → PENDING re-entry** — UC-005 Alt flow A2 (customer submits info) is handled in `customer/` and `guest/` journeys. Confirm: does the booking return to the PENDING queue automatically when the customer responds, or must staff re-find it manually?
- [x] **Queue surfacing of APPROVED bookings** — **Resolved 2026-06-16** by the "Hoje" and "Próximos dias" sections above — see `00-agenda.html`.
- [x] **Week-strip click target for future days** — **Resolved by the shipped page (redrawn 2026-10-14):** picking a day in `WeekNav` filters the "Próximos dias — confirmados" section to that day (title becomes "Próximos dias — dd/mm", cards are emphasized; clicking the day again clears it). It does not touch "Precisa de ação" (PENDING bookings of any date stay there).
- [ ] **Mark-complete UX** — per-line `actualPriceCharged` override: inline editable fields next to each line (as shown in UC-009's doc example), or a separate "review charges" step before confirming? Photo upload — does it reuse the same upload component as the guest/customer "before" photos (UC-001 step 8)?
- [x] **Reschedule calendar reuse** — does `RescheduleBookingPage` reuse the guest/customer booking flow's `AvailabilityCarousel` + `SlotPicker` (UC-011), or does staff need a simplified version? — **Resolved.** Confirmed reused; reschedule duration is frozen at the existing booking's `totalDurationMins` (no basket/duration recompute) (`M13-S19`).
- [x] **Admin cancel reason validation** — backend `CancelBookingAsAdminBody.reason` is optional with no minimum length (unlike UC-004 Reject's required ≥10 chars). — **Resolved.** Genuinely optional, no minimum length, confirmed against `CancelBookingAsAdminBody` (`M13-S19`).
- [ ] **Cancel vs. Reschedule entry point** — does the Detail page show both "Cancelar" and "Reagendar" as equally-weighted buttons, or is one primary and the other a secondary/menu action (to avoid accidental cancellation of a confirmed booking)?

## Prototype

Folder: `staff/prototypes/agenda/`

| File | Screen | UC | Story | Status |
|---|---|---|---|---|
| `index.html` | Navigation hub + validation checklist | — | — | ✅ Criado |
| `00-agenda.html` | Booking queue — an **exact copy of the shipped page** (redrawn 2026-10-14 after drifting): `WeekNav`, "+ Novo" (Agendamento only), "Precisa de ação" (PENDING + INFO_REQUESTED, any date) → "Hoje — confirmados" → "Próximos dias — confirmados", real `BookingCard` | UC-003, UC-008, UC-009 | M13-S19 | ✅ Criado |
| `00c-agenda-s13.html` | Booking queue — **planned target of M23-S13**: the same screen plus the "Recorrência" card, the "Filtrar agenda" balloon and the "Recorrência" entry of "+ Novo" (M23-S19). Folded into `00-agenda.html` and deleted when S13 ships | UC-071, UC-070 | M23-S13 · M23-S19 | ❓ Gap (M23 extension) |
| `01-booking-detail.html` | Booking detail + inline Reject/Info bottom sheets. **Redrawn 2026-10-15** with the new cards (resources, itinerary, participants, intake, notes, addresses, origin) switched by `?forma=` — the new cards are ❓ Gap, see "Full booking detail" below | UC-003, UC-004, UC-005 | M125-S05 | ✅ Criado (base) · ❓ Gap (new cards) |
| `01b-slot-conflict.html` | Slot conflict error + adjacent slot picker | UC-003 Alt A1 | M125-S05 | ✅ Criado |
| `01c-reject-success.html` | Reject success inline state (actionState = 'rejected') | UC-004 | M125-S05 | ✅ Criado |
| `01d-info-success.html` | Info-request success inline state (actionState = 'info-requested') | UC-005 | M125-S05 | ✅ Criado |
| `02-approve-success.html` | Approval success (prototype page; production = inline) | UC-003 | M125-S05 | ✅ Criado |
| `00-agenda-next.html` | Booking queue — the next `welcomeStaffScreenDays` window (reached with ›): no "Hoje" section, "Próximos dias" starts at the window's first day | — | — | ✅ Criado |
| `03-booking-detail-approved.html` | Booking detail, APPROVED state (Cancel/Complete/Reschedule actions); same `?forma=` cards as `01` | UC-008, UC-009 | — | ✅ Criado (base) · ❓ Gap (new cards) |
| `03b-cancel-success.html` | Cancel success inline state, triggered from `03-booking-detail-approved.html` | UC-008 | — | ✅ Criado |
| `04-mark-complete.html` | Mark complete flow | UC-009 | — | ✅ Criado |
| `04b-complete-success.html` | Completion confirmed inline state | UC-009 | — | ✅ Criado |
| `05-reschedule.html` | Reschedule flow | UC-008 Alt A1 | — | ✅ Criado |
| `05b-reschedule-conflict.html` | Reschedule Alt A2 — new slot became unavailable on confirm | UC-008 Alt A2 | — | ✅ Criado |
| `05c-reschedule-success.html` | Reschedule confirmed inline state | UC-008 Alt A1 | — | ✅ Criado |
| `08-recurring-schedule-approval.html` | Detail of a recurring-schedule request — details centred, action panel on the right (desktop) / bottom action bar (mobile), approve and reject confirmation sheets; the resource rows follow the service shape (`#simples`, `#um`, `#pacote`, redrawn 2026-10-15). Same shell as `01-booking-detail.html` | UC-071 | M23-S13 | ❓ Gap (M23 Cluster 3) |
| `08b-recurring-approval-result.html` | Inline result states of the detail page (banner on top, data kept, action panel swapped, as in `04b`): approved, rejected, 409 conflict list, 409 already decided/expired, 422 customer has no phone, network/5xx | UC-071 | M23-S13 | ❓ Gap (M23 Cluster 3) |
| `09-escolher-cliente.html` | **Shared customer chooser** for everything staff creates on a customer's behalf (`?tipo=agendamento` or `recorrencia`): *Cliente cadastrado* (search by name, e-mail or phone; recent; no result; search error) and *Novo contato* (name, phone, e-mail, all required → guest booking; disabled for a recurrence) | UC-108, UC-070 | M23-S40 · M23-S19 | ✅ Criado — M23-S40 (the Recorrência mode is consumed by M23-S19) |
| `10-novo-agendamento.html` | Novo agendamento — the public flow's steps in the dashboard skin (the public step engine: services, a picker per requirement that needs a choice — per leg for a legged service —, duration, date/time, intake, confirm; the step count depends on the basket and there is no personal step; "Passo 1 de 3" is the simplest case), summary and actions in the right pane; staff see slots inside the minimum notice. The picker, duration, intake, pickup and itinerary steps are built as dashboard views of the public steps, not drawn here (decided 2026-10-13) | UC-108 | M23-S40 | ✅ Criado — M23-S40 |
| `10b-novo-agendamento-resultado.html` | Inline outcomes: created `APPROVED`, 409 slot taken, outside the window, customer without phone, customer not found, network/5xx | UC-108 | M23-S40 | ✅ Criado — M23-S40 |
| `09b-nova-recorrencia-padrao.html` | Nova recorrência — padrão (serviço, recursos, dias, horário, período) para o cliente escolhido, com **variantes** por forma de serviço (`#simples`, `#padrao` sem campo de recurso, `#pacote` / `#pacote-duas` com um grupo por requisito de escolha e uma linha para cada automático, `#pacote-falta`, `#opcoes`) e por recusa do padrão (`#erros`, `#recusa`, `#sem-ocorrencia`) e de lista vazia (`#sem-servicos`, `#sem-elegivel`). Redesenhada em 2026-10-15 após o TD49 | UC-070 | M23-S19 | ❓ Gap (M23 Cluster 3) |
| `09c-nova-recorrencia-resultado.html` | Desfechos: criada, aguardando aprovação, conflito, limite, cliente sem telefone, cliente não encontrado, falha (resumo por forma de serviço: `?forma=simples\|padrao\|pacote`) | UC-070 | M23-S19 | ❓ Gap (M23 Cluster 3) |
| `03-booking-detail-approved.html` — "Marcar não compareceu" (extended) | Nova ação + bottom sheet (motivo opcional) no detalhe de um agendamento aprovado | UC-074 | M23-S09 (backend/BFF) · M23-S27 | ✅ Criado |
| `03c-no-show-not-yet-ended.html` | Atendimento ainda não terminou: ação desativada com dica; erro 422 `BOOKING_NOT_YET_ENDED` (`#rejeitado`) | UC-074 A1 | M23-S27 | ✅ Criado |
| `03d-no-show-success.html` | Sucesso inline (`actionState = 'no-show'`), status "Não compareceu" | UC-074 | M23-S27 | ✅ Criado |
| `03e-no-show-error.html` | Erros: 409 `BOOKING_ALREADY_TERMINAL` (`#terminal`) e falha de rede/5xx (`#falha`) | UC-074 A2 | M23-S27 | ✅ Criado |
| `03f-booking-detail-no-show.html` | Detalhe de um não comparecimento + histórico; gerente vê "Corrigir para concluído", staff não (`#equipe`) | UC-074 A3 | M23-S27 | ✅ Criado |
| `03h-booking-detail-completed.html` | Read-only COMPLETED detail with the "Cobrança" card (quoted, discount, charged, points), after photos and internal notes; same `?forma=` cards | UC-009 | — | ❓ Gap (2026-10-15) |
| `03i-booking-detail-cancelled.html` | Read-only CANCELLED detail with the "Cancelamento" card (who, when, why); same `?forma=` cards | UC-008 | — | ❓ Gap (2026-10-15) |
| `03g-correct-no-show.html` | Correção (somente gerente): motivo obrigatório (10–500), sucesso com pontos, falha, 403 | UC-074 A3 | M23-S27 | ✅ Criado |
| `00d-agenda-precisa-decisao.html` | A fila com o selo "Precisa de decisão" em três cards (Precisa de ação, Hoje, Próximos dias); a reserva continua na fila, ganha o selo e **perde as ações rápidas** (Aprovar, Marcar concluído); a barra lateral do gerente mostra "Reservas a resolver" logo abaixo de "Agenda" | UC-073 · UC-077 | M23-S46 | ✅ Criado (não construído) |
| `03j-booking-detail-precisa-decisao.html` | Detalhe de uma reserva aprovada com o aviso laranja "Esta reserva precisa de uma decisão" e, ao lado (barra no celular), o **painel de decisão** do gerente: Reatribuir, Reagendar e Cancelar (as mesmas três ações de Reservas a resolver, para esta reserva); as ações normais (concluir, não compareceu) não aparecem. Redesenhada em 2026-10-15: o botão "Abrir Reservas a resolver" foi removido | UC-073 · UC-077 | M23-S46 | ✅ Criado (não construído) |
| `03k-booking-detail-precisa-decisao-staff.html` | O mesmo aviso para a equipe: sem link e sem painel de decisão (a ação é do gerente), "Peça a um gerente para resolver" | UC-073 · UC-077 | M23-S46 | ✅ Criado (não construído) |

(Story numbers left as `—` above where they couldn't be confirmed against a specific milestone story — do not guess when citing these in a new story; check `git log` or ask.)

### Full booking detail — what the page must show (audit of 2026-10-15)

The shipped staff detail (`BookingDetailMain.tsx`) renders customer, info exchange, date and time, a services table, photos and the status history — nothing about the new scheduling fields. `01`, `03` and `03f` were redrawn with **shape variants** (`?forma=simples|recurso|pacote|trajeto|formulario|retirada|recorrente|equipe|completo`, default `completo` — every card; the real page shows only the cards that have data, `simples` is the bare booking) and two read-only states were added: `03h` (COMPLETED, with the charge summary) and `03i` (CANCELLED, with who/when/why). The same cards appear in all of them.

| Card (screen) | Fields | Where the data is today |
|---|---|---|
| Recursos reservados (`?forma=recurso\|pacote`) | One row per requirement, labelled by resource type; name when there is a resource (tag "escolhido pelo cliente" / "atribuído pelo sistema"), "Do conjunto" for a fungible pool | **Needs backend + BFF.** The list card already has `assignedResources`; the detail response has none |
| Trajeto (`?forma=trajeto`) | Per leg: resource, start–end | **Needs backend + BFF.** `BookingResponse` (the create response) has `itinerary`; the staff detail does not |
| Participantes (`?forma=formulario`) | `participantCount`, `attendees` (name, minor) | **Needs backend + BFF** — on the aggregate, not in the detail response |
| Formulário de entrada (`?forma=formulario\|equipe`) | Answers by question, schema version, consent date; "não coletado" for a staff-created booking | **Needs backend + BFF** (`intake`, `consentAcceptedAt`) |
| Observações do cliente | `notes` | Backend detail has it; **the BFF staff mapper drops it** |
| Endereços (`?forma=retirada\|completo`) | `pickupAddress`, `contactAddress` | In `StaffBookingDetailResponse` already; **the page never renders them** |
| Origem | "Solicitado em" (`createdAt`), recurrence link (`recurringScheduleId`), "Criado por" (`createdByStaffId`) | `createdAt` in backend detail, dropped by the BFF mapper; `recurringScheduleId` and `createdByStaffId` **need backend + BFF** (M23-S40 decision 14 deferred "Criado por") |
| Notas internas (`03h`, `?forma=completo`) | `adminNotes` | Backend detail has it; **dropped by the BFF mapper**. Staff only |
| Cobrança (`03h`) | Quoted total, points discount, charged total, points earned, after photos | In the DTO (`totalActualPrice`, `discountPointsUsed`, `discountAmount`, `afterServicePhotoUrls`); **the read-only page does not render them** |
| Cancelamento / Rejeição (`03i`) | Who, when, reason | `rejectionReason` is in the DTO; `cancelledAt/By`, `cancellationReason`, `rejectedAt/By` are on the aggregate and **need backend + BFF** |
| Duração escolhida (service line note) | Chosen duration of a variable-duration service | Already in the line (`durationMinsAtBooking`); the page does not say it was a choice |

Nothing above is built; the screens are the reference for a "full staff booking detail" story (backend + BFF fields, then the web cards). The customer detail has the matching cards in `customer/prototypes/minha-conta/02*`.

## M23 — Multi-Vertical Scheduling, Cluster 3 extension (❓ Gap, not yet built — except UC-074 no-show, ✅ Criado by M23-S27)

> Promoted from `docs/discovery/multivertical-booking/`. **UC-071's approval queue lives inside the existing "Precisa de ação" block of the Agenda (decided 2026-10-08)** — a recurrence request is something that needs a staff decision now, exactly like a pending booking, so it sits in the same hot list instead of a separate tab. See "Recurrence requests in the Agenda" below. UC-074 (no-show) extends `03-booking-detail-approved.html`'s existing Cancel/Complete/Reschedule action set with a new "Marcar não compareceu" action — same route and component, no new page; the prototype adds its states as `03c`–`03g` (added 2026-09-30 after the M23-S09 discovery; the UI itself is a future frontend story, M23-S09 ships the backend/BFF only). Full implementation-handoff detail lives in `dev-notes.md`'s own ❓ GAP section — not duplicated here.

> **Staff creating a recurring schedule on a customer's behalf** (UC-070 allows it, and `POST /recurring-booking-schedules` already accepts a `customerId` from `STAFF|MANAGER`) was added on 2026-09-29 as a deliberately small first pass (`09`, `09b`, `09c`), in the same staff dashboard shell as `08`. **Redrawn 2026-10-15 after TD49:** `09b` now shows every service shape the server accepts (single choice, the default shape with no resource field, a bundle with one pick group per `CUSTOMER_CHOICE` requirement and a line per automatic one), the empty states and the pattern refusals; `09c` gained the customer-without-phone outcome and shape-neutral limit/conflict copy. Creation is direct (no review step, decided 2026-10-15). The rest of the choices stay defaults to recheck at `M23-S19`'s story-discovery.

**Recurrence requests in the Agenda (M23-S13, decided 2026-10-08):**

- **Same queue, clearly marked.** A `PENDING_APPROVAL` recurring schedule is a card in "Precisa de ação", sorted with the bookings by urgency (it carries a 30-minute hold, so it usually sorts first). It differs from a booking card by a teal **"Recorrência"** badge, the pattern as its title ("toda terça · 10:00–12:00", period, number of reservations), a "Decidir até HH:mm" line, a teal left border, and a single **"Ver pedido"** button — **no quick "Aprovar"**, because one decision creates every occurrence of the term and must go through the detail screen.
- **Filter balloon.** The floating "Filtrar agenda" balloon (same trigger + popover shape as Horários' `ResourceFilterMenu` / `ScheduleStatusFilterMenu`) has two groups: *Precisa de ação* → Agendamentos, Recorrências; *Confirmados* → Hoje, Próximos dias. Default = all visible; "Padrão" resets; a badge on the trigger counts hidden options; hiding everything shows an empty state with "Limpar filtro". The header count follows the filter ("4 agendamentos · 1 recorrência").
- **Detail screen `08`** follows the shared detail pattern (details centred, action panel on the right, bottom action bar on mobile). Approve and reject each open a confirmation sheet; reject has **no reason field** (the endpoint takes no body). Outcomes are in `08b`. The request card ends with a "Solicitado em" row: M23-S13 adds `createdAt` to the schedule read (decided 2026-10-15).

```mermaid
flowchart TD
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Fila["/dashboard/bookings<br/>Agenda — 'Precisa de ação'<br/>cards 'Recorrência' + balão 'Filtrar agenda'<br/>(00c-agenda-s13)"] -->|"'Ver pedido'"| Pedido["❓ GAP: detalhe do pedido<br/>(08-recurring-schedule-approval)"]
    Pedido -->|"'Aprovar recorrência' → confirmar"| ApAprova(("POST …/approve"))
    Pedido -->|"'Recusar' → confirmar"| ApRecusa(("POST …/reject"))
    ApAprova -->|"200"| R1["❓ GAP: aprovada (08b #aprovada)"]
    ApAprova -->|"409 conflito (A3)"| R3["❓ GAP: lista de datas (08b #conflito)"]
    ApAprova -->|"409 já decidido / expirou (A1/A2)"| R4["❓ GAP: (08b #expirada)"]
    ApAprova -->|"422 cliente sem telefone"| R5["❓ GAP: (08b #telefone)"]
    ApAprova -->|"rede/5xx"| R6["❓ GAP: (08b #falha)"]
    ApRecusa -->|"200"| R2["❓ GAP: recusada (08b #recusada)"]
    ApRecusa -->|"409 / rede"| R4
    R3 -->|"'Voltar ao pedido'"| Pedido
```

```mermaid
flowchart TD
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Agenda["/dashboard/bookings<br/>Agenda — botão '+ Novo' (real, shipped)"] -->|"menu: Recorrência"| Cliente["escolher cliente<br/>(09-escolher-cliente ?tipo=recorrencia, M23-S40)"]
    Cliente -->|"busca e seleciona (só cliente cadastrado)"| Padrao["❓ GAP: padrão para o cliente<br/>(09b-nova-recorrencia-padrao — variantes por forma de serviço)"]
    Padrao -->|"nenhum serviço qualifica"| SemServ["❓ GAP: lista vazia<br/>(09b #sem-servicos / #sem-elegivel)"]
    Padrao -->|"'Criar recorrência'"| Envio(("POST /recurring-booking-schedules<br/>com customerId"))
    Padrao -->|"'Trocar cliente'"| Cliente

    Envio -->|"422 padrão recusado (data final, prazo, passado, sem ocorrência)"| Recusa["❓ GAP: volta ao formulário, padrão mantido<br/>(09b #erros / #recusa / #sem-ocorrencia)"]
    Recusa --> Padrao
    Envio -->|"201 ACTIVE"| Criada["❓ GAP: mesma rota, resultado<br/>(09c #criada)"]
    Envio -->|"201 PENDING_APPROVAL"| Aguardando["❓ GAP: mesma rota, resultado<br/>(09c #aguardando)"]
    Envio -->|"409 conflito"| Conflito["❓ GAP: (09c #conflito)"]
    Envio -->|"409 limite de recorrências ativas"| Limite["❓ GAP: (09c #limite)"]
    Envio -->|"422 cliente sem telefone"| Telefone["❓ GAP: (09c #telefone)"]
    Envio -->|"404 cliente não encontrado"| ClienteNaoEncontrado["❓ GAP: (09c #cliente)"]
    Envio -->|"erro rede/5xx"| Falha["❓ GAP: (09c #falha)"]

    Aguardando -->|"'Ver na agenda' (cartão em Precisa de ação)"| Aprovar["❓ GAP: fila da Agenda → 08-recurring-schedule-approval"]
    Conflito -->|"'Alterar padrão'"| Padrao
    Limite -->|"'Alterar padrão'"| Padrao
    Telefone -->|"'Escolher outro cliente'"| Cliente
    ClienteNaoEncontrado -->|"'Escolher outro cliente'"| Cliente
    Falha -->|"'Tentar novamente'"| Padrao
```

**UC-108 — Staff creates a booking on a customer's behalf (added 2026-10-08):**

```mermaid
flowchart TD
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Agenda["/dashboard/bookings<br/>Agenda — botão '+ Novo'<br/>(00-agenda)"] -->|"menu: Agendamento"| Quem["escolher o cliente<br/>Cliente cadastrado | Novo contato<br/>(09-escolher-cliente)"]
    Agenda -->|"menu: Recorrência"| Quem
    Quem -->|"Agendamento + continuar"| Passos["passos do fluxo público no dashboard<br/>(10-novo-agendamento)"]
    Quem -->|"Recorrência + continuar (só cliente cadastrado)"| Padrao["❓ GAP: padrão da recorrência<br/>(09b)"]
    Passos -->|"'Criar agendamento'"| Envio(("POST /bookings/staff"))
    Envio -->|"201 APPROVED"| Ok["(10b #criado)"]
    Envio -->|"409 horário ocupado"| Oc["(10b #ocupado)"]
    Envio -->|"422 fora do prazo"| Jan["(10b #janela)"]
    Envio -->|"422 sem telefone / 404 cliente"| Cli["(10b #telefone, #cliente)"]
    Envio -->|"rede/5xx"| Fal["(10b #falha)"]
    Oc -->|"'Escolher outra data'"| Passos
    Jan -->|"'Escolher outra data'"| Passos
```

**UC-074 — Não comparecimento (added 2026-09-30):**

```mermaid
flowchart TD
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Det["/dashboard/bookings/:id<br/>Detalhe APPROVED (real, shipped)<br/>03-booking-detail-approved"] -->|"Antes do fim do atendimento"| Desat["ação desativada + dica<br/>(03c)"]
    Det -->|"'Marcar não compareceu' (após o fim)"| Sheet["bottom sheet, motivo opcional<br/>(03 — sheet)"]
    Sheet -->|"'Confirmar'"| Post(("POST /bookings/:id/no-show"))
    Post -->|"200"| Ok["sucesso inline, NO_SHOW<br/>(03d)"]
    Post -->|"409 já encerrado"| Terminal["(03e #terminal)"]
    Post -->|"422 ainda não terminou"| Rej["(03c #rejeitado)"]
    Post -->|"rede/5xx"| Falha["(03e #falha)"]
    Ok -->|"Detalhe"| NS["detalhe NO_SHOW + histórico<br/>(03f)"]
    NS -->|"Gerente: 'Corrigir para concluído'"| Fix["folha de correção, motivo obrigatório<br/>(03g)"]
    NS -->|"Staff: sem botão (#equipe)"| Nada["sem ação disponível"]
    Fix -->|"POST /bookings/:id/no-show/correct"| Corr(("BookingCompleted → pontos"))
    Corr -->|"200"| CorrOk["(03g #sucesso)"]
    Corr -->|"403"| Perm["(03g #permissao)"]
    Corr -->|"rede/5xx"| CorrFalha["(03g #falha)"]
```

**Open questions / gaps:**
- [x] Stories exist: `M23-S13` (approval queue, UC-071), `M23-S09` (no-show backend/BFF, UC-074 — the button and correction UI are M23-S27) and `M23-S19` (staff creating on a customer's behalf). Each still begins with `/story-discovery`.
- [x] **Entry point — decided 2026-10-08:** a single **"+ Novo"** button above the Agenda queue opens a small menu with **Agendamento** and **Recorrência**; both start at the same customer picker (`09`) and use the same two-column form layout. A second button is never added for the next kind of "create on a customer's behalf". "Recorrência" is UC-070 (staff variant, `M23-S19`).
- [x] **Staff creates a one-off booking for someone who calls or messages — decided 2026-10-08, now UC-108 with stories `M23-S39` (backend/BFF, `POST /bookings/staff`) and `M23-S40` (frontend).** Locked: (1) a person who is not in the system is booked as a **guest** (name, phone and e-mail all required) because a `Customer` needs a Google account — no model change; (2) the booking is created **directly `APPROVED`**, `createdByStaffId` recorded, no manager alert, the customer gets the confirmation e-mail; (3) availability, closures and conflicts are enforced as for a customer, the **minimum notice is not** (a same-day phone booking works; past dates and the maximum advance still are); (4) one shared **customer chooser** (`09`) is the first step of both "Agendamento" and "Recorrência"; (5) the booking steps are the public flow's step engine in a dashboard skin (the public steps use the business's `--ba-*` tokens, which the dashboard may not). Decided at `M23-S40`'s discovery (2026-10-13): the click-on-an-empty-slot shortcut in Horários, pre-registering a customer without a Google account (a bigger model change) and the guest cancel link are out of scope for S40; the staff shell uses its own design system with no tenant branding, the steps share the public flow's logic but not its markup, the picker/duration/intake/pickup steps are dashboard views of the public steps, and "Recorrência" stays out of the menu until `M23-S19` ships.
- [x] **Recurring queue placement — decided 2026-10-08:** recurrence requests fold into the existing "Precisa de ação" block (not a tab, not a separate route), distinguished by badge and filterable through the "Filtrar agenda" balloon. The detail route is proposed as `/dashboard/bookings/recurring/:scheduleId`.
- [ ] **`08` data (audit of 2026-10-15).** The schedule read carries `customerId` only, so the detail loads the customer (`GET /customers/:customerId`) for name, e-mail and the "cliente autenticada" line; there is no `createdAt` on the schedule, so the "Solicitado" row was dropped (the "Decidir até" banner is what matters); there is no occurrence count before approval, so the page says "Até N", computed from the pattern. **Approval can create fewer than N (M23-S35):** occurrences that started while the request waited are dropped, and the approve response's `occurrenceCount` is the number to show (`08b #aprovada-parcial`). New outcomes: `#passada` (`422 BOOKING_SCHEDULED_IN_PAST`, every date already gone) and `#inelegivel` (`422 BOOKING_RECURRING_SCHEDULE_INELIGIBLE_SERVICE`); both leave the request pending with only "Recusar" useful. Resource rows are labelled by resource type (`#simples`/`#um`/`#pacote`).
- [ ] **Link from a booking to its recurrence.** `01`/`03`'s "Origem" card links to `/dashboard/bookings/recurring/:id` (S13's detail). That screen is drawn for a pending request; for an `ACTIVE`/`ENDED` schedule it would need a read-only variant (or the link is plain text). Decide at S13's `/story-discovery`.
- [ ] **Filter persistence.** Reset on reload (drawn) or remembered per user — decide at `M23-S13`'s `/story-discovery`, following whatever Horários' filters do.
- [ ] **Merged-queue paging.** Bookings and recurrence requests come from two endpoints (`GET /bookings` and the paginated `GET /recurring-booking-schedules?status=PENDING_APPROVAL`); how they are merged and sorted, and whether recurrences page through `pagination.hasMore`, is locked at `M23-S13`'s discovery.
- [ ] **Week strip with the "Filtrar agenda" balloon (M23-S13).** Picking a day filters "Próximos dias"; when that block is filtered out by the balloon the pick has nothing to act on — decide at S13 whether it does nothing or switches the block back on.
- [ ] **Approval on a staff-created schedule.** Today a schedule created by staff for a service that requires manual approval still lands in `PENDING_APPROVAL`, so staff would approve their own request. Should staff creation skip approval? (`09c #aguardando` draws today's behavior.)
- [x] **Customer and manager e-mails — shipped in `M23-S28` (corrected 2026-10-08; this bullet used to say nobody is notified).** The customer is e-mailed when a schedule becomes `ACTIVE` (at creation for an `AUTO_CONFIRM` service, at approval otherwise), when it is rejected, when the request expires, and when it is ended. Managers get an alert when a `MANUAL_APPROVAL` request is waiting. `08` and `08b` therefore say "Ana recebe um e-mail", and since 2026-10-15 so do `09b` ("Como funciona") and `09c #criada`.
- [ ] **Route.** The chooser is S40's `/dashboard/bookings/new` (`?tipo=recorrencia`; its page hard-codes `agendamento` today, so S19 wires the parameter); the pattern step is proposed as `/dashboard/bookings/recurring/new?customerId=` — two segments after `/dashboard/bookings/`, so it is never read as a booking id. A brand-new dashboard section would also need registering in the sidebar, the proxy role list, the bottom nav and the topbar titles. Confirm at `M23-S19`'s discovery.
- [x] **The conflict list** in `09c #conflito` is the `409` occurrence-list payload that `M23-S18` owns (reasons `OCCUPIED` / `CLOSED` / `OUTSIDE_HOURS`, occupancy and hours merged into one list); no backend work in `M23-S19`.
- [x] **Fixed term — decided 2026-09-29; prototypes `08`, `09b`, `09c` updated in the same-day prototype pass:** a recurring schedule always has an end date, chosen up to the service's maximum term (90 days by default); every occurrence is checked at creation and created once (immediately, or when staff approve). `09b` therefore needs an end-date field with a "máx. N dias" hint and no "sem data final" copy; `09c` needs its "geradas… até 90 dias à frente" success copy replaced (the whole term appears at once) and `#conflito` needs the reason labels; and `08` should show the requested term ("até dd/mm") instead of "sem data de término", with a note that approving creates every occurrence of the term at once (after the checks re-run — if any occurrence no longer passes, approval is refused as a whole with a `409` listing the conflicts and nothing is created; decided in `M23-S05`, since the exception worklist can only hold bookings that already exist).
- [x] Variable-duration services are out of scope here, as in the customer flow. Bundled services (several resource requirements) are in scope: the API accepts them (TD49 Story 0) and staff creation inherits the customer form's per-requirement picks from `docs/archive/td/TD49-RECURRING-SCHEDULE-BUNDLED-SERVICES.md` Story 2. **Drawn 2026-10-15:** `09b` shows one pick group per `CUSTOMER_CHOICE` requirement and an info line per automatic one (`#pacote`, `#pacote-duas`, `#pacote-falta`, `#opcoes`), plus the default shape with no resource field (`#padrao`) and the empty states (`#sem-servicos`, `#sem-elegivel`), mirroring customer `13h`/`13g`. `08` was redrawn the same day: its "Recurso" row is one row per requirement (`#simples`, `#um`, `#pacote`).
- [x] **Review step — decided 2026-10-15: none.** Staff create straight from the form (unlike the customer's `13b`): they know the pattern, the picks stay visible on the form, and the server checks every occurrence on submit.
- [x] **Staff are exempt from the booking window — UC-070 A10.** `09b`'s "Começa em" accepts today and says so; a start in the past is refused (`#recusa`). The customer's minimum-notice and maximum-days pre-check must not run on this form.
- [x] **Pattern refusals return to the form, not to `09c`** (as the customer's `13e`): end before start / term exceeded / missing end date (`09b #erros`), first occurrence in the past (`#recusa`), no chosen weekday in the term (`#sem-ocorrencia`). `09c` keeps the outcomes of an accepted pattern, plus `#telefone` (`422 BOOKING_CUSTOMER_PHONE_NOT_SET`, UC-070 A12).
- [ ] **Limit copy (cap is per picked resource or per service).** `09c #limite` no longer names a resource or says "escolha outro recurso"; the customer-side `13d` and the shipped `capNext` copy still do — a small fix owned by whichever story touches them next.
- [x] **No-show: who can do what — decided 2026-09-30 (M23-S09 discovery):** marking is `STAFF|MANAGER`; correcting is `MANAGER` only and its only target is `COMPLETED`. The staff view simply does not render "Corrigir para concluído" (hidden, not disabled); "Marcar não compareceu" before the end time is disabled with the hint "Disponível após o término do atendimento (HH:mm)".
- [x] **No-show: correction reason validation — locked 2026-10-10 (M23-S27 discovery):** required, trimmed, 10–500 characters (same minimum as Reject); the confirm button is disabled until valid.
- [x] **No-show: the customer email** ("foi avisado por email" in `03`, `03d`) shipped with `M23-S25`, so the sentence is true. The staff member's reason is internal and never appears in the email or on the customer's screen (`customer/prototypes/minha-conta/02f`).
- [x] **No-show: the UI story** is `M23-S27` (dashboard actions and sheets, the status-history read, and the customer `02f` detail), created 2026-09-30; it depends on `M23-S09`, `M23-S25` and `M23-S26`. The read-only `NO_SHOW` status display (badge, history list, read-only details) ships earlier, inside `M23-S09`, because the shared status type forces it.
