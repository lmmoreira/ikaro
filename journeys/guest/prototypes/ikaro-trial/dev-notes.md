# Dev Notes — GUEST: Teste Grátis da Ikaro (`/ikaro-trial`)

> The authoritative contracts are `docs/API_CONTRACTS.md` § Billing — Public Signup API (BFF, no JWT) and `docs/USE_CASES.md` UC-127 / UC-128; this file describes what the draft screens assume. Target implementation: M26-S33 (pages) on top of S22-S25 (slug check, prices, signup, resend) and M26-S34 (hotsite CTA). `GAP` = does not exist yet. The call-to-action module on Ikaro's hotsite (`01`) is configured from `manager/prototypes/hotsite/01g` (UC-131).

## Overview

16 screens for the self-service trial signup served at `/ikaro-trial`, branded as the Ikaro (platform-owner) tenant: hotsite CTA (`01`), details and price table (`02*`), Google step (`03*`), business form (`04*`), account created (`05`). Everything is a GAP; M26-S33 builds the pages (BR monthly only), S34 the CTA module. This file is shaped to the `journeys/README.md` dev-notes template; the per-screen sections hold props, BFF call, validation and states.

## File map

| File | Status | Action |
|---|---|---|
| `apps/web/shells/hotsite/components/TrialSignupCtaModule.tsx` (+ `TrialSignupCtaConfigPanel.tsx`) | ❌ Gap | Create — M26-S34 (contract: S26) |
| `apps/web/app/[slug]/ikaro-trial/{page,entrar/page,conta-criada/page,termos/page,privacidade/page}.tsx` | ❌ Gap | Create — M26-S33 (thin; owner slug only, `notFound()` otherwise) |
| `apps/web/features/billing/components/public/IkaroTrialDetails.tsx`, `TrialPriceTable.tsx` | ❌ Gap | Create — M26-S33 (`02`, `02c`, `02d`) |
| `apps/web/features/billing/components/public/TrialGoogleStep.tsx`, `TrialAlreadyUsedNotice.tsx` | ❌ Gap | Create — M26-S33 (`03`, `03c`) |
| `apps/web/features/billing/components/public/TrialSignupForm.tsx`, `SlugField.tsx` | ❌ Gap | Create — M26-S33 (`04*`) |
| `apps/web/features/billing/components/public/AccountCreatedPage.tsx` | ❌ Gap | Create — M26-S33 (`05`) |
| `apps/web/features/billing/hooks/useSignupSession.ts`, `useSlugAvailability.ts`, `useCreateTenantSignup.ts`, `useResendInvitation.ts`, `usePublicPrices.ts` | ❌ Gap | Create — M26-S33 |
| `apps/web/features/billing/model/slug-suggestions.ts`, `features/billing/legal/terms-texts.ts` | ❌ Gap | Create — M26-S33 |
| `apps/web/features/platform/api/signup.ts` | ❌ Gap | Create — client-only `bffClient` calls (M26-S33) |
| `apps/web/proxy.ts` | ✅ EXISTS | Modify — runtime rewrite `/ikaro-trial/*` to the owner slug (M26-S33) |
| Prototype screens: `01-ikaro-hotsite-cta`, `02-ikaro-trial-details-br`, `02b-ikaro-trial-details-us`, `02c-ikaro-trial-prices-loading`, `02d-ikaro-trial-prices-error`, `03-signup-google-step`, `03b-signup-turnstile-failed`, `03c-signup-trial-already-used`, `04-signup-form`, `04b-signup-slug-taken`, `04c-signup-validation-error`, `04d-signup-submitting`, `04e-signup-rate-limited`, `04f-signup-provision-failed`, `04g-signup-us-selected`, `05-welcome-trial-started` (all `.html`) | ❓ Draft | Reference only |

## Known limitations of the prototype

