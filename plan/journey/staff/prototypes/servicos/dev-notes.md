# Serviços — Dev Notes

**Journey:** STAFF — Serviços (Service Catalog Management)  
**UCs:** UC-012 (create), UC-013 (edit / deactivate)  
**Prototype:** `staff/prototypes/servicos/`

---

## Routes (all ✅ shipped — `M13-S22`–`S24`)

| Prototype file | Production route | Page component |
|---|---|---|
| `01-servicos-list.html` | `/dashboard/services` | `ServiceListPage` |
| `02-service-create.html` | `/dashboard/services/new` | `ServiceCreatePage` |
| `03-service-edit.html` | `/dashboard/services/[id]/edit` | `ServiceEditPage` (isActive=true branch) |
| `03c-service-edit-inactive.html` | `/dashboard/services/[id]/edit` | `ServiceEditPage` (isActive=false branch — same component, different section rendered) |
| `03b-deactivate-confirm.html` | `/dashboard/services/[id]/deactivate` | `ServiceDeactivatePage` — dedicated page, not a bottom sheet (resolved) |

No `[slug]` segment on any of these — the staff/manager dashboard is JWT/session-scoped, not URL-slug-scoped (an earlier draft of this file's HTML comments assumed `[slug]`; corrected 2026-07-31).

---

## BFF calls

| Action | Method + Path | Role guard | Request body | Success |
|---|---|---|---|---|
| List services | `GET /v1/services` | STAFF \| MANAGER | — | `ServiceListResponse` |
| Get single service | `GET /v1/services/:id` | STAFF \| MANAGER | — | `ServiceDetailResponse` |
| Create service | `POST /v1/services` | STAFF \| MANAGER | `CreateServiceDto` | `201 ServiceDetailResponse` |
| Update service | `PATCH /v1/services/:id` | STAFF \| MANAGER | `UpdateServiceDto` | `200 ServiceDetailResponse` |
| Deactivate service | `DELETE /v1/services/:id` | STAFF \| MANAGER | — | `204` |
| Activate service | `PATCH /v1/services/:id/activate` | STAFF \| MANAGER | — | `200` |

All confirmed existing in `apps/bff/src/features/booking/services.controller.ts`.

---

## DTO shapes (from code — verify before using)

```typescript
// packages/types — extend if fields are missing
interface ServiceListItem {
  serviceId: string;
  name: string;
  description: string | null;
  price: MoneyAmount;           // { amount: number, currency: 'BRL' }
  durationMins: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
}

interface ServiceListResponse {
  items: ServiceListItem[];
  total: number;
}

interface CreateServiceDto {
  name: string;
  description?: string;
  price: number;                // cents or float? verify Money VO
  durationMins: number;
  loyaltyPointsValue?: number;  // default 0
  requiresPickupAddress?: boolean; // default false
  isActive?: boolean;           // default true
}

interface UpdateServiceDto {
  name?: string;
  description?: string;
  price?: number;
  durationMins?: number;
  loyaltyPointsValue?: number;
  requiresPickupAddress?: boolean;
  isActive?: boolean;           // reactivation: set to true
}
```

---

## List page — client-side filtering

```typescript
// ServiceListPage — filter state: 'all' | 'active' | 'inactive'
const filtered = services.filter(s => {
  if (filter === 'active')   return s.isActive;
  if (filter === 'inactive') return !s.isActive;
  return true; // 'all'
});
```

---

## Form validation (UC-012 + UC-013)

```typescript
// Zod v4 schema
const ServiceFormSchema = z.object({
  name:                  z.string().min(2).max(100),
  description:           z.string().max(500).optional(),
  price:                 z.number().min(0),
  durationMins:          z.number().int().min(1).max(480),
  loyaltyPointsValue:    z.number().int().min(0).optional().default(0),
  requiresPickupAddress: z.boolean().optional().default(false),
  isActive:              z.boolean().optional().default(true),
});
```

---

## Error handling

| HTTP status | Scenario | UI response |
|---|---|---|
| `409` | Duplicate service name (UC-012 A1) | `name` field: red border + error message "Já existe um serviço com este nome" |
| `422` | Invalid price / duration (UC-012 A2, UC-013) | Field-level validation messages; form stays open |
| `404` | Service not found (edit page, stale URL) | `notFound()` — Next.js 404 page |
| `403` | Non-staff user | Middleware redirects before page renders |

---

## Price field — `Money` VO handling

The backend `price` field is a `Money` value object with `{ amount, currency }`. The BFF returns it as `{ amount: number, currency: 'BRL' }`. The create/update DTO likely accepts `price` as a plain number (cents or BRL float — **verify before implementing**). Show `R$ {price.amount.toFixed(2).replace('.', ',')}` in the UI.

---

## Create flow — redirect target changed 2026-09-17 (M22-S04 groundwork, not yet implemented)

```
Staff fills ServiceCreatePage, clicks "Criar serviço"
  → POST /v1/services → 201
  → router.push(`/dashboard/services/${newService.id}/edit`)   -- CHANGED, was router.push('/dashboard/services')
    → ServiceEditPage renders with an inline success banner on the Detalhes tab
    → Recursos/Políticas de reserva/Formulário de reserva tabs are unlocked, showing their
      empty/default state (no resource requirements, policy fields inheriting tenant
      defaults, no intake schema published) — optional refinement, not required
```

**Why changed:** user-proposed during the M22-S04 prototype pass, once Recursos/Políticas/Formulário existed as real tabs — bouncing back to the list after create just to click back into the new service was a pointless round-trip. A freshly created service is still fully functional with defaults (degenerate `resourceRequirements = [{type: LOCATION, selectionMode: NONE}]`, `null` policy fields inheriting tenant settings), so landing on the edit page doesn't force any extra work, it just makes the optional next step available immediately.

**Not yet implemented — this is a real, in-scope change for whichever story builds `ServiceCreatePage`'s submit handler** (currently `router.push('/dashboard/services')` per the shipped M13 code — grep `ServiceCreatePage.tsx`'s `onSuccess`/`useCreateService` before assuming). See `02c-service-create-success.html` for the exact landing state.

