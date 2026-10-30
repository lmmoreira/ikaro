# Dev Notes — MANAGER: Assinatura (Billing, Plan & Payment)

**Status:** Draft, illustrative. **Moved as-is** from `docs/discovery/tenant-billing/prototype/dev-notes.md` (manager-facing parts only) when the prototype was promoted to `journeys/manager/prototypes/billing/`. **Only the `journeys/README.md` template's File map table was missing; it is added below** (derived from `plan/M25-TENANT-BILLING-FOUNDATION.md` S29/S31 and `plan/M26-TENANT-BILLING-COLLECTION-LAUNCH.md` S27–S34). Props, BFF calls, validation and states already exist per screen. The canonical API contract is `docs/API_CONTRACTS.md` § Billing — Manager API; where a note below differs from the docs, the docs win. File names here are the new ones (the `manager-` prefix was dropped); `manager-05*` moved to `manager/prototypes/hotsite/` (`01g`, `01h`) and the discard screen is `10-discard-trial-confirm.html` in this folder. Sections about the staff, customer, public and signup screens moved with their journeys (`staff/prototypes/login`, `customer/prototypes/minha-conta`, `guest/prototypes/unpublished-hotsite`, `guest/prototypes/ikaro-trial`).

## Overview

49 screens: `03`, `03b` and `10` plus 46 of the manager billing page (one "Assinatura" page with five tabs — Resumo, Plano, Cobranças, Dados de cobrança, Cobrança automática (shown as "Em breve") — one primary action per tab, like the service editor; cancel is a separate confirmation page), the two dashboard banners and the annual-billing screens (slice H).

## File map (apps/web)

All paths are new files under `apps/web` unless the Action says modify; each component also ships its `.spec.tsx` (hooks and model files a `.spec.ts`). Story ids are the M25/M26 story that creates the file.

| apps/web path | Status | Action (story) |
|---|---|---|
| `app/dashboard/billing/page.tsx`, `loading.tsx`, `error.tsx` | GAP | Create, thin routes (M26-S27) |
| `app/dashboard/billing/cancel/page.tsx` | GAP | Create, thin (M26-S31) |
| `app/dashboard/suspended/page.tsx` | GAP | Create, suspended notice: manager variant (M25-S29) and staff variant (M25-S31) |
| `features/billing/api/billing.server.ts`, `billing.ts` | GAP | Create (M26-S27); modify in S28, S29, S30, S31 |
| `features/billing/components/BillingPage.tsx`, `BillingTabs.tsx`, `BillingSummaryTab.tsx`, `BillingChargesTab.tsx`, `BillingStatusBadge.tsx`, `AutoBillingComingSoon.tsx`, `ExemptNotice.tsx` | GAP | Create (M26-S27); `BillingSummaryTab.tsx` modified in S28 |
| `features/billing/components/PayNowButton.tsx`, `PaymentPendingBanner.tsx`, `PaymentLinkExpiredNotice.tsx`, `PaymentFailedNotice.tsx` | GAP | Create (M26-S28) |
| `features/billing/components/BillingIdentityTab.tsx`, `BillingIdentityForm.tsx`, `AddressRequiredNotice.tsx` | GAP | Create (M26-S29) |
| `features/billing/components/BillingPlanTab.tsx`, `PlanFeatureRow.tsx`, `PlanTierSelect.tsx`, `PlanTotalBar.tsx`, `PlanChangePreview.tsx`, `PlanRemovalBlockedNotice.tsx`, `ConfirmPlanPrompt.tsx` | GAP | Create (M26-S30) |
| `features/billing/components/CancelSubscriptionPage.tsx`, `CancelOutcome.tsx`, `ReactivateAction.tsx` | GAP | Create (M26-S31) |
| `features/billing/components/SubscriptionBanner.tsx`, `SubscriptionBannerProvider.tsx` | GAP | Create (M26-S32); mount point chosen at story discovery |
| `features/billing/components/FeatureGate.tsx`, `LockedFeaturePage.tsx` | GAP | Create (M25-S29) |
| `features/billing/components/StaffSuspendedNotice.tsx` | GAP | Create (M25-S31) |
| `features/billing/hooks/useBillingSummary.ts`, `useBillingCharges.ts` | GAP | Create (M26-S27) |
| `features/billing/hooks/usePayCharge.ts`, `usePaymentConfirmationPolling.ts` | GAP | Create (M26-S28) |
| `features/billing/hooks/useBillingIdentity.ts`, `useUpdateBillingIdentity.ts` | GAP | Create (M26-S29) |
| `features/billing/hooks/useBillingPlan.ts`, `usePlanPreview.ts`, `useSavePlan.ts`, `useConfirmPlan.ts` | GAP | Create (M26-S30) |
| `features/billing/hooks/useCancelSubscription.ts`, `useReactivateSubscription.ts` | GAP | Create (M26-S31) |
| `features/billing/model/billing-view-model.ts` | GAP | Create, pure mapping summary to view state (M26-S27) |
| `features/billing/model/identity-form.ts` | GAP | Create, Zod schema and country field mapping (M26-S29) |
| `features/billing/model/plan-selection.ts` | GAP | Create, pure selection and dependency hints (M26-S30) |
| `features/billing/model/banner-state.ts` | GAP | Create, pure status to banner variant (M26-S32) |
| `shared/lib/billing/feature-registry.ts`, `access.server.ts` | GAP | Create (M25-S29); registry modified in M26-S27, S32 |
| `shells/dashboard/components/Sidebar.tsx`, `BottomNav.tsx`, `MoreSheet.tsx` | EXISTS | Modify: manager-only "Assinatura" entry (M26-S27); locked-item rendering (M25-S29) |
| `app/dashboard/layout.tsx` | EXISTS | Modify: load the access answer once, redirect a suspended manager (M25-S29; `proxy.ts` is untouched, the JWT carries no tenant status); the manager's target becomes the billing page (M26-S32) |
| `e2e/billing-money-loop.spec.ts`, `e2e/billing-suspended-experience.spec.ts`, `e2e/helpers/billing/` | GAP | Create (M26-S35) |

Screens `03`/`03b` map to `FeatureGate` / `LockedFeaturePage`; the public signup files (`features/billing/components/public/*`) belong to `guest/prototypes/ikaro-trial`.

**Numbering:** the "Screen N" headings, "Banner screen N", "Addendum N" and "Locked feature" sections below each restart their own numbering (they come from separate documents). The file name in each heading (`01d`, `06d`, ...) is the stable key; "Screen 1–30" are the Resumo/Dados/Cancel/Plano screens, "Banner screen 3/4" are `04`/`04b`, and "Locked features" are `03`/`03b`.

## What is real vs invented

- **Real:** `--ba-*` tokens (`journeys/shared/tokens.css`), the dashboard shell, `ErrorAlert`, status badge and detail-layout patterns.
- **Invented:** tenants "Lavacar BeloAuto" and "Sunrise Auto Spa"; the example selection and dates (BR catalog: HOTSITE R$ 49, BOOKING R$ 109 (includes recurring reservations and availability alerts), LOYALTY R$ 29, CHATBOT BASIC R$ 39 / PLUS R$ 79, LEAD_FORM R$ 19; default total R$ 245. US: HOTSITE US$ 12, BOOKING US$ 26, LOYALTY US$ 7, CHATBOT US$ 9 / 19, LEAD_FORM US$ 5; total US$ 59).
- **New nav item, not in today's IA:** "Assinatura" under "Somente Gerente" (also in the mobile "Mais" sheet).

## Suspension routing (what the manager screens assume)

A manager of a `SUSPENDED` tenant can reach only `/dashboard/billing` (+ the cancel confirmation page); every other dashboard route redirects there and the other nav items are rendered disabled (`aria-disabled`, intentionally `href="#"`). Screens: 01d, 01e, 01m, 01n. The staff, customer and public suspended screens are in `staff/prototypes/login`, `customer/prototypes/minha-conta` and `guest/prototypes/unpublished-hotsite`.

