# Dev Notes — Tenant Billing Discovery Prototype

> **Promoted (manager billing page):** the 46 manager billing-page screens (`manager-01*`, `02*`, `04*`, `06*`, `07*`, `08*`, `09`, `11`–`13`; Fragment A and the manager addenda below) moved to `journeys/manager/prototypes/billing/` (files renamed without the `manager-` prefix) and their handoff notes to `journeys/manager/prototypes/billing/dev-notes.md`. The text below is kept as the discovery record; the journey copy is the working one. The enforcement states moved too: `manager-03*` (locked features) to `journeys/manager/prototypes/billing/`, `staff-01`/`staff-02` to `journeys/staff/prototypes/login/` (`02`, `03`), `customer-01`/`01b`/`01c` to `journeys/customer/prototypes/minha-conta/` (`16`, `16b`, `16c`) and `public-01` to `journeys/guest/prototypes/unpublished-hotsite/` — each with its handoff notes (the sections below are kept as the discovery record). `manager-05*` moved to `journeys/manager/prototypes/hotsite/` (`01g`, `01h`) and `manager-10` to `journeys/manager/prototypes/billing/10-discard-trial-confirm.html` (UC-141); no screen file stays in this folder.

> **Promoted (public signup + hotsite panel):** the 16 public signup screens (`public-02`–`public-06` and variants) moved to `journeys/guest/prototypes/ikaro-trial/` (renumbered `01`–`05`; handoff notes in its `dev-notes.md`), and the TRIAL_SIGNUP_CTA editor panel (`manager-05`, `05b`; Screens 5 and 6 below) to `journeys/manager/prototypes/hotsite/` as `01g`/`01h` (appended to its `dev-notes.md`). The text below is kept as the discovery record; the journeys copies win.

**Status:** Discovery-stage, illustrative. Per-screen sections follow the `journeys/README.md` dev-notes template (component, file status, props, BFF call, validation, states, copy, mobile). The canonical API contract is `../tenant-billing_API.md` and the per-screen sections below were aligned to it on 2026-10-27 (field names, response shapes, error codes `BILLING_*`/`SIGNUP_*`). If any drift remains, the API document wins. Use cases: `../tenant-billing_USECASES.md` (CAND numbers below refer to it). Model and rules: `../tenant-billing.md`.

## Overview

73 screens across four areas: (1) the manager **billing page** (one "Assinatura" page with five tabs — Resumo, Plano, Cobranças, Dados de cobrança, Cobrança automática (shown as "Em breve", see Addendum 4) — one primary action per tab, like the service editor; cancel is a separate confirmation page); (2) **changed existing screens** (dashboard banners, locked features, hotsite editor panel); (3) the **suspended experience** for staff, customers and the public hotsite; (4) the **self-signup** flow on Ikaro's own hotsite (`/ikaro-trial`). Every screen has its alternate-state variants as separate files (index.html, "Estados alternativos").

## What is real vs invented

- **Real:** `--ba-*` tokens (`journeys/shared/tokens.css`), the dashboard shell, hotsite and customer-dashboard pages, `ErrorAlert`, status badge and detail-layout patterns.
- **Invented:** tenants "Lavacar BeloAuto" and "Ikaro"; the example selection and dates (the BR catalog prices are the decided ones: HOTSITE R$ 49, BOOKING R$ 109 (includes recurring reservations and availability alerts), LOYALTY R$ 29, CHATBOT BASIC R$ 39 / PLUS R$ 79, LEAD_FORM R$ 19; default total R$ 245. US: HOTSITE US$ 12, BOOKING US$ 26, LOYALTY US$ 7, CHATBOT US$ 9 / 19, LEAD_FORM US$ 5; total US$ 59). Only five features exist: HOTSITE, BOOKING, LOYALTY, CHATBOT, LEAD_FORM, dates, the `ikaro.app/` URL prefix, tier names.
- **New nav item, not in today's IA:** "Assinatura" under "Somente Gerente" (also in the mobile "Mais" sheet).

## Suspension routing (what the screens assume)

| Role | After login while `SUSPENDED` | Screens |
|---|---|---|
| MANAGER | Only `/dashboard/billing` (+ the cancel confirmation page); every other dashboard route redirects there; other nav items rendered disabled | manager-01d, manager-01e |
| STAFF | Notice page with "Sair" | staff-01 |
| CUSTOMER | Account page with "Empresa inativa" badge; history viewable; open-booking detail blocked; new booking blocked | customer-01, 01b, 01c |
| Visitor | "Página não publicada" with top-bar login for team and customers (reason-neutral) | public-01 |

## Open questions / known limitations

- **Top-bar label:** the real `HotsiteAuthBar` says "Área da Equipe"; prototypes keep the real label (the spec called it "Login da equipe"). Verify `<Unavailable />` renders the bar in the story. (Single canonical entry; Fragment B only points here.)
- **Customer access projection:** customers call the same authenticated `GET /v1/billing/access`; anonymous visitors only get the effective `isPublished` from the manifest. Confirm the BFF returns a reduced projection (active flag, no reason) to non-manager roles.
- **"Falar com a gente"** is drawn only on manager screens (upsell, suspended, errors). Target is a stand-in (`journeys/shared/hotsite.html`) for Ikaro's own booking page; the real link is Ikaro's tenant booking URL.
- **Trial cancel** has two variants: immediate with nothing paid or `PAST_DUE` (`manager-06d`, CAND-28 A3) and, when the first invoice is already paid, effective at trial end (`manager-06e`). A never-paid tenant can also self-service **discard** the test (`manager-10`): it erases the tenant and frees the slug and trial eligibility.
- **Automatic charging screens (`manager-07*`) are a preview, "prévia – ainda não disponível".** Card/Pix Automático auto-billing is a later optional slice. Everywhere else the tab and the Resumo row are drawn as a muted "Em breve" with no active "Ativar" link or button. Do not expose the 07* routes until the real Asaas account and sandbox authorization flow have passed end-to-end verification.
- **Reactivating a scheduled cancel** needs no payment while the paid period is still running; CAND-29 locks that contract. Reactivating from `SUSPENDED` issues a recovery charge (the old charge is cancelled, not re-dated).
- **Price load failure** on `/ikaro-trial` does not block signup (the trial is free); decide in the story whether the price table should still be hidden.
- **Skeleton primitive:** check `apps/web/shared/components/ui/` before building a loading skeleton.
- **Status name:** screens say "Em teste" for `TRIALING`.
- **Provider name** is never shown in any screen ("Pagar agora" opens a hosted page). Refunds and disputes are handled in the payment provider console by the operator, only as exceptions; tenant-facing copy says "pelo provedor de pagamento" / "by the payment provider", never "nossa equipe".
- **Language before the country is chosen:** `/ikaro-trial` (03/03b) is always Portuguese; 03b carries a visible note that the page stays in Portuguese until the visitor picks the country, after which signup and the account use the language derived from the country (decision recorded 2026-10-28).


---

# Fragment A (CAND mapping: 12 billing page, 13 identity, 14 pay, 16 suspended routing, 25 trial, 27 purge, 28 cancel, 29 reactivate, 30 auto-billing) — Manager billing, identity, cancel, auto-billing (screens 01*, 02*, 06*, 07*)

Shared by all screens below: dashboard shell (EXISTS: dashboard layout/sidebar/bottom-nav), new nav item **"Assinatura"** under "Somente Gerente" (GAP; also in the mobile "Mais" sheet). Billing is visible to every MANAGER. Money `R$ 245,00` = BR list prices for HOTSITE 49 + BOOKING 109 + LOYALTY 29 + CHATBOT(BASIC) 39 + LEAD_FORM 19. Badge reuses `.status-badge` (EXISTS) with local colors for REFUNDED/CHARGEBACK. Success is inline (no toast).

BFF shapes: the canonical request/response contracts are in `../tenant-billing_API.md` §1 (`status` is `TRIALING|ACTIVE|PAST_DUE|SUSPENDED`, `suspensionReason`, money as `*Minor` integers, `GET /v1/billing/charges` uses limit/offset Pattern A pagination). Field names in the per-screen sections below are illustrative where they differ.
Charge status labels: PENDING "Pendente", PAID "Pago", OVERDUE "Vencida", FAILED "Falhou", CANCELED "Cancelada", REFUNDED "Reembolsada", CHARGEBACK "Chargeback". No refund UI (handled by the provider console).

