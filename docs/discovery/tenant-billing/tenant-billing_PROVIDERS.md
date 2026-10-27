# Discovery: Tenant Billing — Provider Facts, Account Opening and Launch Gates

**Status:** Discovery — research record (2026-10-27). Facts below were read from official provider documentation by two research passes. Labels: **V** = stated in official docs, **I** = inferred (not stated outright), **NF** = not found. Page text came through a summarizing fetch tool, so quotes are paraphrases; **anything that decides money or tax is re-confirmed in the real account/sandbox before activation (§5).**

**Companion docs:** `tenant-billing.md` (rules, decisions 36–37, 56–62) · `tenant-billing_API.md` §7 (provider port) · `tenant-billing_DATA_MODEL.md`.

## 1. Asaas (BRL) — verified facts and the design they drive

| # | Fact | Source / label | Design consequence |
|---|---|---|---|
| A1 | Payment events by method: **Pix** on time `PAYMENT_RECEIVED` only (overdue: `PAYMENT_OVERDUE` → `PAYMENT_RECEIVED`); **boleto** `PAYMENT_CONFIRMED` → `PAYMENT_RECEIVED`; **card** `PAYMENT_CONFIRMED`, then `PAYMENT_RECEIVED` about 32 days later. `PAYMENT_CONFIRMED` is **not** emitted for Pix | docs.asaas.com/docs/webhook-para-cobrancas — V | The paid signal is "first of `CONFIRMED` or `RECEIVED` for the charge" (idempotent, second is a no-op). The earlier rule "only `CONFIRMED` restores access" would have locked out every Pix payer. |
| A2 | Customer creation requires `name` and **`cpfCnpj`**; `email` is optional. A payment requires `customer`, `billingType`, `value`, `dueDate`. No account setting making `cpfCnpj` optional was found | docs.asaas.com/reference/criar-novo-cliente — V; setting — NF | BR tax ID is required to charge. Collected at signup for BR (decision 57); R5 amended. |
| A3 | `billingType = UNDEFINED` lets the payer choose card, Pix or boleto on the hosted invoice (`invoiceUrl`) | docs.asaas.com/reference/criar-nova-cobranca — V | Ikaro always creates charges as `UNDEFINED`. |
| A4 | `invoiceUrl` expiry: NF. Pix QR code expires 12 months after due date (payable after due date). Boleto registration is auto-cancelled after due date (the charge is not removed; number of days NF). Card after due date: NF. A due-date/value change emits `PAYMENT_UPDATED`; delete/restore events exist | docs.asaas.com/docs/cobrancas-via-pix — V / I | An overdue charge stays payable by Pix; boleto may not be. The recovery-charge due date uses `RECOVERY_CHARGE_DUE_DAYS` (default 7) and link regeneration returns the same `invoiceUrl`; boleto-after-due behaviour is a launch gate (§5). |
| A5 | Interest and fine are optional per charge; omit them to keep account defaults | criar-nova-cobranca — V | Ikaro sends neither; the tenant owes the list price only (no late fee in v1). |
| A6 | Subscription charges are created **40 days** before due by default (14 or 7 configurable); only payment webhooks exist (no subscription events) | docs.asaas.com/docs/faq-assinaturas — V | Ikaro does **not** use provider subscriptions; it issues its own charges (R9 and CAND-08 unchanged). |
| A7 | A card token can replace card data on `POST /v3/payments`, but it comes from `POST /v3/creditCard/tokenizeCreditCard`, which **receives the card number and holder data through the caller's server**, needs `remoteIp`, and in production needs account enablement. A hosted tokenization flow: NF | docs.asaas.com/docs/tokenizacao-de-cartao-de-credito — V | Card auto-billing would put card data on Ikaro's servers (PCI scope), contradicting R1. **Dropped from v1** (decision 58). |
| A8 | Pix Automático: needs a **PJ** account, approved, active CNPJ **6+ months**, no Pix restrictions. Authorization is hosted: the first payment's QR code carries the authorization; it becomes ACTIVE only after the payer's bank confirms. `paymentCreationMode MANUAL` (our app creates each charge referencing the authorization) or `SUBSCRIPTION`; `retryPolicy ALLOW_THREE_IN_SEVEN_DAYS`. Minimum days to create a charge before due: NF | docs.asaas.com/docs/pix-automatico, /faq-2 — V | v1's only auto-billing mode, `MANUAL` creation, released after sandbox/production verification. Ikaro opens the account as PJ (decision 61). |
| A9 | Webhook: header `asaas-access-token` carries the configured `authToken` (32–255 chars, not an API key); **at-least-once**; `id` is the unique event id; queue pauses after **15 consecutive failures**; events kept **14 days**; only an HTTP **200** counts as success (201/204/3xx fail, no redirect followed); about 10 s timeout and at most 10 webhooks per account (summary-level, I). Official IP list: referenced but not listed (NF). Retry interval schedule: NF | docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook, /fila-pausada — V | The webhook returns exactly `200` after the transaction commits, nothing else. Authenticity relies on the token (timing-safe compare); no IP allowlist. |
| A10 | Asaas sends its own notifications to the payer (email/SMS/WhatsApp) and **charges fees per notification**; `notificationDisabled = true` on the customer disables charge notifications | docs.asaas.com/docs/notificacoes, /alterando-notificacoes-de-um-cliente — V | Ikaro creates every customer with `notificationDisabled = true` and sends **all** billing emails itself (decision 59); no "dropped if the provider emails" conditional remains. Whether this also suppresses paid receipts is a launch gate. |
| A11 | Refund: `POST /v3/payments/{id}/refund`, optional `value` for a partial refund (card and Pix); events `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_REFUND_DENIED` (boleto). Chargeback events: `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`. Which event marks a **lost** dispute: NF | docs.asaas.com/reference/estornar-cobranca — V | Normalizer maps: `REFUNDED` → full refund, `PARTIALLY_REFUNDED` → partial, `CHARGEBACK_REQUESTED` → dispute opened (no access change). The event that finalizes a lost chargeback is a launch gate. |
| A12 | Sandbox `https://api-sandbox.asaas.com/v3` (production `https://api.asaas.com/v3`): separate accounts and keys, auto-approved, partial feature parity; `POST /v3/sandbox/payment/{id}/confirm` simulates payment; an overdue-forcing action exists | docs.asaas.com/docs/sandbox — V | Per-PR tests use the fake; the sandbox runs in staging and in the nightly contract job (§6); interest/fine on boleto/Pix are untestable there. |
| A13 | API key: generated in the web UI after the account is fully approved; max 10 keys; shown once. Rate limit 25,000 requests per 12 h per account, max 50 concurrent GETs, HTTP 429. No separate production-approval step found (token feature excepted) | central.ajuda.asaas.com, docs.asaas.com/reference/rate-e-quota-limit — V | Billing crons batch and respect 429; reconcile is a daily job, not a per-request poll. |
| A14 | Fees (public page, confirm in the account): no monthly fee; Pix received R$ 1,99 (promo R$ 0,99 for 3 months); boleto received R$ 1,99 (promo R$ 0,99); card single payment R$ 0,49 + 2,99% (promo 1,99%); NFS-e R$ 0,49 per note | asaas.com/precos-e-taxas — V | Ikaro absorbs fees (decision list); on the cheapest BR plan (HOTSITE R$ 49) fees are about 4%/2% (card/Pix). Minimum charge R$ 5 (help center, I) is never reached because HOTSITE is mandatory. |
| A15 | NFS-e can be emitted automatically with the charge; needs a **PJ** account, municipal registration and prefeitura homologation (MEI and national-portal emitters exempt), a registered service, and the payer's full data (name, valid CPF/CNPJ, email, address with CEP) | central.ajuda.asaas.com, docs.asaas.com/docs/faq-de-notas-fiscais — V | NFS-e stays out of v1 (non-goal), but the BR identity fields (tax ID now required, address optional) already match what a later NFS-e story needs. |
| A16 | Card charges settle about 32 days after confirmation; boleto/Pix faster | A1 — V | Cash-flow note for the owner, no design effect. |
| A17 | Per-charge limit PF R$ 50k, PJ R$ 500k (help center) | I | Irrelevant at our price levels. |

