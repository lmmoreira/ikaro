# Dev Notes — GUEST: Teste Grátis da Ikaro (`/ikaro-trial`)

> **Moved as-is from the billing discovery prototype notes, to be reshaped to the `journeys/README.md` dev-notes template at story discovery** (file map, per-screen props / BFF call / validation / states; the per-screen sections below already follow most of it). The authoritative contracts are `docs/API_CONTRACTS.md` § Billing — Public Signup API (BFF, no JWT) and `docs/USE_CASES.md` UC-127 / UC-128; this file describes only what the draft screens assume. Component names are proposals (`GAP` = does not exist yet). The call-to-action module on Ikaro's hotsite (`01`) is configured from `manager/prototypes/hotsite/01g` (UC-131).

**Screens:** 16 — `01` hotsite CTA · `02`/`02b` details (BR / US) · `02c` prices loading · `02d` prices error · `03` Turnstile + Google · `03b` Turnstile failed · `03c` trial already used · `04` form · `04b` slug taken · `04c` validation errors · `04d` submitting · `04e` rate limited · `04f` creation failed · `04g` US selected · `05` account created.

## Screen 1 (`01`) — Ikaro hotsite with trial CTA (`TrialSignupCtaModule`)

**File:** `apps/web/shells/hotsite/components/TrialSignupCtaModule.tsx` (GAP; mirrors `BookingCtaModule` in the same folder). Hero, booking CTA and `HotsiteAuthBar` EXIST.
**Props:** `{ variant?: 'centered'|'left-aligned'; title: string; subtitle?: string; ctaLabel: string }` plus the section-level `presentation.surface` (same as every other hotsite module; `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § TRIAL_SIGNUP_CTA) . Button links to `/ikaro-trial`.
**BFF call:** `GET /v1/public/platform/manifest/ikaro` (existing; new module type `TRIAL_SIGNUP_CTA`).
**States:** static. **Mobile:** sections stack, buttons centered, not full width on desktop.
**Restriction:** settled in `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § TRIAL_SIGNUP_CTA — layout rules reject the module on any tenant whose slug is not `PLATFORM_OWNER_TENANT_SLUG` (server-side); `ikaro` is only this prototype's illustrative slug.

## Screen 2 (`02` / `02b` / `02c` / `02d`) — /ikaro-trial details (`IkaroTrialDetailsPage`, `PriceTable`)

**File:** `apps/web/app/[slug]/…` for the platform-owner slug, with a rewrite from `/ikaro-trial` (`docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § routing; GAP; keep thin, logic in `shared/lib`). Table rows built from the price list; feature texts are i18n keys (both locales).
**Props:** `{ country: 'BR'|'US' }` (switch state, default from browser locale, BR if unknown).
**BFF call:**
```
GET /v1/public/billing/prices?country=BR|US   (@Public)
  Response: { countryCode, currency, taxBehavior, items: [{ featureKey, tier: 'STANDARD'|'BASIC'|'PLUS', amountMinor }] }   (canonical shape in `docs/API_CONTRACTS.md` § Billing — Public Signup API)
```
**States:** loading (02c, skeleton rows) -> ok (02/02b) / error (02d).
**Decision (02d):** prices are informational, so a load failure does NOT block signup. The warning explains this and offers retry; "Começar teste grátis" stays enabled.
**Error copy:** "Não foi possível carregar os preços agora." / "Tentar novamente".
**Notes:** CHATBOT shows BASIC and PLUS prices (PLUS is a real catalog price: R$ 79,00 / US$ 19.00; the default total is R$ 245,00 / US$ 59.00 and the page lists only the five features). Dependency hints ("Requer Agendamento") come from the closed dependency map. Annual billing and coupons are out of scope. Money: `R$ 49,00` (pt-BR) / `US$ 12.00`. Mobile: table stays a single column of rows, switch above it.

## Screen 3 (`03` / `03b` / `03c`) — Turnstile + Google step (`SignupGoogleStep`)

**File:** `entrar` page under `apps/web/app/[slug]/…` for the owner slug (GAP). Google button follows the existing OAuth pattern (`/api/auth/google?redirect=...`) with a signup intent that creates no tenant.
**Props:** none. Turnstile token held in client state, sent later in the tenant creation call.
**BFF call:** `GET /v1/public/signup/session` after the OAuth callback -> `{ email, name, trialAvailable, existingTenantSlug? }` (`trialAvailable=false` when an earlier self-signup tenant of this Google `sub` never paid; `docs/USE_CASES.md` UC-127 A3).
**States:** idle (Google button enabled only after Turnstile passes) -> 03b Turnstile failed (button disabled, retry link) / 03c trial not available (`trialAvailable = false`).
**Error copy:** 03b "Não foi possível verificar que você é uma pessoa." ; 03c "Você já tem um teste em andamento ou não concluído" ("conclua o pagamento do seu teste atual") + "Entrar na conta existente" + "Descartar o teste não pago e começar de novo" (explains that it erases the unpaid trial and frees the name; leads to the same confirm page as `manager-10`). No "marcar uma conversa com nossa equipe".
**Mobile:** single column, Turnstile widget 20rem max.
**Open question:** the "session" endpoint name implies a short-lived signup cookie set by the OAuth callback; confirm it is httpOnly and bound to the Google account.

## Screen 4 (`04` / `04b`–`04g`) — Signup form (`SignupForm`)

**File:** `apps/web/features/platform/components/signup/SignupForm.tsx` (GAP). Use primitives from `apps/web/shared/components/ui/` (verify exact names); `SlugInput` with live availability is new.
**Props:** `{ googleName: string; googleEmail: string }` (read-only, from the session). The 409 `SIGNUP_TRIAL_NOT_AVAILABLE` on submit (an earlier self-signup tenant of this Google account never paid) renders the `03c` "Você já tem um teste em andamento ou não concluído" card.
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
**States:** idle -> checking slug -> ok/taken (04b); submit -> submitting (04d) -> account-created/check-email page (05) / validation error 422 (04c, whole form, worst case: reserved slug "admin", empty name, no country, terms unchecked) / 429 (04e) / tenant-creation failure 5xx (04f).
**Error copy:** 04e "Muitas tentativas. Por segurança, aguarde alguns minutos antes de tentar de novo." ; 04f "Não conseguimos criar sua conta. Nada foi criado, então você pode tentar de novo com segurança." This applies only when the tenant-creation transaction fails. Post-commit manager/Billing setup is durable asynchronous work; its handoff is the account-created page and existing invitation/login email, not a dashboard redirect.
**Notes:** slug and country are immutable after creation (hint shown). URL preview uses `ikaro.app/{slug}` (illustrative domain). Desktop buttons are inline, not stretched. Bot Turnstile token is single-use; after a failed submit the page must re-request a token.

## Screen 5 (`05`) — Account created / check email (`SignupAccountCreatedPage`)

**File:** `conta-criada` page under `apps/web/app/[slug]/…` for the owner slug (GAP).
**BFF call:** none after the `POST /v1/public/signup/tenant` response. The screen must not call an authenticated billing endpoint and must not poll provisioning.
**States:** account created (this screen). It confirms the verified Google email and explains that access instructions were sent there. It offers a rate-limited **"Reenviar e-mail"** button (disabled with the hint "Disponível novamente em 60 s" after each send) and a second block **"Já confirmou? Entrar com Google"** (one-click login with the same Google account); "Falar com a gente" stays only as a footnote link. There is no dashboard button, checklist, trial-end date, or claim that the asynchronous manager/Billing setup has already completed.
**Copy:** "Sua conta foi criada" / "Enviamos as instruções de acesso para {email}. Abra o e-mail para entrar e começar seu teste de 14 dias." / "Não encontrou o e-mail? Verifique a caixa de spam ou fale com a gente."
**Mobile:** single column; primary login link not full width on desktop.

---

## Addenda that apply to these screens (from the discovery review rounds)

- **Signup.** The language field was removed from `04*`; language derives from the country. The country selector offers only "Brasil" by default with the hint "Define a moeda, o fuso padrão e o idioma"; "Estados Unidos" appears only in `04g`, which models `FEATURE_FLAG_SIGNUP_US` on. Error `SIGNUP_TRIAL_NOT_AVAILABLE` reuses the `03c` card.
- **BR tax ID at signup.** `04*` now has a required "CPF ou CNPJ da empresa" field for BR (check digits validated; error `SIGNUP_TAX_ID_INVALID`/`SIGNUP_TAX_ID_REQUIRED`; screen 04c shows the invalid case). It is saved to the billing account and is editable but not blankable on the Dados tab for BR tenants.
- **New `04g-signup-us-selected`** (UC-127 A7): US selected, CPF/CNPJ hidden, note that the full address is collected in the dashboard before the first charge; only reachable when `FEATURE_FLAG_SIGNUP_US` is on.
- **Signup details.** `05` has a rate-limited "Reenviar e-mail" (60 s) and "Já confirmou? Entrar com Google"; `03c` offers "Entrar na conta existente" or discarding the unpaid trial; `04*` offers only "Brasil" (US only in `04g`, flag on) with the hint "Define a moeda, o fuso padrão e o idioma"; `02b` is in Portuguese before the country is picked and says so.
- **Price tables (`02`, `02b`).** Same toggle; the header becomes "Preço anual", amounts switch to "/ano" with "equivale a .../mês" (the US page keeps its existing Portuguese UI copy).
