# Dev Notes — Tenant Billing Discovery Prototype

**Status:** Discovery-stage, illustrative. Per-screen sections follow the `journeys/README.md` dev-notes template (component, file status, props, BFF call, validation, states, copy, mobile). The canonical API contract is `../tenant-billing_API.md`; where a per-screen section sketches a slightly different field name, the API document wins. Use cases: `../tenant-billing_USECASES.md` (CAND numbers below refer to it). Model and rules: `../tenant-billing.md`.

## Overview

48 screens across four areas: (1) the manager **billing page** (one "Assinatura" page with four tabs — Resumo, Cobranças, Dados de cobrança, Cobrança automática — one primary action per tab, like the service editor; cancel is a separate confirmation page); (2) **changed existing screens** (dashboard banners, locked features, hotsite editor panel); (3) the **suspended experience** for staff, customers and the public hotsite; (4) the **self-signup** flow on Ikaro's own hotsite (`/ikaro-trial`). Every screen has its alternate-state variants as separate files (index.html, "Estados alternativos").

## What is real vs invented

- **Real:** `--ba-*` tokens (`journeys/shared/tokens.css`), the dashboard shell, hotsite and customer-dashboard pages, `ErrorAlert`, status badge and detail-layout patterns.
- **Invented:** tenants "Lavacar BeloAuto" and "Ikaro"; all prices (illustrative BR list: HOTSITE R$ 49, BOOKING R$ 79, LOYALTY R$ 29, CHATBOT BASIC R$ 39 / PLUS R$ 79, LEAD_FORM R$ 19, RECURRENCE R$ 29, AVAILABILITY_ALERTS R$ 19; US in USD), dates, the `ikaro.app/` URL prefix, tier names.
- **New nav item, not in today's IA:** "Assinatura" under "Somente Gerente" (also in the mobile "Mais" sheet).

## Suspension routing (what the screens assume)

| Role | After login while `SUSPENDED` | Screens |
|---|---|---|
| MANAGER | Only `/dashboard/billing` (+ identity, cancel, auto-billing sub-pages); every other dashboard route redirects there; other nav items rendered disabled | manager-01d, manager-01e |
| STAFF | Notice page with "Sair" | staff-01 |
| CUSTOMER | Account page with "Empresa inativa" badge; history viewable; open-booking detail blocked; new booking blocked | customer-01, 01b, 01c |
| Visitor | "Página não publicada" with top-bar login for team and customers (reason-neutral) | public-01 |

## Open questions / known limitations

- **Top-bar label:** the real `HotsiteAuthBar` says "Área da Equipe"; prototypes keep the real label (the spec called it "Login da equipe"). Verify `<Unavailable />` renders the bar in the story.
- **Customer access projection:** customers call the same authenticated `GET /v1/billing/access`; anonymous visitors only get the effective `isPublished` from the manifest. Confirm the BFF returns a reduced projection (active flag, no reason) to non-manager roles.
- **"Falar com a gente"** is drawn only on manager screens (upsell, suspended, errors). Target is a stand-in (`journeys/shared/hotsite.html`) for Ikaro's own booking page; the real link is Ikaro's tenant booking URL.
- **Trial cancel** is immediate (CAND-28 A3) and shows the cancel link on the trial page; the confirm screen has no trial variant yet.
- **Desativar** (automatic charging) is drawn as a direct action with no confirmation.
- **Reactivating a scheduled cancel** needs no payment (the period is already paid) — backend contract unconfirmed.
- **Price load failure** on `/ikaro-trial` does not block signup (the trial is free); decide in the story whether the price table should still be hidden.
- **Skeleton primitive:** check `apps/web/shared/components/ui/` before building a loading skeleton.
- **Status name:** screens say "Em teste" for `TRIALING`.
- **Provider name** is never shown in any screen ("Pagar agora" opens a hosted page).


---

# Fragment A (CAND mapping: 12 billing page, 13 identity, 14 pay, 16 suspended routing, 25 trial, 27 purge, 28 cancel, 29 reactivate, 30 auto-billing) — Manager billing, identity, cancel, auto-billing (screens 01*, 02*, 06*, 07*)

Shared by all screens below: dashboard shell (EXISTS: dashboard layout/sidebar/bottom-nav), new nav item **"Assinatura"** under "Somente Gerente" (GAP; also in the mobile "Mais" sheet). Billing is visible to every MANAGER. Money `R$ 215,00` = BR list prices for HOTSITE 49 + BOOKING 79 + LOYALTY 29 + CHATBOT(PLUS) 39 + LEAD_FORM 19. Badge reuses `.status-badge` (EXISTS) with local colors for REFUNDED/CHARGEBACK. Success is inline (no toast).

