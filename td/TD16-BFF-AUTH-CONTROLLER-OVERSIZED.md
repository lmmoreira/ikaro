# TD16 — BFF AuthController exceeds size limit and mixes concerns

## Status
- **Type**: Technical Debt / Maintainability
- **Priority**: Low (no functional bug; concern is testability and drift)
- **Context**: `apps/bff/src/auth/auth.controller.ts`
- **Created**: 2026-06-26 (surfaced by CodeRabbit on PR #51)

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
