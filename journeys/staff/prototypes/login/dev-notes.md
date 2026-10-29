# Dev Notes — STAFF: Login (UC-022 + UC-025)

## Overview

All backend, BFF, and frontend for staff login are shipped (`M13-S13`, ✅ Done). This file now documents the real implementation rather than a pre-build spec — updated 2026-07-31 after a docs audit found this journey's docs/prototype still described it as unbuilt.

## File map

| File | Status | Notes |
|---|---|---|
| `apps/web/app/dashboard/login/page.tsx` | ✅ Exists | Two branches: with `?tenantSlug=` (Google button) and without it (message only, no button — see `00b-no-tenant-slug.html`) |
| `apps/web/app/auth/error/page.tsx` | ✅ Exists | Shared staff + customer, 8 reason codes plus a generic fallback for an unknown or missing `reason` ("Erro de autenticação", CTA "Voltar" → `/`) (see table below) |
| `apps/web/features/auth/google-oauth.ts` (`buildGoogleOAuthUrl`) | ✅ Exists | Builds `{BFF_URL}/auth/google?tenantSlug={slug}&type=staff` — no `state=__staff__` scheme; that was never built |

## Screen: `/dashboard/login` (`StaffLoginPage`)

**File:** `apps/web/app/dashboard/login/page.tsx` (EXISTS)
**Type:** Server component (static — no data fetching)
**Prototype:** `shared/staff-login.html` (with `?tenantSlug=`), `00b-no-tenant-slug.html` (without it)