## 2. Stripe (USD) — verified facts and the design they drive

| # | Fact | Source / label | Design consequence |
|---|---|---|---|
| S1 | Brazil is a supported country with open sign-up; Brazil accounts settle in **BRL** and pay out to a Brazilian bank; USD balances/payouts (multi-currency settlement) are not available for Brazil; foreign-currency charges are converted to BRL (FX fee: NF). Home country cannot change after activation. Initial card settlement 30 days (5 for international) | stripe.com/global, docs.stripe.com/payouts, /payments/currencies/settlement-payouts, /get-started/account/activate — V | Decision 60: first US account is the Brazilian CNPJ account, cards only. USD presentment to US cards, the FX spread and payout timing are launch gates. |
| S2 | Brazil pricing page: domestic card 3,99% + R$ 0,39, **+2% for international cards**, dispute R$ 55, Pix 1,19% (invitation only), boleto R$ 3,45. US pricing (2.9% + 30c, ACH, dispute) could not be read (geo-redirect) | stripe.com/br/pricing — V (BR only); US — NF | US-card cost to Ikaro is roughly the domestic rate + 2% + FX; treat as about 6%+ until confirmed. Price list for US must absorb it. |
| S3 | **ACH Direct Debit is not available to Brazil merchants** (US, EU/EEA/UK are); an Atlas Delaware C-corp/LLC (US$ 500 + US$ 100/yr) gets USD settlement, ACH and needs a **new** Stripe account | docs.stripe.com/payments/ach-direct-debit, stripe.com/atlas — V | v1 US collects by card only. Atlas is a later, separate decision if ACH or USD payouts matter. |
| S4 | Stripe Tax: **only calculates tax in jurisdictions where the account is registered** (add registrations in the Dashboard); with none, the calculation returns zero tax. Stripe monitors thresholds and alerts. It does **not** file/remit (Tax Complete adds "register for me" and filing). The name "Basic" no longer appears in the docs. Pricing: 0.5% per transaction on Billing/Invoicing/Checkout, only where registered; API-only integrations US$ 0.50 per transaction in registered jurisdictions | docs.stripe.com/tax/set-up, /tax/standalone-tax-api, stripe.com/tax/pricing — V | Decision 37 reworded: "Stripe Tax" via invoice `automatic_tax`, no "Basic". At launch Ikaro may have no US registration (and, as a small foreign seller, likely no nexus) → tax is zero and the code is already tax-ready. **The registration decision is the accountant's (gate §5).** |
| S5 | Customer location for tax: minimum is a **5-digit US postal code**; country + state alone is **not** supported; a full address is recommended and ZIP-only is discouraged in AL, AK, AZ, AR, CA, CO, IL, KS, LA, MO, NE, NM, ND, OK, SD, TX, UT, WA, WV. A standalone invoice without a valid location stays **draft** (`invoice.finalization_failed`) | docs.stripe.com/tax/customer-locations — V | Decision 39 revised: US managers give the full address (street, city, state, ZIP) before the first paid selection. Ikaro never relies on ZIP alone. |
| S6 | Best hosted object for our model: **Invoices**. Created via API with our own line items (`tax_code` `txcd_10103001` SaaS business use), `automatic_tax.enabled`, `collection_method = send_invoice` or `charge_automatically`; hosted page `hosted_invoice_url` (expires 30 days after due, never beyond 120; recovery page re-emails a fresh link); Smart Retries apply to one-off invoices (a Billing feature). Subscriptions/Billing would duplicate our price list and entitlement. Billing fee 0,7% / Invoicing 0,4% on the BR page | docs.stripe.com/invoicing/hosted-invoice-page, /tax/invoicing, /billing/revenue-recovery/smart-retries — V | `StripeBillingProvider` creates **one finalized invoice per Ikaro charge**. Tax is computed by Stripe at finalization, so the provider call returns the tax breakdown (see "Tax in the port" below). Customer emails from Stripe are switched off in the Dashboard; Ikaro sends its own (decision 59). |
| S7 | Webhooks: `invoice.paid`, `invoice.payment_failed`, `invoice.finalized`, `invoice.finalization_failed`, `charge.refunded`, `charge.dispute.created/closed/updated`, `refund.updated/failed`. `Stripe-Signature` (t, v1 HMAC-SHA256, 5 min tolerance, raw body). Retries up to **3 days** (live). **Ordering is not guaranteed**, duplicates possible, dedupe by event id and refetch the object | docs.stripe.com/webhooks — V (a few names I) | Same normalized events as Asaas; the adapter re-reads the invoice before applying; out-of-order handling already exists (CAND-09 A3). |
| S8 | Sandbox and test clocks exist (test clocks cover Billing objects; whether they advance standalone invoices: NF); Tax API in sandbox is limited | docs.stripe.com/billing/testing/test-clocks — V | Stripe E2E tests drive invoices directly and fire webhooks with the CLI; the US launch is gated on a real-account check. |
| S9 | Hosted pages keep card data off Ikaro's servers (PCI Level 1 provider; low-risk integration), annual attestation still required | docs.stripe.com/security/guide — V; "SAQ A" label — NF | Consistent with R1. |
| S10 | Economic nexus: most states about US$ 100,000 or 200 transactions in 12 months (CA and TX US$ 500,000) per Stripe's guide; foreign sellers of services can still owe tax | stripe.com/guides/introduction-to-us-sales-tax-and-economic-nexus — V | Business/tax decision; the design only guarantees tax can be switched on without code change (S4). |