BFF shapes: the canonical request/response contracts are in `../tenant-billing_API.md` §1 (`status` is `TRIALING|ACTIVE|PAST_DUE|SUSPENDED`, `suspensionReason`, money as `*Minor` integers, `GET /v1/billing/charges` uses limit/offset Pattern A pagination). Field names in the per-screen sections below are illustrative where they differ.
Charge status labels: PENDING "Pendente", PAID "Pago", OVERDUE "Vencida", FAILED "Falhou", CANCELED "Cancelada", REFUNDED "Reembolsada", CHARGEBACK "Chargeback". No refund UI (handled by the provider console).

## Screen 1 — Assinatura page, tabbed (`BillingPage` + `BillingTabs`) — manager-01-billing-active.html (Resumo tab, ACTIVE)
**Pattern (owner feedback, 2026-10-26):** one page "Assinatura" with 4 tabs **Resumo | Cobranças | Dados de cobrança | Cobrança automática**, built exactly like the service editor (`servicos/03-service-edit.html`): `.editor-tabs`/`.editor-tab`/`.editor-panel` + `showTab()` (EXISTS: reuse the tab component/pattern of `ServiceEditPage` and the hotsite editor; the billing content is GAP). Exactly ONE primary button per tab; destructive action = separate confirmation page (`manager-06-cancel-confirm.html`, like `03b-deactivate-confirm.html`). The former standalone screens (identity form, auto-billing) are now tabs; the files 02*/07* are the same page with that tab pre-selected. Mobile: short tab labels at <=480px ("Resumo", "Cobranças", "Dados", "Automática"), tab bar scrolls horizontally if needed.
**Component tree:** `BillingPage` (route `app/(dashboard)/billing/page.tsx`, thin; title row = "Assinatura" + status badge) -> `BillingTabs` -> `ResumoTab` (`SubscriptionSummaryCard`, `OpenChargeCard`, `FeatureLineItems`, footer links) | `CobrancasTab` (`ChargeHistoryTable`) | `DadosCobrancaTab` (`BillingIdentityForm`) | `CobrancaAutomaticaTab` (`AutoBillingCard`). All GAP; files under `apps/web/features/platform/components/billing/`.
**Props:** `BillingPage`: `summary: BillingSummary`, `initialTab?: 'resumo'|'cobrancas'|'dados'|'automatica'` (from `?tab=`). Tabs fetch lazily (React Query): Resumo = summary (needed for the title badge anyway), Cobranças = charges page, Dados = identity, Automática = `summary.autoBilling`.
**BFF per tab:** Resumo `GET /v1/billing/summary`, "Pagar agora" -> `POST /v1/billing/charges/:id/payment-link` -> `{ url }` then `window.location = url` (hosted page; never name the provider; no card form). Cobranças `GET /v1/billing/charges?limit=5&offset=…`. Dados `GET`/`PUT /v1/billing/identity`. Automática `POST`/`DELETE /v1/billing/auto-billing`.
**Resumo tab (this screen):** Situação card (valor mensal, próximo vencimento, forma de pagamento, cobrança automática with a text link that switches to that tab), Cobrança em aberto card, Seu plano (features + prices + total, "Não contratados" upsell rows, "Falar com a gente"). **Single primary button: "Pagar agora"**, rendered only when an open charge exists. On mobile the primary sits in a bottom `.form-actions` row and the low-emphasis footer links "Falar com a gente" / "Cancelar assinatura" (red text link -> manager-06) sit under it; on desktop both move into the action pane. Never two filled buttons.
**Cobranças tab:** history table (Vencimento / Referência / Valor / Situação; 2-line cards on mobile), includes REFUNDED and CHARGEBACK rows, pagination "1–5 de 8 cobranças" with Anterior/Próxima (clickable in this file: page 2 has 3 rows), footnote "Reembolsos e contestações são tratados pela nossa equipe…". No buttons other than the pager (secondary). Charge labels: PENDING "Pendente", PAID "Pago", OVERDUE "Vencida", FAILED "Falhou", CANCELED "Cancelada", REFUNDED "Reembolsada", CHARGEBACK "Chargeback"; no refund UI.
**Per-tab save:** only Dados saves (see Screen 11); switching tabs with unsaved Dados changes shows the amber dot on the tab label (same `.tab-dirty-dot` as the service editor).
**State machine (screen-level):** loading (01f) -> loaded | error (01g); status badge drives the Resumo variant: TRIAL (01b) / ACTIVE (01, 01h, 01j) / PAST_DUE (01c) / SUSPENDED+NON_PAYMENT (01d) / SUSPENDED+CANCELED (01e) / ACTIVE+cancelAt (06b); paying (01i).
**Action pane (same structure as `ServiceEditPage`):** `.detail-layout` = content column + 22rem `.detail-aside` (`position: sticky; top: 1.5rem`, shown at >= 1024px only). The aside `.card` holds: eyebrow "Assinatura" + status badge (same label as the title row: Em teste, Ativa, Em atraso, Suspensa, Cancelada/Cancelando), ONE full-width primary button for the CURRENT tab (label and target swap in `showTab()` via `updateAside(tab)`, like `saveTab(currentTab)`/`aside-save-btn`), tab-specific secondary buttons (Dados: "Cancelar"; Automática: red "Desativar" / "Cancelar tentativa"), a full-width secondary "Falar com a gente" in every state, a hint line, and a divider + red "Cancelar assinatura →" link to manager-06 (hidden when SUSPENDED, loading/error or already cancelling). Primary per tab: Resumo -> "Pagar agora" / "Reativar assinatura" / "Gerar novo link" by state (none in TRIAL and while reactivating: hint only); Cobranças -> none, hint "Esta aba é só leitura."; Dados -> "Salvar alterações" with the dirty-state hint; Automática -> "Ativar cobrança automática" / "Atualizar status" / "Tentar novamente". Below 1024px the aside is hidden and the in-page bottom `.form-actions` row carries the same single primary (hidden with `display:none !important` at >= 1024px, as in the service editor, together with the bottom `.foot-links`). So exactly one primary button is visible at any width. 01f keeps an aside with skeletons; 01g's aside primary is "Tentar novamente".
**Mobile:** bottom nav kept (top-level page); the former "Gerenciar" links are tabs and the actions live in the bottom row; buttons are never stretched on desktop except inside the aside card.