## Open questions / known limitations (manager screens)

- **"Falar com a gente"** is drawn only on manager screens (upsell, suspended, errors). Target is a stand-in (`journeys/shared/hotsite.html`) for Ikaro's own booking page; the real link is Ikaro's tenant booking URL.
- **Trial cancel** has two variants: immediate with nothing paid or `PAST_DUE` (`06d`, UC-133 A3) and, when the first invoice is already paid, effective at trial end (`06e`). A never-paid tenant can also self-service **discard** the test (`10-discard-trial-confirm.html`, UC-141, slice G): it erases the tenant and frees the slug and trial eligibility.
- **Automatic charging screens (`07*`) are a preview, "prévia – ainda não disponível".** Card/Pix Automático auto-billing is a later optional slice. Everywhere else the tab and the Resumo row are drawn as a muted "Em breve" with no active "Ativar" link or button. Do not expose the 07* routes until the real Asaas account and sandbox authorization flow have passed end-to-end verification.
- **Reactivating a scheduled cancel** needs no payment while the paid period is still running; UC-134 locks that contract. Reactivating from `SUSPENDED` issues a recovery charge (the old charge is cancelled, not re-dated).
- **Skeleton primitive:** check `apps/web/shared/components/ui/` before building a loading skeleton.
- **Status name:** screens say "Em teste" for `TRIALING`.
- **Provider name** is never shown in any screen ("Pagar agora" opens a hosted page). Refunds and disputes are handled in the payment provider console by the operator, only as exceptions; tenant-facing copy says "pelo provedor de pagamento" / "by the payment provider", never "nossa equipe".

---

# Manager billing, identity, cancel, auto-billing (screens 01*, 02*, 06*, 07*; UC-117, UC-118, UC-119, UC-130, UC-133, UC-134, UC-135)

Shared by all screens below: dashboard shell (EXISTS: dashboard layout/sidebar/bottom-nav), new nav item **"Assinatura"** under "Somente Gerente" (GAP; also in the mobile "Mais" sheet). Billing is visible to every MANAGER. Money `R$ 245,00` = BR list prices for HOTSITE 49 + BOOKING 109 + LOYALTY 29 + CHATBOT(BASIC) 39 + LEAD_FORM 19. Badge reuses `.status-badge` (EXISTS) with local colors for REFUNDED/CHARGEBACK. Success is inline (no toast).

BFF shapes: the canonical request/response contracts are in `docs/API_CONTRACTS.md` § Billing — Manager API (`status` is `TRIALING|ACTIVE|PAST_DUE|SUSPENDED`, `suspensionReason`, money as `*Minor` integers, `GET /v1/billing/charges` uses limit/offset Pattern A pagination). Field names in the per-screen sections below are illustrative where they differ.
Charge status labels: PENDING "Pendente", PAID "Pago", OVERDUE "Vencida", FAILED "Falhou", CANCELED "Cancelada", REFUNDED "Reembolsada", CHARGEBACK "Chargeback". No refund UI (handled by the provider console).

## Screen 1 — Assinatura page, tabbed (`BillingPage` + `BillingTabs`) — 01-billing-active.html (Resumo tab, ACTIVE)
**Pattern (owner feedback, 2026-10-26):** one page "Assinatura" with 5 tabs **Resumo | Plano | Cobranças | Dados de cobrança | Cobrança automática**, built exactly like the service editor (`servicos/03-service-edit.html`): `.editor-tabs`/`.editor-tab`/`.editor-panel` + `showTab()` (EXISTS: reuse the tab component/pattern of `ServiceEditPage` and the hotsite editor; the billing content is GAP). Exactly ONE primary button per tab; destructive action = separate confirmation page (`06-cancel-confirm.html`, like `03b-deactivate-confirm.html`). The former standalone screens (identity form, auto-billing) are now tabs; the files 02*/07* are the same page with that tab pre-selected. Mobile: short tab labels at <=480px ("Resumo", "Plano", "Cobranças", "Dados", "Automática"), tab bar scrolls horizontally if needed.
**Component tree:** `BillingPage` (route `app/dashboard/billing/page.tsx` (the real tree is `app/dashboard/...`), thin; title row = "Assinatura" + status badge) -> `BillingTabs` -> `ResumoTab` (`SubscriptionSummaryCard`, `OpenChargeCard`, read-only `FeatureLineItems` with the text link "Alterar plano" that switches to the Plano tab, footer links) | `PlanoTab` (`FeatureToggleCard` x5, `ChatbotTierPicker`, `PlanChangePreview`; Screens 22-29) | `CobrancasTab` (`ChargeHistoryTable`) | `DadosCobrancaTab` (`BillingIdentityForm`) | `CobrancaAutomaticaTab` (`AutoBillingCard`). All GAP; files under `apps/web/features/billing/components/` — Billing is a 7th context, so it needs its own web and BFF slice `billing` (CLAUDE.md §3/§11 list the slices and are updated on promotion); `features/platform` is not its home.
**Props:** `BillingPage`: `summary: BillingSummary`, `initialTab?: 'resumo'|'plano'|'cobrancas'|'dados'|'automatica'` (from `?tab=`). Tabs fetch lazily (React Query): Resumo = summary (needed for the title badge anyway), Cobranças = charges page, Dados = identity, Automática = `summary.autoBilling`.
**BFF per tab:** Resumo `GET /v1/billing/summary`, "Pagar agora" -> `POST /v1/billing/charges/:id/payment-link` -> `{ paymentUrl, expiresAt }` then `window.location = paymentUrl` (hosted page; never name the provider; no card form). Plano `GET /v1/billing/plan` + `POST /v1/billing/plan/preview` + `PUT /v1/billing/plan` (Screens 22-29). Cobranças `GET /v1/billing/charges?limit=5&offset=…`. Dados `GET`/`PUT /v1/billing/identity`. Automática `POST`/`DELETE /v1/billing/auto-billing`.
**Resumo tab (this screen):** Situação card (valor mensal, próximo vencimento, forma de pagamento, cobrança automática with a text link that switches to that tab), Cobrança em aberto card, Seu plano (READ-ONLY: features + prices + total, "Não contratados" rows, text link "Alterar plano"; the old sentence "Quer incluir mais recursos? Falar com a gente" is removed — plan changes are self-service, UC-136; a plain "Falar com a gente" footer link stays for pricing questions only). **Single primary button: "Pagar agora"**, rendered only when an open charge exists. On mobile the primary sits in a bottom `.form-actions` row and the low-emphasis footer links "Falar com a gente" / "Cancelar assinatura" (red text link -> 06) sit under it; on desktop both move into the action pane. Never two filled buttons.
**Cobranças tab:** history table (Vencimento / Referência / Valor / Situação; 2-line cards on mobile), includes REFUNDED and CHARGEBACK rows, pagination "1–5 de 8 cobranças" with Anterior/Próxima (clickable in this file: page 2 has 3 rows), footnote "Reembolsos e contestações são tratados pelo provedor de pagamento…" (US: "…by the payment provider"). No buttons other than the pager (secondary). Charge labels: PENDING "Pendente", PAID "Pago", OVERDUE "Vencida", FAILED "Falhou", CANCELED "Cancelada", REFUNDED "Reembolsada", CHARGEBACK "Chargeback"; no refund UI.
**Per-tab save:** Dados saves (Screen 11) and Plano saves (Screen 22), each to its own endpoint; switching tabs with unsaved Dados changes shows the amber dot on the tab label (same `.tab-dirty-dot` as the service editor).
**State machine (screen-level):** loading (01f) -> loaded | error (01g); status badge drives the Resumo variant: TRIALING (01b) / ACTIVE (01, 01h, 01j) / PAST_DUE (01c) / SUSPENDED+NON_PAYMENT (01d) / SUSPENDED+CANCELED (01e) / ACTIVE+cancelAt (06b); paying (01i).
**Action pane (same structure as `ServiceEditPage`):** `.detail-layout` = content column + 22rem `.detail-aside` (`position: sticky; top: 1.5rem`, shown at >= 1024px only). The aside `.card` holds: eyebrow "Assinatura" + status badge (same label as the title row: Em teste, Ativa, Em atraso, Suspensa, Cancelando), ONE full-width primary button for the CURRENT tab (label and target swap in `showTab()` via `updateAside(tab)`, like `saveTab(currentTab)`/`aside-save-btn`), tab-specific secondary buttons (Dados: "Cancelar"; Automática: red "Desativar" / "Cancelar tentativa"), a full-width secondary "Falar com a gente" in every state, a hint line, and a divider + red "Cancelar assinatura →" link to 06 (hidden when SUSPENDED, loading/error or already cancelling). Primary per tab: Resumo -> "Pagar agora" / "Reativar assinatura" / "Gerar novo link" by state (none in TRIAL and while reactivating: hint only); Cobranças -> none, hint "Esta aba é só leitura."; Dados -> "Salvar alterações" with the dirty-state hint; Automática -> "Ativar cobrança automática" / "Atualizar status" / "Tentar novamente". Below 1024px the aside is hidden and the in-page bottom `.form-actions` row carries the same single primary (hidden with `display:none !important` at >= 1024px, as in the service editor, together with the bottom `.foot-links`). So exactly one primary button is visible at any width. 01f keeps an aside with skeletons; 01g's aside primary is "Tentar novamente".
**Mobile:** bottom nav kept (top-level page); the former "Gerenciar" links are tabs and the actions live in the bottom row; buttons are never stretched on desktop except inside the aside card.

