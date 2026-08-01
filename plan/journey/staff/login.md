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

    RegularEntry(["Acessa /dashboard/login"]) --> Login
    InviteEntry(["Clica link no e-mail de convite<br/>→ GET /v1/auth/google?state=__staff__:{slug}"]) --> Google

    Login["/dashboard/login<br/>Tela de Login da Equipe"] --> GoogleBtn(("Clica Entrar com Google<br/>GET /v1/auth/google?state=__staff__"))
    GoogleBtn --> Google["Google OAuth Consent"]
    Google --> Callback{"BFF /v1/auth/google/callback<br/>handleStaffLogin ou handleStaffFirstLogin"}

    Callback -->|"is_active=true<br/>UC-022 Caso A"| Dashboard["/dashboard/bookings<br/>Fila de Agendamentos"]
    Callback -->|"is_active=false<br/>UC-022 Caso B"| FirstLogin["❓ GAP: /auth/first-login<br/>Convite Não Aceito"]
    Callback -->|"Staff não encontrado<br/>UC-022 Caso C"| AuthError["/auth/error<br/>?reason=not-a-staff-member"]
    Callback -->|"UC-025: ativa staff_record<br/>is_active false → true"| Dashboard
    Callback -->|"e-mail não bate com convite<br/>UC-025 A1"| AuthError

    FirstLogin --> RetryHint["Mensagem: use o link<br/>do e-mail de convite"]

    class Login,Dashboard,AuthError existing
    class FirstLogin gap
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/dashboard/login` | `StaffLoginPage` | M124-S01 | ✅ Existing |
| `/auth/first-login` | `FirstLoginPage` | M124-S01 | ❌ GAP — genuinely missing |
| `/auth/error` | `AuthErrorPage` | M124-S01 | ✅ Existing |
| `/dashboard/bookings` | `BookingQueuePage` | M125-S03 | ✅ Existing |

## BFF calls in this flow

| Call | When |
|---|---|
| `GET /v1/auth/google?state=__staff__` | Staff clicks "Entrar com Google" on `/dashboard/login` |
| `GET /v1/auth/google?state=__staff__:{tenantSlug}` | Staff clicks invite email link (UC-025) |
| `GET /internal/staff/by-oauth?googleOAuthId=...` | BFF callback — regular login lookup |
| `GET /internal/staff/by-email?email=...&tenantId=...` | BFF callback — first-login invite lookup |
| `POST /internal/staff/:staffId/activate` | BFF callback — UC-025 activation |

## Open questions / gaps

- [x] **Route for staff login:** — **Resolved.** `/dashboard/login` is canonical, confirmed shipped (`apps/web/app/dashboard/login/page.tsx`, reads `?tenantSlug` as a query param rather than a URL segment).
- [ ] **"Bem-vindo(a)!" banner on first login (UC-025 step 8):** does the dashboard show a one-time welcome message after first activation? If yes, it belongs in M124-S01 as an inline success state on the dashboard, not a separate page.
- [ ] **Deactivated staff (UC-025 A3 / A2):** tenant deactivated after invite sent — should `/auth/error` show a distinct message? The BFF must handle this case and pass `?reason=tenant-deactivated`.
- [ ] **JWT expiry / re-login:** no logout or refresh endpoint exists yet. Staff whose JWT expires will be redirected to `/dashboard/login`. Confirm this is the intended re-login flow.

## Prototype

Folder: `staff/prototypes/login/`

| File | Screen | UC | Story | Status |
|---|---|---|---|---|
| `index.html` | Navigation hub | — | — | ✅ Criado |
| `00-staff-login.html` | Login page (redirect → shared/staff-login.html) | UC-022, UC-025 | M124-S01 | ✅ Criado |
| `01-first-login.html` | Invite not accepted — "use the invite email link" | UC-022 Caso B | M124-S01 | ✅ Criado |
| `01b-error.html` | Auth error page (not found / email mismatch) | UC-022 Caso C, UC-025 A1 | M124-S01 | ✅ Criado |
| `dev-notes.md` | Implementation handoff | — | M124-S01 | ✅ Criado |