## Screen 2 — TRIAL (Resumo tab) — manager-01b-billing-trial.html
`ResumoTab` + `TrialNotice` (GAP). Blue alert "Faltam {n} dias do seu teste gratuito" (n = `trialEndsAt - today`), "Não pedimos cartão para testar", "Sobre a primeira cobrança" (amount + e-mail), plan with chatbot BASIC during the trial. **No open charge -> no primary button on the page.** Cobranças tab shows "Nenhuma cobrança ainda. A primeira aparece aqui no fim do teste." Cancel text link shown; per CAND-28 A3 a trial cancel is immediate (confirm screen 06 has no trial variant yet — not drawn).

## Screen 3 — PAST_DUE (Resumo tab) — manager-01c-billing-past-due.html
`ResumoTab` + `BillingStatusBanner` (GAP, also rendered on every other dashboard page while PAST_DUE — see manager-04b). Amber alert "Pagamento em atraso — faltam {n} dias para a suspensão" (n = days until `graceEndsAt` = due + 14), no button inside the alert. Single primary: "Pagar agora" in the "Cobrança em atraso" card. Full access in this state. Cobranças tab starts with the OVERDUE row.

## Screen 4 — SUSPENDED / NON_PAYMENT (Resumo tab) — manager-01d-billing-suspended.html
`ResumoTab` + `SuspendedGate` (GAP: dashboard layout guard redirects every route except `/billing`; STAFF see "Esta conta está suspensa. Fale com o gerente."). Sidebar and bottom-nav items rendered disabled (`aria-disabled`, no href); **the four tabs all stay usable** (this is the only reachable section). Card "Pague 1 mês para reativar" with single primary "Pagar agora" (open charge re-dated by the backend; no new charges while suspended; never "pague N meses"). Cobranças and Dados work normally; Cobrança automática shows "Disponível depois de reativar a assinatura" with its button disabled (decision to confirm). No cancel link; "Falar com a gente" always visible.

## Screen 5 — SUSPENDED / CANCELED (Resumo tab) — manager-01e-billing-suspended-canceled.html
Same gate and tab behaviour. Single primary "Reativar assinatura" -> `POST /v1/billing/reactivate` -> `{ url }` (1-month payment link) -> hosted page. Shows the clean-up policy: 180 days after suspension if the tenant ever paid (90 if never), purge date from `summary.purgeAt`, e-mails 30 and 7 days before.

## Screen 6 — Loading — manager-01f-billing-loading.html
Tab bar rendered immediately; every panel shows skeleton blocks (GAP: check `apps/web/shared/components/ui/` for a skeleton before building one). No buttons while loading.

