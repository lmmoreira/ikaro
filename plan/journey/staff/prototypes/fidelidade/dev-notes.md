# Dev Notes — STAFF: Fidelidade (Customer Loyalty Lookup)

## Overview

Staff and managers can look up any customer's loyalty balance, earning history, and redemption history from `/dashboard/loyalty`. Balance/entries/redemptions endpoints are already implemented in the backend and BFF (M10). The customer-search endpoint and the loyalty conversion-rate enrichment are scoped and resolved by `M13-S12` (in `plan/M13-DASHBOARD-FRONTEND.md`) — `M13-S25` treats "Confirm M13-S12 has shipped" as a discovery step, i.e. a settled dependency, not an open question.

## File map

| File | Status | Action |
|---|---|---|
| `apps/web/app/dashboard/loyalty/page.tsx` | ❌ GAP | Create — customer search page |
| `apps/web/components/dashboard/loyalty/LoyaltySearchPage.tsx` | ❌ GAP | Create — search + results list |
| `apps/web/components/dashboard/loyalty/CustomerLoyaltyPage.tsx` | ❌ GAP | Create — balance + tabs |
| `apps/web/lib/api/dashboard/loyalty.ts` | ❌ GAP | Create — BFF fetchers |

## Screen 00 — Customer Search (`LoyaltySearchPage`)

**Route:** `/dashboard/loyalty`  
**File:** `apps/web/app/dashboard/loyalty/page.tsx` + `components/dashboard/loyalty/LoyaltySearchPage.tsx` (`'use client'`)

**BFF call:**
```
GET /v1/customers?search=:term
Headers: X-Actor-Role: STAFF|MANAGER, X-Tenant-ID, X-Actor-ID
Response: { items: CustomerSearchResult[], total: number }
  CustomerSearchResult: { customerId, name, email, currentPoints }
```

> 🔍 **Verify before starting:** `GET /v1/customers?search=` is scoped and resolved by `M13-S12` (`apps/bff/src/customers/customers.controller.ts`, Part A — staff-facing customer search). Confirm `M13-S12` has shipped before starting this story (per `M13-S25`'s discovery step) rather than treating the endpoint as an open question.

**States:**
- Default (no search): show "Clientes recentes" — last 5 customers who had bookings, from cache or a `GET /v1/customers?recent=true&limit=5` call
- Results: customer rows with name, email, active points badge
- No results: empty state with message (see `01c-no-results.html`)

**Prototype note:** `00-customer-search.html` filters the in-memory mock list synchronously on every keystroke (`oninput`) — no debounce, no loading-skeleton state. At the customer counts a single-tenant car wash will realistically have (tens to low hundreds), a `GET /v1/customers?search=` round-trip is fast enough that a skeleton state is unlikely to be needed; revisit only if real-world usage shows otherwise. If the production implementation does add server-side debounced search, add a `b-loading` skeleton variant screen at that time per the README's "Unhappy path variant screens" checklist.

## Screen 01 — Customer Loyalty Detail (`CustomerLoyaltyPage`)

**Route:** `/dashboard/loyalty?customerId=:id`  
**File:** `apps/web/app/dashboard/loyalty/page.tsx` (reads `searchParams.customerId`) + `components/dashboard/loyalty/CustomerLoyaltyPage.tsx`

**BFF calls (all in parallel on mount):**
```
GET /v1/customers/:customerId/loyalty/balance
  → { currentPoints: number, nextExpiryDate: string|null, nextExpiryPoints: number|null }

GET /v1/customers/:customerId/loyalty/entries?page=1&limit=20
  → { items: LoyaltyEntryItem[], total, page, limit }
  LoyaltyEntryItem: { id, serviceName, points, earnedAt, expiresAt, isActive }
  Note: isActive = expiresAt > now(), computed by GetLoyaltyEntriesUseCase

GET /v1/customers/:customerId/loyalty/redemptions?page=1&limit=20
  → { items: LoyaltyRedemptionItem[], total, page, limit }
  LoyaltyRedemptionItem: { id, pointsRedeemed, amountDeducted, redeemedAt, bookingId?, notes? }
```

All three require `X-Actor-Role: STAFF|MANAGER`.

**States:**
- Loading: skeleton for balance card + 3 skeleton rows
- Loaded with entries: balance card (gradient) + tabs with entry/redemption lists
- Loaded with zero points: muted balance card (grey) + empty state message (see `01b-no-entries.html`)

**Balance card:**
- `points_per_currency_unit` needed for "Valor total: R$ X" line — **resolved by `M13-S12`**: the BFF balance response (`getBalanceAdmin()` and `getBalance()`) is enriched with a `conversionRate` field (`EnrichedLoyaltyBalanceResponse`), sourced from `TenantContext.settings.loyalty.points_per_currency_unit`. No extra settings call needed.

**Tabs:**
- "Histórico de ganhos" tab: sorted by `earnedAt DESC`; active entries bold, expired entries at 50% opacity with "expirado" badge
- "Resgates" tab: sorted by `redeemedAt DESC`; shows linked booking reference when `bookingId` present
- Load more: "Carregar mais" button when `total > items.length` (no infinite scroll for MVP)

## `apps/web/lib/api/dashboard/loyalty.ts`

```typescript
searchCustomers(term: string): Promise<CustomerSearchResult[]>
// GET /v1/customers?search=:term  (verify endpoint exists)

fetchCustomerLoyaltyBalance(customerId: string): Promise<CustomerLoyaltyBalanceResponse>
// GET /v1/customers/:customerId/loyalty/balance

fetchCustomerLoyaltyEntries(customerId: string, page?: number): Promise<PaginatedLoyaltyEntriesResponse>
// GET /v1/customers/:customerId/loyalty/entries?page=:page&limit=20

fetchCustomerLoyaltyRedemptions(customerId: string, page?: number): Promise<PaginatedLoyaltyRedemptionsResponse>
// GET /v1/customers/:customerId/loyalty/redemptions?page=:page&limit=20
```

## @ikaro/types — stale shape (fix required before implementing)

`packages/types/src/loyalty.dto.ts` exports `LoyaltyBalanceResponse` with shape `{ tenantId, customerId, activePoints, entries[] }` — this is **stale**. The actual BFF response is `{ currentPoints, nextExpiryDate, nextExpiryPoints }`. The BFF currently defines its own `LoyaltyBalanceResponse` in `apps/bff/src/loyalty/loyalty.types.ts`. Before building the frontend:
1. Update `packages/types/src/loyalty.dto.ts` to match the actual BFF shape
2. Remove `LoyaltyEntryResponse` from the shared types (BFF has a richer `LoyaltyEntryItem` with `serviceName` and `isActive`) or extend it

## Known limitations / open questions

- **Customer search endpoint:** not confirmed to exist in the BFF. Must verify before starting. If missing, add `GET /v1/customers?search=` to the customer or staff BFF module (simple ILIKE query on `name` + `email`, scoped to `tenantId`, requires `STAFF|MANAGER`).
- **`conversionRate` in balance response:** the frontend needs `points_per_currency_unit` to show "= R$ X". Confirm whether BFF includes it in the balance response or whether a separate settings call is needed.
- **Entry into this page from booking detail:** UC-003 already shows the customer's balance in the booking detail card. A "Ver histórico completo →" link pointing to `/dashboard/loyalty?customerId=:id` would make this page more discoverable — add to M125-S05 scope or this story.
