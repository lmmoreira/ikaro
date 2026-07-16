# TD16 — BFF AuthController exceeds size limit and mixes concerns

## Status
- **State**: Resolved (2026-07-16)
- **Type**: Technical Debt / Maintainability
- **Priority**: Low (no functional bug; concern is testability and drift)
- **Context**: `apps/bff/src/features/auth/auth.controller.ts` (moved from `apps/bff/src/auth/` by the TD-21 domain-slice migration)
- **Created**: 2026-06-26 (surfaced by CodeRabbit on PR #51)

### Resolution

The controller-size half of this TD (419-line `auth.controller.ts`, 8+ endpoints inline) was already resolved as a side effect of the unrelated TD-21 domain-slice migration, which extracted `AuthControllerFlowService` and left the controller at 77 lines — pure request/response wiring, one call per endpoint. `getSelectableStaffTenants()` (now `getStaffTenants()`) moved with it into the flow service at the same time, so that part of the original "Fix" section was already done independent of this change.

The remaining half — the 7-field JWT payload assembled inline at every `issueToken()` call site — was still present, just moved into `auth-controller-flow.service.ts` verbatim (5 call sites: `switchStaffTenant`, `switchTenant`, `devLogin`, `handleStaffLogin`, `handleTenantLogin`). Fixed by extracting `issueStaffToken()`/`issueCustomerToken()` factory functions into a new `apps/bff/src/features/auth/token-assembly.ts`, matching the original proposal's staff/customer split exactly — every one of the 5 call sites fit that split cleanly. Implemented as plain exported functions (not an injectable `TokenAssemblyService`), consistent with this file's existing convention of free functions taking dependencies as parameters rather than a second DI service. `devLogin` was also restructured to call the right factory inside each branch (instead of deferring to a shared, loosely-typed `role` variable after the branches merge), which incidentally improved type precision there too.

All 5 call sites now go through the shared factories; adding a new `JwtPayload` field only requires updating `JwtPayload`, `issueToken()`, and the two factory functions. New `token-assembly.spec.ts` covers both factories directly; full BFF suite (59 suites / 716 tests) passes unchanged.

---

## Problem

`apps/bff/src/auth/auth.controller.ts` is **419 lines** — more than double the project's 200-line class limit (`docs/CODE_STANDARDS.md`). It currently:

1. Handles 8+ HTTP endpoints across customer login, staff login, dev-login, tenant switching, and OAuth callbacks.
2. Assembles the JWT payload inline in each endpoint (`issueToken({ sub, tenantId, tenantSlug, tenantName, userName, role, locale })`), with the same 7-field shape repeated across `switchStaffTenant`, `switchTenant`, `devLogin`, `handleStaffFirstLogin`, and `handleTenantLogin`.
3. Contains the `getSelectableStaffTenants()` private helper (tenant batch lookup + mapping), which is non-trivial application logic.

**The concrete risk**: if a new field is added to `JwtPayload` (as happened in M13-S15 with `locale`), it must be threaded through all 5 `issueToken()` call sites manually. M13-S15 missed one on first pass. A central assembly point would have caught it at compile time.

---

## Fix

Extract a `TokenAssemblyService` (or extend `JwtIssuerService`) with a method that takes a structured input and assembles the full payload:

```typescript
// apps/bff/src/auth/token-assembly.service.ts
@Injectable()
export class TokenAssemblyService {
  constructor(private readonly jwtIssuer: JwtIssuerService) {}

  issueStaffToken(staff: StaffRecord, tenant: TenantInfoResponse, userName: string | null): string {
    return this.jwtIssuer.issueToken({
      sub: staff.staffId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      userName,
      role: staff.role,
      locale: tenant.locale,
    });
  }

  issueCustomerToken(customer: CustomerRecord, tenant: TenantInfoResponse, userName: string | null): string {
    return this.jwtIssuer.issueToken({
      sub: customer.customerId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      userName,
      role: 'CUSTOMER',
      locale: tenant.locale,
    });
  }
}
```

Each `AuthController` endpoint then calls `this.tokenAssembly.issueStaffToken(...)` — a single typed call site per flow. Adding a new JWT field requires updating `JwtPayload`, `issueToken()`, and the two factory methods — not 5+ controller methods.

`getSelectableStaffTenants()` should move to a dedicated `StaffTenantService` or inline `AuthService`.

## When to fix

When a new JWT field addition, a new auth flow, or a new multi-tenant scenario next touches `auth.controller.ts`. Not worth a standalone refactor PR; carry it along with the next feature that modifies this file.