- **`03` and `03b` draw a Turnstile widget on the Google step.** Prototype debt, kept as is: Turnstile is verified only on the final `POST /v1/public/signup/tenant` (M26-S33 rule R9), so the widget belongs to the form step (`04`), and the `03b` "verification failed" state is the failure state of that widget (`400 SIGNUP_TURNSTILE_FAILED`).
- **The annual toggle (Mensal | Anual) is drawn on `02`/`02b` but deferred to slice H / post-launch.** M26-S33 is BR monthly only and renders no toggle.
- **The US variant (`02b`, `04g`) is not offered by M26-S33** where the country has no price list (production).
- **The 60 s "Reenviar e-mail" cooldown on `05` is a UI-only cosmetic cooldown**; the enforced limits are 3 per hour per tenant and 10 per day per IP (Screen 5).
- **Links "Termos de Uso" / "Política de Privacidade" are `href="#"`** in `04`–`04g` until M26-S33 wires them to `/ikaro-trial/termos` and `/ikaro-trial/privacidade`.
- **Not drawn:** the "cadastro indisponível" notice (`503 SIGNUP_CLOSED`), the `SIGNUP_TRIAL_NOT_AVAILABLE` 409 other than via the `03c` card.

**Screens:** 16 — `01` hotsite CTA · `02`/`02b` details (BR / US) · `02c` prices loading · `02d` prices error · `03` Turnstile + Google · `03b` Turnstile failed · `03c` trial already used · `04` form · `04b` slug taken · `04c` validation errors · `04d` submitting · `04e` rate limited · `04f` creation failed · `04g` US selected · `05` account created.

## Screen 1 (`01`) — Ikaro hotsite with trial CTA (`TrialSignupCtaModule`)