## Screen 7 — Load error — manager-01g-billing-load-error.html
`ErrorAlert` (EXISTS, dashboard variant) inside each panel (the summary failed, so status is unknown) + retry (refetch both queries). Copy: "Não foi possível carregar sua assinatura" / "Tivemos um problema ao buscar os dados. Verifique sua conexão e tente novamente. Se continuar, fale com a gente." Primary "Tentar novamente"; secondary "Falar com a gente".

## Screen 8 — No charges (Cobranças tab) — manager-01h-billing-no-charges.html
Opens on the Cobranças tab. Empty history: "Nenhuma cobrança paga ainda" / "Assim que a primeira cobrança for paga, ela aparece aqui com a situação de cada pagamento. A cobrança em aberto está na aba Resumo." (`pagination.total === 0`). No primary button on this tab; Resumo still has "Pagar agora" for the first charge.

## Screen 9 — Payment received, reactivating (Resumo tab) — manager-01i-billing-payment-pending.html
Return from the hosted page while status is still SUSPENDED: blue alert "Pagamento recebido — reativando sua conta…" with secondary "Atualizar agora"; poll `GET /v1/billing/summary` every 5 s (stop on ACTIVE then router.refresh, or after ~60 s show "Ainda processando — atualize em instantes"). Charge card badge "Processando". No primary button. Nav stays disabled until ACTIVE; tabs still work.

## Screen 10 — Payment link expired (Resumo tab) — manager-01j-billing-payment-link-expired.html
When `openCharge.paymentLinkExpiresAt < now`: amber alert "O link de pagamento expirou"; the single primary becomes "Gerar novo link" (`POST /v1/billing/charges/:id/payment-link`). Open question: the backend could always generate on click, making this state only a fallback.

## Screen 11 — Dados de cobrança tab, BR (`DadosCobrancaTab` / `BillingIdentityForm`) — manager-02-billing-identity-br.html
Opens on the Dados de cobrança tab (same page as Screen 1). **File:** `BillingIdentityForm.tsx` (GAP; reuse `Input`/`Label` primitives). **BFF:** `GET /v1/billing/identity` (prefill on tab open), `PUT /v1/billing/identity` (save).
Body: `{ taxIdType?: CNPJ|CPF, taxId?, legalName?, billingEmail?, address?: { zip, street, number, complement, district, city, state } }` — everything optional; empty billing e-mail falls back to manager e-mails.
| Field | Rule | Error message |
|---|---|---|
| taxId (CNPJ) | optional; if present, 14 digits + valid check digits | "CNPJ inválido. Confira os 14 dígitos." |
| taxId (CPF) | optional; if present, 11 digits + valid check digits | "CPF inválido. Confira os 11 dígitos." |
| billingEmail | optional; if present, valid e-mail | "Informe um e-mail válido, por exemplo nome@empresa.com.br." |
| zip | optional; 8 digits | "CEP inválido." |
| state (UF) | optional; 2 letters | "UF inválida." |
**Actions:** desktop: action pane (primary "Salvar alterações" + secondary "Cancelar"); mobile: `.form-actions` at the bottom of the tab: secondary "Cancelar" (reverts to the loaded values) + the page's single primary **"Salvar alterações"** (saves only this tab, one endpoint). **States:** idle -> dirty (amber dot on the tab) -> submitting (button "Salvando…", disabled) -> saved (02d) / validation error (02b, 422 re-renders the whole form; network error: "Não foi possível salvar. Tente novamente.").

## Screen 12 — Dados validation error — manager-02b-billing-identity-br-erro.html
Dados tab; whole form shown; invalid CNPJ and invalid e-mail highlighted; red alert at the top of the tab "Corrija os 2 campos destacados para salvar" / "CNPJ e e-mail de cobrança."; amber dirty dot on the tab label.

## Screen 13 — Dados, US — manager-02c-billing-identity-us.html
Same tab, `country = US`: no CNPJ/CPF and no type selector; "Identificação fiscal (opcional)" free text (no format validation; hint "Texto livre; não validamos o formato."); address fields State + ZIP code. Labels come from the tenant locale in production (prototype keeps pt-BR; tenant name "Sunrise Auto Spa" is illustrative, the shell stays as-is).

## Screen 14 — Dados saved — manager-02d-billing-identity-saved.html
Inline green alert at the top of the tab "Dados de cobrança salvos" / "Atualizamos as informações. Elas valem para as próximas cobranças." No floating toast; the form stays with saved values.