**What it renders (with `?tenantSlug=`):**
- Logo mark (fixed indigo, not tenant-branded — this page and everything reached from it use `DashboardShell`'s tenant-agnostic palette)
- Heading: "Área da Equipe" (`t('staffHeading')`)
- Subtext: "Acesso exclusivo para funcionários e gerentes" (`t('staffSubtitle')`)
- Google Sign-In button → `buildGoogleOAuthUrl({ tenantSlug, type: 'staff' })`
- Footer note: "Primeiro acesso? Use o link enviado no e-mail de convite." (`t('staffFirstAccess')`)

**Without `?tenantSlug=`:** renders only the logo + heading + "Por favor, acesse pelo site da sua empresa." (`t('staffLoginViaHotsite')`) — no Google button at all, since the OAuth URL builder requires `tenantSlug`.

**No inline error state exists.** A prior draft of this file proposed one (`?error=` query param, red banner before the Google button); the real page never implements this. All auth failures redirect to the separate `/auth/error` page instead.

## First-login behavior

There is deliberately no `/auth/first-login` route in the shipped flow. The invitation email links to `/dashboard/login?tenantSlug={slug}`, so the invitee clicks the same "Entrar com Google" button as everyone else. In the callback the BFF finds the record by email and links the Google account only if it is not already linked (`link-google`); the session cookie is issued and the browser is redirected to `/dashboard`, which redirects to `/dashboard/bookings`. An inactive existing staff record is not sent to a missing page: it redirects to `/auth/error?reason=staff-deactivated&tenantSlug=...`. `01-first-login.html` is retained only as an early design proposal, not as an implementation target.

## Screen: `/auth/error` (`AuthErrorPage`)

**File:** `apps/web/app/auth/error/page.tsx` (EXISTS)
**Prototype:** `01b`–`01h` (staff-relevant reasons), `customer/prototypes/login/01b-error.html` (customer)

**Shared between staff and customer.** Content driven by `searchParams.reason`. CTA is one of two configs: `ctaLogin` (label "Voltar", href = `tenantSlug ? /${tenantSlug} : '/'` — the tenant's hotsite, **not** back to `/dashboard/login`) or `ctaSite` (label "Voltar ao site", href = `/`):

| reason | Heading | Message | CTA | Staff-relevant? |
|---|---|---|---|---|
| `not-a-staff-member` | "Acesso não autorizado" | "Sua conta Google não está cadastrada como funcionário neste estabelecimento." | ctaLogin | Render-only — the BFF staff flow does not emit it (a missing record is `invite-not-found`) |
| `staff-deactivated` | "Conta desativada" | "Sua conta foi desativada. Entre em contato com o gerente." | ctaLogin | Yes |
| `email-mismatch` | "Acesso não autorizado" | "Por favor, use o e-mail para o qual você foi convidado(a)." | ctaLogin | Yes |
| `invite-not-found` | "Convite não encontrado" | "Nenhum convite pendente foi encontrado para este estabelecimento." | ctaLogin | Yes |
| `account-linked-elsewhere` | "Conta já vinculada" | "Esta conta Google já está vinculada a outro funcionário. Entre com a conta original ou peça ajuda ao gerente." | ctaLogin | Yes |
| `tenant-not-found` | "Estabelecimento não encontrado" | "O link de convite é inválido ou o estabelecimento foi removido." | ctaSite | Yes |
| `tenant-deactivated` | "Estabelecimento desativado" | "Este estabelecimento está temporariamente desativado." | ctaSite | Render-only — the BFF does not emit it today (the tenant lookup carries no active check) |
| `no-tenant` | "Não foi possível entrar" | "Nenhum estabelecimento encontrado para sua conta Google." | ctaSite | Yes — emitted when the callback carries no `tenantSlug` (e.g. a direct `/auth/google?type=staff` call); not drawn in the prototype |

When a `reason` is present, the bottom of the card shows "Código: {reason}" in small grey text.

## OAuth flow (as actually implemented)

```
UC-022 / UC-025 — one path (handleStaffLogin):
  1. GET {BFF_URL}/auth/google?tenantSlug={slug}&type=staff
     (the invite email links to /dashboard/login?tenantSlug={slug}, so the invitee starts here too)
  2. Google OAuth
  3. BFF GET /v1/auth/google/callback → handleStaffLogin()
     → resolves the tenant (GET /internal/tenants/by-slug/:slug); unknown → reason=tenant-not-found
     → finds the staff by email in that tenant (GET /internal/staff/by-email); none → reason=invite-not-found
     → is_active=false → reason=staff-deactivated&tenantSlug=...
     → googleOAuthId not yet linked → POST /internal/staff/:staffId/link-google
         (422 email-mismatch, 403 staff-deactivated, 409 account-linked-elsewhere → /auth/error)
       already linked to this Google account → no link call (normal login)
     → issue JWT cookie → redirect /dashboard → /dashboard/bookings
  Callback without tenantSlug → reason=no-tenant
```

## Known limitations

- **No "Bem-vindo(a)!" first-login banner** was built. First login still completes successfully; the user lands directly on `/dashboard/bookings` (via `/dashboard`).


---

# Billing — tenant suspended (planned, UC-121)

> Moved as-is from the tenant-billing discovery; Draft, to be reshaped at story discovery. Both screens read `GET /v1/billing/access -> { status, operational, features: [{ key, tier }] }` (role-reduced for any role, `docs/API_CONTRACTS.md` § Billing — Access Resolution and Suspended-State Effects) is the single input; a feature absent from `features` is locked, and `status` SUSPENDED locks the tenant out identically whatever the reason.

## Suspended-account notice — staff (`02-suspended-notice.html`; `TenantSuspendedNotice`)

File: `02-suspended-notice.html` — Status: GAP. Visual base: staff login card (`app/dashboard/login/page.tsx`).
Props: `role: 'STAFF'`. Rendered by `app/dashboard/layout.tsx` for role STAFF when status = SUSPENDED (managers get the billing page instead). No nav, no data fetching; API answers 403 `BILLING_TENANT_SUSPENDED`.
BFF: `GET /v1/billing/access`.
Copy: "Conta suspensa", "Esta conta está suspensa. Fale com o gerente.", button "Sair". Reason-neutral.
States: single static state; loading = brand mark only; load-error = same card with "Não foi possível verificar sua conta. Tente novamente." and "Tentar novamente".
Mobile: card is already full-width up to 26rem.

## Tenant selection with a suspended tenant (`03-select-tenant-suspended.html`; `SelectStaffTenantClient`)

**File:** `03-select-tenant-suspended.html` — `SelectStaffTenantClient` EXISTS (`apps/web/features/staff/components/SelectStaffTenantClient.tsx`, route `/select-staff-tenant`); the "Suspensa" badge is a GAP.
**UC:** UC-121

**Props:** `initialOptions: StaffTenantOption[] | null`; `StaffTenantOption` gains `operational: boolean` (`@ikaro/types`, `auth.dto.ts`).
**BFF call:** `GET /auth/staff-tenants` (existing) must include a per-tenant `operational` flag (false when status = SUSPENDED). `POST /auth/switch-staff-tenant { staffId }` stays unchanged and must not reject a suspended tenant.
**Behaviour:** the suspended tenant is always listed and selectable; when `operational === false`, render an extra amber badge "Suspensa" before the role badge. Selecting it switches the session and `/dashboard` renders the suspended notice (`02-suspended-notice.html`). Only the badge: no reason, no payment info for staff.
**States:** populated (this file); load error reuses the existing `selectTenantError` / `selectTenantRetry`. No new loading/validation states.
**i18n:** new key `auth.tenantSuspendedBadge` = "Suspensa" (pt-BR), "Suspended" (en).
**Mobile:** card is `max-w-md`, badges stay on the right and wrap-free (`flex-shrink: 0`).

**Customers:** there is no customer tenant selector in the codebase (descoped, UC-021 Case B: customers sign in per tenant slug). If a customer tenant switcher (UC-023) is ever built, it must keep listing a suspended tenant with the "Empresa inativa" badge — same rule as staff.
