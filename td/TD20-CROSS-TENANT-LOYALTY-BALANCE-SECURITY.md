# TD20 — Cross-Tenant Loyalty Balance: Remove Client-Supplied `customerId`

## Status
- **Type**: Security / Architecture
- **Priority**: Medium (requires valid JWT + knowledge of target UUIDs; no direct public exposure, but defence-in-depth gap)
- **Contexts affected**: `loyalty` (backend), `customers` (BFF)
- **Discovered**: 2026-07-01 (Copilot review on PR #72 / `feat/td17-requestcontext-decoupling`)

---

## Problem

`GET /customers/:customerId/loyalty/balance` accepts an optional `?tenantId` query param that enables cross-tenant reads. The controller uses it to support the switch-tenant screen (UC-023): the BFF's `getTenants()` calls this endpoint once per tenant to fetch the customer's loyalty points across all their tenants.

When `tenantId ≠ JWT tenant` (a cross-tenant call), the controller currently skips the ownership check entirely:

```typescript
// loyalty.controller.ts:120-123
const isCrossTenantCall = effectiveTenantId !== contextTenantId;
if (actorRole === 'CUSTOMER' && !isCrossTenantCall && actorId !== customerId) {
  throw new ForbiddenException();   // only enforced for same-tenant calls
}
```

This means any authenticated CUSTOMER can craft:
```
GET /customers/{anyCustomerId}/loyalty/balance?tenantId={anyTenantId}
```
and read another customer's loyalty balance in any tenant — bypassing the ownership guard by simply supplying an arbitrary `?tenantId`.

The comment in the code says "Cross-tenant calls come from the BFF's getTenants() which already validated the tenant list" — but this trust is not enforced at the backend boundary. The backend accepts the `customerId` from the client at face value.

---

## Root Cause

The endpoint was designed to serve two callers with different semantics:

| Caller | Role | Intent |
|---|---|---|
| `GET /customers/:id/loyalty/balance` (no `tenantId`) | STAFF/MANAGER | Admin reads any customer's balance in their own tenant |
| `GET /customers/:id/loyalty/balance?tenantId=X` | CUSTOMER (via BFF) | Customer reads their own balance in a different tenant |

For the admin case, the customer-ownership check is intentionally skipped (staff can read any customer). For the customer cross-tenant case, the check was also skipped — but incorrectly, since a customer should only ever read *their own* balance.

---

## Fix

### Chosen approach: self-referential endpoint (Option A)

Change the cross-tenant customer read to never accept a client-supplied `customerId`. Instead, the backend derives the cross-tenant customer ID from the JWT actor's Google OAuth ID.

**New backend endpoint:**
```
GET /loyalty/balance?tenantId=X      ← customer reads own balance in any tenant
GET /loyalty/balance                 ← customer reads own balance in home tenant (existing)
```

The existing `GET /customers/:customerId/loyalty/balance` is kept **for staff only** (MANAGER/STAFF guard), without the cross-tenant `?tenantId` override — it was never needed for the admin read path.

#### Backend changes — `loyalty.controller.ts`

1. **`getBalance()`** — extend to accept optional `?tenantId`. The controller stays limited to request extraction and error mapping (per-layer rule: controllers call exactly one use case) — cross-tenant resolution plus balance retrieval is orchestrated by a new `GetOwnLoyaltyBalanceUseCase` (see below), not inline in the controller:

```typescript
@Get('loyalty/balance')
@UseGuards(CustomerRoleGuard)
async getBalance(
  @Query(new ZodValidationPipe(CrossTenantQuerySchema)) { tenantId }: CrossTenantQueryDto,
): Promise<EnrichedLoyaltyBalanceResult> {
  const { tenantId: contextTenantId, actorId, settings } = this.tenantContext;
  const { balance, isCrossTenant } = await this.getOwnLoyaltyBalance
    .execute({ contextTenantId, targetTenantId: tenantId ?? contextTenantId, actorId: actorId! })
    .catch(mapLoyaltyError);
  return {
    ...balance,
    conversionRate: isCrossTenant ? null : settings.loyalty.pointsPerCurrencyUnit,
  };
}
```

**New use case — `GetOwnLoyaltyBalanceUseCase`** (`application/use-cases/get-own-loyalty-balance/get-own-loyalty-balance.use-case.ts`, added in code review — CodeRabbit flagged the port being injected directly into the controller as a layering violation): takes `{ contextTenantId, targetTenantId, actorId }`, decides whether the call is cross-tenant, resolves the customer via `ILoyaltyCustomerPort` only when it is, then delegates to `GetLoyaltyBalanceUseCase`. This keeps `LOYALTY_CUSTOMER_PORT` injected into the application layer (a use case), never into `LoyaltyController` directly — matching every other use case/port pairing in this codebase.

2. **`getBalanceAdmin()`** — remove `CrossTenantQueryDto` and `?tenantId` override. Guard with `StaffOrManagerRoleGuard` only. Clean up the dead `isCrossTenantCall` logic:

```typescript
@Get('customers/:customerId/loyalty/balance')
@UseGuards(StaffOrManagerRoleGuard)
getBalanceAdmin(
  @Param('customerId', ParseUUIDPipe) customerId: string,
): Promise<GetLoyaltyBalanceUseCaseResult> {
  return this.getLoyaltyBalance
    .execute({ tenantId: this.tenantContext.tenantId, customerId })
    .catch(mapLoyaltyError);
}
```

#### New cross-context adapter — `LoyaltyCustomerAdapter`

Add `apps/backend/src/contexts/loyalty/infrastructure/cross-context/loyalty-customer.adapter.ts`:

```typescript
export const LOYALTY_CUSTOMER_PORT = Symbol('ILoyaltyCustomerPort');

export interface ILoyaltyCustomerPort {
  // Given a customer ID in their home tenant, returns their customer ID
  // in the target tenant (same Google user, different tenant row).
  // Throws CustomerNotFoundInTargetTenantError if the user has no record there.
  resolveCustomerIdByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
  ): Promise<string>;
}
```

**Implementation note (settled in story-discovery, 2026-07-17):** every existing cross-context adapter in this codebase (`BookingCustomerAdapter`, `NotificationCustomerAdapter`, `LoyaltyBookingAdapter`) depends on the owning context's **use case**, never injects another context's repository port directly. `LoyaltyCustomerAdapter` follows the same pattern — and the customer context already has a use case that does exactly the two-step resolution this adapter needs:

```typescript
@Injectable()
export class LoyaltyCustomerAdapter implements ILoyaltyCustomerPort {
  constructor(private readonly getCustomerTenantsById: GetCustomerTenantsByIdUseCase) {}

  async resolveCustomerIdByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
  ): Promise<string> {
    const tenants = await this.getCustomerTenantsById.execute({
      customerId: homeCustomerId,
      tenantId: homeTenantId,
    });
    const match = tenants.find((t) => t.tenantId === targetTenantId);
    if (!match) throw new LoyaltyCustomerNotFoundInTenantError();
    return match.customerId;
  }
}
```

`GetCustomerTenantsByIdUseCase` (`apps/backend/src/contexts/customer/application/use-cases/get-customer-tenants-by-id.use-case.ts`) already looks up the home customer, resolves their `googleOAuthId`, and returns `CustomerTenantSummary[]` (`{tenantId, customerId}` pairs) across all their tenants — no new customer-context use case or repository method needed. This is also a strictly better security posture than a direct-repo implementation: the OAuth ID never leaves the customer bounded context.

**Wiring required:**
- `CustomerModule` (`customer.module.ts`) — add `GetCustomerTenantsByIdUseCase` to `exports:` (currently only `GetCustomerByIdUseCase` is exported)
- `LoyaltyModule` (`loyalty.module.ts`) — add `CustomerModule` to `imports:` (precedent: `BookingModule` already imports `CustomerModule` this way), register `LoyaltyCustomerAdapter` under `LOYALTY_CUSTOMER_PORT`, and remove the now-dead `AnyAuthenticatedRoleGuard` import/provider (only used by the old `getBalanceAdmin()` guard)
- New domain error `LoyaltyCustomerNotFoundInTenantError extends LoyaltyDomainError` in `loyalty-domain.error.ts`, mapped to `404` in `loyalty-error.mapper.ts`
- New `LoyaltyErrorCode` entry in `packages/types/src/error-codes.ts` (currently only `INVALID_POINTS` / `INSUFFICIENT_POINTS` / `BALANCE_NOT_FOUND`)

#### BFF changes — `customers.controller.ts`

`getTenants()` stops passing `customerId` to the balance endpoint. It calls the new self-referential endpoint instead:

```typescript
// Before
...tenants.map((t) =>
  this.backendHttp.get<{ currentPoints: number }>(
    `/customers/${t.customerId}/loyalty/balance`,
    { tenantId: t.tenantId },           // ← cross-tenant override via customerId
  ),
),

// After
...tenants.map((t) =>
  this.backendHttp.get<{ currentPoints: number }>(
    `/loyalty/balance`,
    { tenantId: t.tenantId },           // ← backend resolves customerId itself
  ),
),
```

`searchCustomers()` is unaffected — it is STAFF-scoped and calls `getBalanceAdmin` (still passes `customerId`, now staff-only).

---

## Why not Option B (verify ownership in-place)?

Option B keeps the current API shape and adds a cross-context check inline:

```typescript
const actor = await customerRepo.findById(actorId, contextTenantId);
const target = await customerRepo.findByTenantAndOAuthId(effectiveTenantId, actor.googleOauthId);
if (!target || target.id !== customerId) throw new ForbiddenException();
```

This also costs 2 DB queries per cross-tenant call but:
- Requires injecting a cross-context customer port into the loyalty controller (same adapter work as Option A)
- Keeps `customerId` as a client-supplied value (bad API design even if validated)
- The BFF still passes `customerId` unnecessarily; the backend then verifies and ignores it

Option A is strictly better: it eliminates the client-supplied `customerId` from the customer read path, which is the correct semantic ("read MY balance").

---

## Performance note

Both options add **2 DB queries** per tenant on the switch-tenant screen (home customer lookup + target tenant lookup). For a customer with N tenants, that's 2N extra queries on the `GET /customers/tenants` BFF call.

Mitigation (post-MVP): batch the resolution into a single query — given a `googleOauthId`, fetch all `(tenantId, customerId)` pairs in one `WHERE google_oauth_id = $1` scan. This is already possible via `customerRepo.findAllTenantsByOAuthId()` which the `GetCustomerTenantsUseCase` uses for `/customers/me/tenants`. The resolution step could reuse that result instead of doing per-tenant lookups.

---

## Affected files

| File | Change |
|---|---|
| `apps/backend/src/contexts/loyalty/infrastructure/controllers/loyalty.controller.ts` | Extend `getBalance()` with optional `?tenantId`, delegating to `GetOwnLoyaltyBalanceUseCase`; strip cross-tenant logic from `getBalanceAdmin()`; guard `getBalanceAdmin()` with `StaffOrManagerRoleGuard` instead of `AnyAuthenticatedRoleGuard` |
| `apps/backend/src/contexts/loyalty/application/use-cases/get-own-loyalty-balance/get-own-loyalty-balance.use-case.ts` + `.spec.ts` | New use case — orchestrates cross-tenant customer resolution + balance retrieval, keeping the port out of the controller |
| `apps/backend/src/contexts/loyalty/infrastructure/cross-context/loyalty-customer.adapter.ts` | New port + adapter (depends on `GetCustomerTenantsByIdUseCase`) |
| `apps/backend/src/contexts/loyalty/infrastructure/cross-context/loyalty-customer.adapter.spec.ts` | New unit tests |
| `apps/backend/src/contexts/loyalty/domain/errors/loyalty-domain.error.ts` | New `LoyaltyCustomerNotFoundInTenantError` |
| `apps/backend/src/contexts/loyalty/infrastructure/http/loyalty-error.mapper.ts` | Map new error → 404 |
| `apps/backend/src/contexts/loyalty/loyalty.module.ts` | Import `CustomerModule`; register new adapter under `LOYALTY_CUSTOMER_PORT`; remove dead `AnyAuthenticatedRoleGuard` |
| `apps/backend/src/contexts/customer/customer.module.ts` | Add `GetCustomerTenantsByIdUseCase` to `exports:` |
| `packages/types/src/error-codes.ts` | New `LoyaltyErrorCode` entry |
| `packages/i18n/locales/en/errors.json` + `pt-BR/errors.json` | Translation for the new error code (required by the exhaustiveness test in `apps/web`) |
| `apps/backend/src/contexts/loyalty/infrastructure/controllers/loyalty.controller.spec.ts` + `.integration.spec.ts` | Update for new guard + cross-tenant resolution path |
| `apps/bff/src/features/customer/customers.controller.ts` | `getTenants()` — call `/loyalty/balance?tenantId=X` instead of `/customers/${id}/loyalty/balance?tenantId=X` (path corrected — TD-21 moved this file under `features/customer/`) |
| `apps/bff/src/features/customer/customers.controller.spec.ts` | Update spec to match new BFF call shape |

---

## Acceptance Criteria

- [ ] `GET /loyalty/balance?tenantId=X` called by a CUSTOMER returns the calling user's balance in tenant X — not another customer's
- [ ] `GET /customers/:customerId/loyalty/balance` requires STAFF or MANAGER role; returns 403 for CUSTOMER role
- [ ] A CUSTOMER with JWT for tenant A cannot read another customer's balance in tenant B via `?tenantId=B` (security regression test)
- [ ] `getTenants()` BFF call returns correct loyalty points for all tenants on the switch-tenant screen (integration test or Playwright)
- [ ] `LoyaltyCustomerAdapter` has unit tests covering: same-user cross-tenant resolution, customer not found in home tenant, customer not found in target tenant
- [ ] `loyalty.controller.ts` has no dead `isCrossTenantCall` logic
- [ ] All unit tests pass; `pnpm type-check` clean
