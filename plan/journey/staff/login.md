# STAFF — Login (UC-022 + UC-025)

**Actor(s):** STAFF | MANAGER  
**Goal:** Staff member authenticates with Google OAuth and lands on the dashboard booking queue; invited staff activate their account on first access  
**UCs covered:** UC-022, UC-025  
**Status:** Draft

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    RegularEntry(["Acessa /dashboard/login?tenantSlug={slug}"]) --> Login
    InviteEntry(["Clica link no e-mail de convite"]) --> GoogleBtn

    Login["/dashboard/login<br/>Tela de Login da Equipe"] --> GoogleBtn(("Clica Entrar com Google<br/>GET {BFF_URL}/auth/google?tenantSlug={slug}&type=staff"))
    GoogleBtn --> Google["Google OAuth Consent"]
    Google --> Callback{"BFF /v1/auth/google/callback<br/>handleStaffLogin (existing record) ou<br/>invite-activation path (UC-025)"}

    Callback -->|"is_active=true<br/>UC-022 Caso A"| Dashboard["/dashboard/bookings<br/>Fila de Agendamentos"]
    Callback -->|"is_active=false<br/>UC-022 Caso B"| FirstLogin["❓ GAP: /auth/first-login<br/>Convite Não Aceito<br/>(dead end — page doesn't exist)"]
    Callback -->|"UC-025: ativa staff_record<br/>is_active false → true"| Dashboard
    Callback -->|"reason=not-a-staff-member"| AuthError["/auth/error?reason=..."]
    Callback -->|"reason=staff-deactivated"| AuthError
    Callback -->|"reason=email-mismatch (UC-025 A1)"| AuthError
    Callback -->|"reason=invite-not-found"| AuthError
    Callback -->|"reason=account-linked-elsewhere"| AuthError
    Callback -->|"reason=tenant-not-found"| AuthError
    Callback -->|"reason=tenant-deactivated"| AuthError

    FirstLogin --> RetryHint["Mensagem: use o link<br/>do e-mail de convite"]

    class Login,Dashboard,AuthError existing
    class FirstLogin gap
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/dashboard/login` | `StaffLoginPage` | M124-S01 | ✅ Existing |
| `/auth/first-login` | `FirstLoginPage` | M124-S01 | ❌ GAP — genuinely missing, dead-end redirect in production |
| `/auth/error` | `AuthErrorPage` | M124-S01 | ✅ Existing — 7 staff-relevant reason codes, see `dev-notes.md`'s reason table |
| `/dashboard/bookings` | `BookingQueuePage` | M125-S03 | ✅ Existing |

## BFF calls in this flow

| Call | When |
|---|---|
| `GET {BFF_URL}/auth/google?tenantSlug={slug}&type=staff` | Staff clicks "Entrar com Google" on `/dashboard/login`, or clicks the invite email link — same URL scheme for both entry points |
| `GET /internal/staff/by-oauth?googleOAuthId=...` | BFF callback — regular login lookup |
| `GET /internal/staff/by-email?email=...&tenantId=...` | BFF callback — first-login invite lookup |
| `POST /internal/staff/:staffId/link-google` | BFF callback — UC-025 activation (links the Google account, not a separate "activate" endpoint) |

## Open questions / gaps

- [x] **Route for staff login:** — **Resolved.** `/dashboard/login` is canonical, confirmed shipped (`apps/web/app/dashboard/login/page.tsx`, reads `?tenantSlug` as a query param rather than a URL segment).
- [ ] **"Bem-vindo(a)!" banner on first login (UC-025 step 8):** does the dashboard show a one-time welcome message after first activation? If yes, it belongs in M124-S01 as an inline success state on the dashboard, not a separate page.
- [x] **Deactivated staff (UC-025 A3 / A2):** tenant deactivated after invite sent — should `/auth/error` show a distinct message? — **Resolved.** Both `reason=tenant-deactivated` and `reason=staff-deactivated` are implemented with distinct messages — see `dev-notes.md`'s reason-code table.
- [ ] **JWT expiry / re-login:** no logout or refresh endpoint exists yet. Staff whose JWT expires will be redirected to `/dashboard/login`. Confirm this is the intended re-login flow.

## Prototype

Folder: `staff/prototypes/login/`

| File | Screen | UC | Story | Status |
|---|---|---|---|---|
| `index.html` | Navigation hub | — | — | ✅ Criado |
| `00-staff-login.html` | Login page (redirect → shared/staff-login.html) | UC-022, UC-025 | M124-S01 | ✅ Criado |
| `01-first-login.html` | Invite not accepted — "use the invite email link" | UC-022 Caso B | M124-S01 | ✅ Criado |
| `01b-error.html` | Auth error — reason=not-a-staff-member | UC-022 Caso C | M124-S01 | ✅ Criado |
| `00b-no-tenant-slug.html` | Login page, no `?tenantSlug` — message only, no Google button | — | M124-S01 | ✅ Criado |
| `01c-error-email-mismatch.html` | Auth error — reason=email-mismatch | UC-025 A1 | M124-S01 | ✅ Criado |
| `01d-error-tenant-deactivated.html` | Auth error — reason=tenant-deactivated | UC-025 A3 | M124-S01 | ✅ Criado |
| `01e-error-staff-deactivated.html` | Auth error — reason=staff-deactivated | UC-025 A2 | M124-S01 | ✅ Criado |
| `01f-error-invite-not-found.html` | Auth error — reason=invite-not-found | UC-025 | M124-S01 | ✅ Criado |
| `01g-error-account-linked-elsewhere.html` | Auth error — reason=account-linked-elsewhere | UC-025 | M124-S01 | ✅ Criado |
| `01h-error-tenant-not-found.html` | Auth error — reason=tenant-not-found | UC-025 | M124-S01 | ✅ Criado |
| `dev-notes.md` | Implementation handoff | — | M124-S01 | ✅ Criado |