---

## Deactivate flow (shipped)

```
Staff clicks "Desativar serviço" (danger zone button, ServiceEditStatusSection)
  → navigate to /dashboard/services/[id]/deactivate
  → render ServiceDeactivatePage with service summary card + warning box
  → "Confirmar" → DELETE /v1/services/:id → 204
    → router.push('/dashboard/services')
  → "Cancelar" → link back to the edit page
```

---

## Reactivation (shipped)

`ServiceEditPage` renders a different section when `service.isActive === false`: an info box (`editInactiveTitle`/`editInactiveDescription`) instead of the danger zone, and the primary action button becomes "Ativar serviço" (`useActivateService()` → `PATCH /v1/services/:id/activate`) instead of "Salvar alterações". On success, `isActive` flips to `true` locally and the page re-renders the normal active-edit view in place — no navigation. See `03c-service-edit-inactive.html`.

---

## Types

`StaffServiceResponse` in `@ikaro/types` is the real shape used by `ServiceEditPage`/`ServiceDeactivatePage` — includes `serviceId`, `name`, `description`, `price` (`MoneyAmount`), `durationMinutes`, `loyaltyPointsValue`, `requiresPickupAddress`, `isActive`.

---

## ❓ GAP — M22 Cluster 2 extension (UC-050–056, not yet built)

> Everything above this line is shipped (`M13-S22`–`S24`). Everything below is new, unimplemented scope promoted from `docs/discovery/multivertical-booking/`. See `docs/02-DOMAIN_MODEL.md` § Booking Context (`Service` aggregate) and `docs/14-API_CONTRACTS.md` § Service Extensions for the full contract.