## Screen 2 — TRIAL, plan not confirmed (Resumo tab) — 01b-billing-trial.html
`ResumoTab` + `TrialNotice` (GAP). Blue alert "Faltam {n} dias do seu teste gratuito" (n = `trialEndsAt - today`), "Não pedimos cartão para testar". **The first invoice is NOT generated yet**: it is issued only after the manager explicitly confirms the first paid plan on the Plano tab ("Confirmar plano"). Amber call-out "Confirme seu plano para gerarmos a primeira cobrança (vence no fim do teste)": if the plan is not confirmed 3 days before the trial end, the system issues the invoice anyway with the default (all features) and emails clearly; confirmation reminders go out 10, 7 and 4 days before the trial end. "Sobre a primeira cobrança" states the amount, the e-mail, the due date (trial end) and the suspension rule: 24 hours after the trial end if unpaid, or up to 3 business days when the manager already returned from the payment page and the payment is pending (boleto). Primary on the tab: **"Confirmar plano"** (switches to the Plano tab; mobile bottom row + aside). Cobranças tab: "Nenhuma cobrança ainda. A primeira aparece aqui depois que você confirmar o plano." Cancel link (06d, or 06e after payment) and the red "Descartar este teste" link (`manager-10`, never-paid tenants only) are shown.
`09-plan-confirm-required.html` is the same TRIAL page with 8 days left opened on the Plano tab (all features checked, amber banner "Confirme seu plano", primary "Confirmar plano", hint that unconfirmed plans are auto-confirmed with all features 3 days before the end). `01h` is the state after the invoice exists (4 days left) and notes that it was issued after plan confirmation or automatically with the default plan.

## Screen 3 — PAST_DUE (Resumo tab) — 01c-billing-past-due.html
`ResumoTab` + `BillingStatusBanner` (GAP, also rendered on every other dashboard page while PAST_DUE — see 04b). Amber alert "Pagamento em atraso — faltam {n} dias para a suspensão" (n = days until `suspendsAt` = due + 14; there is never a PAST_DUE after a trial — an unpaid trial invoice suspends 24 hours after the trial end, up to 3 business days when the payment is pending after the manager returned from the payment page). Dunning e-mails go 1, 3, 7 and 12 days after the due date (the last one gives the suspension date); the screen says so, no button inside the alert. Single primary: "Pagar agora" in the "Cobrança em atraso" card. Full access in this state. Cobranças tab starts with the OVERDUE row.

## Screen 4 — SUSPENDED / NON_PAYMENT (Resumo tab) — 01d-billing-suspended.html
`ResumoTab` + `SuspendedGate` (GAP: dashboard layout guard redirects every route except `/billing`; STAFF see "Esta conta está suspensa. Fale com o gerente."). Sidebar and bottom-nav items rendered disabled (`aria-disabled`, no href); **Resumo, Plano (read-only), Cobranças and Dados of the five tabs stay usable and Automática is disabled** (this is the only reachable section). Card "Pague 1 mês para reativar" with single primary "Pagar agora" ("Pagar agora" pays the **one-month recovery charge** issued when the account was suspended; the stale charge was cancelled, never re-dated; no new period charges while suspended; never "pague N meses"). Cobranças and Dados work normally; Cobrança automática shows the same muted "Em breve" panel as every other state (it is not available yet). No cancel link; "Falar com a gente" always visible.

## Screen 5 — SUSPENDED / CANCELED (Resumo tab) — 01e-billing-suspended-canceled.html
Same gate and tab behaviour. No charge is open while canceled: the card shows the amount only as "Um mês: R$ 245,00 (cobrado ao reativar)" and the single primary is "Reativar assinatura" -> `POST /v1/billing/reactivate` -> `{ cancelAt: null, openCharge }` (the one-month recovery charge is created now) then `POST .../payment-link` for the URL -> hosted page. Shows the clean-up policy: 180 days after suspension if the tenant ever paid (90 if never), purge date from `summary.purgeAt`, e-mails 30 and 7 days before.

## Screen 6 — Loading — 01f-billing-loading.html
Tab bar rendered immediately; every panel shows skeleton blocks (GAP: check `apps/web/shared/components/ui/` for a skeleton before building one). No buttons while loading.

## Screen 7 — Load error — 01g-billing-load-error.html
`ErrorAlert` (EXISTS, dashboard variant) inside each panel (the summary failed, so status is unknown) + retry (refetch both queries). Copy: "Não foi possível carregar sua assinatura" / "Tivemos um problema ao buscar os dados. Verifique sua conexão e tente novamente. Se continuar, fale com a gente." Primary "Tentar novamente"; secondary "Falar com a gente".

## Screen 8 — No charges (Cobranças tab) — 01h-billing-no-charges.html
Opens on the Cobranças tab. Empty history: "Nenhuma cobrança paga ainda" / "Assim que a primeira cobrança for paga, ela aparece aqui com a situação de cada pagamento. A cobrança em aberto está na aba Resumo." (`pagination.total === 0`). No primary button on this tab; Resumo still has "Pagar agora" for the first charge.

## Screen 9 — Payment received, reactivating (Resumo tab) — 01i-billing-payment-pending.html
Return from the hosted page while status is still SUSPENDED: blue alert "Pagamento recebido — reativando sua conta…" with secondary "Atualizar agora"; poll `GET /v1/billing/summary` every 5 s (stop on ACTIVE then router.refresh, or after ~60 s show "Ainda processando — atualize em instantes"). Charge card badge "Processando". No primary button. Nav stays disabled until ACTIVE; tabs still work.

## Screen 10 — Payment link expired (Resumo tab) — 01j-billing-payment-link-expired.html
When `openCharge.paymentLinkExpiresAt < now` (`charges.payment_url_expires_at`): amber alert "O link de pagamento expirou"; the single primary becomes "Gerar novo link" (`POST /v1/billing/charges/:id/payment-link`). Open question: the backend could always generate on click, making this state only a fallback.