### Tax in the port (design change forced by S4–S6)

Stripe computes tax when the invoice is finalized, not before. The earlier design (a separate `TaxCalculationPort` call before inserting the charge) is **replaced**: the provider's `createCharge` receives the lines, the customer location and the catalog `taxBehavior`, and returns `{ providerChargeId, paymentUrl, expiresAt, totalMinor, tax: { totalTaxMinor, lines[], providerCalculationId? } }`. For a tax-exclusive (US) charge Billing inserts the charge locally with `subtotal_minor` and `provider_creation_status = PENDING`, calls the provider outside the transaction, then writes `tax_amount_minor`, `amount_minor` and `charge_tax_lines` **once**, together with `provider_creation_status = READY`; the manager is emailed only after that. Tax-inclusive (BR) charges have `tax_amount_minor = 0` and `amount_minor = subtotal_minor` at insert. This removes one port, one adapter and one failure mode, and matches the provider's own recorded tax transaction.

## 3. Entity and account decisions (2026-10-27)

| Decision | Result |
|---|---|
| Asaas account owner | Ikaro as **PJ with a CNPJ active 6+ months** (eligible for Pix Automático and NFS-e) |
| Stripe account (first US) | The **same Brazilian CNPJ**, cards only, BRL payouts. Atlas/US entity only if ACH or USD payouts become necessary |
| Billing identity | BR: CPF/CNPJ required at signup; US: full address before the first paid selection |
| Card auto-billing | Not in v1 (needs card data through our server) |
| Provider emails | Off. Ikaro sends every billing email |