**New prototype screens (redesigned 2026-09-17 — see `03-service-edit.html`'s own header comment for the full rationale):**

| File | Screen | UC |
|---|---|---|
| `03-service-edit.html` — tab "Recursos" | Resource requirements, bundles, legs, buffer | UC-050, 051, 052, 053 |
| `03-service-edit.html` — tab "Políticas de reserva" | Approval mode, hold, cancellation/reschedule windows, variable-duration/pricing | UC-055 |
| `03d-service-edit-policy-error.html` | Error — `CUSTOMER_SELECTED` duration without a pricing policy (Políticas de reserva tab) | UC-055 A2 |
| `03-service-edit.html` — tab "Formulário de reserva" | Question-list builder, participant/attendee toggles, consent text, version history | UC-054 |
| `02-service-create.html` — "Modelo de agendamento" section | Booking-model picker at creation time | UC-056 |

The 3 previously-separate pages (`04-service-resource-config.html`, `05-service-booking-policies.html`, `05b-service-booking-policies-erro.html`) were retired — their content moved into tabs on `03-service-edit.html`, replacing the old aside link "Ver políticas de reserva →" that navigated away to a separate page. Same tab pattern already shipped for the Hotsite editor (`manager/prototypes/hotsite/01-hotsite-editor.html`'s Branding/Layout/SEO tabs) — not a new pattern.

**Protagonist standardized to Vitta Studio's "Massagem Relaxante"** across all 4 tabs — the old 03/04/05 files inconsistently mixed 3 different services across 2 tenants (BeloAuto's "Lavagem Completa Detalhada" on the old 03, Vitta Studio's "Massagem Relaxante" on the old 04, Vitta Studio's "Sala Aurora" on the old 05/05b), found via `/docs-audit` 2026-09-17.

**Known follow-up, not yet fixed:** `03b-deactivate-confirm.html` and `03c-service-edit-inactive.html` still reference the old "Lavagem Completa Detalhada" / BeloAuto branding — they weren't rebranded in this pass (their sidebar/nav uses an older relative-path convention than 03/03d's, and a careless swap risked breaking navigation; the mismatch is a real but low-severity inconsistency, deliberately deferred rather than risking a rushed nav bug).

**File map (❓ none exist yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/components/dashboard/services/ServiceResourceRequirementsPanel.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/services/ServiceLegsPanel.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/services/ServiceBookingPolicyPanel.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/services/ServiceIntakeSchemaPanel.tsx` | ❓ Gap — now has a prototype screen (`03-service-edit.html`'s "Formulário de reserva" tab) — confirm the exact layout with the user during `/story-discovery M22-S04` since it's still genuinely new UI, not a straight prototype-to-code port like the other 3 panels |

> Component names above match `plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md`'s M22-S04 story spec exactly (corrected via `/docs-audit`, 2026-09-17 — this file originally proposed `ServiceResourceConfigSection`/`ServiceLegsSection`/`ServiceBookingPolicyForm`/`ServiceIntakeSchemaForm`, drafted before the story existed).

**BFF calls (new endpoints — see `docs/14-API_CONTRACTS.md` § Service Extensions for full request/response shapes):**
```
PATCH /v1/services/:id/resource-requirements   -- UC-050/051
PUT   /v1/services/:id/legs                    -- UC-052
PATCH /v1/services/:id                         -- UC-053 (bufferAfterMinutes, existing endpoint, new field)
POST  /v1/services/:id/intake-schema           -- UC-054 (publish — creates a NEW version; no PATCH/edit-in-place)
PATCH /v1/services/:id/booking-policy          -- UC-055
POST  /v1/services                             -- UC-056 (bookingModel, existing endpoint, new field)
```

**Field-complete request bodies (verified 2026-09-17 against `packages/validation/src/booking.ts` — the prototype was missing several of these fields until this pass, see below):**
```
ResourceRequirementSchema:       { type, selectionMode, resourcePoolIds?, requiredQuantity? }
  -- requiredQuantity was missing from 04's original UI entirely; now a per-type "Quantidade
     necessária" number input on 03-service-edit.html's Recursos tab (both flat and, per its
     own note, legs mode — omitted there only because none of the Jornada Spa Vitta example's
     legs need more than 1 of any type).

UpdateServiceBookingPolicySchema — ALL 16 independently-submittable fields:
  defaultApprovalMode, manualHoldMinutes, cancellationWindowHoursOverride,
  rescheduleWindowHoursOverride, minBookingAdvanceHoursOverride, maxBookingAdvanceDaysOverride,
  recurrenceEligible, availabilityAlertEligible, durationPolicy, durationMinMinutes,
  durationMaxMinutes, durationIncrementMinutes, pricingPolicy, pricingIncrementMinutes,
  pricePerIncrementAmount, minimumChargeAmount
  -- The prototype originally collapsed durationPolicy+pricingPolicy+their 5 detail fields into
     ONE disabled <select> showing a single pre-baked string ("R$ 3,00 por minuto"), and never
     showed minBookingAdvanceHoursOverride/maxBookingAdvanceDaysOverride at all. Now: a
     "Duração" card (policy select + min/max/increment fields shown only when Cliente escolhe),
     a separate "Preço" card (policy select + increment/price/minimum-charge fields shown only
     when Por incremento), and a "Janela de reserva" card for the 2 advance-notice fields —
     see 03-service-edit.html's Políticas de reserva tab.

