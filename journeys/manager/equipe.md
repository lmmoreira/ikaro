# MANAGER — Equipe (Team Management)

**Actor(s):** MANAGER
**Goal:** Invite new staff members and deactivate departing ones, keeping the team list authoritative for the tenant
**UCs covered:** UC-028, UC-029, UC-030, UC-031
**Status:** ✅ Built — all pages ✅ Done (M13-S43, M13-S44; see "Pages referenced")

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Start(["Dashboard sidebar/bottom-sheet<br/>'Somente Gerente' → Equipe"]) --> List["/dashboard/team<br/>Team List"]

    List --> InviteBtn(("Click '+ Convidar membro'"))
    List --> DeactivateBtn(("Click 'Desativar' em uma linha"))

    %% UC-028 — Invite
    InviteBtn --> InviteForm["/dashboard/team/invite<br/>Invite Member Form"]
    InviteForm --> InviteSubmit(("Click 'Enviar convite'"))
    InviteSubmit --> EmailCheck{"E-mail já tem<br/>conta vinculada?"}
    EmailCheck -- "sim → 409 (A1)" --> EmailError["erro inline<br/>'Já existe um membro da equipe com este e-mail neste estabelecimento.'"]
    EmailError --> InviteForm
    EmailCheck -- "convite pendente → reenvia (A2)" --> ReactivateSuccess["banner inline<br/>'Convite enviado!'"]
    EmailCheck -- "não → 201" --> InviteSuccess["banner inline<br/>'Convite enviado para [email]'"]
    ReactivateSuccess --> List
    InviteSuccess --> List

    %% UC-029 — Deactivate
    DeactivateBtn --> DeactivateConfirm["confirmação<br/>'Desativar membro? {name} perderá o acesso imediatamente.'"]
    DeactivateConfirm --> ConfirmYes(("Confirmar"))
    DeactivateConfirm --> ConfirmNo(("Cancelar"))
    ConfirmNo --> List
    ConfirmYes --> SelfCheck{"É a própria conta? (A1)"}
    SelfCheck -- "sim → 403" --> SelfError["erro<br/>'Você não pode desativar sua própria conta.'"]
    SelfCheck -- "não" --> LastManagerCheck{"Último MANAGER ativo? (A2)"}
    LastManagerCheck -- "sim → 409" --> LastManagerError["erro<br/>'Não é possível remover o último gerente ativo.'"]
    LastManagerCheck -- "não → 200" --> DeactivateSuccess["redireciona para a lista<br/>(sem mensagem)"]
    SelfError --> List
    LastManagerError --> List
    DeactivateSuccess --> List

    %% UC-030 — Edit profile
    List --> RowClick(("Click em uma linha ativa"))
    RowClick --> EditDetail["/dashboard/team/[id]<br/>Staff Detail / Edit"]
    EditDetail --> EditSubmit(("Click 'Salvar'"))
    EditSubmit --> EditSuccess["redireciona para a lista<br/>(sem mensagem)"]
    EditSuccess --> List

    %% UC-031 — Reactivate
    List --> ActivateBtn(("Click 'Ativar' em uma linha inativa"))
    ActivateBtn --> ActivateSuccess["texto inline na linha<br/>'Membro ativado!'"]
    ActivateSuccess --> List

    class List,InviteForm,EmailError,ReactivateSuccess,InviteSuccess,DeactivateConfirm,SelfError,LastManagerError,DeactivateSuccess,EditDetail,EditSuccess,ActivateSuccess existing
```

**UC-028 A2, as built:** an invite for an email whose record has no linked Google account (a pending invitee) re-sends the invite (`Staff.reinvite`). An email whose record is already linked — including a deactivated member — returns `409 STAFF_ALREADY_EXISTS`; a deactivated member is brought back only through "Ativar" (UC-031). Success feedback is the inline `?invited=<email>` banner (invite), a plain redirect to the list (deactivate, edit) and the inline "Membro ativado!" text (activate) — there are no toasts.

**Also shipped, not originally covered by this journey (2026-07-31 docs audit):** UC-030 (Admin Edits Staff Member Profile, `/dashboard/team/[id]`) and UC-031 (Admin Reactivates Staff Member, one-click "Ativar" on deactivated rows) — both `M13-S43`/`M13-S44`, ✅ Done. Prototype coverage: `04-staff-detail-edit.html` exists for UC-030 — see the Prototype table below; UC-031's one-click reactivate has no dedicated screen (it's a row action on `01-team-list.html`).

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/dashboard/team` | `TeamListPage` | M13-S43 | ✅ Done |
| `/dashboard/team/invite` | `InviteForm` | M13-S43 | ✅ Done |
| Deactivate confirmation | `DeactivateConfirmPage` | M13-S43 | ✅ Done |
| `/dashboard/team/[id]` (UC-030, not originally in this journey) | `StaffDetailPage` | M13-S43 | ✅ Done |
| Reactivate — one-click "Ativar" (UC-031, not originally in this journey) | inline on `TeamListPage` row | M13-S44 | ✅ Done |

## Open questions / gaps

- [x] **Backend/BFF status** — fully implemented and `MANAGER`-guarded: `POST /staff/invite`, `GET /staff`, `GET /staff/:id`, `PATCH /staff/:id`, `PATCH /staff/:id/deactivate`, `PATCH /staff/:id/activate`. Shipped as part of `M13-S43`.
- [x] **List scope** — **Resolved/shipped.** `TeamListPage` shows Ativos / Convites pendentes / Inativos, matching the prototype.
- [x] **Invite form surface** — **Resolved/shipped.** Full page (`InviteForm`), matching `staff/servicos.md`'s pattern.
- [x] **Resend invite affordance** — resolved on the `M13-S43` branch (2026-07-06): `MemberRow.tsx`'s "Reenviar convite" is a direct one-click button, not a link back to the invite form. It calls `POST /staff/invite` with the row's existing name (split into firstName/lastName) and role — no retyping, no navigation.
- [x] **Role badge** — **Resolved/shipped.** `.role-badge` is a prototype-only class; in code `MemberRow.tsx` renders an inline Tailwind pill and the topbar uses `<Badge data-testid="team-role-badge">`.
- [x] **Deactivate confirmation surface** — **Resolved/shipped.** Dedicated confirmation page (`DeactivateConfirmPage`), matching `staff/servicos.md`'s pattern.

## Prototype

Folder: `manager/prototypes/equipe/`

| File | Screen | UC | Status |
|---|---|---|---|
| `index.html` | Navigation hub + dry-run checklist | — | ✅ Criado |
| `01-team-list.html` | Team list (Ativos / Convites pendentes / Inativos) | — | ✅ Criado |
| `02-invite-form.html` | Invite member form | UC-028 | ✅ Criado |
| `02b-invite-error.html` | Duplicate active email error | UC-028 A1 | ✅ Criado |
| `03-deactivate-confirm.html` | Deactivation confirmation | UC-029 | ✅ Criado |
| `03b-deactivate-self-error.html` | Self-deactivation blocked | UC-029 A1 | ✅ Criado |
| `03c-deactivate-lastmanager-error.html` | Last active manager blocked | UC-029 A2 | ✅ Criado |
| `04-staff-detail-edit.html` | Staff detail / edit profile page | UC-030 | ✅ Criado |
| `dev-notes.md` | Implementation handoff | — | ✅ Criado |