## Screen 15 — Cancel confirm (`CancelSubscriptionConfirm`) — manager-06-cancel-confirm.html
**Standalone confirmation page** (not a tab), same pattern as `03b-deactivate-confirm.html`; reached only from the red text link "Cancelar assinatura" on the Resumo tab. **File:** GAP, `detail-layout` confirmation pattern. **BFF:** `POST /v1/billing/cancel` (no body) -> updated summary (`cancelAt` = end of paid period).
Copy blocks: "Quando termina" (access until {cancelAt}), "Reembolso: Nenhum valor será reembolsado", "E os seus dados?" (180/90 days, apagados definitivamente, avisos 30 e 7 dias, reativar pagando 1 mês). Buttons: danger "Cancelar assinatura" + secondary "Voltar" (to the Resumo tab). States: idle -> submitting ("Cancelando…") -> 06b / 06c.

## Screen 16 — Cancel scheduled (Resumo tab) — manager-06b-cancel-scheduled.html
`ResumoTab` for ACTIVE with `cancelAt`: grey alert "Cancelada — acesso até 10/11/2026" with the single primary **"Reativar assinatura"** (`POST /v1/billing/reactivate`; while the paid period is still running it just un-schedules the cancel, no payment — open question for backend: returns `{}` instead of a link). Situação card "Acesso até" / "Próxima cobrança: Nenhuma". Cancel link hidden; badge "Cancelando" (title row and pane). Other tabs work as usual.

## Screen 17 — Cancel error — manager-06c-cancel-error.html
Standalone confirmation page with a red alert "Não foi possível cancelar a assinatura" / "Algo deu errado do nosso lado e nada foi alterado. Tente novamente em instantes; se persistir, fale com a gente." The danger button becomes "Tentar novamente".

## Screen 18 — Cobrança automática tab, inactive (`CobrancaAutomaticaTab` / `AutoBillingCard`) — manager-07-auto-billing-activate.html
Opens on the Cobrança automática tab. **BFF:** `POST /v1/billing/auto-billing` body `{ method: CARD|PIX_AUTOMATIC }` -> `{ authorizationUrl }` then redirect to the hosted page. Status card "Desativada", method options (radio cards "Cartão de crédito" / "Pix Automático"), "O que vai acontecer" steps. Copy never names the provider; no card inputs in-app. Manual payment link remains valid. **Single primary: "Ativar cobrança automática"** in `.form-actions`. In SUSPENDED the tab shows a grey notice and the button is disabled.

## Screen 19 — Cobrança automática active — manager-07b-auto-billing-active.html
Green alert "Cobrança automática ativada" (inline, after returning from the provider) + status "Cartão final 4242" (or "Pix Automático ativo"), next charge. **No primary button**; only the secondary red "Desativar" -> `DELETE /v1/billing/auto-billing` (open question: add a confirm step; drawn as a direct action). The Resumo tab of this file shows "Cobrança automática — cartão final 4242".

## Screen 20 — Cobrança automática pending — manager-07c-auto-billing-pending.html
`autoBilling.status = PENDING_AUTHORIZATION`: amber alert with spinner "Aguardando a confirmação da autorização", status badge "Pendente". Single primary "Atualizar status" + secondary red "Cancelar tentativa" (`DELETE`); retrying authorization = cancel the attempt, then "Ativar cobrança automática" again. Manual link keeps working.

## Screen 21 — Cobrança automática error — manager-07d-auto-billing-error.html
Red alert "Não foi possível iniciar a autorização" / "O parceiro de pagamento não respondeu. Nada foi alterado. Tente novamente; se a autorização for recusada, tente outro cartão ou o Pix Automático." Method options kept; single primary "Tentar novamente". Covers both a 5xx on POST and a declined authorization on return.

## Known limitations / notes for the lead
- "Falar com a gente" links to `journeys/shared/hotsite.html` as a stand-in for Ikaro's own booking page.
- Disabled nav items in suspended screens are intentionally `href="#"` + `aria-disabled`.

---

# Dev-notes fragment B — enforcement states and changed screens

Merged by the lead into `dev-notes.md`; all copy is pt-BR, all data is invented. Common to every screen below:
`GET /v1/billing/access -> { status, suspensionReason, features: [{ key, tier }] }` is the single input. A feature absent from `features` is locked. `status` SUSPENDED (reason NON_PAYMENT or CANCELED) locks the tenant out identically; screens never branch on the reason except the billing page.

