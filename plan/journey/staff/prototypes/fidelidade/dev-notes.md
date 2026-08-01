# Dev Notes — STAFF: Fidelidade (Customer Loyalty Lookup)

## Overview

Staff and managers can look up any customer's loyalty balance, earning history, and redemption history from `/dashboard/loyalty`. Fully shipped (`M13-S25`, ✅ Done). Updated 2026-07-31 after a docs audit found this file still described the journey as unbuilt and got several real details wrong (route shape, tab naming, missing states).

## File map

| File | Status |
|---|---|
| `apps/web/app/dashboard/loyalty/page.tsx` | ✅ Exists |
| `apps/web/app/dashboard/loyalty/[customerId]/page.tsx` | ✅ Exists — path segment, not a query param |
| `apps/web/features/loyalty/components/dashboard/LoyaltySearchPage.tsx` | ✅ Exists |
| `apps/web/features/loyalty/components/dashboard/CustomerLoyaltyPage.tsx` | ✅ Exists |
| `apps/web/features/loyalty/dashboard-api.ts` (`getCustomerLoyaltyEntries`, `getCustomerLoyaltyRedemptions`) | ✅ Exists |
| `apps/web/features/customer/api` (`searchCustomers`) | ✅ Exists |

## Screen 00 — Customer Search (`LoyaltySearchPage`)

**Route:** `/dashboard/loyalty`
**File:** `apps/web/app/dashboard/loyalty/page.tsx` + `features/loyalty/components/dashboard/LoyaltySearchPage.tsx` (`'use client'`)

**BFF call:**
```
GET /v1/customers?search=:term&limit=:limit
Headers: X-Actor-Role: STAFF|MANAGER, X-Tenant-ID, X-Actor-ID
Response: CustomerSearchListResponse { items: [{ customerId, name, email, currentPoints }], total }
```

**States (real, all implemented):**
- Default (no search, `debouncedSearch === ''`): "Clientes recentes" — `limit=5`
- Typing: 300ms debounce before firing the request
- Loading: `LoyaltySearchSkeleton` — 3 skeleton rows (see `00b-loading.html`)
- Results: "Resultados para {term}" — `limit=20`, customer rows link to `/dashboard/loyalty/{customerId}`
- No results: empty state, `t('noResultsTitle')`/`t('noResultsBody')` (see `01c-no-results.html`)
- Fetch error: empty state reused with `t('searchErrorTitle')` + the resolved API error message (see `00c-search-error.html`)
- Avatar background cycles through 5 fixed colors by row index (`bg-blue-600`/`violet-600`/`cyan-600`/`amber-600`/`pink-600`) — not tenant-branded.

## Screen 01 — Customer Loyalty Detail (`CustomerLoyaltyPage`)

**Route:** `/dashboard/loyalty/[customerId]` — **path segment, not `?customerId=`** (an earlier draft of this journey assumed a query param; corrected 2026-07-31). Active tab is a query param: `?tab=redemptions` (default `entries`, omitted from the URL).
**File:** `apps/web/app/dashboard/loyalty/[customerId]/page.tsx` + `features/loyalty/components/dashboard/CustomerLoyaltyPage.tsx`

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

**States (real, all implemented):**
- Loaded with entries: balance card (fixed blue-600→800 gradient — NOT `--ba-primary`, this page is tenant-agnostic) + tabs with entry/redemption lists
- Loaded with zero points: flat gray-100 balance card. **Tabs stay visible** — each independently renders its own empty state (star icon for entries, circle-slash icon for redemptions) via the shared `EmptyState` component. There is no single combined "sem pontos" screen that replaces the tabs (see `01b-no-entries.html`).
- Header (avatar + name/email) and the balance card sit side-by-side on desktop (`lg:flex-row lg:items-center lg:justify-between`), stacked on mobile.

**Balance card:**
- `conversionRate` on `EnrichedLoyaltyBalanceResponse` (sourced from `pointsPerCurrencyUnit`) drives the "10 pts = R$ 1,00 · Valor total: R$ X" line, shown only when `conversionRate > 0`.
- Avatar background is fixed `bg-blue-600`, not tenant-branded.

**Tabs:**
- URL param is `?tab=entries|redemptions` (default `entries`, omitted from URL when active) — NOT `earn`/`redeem`.
- "Histórico de ganhos" (`entries`): sorted `earnedAt DESC`; active entries show a green "ativo" badge, expired show a grey "expirado" badge at reduced opacity. Each entry with a `bookingId` links to `/dashboard/bookings/{bookingId}` (with a `returnTo` param back to this tab) — this per-entry link was missing from an earlier draft of this screen.
- "Resgates" (`redemptions`): sorted `redeemedAt DESC`; title is `redemption.notes?.trim() || t('redemptionDefaultTitle')`; same per-item booking link when `bookingId` is present.
- "Carregar mais" button appears per-tab when `total > items.length` (no infinite scroll).

## API client

`apps/web/features/loyalty/dashboard-api.ts`:
```typescript
getCustomerLoyaltyEntries(customerId, { page, limit }): Promise<PaginatedLoyaltyEntriesResponse>
// GET /v1/customers/:customerId/loyalty/entries?page=:page&limit=:limit

getCustomerLoyaltyRedemptions(customerId, { page, limit }): Promise<PaginatedLoyaltyRedemptionsResponse>
// GET /v1/customers/:customerId/loyalty/redemptions?page=:page&limit=:limit
```
`apps/web/features/customer/api`:
```typescript
searchCustomers(term?: string, limit?: number): Promise<CustomerSearchListResponse>
// GET /v1/customers?search=:term&limit=:limit
```

## `@ikaro/types` — current shape

`packages/types/src/loyalty.dto.ts` matches the BFF staff-facing loyalty responses used by this page:
- `EnrichedLoyaltyBalanceResponse` exposes `currentPoints`, `nextExpiryDate`, `nextExpiryPoints`, and `conversionRate`
- `PaginatedLoyaltyEntriesResponse` exposes `items[]` with `serviceName`, `points`, `earnedAt`, `expiresAt`, `isActive`, `bookingId?`
- `PaginatedLoyaltyRedemptionsResponse` exposes `items[]` with `amountDeducted`, `bookingId?`, and `notes?`

## Known limitations

- **Entry into this page from booking detail:** UC-003 already shows the customer's balance in the booking detail card, but there's no "Ver histórico completo →" link from there into `/dashboard/loyalty/[customerId]` yet — still an open discoverability gap, not addressed by this story.
