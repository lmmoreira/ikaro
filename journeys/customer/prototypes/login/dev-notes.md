# Dev Notes — CUSTOMER: Login (UC-021 + UC-023)

## Overview

✅ Fully shipped (`M13-S42` login, `M13-S14` phone/address completion). Every customer login starts from a specific tenant's hotsite, so the tenant slug is always known; the login-time tenant-selection design (`/select-tenant`, `POST /v1/auth/token`, `GET /v1/auth/tenants?token=`) was permanently descoped on 2026-06-24 and nothing of it exists in `apps/` (see the scope-change note in `customer/login.md`, which is canonical for this journey). The prototype files `01-select-tenant.html`, `01b-loading.html` and `01c-fetch-error.html` draw that descoped screen and are kept only as history.

## File map

| File | Status |
|---|---|
| `apps/web/app/[slug]/login/page.tsx` | ✅ Exists — Google sign-in button for the tenant in the URL |
| `apps/web/app/auth/error/page.tsx` | ✅ Exists |
| `InformationCompletionPrompt` (phone + address) | ✅ Exists, inline in `[slug]/layout.tsx` |
| `apps/web/app/switch-tenant/page.tsx` + `features/customer/components/SwitchTenantClient.tsx` | ✅ Exists — UC-023 tenant list and switch |
| `apps/web/features/customer/components/CustomerTopbar.tsx` | ✅ Exists — "Trocar empresa" entry (UC-023) |
| `apps/web/shells/hotsite/components/HotsiteAuthBarDropdown.tsx` | ✅ Exists — the same entry from the hotsite auth bar |
| `apps/web/app/select-tenant/page.tsx` | ❌ Never built — descoped |

## Screen: `/{slug}/login`

**File:** `apps/web/app/[slug]/login/page.tsx`
**Prototype:** `00-login.html` (the `00-hotsite.html` page is the entry point that links to it)

- A server component; tenant name and logo come from `fetchManifest(slug)` (logo, or the name's initial on `--ba-primary`).
- The Google Sign-In button is `buildGoogleOAuthUrl({ tenantSlug, returnTo })` → `GET /v1/auth/google?tenantSlug={slug}`; `?error=` shows the `signInError` alert.

**Redirect after login:** the BFF runs `handleTenantLogin()` (`POST /internal/customers` → issue JWT → cookie) and redirects to the optional `returnTo` (validated BFF-side by `isValidReturnTo`), otherwise to `/{tenantSlug}`, the tenant hotsite in logged-in state. A customer whose phone is missing sees the completion prompt below (UC-021 A3).

## Phone completion — UC-021 A3

**When:** after the JWT is issued, if `Customer.phone == null`. The BFF does not redirect to a special page: the `[slug]` layout renders `InformationCompletionPrompt`.

**BFF call:**
```
PATCH /v1/customers/me { phone: string }
Headers: Authorization: Bearer <jwt>

→ 200: phone saved → dismiss prompt
→ 422: phone must be E.164 (BFF `isValidPhoneNumber`, code `PhoneErrorCode.FORMAT_INVALID`; `customers.schemas.ts`) → "Digite um número de telefone válido (10 ou 11 dígitos)." (the shipped UI copy)
```

**Validation (client-side):** strip non-digits, must be 10 or 11 digits.

**Prototype:** `02-phone-completion.html` shows this as a standalone screen for review clarity; production is the inline prompt, not a page navigation. Validation-error state (422 / client-side reject): `02b-validation-error.html`.

## UC-023 — Customer switches tenant

The **"Trocar empresa"** entry (`customer.topbar.switchTenant`, `data-testid="switch-tenant-link"`) in the customer topbar and in the hotsite auth-bar dropdown opens `/switch-tenant` (`apps/web/app/switch-tenant/page.tsx` → `SwitchTenantClient`). The design source is `customer/prototypes/minha-conta/05-trocar-empresa.html`, not a file in this folder. The page lists the customer's tenants (`GET /v1/customers/tenants`), redirects back to `/{currentTenantSlug}` when there is one or none, and on a card click calls:

```
POST /v1/auth/switch-tenant { targetTenantId }
Headers: Authorization: Bearer <jwt> (CUSTOMER role)

→ 200: { tenantSlug, expiresIn }; the BFF replaces the session cookie → web navigates to /{tenantSlug}
→ 403: BFF_CUSTOMER_NOT_REGISTERED_IN_TENANT → "Você não está registrado neste estabelecimento."
```

The web shows its own inline error on any failure (`switchError` in `SwitchTenantClient`).

## BFF auth flow summary

```
GET /v1/auth/google?tenantSlug={slug}
  → Google OAuth
  → handleTenantLogin(): POST /internal/customers → issue JWT → redirect

UC-021 A3 — phone missing:
  GET /v1/customers/me → { phone: null } → InformationCompletionPrompt
  PATCH /v1/customers/me { phone } → dismiss

UC-023 — switch tenant (multi-tenant customer):
  POST /v1/auth/switch-tenant { targetTenantId } → { tenantSlug, expiresIn } → redirect
```
