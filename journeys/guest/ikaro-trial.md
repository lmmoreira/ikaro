# GUEST — Teste Grátis da Ikaro (Self-Service Trial Signup)

**Actor(s):** GUEST (any visitor; no account yet)
**Goal:** A business owner opens Ikaro's own hotsite, reads what the platform offers and what it costs, signs in with Google, creates a tenant in a few fields and is told to check their email — without a human on Ikaro's side
**UCs covered:** UC-127 (visitor signs up for a trial), UC-128 (public prices and slug check); the call to action that starts the flow is configured by UC-131 (`manager/hotsite.md`); the optional first-run checklist after the first login is UC-129 (`manager/onboarding.md`)
**Status:** Planned in M26 (stories S22-S25 backend/BFF, S33 public pages and Terms/Privacy hosting, S34 hotsite CTA); nothing shipped yet

> Self-signup is the **default** way to create a tenant; the operator route (UC-024) is the exception path for exempt and partner tenants. The pages are served at `/ikaro-trial` and are **branded as the Ikaro tenant** (they take the platform-owner tenant's hotsite branding), so the prototype uses the shared hotsite look. They do not depend on the owner hotsite being published (`docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § The `/ikaro-trial` pages). This journey ends at the account-created page; what happens after the invitation email is `staff/login.md`.

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Hotsite(["Visitor on Ikaro's hotsite"]) --> Cta["❓ GAP: Hotsite with the trial CTA<br/>(TRIAL_SIGNUP_CTA module) — 01-ikaro-hotsite-cta"]
    Cta -->|"Testar grátis"| Details["❓ GAP: /ikaro-trial — features and price table<br/>BR / US switch — 02-ikaro-trial-details-br, 02b-…-us"]
    Details -.->|"prices loading / failed"| PriceStates["❓ GAP: 02c-…-prices-loading, 02d-…-prices-error<br/>signup stays possible"]
    Details -->|"Começar teste grátis"| Google["❓ GAP: Google sign-in — 03-signup-google-step"]
    Form -.->|"Turnstile fails on submit"| TsFail["❓ GAP: 03b-signup-turnstile-failed (moves to the form step)"]
    Google -.->|"earlier trial of this Google account never paid"| Used["❓ GAP: 03c-signup-trial-already-used<br/>(sign in to the existing account, or discard — UC-141)"]
    Google -->|"identity verified"| Form["❓ GAP: Business data form — 04-signup-form<br/>name, slug (live check), country, CPF/CNPJ (BR), terms"]
    Form -.->|"slug taken / invalid"| Slug["❓ GAP: 04b-signup-slug-taken, 04c-signup-validation-error"]
    Form -->|"submit"| Submitting["❓ GAP: 04d-signup-submitting"]
    Form -.->|"US selected"| US["❓ GAP: 04g-signup-us-selected<br/>(no CPF/CNPJ)"]
    Submitting -.->|"429"| Rate["❓ GAP: 04e-signup-rate-limited"]
    Submitting -.->|"creation fails"| Fail["❓ GAP: 04f-signup-provision-failed<br/>nothing was created"]
    Submitting -->|"201"| Welcome["❓ GAP: Account created — check your email — 05-welcome-trial-started"]
    Welcome -->|"invitation email → Google login"| Login["✅ /dashboard/login?tenantSlug=…<br/>(staff/login.md)"]

    class Login existing
    class Cta,Details,PriceStates,Google,TsFail,Used,Form,Slug,Submitting,US,Rate,Fail,Welcome gap
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| Ikaro's own hotsite, section with the trial CTA | `TrialSignupCtaModule` (13th module type, platform-owner tenant only; the editor panel is `TrialSignupCtaConfigPanel`) | M26-S34 (contract and owner rule: M26-S26) | ❓ Gap |
| `/ikaro-trial` — details and BR price table (US variant not offered while `FEATURE_FLAG_SIGNUP_US` is off) | `IkaroTrialDetails`, `TrialPriceTable` (`features/billing/components/public/`) | M26-S33 (data: S23 prices) | ❓ Gap |
| `/ikaro-trial/entrar` — **both** the Google step and the business data form: the Google step renders until `GET /v1/public/signup/session` returns a session, then the form renders on the same route (Turnstile is verified only on the final submit) | `TrialGoogleStep`, `TrialSignupForm`, `SlugField`, `TrialAlreadyUsedNotice` | M26-S33 (data: S22 slug check, S24 session and signup) | ❓ Gap |
| `/ikaro-trial/conta-criada` — account created (`nextPath` returned by the `201`) | `AccountCreatedPage` | M26-S33 (data: S25 resend) | ❓ Gap |
| `/ikaro-trial/termos`, `/ikaro-trial/privacidade` — hosted Terms of Use and Privacy Policy for `?v=` or the current `termsVersion` (placeholder, `noindex` pages until the owner supplies the final texts; they gate launch in M26-S39) | static legal pages from `features/billing/legal/terms-texts.ts` | M26-S33 | ❓ Gap |

## BFF calls (contract: `docs/API_CONTRACTS.md` § Billing — Public Signup API)

| Call | Used by |
|---|---|
| `GET /v1/public/billing/prices?country=` | details / price table (UC-128) |
| `GET /v1/public/signup/slug-availability?slug=` | the slug field, debounced (UC-128) |
| `GET /v1/public/signup/session` | after the Google callback: `{ email, name, trialAvailable, existingTenantSlug?, termsVersion }` — the form sends `termsVersion` back as `acceptedTermsVersion` (the web keeps no version constant) |
| `POST /v1/public/signup/tenant` | the submit (UC-127) |
| `POST /v1/public/signup/resend` | "Reenviar e-mail" on the account-created page. No body; authenticated by the **resend credential cookie** issued at the signup `201` (signed, `typ`/`aud` `signup-resend`, bound to `{ tenantId, email }`, 30 minutes); without it a generic `401`. Response `200 { sent, ready }`; limits 3 per hour per tenant and 10 per day per IP (`429 SIGNUP_RATE_LIMITED` + `Retry-After`); `503 SIGNUP_CLOSED` when signup is off. The "Já confirmou? Entrar com Google" block appears only when `ready` is true (M26-S25). The 60 s disabled button on `05` is a UI-only cosmetic cooldown, not the enforced limit |

## Open questions / gaps

- [ ] **Routing mechanism:** the public URL `/ikaro-trial` is a rewrite to the owner tenant's `app/[slug]/…` tree so the pages get `--ba-*` branding; M26-S33 settles it as a runtime rewrite in `apps/web/proxy.ts` (`/ikaro-trial/*` to `/{PLATFORM_OWNER_TENANT_SLUG}/ikaro-trial/*`).
- [ ] **CSP for Turnstile** on the `/ikaro-trial` pages (the same trap as the lead-form page — `docs/ENGINEERING_RULES_FRONTEND.md`); M26-S33 notes the `/ikaro-trial` tree is already a hotsite route, so `proxy.ts` already gives it the Turnstile CSP and a spec asserts it.
- [ ] **Signup closed:** while `FEATURE_FLAG_SIGNUP_ENABLED` is off (production until launch readiness) the signup routes answer `503 SIGNUP_CLOSED` and `/ikaro-trial` shows a "cadastro indisponível" notice (prices and slug check stay readable); no screen is drawn yet (M26-S33 renders the notice; draw it when the prototype is next redrawn).
- [ ] **Signup session cookie name** and the status of `GET /v1/public/signup/session` without a valid cookie (and of `resend` when the first manager already exists): decided at story discovery of M26-S24 / S25.
- [ ] **Discard link on `03c`** points at the discard-confirm screen (`manager/prototypes/billing/10-discard-trial-confirm.html`); until the purge participants ship the screen shows the honest interim message ("contact Ikaro") and an operator runs the offboarding runbook (M17-S51).
- [ ] **US variant gate:** the United States option (`02b`, `04g`) exists only while `FEATURE_FLAG_SIGNUP_US` is on; with the flag off the country list offers Brasil only and a crafted US request is refused with `422 BILLING_US_NOT_AVAILABLE` (`docs/ERROR_CATALOG.md`).
- [ ] **Slug suggestions (`04b`):** the "try another" suggestions are generated by the client (for example the typed slug plus a suffix) and each one is checked through the same availability call; the backend returns only the status (`available`/`taken`/`reserved`/`invalid`), never suggestions.
- [ ] **Copy:** all strings need pt-BR and en entries; the language of each page derives from the country the visitor picks.

## Prototype

Folder: `guest/prototypes/ikaro-trial/` — hub: `index.html`. The prototype was built inside the billing discovery and moved here as-is; the screens carry a "DRAFT PROTOTYPE" header.

| File | Screen | UC | Status |
|---|---|---|---|
| `index.html` | Navigation hub + dry-run checklist | — | ❓ Draft |
| `01-ikaro-hotsite-cta.html` | Ikaro's hotsite with the trial CTA | UC-131 / UC-127 | ❓ Draft |
| `02-ikaro-trial-details-br.html` | Details and price table, Brazil | UC-127 / UC-128 | ❓ Draft |
| `02b-ikaro-trial-details-us.html` | Details and price table, United States | UC-127 / UC-128 | ❓ Draft |
| `02c-ikaro-trial-prices-loading.html` | Prices loading (skeleton) | UC-128 A1 | ❓ Draft |
| `02d-ikaro-trial-prices-error.html` | Prices failed to load (signup still possible) | UC-128 A1 | ❓ Draft |
| `03-signup-google-step.html` | Google sign-in (known limitation: the draft still shows a Turnstile widget; canonical placement is the form step, M26-S33 rule R9) | UC-127 | ❓ Draft |
| `03b-signup-turnstile-failed.html` | Turnstile failed (drawn on the Google step; in the product this is the failure state of the form step's widget, `400 SIGNUP_TURNSTILE_FAILED`) | UC-127 A2 | ❓ Draft |
| `03c-signup-trial-already-used.html` | Trial already used by this Google account | UC-127 A3 | ❓ Draft |
| `04-signup-form.html` | Business data form | UC-127 | ❓ Draft |
| `04b-signup-slug-taken.html` | Slug taken, with suggestions | UC-127 A1 | ❓ Draft |
| `04c-signup-validation-error.html` | Validation errors (whole form) | UC-127 A1 / A5 / A9 | ❓ Draft |
| `04d-signup-submitting.html` | Creating the account | UC-127 | ❓ Draft |
| `04e-signup-rate-limited.html` | Too many attempts | UC-127 A4 | ❓ Draft |
| `04f-signup-provision-failed.html` | Tenant creation failed, nothing created | UC-127 A6 | ❓ Draft |
| `04g-signup-us-selected.html` | Country United States selected (no CPF/CNPJ) | UC-127 A7 | ❓ Draft |
| `05-welcome-trial-started.html` | Account created — check your email (resend, sign in with Google) | UC-127 A10 | ❓ Draft |
| `dev-notes.md` | Implementation handoff (moved as-is from the billing discovery; reshape at story discovery) | — | ❓ Draft |

The hub links to `../book-a-service/01-service-selection.html` for the published hotsite look the owner tenant shares with every tenant.