## Screen 11 — Dados de cobrança tab, BR (`DadosCobrancaTab` / `BillingIdentityForm`) — 02-billing-identity-br.html
Opens on the Dados de cobrança tab (same page as Screen 1). **File:** `BillingIdentityForm.tsx` (GAP; reuse `Input`/`Label` primitives). **BFF:** `GET /v1/billing/identity` (prefill on tab open), `PUT /v1/billing/identity` (save).
**Locale source of truth:** field labels, placeholders and validation come from `CountrySpec.address` (`packages/i18n/src/country-defaults.ts`, `AddressSpec`: postalLabel/Placeholder/Regex, stateLabel/Pattern, requireNeighborhood + neighborhoodLabel, streetLabel, numberLabel, complementLabel, cityLabel, lookupService) — not translated, picked by the tenant's country; the tax-ID field needs a NEW CountrySpec entry (label, placeholder, validator; BR = CNPJ/CPF with check digits, US = free-text "Tax ID (EIN)") which does not exist yet (GAP). Address JSON shape = shared `Address` VO (`apps/backend/src/shared/value-objects/address.ts`): `{ street, number, complement?, neighborhood?, city, state, zipCode }` (the prototype's "district"/"zip" map to `neighborhood`/`zipCode`); billing fields stay optional even though the VO requires them for a full address. BR (this screen): labels CEP, Rua (spec `streetLabel`), Número, Complemento, Bairro, Cidade, UF; CEP first with hint "Digite o CEP para preencher o endereço"; typing a valid CEP calls the existing ViaCEP hook (`useAddressLookup`, `lookupService: 'viacep'`) and autofills Rua, Bairro, Cidade, UF (shown with a green "preenchido pelo CEP" tag, still editable). Body: `{ taxIdType?: CNPJ|CPF|OTHER|null, taxId?, legalName?, billingEmail?, address?: Address }` — everything optional; empty billing e-mail falls back to manager e-mails.
| Field | Rule | Error message |
|---|---|---|
| taxId (CNPJ) | **BR: required and never blankable** (collected at signup); 14 digits + valid check digits; US: optional free text | "CNPJ inválido. Confira os 14 dígitos." |
| taxId (CPF) | **BR: required and never blankable**; 11 digits + valid check digits; code `BILLING_IDENTITY_TAX_ID_INVALID` (an empty value is rejected the same way) | "CPF inválido. Confira os 11 dígitos." |
| billingEmail | optional; if present, valid e-mail | "Informe um e-mail válido, por exemplo nome@empresa.com.br." |
| zipCode | **required before the first paid selection** (`BILLING_ADDRESS_REQUIRED`); `postalRegex` `^\d{5}-?\d{3}$` | "CEP inválido. Use o formato 00000-000." |
| state (UF) | optional; `statePattern` `^[A-Z]{2}$` | "UF inválida. Use 2 letras maiúsculas, por exemplo MG." |
**Actions:** desktop: action pane (primary "Salvar alterações" + secondary "Cancelar"); mobile: `.form-actions` at the bottom of the tab: secondary "Cancelar" (reverts to the loaded values) + the page's single primary **"Salvar alterações"** (saves only this tab, one endpoint). **States:** idle -> dirty (amber dot on the tab) -> submitting (button "Salvando…", disabled) -> saved (02d) / validation error (02b, 422 re-renders the whole form; network error: "Não foi possível salvar. Tente novamente.").

## Screen 12 — Dados validation error — 02b-billing-identity-br-erro.html
Dados tab; whole form shown; invalid CNPJ, e-mail, CEP (`30140-07`) and UF (`M1`) highlighted, no autofill (lookup failed / not triggered); red alert at the top of the tab "Corrija os 4 campos destacados para salvar" / "CNPJ, e-mail de cobrança, CEP e UF."; amber dirty dot on the tab label.

## Screen 13 — Dados, US — 02c-billing-identity-us.html
Same tab, `country = US`, tenant language `en`: the whole page content is English (the dashboard shell around it, sidebar and topbar, is still drawn in pt-BR for every tenant; shell language is a product decision still open) (title, four tabs Summary / Plan / Charges / Billing details — there is no Automatic billing tab for US since Pix Automático is BRL-only, labels, hints, buttons "Save changes" / "Cancel", action pane, badge "Active", money US$ 52.00, MM/DD/YYYY dates). Address labels are exactly the US `AddressSpec`: Street, Number, "Apt, Suite, etc." (complement), City, State (`^[A-Z]{2}$`), ZIP Code (placeholder 90210, `^\d{5}(-\d{4})?$`); no neighbourhood field and no postal lookup (`lookupService: 'none'`). Tax ID: optional free text "Tax ID (EIN)" (no CNPJ/CPF, no selector, not validated; needs the new CountrySpec tax-ID entry = GAP). Page strings come from the `en` locale JSON in `packages/i18n/locales/en` (UI copy) while address labels come from `CountrySpec.address`. The dashboard shell (sidebar, bottom nav, topbar date) would also be localized in production; the prototype only localizes the page and topbar title. Tenant "Sunrise Auto Spa" is illustrative.

## Screen 14 — Dados saved — 02d-billing-identity-saved.html
Inline green alert at the top of the tab "Dados de cobrança salvos" / "Atualizamos as informações. Elas valem para as próximas cobranças." No floating toast; the form stays with saved values.

## Screen 15 — Cancel confirm (`CancelSubscriptionConfirm`) — 06-cancel-confirm.html
**Standalone confirmation page** (not a tab), same pattern as `03b-deactivate-confirm.html`; reached only from the red text link "Cancelar assinatura" on the Resumo tab. **File:** GAP, `detail-layout` confirmation pattern. **BFF:** `POST /v1/billing/cancel` (no body) -> `200 { cancelAt }` for ACTIVE (end of the paid period), `200 { status: "SUSPENDED", cancelAt: null }` for TRIALING/PAST_DUE (immediate; see `06d`), `409 BILLING_ALREADY_CANCELLING` shows the scheduled state.
Copy blocks: "Quando termina" (access until {cancelAt}), "Reembolso: Nenhum valor será reembolsado", "E os seus dados?" (180/90 days, apagados definitivamente, avisos 30 e 7 dias, reativar pagando 1 mês). Buttons: danger "Cancelar assinatura" + secondary "Voltar" (to the Resumo tab). States: idle -> submitting ("Cancelando…") -> 06b / 06c. Variants: `06d` (TRIALING with nothing paid, or PAST_DUE: immediate; the sentence says the current period is unpaid, the purge text depends on whether the tenant ever paid: 180 days if it did, 90 if never) and `06e` (trial with the first invoice paid: effective at trial end). `06b` hard-codes "180 dias" on purpose: its tenant is a paid one (ACTIVE with a scheduled cancel); a never-paid tenant would see 90 days.

## Screen 16 — Cancel scheduled (Resumo tab) — 06b-cancel-scheduled.html
`ResumoTab` for ACTIVE with `cancelAt`: grey alert "Cancelada — acesso até 10/11/2026" with the single primary **"Reativar assinatura"** (`POST /v1/billing/reactivate`; while the paid period is still running it just un-schedules the cancel, no payment — returns `{ cancelAt: null, openCharge: null }`, no link needed). Situação card "Acesso até" / "Próxima cobrança: Nenhuma". Cancel link hidden; badge "Cancelando" (title row and pane). Other tabs work as usual.

## Screen 17 — Cancel error — 06c-cancel-error.html
Standalone confirmation page with a red alert "Não foi possível cancelar a assinatura" / "Algo deu errado do nosso lado e nada foi alterado. Tente novamente em instantes; se persistir, fale com a gente." The danger button becomes "Tentar novamente".

## Screen 18 — Cobrança automática tab, inactive (PREVIEW, "prévia – ainda não disponível") (`CobrancaAutomaticaTab` / `AutoBillingCard`) — 07-auto-billing-activate.html
**Not live:** every other screen shows this tab as a muted "Em breve" (tab label chip, Resumo row, panel with no button). Screens 07, 07b, 07c and 07d are the future design and carry an amber "Prévia — ainda não disponível" note.
Opens on the Cobrança automática tab. **BFF:** `POST /v1/billing/auto-billing` body `{ mode: PIX_AUTOMATICO }` -> `{ authorizationUrl }` then redirect to the hosted page. Status card "Desativada", single method card "Pix Automático" (card removed), "O que vai acontecer" steps. Copy never names the provider; no card inputs in-app. Manual payment link remains valid. **Single primary: "Ativar cobrança automática"** in `.form-actions`. In SUSPENDED the tab shows a grey notice and the button is disabled.