Open points for the lead:
- Sibling link target used for "Ver cobrança / Pagar agora / Ver minha assinatura / Cobrança": `manager-01-billing-active.html` (rename here if the billing fragment uses another file name).
- "Falar com a gente" points to a fictional URL (`https://ikaro.example/ikaro/booking`, Ikaro's own booking page). It is shown on the manager locked screens only; omitted on staff / customer / public screens (those users are not the payer and the public page is reason-neutral). Confirm.
- The brief says "Login da equipe" for the hotsite top bar; the real `HotsiteAuthBar` label is "Área da Equipe". The real label is kept.
- `GET /v1/billing/access` is manager/staff-scoped; customers and anonymous visitors need a reduced projection (only an `active` boolean, no reason). Not in the BFF contract above, flagged as GAP.

---

## Screen 1 — Configurações, Chatbot não contratado (`SettingsForm` Chatbot section + `FeatureLockedCard`)

File: `manager-03-locked-feature.html` — Status: `SettingsForm` EXISTS (Chatbot section is a GAP in journeys 01d); `FeatureLockedCard`, `DashboardSidebar`/bottom-nav lock state = GAP.
Props: `feature: 'CHATBOT'`, `tier?: 'BASIC'|'PLUS'` (copy mentions tiers), `lockedFeatures: FeatureKey[]` on sidebar/bottom nav.
BFF: `GET /v1/billing/access`. No settings write while locked; stored `chatbot.*` settings are kept untouched.
Behaviour: locked sidebar / bottom-nav entries keep their real href and show a padlock (never hidden); the Fidelidade entry here points to screen 2. Chatbot form fields are not rendered while locked.
States: loaded-locked (this file); loading = existing skeleton of the page; load-error = existing `ErrorAlert` with retry; entitled = existing Chatbot section (journeys 01d).
Copy: "Recurso não contratado", badge "Não contratado", "Suas configurações foram mantidas.", "Falar com a gente", "Ver minha assinatura".
Mobile: padlock on the tab icon; card stacks icon above text; "Mais" sheet unchanged.

## Screen 2 — Recurso bloqueado por URL direta (`FeatureLockedPage`)

File: `manager-03b-locked-feature-direct-url.html` — Status: GAP.
Props: `feature: FeatureKey`. Rendered by the route guard of each feature route (HTTP 200 with the upsell, not 404 or redirect); API calls for the feature are rejected by the backend (403 `FEATURE_NOT_ENTITLED`).
BFF: `GET /v1/billing/access`.
States: loaded-locked (this file); loading / load-error as for any dashboard route.
Copy: "Recurso não contratado", "Seus clientes e pontos já registrados foram mantidos…", "← Voltar à Agenda".
Mobile: single column; aside note collapses (desktop aside only, per `detail-layout`).

## Screen 3 — Agenda com banner de teste (`SubscriptionBanner`)

File: `manager-04-dashboard-trial-banner.html` — Status: GAP (banner); Agenda page EXISTS.
Props: `status: 'TRIAL'`, `daysLeft: number`, `trialEndsAt: string`. Manager-only; mounted once in the dashboard shell above `<main>`; not dismissible. Sidebar gains manager-only "Cobrança".
BFF: `GET /v1/billing/access` (+ dates from the billing subscription read in the billing fragment).
States: shown while status = TRIAL; hidden for ACTIVE; load-error of the banner fails silent (no banner), never blocks the page.
Copy: "Faltam 9 dias do seu teste." / "Ver cobrança". Singular "Falta 1 dia", last day "Seu teste termina hoje".
Mobile: banner wraps, button below text.

## Screen 4 — Agenda com banner de pagamento em atraso

File: `manager-04b-dashboard-past-due-banner.html` — Status: GAP (same `SubscriptionBanner`, `status: 'PAST_DUE'`, props `dueDate`, `graceEndsAt`, `amount`).
Full access; nothing locked. Copy: "Pagamento em atraso." + amount and dates + "Pagar agora" (opens the provider's hosted page from the billing page; no provider name in UI). Role `alert` (amber).
After payment the banner disappears immediately; a short "pagamento recebido, reativando" state belongs to the billing page.

## Screen 5 — Editor do hotsite: módulo Chamada para teste grátis (`TrialSignupCtaConfigPanel`)

File: `manager-05-hotsite-editor-trial-cta.html` — Status: GAP. Mirrors `ChatbotConfigPanel` / hero panel (same `ModuleConfigPanelProps`).
Availability: module offered only when tenant slug = `ikaro`.
BFF: `PATCH /v1/tenants/hotsite` (module data).
Fields and validation:

| Field | Rule | Error copy |
|---|---|---|
| `title` | required, trimmed, 1-80 chars | "Informe o título." / "O título pode ter no máximo 80 caracteres (você digitou N)." |
| `description` | optional, max 200 chars | "A descrição pode ter no máximo 200 caracteres." |
| `buttonLabel` | required, 1-30 chars | "Informe o texto do botão." / "O texto do botão pode ter no máximo 30 caracteres." |
| `layout` | `CENTERED` \| `LEFT`, default CENTERED | — |
| `background` | `PRIMARY` \| `SECONDARY` \| `NONE`, default PRIMARY | — |
| `enabled` | boolean, default true | — |

Button target is fixed to `/ikaro-trial` (not editable). Edits go to the draft; publishing is the existing hotsite publish flow.
States: default (this file); validation (screen 6); submitting = "Aplicar" disabled with spinner label "Aplicando…"; submission error = inline red banner "Não foi possível aplicar as alterações. Tente novamente." above the form; success = returns to the editor with the existing inline confirmation.
Mobile: fixed action bar above the bottom nav (`bottom: 3.75rem`, main `padding-bottom: 9rem`); desktop uses the aside.

## Screen 6 — Painel TRIAL_SIGNUP_CTA com erros

File: `manager-05b-hotsite-editor-trial-cta-validation.html` — Status: GAP (same component).
Whole panel shown; invalid fields only highlighted: title over 80 chars (counter `105/80`), empty button label. "Aplicar" disabled until fixed; aside shows the summary error. Server 422 re-renders the same state.

## Screen 7 — Aviso de conta suspensa (staff) (`TenantSuspendedNotice`)

File: `staff-01-suspended-notice.html` — Status: GAP. Visual base: staff login card (`app/dashboard/login/page.tsx`).
Props: `role: 'STAFF'`. Rendered by `app/dashboard/layout.tsx` for role STAFF when status = SUSPENDED (managers get the billing page instead). No nav, no data fetching; API answers 403 `TENANT_SUSPENDED`.
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
Backend: `GET /v1/bookings/:id` -> 403 `TENANT_SUSPENDED` for non-terminal bookings; terminal ones still open.
Copy: "Este agendamento não pode ser aberto agora", "Esta empresa está inativa no momento, por isso os detalhes de agendamentos em aberto não estão disponíveis.", "Voltar para Agendamentos". New error code needs translation in both `errors.json` locales.
Mobile: drill-down page, bottom nav hidden.

## Screen 10 — Novo agendamento bloqueado

File: `customer-01c-new-booking-blocked.html` — Status: GAP (variant of `BookingBlockedNotice`), booking route EXISTS.
Backend: `POST /v1/bookings` -> 403 `TENANT_SUSPENDED`.
Copy: "Esta empresa não está aceitando agendamentos no momento", "Voltar para minha conta".

## Screen 11 — Hotsite: Página não publicada (`Unavailable`)

File: `public-01-page-not-published.html` — Status: EXISTS, new copy variant (`apps/web/shells/hotsite/components/Unavailable.tsx` currently "Em breve"); `HotsiteAuthBar` EXISTS unchanged.
BFF: `GET /v1/public/platform/manifest/:slug` (unavailable manifest); no billing detail exposed publicly.
Copy: "Página não publicada", "Esta página não está disponível no momento. Volte em breve." Reason-neutral. Top bar keeps "Área da Equipe" and "Entrar".
Background painted with `var(--ba-background)` (hotsite full-page rule).

---

## Screen public-02 — Ikaro hotsite with trial CTA (`TrialSignupCtaModule`)

**File:** `apps/web/features/platform/components/hotsite/modules/TrialSignupCtaModule.tsx` (GAP; mirrors `BookingCtaModule`). Hero, booking CTA and `HotsiteAuthBar` EXIST.
**Props:** `{ title: string; text: string; ctaLabel: string }` (module config, only present in the manifest of tenant slug `ikaro`). Button links to `/ikaro-trial`.
**BFF call:** `GET /v1/public/platform/manifest/ikaro` (existing; new module type `TRIAL_SIGNUP_CTA`).
**States:** static. **Mobile:** sections stack, buttons centered, not full width on desktop.
**Open question:** how the module is restricted to slug `ikaro` (manifest-only vs. hard check) is a backend decision.

## Screen public-03 / 03b / 03c / 03d — /ikaro-trial details (`IkaroTrialDetailsPage`, `PriceTable`)

**File:** `apps/web/app/ikaro-trial/page.tsx` (GAP; keep thin, logic in `shared/lib`). Table rows built from the price list; feature texts are i18n keys (both locales).
**Props:** `{ country: 'BR'|'US' }` (switch state, default from browser locale, BR if unknown).
**BFF call:**
```
GET /v1/public/billing/prices?country=BR|US   (@Public)
  Response: { country, currency, items: [{ feature, tier: 'BASIC'|'PLUS'|null, monthlyPriceCents }] }
```
**States:** loading (03c, skeleton rows) -> ok (03/03b) / error (03d).
**Decision (03d):** prices are informational, so a load failure does NOT block signup. The warning explains this and offers retry; "Começar teste grátis" stays enabled.
**Error copy:** "Não foi possível carregar os preços agora." / "Tentar novamente".
**Notes:** CHATBOT shows BASIC and PLUS prices (PLUS price is invented here: R$ 79,00 / US$ 19.00; real values come from the price list). Dependency hints ("Requer Agendamento") come from the closed dependency map. Annual billing and coupons are out of scope. Money: `R$ 49,00` (pt-BR) / `US$ 12.00`. Mobile: table stays a single column of rows, switch above it.

## Screen public-04 / 04b / 04c — Turnstile + Google step (`SignupGoogleStep`)

**File:** `apps/web/app/ikaro-trial/entrar/page.tsx` (GAP). Google button follows the existing OAuth pattern (`/api/auth/google?redirect=...`) with a signup intent that creates no tenant.
**Props:** none. Turnstile token held in client state, sent later in the tenant creation call.
**BFF call:** `GET /v1/public/signup/session` after the OAuth callback -> `{ email, name, trialAlreadyUsed }`.
**States:** idle (Google button enabled only after Turnstile passes) -> 04b Turnstile failed (button disabled, retry link) / 04c trial already used (`trialAlreadyUsed`).
**Error copy:** 04b "Não foi possível verificar que você é uma pessoa." ; 04c "Você já tem um teste ativo" + "Falar com a gente" (Ikaro booking page) + "Entrar na minha conta".
**Mobile:** single column, Turnstile widget 20rem max.
**Open question:** the "session" endpoint name implies a short-lived signup cookie set by the OAuth callback; confirm it is httpOnly and bound to the Google account.

## Screen public-05 / 05b-05f — Signup form (`SignupForm`)

**File:** `apps/web/features/platform/components/signup/SignupForm.tsx` (GAP). Use primitives from `apps/web/shared/components/ui/` (verify exact names); `SlugInput` with live availability is new.
**Props:** `{ googleName: string; googleEmail: string }` (read-only, from the session).
**BFF calls:**
```
GET  /v1/public/signup/slug-availability?slug=    -> { available, reason?: 'TAKEN'|'RESERVED'|'INVALID' }  (debounced ~400ms)
POST /v1/public/signup/tenant
  Body: { businessName, slug, countryCode: 'BR'|'US', language: 'pt-BR'|'en', acceptedTermsVersion, turnstileToken }
  Response 201: { tenantSlug }  (sets the manager JWT cookie)
```
**Validation:**
| Field | Rule | Error message |
|---|---|---|
| businessName | required, max 100 | "Informe o nome do negócio." |
| slug | 3-30 chars, a-z 0-9 hyphen, no leading/trailing hyphen | "Use de 3 a 30 letras minúsculas, números e hífens, sem hífen no início ou fim." |
| slug | reserved word (admin, api, www...) | "Este endereço é reservado. Escolha outro." |
| slug | taken | "Este endereço já está em uso. Tente outro, por exemplo lavacar-beloauto-sp." |
| countryCode | required BR or US | "Selecione o país." |
| language | pt-BR or en (defaults from country) | -- |
| terms | must be checked; version recorded | "Aceite os Termos de Uso e a Política de Privacidade para continuar." |
**States:** idle -> checking slug -> ok/taken (05b); submit -> submitting (05d) -> redirect to welcome / validation error 422 (05c, whole form, worst case: reserved slug "admin", empty name, no country, terms unchecked) / 429 (05e) / 5xx (05f).
**Error copy:** 05e "Muitas tentativas. Por segurança, aguarde alguns minutos antes de tentar de novo." ; 05f "Não conseguimos criar sua conta. Nada foi criado, então você pode tentar de novo com segurança." (creation is a single transaction, retry safe).
**Notes:** slug and country are immutable after creation (hint shown). URL preview uses `ikaro.app/{slug}` (illustrative domain). Desktop buttons are inline, not stretched. Bot Turnstile token is single-use; after a failed submit the page must re-request a token.

## Screen public-06 — Welcome (`TrialWelcomePage`)

**File:** `apps/web/app/ikaro-trial/bem-vindo/page.tsx` (GAP).
**BFF call:** `GET /v1/billing/subscription` -> `{ status: 'TRIAL', trialEndsAt, features }` (authenticated as the new manager).
**States:** success only (loading/error fall back to a generic "Seu teste começou" without the date; the button still works).
**Copy:** "Seu teste de 14 dias começou"; checklist "Publicar seu site", "Cadastrar seus serviços", "Definir seus horários"; button "Ir para o painel". Chatbot note: BASIC tier during trial.
**Mobile:** single column; button not full width on desktop.

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