## 4. Open the accounts: checklist

**Asaas (PJ, production + sandbox)**
1. Sandbox account first (auto-approved): create the API key, a webhook with an `authToken`, run the §5 Asaas checks.
2. Production account as PJ: CNPJ, activity and revenue data, representative documents/selfie; wait for approval (API key requires full approval).
3. Request: Pix Automático enablement, confirmation of contracted fee table (Menu > Taxas), notification fees.
4. Keep for Ikaro: production API key and webhook token go to Secret Manager as `ASAAS_API_KEY` and `ASAAS_WEBHOOK_TOKEN` (sandbox pair separately); never commit them.

**Stripe (Brazilian CNPJ account)**
1. Register with country BR (home country is permanent); activate the account.
2. Ask support the §5 Stripe questions before any build.
3. Dashboard: turn off customer emails for invoices/receipts, enable the customer portal for card updates only, create the webhook endpoint (signing secret to Secret Manager), enable Stripe Tax and add registrations only if the accountant says so.
4. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (test and live separately).

## 5. Launch gates (verify in the real account; none blocks promotion, each blocks activation of its provider)

**Asaas**
1. `invoiceUrl` validity after due date, after cancel and after paid; boleto auto-cancel days; whether a card payment is possible after due date.
2. Webhook payment object fields (`externalReference`, `billingType`, `status`, `netValue`), retry interval schedule, official IP list.
3. `externalReference` maximum length (we send the Ikaro charge id).
4. Whether `notificationDisabled = true` also silences paid receipts and what each remaining notification costs.
5. Which event finalizes a **lost chargeback**; boleto refund via API.
6. Pix Automático: eligibility of the real account, minimum days before due to create a charge, retry behaviour.
7. Minimum charge per method (R$ 5, help center).

