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

## ❓ GAP — M21 Cluster 2 extension (UC-050–056, not yet built)

> Everything above this line is shipped (`M13-S22`–`S24`). Everything below is new, unimplemented scope promoted from `docs/discovery/multivertical-booking/`. See `docs/02-DOMAIN_MODEL.md` § Booking Context (`Service` aggregate) and `docs/14-API_CONTRACTS.md` § Service Extensions for the full contract.

**New prototype screens (relocated from the discovery folder):**

| File | Screen | UC |
|---|---|---|
| `04-service-resource-config.html` | Resource requirements, bundles, legs, buffer — one config section per model | UC-050, 051, 052, 053 |
| `05-service-booking-policies.html` | Approval mode, hold, cancellation/reschedule windows, variable-duration/pricing | UC-055 |
| `05b-service-booking-policies-erro.html` | Error — `CUSTOMER_SELECTED` duration without a pricing policy | UC-055 A2 |

**File map (❓ none exist yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/components/dashboard/services/ServiceResourceConfigSection.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/services/ServiceLegsSection.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/services/ServiceBookingPolicyForm.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/services/ServiceIntakeSchemaForm.tsx` | ❓ Gap — **no discovery screen exists for this** (UC-054); design from the existing form patterns on this page, not from scratch |

**BFF calls (new endpoints — see `docs/14-API_CONTRACTS.md` § Service Extensions for full request/response shapes):**
```
PATCH /v1/services/:id/resource-requirements   -- UC-050/051
PUT   /v1/services/:id/legs                    -- UC-052
PATCH /v1/services/:id                         -- UC-053 (bufferAfterMinutes, existing endpoint, new field)
POST  /v1/services/:id/intake-schema           -- UC-054
PATCH /v1/services/:id/booking-policy          -- UC-055
POST  /v1/services                             -- UC-056 (bookingModel, existing endpoint, new field)
```

**Known limitation, found during this promotion:** `04-service-resource-config.html`'s SESSION-model handoff card links to `manager-06-criar-turma.html` (Cluster 4, not yet promoted) — left as a documented gap, not a placeholder guess.

**Open questions / gaps:**
- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] UC-054 (intake schema) has no prototype screen at all — the implementing story must design it from this page's existing form patterns.
