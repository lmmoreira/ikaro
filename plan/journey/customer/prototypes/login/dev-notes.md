# Dev Notes — CUSTOMER: Login (UC-021 + UC-023)

## Overview

All backend and BFF auth endpoints for customer login are already implemented (M03). This is a **frontend-only story** (M124-S02). The shared `/auth/error` page is created in M124-S01 (staff story). This story creates the customer-specific login page, tenant selection, and phone completion prompt.

## File map

| File | Status | Action |
|---|---|---|
| `apps/web/app/[tenantSlug]/login/page.tsx` | ❌ Gap | Create — customer login page (see shared/login.html) |
| `apps/web/app/select-tenant/page.tsx` | ❌ Gap | Create — UC-021 Case B tenant selection |
| `apps/web/app/auth/error/page.tsx` | ✅ Created in M124-S01 | Reused — no changes needed |
| Phone completion UI | ❌ Gap | Inline prompt or modal on first post-login screen — see open questions |

## Screen: `/{tenantSlug}/login` (`CustomerLoginPage`)

**File:** `apps/web/app/[tenantSlug]/login/page.tsx` (GAP)  
**Type:** Server component (reads `tenantSlug` from params; passes to Google OAuth redirect)  
**Prototype:** `shared/login.html`

**What it renders:**
- Tenant logo (from `hotsiteConfig.branding.logoUrl`; fallback: name initial on `--ba-primary` background)
- Heading: "Entrar na [Tenant Name]"
- Subtext: "Entre com sua conta Google para agendar"
- Google Sign-In button → `GET /v1/auth/google?tenantSlug={slug}`
- Terms notice

**On page load:** fetch `GET /v1/hotsite/{tenantSlug}/config` to get tenant name + logo for branding. Use `generateMetadata` for the page `<title>`.

**Redirect after login:**
- Single-tenant (Case A): BFF issues JWT → redirect back to where the customer came from (booking form, minha-conta, etc.)
- Multi-tenant (Case B): BFF redirects to `/select-tenant?token=<selectionToken>`
- Phone missing (A3): redirect to phone completion (inline or dedicated page)

## Screen: `/select-tenant` (`SelectTenantPage`)

**File:** `apps/web/app/select-tenant/page.tsx` (GAP)  
**Type:** `'use client'` — calls `POST /v1/auth/token` on tenant selection  
**Prototype:** `01-select-tenant.html`

**Query param:** `?token=<selectionToken>` (opaque base64 token from BFF containing `{ tenants: TenantOption[], sub: string }`)

**TenantOption shape** (add to `@ikaro/types` in M124-S02):
```ts
interface TenantOption {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly loyaltyPoints: number;  // current_points from loyalty_balances
}
```

**On mount:** decode the selection token (or call `GET /v1/auth/tenants?token=...` to fetch the list — verify which approach the BFF uses).

**On tenant card click:**
```
POST /v1/auth/token { selectionToken, tenantId }
→ 200: BFF issues JWT cookie → redirect to /{tenantSlug} (or /minha-conta)
→ 400: invalid token → show error banner "Sessão expirada. Tente entrar novamente."
```

**Visual:** list of cards, each showing:
- Tenant color initial (first letter of name, background = `--ba-primary` placeholder or tenant's actual primary)
- Tenant name (bold)
- "X pontos ativos" (subdued)
- Chevron right

**Loading state:** skeleton cards while token is decoded — see `01b-loading.html`.

**Fetch-error state:** token decode or `GET /v1/auth/tenants?token=...` failed — show inline error + "Tentar novamente" (reloads/retries) — see `01c-fetch-error.html`.

## Phone completion — UC-021 A3

**When:** immediately after JWT is issued, if `Customer.phone == null`. The BFF does NOT redirect to a special page for this — the frontend must check after login.

**Recommended approach:** inline modal/banner on the first screen after login. The `DashboardLayout` (or customer area layout) checks `GET /v1/customers/me` on mount; if `phone == null`, shows a dismissible bottom sheet prompting for phone.

**BFF call:**
```
PATCH /v1/customers/me { phone: string }
Headers: Authorization: Bearer <jwt>

→ 200: phone saved → dismiss prompt
→ 422: { type: 'invalid-phone' } → "Digite um número de telefone válido (10 ou 11 dígitos)."
```

**Validation (client-side):** strip non-digits, must be 10 or 11 digits.

**Prototype:** `02-phone-completion.html` shows this as a standalone screen for review clarity. Production intent: inline prompt, not a page navigation. Validation-error state (422 / client-side reject) — see `02b-validation-error.html`.

## UC-023 — Customer Switches Tenant

No dedicated page. UC-023 is triggered by a "Trocar estabelecimento" button/link in the customer area (topbar avatar dropdown or `/minha-conta` settings). The action:

```
POST /v1/auth/switch-tenant { targetTenantId }
Headers: Authorization: Bearer <jwt> (CUSTOMER role)

→ 200: new JWT issued → cookie replaced → redirect to /{newTenantSlug}
→ 403: not a customer of that tenant → "Você não tem acesso a este estabelecimento."
```

This button is only shown when the customer belongs to 2+ tenants. Implement in the customer area layout alongside UC-006 (customer views bookings) — not in M124.

## BFF auth flow summary

```
Case A — Single tenant (from hotsite "Entrar"):
  GET /v1/auth/google?tenantSlug={slug}
  → Google OAuth
  → handleTenantLogin(): POST /internal/customers → issue JWT → redirect

Case B — Multi-tenant (from generic login):
  GET /v1/auth/google (no tenantSlug)
  → Google OAuth
  → handleMultiTenantLogin(): GET /internal/customers/tenants?googleOAuthId=<sub>
    → if 0 tenants: redirect /auth/error?reason=no-tenant
    → if 1 tenant: auto-select → issue JWT → redirect (same as Case A)
    → if 2+ tenants: issue selectionToken → redirect /select-tenant?token=...
  → Customer selects → POST /v1/auth/token { selectionToken, tenantId } → JWT → redirect

UC-021 A3 — Phone missing:
  Frontend check after JWT issued:
    GET /v1/customers/me → { phone: null } → show phone prompt
    PATCH /v1/customers/me { phone } → dismiss
```

## Open questions (resolve before M124-S02)

1. **Post-login redirect destination:** where does the customer land? Options: (a) back to the hotsite `/{tenantSlug}` in logged-in state, (b) `/minha-conta` (customer dashboard — if built), (c) back to booking form if they came from there. Implement redirect-after-login pattern: store `?redirect=` param before OAuth.
2. **Phone prompt: page vs. inline:** prototype uses a standalone page for review. Production intent is inline on first screen. Confirm at M124-S02 kickoff.
3. **Tenant color in selection screen:** prototype uses a random purple for SuperClean. Production should use the tenant's actual `--ba-primary` from `hotsiteConfig.branding`. Does the BFF selection token include the `primaryColor`? If not, use name-initial with a neutral grey background.
4. **Selection token decode:** does the frontend decode the `?token=` itself (JWT-like), or call a BFF endpoint to get the tenant list? Verify `POST /v1/auth/token` — check if there's a corresponding `GET /v1/auth/tenants?token=...` for fetching the options before the user selects.