**File:** `apps/web/shells/hotsite/components/TrialSignupCtaModule.tsx` (GAP; mirrors `BookingCtaModule` in the same folder). Hero, booking CTA and `HotsiteAuthBar` EXIST.
**Props:** `{ variant?: 'centered'|'left-aligned'; title: string; subtitle?: string; ctaLabel: string }` plus the section-level `presentation.surface` (same as every other hotsite module; `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § TRIAL_SIGNUP_CTA) . Button links to `/ikaro-trial`.
**BFF call:** `GET /v1/public/platform/manifest/ikaro` (existing; new module type `TRIAL_SIGNUP_CTA`).
**States:** static. **Mobile:** sections stack, buttons centered, not full width on desktop.
**Restriction:** settled in `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § TRIAL_SIGNUP_CTA — layout rules reject the module on any tenant whose slug is not `PLATFORM_OWNER_TENANT_SLUG` (server-side); `ikaro` is only this prototype's illustrative slug.

## Screen 2 (`02` / `02b` / `02c` / `02d`) — /ikaro-trial details (`IkaroTrialDetails`, `TrialPriceTable`)

**File:** `apps/web/app/[slug]/ikaro-trial/page.tsx` (thin) rendering `apps/web/features/billing/components/public/IkaroTrialDetails.tsx` and `TrialPriceTable.tsx`; `/ikaro-trial` is rewritten in `proxy.ts` to the platform-owner slug (`docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § The `/ikaro-trial` pages; GAP, M26-S33). Prices come from `usePublicPrices` (retry for `02d`). Table rows built from the price list; feature texts are i18n keys (both locales).
**Props:** `{ country: 'BR'|'US' }` (switch state, default from browser locale, BR if unknown).
**BFF call:**
```
GET /v1/public/billing/prices?country=BR|US   (@Public)
  Response: { countryCode, currency, taxBehavior, items: [{ featureKey, tier: 'STANDARD'|'BASIC'|'PLUS', amountMinor }] }   (canonical shape in `docs/API_CONTRACTS.md` § Billing — Public Signup API)
```
**States:** loading (02c, skeleton rows) -> ok (02/02b) / error (02d).
**Decision (02d):** prices are informational, so a load failure does NOT block signup. The warning explains this and offers retry; "Começar teste grátis" stays enabled.
**Error copy:** "Não foi possível carregar os preços agora." / "Tentar novamente".
**Notes:** CHATBOT shows BASIC and PLUS prices (PLUS is a real catalog price: R$ 79,00 / US$ 110.60, the seeded US list being the BR list plus 40% (M25-S04); the default total is R$ 245,00 / US$ 343.00 and the page lists only the five features). **`02b` still draws the earlier illustrative US prices (US$ 12 / 26 / 7 / 9 / 19 / 5, total US$ 59.00); redraw it before an implementation story uses it as a pixel reference**. Dependency hints ("Requer Agendamento") come from the closed dependency map. The annual toggle drawn in `02`/`02b` is slice H / post-launch (M26-S33 is BR monthly only, no toggle); coupons are out of scope. Money: `R$ 49,00` (pt-BR) / `US$ 68.60`. Mobile: table stays a single column of rows, switch above it.

## Screen 3 (`03` / `03b` / `03c`) — Google step (`TrialGoogleStep`, `TrialAlreadyUsedNotice`)

> **Turnstile placement (canonical, UC-127):** Turnstile is verified **only** on the final tenant-creation `POST` (the widget belongs to the form step, screen 4); this Google step has no Turnstile. The drafts `03`/`03b` still draw a widget and a "Turnstile failed" state on this step (known limitation, see above); the failed state belongs to screen 4 (`400 SIGNUP_TURNSTILE_FAILED`).

**File:** `apps/web/app/[slug]/ikaro-trial/entrar/page.tsx` for the owner slug; `TrialGoogleStep.tsx` renders until `useSignupSession` returns a session, then `TrialSignupForm` renders on the same route (GAP, M26-S33). Google button follows the existing OAuth pattern (`/api/auth/google?redirect=...`) with a signup intent that creates no tenant.
**Props:** none. The Turnstile token is obtained on the form step (screen 4) and sent in the tenant creation call.
**BFF call:** `GET /v1/public/signup/session` after the OAuth callback -> `{ email, name, trialAvailable, existingTenantSlug?, termsVersion }` (`trialAvailable=false` when an earlier self-signup tenant of this Google `sub` never paid; the tax-id rule is applied on the final `POST`; `docs/USE_CASES.md` UC-127 A3).
**States:** idle (Google button enabled) -> 03c trial not available (`trialAvailable = false`); signup closed (`FEATURE_FLAG_SIGNUP_ENABLED` off, `503 SIGNUP_CLOSED`) shows the "cadastro indisponível" notice instead of the button. (`03b` Turnstile failed: see the note above.)
**Error copy:** 03b "Não foi possível verificar que você é uma pessoa." ; 03c "Você já tem um teste em andamento ou não concluído" ("conclua o pagamento do seu teste atual") + "Entrar na conta existente" + "Descartar o teste não pago e começar de novo" (explains that it erases the unpaid trial and frees the name; leads to the same confirm page as `manager-10`; **until M27 the discard action is replaced by the honest "fale com a gente" message** and eligibility is released only by the M27 discard or an operator offboarding, never by cancelling).
**Mobile:** single column.
**Decided:** the signup session is a short-lived (30 min), signed, httpOnly cookie reusing `JWT_SECRET` with a distinct `typ`/`aud` and cookie name, set by the OAuth callback and bound to the verified Google account (API_CONTRACTS § Billing — Public Signup API).

## Screen 4 (`04` / `04b`–`04g`) — Signup form (`TrialSignupForm`, `SlugField`)

**File:** `apps/web/features/billing/components/public/TrialSignupForm.tsx` and `SlugField.tsx` (GAP, M26-S33); hooks `useSlugAvailability`, `useCreateTenantSignup`; suggestions from `features/billing/model/slug-suggestions.ts`. Use primitives from `apps/web/shared/components/ui/`; form errors use `BrandedFeedbackMessage`.
**Props:** `{ googleName: string; googleEmail: string }` (read-only, from the session). This screen carries the **Turnstile widget** (single-use token sent in the final `POST`). The 409 `SIGNUP_TRIAL_NOT_AVAILABLE` on submit (an earlier self-signup tenant of this Google account never paid, or the CPF/CNPJ already belongs to an unpaid account) renders the `03c` "Você já tem um teste em andamento ou não concluído" card (`TrialAlreadyUsedNotice`).
**BFF calls:**
```
GET  /v1/public/signup/slug-availability?slug=    -> { status: 'available'|'taken'|'reserved'|'invalid', reason? }  (debounced ~400ms)
POST /v1/public/signup/tenant
  Body: { businessName, slug, countryCode: 'BR'|'US', taxId (BR only, CPF or CNPJ), acceptedTermsVersion, turnstileToken }  (no language: it derives from the country)
  Response 201: { tenantSlug, nextPath: '/ikaro-trial/conta-criada' }  (clears the signup session; does not issue a tenant JWT)
```
**Validation:**
| Field | Rule | Error message |
|---|---|---|
| businessName | required, max 100 | "Informe o nome do negócio." |
| slug | 3-30 chars, a-z 0-9 hyphen, no leading/trailing hyphen | "Use de 3 a 30 letras minúsculas, números e hífens, sem hífen no início ou fim." |
| slug | reserved word (admin, api, www...) | "Este endereço é reservado. Escolha outro." |
| slug | taken | "Este endereço já está em uso. Tente outro, por exemplo lavacar-beloauto-sp." |
| countryCode | required BR or US | "Selecione o país." |
| terms | must be checked; version recorded | "Aceite os Termos de Uso e a Política de Privacidade para continuar." |
**States:** idle -> checking slug -> ok/taken (04b); submit -> submitting (04d) -> account-created/check-email page (05) / validation error 422 (04c, whole form, worst case: reserved slug "admin", empty name, no country, terms unchecked) / 429 (04e) / tenant-creation failure 5xx (04f). Server errors on submit (`docs/ERROR_CATALOG.md`):
| Status | Code | Rendering |
|---|---|---|
| 400 | `SIGNUP_TURNSTILE_FAILED` | Failure state of the form's widget (the `03b` message, drawn on the Google step in the prototype); a fresh token is requested before the next submit |
| 409 | `SIGNUP_SLUG_TAKEN` | Submit race after the live check passed: `04b` state with suggestions |
| 409 | `SIGNUP_TRIAL_NOT_AVAILABLE` | `03c` card |
| 422 | `SIGNUP_TERMS_NOT_ACCEPTED`, `SIGNUP_SLUG_INVALID`, `SIGNUP_SLUG_RESERVED` (plus `SIGNUP_TAX_ID_INVALID` / `SIGNUP_TAX_ID_REQUIRED`) | `04c` whole-form validation errors |
| 429 | `SIGNUP_RATE_LIMITED` | `04e`, wait time from `Retry-After` |
| 503 | `SIGNUP_CLOSED` | "cadastro indisponível" notice (not drawn) |
| 5xx | tenant creation failed | `04f`, nothing was created |
**Error copy:** 04e "Muitas tentativas. Por segurança, aguarde alguns minutos antes de tentar de novo." ; 04f "Não conseguimos criar sua conta. Nada foi criado, então você pode tentar de novo com segurança." This applies only when the tenant-creation transaction fails. Post-commit manager/Billing setup is durable asynchronous work; its handoff is the account-created page and existing invitation/login email, not a dashboard redirect.
**Notes:** slug and country are immutable after creation (hint shown). URL preview uses `ikaro.app/{slug}` (illustrative domain). Desktop buttons are inline, not stretched. Bot Turnstile token is single-use; after a failed submit the page must re-request a token.

## Conventions and decisions added in the review pass

- **Currency display:** the public price page keeps the `US$` prefix (`US$ 68.60`, period as decimal separator, as in the BRL page's `R$`) on the United States table, including the pt-BR text around it; `02b` and `04g` stay `lang="pt-BR"` because the page is Portuguese until the visitor chooses the country (the page's own note says so), only the price strings are USD. The real implementation formats with `Intl.NumberFormat` for the page locale and the price list's currency.
- **US gate:** the US switch/option (`02b`, `04g`) is shown only where the US has a price list; otherwise a US request fails in the Billing handler with `BILLING_NO_PRICE_FOR_COUNTRY` (UC-110 A2).
- **Slug-taken suggestions (`04b`)** are generated client-side (typed slug plus a suffix) and each is checked with `GET /v1/public/signup/slug-availability`; the endpoint returns no suggestions.
- **Placeholder links:** "Termos de Uso" and "Política de Privacidade" are `href="#"` in the signup form screens `04`–`04g` (prototype placeholders; `03` and `03b` only mention them as plain text). They are wired to `/ikaro-trial/termos` and `/ikaro-trial/privacidade` by M26-S33.
- **Dashboard shell language:** the manager billing screens for the US tenant (`manager/prototypes/billing/02c`, `02e`; tenant "Sunrise Auto Spa") keep the dashboard shell (sidebar, topbar, nav) in pt-BR while the page content is English. Whether the shell language follows the tenant country or the user is a product decision still open.

## Screen 5 (`05`) — Account created / check email (`AccountCreatedPage`)

**File:** `apps/web/app/[slug]/ikaro-trial/conta-criada/page.tsx` + `apps/web/features/billing/components/public/AccountCreatedPage.tsx`; hook `useResendInvitation` (GAP, M26-S33).
**BFF call:** none after the `POST /v1/public/signup/tenant` response except the resend below. The screen must not call an authenticated billing endpoint and must not poll provisioning.
**States:** account created (this screen). It confirms the verified Google email and explains that access instructions were sent there. It offers a rate-limited **"Reenviar e-mail"** button (disabled with the hint "Disponível novamente em 60 s" after each send — a **UI-only cosmetic cooldown**, not the enforced limit) and a second block **"Já confirmou? Entrar com Google"** (one-click login with the same Google account), shown **only when the resend response says `ready: true`** (the first manager exists); "Falar com a gente" stays only as a footnote link. There is no dashboard button, checklist, trial-end date, or claim that the asynchronous manager/Billing setup has already completed.
**Resend (M26-S25):**
```
POST /v1/public/signup/resend   (@Public, no body)
  Auth: resend credential cookie issued at the signup 201 (signed, typ/aud signup-resend, bound to { tenantId, email }, 30 min)
  Response 200: { sent: boolean, ready: boolean }
  401 without a valid credential (generic, no enumeration); 429 SIGNUP_RATE_LIMITED + Retry-After; 503 SIGNUP_CLOSED
```
Enforced limits: 3 per hour per tenant and 10 per day per IP (best-effort per BFF instance). `{ sent: false, ready: false }` means the first-manager row does not exist yet (the page keeps waiting); `{ sent: false, ready: true }` means the manager already linked Google (no email sent).
**Copy:** "Sua conta foi criada" / "Enviamos as instruções de acesso para {email}. Abra o e-mail para entrar e começar seu teste de 14 dias." / "Não encontrou o e-mail? Verifique a caixa de spam ou fale com a gente."
**Mobile:** single column; primary login link not full width on desktop.

---

## Addenda that apply to these screens (from the discovery review rounds)

- **Signup.** The language field was removed from `04*`; language derives from the country. The country selector offers only "Brasil" by default with the hint "Define a moeda, o fuso padrão e o idioma"; "Estados Unidos" appears only in `04g`, which models a country with a US price list. Error `SIGNUP_TRIAL_NOT_AVAILABLE` reuses the `03c` card.
- **BR tax ID at signup.** `04*` now has a required "CPF ou CNPJ da empresa" field for BR (check digits validated; error `SIGNUP_TAX_ID_INVALID`/`SIGNUP_TAX_ID_REQUIRED`; screen 04c shows the invalid case). It is saved to the billing account and is editable but not blankable on the Dados tab for BR tenants.
- **New `04g-signup-us-selected`** (UC-127 A7): US selected, CPF/CNPJ hidden, note that the full address is collected in the dashboard before the first charge; only reachable where the US has a price list.
- **Signup details.** `05` has a rate-limited "Reenviar e-mail" (60 s cosmetic cooldown; enforced 3/h per tenant, 10/day per IP) and "Já confirmou? Entrar com Google"; `03c` offers "Entrar na conta existente" or discarding the unpaid trial; `04*` offers only "Brasil" (US only in `04g`, flag on) with the hint "Define a moeda, o fuso padrão e o idioma"; `02b` is in Portuguese before the country is picked and says so.
- **Price tables (`02`, `02b`).** Same toggle (slice H / post-launch; not built by M26-S33); the header becomes "Preço anual", amounts switch to "/ano" with "equivale a .../mês" (the US page keeps its existing Portuguese UI copy).