## Screen 1 — Assinatura page, tabbed (`BillingPage` + `BillingTabs`) — manager-01-billing-active.html (Resumo tab, ACTIVE)
**Pattern (owner feedback, 2026-10-26):** one page "Assinatura" with 5 tabs **Resumo | Plano | Cobranças | Dados de cobrança | Cobrança automática**, built exactly like the service editor (`servicos/03-service-edit.html`): `.editor-tabs`/`.editor-tab`/`.editor-panel` + `showTab()` (EXISTS: reuse the tab component/pattern of `ServiceEditPage` and the hotsite editor; the billing content is GAP). Exactly ONE primary button per tab; destructive action = separate confirmation page (`manager-06-cancel-confirm.html`, like `03b-deactivate-confirm.html`). The former standalone screens (identity form, auto-billing) are now tabs; the files 02*/07* are the same page with that tab pre-selected. Mobile: short tab labels at <=480px ("Resumo", "Plano", "Cobranças", "Dados", "Automática"), tab bar scrolls horizontally if needed.
**Component tree:** `BillingPage` (route `app/dashboard/billing/page.tsx` (the real tree is `app/dashboard/...`), thin; title row = "Assinatura" + status badge) -> `BillingTabs` -> `ResumoTab` (`SubscriptionSummaryCard`, `OpenChargeCard`, read-only `FeatureLineItems` with the text link "Alterar plano" that switches to the Plano tab, footer links) | `PlanoTab` (`FeatureToggleCard` x5, `ChatbotTierPicker`, `PlanChangePreview`; Screens 22-29) | `CobrancasTab` (`ChargeHistoryTable`) | `DadosCobrancaTab` (`BillingIdentityForm`) | `CobrancaAutomaticaTab` (`AutoBillingCard`). All GAP; files under `apps/web/features/billing/components/` — Billing is a 7th context, so it needs its own web and BFF slice `billing` (CLAUDE.md §3/§11 list the slices and are updated on promotion); `features/platform` is not its home.
**Props:** `BillingPage`: `summary: BillingSummary`, `initialTab?: 'resumo'|'plano'|'cobrancas'|'dados'|'automatica'` (from `?tab=`). Tabs fetch lazily (React Query): Resumo = summary (needed for the title badge anyway), Cobranças = charges page, Dados = identity, Automática = `summary.autoBilling`.
**BFF per tab:** Resumo `GET /v1/billing/summary`, "Pagar agora" -> `POST /v1/billing/charges/:id/payment-link` -> `{ paymentUrl, expiresAt }` then `window.location = paymentUrl` (hosted page; never name the provider; no card form). Plano `GET /v1/billing/plan` + `POST /v1/billing/plan/preview` + `PUT /v1/billing/plan` (Screens 22-29). Cobranças `GET /v1/billing/charges?limit=5&offset=…`. Dados `GET`/`PUT /v1/billing/identity`. Automática `POST`/`DELETE /v1/billing/auto-billing`.
**Resumo tab (this screen):** Situação card (valor mensal, próximo vencimento, forma de pagamento, cobrança automática with a text link that switches to that tab), Cobrança em aberto card, Seu plano (READ-ONLY: features + prices + total, "Não contratados" rows, text link "Alterar plano"; the old sentence "Quer incluir mais recursos? Falar com a gente" is removed — plan changes are self-service, R11; a plain "Falar com a gente" footer link stays for pricing questions only). **Single primary button: "Pagar agora"**, rendered only when an open charge exists. On mobile the primary sits in a bottom `.form-actions` row and the low-emphasis footer links "Falar com a gente" / "Cancelar assinatura" (red text link -> manager-06) sit under it; on desktop both move into the action pane. Never two filled buttons.
**Cobranças tab:** history table (Vencimento / Referência / Valor / Situação; 2-line cards on mobile), includes REFUNDED and CHARGEBACK rows, pagination "1–5 de 8 cobranças" with Anterior/Próxima (clickable in this file: page 2 has 3 rows), footnote "Reembolsos e contestações são tratados pelo provedor de pagamento…" (US: "…by the payment provider"). No buttons other than the pager (secondary). Charge labels: PENDING "Pendente", PAID "Pago", OVERDUE "Vencida", FAILED "Falhou", CANCELED "Cancelada", REFUNDED "Reembolsada", CHARGEBACK "Chargeback"; no refund UI.
**Per-tab save:** Dados saves (Screen 11) and Plano saves (Screen 22), each to its own endpoint; switching tabs with unsaved Dados changes shows the amber dot on the tab label (same `.tab-dirty-dot` as the service editor).
**State machine (screen-level):** loading (01f) -> loaded | error (01g); status badge drives the Resumo variant: TRIALING (01b) / ACTIVE (01, 01h, 01j) / PAST_DUE (01c) / SUSPENDED+NON_PAYMENT (01d) / SUSPENDED+CANCELED (01e) / ACTIVE+cancelAt (06b); paying (01i).
**Action pane (same structure as `ServiceEditPage`):** `.detail-layout` = content column + 22rem `.detail-aside` (`position: sticky; top: 1.5rem`, shown at >= 1024px only). The aside `.card` holds: eyebrow "Assinatura" + status badge (same label as the title row: Em teste, Ativa, Em atraso, Suspensa, Cancelando), ONE full-width primary button for the CURRENT tab (label and target swap in `showTab()` via `updateAside(tab)`, like `saveTab(currentTab)`/`aside-save-btn`), tab-specific secondary buttons (Dados: "Cancelar"; Automática: red "Desativar" / "Cancelar tentativa"), a full-width secondary "Falar com a gente" in every state, a hint line, and a divider + red "Cancelar assinatura →" link to manager-06 (hidden when SUSPENDED, loading/error or already cancelling). Primary per tab: Resumo -> "Pagar agora" / "Reativar assinatura" / "Gerar novo link" by state (none in TRIAL and while reactivating: hint only); Cobranças -> none, hint "Esta aba é só leitura."; Dados -> "Salvar alterações" with the dirty-state hint; Automática -> "Ativar cobrança automática" / "Atualizar status" / "Tentar novamente". Below 1024px the aside is hidden and the in-page bottom `.form-actions` row carries the same single primary (hidden with `display:none !important` at >= 1024px, as in the service editor, together with the bottom `.foot-links`). So exactly one primary button is visible at any width. 01f keeps an aside with skeletons; 01g's aside primary is "Tentar novamente".
**Mobile:** bottom nav kept (top-level page); the former "Gerenciar" links are tabs and the actions live in the bottom row; buttons are never stretched on desktop except inside the aside card.

## Screen 2 — TRIAL, plan not confirmed (Resumo tab) — manager-01b-billing-trial.html
`ResumoTab` + `TrialNotice` (GAP). Blue alert "Faltam {n} dias do seu teste gratuito" (n = `trialEndsAt - today`), "Não pedimos cartão para testar". **The first invoice is NOT generated yet**: it is issued only after the manager explicitly confirms the first paid plan on the Plano tab ("Confirmar plano"). Amber call-out "Confirme seu plano para gerarmos a primeira cobrança (vence no fim do teste)": if the plan is not confirmed 3 days before the trial end, the system issues the invoice anyway with the default (all features) and emails clearly; confirmation reminders go out 10, 7 and 4 days before the trial end. "Sobre a primeira cobrança" states the amount, the e-mail, the due date (trial end) and the suspension rule: 24 hours after the trial end if unpaid, or up to 3 business days when the manager already returned from the payment page and the payment is pending (boleto). Primary on the tab: **"Confirmar plano"** (switches to the Plano tab; mobile bottom row + aside). Cobranças tab: "Nenhuma cobrança ainda. A primeira aparece aqui depois que você confirmar o plano." Cancel link (06d, or 06e after payment) and the red "Descartar este teste" link (`manager-10`, never-paid tenants only) are shown.
`manager-09-plan-confirm-required.html` is the same TRIAL page with 8 days left opened on the Plano tab (all features checked, amber banner "Confirme seu plano", primary "Confirmar plano", hint that unconfirmed plans are auto-confirmed with all features 3 days before the end). `manager-01h` is the state after the invoice exists (4 days left) and notes that it was issued after plan confirmation or automatically with the default plan.

## Screen 3 — PAST_DUE (Resumo tab) — manager-01c-billing-past-due.html
`ResumoTab` + `BillingStatusBanner` (GAP, also rendered on every other dashboard page while PAST_DUE — see manager-04b). Amber alert "Pagamento em atraso — faltam {n} dias para a suspensão" (n = days until `suspendsAt` = due + 14; there is never a PAST_DUE after a trial — an unpaid trial invoice suspends 24 hours after the trial end, up to 3 business days when the payment is pending after the manager returned from the payment page). Dunning e-mails go 1, 3, 7 and 12 days after the due date (the last one gives the suspension date); the screen says so, no button inside the alert. Single primary: "Pagar agora" in the "Cobrança em atraso" card. Full access in this state. Cobranças tab starts with the OVERDUE row.

## Screen 4 — SUSPENDED / NON_PAYMENT (Resumo tab) — manager-01d-billing-suspended.html
`ResumoTab` + `SuspendedGate` (GAP: dashboard layout guard redirects every route except `/billing`; STAFF see "Esta conta está suspensa. Fale com o gerente."). Sidebar and bottom-nav items rendered disabled (`aria-disabled`, no href); **Resumo, Plano (read-only), Cobranças and Dados of the five tabs stay usable and Automática is disabled** (this is the only reachable section). Card "Pague 1 mês para reativar" with single primary "Pagar agora" ("Pagar agora" pays the **one-month recovery charge** issued when the account was suspended; the stale charge was cancelled, never re-dated; no new period charges while suspended; never "pague N meses"). Cobranças and Dados work normally; Cobrança automática shows the same muted "Em breve" panel as every other state (it is not available yet). No cancel link; "Falar com a gente" always visible.

## Screen 5 — SUSPENDED / CANCELED (Resumo tab) — manager-01e-billing-suspended-canceled.html
Same gate and tab behaviour. No charge is open while canceled: the card shows the amount only as "Um mês: R$ 245,00 (cobrado ao reativar)" and the single primary is "Reativar assinatura" -> `POST /v1/billing/reactivate` -> `{ cancelAt: null, openCharge }` (the one-month recovery charge is created now) then `POST .../payment-link` for the URL -> hosted page. Shows the clean-up policy: 180 days after suspension if the tenant ever paid (90 if never), purge date from `summary.purgeAt`, e-mails 30 and 7 days before.

## Screen 6 — Loading — manager-01f-billing-loading.html
Tab bar rendered immediately; every panel shows skeleton blocks (GAP: check `apps/web/shared/components/ui/` for a skeleton before building one). No buttons while loading.

## Screen 7 — Load error — manager-01g-billing-load-error.html
`ErrorAlert` (EXISTS, dashboard variant) inside each panel (the summary failed, so status is unknown) + retry (refetch both queries). Copy: "Não foi possível carregar sua assinatura" / "Tivemos um problema ao buscar os dados. Verifique sua conexão e tente novamente. Se continuar, fale com a gente." Primary "Tentar novamente"; secondary "Falar com a gente".