PublishServiceIntakeSchemaSchema: { questions[]: {fieldKey, label, type, required}, consentText,
                                     requiresNamedAttendees?, participantCountRequired? }
  -- fieldKey (required, unique, 1-100 chars) was never shown in the prototype's question
     builder — now displayed as a read-only "chave interna" hint under each question's label,
     auto-derived (not admin-typed); design decision to confirm during /story-discovery.
```

**Real functional gap, resolved at `/story-discovery M22-S04`, 2026-09-18:** there was no `GET` endpoint anywhere — backend or BFF — to read a service's active intake schema or its version history. `IServiceIntakeSchemaRepository.findActiveByServiceId()`/`findAllByServiceId()` exist at the repository layer but had zero controller callers; `GET /services/:id` doesn't include any intake-schema field. Decision: fold a new `GET /services/:id/intake-schema` endpoint into M22-S04's own scope (backed by one new `GetServiceIntakeSchemaUseCase` calling `findAllByServiceId()` and partitioning by `isActive` — no separate per-version endpoint) rather than splitting it into a preceding story. See `docs/02-DOMAIN_MODEL.md` § Aggregate: ServiceBookingIntakeSchema and `docs/14-API_CONTRACTS.md` § Service Extensions — M22 Cluster 2.

**Reconciliation, found by the user 2026-09-17:** `02c-service-create-success.html` was built before the field-completeness audit above and never went back to match it — its Recursos tab was missing the flat/legs model-picker toggle entirely (only showed the flat/empty checklist, making it look like a new service could never start in legs mode), and its Políticas de reserva tab still had the old single-`<select>` collapse the audit had already fixed on `03-service-edit.html`/`03d-service-edit-policy-error.html`. Both now match structurally (same toggles, same JS, same field set) — only the data differs (empty/inherited defaults vs. Massagem Relaxante's configured values). When editing one of these 3 files' shared tab markup, check the other two for the same class of drift before considering the edit done.

**Correction, found by the user via `/docs-audit`, 2026-09-18:** the reconciliation above was itself incomplete — `02c`/`03c`'s Recursos tab was still missing the 3rd `.nested-selmode` block per resource type (`selectionMode` — "Como é escolhido dentro do grupo elegível?"), present only on `03-service-edit.html`. Since `selection_mode` is `NOT NULL` in `docs/13-DATABASE_SCHEMA.md`, a service checking "Profissional" on either file had no way to produce a valid `PATCH /v1/services/:id/resource-requirements` payload. Fixed on both files, mirroring `03`'s existing per-type structure as-is (Profissional: 2 radio options; Sala/Equipamento: 1 radio option each — this asymmetry is real but undocumented, flagged separately below, not resolved by this fix) with neutral "entre os elegíveis" copy (no named staff/rooms, since the pool starts empty) defaulting to "Sistema atribui automaticamente." Also added: the UC-051 bundle-rule hint paragraph (present on `03`, missing on `02c`/`03c`), the `max(service.bufferAfterMinutes, resource.turnoverMinutes)` clarification on the buffer hint (`03c` had neither this nor the UC-053 reference `02c` already had), `03c`'s missing "(quantos/quantas deste tipo, ao mesmo tempo)" quantity sub-label, and the "Modelo de agendamento — não pode ser alterado (UC-056 A1)" immutability note (present on `03`, missing on both). All 3 Recursos-tab files now genuinely share the same field set.

**Styling gap, found by the user, 2026-09-18:** `02c`/`03c` never actually had the `.nested-selmode`/`.eligible-count`/`.eligible-chip-row`/`.eligible-chip`/`.chip-remove`/`.eligible-add-select`/`.resource-check-row.checked` CSS rules in their own `<style>` block — only `03-service-edit.html` had them (added in the "Interactivity added" pass above, but never copied to its 2 siblings). Pre-existing, not something the selection-mode fix introduced: the "Quantidade necessária"/"Elegíveis" blocks added earlier were already rendering unstyled on `02c`/`03c` (radio/label rows fell back to inline layout — "same line" — instead of stacking; no border highlight on check). Fixed by copying the missing rule block from `03-service-edit.html` verbatim into both files' `<style>`.

**Legs-mode resource picker rebuilt as a real control, found by the user, 2026-09-18:** each leg card's "Recurso(s) necessário(s)" section previously showed only the resource type(s) the leg already had, as a static list of `checked disabled` checkboxes — no way to add a new resource type to a leg (e.g. give the Sauna leg a Profissional requirement), no eligible-chip add/remove, no selection-mode control, and no JS handler at all for leg-scoped resource interaction. Per `docs/discovery/multivertical-booking/multivertical-booking_DATA_MODEL.md` §6 item 13 (promoted into the live domain doc), `service_leg_resource_requirements` is explicitly the same one-to-many shape as the flat/bundle `service_resource_requirements` — "just nested one level under a leg." Fixed: every leg card now renders the identical 3-row Profissional/Sala/Equipamento checklist used by the flat/bundle picker (checkbox → quantity → eligible chips/add-select → selection-mode radios), reusing the same `toggleResourceType()` handler and CSS classes verbatim — only the pool data and `checked` state differ per leg, and per-leg radio groups are namespaced (`selmode-leg1-staff`, `selmode-leg2-room`, etc.) to avoid cross-leg/flat radio-group collisions. `ServiceLegsPanel.tsx` must reuse the same sub-component `ServiceResourceRequirementsPanel` renders per resource type, scoped per leg index, not a bespoke read-only rendering.

**Not fixed in this pass, flagged as a separate known gap:** the "Remover" (per leg) and "+ Adicionar etapa" buttons remain non-functional static markup — same class of gap the intake-schema question builder had before its round-3 fix (see "UX review fixes, round 3" above). Needs the same treatment (a real `addLeg()`/`removeLeg()`/renumbering implementation) in a future pass — out of scope for the resource-picker fix above.

**Open design question, resolved at `/story-discovery M22-S04`, 2026-09-18:** on `03-service-edit.html`, the Profissional row offers both `CUSTOMER_CHOICE` and `AUTO_ANY`/`AUTO_FUNGIBLE_POOL` as radio options, but Sala and Equipamento each show only one static "Sistema atribui automaticamente" radio with no `CUSTOMER_CHOICE` alternative in the DOM — even though `docs/02-DOMAIN_MODEL.md`'s `selectionMode` enum isn't scoped by resource type, and nothing in the docs says room/equipment selection can't be customer-chosen (e.g. picking a specific therapy room). Decision: the real `ServiceResourceRequirementsPanel` offers all 4 `selectionMode` options uniformly for every resource type — the prototype's Profissional-only restriction is a mockup artifact, not a rule to replicate. Also resolved: `AUTO_ANY` vs. `AUTO_FUNGIBLE_POOL` is never a distinct user-facing choice anywhere in the prototype, and `docs/27-BUSINESS_LOGIC_REFERENCE.md` ties that distinction to `requiredQuantity` rather than independent resolution logic — the real panel derives it (`AUTO_ANY` when `requiredQuantity === 1`, `AUTO_FUNGIBLE_POOL` when `> 1`) behind one "Sistema atribui automaticamente" option, rather than asking.

**Interactivity added, found by the user 2026-09-17:** neither file originally wired the Profissional/Sala/Equipamento checkboxes to anything — checking/unchecking did nothing, so the only way to see "what checking Profissional reveals" was to compare `03-service-edit.html` (checked, showing Quantidade necessária/Elegíveis) against `02c-service-create-success.html` (unchecked, showing nothing) as two separate files. Both now have a real `toggleResourceType(checkbox)` handler that shows/hides each row's own `.nested-selmode` detail on check/uncheck — `02c`'s rows gained the same detail blocks (quantity default 1, an empty "Elegíveis (0)" with a disabled add-select noting no resources are cadastrado yet), just hidden until checked, so the mechanism is now directly explorable in either file rather than requiring a side-by-side comparison. `ServiceResourceRequirementsPanel` must implement the same conditional render (detail fields keyed to `checked`, not a separate empty/configured mode).

**Implementation note — the "Nenhum recurso configurado" empty state is data-driven, not route-driven:** `02c-service-create-success.html`'s Recursos tab shows a prominent `.empty-state` card (icon + title + description) for "zero resource types checked"; `03-service-edit.html`'s Recursos tab only documents the same rule as one line inside its compact hint paragraph ("Nenhuma caixa marcada = modelo de hoje..."), because Massagem Relaxante's example data has all three checked, so that state is never actually rendered there. **These are two static snapshots of one component, not two different behaviors** — `ServiceResourceRequirementsPanel` must render the prominent empty-state card whenever `resourceRequirements.length === 0` (or the flat/bundle checklist otherwise), regardless of whether the page was reached via `/new` → redirect or via editing an already-configured service back down to zero (e.g. an admin unchecks all three boxes on an existing service). Do not gate the empty-state card on "is this newly created."

**Known limitation, removed rather than left as a placeholder:** the OLD `04-service-resource-config.html`'s illustrative, non-functional "Agendamento ⇄ Turma com capacidade" toggle (and its SESSION-model handoff card linking to `manager-06-criar-turma.html`, Cluster 4/not yet promoted) is gone from `03-service-edit.html` — bookingModel is immutable once a service has bookings (UC-056 A1), so an edit-time toggle was never real. The actual UC-056 picker now lives on `02-service-create.html`, where it's a genuine, functional (if currently inert-for-SESSION) creation-time control.

---

## UX review fixes, 2026-09-17 (round 2 — heuristic review across the whole file set)

A full pass against Nielsen-style heuristics found 2 critical issues and several real gaps. All fixed in this round:

**1. Save-scope ambiguity (critical) — fixed with per-tab dirty tracking + in-place saves.** Each tab PATCHes a *different* endpoint (resource-requirements / booking-policy / intake-schema), but nothing showed which tabs had pending changes, and every "Salvar" button navigated to `01-servicos-list.html` — which would have forced a manager to re-open the service after every single tab, defeating the entire point of tabs. Fixed in `03-service-edit.html`, `02c-service-create-success.html`, and `03c-service-edit-inactive.html`:
- Each tab now saves **in place** (no navigation) via `saveTab(tab)` — clears that tab's dirty flag, shows an inline "✓ X salvos" confirmation next to the button.
- A small dot appears on a tab's label (`.tab-dirty-dot`) the moment any field inside it is touched (event-delegated `input`/`change` listener per panel — no per-field wiring needed), and clears when that tab is saved.
- The sticky aside's single save button now dynamically relabels itself ("Salvar Detalhes" / "Salvar Recursos" / "Salvar Políticas de reserva") to the active tab and hides entirely on Formulário de reserva, removing the ambiguity about what it actually submits.
- Publishing a new intake-schema version (`publishIntake()`) updates the version-history list in place (demotes the old "Atual" row, inserts a new one) instead of navigating away.
- `ServiceEditPage`/`ServiceCreatePage`'s real implementation must follow this shape: per-tab save mutations that don't redirect, and a shared dirty-state store the tab bar and aside both read from — not the old single-save-then-navigate pattern this page inherited from pre-M22 `ServiceEditPage.tsx`.

**2. No unsaved-changes warning (critical) — fixed with a `beforeunload` guard.** A manager who configures a bundle + policy + intake questions across several tabs and then navigates away (sidebar, "Voltar à lista", browser back) lost everything silently. All 3 tabbed files now register `window.addEventListener('beforeunload', ...)`, gated on the same dirty-state tracking from #1 — fires the browser's native "leave site?" prompt for ANY navigation path (not just a specific Cancelar button), which is also why this needed no per-link wiring. The real implementation should use the equivalent router-level guard (e.g. Next.js navigation blocking) plus `beforeunload` for hard reloads/tab-close.

**3. `02b-service-create-error.html` never got the booking-model picker.** Same-class bug as the `02c` gaps already caught twice — fixed: added the identical "Modelo de agendamento" section + pickup-toggle-hide logic from `02-service-create.html`, with a hint specific to this screen's context ("preservado ao corrigir o nome").

**4. `03c-service-edit-inactive.html` fully rebuilt with the 4-tab structure.** Previously a single-panel, pre-M22 screen with no Recursos/Políticas/Formulário at all. Reasoning: deactivating a service clears none of its resource requirements/booking policy/intake schema, so a manager should be able to review or finish configuring those while the service is inactive (e.g. preparing a new service fully before ever activating it). Kept BeloAuto/"Polimento + Higienização" branding (matches what `01-servicos-list.html`'s inactive row already represented) rather than switching to Vitta Studio — closes the previously-deferred rebrand item, just not the way originally planned. Recursos/Políticas/Formulário reuse the same empty/default-state design as `02c` (same data shape: a plain, never-customized car-wash service), which is now proven twice over as "the empty state is data-driven, not route-driven."

**5. `01-servicos-list.html`:**
- Added a `.badge-turma` badge (shown only for `bookingModel = SESSION`, same convention as `badge-pickup`) — the field was already in `StaffServiceResponse`/`StaffServiceListResponse` (confirmed via `/docs-audit`), so this is a pure UI addition, no contract gap. Added a 5th example row ("Workshop de Detalhamento", Turma) since none of the original 4 services could demonstrate it.
- Fixed the inactive row's link — it pointed at `03-service-edit.html` (the active-service file) instead of `03c-service-edit-inactive.html`. Every other row's link is a deliberate "an edit page looks like this" stand-in (no real per-row routing exists in a static prototype), but for this one row specifically that convention was actively wrong once `03c` became a real, distinct variant.

**6. New `03e-service-edit-intake-error.html`** — the Formulário de reserva tab had no error-state variant at all. Demonstrates 2 real `PublishServiceIntakeSchemaSchema` 422s (0 questions, empty consent text) simultaneously. A third real case (duplicate `fieldKey` across 2+ questions) isn't separately mocked — noted below as a design case, not a missing screen, since the question builder already auto-derives `fieldKey` from the label.

**7. Corrected the buffer field's "disabled + Herdado" treatment in `02c`/`03c`.** Per M22-S01's story-discovery decision, `bufferAfterMinutes` is snapshotted as a real, concrete value from the tenant's default **at creation time** — it is never left null/dynamically-inherited the way the other booking-policy fields are. The field was wrongly shown `disabled` with an "Herdado do padrão do negócio" badge, implying a dynamic-inheritance behavior it doesn't have; now shown as a normal editable field pre-filled with the snapshotted value, with a hint clarifying where the initial value came from. (The Políticas de reserva tab's actual inherited/null fields — approval mode, cancellation window, advance-notice — are unaffected; those genuinely do stay null until explicitly overridden, per `docs/02-DOMAIN_MODEL.md`'s own Service aggregate comment.)

**8. Merged the Duração/Preço cards** in `03-service-edit.html`/`03d-service-edit-policy-error.html` into one "Duração e preço" card — 2 card headers of overhead for what's almost always the Fixed/Fixed case, and Preço is entirely dependent on Duração's value anyway.

**9. Added ARIA roles** (`role="tablist"`/`"tab"`/`"tabpanel"`, `aria-selected`, `aria-controls`/`aria-labelledby`) to every tabbed file's tab bar, matching the real coded precedent (`HotsiteEditorMainView.tsx`) this pattern was copied from — the prototype previously didn't demonstrate the semantics its own precedent already has.

**10. Added mobile short tab labels** (`.tab-label-full`/`.tab-label-short`, swapped via a `max-width: 480px` media query) — "Políticas de reserva" and "Formulário de reserva" are long enough to risk scrolling off-screen on a narrow phone with no visual cue there's a 4th tab.

**11. No shared empty-state component exists to reuse.** `apps/web/features/customer/components/my-account/BookingEmptyState.tsx` is the closest precedent (identical icon+title+description+CTA shape) but is tightly coupled to one use case and Customer-feature-scoped — per `CLAUDE.md`'s slice-ownership rule, Booking/Services shouldn't import across features for this. `ServiceResourceRequirementsPanel`/`ServiceIntakeSchemaPanel` need their own local empty-state treatment (or a new one promoted to `shared/` only once a second consumer needs the identical shape — same promotion bar as the lock-port precedent in `docs/ENGINEERING_RULES.md`).

**Open questions / gaps:**
- [x] Story assigned — `M22-S04`, see `plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md`. `/story-discovery M22-S04` not yet run.
- [x] UC-054 (intake schema) now has a prototype screen (`03-service-edit.html`'s "Formulário de reserva" tab) — still confirm the exact layout with the user during `/story-discovery M22-S04` since it's genuinely new UI.
- [x] The missing intake-schema read path (above) — resolved at `/story-discovery M22-S04`, 2026-09-18: folded a new `GET /services/:id/intake-schema` endpoint into this story's own scope (`Agent:` now spans `frontend-ts` + `backend-ts` + `bff-ts`).
- [x] `03c-service-edit-inactive.html` rebuilt with the full 4-tab structure (round 2, above) — resolved, kept BeloAuto branding rather than switching to Vitta Studio.
- [ ] `03b-deactivate-confirm.html` still references the old BeloAuto/"Lavagem Completa Detalhada" branding (a *different* service than `03c`'s own "Polimento + Higienização") — still deferred; lower priority since it's a single confirmation screen, not a multi-tab config surface.
- [ ] A duplicate-`fieldKey` intake-schema error case (2+ questions with the same auto-derived key) is a real 422 with no dedicated prototype screen — noted as a design case for the implementing story, not built as a separate file (round 2, item 6 above).

---

## UX review fixes, round 3 (2026-09-17 — user testing found 2 more real gaps)

**12. The question-list builder was entirely non-functional everywhere.** "+ Adicionar pergunta" and each question's "×"/↑/↓ buttons existed only as static markup — clicking any of them did nothing, in `03-service-edit.html` and (worse) `02c-service-create-success.html`'s Formulário de reserva tab didn't even have a builder, just a CTA linking out to look at `03`'s example instead of letting the admin start their own. Found via user testing: *"there is no way to create a single question?"* Fixed with a real, shared implementation (`addQuestion`/`removeQuestion`/`moveQuestion`/`renumberQuestions`) across `03-service-edit.html`, `02c-service-create-success.html`, and `03c-service-edit-inactive.html`:
- `+ Adicionar pergunta` appends a real blank question card (order-numbered, ↑/↓/× all wired, first/last position auto-disables the edge direction).
- The `fieldKey` hint added in round 2 (a static, read-only string) now live-updates as the label is typed, via `slugifyFieldKey()` — accent-stripping, camelCase, matching how the real `fieldKey` auto-derivation would behave.
- `02c`/`03c` previously had no question builder at all (just the empty-state CTA) — now have the identical builder, starting genuinely empty, plus a `publishFirstIntakeVersion()` action gated on "≥1 question AND non-empty consent text" (button stays disabled with a hint explaining which condition is missing), since this is a brand-new/never-configured service publishing its *first* version, not republishing an existing one.
- The real `ServiceIntakeSchemaPanel` must implement the identical shape: a live client-side `fieldKey` preview (even though the source of truth is server-derived), and add/remove/reorder that mutates local form state before any submit — not the round-2 version's static, read-only cards.

**13. No way to see what an older intake-schema version actually contained.** The version-history list (`03-service-edit.html`) showed "Versão 1 — Substituída" with nothing behind it — no way to check what it had before publishing a replacement. Found via user testing: *"there is no way to see older versions? at least a simple popup dialog?"* Fixed with a simple read-only modal (`.version-modal`/`.modal-backdrop`, closes on backdrop click or Escape):
- Clicking any non-current `.version-history-row` opens the dialog showing that version's questions (label/type/required) and consent text — read-only, matching UC-054 A1 (a past version is never editable, only ever superseded).
- `publishIntake()` now captures a snapshot of the live form (`captureCurrentIntakeSnapshot()`) into `VERSION_SNAPSHOTS` *before* demoting the current version, and makes that demoted row clickable too — so every version that has ever been "current" in a session becomes viewable, not just the one hardcoded Versão 1 example.
- The real implementation needs an actual historical-version read endpoint to back this (see the "Real functional gap" note above — `GET /services/:id/intake-schema` or similar) — the prototype's `VERSION_SNAPSHOTS` object is a client-side stand-in for what that endpoint would return per version.
