# STAFF — Serviços (Service Catalog Management)

**Actor(s):** STAFF | MANAGER  
**Goal:** Create, edit, and deactivate services offered by the tenant  
**UCs covered:** UC-012, UC-013  
**Status:** Draft

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Start(["Dashboard /{slug}/dashboard"]) --> List["/dashboard/services<br/>Service List"]

    List --> CreateBtn(("Click '+ Criar serviço'"))
    List --> EditClick(("Click serviço existente"))

    %% UC-012 — Create
    CreateBtn --> CreateForm["✅ ServiceCreatePage<br/>/dashboard/services/new"]
    CreateForm --> CreateSubmit(("Click 'Criar serviço'"))
    CreateSubmit --> NameCheck{"Nome único?"}
    NameCheck -- "não → 409" --> NameError["✅ Inline duplicate-name error<br/>Campo nome em vermelho"]
    NameError --> CreateForm
    NameCheck -- "sim" --> PriceCheck{"Preço e duração válidos?"}
    PriceCheck -- "não" --> ValError["✅ Inline validation<br/>campos inválidos em vermelho"]
    ValError --> CreateForm
    PriceCheck -- "sim → 201" --> CreateSuccess["✅ List banner + redirect<br/>Serviço criado"]

    %% UC-013 — Edit
    EditClick --> EditForm["/dashboard/services/[id]/edit<br/>Edit Service Form (also exposes Ativar/Desativar)"]
    EditForm --> EditSubmit(("Click 'Salvar alterações'"))
    EditSubmit --> EditCheck{"Válido?"}
    EditCheck -- "não" --> EditForm
    EditCheck -- "sim → 200" --> EditSuccess["Lista com toast verde<br/>Serviço atualizado"]

    EditForm --> DeactivateBtn(("Click 'Desativar serviço'"))
    DeactivateBtn --> DeactivateConfirm["/dashboard/services/[id]/deactivate<br/>Confirmação de desativação"]
    DeactivateConfirm --> ConfirmYes(("Confirmar"))
    DeactivateConfirm --> ConfirmNo(("Cancelar"))
    ConfirmYes --> DeactivateSuccess["Lista com badge Inativo<br/>isActive = false"]
    ConfirmNo --> EditForm

    CreateSuccess --> List
    EditSuccess --> List
    DeactivateSuccess --> List

    class List,EditForm,DeactivateConfirm,EditSuccess,DeactivateSuccess existing
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/dashboard/services` | `ServiceListPage` | M13-S22 | ✅ Done |
| `/dashboard/services/new` | `ServiceCreatePage` | M13-S23 | ✅ Done |
| `/dashboard/services/[id]/edit` | `ServiceEditPage` | M13 | ✅ Done |
| Deactivate confirmation | `ServiceDeactivatePage` (`/dashboard/services/[id]/deactivate`) | M13 | ✅ Done |

## Open questions / gaps

- [x] **Route location** — are service pages under `/dashboard/services/` or `/[slug]/dashboard/services/`? — **Resolved.** `/dashboard/services` (no slug) — `M13-S22`/`M13-S23`/`M13-S24` all use this, consistent with every other M13 dashboard route.
- [x] **Create as inactive** — UC-012 field list includes `isActive` (default: true). The create form now exposes the toggle and defaults it to ON.
- [ ] **Deactivate UX** — prototype uses a dedicated confirmation page. Production could use a bottom sheet on the edit form instead. Confirm preference.
- [x] **Reactivate** — **Resolved/shipped.** `ServiceEditPage` includes a `ServiceEditStatusSection` with an "Ativar serviço" action (via a `useActivateService` hook) wired to the same `PATCH` endpoint.
- [ ] **Service ordering** — does the service list have a drag-to-reorder or fixed sort (e.g. alphabetical, creation date)? Affects the list page design.
- [ ] **`requiresPickupAddress` label** — "Coleta e Entrega" toggle in the form — should the label be the feature name ("Requer endereço de coleta") or a free-text helper?
- [ ] **Price change warning** — UC-013 A2 says past bookings are unaffected. Show an inline note on the price field? Prototype includes it; confirm if it's needed in production.

## Prototype

Folder: `staff/prototypes/servicos/`

| File | Screen | UC | Status |
|---|---|---|---|
| `index.html` | Navigation hub + dry-run checklist | — | ✅ Criado |
| `01-servicos-list.html` | Service list (active + inactive tabs) | — | ✅ Criado |
| `02-service-create.html` | Create service form | UC-012 | ✅ Criado |
| `02b-service-create-error.html` | Duplicate name error state | UC-012 A1 | ✅ Criado |
| `02c-service-create-success.html` | Service created — inline success banner on the list (closes the "Lista com toast verde" gap node) | UC-012 | ✅ Criado |
| `03-service-edit.html` | Edit service form + deactivate button | UC-013 | ✅ Criado |
| `03b-deactivate-confirm.html` | Deactivation confirmation | UC-013 A1 | ✅ Criado |
| `dev-notes.md` | Implementation handoff | — | ✅ Criado |