## Screen 8 — No charges (Cobranças tab) — manager-01h-billing-no-charges.html
Opens on the Cobranças tab. Empty history: "Nenhuma cobrança paga ainda" / "Assim que a primeira cobrança for paga, ela aparece aqui com a situação de cada pagamento. A cobrança em aberto está na aba Resumo." (`pagination.total === 0`). No primary button on this tab; Resumo still has "Pagar agora" for the first charge.

## Screen 9 — Payment received, reactivating (Resumo tab) — manager-01i-billing-payment-pending.html
Return from the hosted page while status is still SUSPENDED: blue alert "Pagamento recebido — reativando sua conta…" with secondary "Atualizar agora"; poll `GET /v1/billing/summary` every 5 s (stop on ACTIVE then router.refresh, or after ~60 s show "Ainda processando — atualize em instantes"). Charge card badge "Processando". No primary button. Nav stays disabled until ACTIVE; tabs still work.

## Screen 10 — Payment link expired (Resumo tab) — manager-01j-billing-payment-link-expired.html
When `openCharge.paymentLinkExpiresAt < now` (`charges.payment_url_expires_at`): amber alert "O link de pagamento expirou"; the single primary becomes "Gerar novo link" (`POST /v1/billing/charges/:id/payment-link`). Open question: the backend could always generate on click, making this state only a fallback.

## Screen 11 — Dados de cobrança tab, BR (`DadosCobrancaTab` / `BillingIdentityForm`) — manager-02-billing-identity-br.html
Opens on the Dados de cobrança tab (same page as Screen 1). **File:** `BillingIdentityForm.tsx` (GAP; reuse `Input`/`Label` primitives). **BFF:** `GET /v1/billing/identity` (prefill on tab open), `PUT /v1/billing/identity` (save).
**Locale source of truth:** field labels, placeholders and validation come from `CountrySpec.address` (`packages/i18n/src/country-defaults.ts`, `AddressSpec`: postalLabel/Placeholder/Regex, stateLabel/Pattern, requireNeighborhood + neighborhoodLabel, streetLabel, numberLabel, complementLabel, cityLabel, lookupService) — not translated, picked by the tenant's country; the tax-ID field needs a NEW CountrySpec entry (label, placeholder, validator; BR = CNPJ/CPF with check digits, US = free-text "Tax ID (EIN)") which does not exist yet (GAP). Address JSON shape = shared `Address` VO (`apps/backend/src/shared/value-objects/address.ts`): `{ street, number, complement?, neighborhood?, city, state, zipCode }` (the prototype's "district"/"zip" map to `neighborhood`/`zipCode`); billing fields stay optional even though the VO requires them for a full address. BR (this screen): labels CEP, Rua (spec `streetLabel`), Número, Complemento, Bairro, Cidade, UF; CEP first with hint "Digite o CEP para preencher o endereço"; typing a valid CEP calls the existing ViaCEP hook (`useAddressLookup`, `lookupService: 'viacep'`) and autofills Rua, Bairro, Cidade, UF (shown with a green "preenchido pelo CEP" tag, still editable). Body: `{ taxIdType?: CNPJ|CPF|OTHER|null, taxId?, legalName?, billingEmail?, address?: Address }` — everything optional; empty billing e-mail falls back to manager e-mails.
| Field | Rule | Error message |
|---|---|---|
| taxId (CNPJ) | **BR: required and never blankable** (collected at signup, decision 57); 14 digits + valid check digits; US: optional free text | "CNPJ inválido. Confira os 14 dígitos." |
| taxId (CPF) | **BR: required and never blankable**; 11 digits + valid check digits; code `BILLING_IDENTITY_TAX_ID_INVALID` (an empty value is rejected the same way) | "CPF inválido. Confira os 11 dígitos." |
| billingEmail | optional; if present, valid e-mail | "Informe um e-mail válido, por exemplo nome@empresa.com.br." |
| zipCode | **required before the first paid selection** (decision 109; `BILLING_ADDRESS_REQUIRED`); `postalRegex` `^\d{5}-?\d{3}$` | "CEP inválido. Use o formato 00000-000." |
| state (UF) | optional; `statePattern` `^[A-Z]{2}$` | "UF inválida. Use 2 letras maiúsculas, por exemplo MG." |
**Actions:** desktop: action pane (primary "Salvar alterações" + secondary "Cancelar"); mobile: `.form-actions` at the bottom of the tab: secondary "Cancelar" (reverts to the loaded values) + the page's single primary **"Salvar alterações"** (saves only this tab, one endpoint). **States:** idle -> dirty (amber dot on the tab) -> submitting (button "Salvando…", disabled) -> saved (02d) / validation error (02b, 422 re-renders the whole form; network error: "Não foi possível salvar. Tente novamente.").

## Screen 12 — Dados validation error — manager-02b-billing-identity-br-erro.html
Dados tab; whole form shown; invalid CNPJ, e-mail, CEP (`30140-07`) and UF (`M1`) highlighted, no autofill (lookup failed / not triggered); red alert at the top of the tab "Corrija os 4 campos destacados para salvar" / "CNPJ, e-mail de cobrança, CEP e UF."; amber dirty dot on the tab label.

## Screen 13 — Dados, US — manager-02c-billing-identity-us.html
Same tab, `country = US`, tenant language `en`: the WHOLE page is English (title, four tabs Summary / Plan / Charges / Billing details — there is no Automatic billing tab for US since Pix Automático is BRL-only, labels, hints, buttons "Save changes" / "Cancel", action pane, badge "Active", money US$ 52.00, MM/DD/YYYY dates). Address labels are exactly the US `AddressSpec`: Street, Number, "Apt, Suite, etc." (complement), City, State (`^[A-Z]{2}$`), ZIP Code (placeholder 90210, `^\d{5}(-\d{4})?$`); no neighbourhood field and no postal lookup (`lookupService: 'none'`). Tax ID: optional free text "Tax ID (EIN)" (no CNPJ/CPF, no selector, not validated; needs the new CountrySpec tax-ID entry = GAP). Page strings come from the `en` locale JSON in `packages/i18n/locales/en` (UI copy) while address labels come from `CountrySpec.address`. The dashboard shell (sidebar, bottom nav, topbar date) would also be localized in production; the prototype only localizes the page and topbar title. Tenant "Sunrise Auto Spa" is illustrative.

## Screen 14 — Dados saved — manager-02d-billing-identity-saved.html
Inline green alert at the top of the tab "Dados de cobrança salvos" / "Atualizamos as informações. Elas valem para as próximas cobranças." No floating toast; the form stays with saved values.

## Screen 15 — Cancel confirm (`CancelSubscriptionConfirm`) — manager-06-cancel-confirm.html
**Standalone confirmation page** (not a tab), same pattern as `03b-deactivate-confirm.html`; reached only from the red text link "Cancelar assinatura" on the Resumo tab. **File:** GAP, `detail-layout` confirmation pattern. **BFF:** `POST /v1/billing/cancel` (no body) -> `200 { cancelAt }` for ACTIVE (end of the paid period), `200 { status: "SUSPENDED", cancelAt: null }` for TRIALING/PAST_DUE (immediate; see `manager-06d`), `409 BILLING_ALREADY_CANCELLING` shows the scheduled state.
Copy blocks: "Quando termina" (access until {cancelAt}), "Reembolso: Nenhum valor será reembolsado", "E os seus dados?" (180/90 days, apagados definitivamente, avisos 30 e 7 dias, reativar pagando 1 mês). Buttons: danger "Cancelar assinatura" + secondary "Voltar" (to the Resumo tab). States: idle -> submitting ("Cancelando…") -> 06b / 06c. Variants: `manager-06d` (TRIALING with nothing paid, or PAST_DUE: immediate; the sentence says the current period is unpaid, the purge text depends on whether the tenant ever paid: 180 days if it did, 90 if never) and `manager-06e` (trial with the first invoice paid: effective at trial end). `manager-06b` hard-codes "180 dias" on purpose: its tenant is a paid one (ACTIVE with a scheduled cancel); a never-paid tenant would see 90 days.

## Screen 16 — Cancel scheduled (Resumo tab) — manager-06b-cancel-scheduled.html
`ResumoTab` for ACTIVE with `cancelAt`: grey alert "Cancelada — acesso até 10/11/2026" with the single primary **"Reativar assinatura"** (`POST /v1/billing/reactivate`; while the paid period is still running it just un-schedules the cancel, no payment — returns `{ cancelAt: null, openCharge: null }`, no link needed). Situação card "Acesso até" / "Próxima cobrança: Nenhuma". Cancel link hidden; badge "Cancelando" (title row and pane). Other tabs work as usual.

## Screen 17 — Cancel error — manager-06c-cancel-error.html
Standalone confirmation page with a red alert "Não foi possível cancelar a assinatura" / "Algo deu errado do nosso lado e nada foi alterado. Tente novamente em instantes; se persistir, fale com a gente." The danger button becomes "Tentar novamente".

## Screen 18 — Cobrança automática tab, inactive (PREVIEW, "prévia – ainda não disponível") (`CobrancaAutomaticaTab` / `AutoBillingCard`) — manager-07-auto-billing-activate.html
**Not live:** every other screen shows this tab as a muted "Em breve" (tab label chip, Resumo row, panel with no button). Screens 07, 07b, 07c and 07d are the future design and carry an amber "Prévia — ainda não disponível" note.
Opens on the Cobrança automática tab. **BFF:** `POST /v1/billing/auto-billing` body `{ mode: PIX_AUTOMATICO }` -> `{ authorizationUrl }` then redirect to the hosted page. Status card "Desativada", single method card "Pix Automático" (card removed, decision 58), "O que vai acontecer" steps. Copy never names the provider; no card inputs in-app. Manual payment link remains valid. **Single primary: "Ativar cobrança automática"** in `.form-actions`. In SUSPENDED the tab shows a grey notice and the button is disabled.