**Stripe**
1. USD presentment to US cards from a BR account, FX spread and fee, real payout timing (30-day initial settlement).
2. Exact US card fees (international +2% and FX) so US list prices absorb them.
3. Whether Stripe Tax can be enabled on a BR account for US customers and what a calculation returns with no registration.
4. `charge.refunded` / `charge.dispute.closed` payloads; whether test clocks advance standalone invoices.

**Accountant (gates the US launch and any tax claim)**
1. US sales-tax obligation and registration timing for a Brazilian seller of SaaS; Brazilian treatment of USD service exports (IOF/ISS).
2. Nota fiscal obligation for BR tenants (NFS-e v1 stays out).
3. Retention period and what must remain after a tenant purge (fiscal history).

**Owner**
1. Legal texts: Termos de Uso and Política de Privacidade.
2. Real prices, chatbot tier names/models/caps and country availability (commercial-catalog story).

## 6. How each provider is tested outside production

Rationale and the environment matrix are in `tenant-billing.md` §5.3; this section records the provider-specific mechanics.

| Need | Asaas | Stripe |
|---|---|---|
| Sandbox | `https://api-sandbox.asaas.com/v3`, own account and key, auto-approved; partial feature parity (interest/fine on boleto and Pix untestable) | Test mode / sandbox with its own keys; Tax API in the sandbox is limited (about 1,000 calculations a day, rates not guaranteed current) |
| Simulate payment | `POST /v3/sandbox/payment/{id}/confirm` (or the UI button, works for card too) | Test cards (`4242…` success, `4000000000000341` attaches then fails); `stripe trigger` / pay the hosted test invoice |
| Force overdue / failure | Sandbox action to force overdue exists (exact endpoint to capture); card decline via test data | Test cards for declines; `invoice.payment_failed` via the CLI |
| Webhooks to a developer machine | Needs a public URL (tunnel) set as the webhook with its `authToken`; or use the fake locally | `stripe listen --forward-to` forwards signed test events to localhost |
| Time travel | Not supported; use the injectable `IClock` for Ikaro's own dates | Test clocks cover Billing objects; whether they advance standalone invoices is not documented, so Ikaro's own `IClock` drives all Ikaro dates |
| Where it runs | Staging (always), nightly contract job; local only if explicitly opted in | Same |

- **Secrets:** sandbox and live keys are separate Secret Manager entries per environment (`ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`), the live ones are bound to `production` only, and a live key in a non-production environment fails the startup check.
- **Contract suite:** one provider-agnostic suite (create customer and charge, link, cancel, regenerate link, paid per method, overdue, refund, duplicate/out-of-order webhook, idempotent re-delivery, invalid location) runs against the fake on every PR and against the sandboxes nightly; a divergence is a bug in the fake or an undocumented provider behaviour to record in §5.
- **Nothing real is sent:** the fake never leaves the process; sandbox charges move no money; staging email is allowlisted; local email goes to Mailhog.
