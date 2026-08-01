# Dev Notes — STAFF: Login (UC-022 + UC-025)

## Overview

All backend, BFF, and frontend for staff login are shipped (`M124-S01`, ✅ Done). This file now documents the real implementation rather than a pre-build spec — updated 2026-07-31 after a docs audit found this journey's docs/prototype still described it as unbuilt.

## File map

| File | Status | Notes |
|---|---|---|
| `apps/web/app/dashboard/login/page.tsx` | ✅ Exists | Two branches: with `?tenantSlug=` (Google button) and without it (message only, no button — see `00b-no-tenant-slug.html`) |
| `apps/web/app/auth/first-login/page.tsx` | ❌ Gap | Genuinely missing — the only real gap in this journey |
| `apps/web/app/auth/error/page.tsx` | ✅ Exists | Shared staff + customer, 8 reason codes (see table below) |
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

## Screen: `/auth/first-login` (`FirstLoginPage`)

**File:** `apps/web/app/auth/first-login/page.tsx` (GAP — still not built)
**Prototype:** `01-first-login.html` (design proposal, not yet implemented)

**When it would be shown:** BFF finds a staff record with `is_active=false` on regular login and would redirect here. Since the page doesn't exist, this redirect target is currently a dead end in production — worth flagging to whoever picks this up.

## Screen: `/auth/error` (`AuthErrorPage`)

**File:** `apps/web/app/auth/error/page.tsx` (EXISTS)
**Prototype:** `01b`–`01h` (staff-relevant reasons), `customer/prototypes/login/01b-error.html` (customer)

**Shared between staff and customer.** Content driven by `searchParams.reason`. CTA is one of two configs: `ctaLogin` (label "Voltar", href = `tenantSlug ? /${tenantSlug} : '/'` — the tenant's hotsite, **not** back to `/dashboard/login`) or `ctaSite` (label "Voltar ao site", href = `/`):

| reason | Heading | Message | CTA | Staff-relevant? |
|---|---|---|---|---|
| `not-a-staff-member` | "Acesso não autorizado" | "Sua conta Google não está cadastrada como funcionário neste estabelecimento." | ctaLogin | Yes |
| `staff-deactivated` | "Conta desativada" | "Sua conta foi desativada. Entre em contato com o gerente." | ctaLogin | Yes |
| `email-mismatch` | "Acesso não autorizado" | "Por favor, use o e-mail para o qual você foi convidado(a)." | ctaLogin | Yes |
| `invite-not-found` | "Convite não encontrado" | "Nenhum convite pendente foi encontrado para este estabelecimento." | ctaLogin | Yes |
| `account-linked-elsewhere` | "Conta já vinculada" | "Esta conta Google já está vinculada a outro funcionário. Entre com a conta original ou peça ajuda ao gerente." | ctaLogin | Yes |
| `tenant-not-found` | "Estabelecimento não encontrado" | "O link de convite é inválido ou o estabelecimento foi removido." | ctaSite | Yes |
| `tenant-deactivated` | "Estabelecimento desativado" | "Este estabelecimento está temporariamente desativado." | ctaSite | Yes |
| `no-tenant` | "Não foi possível entrar" | "Nenhum estabelecimento encontrado para sua conta Google." | ctaSite | No — customer only |

Bottom of the card shows "Código: {reason}" in small grey text.

## OAuth flow (as actually implemented)

```
UC-022 — Regular staff login:
  1. GET {BFF_URL}/auth/google?tenantSlug={slug}&type=staff
  2. Google OAuth
  3. BFF GET /v1/auth/google/callback → handleStaffLogin()
     → resolves staff by googleOAuthId
     → if is_active=true: issue JWT cookie → redirect /dashboard/bookings
     → if is_active=false: redirect /auth/first-login  (dead end — page doesn't exist)
     → if not found: redirect /auth/error?reason=not-a-staff-member

UC-025 — First login / accept invite:
  1. Invite email link → GET {BFF_URL}/auth/google?tenantSlug={slug}&type=staff
  2. Google OAuth
  3. BFF callback resolves the invite, activates the staff record, issues JWT
     → redirect /dashboard/bookings
     → mismatches redirect to /auth/error with the appropriate reason above
```

## Known limitations

- **`/auth/first-login` doesn't exist.** A deactivated-invite login currently redirects to a route that 404s. This is the one real remaining gap in this journey.
- **No "Bem-vindo(a)!" first-login banner** was built — an open question from the original draft that was never revisited.
