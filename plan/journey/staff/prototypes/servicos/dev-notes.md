# Serviços — Dev Notes

**Journey:** STAFF — Serviços (Service Catalog Management)  
**UCs:** UC-012 (create), UC-013 (edit / deactivate)  
**Prototype:** `staff/prototypes/servicos/`

---

## Routes

| Prototype file | Production route | Page component |
|---|---|---|
| `01-servicos-list.html` | `/dashboard/services` | `ServiceListPage` |
| `02-service-create.html` | `/dashboard/services/new` | `ServiceFormPage` (create mode) |
| `03-service-edit.html` | `/dashboard/services/[id]/edit` | `ServiceFormPage` (edit mode) |
| `03b-deactivate-confirm.html` | `/dashboard/services/[id]/deactivate` or bottom-sheet | `DeactivateConfirmPage` or `DeactivateSheet` |

> ⚠️ **Open question:** Deactivation UX — dedicated page (this prototype) vs. inline bottom sheet on the edit form. Decide before implementing `M13-S24`.

---

## BFF calls

| Action | Method + Path | Role guard | Request body | Success |
|---|---|---|---|---|
| List services | `GET /v1/services` | STAFF \| MANAGER | — | `ServiceListResponse` |
| Get single service | `GET /v1/services/:id` | STAFF \| MANAGER | — | `ServiceDetailResponse` |
| Create service | `POST /v1/services` | STAFF \| MANAGER | `CreateServiceDto` | `201 ServiceDetailResponse` |
| Update service | `PATCH /v1/services/:id` | STAFF \| MANAGER | `UpdateServiceDto` | `200 ServiceDetailResponse` |
| Deactivate service | `DELETE /v1/services/:id` | STAFF \| MANAGER | — | `200` |

`POST`/`PATCH`/`DELETE` are likely already existing (built in M05). `GET /v1/services` (staff list including inactive) and `GET /v1/services/:id` are endpoints to verify-or-add, not confirmed-existing — `M13-S05` treats discovering/filling these as its explicit scope. Verify shapes match `@ikaro/types` before using.

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

## Deactivate flow

```
Staff clicks "Desativar serviço" (danger zone button)
  → navigate to /dashboard/services/[id]/deactivate
  → render DeactivateConfirmPage with service summary card
  → "Confirmar" → DELETE /v1/services/:id → 200
    → router.push('/dashboard/services')
    → list shows service with isActive = false badge "Inativo"
  → "Cancelar" → router.back()
```

---

## Reactivation (open question)

The `PATCH /v1/services/:id` endpoint accepts `{ isActive: true }` so reactivation is supported by the API. The prototype does not include a reactivation UI (inactive service in the list is greyed out; clicking it goes to the same edit form). Add an "Ativar serviço" button in the edit form's danger zone when `isActive === false`. Confirm scope before implementing.

---

## Missing types

- `ServiceListResponse`, `ServiceListItem` may not exist in `@ikaro/types` (only added during M05 for public hotsite use). Audit `packages/types/src/service.dto.ts` and add staff-facing shapes if needed.