## Screen 19 — Cobrança automática active — manager-07b-auto-billing-active.html
Green alert "Cobrança automática ativada" (inline, after returning from the provider) + status "Pix Automático ativo", next charge. **No primary button**; only the secondary red "Desativar" -> `DELETE /v1/billing/auto-billing` (open question: add a confirm step; drawn as a direct action). The Resumo tab of this file shows "Cobrança automática — Pix Automático ativo".

## Screen 20 — Cobrança automática pending — manager-07c-auto-billing-pending.html
`summary.autoBilling.status = PENDING_AUTHORIZATION` (`billing_accounts.auto_billing_status`): amber alert with spinner "Aguardando a confirmação da autorização", status badge "Pendente". Single primary "Atualizar status" + secondary red "Cancelar tentativa" (`DELETE`); retrying authorization = cancel the attempt, then "Ativar cobrança automática" again. Manual link keeps working.

## Screen 21 — Cobrança automática error — manager-07d-auto-billing-error.html
Red alert "Não foi possível iniciar a autorização" / "O parceiro de pagamento não respondeu. Nada foi alterado. Tente novamente; se a autorização for recusada, tente de novo." Method options kept; single primary "Tentar novamente". Covers both a 5xx on POST and a declined authorization on return.

## Screen 22 — Plano tab, ACTIVE with a staged change (`PlanoTab`) — manager-08-plan-edit.html
**Files (all GAP):** `apps/web/features/billing/components/PlanoTab.tsx` composing `FeatureToggleCard` (one per feature: name, description, monthly price for the tenant's country, switch, dependency hint, per-card note/error), `ChatbotTierPicker` (radio cards Básico R$ 39,00 / Plus R$ 79,00 inside the Chatbot card) and `PlanChangePreview` (list of changes + live total). Same tab pattern and action pane as the other tabs.
**BFF (CAND-31, `../tenant-billing_API.md`):** `GET /v1/billing/plan` on tab open -> catalog for the tenant's country (price per feature/tier, dependencies, current selection and, when present, scheduled next-period selection); `POST /v1/billing/plan/preview` body `{ items: [{ featureKey, tier }] }` on every selection change (debounced) -> changes effective at the next paid service-period start, new total, warnings; `PUT /v1/billing/plan` same body on save. The prototype computes the preview client-side; production renders the server's answer.
**Rules shown (R11, §4.7):** Every add, remove, upgrade and downgrade takes effect at the next paid service-period start—never now, never prorated. The whole proposed selection is validated as one dependency graph, so dependent features can be selected together. At least one feature is required ("O plano precisa de pelo menos um recurso."); dependencies HOTSITE <- BOOKING, CHATBOT, LEAD_FORM; BOOKING <- LOYALTY. Only five features exist (HOTSITE, BOOKING, LOYALTY, CHATBOT, LEAD_FORM); recurring reservations and availability alerts are part of BOOKING. If the next-period invoice is already issued and unpaid, it is cancelled and re-issued after the selection is saved; a paid invoice is never changed. `PAST_DUE` and `SUSPENDED` are read-only.
**Props:** `catalog: PlanCatalog`, `status`, `readOnly`; local state `selection: Record<FeatureKey, { on, tier? }>`.
**State machine:** idle (no change, "Salvar plano" disabled) -> dirty (amber dot on the tab, preview + new total, button enabled) -> previewing (`POST …/preview` in flight) -> saving ("Salvando…", `PUT`) -> saved (08d) | error (08h server, 08c validation). "Descartar alterações" returns to idle.
**Action pane:** Plano primary **"Salvar plano"** (disabled until there is a valid change) + secondary "Descartar alterações" + live "Novo total mensal" box + "Falar com a gente" + cancel link; mobile: the same two buttons in the bottom `.form-actions` row.
**This file:** chatbot -> Plus (+R$ 40,00), - Formulário de contato (-R$ 19,00); every preview line says it takes effect on the next paid period (10/11/2026); new total R$ 266,00 por mês (antes R$ 245,00; 245 - 19 + 40). Switches and tiers are interactive.
**Mobile:** cards stack, switch stays right; tier cards wrap; preview card above the bottom action row.

## Screen 23 — Plano, TRIAL review — manager-08b-plan-trial-choose.html
Opened by the "Confirmar plano" CTA of the trial banner (manager-04). Alert "Confirme seu plano para gerarmos a primeira cobrança" / "Durante o teste todos os recursos estão liberados. A primeira cobrança (vence em 04/11/2026) só é gerada depois que você confirmar o plano, e usa a seleção abaixo. Planos não confirmados são confirmados automaticamente com todos os recursos 3 dias antes do fim do teste." This selection only determines the first paid period; it never changes trial entitlements. The primary is **"Confirmar plano"** (`PUT /v1/billing/plan`), enabled even with no change because confirming the default is valid; right after it the first invoice is generated. Here Formulário de contato is unchecked (total R$ 226,00 = 245 - 19).

## Screen 24 — Plano, dependency error — manager-08c-plan-dependency-error.html
Whole form with the error (A1): removing Agendamento while Fidelidade is on -> red alert "Não foi possível salvar o plano" / "Agendamento não pode sair do plano enquanto Fidelidade estiver ativa. Remova a Fidelidade também ou mantenha o Agendamento. Nada foi salvo."; both cards highlighted ("Fidelidade depende de Agendamento, que está saindo do plano." / "Fidelidade depende dele: remova também ou mantenha este recurso."). "Salvar plano" disabled until fixed; the backend rejects the same selection with a typed error (new code in both locale files).

## Screen 25 — Plano saved — manager-08d-plan-saved.html
Inline green summary "Plano atualizado" listing each change, its next-period effective date and the new total; no toast. The current selection stays visible until that date, and the saved next-period selection is shown separately. "Salvar plano" returns to disabled.

## Screen 26 — Plano read-only, SUSPENDED — manager-08e-plan-readonly-suspended.html
SUSPENDED: grey alert "Plano em modo leitura" / "Reative a assinatura para alterar o plano."; switches and tiers disabled; no primary on this tab (the page's primary stays "Pagar agora" on Resumo); nav items disabled as in 01d. A scheduled cancellation remains editable while the paid period is still active.

## Screen 27 — Plano, PAST_DUE — manager-08f-plan-past-due-no-add.html
Amber alert "Pagamento em atraso — plano em modo leitura". Every switch and tier is disabled, no save action appears, and the only primary action remains "Pagar agora" on Resumo.

## Screen 28 — Plano, scheduled next-period selection — manager-08g-plan-not-removable-yet.html
Blue alert explains that a saved selection has not taken effect yet: "Alterações agendadas para 10/11/2026". It shows current and next-period selections side by side; the manager may replace the scheduled selection before the next-period invoice is paid. There is no `removableFrom` / first-billed lock.

## Screen 29 — Plano save error — manager-08h-plan-save-error.html
`PUT /v1/billing/plan` 5xx (A9): red alert "Não foi possível salvar o plano" / "Algo deu errado do nosso lado e nada foi alterado. Sua seleção foi mantida; tente novamente em instantes."; selection and preview kept; "Salvar plano" stays enabled. If only the provider re-issue of the open charge fails (A8) the plan IS saved and the retry happens server-side — no UI state.

## Screen 30 — Price-change notice (Resumo + Plano tabs) — manager-01k-billing-price-change-notice.html
Operator-only price changes are dated and announced (`tenant-billing_API.md` "Price-change endpoint", `feature_price_versions`, CAND-07/19); managers get an email AND see it in the product. **Component:** `PriceChangeNotice` (GAP, info alert at the top of `ResumoTab`); `FeatureLineItems` shows the current price struck/muted plus "R$ 49,00 a partir de 10/12"; `FeatureToggleCard` shows a read-only note "Novo valor a partir de 10/12: R$ 49,00 por mês" (no extra buttons). **BFF:** `GET /v1/billing/summary` gains `upcomingPriceChanges: [{ featureKey, tier, currentAmountMinor, newAmountMinor, effectiveFrom }]`; `GET /v1/billing/plan` items gain `upcoming` (same shape, per item). **Copy:** "Aviso de reajuste" / "O valor de Chatbot (plano Básico) passa de R$ 39,00 para R$ 49,00 a partir do período de serviço iniciado em 10/12/2026. Seu novo total mensal será R$ 255,00 nesse período." (new total = current R$ 245,00 + R$ 10,00). Single primary stays "Pagar agora". Not dismissible; disappears once the change takes effect. The Plano preview uses the price for the service period it is previewing, not the invoice-issue date.

## Known limitations / notes for the lead
- "Falar com a gente" links to `journeys/shared/hotsite.html` as a stand-in for Ikaro's own booking page.
- Disabled nav items in suspended screens are intentionally `href="#"` + `aria-disabled`.

---

# Dev-notes fragment B — enforcement states and changed screens

Merged by the lead into `dev-notes.md`; all copy is pt-BR, all data is invented. Common to every screen below:
`GET /v1/billing/access -> { status, operational, features: [{ key, tier }] }` (role-reduced for any role, `tenant-billing_API.md` §2) is the single input. A feature absent from `features` is locked. `status` SUSPENDED (reason NON_PAYMENT, CANCELED or PAYMENT_REVERSED) locks the tenant out identically; screens never branch on the reason except the billing page.

Open points for the lead (the top-bar label, the role-reduced access projection and the "Falar com a gente" target are canonical in "Open questions / known limitations" at the top of this file; only the points specific to these screens stay here):
- Sibling link target used for "Ver cobrança / Pagar agora / Ver minha assinatura / Cobrança": `manager-01-billing-active.html` (rename here if the billing fragment uses another file name).
- "Falar com a gente" points to a fictional URL (`https://ikaro.example/ikaro/booking`). It is shown on the manager locked screens only; omitted on staff / customer / public screens (those users are not the payer and the public page is reason-neutral).

---

## Screen 1 — Configurações, Chatbot não contratado (`SettingsForm` Chatbot section + `FeatureLockedCard`)

File: `manager-03-locked-feature.html` — Status: `SettingsForm` EXISTS (Chatbot section is a GAP in journeys 01d); `FeatureLockedCard`, `DashboardSidebar`/bottom-nav lock state = GAP.
Props: `feature: 'CHATBOT'`, `tier?: 'BASIC'|'PLUS'` (copy mentions tiers), `lockedFeatures: FeatureKey[]` on sidebar/bottom nav.
BFF: `GET /v1/billing/access`. No settings write while locked; stored `chatbot.*` settings are kept untouched.
Behaviour: locked sidebar / bottom-nav entries keep their real href and show a padlock (never hidden); the Fidelidade entry here points to screen 2. Chatbot form fields are not rendered while locked.
States: loaded-locked (this file); loading = existing skeleton of the page; load-error = existing `ErrorAlert` with retry; entitled = existing Chatbot section (journeys 01d).
Single primary: **"Contratar este recurso"** -> `manager-08-plan-edit.html` (Plano tab; self-service, R11). "Ver minha assinatura" is a secondary button; "Falar com a gente" is only a small text link ("Dúvidas sobre preço?"). Copy: "Recurso não contratado", badge "Não contratado", "Suas configurações foram mantidas.", "Você escolhe o nível ao contratar, na aba Plano da assinatura."
Mobile: padlock on the tab icon; card stacks icon above text; "Mais" sheet unchanged.

## Screen 2 — Recurso bloqueado por URL direta (`FeatureLockedPage`)

File: `manager-03b-locked-feature-direct-url.html` — Status: GAP.
Props: `feature: FeatureKey`. Rendered by the route guard of each feature route (HTTP 200 with the upsell, not 404 or redirect); API calls for the feature are rejected by the backend (403 `BILLING_FEATURE_NOT_ENTITLED`).
BFF: `GET /v1/billing/access`.
States: loaded-locked (this file); loading / load-error as for any dashboard route.
Single primary: **"Contratar este recurso"** -> `manager-08-plan-edit.html`; "Ver minha assinatura" secondary; "Falar com a gente" small text link only. Copy: "Recurso não contratado", "Seus clientes e pontos já registrados foram mantidos…", "← Voltar à Agenda".
Mobile: single column; aside note collapses (desktop aside only, per `detail-layout`).

## Screen 3 — Agenda com banner de teste (`SubscriptionBanner`)

File: `manager-04-dashboard-trial-banner.html` — Status: GAP (banner); Agenda page EXISTS.
Props: `status: 'TRIALING'`, `daysLeft: number`, `trialEndsAt: string`. Manager-only; mounted once in the dashboard shell above `<main>`; not dismissible. Sidebar gains manager-only "Assinatura".
BFF: `GET /v1/billing/access` (+ dates from the billing subscription read in the billing fragment).
States: shown while status = TRIALING; hidden for ACTIVE; load-error of the banner fails silent (no banner), never blocks the page.
Copy: "Faltam 9 dias do seu teste." / "Confirme seu plano para gerarmos a primeira cobrança, que vence no fim do teste: ela só é gerada depois da sua confirmação (ou automaticamente, com todos os recursos, 3 dias antes do fim). Sem o pagamento, a conta é suspensa 24 horas depois do fim do teste." / CTA **"Confirmar plano"** -> `manager-08b-plan-trial-choose.html` (Plano tab, CAND-31 A4). Singular "Falta 1 dia", last day "Seu teste termina hoje".
Mobile: banner wraps, button below text.

## Screen 4 — Agenda com banner de pagamento em atraso

File: `manager-04b-dashboard-past-due-banner.html` — Status: GAP (same `SubscriptionBanner`, `status: 'PAST_DUE'`, props `dueDate`, `suspendsAt`, `amount`).
Full access; nothing locked. Copy: "Pagamento em atraso." + amount and dates + "Pagar agora" (opens the provider's hosted page from the billing page; no provider name in UI). Role `alert` (amber).
After payment the banner disappears immediately; a short "pagamento recebido, reativando" state belongs to the billing page.

## Screen 5 — Editor do hotsite: módulo Chamada para teste grátis (`TrialSignupCtaConfigPanel`)

File: `manager-05-hotsite-editor-trial-cta.html` — Status: GAP. Mirrors `ChatbotConfigPanel` / hero panel (same `ModuleConfigPanelProps`).
Availability: module offered only for the platform owner tenant (slug = `PLATFORM_OWNER_TENANT_SLUG`; `ikaro` is this prototype's illustrative value). The editor asks the backend; it does not hardcode the slug.
BFF: `PATCH /v1/tenants/hotsite` (module data).
Fields and validation:

| Field | Rule | Error copy |
|---|---|---|
| `title` | required, trimmed, 1-80 chars | "Informe o título." / "O título pode ter no máximo 80 caracteres (você digitou N)." |
| `subtitle` | optional, max 200 chars (`TrialSignupCtaModuleData.subtitle`) | "A descrição pode ter no máximo 200 caracteres." |
| `ctaLabel` | required, 1-30 chars | "Informe o texto do botão." / "O texto do botão pode ter no máximo 30 caracteres." |
| `variant` | `centered` \| `left-aligned`, default `centered` | — |
| `presentation.background.surface` | `primary` \| `secondary` \| `background`, default `primary` (section-level presentation, not module data) | — |
| `enabled` | boolean, default true | — |

Button target is fixed to `/ikaro-trial` (not editable). Edits go to the draft; publishing is the existing hotsite publish flow.
States: default (this file); validation (screen 6); submitting = "Aplicar" disabled with spinner label "Aplicando…"; submission error = inline red banner "Não foi possível aplicar as alterações. Tente novamente." above the form; success = returns to the editor with the existing inline confirmation.
Mobile: fixed action bar above the bottom nav (`bottom: 3.75rem`, main `padding-bottom: 9rem`); desktop uses the aside.

## Screen 6 — Painel TRIAL_SIGNUP_CTA com erros

File: `manager-05b-hotsite-editor-trial-cta-validation.html` — Status: GAP (same component).
Whole panel shown; invalid fields only highlighted: title over 80 chars (counter `105/80`), empty button label. "Aplicar" disabled until fixed; aside shows the summary error. Server 422 re-renders the same state.

## Screen 7 — Aviso de conta suspensa (staff) (`TenantSuspendedNotice`)

File: `staff-01-suspended-notice.html` — Status: GAP. Visual base: staff login card (`app/dashboard/login/page.tsx`).
Props: `role: 'STAFF'`. Rendered by `app/dashboard/layout.tsx` for role STAFF when status = SUSPENDED (managers get the billing page instead). No nav, no data fetching; API answers 403 `BILLING_TENANT_SUSPENDED`.
BFF: `GET /v1/billing/access`.
Copy: "Conta suspensa", "Esta conta está suspensa. Fale com o gerente.", button "Sair". Reason-neutral.
States: single static state; loading = brand mark only; load-error = same card with "Não foi possível verificar sua conta. Tente novamente." and "Tentar novamente".
Mobile: card is already full-width up to 26rem.

## Screen 8 — Minha conta com empresa inativa

File: `customer-01-account-inactive-business.html` — Status: EXISTS (`my-account` booking list rows) + GAP prop `tenantActive`.
Behaviour: open bookings (PENDING, INFO_REQUESTED, APPROVED) are listed with the "Empresa inativa" badge and are not links (`aria-disabled`); history (COMPLETED, CANCELLED, REJECTED, NO_SHOW) stays linked to the detail page. "Novo agendamento" rendered disabled. The prototype-only link under the open list and the link on the disabled button exist to reach screens 9 and 10; in production they are inert.
BFF: `GET /v1/bookings` (unchanged), customer-safe active flag (see open points).
Copy: "Empresa inativa", "Esta empresa não está operando no momento. Você pode consultar seu histórico, mas não é possível abrir agendamentos em aberto nem criar novos."
States: empty history = existing empty copy; load-error = existing retry alert.
Mobile: bottom nav (Início, Agendamentos, Fidelidade); badge wraps under status.

## Screen 9 — Detalhe de agendamento em aberto bloqueado (`BookingBlockedNotice`)

File: `customer-01b-open-booking-detail-blocked.html` — Status: GAP, route EXISTS.
Backend: `GET /v1/bookings/:id` -> 403 `BILLING_TENANT_SUSPENDED` for non-terminal bookings; terminal ones still open.
Copy: "Este agendamento não pode ser aberto agora", "Esta empresa está inativa no momento, por isso os detalhes de agendamentos em aberto não estão disponíveis.", "Voltar para Agendamentos". New error code needs translation in both `errors.json` locales.
Mobile: drill-down page, bottom nav hidden.

## Screen 10 — Novo agendamento bloqueado

File: `customer-01c-new-booking-blocked.html` — Status: GAP (variant of `BookingBlockedNotice`), booking route EXISTS.
Backend: `POST /v1/bookings` -> 403 `BILLING_TENANT_SUSPENDED`.
Copy: "Esta empresa não está aceitando agendamentos no momento", "Voltar para minha conta".

## Screen 11 — Hotsite: Página não publicada (`Unavailable`)

File: `public-01-page-not-published.html` — Status: **CHANGED** (`apps/web/shells/hotsite/components/Unavailable.tsx` takes no props and renders no `HotsiteAuthBar` today; it gains the bar plus tenant name/branding from the minimal manifest, and is used for every unpublished hotsite, never only for suspended ones, so it stays reason-neutral). Copy variant "Página não publicada" is also new.
BFF: `GET /v1/public/platform/manifest/:slug` (unavailable manifest); no billing detail exposed publicly.
Copy: "Página não publicada", "Esta página não está disponível no momento. Volte em breve." Reason-neutral. Top bar keeps "Área da Equipe" and "Entrar".
Background painted with `var(--ba-background)` (hotsite full-page rule).

---

## Screen public-02 — Ikaro hotsite with trial CTA (`TrialSignupCtaModule`)

**File:** `apps/web/shells/hotsite/components/TrialSignupCtaModule.tsx` (GAP; mirrors `BookingCtaModule` in the same folder). Hero, booking CTA and `HotsiteAuthBar` EXIST.
**Props:** `{ variant?: 'centered'|'left-aligned'; title: string; subtitle?: string; ctaLabel: string }` plus the section-level `presentation.background.surface` (same as `tenant-billing_MODULE.md`) (module config, only present in the manifest of the platform owner tenant). Button links to `/ikaro-trial`.
**BFF call:** `GET /v1/public/platform/manifest/ikaro` (existing; new module type `TRIAL_SIGNUP_CTA`).
**States:** static. **Mobile:** sections stack, buttons centered, not full width on desktop.
**Restriction:** settled in `../tenant-billing_MODULE.md` §3 — layout rules reject the module on any tenant whose slug is not `PLATFORM_OWNER_TENANT_SLUG` (server-side); `ikaro` is only this prototype's illustrative slug.

## Screen public-03 / 03b / 03c / 03d — /ikaro-trial details (`IkaroTrialDetailsPage`, `PriceTable`)

**File:** `apps/web/app/ikaro-trial/page.tsx` (GAP; keep thin, logic in `shared/lib`). Table rows built from the price list; feature texts are i18n keys (both locales).
**Props:** `{ country: 'BR'|'US' }` (switch state, default from browser locale, BR if unknown).
**BFF call:**
```
GET /v1/public/billing/prices?country=BR|US   (@Public)
  Response: { countryCode, currency, taxBehavior, items: [{ featureKey, tier: 'STANDARD'|'BASIC'|'PLUS', amountMinor }] }   (canonical shape in `tenant-billing_API.md` §3)
```
**States:** loading (03c, skeleton rows) -> ok (03/03b) / error (03d).
**Decision (03d):** prices are informational, so a load failure does NOT block signup. The warning explains this and offers retry; "Começar teste grátis" stays enabled.
**Error copy:** "Não foi possível carregar os preços agora." / "Tentar novamente".
**Notes:** CHATBOT shows BASIC and PLUS prices (PLUS is a real catalog price: R$ 79,00 / US$ 19.00; the default total is R$ 245,00 / US$ 59.00 and the page lists only the five features). Dependency hints ("Requer Agendamento") come from the closed dependency map. Annual billing and coupons are out of scope. Money: `R$ 49,00` (pt-BR) / `US$ 12.00`. Mobile: table stays a single column of rows, switch above it.

## Screen public-04 / 04b / 04c — Turnstile + Google step (`SignupGoogleStep`)

**File:** `apps/web/app/ikaro-trial/entrar/page.tsx` (GAP). Google button follows the existing OAuth pattern (`/api/auth/google?redirect=...`) with a signup intent that creates no tenant.
**Props:** none. Turnstile token held in client state, sent later in the tenant creation call.
**BFF call:** `GET /v1/public/signup/session` after the OAuth callback -> `{ email, name, trialAvailable }` (`trialAvailable=false` when an earlier self-signup tenant of this Google `sub` never paid; main doc §6).
**States:** idle (Google button enabled only after Turnstile passes) -> 04b Turnstile failed (button disabled, retry link) / 04c trial not available (`trialAvailable = false`).
**Error copy:** 04b "Não foi possível verificar que você é uma pessoa." ; 04c "Você já tem um teste em andamento ou não concluído" ("conclua o pagamento do seu teste atual") + "Entrar na conta existente" + "Descartar o teste não pago e começar de novo" (explains that it erases the unpaid trial and frees the name; leads to the same confirm page as `manager-10`). No "marcar uma conversa com nossa equipe".
**Mobile:** single column, Turnstile widget 20rem max.
**Open question:** the "session" endpoint name implies a short-lived signup cookie set by the OAuth callback; confirm it is httpOnly and bound to the Google account.

## Screen public-05 / 05b-05f — Signup form (`SignupForm`)

**File:** `apps/web/features/platform/components/signup/SignupForm.tsx` (GAP). Use primitives from `apps/web/shared/components/ui/` (verify exact names); `SlugInput` with live availability is new.
**Props:** `{ googleName: string; googleEmail: string }`. The 409 `SIGNUP_TRIAL_NOT_AVAILABLE` on submit (an earlier self-signup tenant of this Google account never paid) renders the 04c-style "Você já tem um teste em andamento ou não concluído" card. (read-only, from the session).
**BFF calls:**
```
GET  /v1/public/signup/slug-availability?slug=    -> { status: 'available'|'taken'|'reserved'|'invalid', reason? }  (debounced ~400ms)
POST /v1/public/signup/tenant
  Body: { businessName, slug, countryCode: 'BR'|'US', acceptedTermsVersion, turnstileToken }  (no language: it derives from the country)
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
**States:** idle -> checking slug -> ok/taken (05b); submit -> submitting (05d) -> account-created/check-email page (06) / validation error 422 (05c, whole form, worst case: reserved slug "admin", empty name, no country, terms unchecked) / 429 (05e) / tenant-creation failure 5xx (05f).
**Error copy:** 05e "Muitas tentativas. Por segurança, aguarde alguns minutos antes de tentar de novo." ; 05f "Não conseguimos criar sua conta. Nada foi criado, então você pode tentar de novo com segurança." This applies only when the tenant-creation transaction fails. Post-commit manager/Billing setup is durable asynchronous work; its handoff is the account-created page and existing invitation/login email, not a dashboard redirect.
**Notes:** slug and country are immutable after creation (hint shown). URL preview uses `ikaro.app/{slug}` (illustrative domain). Desktop buttons are inline, not stretched. Bot Turnstile token is single-use; after a failed submit the page must re-request a token.

## Screen public-06 — Account created / check email (`SignupAccountCreatedPage`)

**File:** `apps/web/app/ikaro-trial/conta-criada/page.tsx` (GAP).
**BFF call:** none after the `POST /v1/public/signup/tenant` response. The screen must not call an authenticated billing endpoint and must not poll provisioning.
**States:** account created (this screen). It confirms the verified Google email and explains that access instructions were sent there. It offers a rate-limited **"Reenviar e-mail"** button (disabled with the hint "Disponível novamente em 60 s" after each send) and a second block **"Já confirmou? Entrar com Google"** (one-click login with the same Google account); "Falar com a gente" stays only as a footnote link. There is no dashboard button, checklist, trial-end date, or claim that the asynchronous manager/Billing setup has already completed.
**Copy:** "Sua conta foi criada" / "Enviamos as instruções de acesso para {email}. Abra o e-mail para entrar e começar seu teste de 14 dias." / "Não encontrou o e-mail? Verifique a caixa de spam ou fale com a gente."
**Mobile:** single column; primary login link not full width on desktop.

---

## Screen S1 — Staff tenant selection with a suspended tenant (`SelectStaffTenantClient`)

**File:** `staff-02-select-tenant-suspended.html` — `SelectStaffTenantClient` EXISTS (`apps/web/features/staff/components/SelectStaffTenantClient.tsx`, route `/select-staff-tenant`); the "Suspensa" badge is a GAP.
**CAND:** CAND-16

**Props:** `initialOptions: StaffTenantOption[] | null`; `StaffTenantOption` gains `operational: boolean` (`@ikaro/types`, `auth.dto.ts`).
**BFF call:** `GET /auth/staff-tenants` (existing) must include a per-tenant `operational` flag (false when status = SUSPENDED). `POST /auth/switch-staff-tenant { staffId }` stays unchanged and must not reject a suspended tenant.
**Behaviour:** the suspended tenant is always listed and selectable; when `operational === false`, render an extra amber badge "Suspensa" before the role badge. Selecting it switches the session and `/dashboard` renders the suspended notice (`staff-01-suspended-notice.html`). Only the badge: no reason, no payment info for staff.
**States:** populated (this file); load error reuses the existing `selectTenantError` / `selectTenantRetry`. No new loading/validation states.
**i18n:** new key `auth.tenantSuspendedBadge` = "Suspensa" (pt-BR), "Suspended" (en).
**Mobile:** card is `max-w-md`, badges stay on the right and wrap-free (`flex-shrink: 0`).

**Customers:** there is no customer tenant selector in the codebase (descoped, UC-021 Case B: customers sign in per tenant slug). If a customer tenant switcher (UC-023) is ever built, it must keep listing a suspended tenant with the "Empresa inativa" badge — same rule as staff.


---

# Addendum (2026-10-27 review) — states added or changed

- **Exempt account (CAND-32, R12) — `manager-01l-billing-exempt.html`.** `GET /v1/billing/summary` returns `exempt: true`; every tab shows one grey notice ("Conta isenta de cobrança"), badge "Isenta", no primary action, no cancel link, no payment or plan editing. The dashboard shows no trial/past-due banner and every feature is unlocked. Reached by Ikaro's own tenant and any operator-exempted tenant.
- **Trial end (decision 42).** Screens 01b and `manager-04` now say the account is suspended 24 hours after the trial end if the first invoice is unpaid (up to 3 business days when the payment is pending); there is no PAST_DUE after a trial. If no charge could be issued (for example a US tenant without state/ZIP), the same rule applies and the Plano/Dados tabs warn the manager beforehand.
- **Deferred start of new features (decision 54).** `manager-03` and `manager-03b` say the feature starts at the next billing period (10/11/2026). The Plano preview already shows the same date per line.
- **US totals.** Summary and Plano totals (open, not yet issued amounts) are net of tax and are labeled "+ imposto calculado na cobrança" for US tenants; issued US charges show tax lines (see Addendum 6). The US Plano panel exists in `manager-02c` and `manager-02e` (English, "Plan" tab).
- **Staff tenant switch.** The real routes are `GET /auth/staff-tenants` and `POST /auth/switch-staff-tenant`; both exist today and must keep working for a suspended tenant.
- **Signup.** The language field was removed from `public-05*`; language derives from the country. The country selector offers only "Brasil" by default with the hint "Define a moeda, o fuso padrão e o idioma"; "Estados Unidos" appears only in `public-05g`, which models `FEATURE_FLAG_SIGNUP_US` on. Error `SIGNUP_TRIAL_NOT_AVAILABLE` reuses the 04c card.
- **Error code names** are `BILLING_*`/`SIGNUP_*` per the repo convention (`BILLING_TENANT_SUSPENDED`, `BILLING_FEATURE_NOT_ENTITLED`).

- **BR tax ID at signup (decision 57).** `public-05*` now has a required "CPF ou CNPJ da empresa" field for BR (check digits validated; error `SIGNUP_TAX_ID_INVALID`/`SIGNUP_TAX_ID_REQUIRED`; screen 05c shows the invalid case). It is saved to the billing account and is editable but not blankable on the Dados tab for BR tenants.
- **US full address required before the first paid selection (decision 39, revised).** New screen `manager-02e-billing-identity-us-address-required.html`: a US trial tenant on the Dados tab sees the red alert "Add your full billing address" with street, city, state and ZIP highlighted (the number is optional); without it the first invoice cannot be issued and the trial suspends at its end (decision 42). Error code `BILLING_ADDRESS_REQUIRED` from `PUT /v1/billing/plan` (same for BR, decision 109).
- **Auto-billing is Pix Automático only (decision 58).** The card option and "Cartão final 4242" were removed from `manager-07*` and every Resumo/Automática panel; the activation tab offers only Pix Automático ("Pague o primeiro Pix e aprove a autorização no app do seu banco"). Tenants still pay any monthly charge by card, Pix or boleto on the hosted page. `POST /v1/billing/auto-billing` accepts `{ mode: 'PIX_AUTOMATICO' }` only.
- **Provider facts and launch gates** for these screens are in `../tenant-billing_PROVIDERS.md`.
- **No UI for non-production controls.** The simulate, advance-time and seed tools are internal endpoints and scripts only (`tenant-billing_API.md` §5 "Non-production endpoints"); there is no dev panel in the dashboard. The seed script creates one tenant per screen state shown in this prototype (trial, active, scheduled cancel, past due, suspended ×2, exempt, US with and without address).


---

# Addendum 2 (2026-10-27 audit round) — new and corrected screens

- **`manager-01h` is now "TRIALING with the first invoice issued"** (badge "Em teste", due = trial end 04/11, history of paid charges empty). It is the state a trial tenant is in from day 4 to day 0. `manager-01b` stays the state before the invoice exists.
- **`manager-01d` (SUSPENDED / NON_PAYMENT)** now shows the **recovery charge**: "Cobrança de reativação (um mês) · vence em 02/11/2026", says the previous open charge was cancelled and replaced, and shows the 90/180-day clean-up policy. The overdue variant (recovery due date passed) is the same screen with an "Vencida" badge and unchanged "Pagar agora" (the provider link keeps working). `PAYMENT_REVERSED` is now drawn in `manager-01m` ("Conta suspensa: o pagamento foi estornado ou contestado", recovery charge with "Pagar agora", purge date) and `OPERATOR` in `manager-01n` ("Conta suspensa pela Ikaro", reason-neutral, no charge, no pay button, only "Falar com a gente").
- **New `manager-06d-cancel-immediate`** (CAND-28 A3): cancel for TRIALING or PAST_DUE takes effect now, no refund because nothing was paid; leads to `manager-01d`.
- **New `public-05g-signup-us-selected`** (CAND-22 A7): US selected, CPF/CNPJ hidden, note that the full address is collected in the dashboard before the first charge; only reachable when `FEATURE_FLAG_SIGNUP_US` is on.
- **US screens (`manager-02c`, `02e`)**: card only (no ACH or bank debit), no Automatic billing tab or row (Pix Automático is BRL-only; four tabs: Summary, Plan, Charges, Billing details), Chatbot Plus US$ 19, "+ tax calculated when each invoice is issued" under totals, all plan changes at the next paid period. `02e` is now a consistent TRIALING summary (no open charge yet, history empty).
- **`manager-07d`** shows the real Pix Automático authorization error with the method card kept and "Tentar novamente".
- **Public price tables**: BR "impostos incluídos", US "before tax; sales tax calculated when each invoice is issued".
- **Illustrative dates:** each screen uses its own illustrative "today" and charge dates; the trial screens (01b, 01h, 04, 09) follow the confirm-plan flow (invoice issued on confirmation, or automatically 3 days before the trial end); the former fixed 10-day invoice lead no longer applies to the trial. Other screens are not meant to be read as one continuous timeline.

## Specified but not drawn (copy and rules are fixed here; story discovery draws them)

| Gap | Where specified | What the story must show |
|---|---|---|
| US dashboard banner and Plano tab warning when no billing address | CAND-08 A7, decision 42, `summary.addressRequired` | Same amber banner as the BR trial banner with "Add your billing address — without it your account is suspended on {trialEnd}", linking to the Dados tab; Plano shows the same notice and disables Save until saved |
| US Plano preview total with tax label | decision 38 | "+ tax calculated when each invoice is issued" under the total, same as 02c/02e Resumo |
| Customer cancels a future booking while suspended; loyalty read-only | CAND-16 | The existing cancel flow stays; the open rows in `customer-01` remain non-links and the detail page offers only "Cancelar agendamento"; loyalty pages hide earning/redemption |
| Pix Automático revoked at the bank | CAND-30 A3 | Amber alert on the Automática tab "A autorização foi revogada no seu banco; o link de pagamento mensal continua valendo" with "Ativar de novo" |
| Signup error for a missing/invalid tax ID | CAND-22 A9 | `public-05c` already shows the invalid case; an empty value shows `SIGNUP_TAX_ID_REQUIRED` with the same field-error pattern |
| First-run onboarding (checklist) | CAND-24 | Depends on the onboarding presets work; not a billing screen |
| Billing and purge-warning emails | CAND-19, CAND-27 | Email templates (pt-BR, en), designed with the notification templates, not as dashboard screens |
| Annual billing: US Plano tab with the Mensal/Anual toggle | Addendum 5 | Same toggle as `manager-08` in English (US$ annual 120 / 260 / 70 / 90-190 / 50, illustrative); only the US price table (`public-03b`) is drawn with the toggle |
| Annual billing: price-change notice for an annual subscription | Addendum 5 | `manager-01k` variant: new annual amounts, applied at the next annual renewal |
| Annual billing: renewal reminder e-mails and the annual invoice e-mail | Addendum 5 | Templates (pt-BR, en): invoice issued 30 days before the period start, plus reminders; designed with the notification templates |
| Annual billing: Plano tab of an active annual subscription, cancel-scheduled screen with annual dates, Cobranças tab with add-on charges, PAST_DUE annual Resumo | Addendum 5 | Not drawn; `manager-11` shows Resumo only and `manager-13` confirms into the monthly `manager-06b` |

---

# Addendum 3 (2026-10-27 second review) — changes applied to the HTML screens

The HTML screens were redrawn in the 2026-10-27 follow-up (script-assisted, then reviewed). Where a screen and the docs still differ, **the docs win**.

- **Features merged (decision 80) — applied.** The Recorrência and Alertas de disponibilidade rows/cards and their plan-state entries were removed from every billing screen and from the public price tables (BR and US). BOOKING is **R$ 109,00 / US$ 26.00** and its description says it includes recurring reservations and availability alerts. The example selection total is now **R$ 245,00** (US: **US$ 59.00**); the price-change example is R$ 255,00; the staged-plan example (Chatbot Plus, without Formulário de contato) is R$ 266,00.
- **Remove-BOOKING block (decision 81) — new screen** `manager-08i-plan-booking-in-use.html` (`BILLING_FEATURE_IN_USE`).
- **Trial with a paid first invoice (decision 89) — new screen** `manager-06e-cancel-trial-paid.html` (cancel scheduled at trial end, nothing lost). `manager-06d` stays the immediate-cancel case for a trial with nothing paid or a `PAST_DUE` account.
- **BR billing address (decision 109) — new screen** `manager-02f-billing-identity-br-address-required.html`; the BR Dados tab text now says CPF/CNPJ and the full address are required before the first charge. Error `BILLING_ADDRESS_REQUIRED`, summary field `addressRequired`.
- **Still to draw in story discovery:** receipts ("Recibo" link on paid Cobranças rows, decision 111); the dunning, plan-confirmation-reminder (10, 7, 4 days before the trial end) and purge-warning e-mails (templates, not screens; the dunning cadence 1, 3, 7 and 12 days after the due date is already stated in `manager-01c`); the "recovery charge has no period dates" detail on `manager-01d`; the hours-level states of the suspension freeze, including the "payment pending, up to 3 business days" wait after trial end (no tenant-facing screen needed beyond 01i). Drawn since the last review: the confirm-plan step (09), the never-paid discard (10), PAYMENT_REVERSED (01m), OPERATOR (01n), failed payment return (01o), the trial-cancel variants (06d, 06e) and the US Plano panel (02c, 02e).
- **No operator-facing screens.** Operator work is the mapped list in `../tenant-billing_OPERATIONS.md` §4; there is still no backoffice UI.

---

# Addendum 4 (2026-10-28 audit) — trial confirmation flow, discard, preview of auto-billing

Decisions applied to the HTML screens. Where a screen and the docs one level up differ, the docs win.

- **Five features only** (HOTSITE, BOOKING, LOYALTY, CHATBOT, LEAD_FORM). BR R$ 49 / 109 / 29 / 39 (Basic) / 79 (Plus) / 19, default total R$ 245; US 12 / 26 / 7 / 9 (19 Plus) / 5. `/ikaro-trial` says "Todos os 5 recursos".
- **Trial billing flow.** 14-day trial; the first invoice is issued **only after the manager confirms the first paid plan** on the Plano tab ("Confirmar plano"). If it is not confirmed 3 days before the trial end, the system issues it anyway with the default (all features) and emails clearly. Reminders about confirming the plan: 10, 7 and 4 days before the trial end. The invoice is due at the trial end. After the trial end the system waits 24 hours before suspending, or up to 3 business days when the manager already returned from the payment page and the payment is pending (boleto). Screens: `manager-01b` (not confirmed, 9 days), `manager-09` (not confirmed, 8 days, on the Plano tab), `manager-04` (banner CTA "Confirmar plano"), `manager-08b` (Plano tab with primary "Confirmar plano"), `manager-01h` (invoice exists, 4 days left; note that it was issued after confirmation or automatically with the default plan).
- **Discard a never-paid tenant** (`manager-10-discard-trial-confirm`): TRIALING, or SUSPENDED/NON_PAYMENT that never paid. Confirm page lists what is erased, states it is immediate and irreversible, requires typing the slug, and says the name and the trial become available again (`POST /v1/billing/discard { confirmSlug }`). Entry points: red "Descartar este teste" link on 01b, 01h, 08b, 09 and 01d, and the 04c signup card ("Descartar o teste não pago e começar de novo").
- **New suspended and payment states.** `manager-01m` SUSPENDED / PAYMENT_REVERSED (explains the reversal, recovery charge with "Pagar agora", purge date 180 days after suspension because the tenant paid before); `manager-01n` SUSPENDED / OPERATOR (reason-neutral "Conta suspensa pela Ikaro", no charge, no pay button, only "Falar com a gente"); `manager-01o` payment-page return with a failure ("Não conseguimos confirmar o pagamento", open charge kept, "Tentar pagar novamente").
- **Auto-billing is "Em breve".** Tab label chip, muted Resumo row and a muted panel without buttons on every state; `manager-07*` are labelled "prévia – ainda não disponível" and stay as the future design.
- **Neutral refund wording.** Refunds and disputes are handled in the payment provider console by the operator only as exceptions; copy says "pelo provedor de pagamento" / "by the payment provider".
- **Signup details.** `public-06` has a rate-limited "Reenviar e-mail" (60 s) and "Já confirmou? Entrar com Google"; `public-04c` offers "Entrar na conta existente" or discarding the unpaid trial; `public-05*` offers only "Brasil" (US only in `public-05g`, flag on) with the hint "Define a moeda, o fuso padrão e o idioma"; `public-03b` is in Portuguese before the country is picked and says so.
- **`manager-06b`** keeps the hard-coded "180 dias" because its tenant is a paid one (ACTIVE with a scheduled cancel); a never-paid tenant would see 90 days.
- **Cleanup details.** `manager-01c` states the dunning cadence (1, 3, 7 and 12 days after the due date); `manager-01e` shows the reactivation amount only as "Um mês: R$ 245,00 (cobrado ao reativar)" with "Reativar assinatura" as the primary; `manager-01l` (exempt) no longer carries trial hint text in its pane script; `manager-06d` wording is accurate for both TRIALING and PAST_DUE; `manager-02e` no longer requires the US number (street, city, state and ZIP).

---

# Addendum 5 — annual billing (slice H, post-launch design)

New screens: `manager-11-billing-active-annual`, `manager-12-addon-midyear-confirm`, `manager-13-cancel-annual-confirm`, `manager-01q-billing-suspended-annual-recovery`. Changed: the Mensal | Anual toggle on `manager-08`, `manager-08b`, `manager-09` (Plano tab) and `public-03` / `public-03b` (price tables). Where a screen and the docs one level up differ, the docs win.

**All amounts below are illustrative (valores ilustrativos); the UI does not label them as such.**

## Illustrative prices

| Feature | BR monthly | BR annual (10x monthly, 2 months free) | US annual (illustrative) |
|---|---|---|---|
| HOTSITE | R$ 49 | R$ 490 | US$ 120 |
| BOOKING | R$ 109 | R$ 1.090 | US$ 260 |
| LOYALTY | R$ 29 | R$ 290 | US$ 70 |
| CHATBOT Basic / Plus | R$ 39 / 79 | R$ 390 / 790 | US$ 90 / 190 |
| LEAD_FORM | R$ 19 | R$ 190 | US$ 50 |
| Full BR set | R$ 245,00/mês | R$ 2.450,00/ano | |

## Decided rules

- The billing cycle (monthly or annual) is a property of the **whole subscription**, never per feature. Every feature has a monthly and an annual list price; the customer sees everything quoted in the selected cycle.
- Switching cycle is a plan change: it applies at the **next paid period start** (like other plan changes) and the screen shows the date ("A troca de ciclo vale a partir de dd/mm"). In a trial the chosen cycle applies to the first invoice.
- Annual invoice is issued **30 days before** the period start (monthly: 10 days).
- The refund footnote reuses the existing wording ("... tratados pelo provedor de pagamento ...").

## Proposed, confirm in story discovery

1. **Co-terminus add-on (confirmed by the owner, 2026-10-28).** On an annual subscription a feature may be added mid-year: paid now for the remaining whole months x the feature's monthly price, never more than its annual price; starts at payment; joins the annual selection at renewal. Removing a feature takes effect at renewal, no refund.
2. **One-month recovery for annual (proposed, confirm in story discovery).** A suspended (NON_PAYMENT) annual tenant pays ONE MONTH at the monthly price (R$ 245,00 for the full BR set) and the subscription returns to monthly; the manager can choose annual again at the next renewal.
3. **Cancel on annual without refund (proposed, confirm in story discovery).** Access until the end of the paid year; nothing is refunded, including the remaining months.

## What each screen shows

- **Plano tab toggle (`manager-08`, `08b`, `09`).** Segmented control "Mensal | Anual (2 meses grátis)" above the feature cards, default Mensal, with a note that the cycle applies to the whole subscription. In Anual each card shows the annual amount with "/ano" and "equivale a R$ X/mês", the chatbot tier options show annual amounts, and the preview and aside totals become "Novo total anual" (R$ 2.450,00 por ano for the full set, "equivale a R$ 204,17/mês"). Paid subscription (`manager-08`): "A troca de ciclo vale a partir de 10/11/2026". Trial (`08b`, `09`): the cycle applies to the first invoice on 04/11/2026. Implemented as a small script that swaps the prices read by `planRefresh()`; the toggle is not part of the "unsaved changes" state.
- **Price tables (`public-03`, `public-03b`).** Same toggle; the header becomes "Preço anual", amounts switch to "/ano" with "equivale a .../mês" (the US page keeps its existing Portuguese UI copy).
- **`manager-11` (Resumo, ACTIVE annual, BR).** "Plano anual" badge; period 20/10/2026 to 20/10/2027; next charge 20/10/2027, issued 30 days before (20/09/2027); features at annual prices; history with one paid annual charge; the note "Para adicionar um recurso durante o ano, você paga só os meses restantes"; links to `manager-12` and `manager-13`. **Deviation:** the drawn plan has four features (R$ 2.260,00/ano) with LEAD_FORM as the "Não contratado" add-on so `manager-12` is coherent; the full five-feature set, R$ 2.450,00/ano, is the renewal total after the add-on. Only Resumo is drawn (no tab strip).
- **`manager-12` (add-on mid-year).** Date 20/05/2027, 5 months left: "R$ 95,00 agora (5 meses x R$ 19,00)", capped at R$ 190,00, starts today, joins the annual plan at renewal on 20/10/2027 (total R$ 2.260,00 to R$ 2.450,00); primary "Pagar e ativar agora" leads to the hosted-payment screen `manager-01i`.
- **`manager-13` (cancel annual).** Access until 20/10/2027, nothing refunded, schedule (today, until 20/10/2027, suspension, data erased on 17/04/2028 = 180 days later, with 30 and 7 day warnings). The confirm button goes to the monthly `manager-06b` result screen (annual variant not drawn).
- **`manager-01q` (suspended, annual tenant).** Today 03/11/2027; the unpaid annual charge of 20/10/2027 was cancelled and replaced by a one-month recovery charge of R$ 245,00; "Sua assinatura volta ao ciclo mensal; você poderá escolher o anual de novo na próxima renovação".

## Addendum 6 — US tax lines on charges

- **What changed (`manager-02c`, US/English only).** Every issued US charge now shows Subtotal, tax as separate lines per jurisdiction, and Total. In Charge history each row's amount column is the total, and a "Tax details" disclosure under the reference expands to the three-part breakdown. The Open charge card on the Summary tab shows the big amount as the total (US$ 62.69), then Subtotal, tax line and Total, and the "Pay now" button carries the total.
- **Illustrative numbers (Texas address).** Subtotal US$ 59.00; "Texas state sales tax (6.25%)" US$ 3.69; total US$ 62.69. One history row (March 2026) shows the zero-tax variant: "Tax: US$ 0.00 (none applicable)", total US$ 59.00 (no registration at that time).
- **Unchanged.** Open amounts on the Summary ("Monthly amount") and Plan tabs stay net with "+ tax calculated when each invoice is issued". `manager-02e` (not issued yet) is untouched. BR screens are unchanged: prices are tax-inclusive, no tax lines.
- **Source of the real lines.** The real tax lines come from Stripe Tax, computed from the tenant's billing address when the invoice is finalized, and exist only in slice E. The numbers above are invented for the prototype.