## Screen 19 — Cobrança automática active — 07b-auto-billing-active.html
Green alert "Cobrança automática ativada" (inline, after returning from the provider) + status "Pix Automático ativo", next charge. **No primary button**; only the secondary red "Desativar" -> `DELETE /v1/billing/auto-billing` (open question: add a confirm step; drawn as a direct action). The Resumo tab of this file shows "Cobrança automática — Pix Automático ativo".

## Screen 20 — Cobrança automática pending — 07c-auto-billing-pending.html
`summary.autoBilling.status = PENDING_AUTHORIZATION` (`billing_accounts.auto_billing_status`): amber alert with spinner "Aguardando a confirmação da autorização", status badge "Pendente". Single primary "Atualizar status" + secondary red "Cancelar tentativa" (`DELETE`); retrying authorization = cancel the attempt, then "Ativar cobrança automática" again. Manual link keeps working.

## Screen 21 — Cobrança automática error — 07d-auto-billing-error.html
Red alert "Não foi possível iniciar a autorização" / "O parceiro de pagamento não respondeu. Nada foi alterado. Tente novamente; se a autorização for recusada, tente de novo." Method options kept; single primary "Tentar novamente". Covers both a 5xx on POST and a declined authorization on return.

## Screen 22 — Plano tab, ACTIVE with a staged change (`PlanoTab`) — 08-plan-edit.html
**Files (all GAP):** `apps/web/features/billing/components/PlanoTab.tsx` composing `FeatureToggleCard` (one per feature: name, description, monthly price for the tenant's country, switch, dependency hint, per-card note/error), `ChatbotTierPicker` (radio cards Básico R$ 39,00 / Plus R$ 79,00 inside the Chatbot card) and `PlanChangePreview` (list of changes + live total). Same tab pattern and action pane as the other tabs.
**BFF (UC-136; contract: `docs/API_CONTRACTS.md` § Billing — Manager API):** `GET /v1/billing/plan` on tab open -> catalog for the tenant's country (price per feature/tier, dependencies, current selection and, when present, scheduled next-period selection); `POST /v1/billing/plan/preview` body `{ items: [{ featureKey, tier }] }` on every selection change (debounced) -> changes effective at the next paid service-period start, new total, warnings; `PUT /v1/billing/plan` same body on save. The prototype computes the preview client-side; production renders the server's answer.
**Rules shown (UC-136):** Every add, remove, upgrade and downgrade takes effect at the next paid service-period start—never now, never prorated. The whole proposed selection is validated as one dependency graph, so dependent features can be selected together. At least one feature is required ("O plano precisa de pelo menos um recurso."); dependencies HOTSITE <- BOOKING, CHATBOT, LEAD_FORM; BOOKING <- LOYALTY. Only five features exist (HOTSITE, BOOKING, LOYALTY, CHATBOT, LEAD_FORM); recurring reservations and availability alerts are part of BOOKING. If the next-period invoice is already issued and unpaid, it is cancelled and re-issued after the selection is saved; a paid invoice is never changed. `PAST_DUE` and `SUSPENDED` are read-only.
**Props:** `catalog: PlanCatalog`, `status`, `readOnly`; local state `selection: Record<FeatureKey, { on, tier? }>`.
**State machine:** idle (no change, "Salvar plano" disabled) -> dirty (amber dot on the tab, preview + new total, button enabled) -> previewing (`POST …/preview` in flight) -> saving ("Salvando…", `PUT`) -> saved (08d) | error (08h server, 08c validation). "Descartar alterações" returns to idle.
**Action pane:** Plano primary **"Salvar plano"** (disabled until there is a valid change) + secondary "Descartar alterações" + live "Novo total mensal" box + "Falar com a gente" + cancel link; mobile: the same two buttons in the bottom `.form-actions` row.
**This file:** chatbot -> Plus (+R$ 40,00), - Formulário de contato (-R$ 19,00); every preview line says it takes effect on the next paid period (10/11/2026); new total R$ 266,00 por mês (antes R$ 245,00; 245 - 19 + 40). Switches and tiers are interactive.
**Mobile:** cards stack, switch stays right; tier cards wrap; preview card above the bottom action row.

## Screen 23 — Plano, TRIAL review — 08b-plan-trial-choose.html
Opened by the "Confirmar plano" CTA of the trial banner (04). Alert "Confirme seu plano para gerarmos a primeira cobrança" / "Durante o teste todos os recursos estão liberados. A primeira cobrança (vence em 04/11/2026) só é gerada depois que você confirmar o plano, e usa a seleção abaixo. Planos não confirmados são confirmados automaticamente com todos os recursos 3 dias antes do fim do teste." This selection only determines the first paid period; it never changes trial entitlements. The primary is **"Confirmar plano"** (`PUT /v1/billing/plan`), enabled even with no change because confirming the default is valid; right after it the first invoice is generated. Here Formulário de contato is unchecked (total R$ 226,00 = 245 - 19).

## Screen 24 — Plano, dependency error — 08c-plan-dependency-error.html
Whole form with the error (A1): removing Agendamento while Fidelidade is on -> red alert "Não foi possível salvar o plano" / "Agendamento não pode sair do plano enquanto Fidelidade estiver ativa. Remova a Fidelidade também ou mantenha o Agendamento. Nada foi salvo."; both cards highlighted ("Fidelidade depende de Agendamento, que está saindo do plano." / "Fidelidade depende dele: remova também ou mantenha este recurso."). "Salvar plano" disabled until fixed; the backend rejects the same selection with a typed error (new code in both locale files).

## Screen 25 — Plano saved — 08d-plan-saved.html
Inline green summary "Plano atualizado" listing each change, its next-period effective date and the new total; no toast. The current selection stays visible until that date, and the saved next-period selection is shown separately. "Salvar plano" returns to disabled.

## Screen 26 — Plano read-only, SUSPENDED — 08e-plan-readonly-suspended.html
SUSPENDED: grey alert "Plano em modo leitura" / "Reative a assinatura para alterar o plano."; switches and tiers disabled; no primary on this tab (the page's primary stays "Pagar agora" on Resumo); nav items disabled as in 01d. A scheduled cancellation remains editable while the paid period is still active.

## Screen 27 — Plano, PAST_DUE — 08f-plan-past-due-no-add.html
Amber alert "Pagamento em atraso — plano em modo leitura". Every switch and tier is disabled, no save action appears, and the only primary action remains "Pagar agora" on Resumo.

## Screen 28 — Plano, scheduled next-period selection — 08g-plan-not-removable-yet.html
Blue alert explains that a saved selection has not taken effect yet: "Alterações agendadas para 10/11/2026". It shows current and next-period selections side by side; the manager may replace the scheduled selection before the next-period invoice is paid. There is no `removableFrom` / first-billed lock.

## Screen 29 — Plano save error — 08h-plan-save-error.html
`PUT /v1/billing/plan` 5xx (A9): red alert "Não foi possível salvar o plano" / "Algo deu errado do nosso lado e nada foi alterado. Sua seleção foi mantida; tente novamente em instantes."; selection and preview kept; "Salvar plano" stays enabled. If only the provider re-issue of the open charge fails (A8) the plan IS saved and the retry happens server-side — no UI state.

## Screen 30 — Price-change notice (Resumo + Plano tabs) — 01k-billing-price-change-notice.html
Operator-only price changes are dated and announced (`tenant-billing_API.md` "Price-change endpoint", `feature_price_versions`, UC-112, UC-124); managers get an email AND see it in the product. **Component:** `PriceChangeNotice` (GAP, info alert at the top of `ResumoTab`); `FeatureLineItems` shows the current price struck/muted plus "R$ 49,00 a partir de 10/12"; `FeatureToggleCard` shows a read-only note "Novo valor a partir de 10/12: R$ 49,00 por mês" (no extra buttons). **BFF:** `GET /v1/billing/summary` gains `upcomingPriceChanges: [{ featureKey, tier, currentAmountMinor, newAmountMinor, effectiveFrom }]`; `GET /v1/billing/plan` items gain `upcoming` (same shape, per item). **Copy:** "Aviso de reajuste" / "O valor de Chatbot (plano Básico) passa de R$ 39,00 para R$ 49,00 a partir do período de serviço iniciado em 10/12/2026. Seu novo total mensal será R$ 255,00 nesse período." (new total = current R$ 245,00 + R$ 10,00). Single primary stays "Pagar agora". Not dismissible; disappears once the change takes effect. The Plano preview uses the price for the service period it is previewing, not the invoice-issue date.

## Known limitations / notes for the lead
- "Falar com a gente" links to `journeys/shared/hotsite.html` as a stand-in for Ikaro's own booking page.
- Disabled nav items in suspended screens are intentionally `href="#"` + `aria-disabled`.
- **Sidebar "active" item on state screens:** on the suspended and other state files the active "Assinatura" entry links to `01-billing-active.html` (the ACTIVE reference screen). Decision: left as is, because it is a prototype shortcut; the real nav links to `/dashboard/billing`, whatever the state.
- **Disabled destructive/primary actions** in the prototype are `<a aria-disabled="true">`. The real component uses `<button disabled>` (or a real disabled state) plus a live-region message that says why it is unavailable.
- **Layout classes are duplicated inline** in the `<style>` block of each of the 49 screen files. Recommendation: extract a shared stylesheet for the billing prototype (not done now, to keep the files stable).
- **Dashboard shell language:** all prototype shells are pt-BR, also for the US tenant. Whether the shell follows the tenant or user locale is a product decision still open; see `guest/prototypes/ikaro-trial/dev-notes.md`.

---

---

# Dashboard banners (enforcement)

## Banner screen 3 — Agenda com banner de teste (`SubscriptionBanner`)

File: `04-dashboard-trial-banner.html` — Status: GAP (banner); Agenda page EXISTS.
Props: `status: 'TRIALING'`, `daysLeft: number`, `trialEndsAt: string`. Manager-only; mounted once in the dashboard shell above `<main>`; not dismissible. Sidebar gains manager-only "Assinatura".
BFF: `GET /v1/billing/access` -> `{ status, operational, features }` and `GET /v1/billing/summary` (trial end, past-due and suspension dates).
States: shown while status = TRIALING; hidden for ACTIVE; load-error of the banner fails silent (no banner), never blocks the page.
Copy: "Faltam 9 dias do seu teste." / "Confirme seu plano para gerarmos a primeira cobrança, que vence no fim do teste: ela só é gerada depois da sua confirmação (ou automaticamente, com todos os recursos, 3 dias antes do fim). Sem o pagamento, a conta é suspensa 24 horas depois do fim do teste." / CTA **"Confirmar plano"** -> `08b-plan-trial-choose.html` (Plano tab, UC-136 A3). Singular "Falta 1 dia", last day "Seu teste termina hoje".
Mobile: banner wraps, button below text.

## Banner screen 4 — Agenda com banner de pagamento em atraso

File: `04b-dashboard-past-due-banner.html` — Status: GAP (same `SubscriptionBanner`, `status: 'PAST_DUE'`, props `dueDate`, `suspendsAt`, `amount`).
Full access; nothing locked. Copy: "Pagamento em atraso." + amount and dates + "Pagar agora" (opens the provider's hosted page from the billing page; no provider name in UI). Role `alert` (amber).
After payment the banner disappears immediately; a short "pagamento recebido, reativando" state belongs to the billing page.


---

# Addenda (manager-relevant bullets only)

# Addendum (2026-10-27 review) — states added or changed

- **Exempt account (UC-117 A7) — `01l-billing-exempt.html`.** `GET /v1/billing/summary` returns `exempt: true`; every tab shows one grey notice ("Conta isenta de cobrança"), badge "Isenta", no primary action, no cancel link, no payment or plan editing. The dashboard shows no trial/past-due banner and every feature is unlocked. Reached by Ikaro's own tenant and any operator-exempted tenant.
- **Trial end.** Screens 01b and `04` now say the account is suspended 24 hours after the trial end if the first invoice is unpaid (up to 3 business days when the payment is pending); there is no PAST_DUE after a trial. If no charge could be issued (for example a US tenant without state/ZIP), the same rule applies and the Plano/Dados tabs warn the manager beforehand.
- **Deferred start of new features.** `03` and `03b` say the feature starts at the next billing period (10/11/2026). The Plano preview already shows the same date per line.
- **US totals.** Summary and Plano totals (open, not yet issued amounts) are net of tax and are labeled "+ imposto calculado na cobrança" for US tenants; issued US charges show tax lines (see Addendum 6). The US Plano panel exists in `02c` and `02e` (English, "Plan" tab).
- **Error code names** are `BILLING_*`/`SIGNUP_*` per the repo convention (`BILLING_TENANT_SUSPENDED`, `BILLING_FEATURE_NOT_ENTITLED`).

- **US full address required before the first paid selection.** New screen `02e-billing-identity-us-address-required.html`: a US trial tenant on the Dados tab sees the red alert "Add your full billing address" with street, city, state and ZIP highlighted (the number is optional); without it the first invoice cannot be issued and the trial suspends at its end. Error code `BILLING_ADDRESS_REQUIRED` from `PUT /v1/billing/plan` (same for BR).
- **Auto-billing is Pix Automático only.** The card option and "Cartão final 4242" were removed from `07*` and every Resumo/Automática panel; the activation tab offers only Pix Automático ("Pague o primeiro Pix e aprove a autorização no app do seu banco"). Tenants still pay any monthly charge by card, Pix or boleto on the hosted page. `POST /v1/billing/auto-billing` accepts `{ mode: 'PIX_AUTOMATICO' }` only.
- **Provider facts and launch gates** for these screens are in `docs/discovery/tenant-billing/tenant-billing_PROVIDERS.md`.
- **No UI for non-production controls.** The simulate, advance-time and seed tools are internal endpoints and scripts only (`tenant-billing_API.md` §5 "Non-production endpoints"); there is no dev panel in the dashboard. The seed script creates one tenant per screen state shown in this prototype (trial, active, scheduled cancel, past due, suspended ×2, exempt, US with and without address).


## Addendum 2
- **`01h` is now "TRIALING with the first invoice issued"** (badge "Em teste", due = trial end 04/11, history of paid charges empty). It is the state a trial tenant is in from day 4 to day 0. `01b` stays the state before the invoice exists.
- **`01d` (SUSPENDED / NON_PAYMENT)** now shows the **recovery charge**: "Cobrança de reativação (um mês) · vence em 02/11/2026", says the previous open charge was cancelled and replaced, and shows the 90/180-day clean-up policy. The overdue variant (recovery due date passed) is the same screen with an "Vencida" badge and unchanged "Pagar agora" (the provider link keeps working). `PAYMENT_REVERSED` is now drawn in `01m` ("Conta suspensa: o pagamento foi estornado ou contestado", recovery charge with "Pagar agora", purge date) and `OPERATOR` in `01n` ("Conta suspensa pela Ikaro", reason-neutral, no charge, no pay button, only "Falar com a gente").
- **New `06d-cancel-immediate`** (UC-133 A3): cancel for TRIALING or PAST_DUE takes effect now, no refund because nothing was paid; leads to `01e` (suspended by cancellation; `01d` is the non-payment suspension).
- **US screens (`02c`, `02e`)**: card only (no ACH or bank debit), no Automatic billing tab or row (Pix Automático is BRL-only; four tabs: Summary, Plan, Charges, Billing details), Chatbot Plus US$ 19, "+ tax calculated when each invoice is issued" under totals, all plan changes at the next paid period. `02e` is now a consistent TRIALING summary (no open charge yet, history empty).
- **`07d`** shows the real Pix Automático authorization error with the method card kept and "Tentar novamente".
- **Illustrative dates:** each screen uses its own illustrative "today" and charge dates; the trial screens (01b, 01h, 04, 09) follow the confirm-plan flow (invoice issued on confirmation, or automatically 3 days before the trial end); the former fixed 10-day invoice lead no longer applies to the trial. Other screens are not meant to be read as one continuous timeline.

## Specified but not drawn (manager rows)

| Gap | Where specified | What the story must show |
|---|---|---|
| US dashboard banner and Plano tab warning when no billing address | UC-113 A7, `summary.addressRequired` | Same amber banner as the BR trial banner with "Add your billing address — without it your account is suspended on {trialEnd}", linking to the Dados tab; Plano shows the same notice and disables Save until saved |
| US Plano preview total with tax label | US totals are net of tax (see Addendum 6 below) | "+ tax calculated when each invoice is issued" under the total, same as 02c/02e Resumo |
| Pix Automático revoked at the bank | UC-135 A3 | Amber alert on the Automática tab "A autorização foi revogada no seu banco; o link de pagamento mensal continua valendo" with "Ativar de novo" |
| Annual billing: US Plano tab with the Mensal/Anual toggle | Addendum 5 | Same toggle as `08` in English (US$ annual 120 / 260 / 70 / 90-190 / 50, illustrative); only the US price table (`ikaro-trial/02b`) is drawn with the toggle |
| Annual billing: price-change notice for an annual subscription | Addendum 5 | `01k` variant: new annual amounts, applied at the next annual renewal |
| Annual billing: renewal reminder e-mails and the annual invoice e-mail | Addendum 5 | Templates (pt-BR, en): invoice issued 30 days before the period start, plus reminders; designed with the notification templates |
| Annual billing: Plano tab of an active annual subscription, cancel-scheduled screen with annual dates, Cobranças tab with add-on charges, PAST_DUE annual Resumo | Addendum 5 | Not drawn; `11` shows Resumo only and `13` confirms into the monthly `06b` |
| Per-tab loading and fetch-error states (Cobranças, Dados, Plano) | Screen 1 ("Tabs fetch lazily") | Skeleton inside the tab panel and a tab-level `ErrorAlert` with "Tentar novamente"; the tab bar and badge stay. Only the page-level `01f`/`01g` are drawn |
| `409 BILLING_PLAN_ALREADY_CONFIRMED` on "Confirmar plano" | UC-136 / API contract | Inline notice that the plan was already confirmed (another session), then refresh the summary; no error page |
| Payment-link failure on "Pagar agora" (`BILLING_CHARGE_NOT_PAYABLE`, `BILLING_PROVIDER_UNAVAILABLE`) | UC-119 | `ErrorAlert` above the open-charge card ("Não foi possível abrir a página de pagamento"), the button stays enabled; `NOT_PAYABLE` refreshes the summary |
| Discard before M27 (`canDiscard` false) | M26 non-goals, UC-141 | "Descartar este teste" is not rendered; the Resumo shows a plain line "Para descartar este teste, fale com a gente" with the "Falar com a gente" link |

## Addendum 3

The HTML screens were redrawn in the 2026-10-27 follow-up (script-assisted, then reviewed). Where a screen and the docs still differ, **the docs win**.

- **Features merged — applied.** The Recorrência and Alertas de disponibilidade rows/cards and their plan-state entries were removed from every billing screen and from the public price tables (BR and US). BOOKING is **R$ 109,00 / US$ 26.00** and its description says it includes recurring reservations and availability alerts. The example selection total is now **R$ 245,00** (US: **US$ 59.00**); the price-change example is R$ 255,00; the staged-plan example (Chatbot Plus, without Formulário de contato) is R$ 266,00.
- **Remove-BOOKING block — new screen** `08i-plan-booking-in-use.html` (`BILLING_FEATURE_IN_USE`).
- **Trial with a paid first invoice — new screen** `06e-cancel-trial-paid.html` (cancel scheduled at trial end, nothing lost). `06d` stays the immediate-cancel case for a trial with nothing paid or a `PAST_DUE` account.
- **BR billing address — new screen** `02f-billing-identity-br-address-required.html`; the BR Dados tab text now says CPF/CNPJ and the full address are required before the first charge. Error `BILLING_ADDRESS_REQUIRED`, summary field `addressRequired`.
- **Still to draw in story discovery:** receipts ("Recibo" link on paid Cobranças rows); the dunning, plan-confirmation-reminder (10, 7, 4 days before the trial end) and purge-warning e-mails (templates, not screens; the dunning cadence 1, 3, 7 and 12 days after the due date is already stated in `01c`); the "recovery charge has no period dates" detail on `01d`; the hours-level states of the suspension freeze, including the "payment pending, up to 3 business days" wait after trial end (no tenant-facing screen needed beyond 01i). Drawn since the last review: the confirm-plan step (09), the never-paid discard (10), PAYMENT_REVERSED (01m), OPERATOR (01n), failed payment return (01o), the trial-cancel variants (06d, 06e) and the US Plano panel (02c, 02e).
- **No operator-facing screens.** Operator work is the short list of operator cases in `docs/RUNBOOKS.md` § Billing (planned); there is still no backoffice UI.

## Addendum 4

Decisions applied to the HTML screens. Where a screen and the docs one level up differ, the docs win.

- **Five features only** (HOTSITE, BOOKING, LOYALTY, CHATBOT, LEAD_FORM). BR R$ 49 / 109 / 29 / 39 (Basic) / 79 (Plus) / 19, default total R$ 245; US 12 / 26 / 7 / 9 (19 Plus) / 5. `/ikaro-trial` says "Todos os 5 recursos".
- **Trial billing flow.** 14-day trial; the first invoice is issued **only after the manager confirms the first paid plan** on the Plano tab ("Confirmar plano"). If it is not confirmed 3 days before the trial end, the system issues it anyway with the default (all features) and emails clearly. Reminders about confirming the plan: 10, 7 and 4 days before the trial end. The invoice is due at the trial end. After the trial end the system waits 24 hours before suspending, or up to 3 business days when the manager already returned from the payment page and the payment is pending (boleto). Screens: `01b` (not confirmed, 9 days), `09` (not confirmed, 8 days, on the Plano tab), `04` (banner CTA "Confirmar plano"), `08b` (Plano tab with primary "Confirmar plano"), `01h` (invoice exists, 4 days left; note that it was issued after confirmation or automatically with the default plan).
- **New suspended and payment states.** `01m` SUSPENDED / PAYMENT_REVERSED (explains the reversal, recovery charge with "Pagar agora", purge date 180 days after suspension because the tenant paid before); `01n` SUSPENDED / OPERATOR (reason-neutral "Conta suspensa pela Ikaro", no charge, no pay button, only "Falar com a gente"); `01o` payment-page return with a failure ("Não conseguimos confirmar o pagamento", open charge kept, "Tentar pagar novamente").
- **Discard a never-paid tenant** (`10-discard-trial-confirm.html`, UC-141, slice G, deferred): `TRIALING`, or `SUSPENDED`/`NON_PAYMENT` that never paid. The confirmation page lists what is erased, states it is immediate and irreversible, requires typing the slug, and says the name and the trial become available again (`POST /v1/billing/discard { confirmSlug }`, `docs/API_CONTRACTS.md` § Billing — Manager API). Entry points: the red "Descartar este teste" link on `01b`, `01h`, `08b`, `09` and `01d`, and the signup card of `guest/prototypes/ikaro-trial/03c` ("Descartar o teste não pago e começar de novo").
- **Auto-billing is "Em breve".** Tab label chip, muted Resumo row and a muted panel without buttons on every state; `07*` are labelled "prévia – ainda não disponível" and stay as the future design.
- **Neutral refund wording.** Refunds and disputes are handled in the payment provider console by the operator only as exceptions; copy says "pelo provedor de pagamento" / "by the payment provider".
- **`06b`** keeps the hard-coded "180 dias" because its tenant is a paid one (ACTIVE with a scheduled cancel); a never-paid tenant would see 90 days.
- **Cleanup details.** `01c` states the dunning cadence (1, 3, 7 and 12 days after the due date); `01e` shows the reactivation amount only as "Um mês: R$ 245,00 (cobrado ao reativar)" with "Reativar assinatura" as the primary; `01l` (exempt) no longer carries trial hint text in its pane script; `06d` wording is accurate for both TRIALING and PAST_DUE; `02e` no longer requires the US number (street, city, state and ZIP).

## Addendum 5 — annual billing (slice H)

New screens: `11-billing-active-annual`, `12-addon-midyear-confirm`, `13-cancel-annual-confirm`, `01q-billing-suspended-annual-recovery`. Changed: the Mensal | Anual toggle on `08`, `08b`, `09` (Plano tab) and `ikaro-trial/02` / `ikaro-trial/02b` (price tables). Where a screen and the docs one level up differ, the docs win.

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

- **Plano tab toggle (`08`, `08b`, `09`).** Segmented control "Mensal | Anual (2 meses grátis)" above the feature cards, default Mensal, with a note that the cycle applies to the whole subscription. In Anual each card shows the annual amount with "/ano" and "equivale a R$ X/mês", the chatbot tier options show annual amounts, and the preview and aside totals become "Novo total anual" (R$ 2.450,00 por ano for the full set, "equivale a R$ 204,17/mês"). Paid subscription (`08`): "A troca de ciclo vale a partir de 10/11/2026". Trial (`08b`, `09`): the cycle applies to the first invoice on 04/11/2026. Implemented as a small script that swaps the prices read by `planRefresh()`; the toggle is not part of the "unsaved changes" state.
- **Price tables (`ikaro-trial/02`, `ikaro-trial/02b`).** Same toggle; the header becomes "Preço anual", amounts switch to "/ano" with "equivale a .../mês" (the US page keeps its existing Portuguese UI copy).
- **`11` (Resumo, ACTIVE annual, BR).** "Plano anual" badge; period 20/10/2026 to 20/10/2027; next charge 20/10/2027, issued 30 days before (20/09/2027); features at annual prices; history with one paid annual charge; the note "Para adicionar um recurso durante o ano, você paga só os meses restantes"; links to `12` and `13`. **Deviation:** the drawn plan has four features (R$ 2.260,00/ano) with LEAD_FORM as the "Não contratado" add-on so `12` is coherent; the full five-feature set, R$ 2.450,00/ano, is the renewal total after the add-on. Only Resumo is drawn (no tab strip).
- **`12` (add-on mid-year).** Date 20/05/2027, 5 months left: "R$ 95,00 agora (5 meses x R$ 19,00)", capped at R$ 190,00, starts today, joins the annual plan at renewal on 20/10/2027 (total R$ 2.260,00 to R$ 2.450,00); primary "Pagar e ativar agora" leads to the hosted-payment screen `01i`.
- **`13` (cancel annual).** Access until 20/10/2027, nothing refunded, schedule (today, until 20/10/2027, suspension, data erased on 17/04/2028 = 180 days later, with 30 and 7 day warnings). The confirm button goes to the monthly `06b` result screen (annual variant not drawn).
- **`01q` (suspended, annual tenant).** Today 03/11/2027; the unpaid annual charge of 20/10/2027 was cancelled and replaced by a one-month recovery charge of R$ 245,00; "Sua assinatura volta ao ciclo mensal; você poderá escolher o anual de novo na próxima renovação".

## Addendum 6 — US tax lines on charges

- **What changed (`02c`, US/English only).** Every issued US charge now shows Subtotal, tax as separate lines per jurisdiction, and Total. In Charge history each row's amount column is the total, and a "Tax details" disclosure under the reference expands to the three-part breakdown. The Open charge card on the Summary tab shows the big amount as the total (US$ 62.69), then Subtotal, tax line and Total, and the "Pay now" button carries the total.
- **Illustrative numbers (Texas address).** Subtotal US$ 59.00; "Texas state sales tax (6.25%)" US$ 3.69; total US$ 62.69. One history row (March 2026) shows the zero-tax variant: "Tax: US$ 0.00 (none applicable)", total US$ 59.00 (no registration at that time).
- **Unchanged.** Open amounts on the Summary ("Monthly amount") and Plan tabs stay net with "+ tax calculated when each invoice is issued". `02e` (not issued yet) is untouched. BR screens are unchanged: prices are tax-inclusive, no tax lines.


---

# Locked features (UC-125) — screens `03` and `03b`

> Moved as-is from the tenant-billing discovery when the enforcement states were promoted (planned Billing milestone); to be reshaped to the `journeys/README.md` template at story discovery. Common to both: `GET /v1/billing/access -> { status, operational, features: [{ key, tier }] }` (role-reduced for any role, `docs/API_CONTRACTS.md` § Billing — Access Resolution and Suspended-State Effects) is the single input; a feature absent from `features` is locked, and `status` SUSPENDED locks the tenant out identically whatever the reason. Sibling link targets: `01-billing-active.html` (Ver cobrança / Ver minha assinatura) and `08-plan-edit.html` (Contratar este recurso). "Falar com a gente" points to a fictional URL (`https://ikaro.example/ikaro/booking`) and appears on the manager locked screens only.

## Locked feature — Configurações, Chatbot não contratado (`03-locked-feature.html`; `SettingsForm` Chatbot section + `FeatureLockedCard`)

File: `03-locked-feature.html` — Status: `SettingsForm` EXISTS (Chatbot section is a GAP in journeys 01d); `FeatureLockedCard`, `DashboardSidebar`/bottom-nav lock state = GAP.
Props: `feature: 'CHATBOT'`, `tier?: 'BASIC'|'PLUS'` (copy mentions tiers), `lockedFeatures: FeatureKey[]` on sidebar/bottom nav.
BFF: `GET /v1/billing/access`. No settings write while locked; stored `chatbot.*` settings are kept untouched.
Behaviour: locked sidebar / bottom-nav entries keep their real href and show a padlock (never hidden); the Fidelidade entry here points to `03b-locked-feature-direct-url.html`. Chatbot form fields are not rendered while locked.
States: loaded-locked (this file); loading = existing skeleton of the page; load-error = existing `ErrorAlert` with retry; entitled = existing Chatbot section (journeys 01d).
Single primary: **"Contratar este recurso"** -> `08-plan-edit.html` (Plano tab; self-service, UC-136). "Ver minha assinatura" is a secondary button; "Falar com a gente" is only a small text link ("Dúvidas sobre preço?"). Copy: "Recurso não contratado", badge "Não contratado", "Suas configurações foram mantidas.", "Você escolhe o nível ao contratar, na aba Plano da assinatura."
Mobile: padlock on the tab icon; card stacks icon above text; "Mais" sheet unchanged.

## Locked feature — recurso bloqueado por URL direta (`03b-locked-feature-direct-url.html`; `FeatureLockedPage`)

File: `03b-locked-feature-direct-url.html` — Status: GAP.
Props: `feature: FeatureKey`. Rendered by the route guard of each feature route (HTTP 200 with the upsell, not 404 or redirect); API calls for the feature are rejected by the backend (403 `BILLING_FEATURE_NOT_ENTITLED`).
BFF: `GET /v1/billing/access`.
States: loaded-locked (this file); loading / load-error as for any dashboard route.
Single primary: **"Contratar este recurso"** -> `08-plan-edit.html`; "Ver minha assinatura" secondary; "Falar com a gente" small text link only. Copy: "Recurso não contratado", "Seus clientes e pontos já registrados foram mantidos…", "← Voltar à Agenda".
Mobile: single column; aside note collapses (desktop aside only, per `detail-layout`).
