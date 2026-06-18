# Dev Notes — STAFF: Login (UC-022 + UC-025)

## Overview

All backend and BFF auth endpoints for staff login are already implemented (M03). This is a **frontend-only story** (M124-S01). Three pages need to be created in `apps/web/`.

## File map

| File | Status | Action |
|---|---|---|
| `apps/web/app/dashboard/login/page.tsx` | ❌ Gap | Create — staff login page (see shared/staff-login.html) |
| `apps/web/app/auth/first-login/page.tsx` | ❌ Gap | Create — UC-022 Case B: invite not accepted |
| `apps/web/app/auth/error/page.tsx` | ❌ Gap | Create — shared auth error page (staff + customer) |
| `apps/web/middleware.ts` | ❌ Gap | Create in M125-S01 — redirect unauthenticated /dashboard/** to /dashboard/login |

## Screen: `/dashboard/login` (`StaffLoginPage`)

**File:** `apps/web/app/dashboard/login/page.tsx` (GAP)  
**Type:** Server component (static — no data fetching needed)  
**Prototype:** `shared/staff-login.html`

**What it renders:**
- Ikaro logo mark
- Heading: "Área da Equipe"
- Subtext: "Acesso exclusivo para funcionários e gerentes"
- Google Sign-In button → `GET /v1/auth/google?state=__staff__`
- Footer note: "Primeiro acesso? Use o link enviado no e-mail de convite."

**Error state:** if redirected back with `?error=not-a-staff-member`, show inline red error banner before the Google button (see commented-out block in shared/staff-login.html). Do not use a separate error page for this — keep it inline so the user can retry immediately.

**Note:** the route decision (`/dashboard/login` vs `/{tenantSlug}/staff-login`) is an open question — see login.md. Use `/dashboard/login` until decided.

## Screen: `/auth/first-login` (`FirstLoginPage`)

**File:** `apps/web/app/auth/first-login/page.tsx` (GAP)  
**Type:** Server component  
**Prototype:** `01-first-login.html`

**When shown:** BFF calls `GET /internal/staff/by-oauth`, finds a staff record with `is_active=false`, redirects to `/auth/first-login`.

**What it renders:**
- Envelope icon in blue circle
- Heading: "Acesso ainda não ativado"
- Explanation: use the invite link in the invite email
- Step-by-step instructions (3 steps)
- "Não recebeu o e-mail? Peça ao gerente que reenvie o convite."
- "Voltar ao login" link

**No form, no BFF call** — purely informational. The activation happens when the staff clicks the actual invite link (different OAuth flow entry point).

## Screen: `/auth/error` (`AuthErrorPage`)

**File:** `apps/web/app/auth/error/page.tsx` (GAP)  
**Type:** Server component  
**Prototype:** `01b-error.html` (staff), `customer/prototypes/login/01b-error.html` (customer)

**Shared between staff and customer.** Content driven by `searchParams.reason`:

| reason | Heading | Message | CTA |
|---|---|---|---|
| `not-a-staff-member` | "Acesso não autorizado" | "Sua conta Google não está cadastrada como funcionário..." | "Voltar ao login" → `/dashboard/login` |
| `email-mismatch` | "Acesso não autorizado" | "Por favor, use o e-mail para o qual você foi convidado(a)." | "Voltar ao login" → `/dashboard/login` |
| `tenant-deactivated` | "Estabelecimento desativado" | "Este estabelecimento está desativado." | "Voltar ao site" → `/` |
| `no-tenant` | "Não foi possível entrar" | "Nenhum estabelecimento encontrado para sua conta." | "Voltar ao site" → `/` |

Show error code at the bottom in small grey text (for support reference).

## BFF OAuth flow (already implemented — verify before M124-S01)

```
UC-022 — Regular staff login:
  1. GET /v1/auth/google?state=__staff__
  2. Google OAuth
  3. GET /v1/auth/google/callback → handleStaffLogin()
     → GET /internal/staff/by-oauth?googleOAuthId=<sub>
     → if is_active=true: issue JWT → redirect /dashboard/bookings
     → if is_active=false: redirect /auth/first-login
     → if not found: redirect /auth/error?reason=not-a-staff-member

UC-025 — First login / accept invite:
  1. Invite email link → GET /v1/auth/google?state=__staff__:{tenantSlug}
  2. Google OAuth
  3. GET /v1/auth/google/callback → handleStaffFirstLogin()
     → GET /internal/tenants/by-slug/:slug
     → GET /internal/staff/by-email?email=<google_email>&tenantId=<id>
     → if email mismatch: redirect /auth/error?reason=email-mismatch
     → POST /internal/staff/:staffId/activate { googleOAuthId, email, name }
     → issue JWT → redirect /dashboard/bookings
```

## Open questions (resolve before M124-S01)

1. **Staff login route:** `/dashboard/login` or `/{tenantSlug}/staff-login`? If tenant-scoped, the staff needs to know their tenant slug before logging in, which defeats the purpose (staff is found by google_oauth_id, not by slug). `/dashboard/login` is strongly preferred.
2. **"Bem-vindo(a)!" first-login banner:** show an inline success banner on the dashboard after UC-025 activation? Would require passing a `?welcome=1` query param from the BFF redirect. Confirm with product.
3. **Error inline vs. error page:** currently the spec uses a separate `/auth/error` page. If the error is `not-a-staff-member`, an inline banner on `/dashboard/login` with a retry button might be better UX. The shared/staff-login.html already has this as a commented-out block. Decide at M124-S01 kickoff.
