# Asaas Provider — Verified Facts, Sandbox Observations and Launch Gates

> **When to load:** building or changing `AsaasBillingProvider`, the Asaas webhook route or normalizer, the provider-health job, the hosted recurring-card checkout (slice F2) or Pix Automático; deciding whether an Asaas behaviour is verified; the decision and the port contract are in `docs/TECH_STACK_DECISIONS.md` § 10 and `docs/API_CONTRACTS.md` § Billing; the Stripe equivalent has no canonical doc yet.
> **Tags:** backend, testing

**Audience:** any engineer or AI agent writing code against Asaas. **Scope:** Asaas only (BRL). Stripe gets its own doc from its own discovery.

**Provenance.** The first source was the official Asaas documentation, read by two research passes (2026-10-27); a summarizing fetch tool means quotes are paraphrases. **M25-S01 then ran the flow in the Ikaro sandbox account on 2026-11-09**: scripted API calls, a local webhook listener behind a Cloudflare quick tunnel, and the owner's browser for the hosted pages. Every sandbox result below is labelled **O** with that date.

**Labels.** **V** = stated in the official docs. **I** = inferred. **NF** = not found. **O** = observed in the Asaas sandbox on 2026-11-09. **An O result is not a production confirmation:** the sandbox has partial parity (§ 5), and anything that decides money is re-confirmed in the real account before activation (§ 4).

**"Decision N"** in this doc means the numbered decisions of the tenant-billing discovery record (`docs/discovery/tenant-billing/tenant-billing.md`). When that folder is deleted, the rationale each one cites has to be carried into the canonical doc that owns it.

**Never recorded here:** the API key, the webhook `authToken`, tunnel URLs, the seller's legal identity, or any personal data typed on a hosted page. Test data used a synthetic CPF.

---

## 1. What changed because of the sandbox run

These are the places where the run contradicted or settled an earlier assumption. The port and the webhook normalizer are written from these, not from the documentation rows in § 3.

1. **`externalReference` holds at most 100 characters** (101 is rejected with `invalid_externalReference`). An Ikaro charge id (UUID, 36 characters) fits and round-trips unchanged in the payment object and in the webhook.
2. **The tax id is required to create a charge, not to create a customer.** `POST /v3/customers` with only a `name` returns 200; `POST /v3/payments` for that customer returns 400 (`invalid_object`, "é necessário preencher o CPF ou CNPJ do cliente"). The port still sends `cpfCnpj` when it creates the customer, so the failure never happens at charge time.
3. **A cancelled charge is not `CANCELLED`.** `DELETE /v3/payments/{id}` returns `{"deleted": true}`; a re-read returns 200 with `deleted: true` and `status` still `PENDING`; the webhook is `PAYMENT_DELETED`. `fetchChargeStatus` must read `deleted`, not only `status`.
4. **Cancelling a paid charge is refused** with 400 `invalid_action` ("Só é possível remover cobranças pendentes ou vencidas"). The code is generic, so `ChargeAlreadyPaidError` is decided by a re-read (`RECEIVED` / `CONFIRMED`), never by parsing the Portuguese text.
5. **A card paid on the hosted invoice is `CONFIRMED`**, with `PAYMENT_CONFIRMED` and a credit date 32 days out. The sandbox confirm call (`POST /v3/sandbox/payment/{id}/confirm`) skips that and goes straight to `RECEIVED` (event `PAYMENT_RECEIVED`) and reports `billingType: BOLETO` whatever the payer would have picked. The paid signal stays "the first of `CONFIRMED` or `RECEIVED`" (§ 3, A1).
6. **`billingType` stays `UNDEFINED` while a charge is pending**, also after the payer opens the invoice and picks Pix or tries a card. It becomes `CREDIT_CARD` when a card payment is confirmed. For Pix and boleto it could not be observed (the sandbox confirm reports `BOLETO`).
7. **The hosted invoice stores the card.** The payment object of a card paid on the invoice carries `creditCardToken`, and a new `POST /v3/payments` with that token for the same customer was `CONFIRMED` at once, with no account enablement in the sandbox. This contradicts A21 ("cannot be assumed to save cards") and reopens the question behind decision 114. **No decision is changed here:** whether the token can be reused in production without enablement and without `remoteIp` is a launch gate (§ 4, G12), and the owner decides if it replaces or complements slice F2.
8. **The webhook event id is `evt_<32 hex>&<number>`** and the hex part is **the same for different events of the same type**; the number increases. The dedupe key is the whole string. About 45 characters, so `billing.provider_events.event_id VARCHAR(100)` holds it.
9. **`dateCreated` in the webhook body is São Paulo local time with no offset** (`2026-11-09 09:26:37`), not UTC. The normalizer converts it with `America/Sao_Paulo`.
10. **The minimum charge is R$ 5,00 for every billing type** (`UNDEFINED`, `PIX`, `BOLETO`, `CREDIT_CARD`); A14's "I" is now **O**.
11. **Webhook retries back off and failed events are replayed in order.** § 2, check 11.
12. **The webhook queue did not pause** after 17 failed deliveries; `interrupted` and `enabled` are writable through the API. § 2, check 5, and the verdict in § 4.

---

## 2. Observed in the sandbox (2026-11-09)

Each row: the call, the result, and what it means for the port. Sandbox ids and the account are omitted on purpose.

| # | Check | Observed (O, 2026-11-09) | Consequence |
|---|---|---|---|
| 1 | Create a customer with `cpfCnpj` | `POST /v3/customers {name, cpfCnpj, email}` → 200, id `cus_…`. Without `cpfCnpj` → also 200 (`cpfCnpj: null`). Charge for the customer without it → 400, see § 1, item 2 | Send `cpfCnpj` at customer creation; the charge is where Asaas enforces it |
| 2 | Charge with `billingType: UNDEFINED`, read the hosted URL | `POST /v3/payments {customer, billingType: "UNDEFINED", value, dueDate, externalReference}` → 200, `status: PENDING`, `invoiceUrl: https://sandbox.asaas.com/i/<id>` (the id is the charge id without `pay_`). The page loads without login | `paymentUrl` = `invoiceUrl` |
| 3 | Pay with the sandbox confirm call and receive the webhook | `POST /v3/sandbox/payment/{id}/confirm` (no body) → 200 `status: RECEIVED`. Webhook `PAYMENT_CREATED` arrived about 1.5 s after the charge was created and `PAYMENT_RECEIVED` about 1.5 s after the confirm. Opening the invoice page also sends `PAYMENT_CHECKOUT_VIEWED` | Ignore `PAYMENT_CHECKOUT_VIEWED` and any unmapped event with a 200 no-op |
| 4 | Re-read by id after the webhook | `GET /v3/payments/{id}` → the same fields as the webhook `payment` object (`status`, `billingType`, `value`, `netValue`, `paymentDate`, `externalReference`, `invoiceUrl`, `deleted`) | The re-read is the truth: apply an event only after it, as `docs/API_CONTRACTS.md` already says |
| 5 | Re-enable a paused webhook queue through the API | `GET/POST/PUT/DELETE /v3/webhooks` exist. `PUT /v3/webhooks/{id} {"interrupted": true}` → 200 and persisted; `{"interrupted": false}` → 200 and persisted; `enabled` toggles the same way. The response and the UI expose `penalizedRequestsCount` ("Eventos Penalizados" in the UI): it reached 17, then returned to 0 after the first successful delivery. **The queue did not pause** after 17 failed deliveries over about 40 minutes, so the effect of `interrupted: false` on a genuinely paused queue was **not observed** | See the verdict in § 4 |
| 6 | Cancel a charge that was paid | `DELETE /v3/payments/{id}` on a `RECEIVED` charge → 400 `invalid_action` ("Só é possível remover cobranças pendentes ou vencidas") | The Reactivation-rule edge case is real; detect it by re-read (§ 1, item 4) |
| 7 | `billingType` after the payer picks a method | Pix picked on the hosted page, not paid: charge still `UNDEFINED`, `PENDING`. Card paid on the hosted page: `CREDIT_CARD`, `CONFIRMED`, `PAYMENT_CONFIRMED`. Sandbox confirm: `BOLETO` (artifact) | The settlement margin cannot be exact per method before payment; keep keying it on `payment_return_seen_at` (decision 117) |
| 8 | Hosted recurring-card checkout (F2) | See § 2.1 | F2 stays viable in the sandbox; open items in § 4 |
| 9 | Annual billing (slice H) | `POST /v3/checkouts` with `subscription.cycle: "YEARLY"` → 200 (as for `MONTHLY`). `chargeTypes: ["RECURRENT", "INSTALLMENT"]` → 400 ("RECURRENT não pode ser combinado com outros tipos de cobrança"). A completed yearly checkout, the maximum single card value and instalments were **not** observed | `YEARLY` is accepted at creation; the rest is G13 |
| 10 | `invoiceUrl` after due date, cancel and paid | After paid: the page loads (HTTP 200) and says the payment was made. After cancel: the page loads (HTTP 200) and says the charge was cancelled. After the due date: **not reproducible**, because creating a charge with a past `dueDate` is rejected (`invalid_dueDate`, "Não é permitido data de vencimento inferior a hoje") and no overdue-forcing action exists | Link regeneration after the due date stays G1 |
| 11 | Webhook payment-object fields and the retry schedule | Body: `{id, event, dateCreated, account: {id, ownerId}, payment: {…}}`. `payment` fields: `object, id, dateCreated, customer, checkoutSession, paymentLink, value, netValue, originalValue, interestValue, description, billingType, canBePaidAfterDueDate, confirmedDate, pixTransaction, status, dueDate, originalDueDate, paymentDate, clientPaymentDate, installmentNumber, invoiceUrl, invoiceNumber, externalReference, deleted, anticipated, anticipable, creditDate, estimatedCreditDate, transactionReceiptUrl, nossoNumero, bankSlipUrl, lastInvoiceViewedDate, lastBankSlipViewedDate, discount, fine, interest, postalService, escrow, refunds` (a subscription charge adds `subscription`). Headers: `content-type: application/json`, `user-agent: Asaas_Hmlg/3.0` plus `asaas-access-token`. **Retries of one failing event (sequential delivery), measured between attempts:** 31 s, 62 s, 3 min 32 s, 5 min, 10 min, then about 19 and 21 minutes (the 19-minute attempt coincided with my own `PUT /v3/webhooks`, so it may not be scheduled). **Every failed event was replayed on the next attempt once the endpoint answered 200:** 19 events, in creation order, original ids, within 2 s. Only 200 and 500 were tried, not 201, 204 or a redirect | The normalizer reads only fields in this list; unknown fields are ignored. A restored endpoint catches up on its own, so the reconcile job is a safety net, not the primary path |
| 12 | `externalReference` maximum length | 50 and 100 characters → 200. 101, 255, 256, 300, 500 → 400 `invalid_externalReference` ("exceeds the maximum size of [100]") | § 1, item 1 |
| 13 | `notificationDisabled = true` and paid receipts | **Not observable from the API.** `GET /v3/customers/{id}/notifications` lists the same eight notification events, all `enabled: true`, for a customer with the flag on and one with it off, so the flag is a master switch outside that list. Seeing whether a receipt email is sent needs an inbox, which this run did not have | Stays G4 |
| 14 | Minimum charge per method | `UNDEFINED`, `PIX`, `BOLETO`, `CREDIT_CARD`: R$ 4,99 → 400 ("O valor mínimo … é R$ 5,00"), R$ 5,00 → 200 | § 1, item 10 |

### 2.1 The hosted recurring-card checkout (check 8)

| Item | Observed (O, 2026-11-09) |
|---|---|
| Create | `POST /v3/checkouts {billingTypes: ["CREDIT_CARD"], chargeTypes: ["RECURRENT"], minutesToExpire, callback {successUrl, cancelUrl, expiredUrl}, items [{name, description, quantity, value}], subscription {cycle, nextDueDate, endDate?}}` → 200 with `id`, `link` (`https://sandbox.asaas.com/…/checkoutSession/show/<id>`) and `status: ACTIVE`. No account enablement was needed in the sandbox. `endDate` is optional. `nextDueDate` is accepted at +10, +60 and +400 days. `GET /v3/checkouts/{id}` → 404, so the checkout cannot be read back by that path |
| Card typing | The owner confirmed the card was typed only on Asaas's page; nothing card-related was sent through the API |
| Refused attempt | A documented refused test card on the page showed "Pagamento não autorizado. Verifique os dados do cartão de crédito informados e tente novamente."; the session stayed open |
| Success | A second, approved card completed it: "Pagamento confirmado" |
| After success | A subscription was created: `ACTIVE`, `billingType: CREDIT_CARD`, `checkoutSession` set, `nextDueDate` one cycle after the first charge. **The first charge was created immediately** (the `nextDueDate` I sent was +10 days, inside the 40-day window), status `PENDING`, due on that date, with `creditCard` (last four digits, brand, token) already attached, and `PAYMENT_CREATED` was delivered. Whether the card is then charged on the due date was **not** observed (it needs the date to arrive) |
| Customer | The checkout created its own customer from what the payer typed (name, email, phone, tax id, address, postal code) with `notificationDisabled: false`; a later `PUT /v3/customers/{id} {notificationDisabled: true}` → 200 |
| Attaching an existing customer | `customer: "cus_…"` is accepted only if that customer already has phone, address, address number, postal code, province and city (otherwise 400 listing the missing fields). `customerData` needs `phoneNumber`, `address`, `addressNumber`, `postalCode` and `province` as well as name, tax id and email |
| Value change | `PUT /v3/subscriptions/{id} {value}` → 200 and the pending charge **kept the old value**; with `updatePendingPayments: true` the pending charge took the new value (and a `PAYMENT_UPDATED` followed) |
| Delete | `DELETE /v3/subscriptions/{id}` → 200 `{deleted: true}`; the pending charge was marked `deleted: true` |
| Webhook events | `CHECKOUT_PAID` and `SUBSCRIPTION_CREATED` are accepted as names in `PUT /v3/webhooks`, but the webhook was registered without them while the checkout ran, so their **delivery was not observed** (A6's "no subscription events" is therefore unconfirmed, not contradicted) |

### 2.2 Other observations that shape the port

- **Refund (`POST /v3/payments/{id}/refund`).** A full refund of a confirmed card charge → 200, `status: REFUNDED`, and `PAYMENT_REFUNDED` arrived about 4 s later. A partial refund on the same day → 400 ("só pode ser estornada parcialmente no próximo dia"). A refund of the charge the sandbox had marked `BOLETO` → 400 ("Somente é possível estornar cobranças cuja a forma de pagamento seja cartão de crédito ou Pix"), so a boleto cannot be refunded through the API.
- **Fees** (`GET /v3/myAccount/fees`): boleto and Pix R$ 1,99 (R$ 0,99 promo), card R$ 0,49 + 2,99% (1,99% promo), card credit after 32 days, NFS-e R$ 0,49 per note. Observed `netValue` of a R$ 49 charge: 47,54 for the card, 48,01 for the sandbox-confirmed charge. The notification fees (SMS 0,50, WhatsApp 0,55, phone call 0,55, postal 2,91) confirm why Ikaro creates customers with `notificationDisabled = true`. **A14 confirmed.**
- **Rate limit.** None of about 210 API calls got an HTTP 429.
- **NFS-e (item 0).** `GET /v3/invoices` answers with an empty list and the municipal-options probes returned 404, so the automatic-emission setup is **not observable** in the sandbox.
- **Official IP list (item 2).** Not found; authenticity stays on the token header (no IP allowlist).

---

## 3. Fact table (documentation, corrected by § 1 and § 2)

Rows keep the ids other documents cite. A row changed by the sandbox run says so in the last column.

| # | Fact | Label | Design consequence |
|---|---|---|---|
| A1 | Payment events by method: **Pix** on time `PAYMENT_RECEIVED` only (overdue: `PAYMENT_OVERDUE` → `PAYMENT_RECEIVED`); **boleto** `PAYMENT_CONFIRMED` → `PAYMENT_RECEIVED`; **card** `PAYMENT_CONFIRMED`, then `PAYMENT_RECEIVED` about 32 days later; `PAYMENT_CONFIRMED` is not emitted for Pix. Card on the hosted invoice: `PAYMENT_CONFIRMED` observed; the sandbox confirm call emits only `PAYMENT_RECEIVED` | V / O | The paid signal is the first of `CONFIRMED` or `RECEIVED` for the charge (idempotent; the second is a no-op). "Only `CONFIRMED` restores access" would lock out every Pix payer |
| A2 | A payment requires `customer`, `billingType`, `value`, `dueDate`. The customer's `cpfCnpj` is enforced when the **charge** is created, not when the customer is created (§ 1, item 2) | V / O | BR tax id is required to charge; collected at signup for BR (decision 57) |
| A3 | `billingType = UNDEFINED` lets the payer choose card, Pix or boleto on the hosted invoice (`invoiceUrl`) | V / O | Ikaro always creates charges as `UNDEFINED` |
| A4 | Pix QR expires 12 months after the due date and stays payable. Boleto registration is auto-cancelled after the due date (days NF). Card after the due date NF. A due-date or value change emits `PAYMENT_UPDATED`; delete and restore events exist (`PAYMENT_DELETED` observed). The `invoiceUrl` keeps loading after paid and after cancel (§ 2, check 10) | V / I / O | Recovery charges use `RECOVERY_CHARGE_DUE_DAYS` (default 7); link regeneration returns the same `invoiceUrl`; behaviour after the due date is G1 |
| A5 | Interest and fine are optional per charge; omit them to keep account defaults | V | Ikaro sends neither; the tenant owes the list price only |
| A6 | Subscription charges are created 40 days before the due date by default (14 or 7 configurable). The documentation lists only payment webhooks; the webhook API accepts `CHECKOUT_PAID` and `SUBSCRIPTION_CREATED` (delivery not observed) | V / O | Baseline: Ikaro issues its own charges and does not use provider subscriptions |
| A7 | A card token can replace card data on `POST /v3/payments`; `POST /v3/creditCard/tokenizeCreditCard` receives card data through the caller's server, needs `remoteIp`, and in production needs account enablement. **A token created by the hosted invoice exists too and was reusable (§ 1, item 7)** | V / O | API tokenization stays dropped (decision 58). The hosted-invoice token is G12 |
| A8 | Pix Automático: needs a **PJ** account, approved, active CNPJ 6+ months, no Pix restrictions. Authorization is hosted: the first payment's QR code carries it; ACTIVE only after the payer's bank confirms. `paymentCreationMode MANUAL` or `SUBSCRIPTION`; `retryPolicy ALLOW_THREE_IN_SEVEN_DAYS`. Minimum days to create a charge before due: NF | V / NF | v1's only auto-billing mode, `MANUAL` creation, released after sandbox and production verification (M29) |
| A9 | Webhook: header `asaas-access-token` carries the configured `authToken` (32–255 characters); at-least-once; queue pauses after 15 consecutive failures; events kept 14 days; only HTTP **200** counts as success (201, 204 and 3xx fail, no redirect followed); about 10 s timeout and at most 10 webhooks per account (summary level). Event id format, retry schedule, replay and the writable `interrupted` flag: § 1 and § 2 | V / I / O | The webhook returns exactly `200` after the transaction commits, nothing else. Token compared timing-safe; no IP allowlist |
| A10 | Asaas notifies the payer by email, SMS and WhatsApp and charges per notification; `notificationDisabled = true` disables charge notifications | V | Ikaro creates every customer with `notificationDisabled = true` and sends all billing emails itself (decision 59). Whether it also silences paid receipts is G4. A customer created by the hosted checkout starts with it `false` and needs a `PUT` |
| A11 | Refund: `POST /v3/payments/{id}/refund`, optional `value` for a partial (card and Pix only, § 2.2); events `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_REFUND_DENIED`. Chargeback events: `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`. Which event marks a **lost** dispute: NF | V / O | Normalizer: `REFUNDED` → full refund, `PARTIALLY_REFUNDED` → partial, `CHARGEBACK_REQUESTED` → dispute opened (no access change). Lost chargeback is G5 |
| A12 | Sandbox `https://api-sandbox.asaas.com/v3` (production `https://api.asaas.com/v3`): separate accounts and keys, auto-approved, partial parity; `POST /v3/sandbox/payment/{id}/confirm` simulates payment (§ 5). **No overdue-forcing action was found** | V / O | Per-PR tests use the fake; the sandbox runs in staging and the nightly contract job |
| A13 | API key generated in the web UI, shown once, max 10 keys. Rate limit 25,000 requests per 12 h, max 50 concurrent GETs, HTTP 429 | V | Billing crons batch and respect 429; reconcile is a daily job |
| A14 | Fees: no monthly fee; Pix R$ 1,99 (promo R$ 0,99), boleto R$ 1,99 (promo R$ 0,99), card R$ 0,49 + 2,99% (promo 1,99%), NFS-e R$ 0,49. Minimum charge R$ 5,00 per method | V / O | Ikaro absorbs fees; on HOTSITE R$ 49 they are about 4% (card) and 2% (Pix) |
| A15 | NFS-e can be emitted automatically with the charge; needs a **PJ** account, municipal registration and prefeitura homologation (MEI and national-portal emitters exempt), a registered service, and the payer's full data (name, valid CPF/CNPJ, email, address with CEP) | V | Provider-automatic emission configured once in the Asaas account is a BR go-live gate (decision 109); the BR billing address is required before the first paid selection. Not observable in the sandbox (§ 2.2) |
| A16 | Card charges settle about 32 days after confirmation; boleto and Pix faster (`creditDate` +32 days observed) | V / O | Cash-flow note, no design effect |
| A17 | Per-charge limit PF R$ 50k, PJ R$ 500k | I | Irrelevant at our prices |
| A18 | Hosted recurring-card checkout: `POST /v3/checkouts` (§ 2.1). Events `CHECKOUT_PAID` and `SUBSCRIPTION_CREATED`; each charge has a `subscription` field; the page says `successUrl` is not payment confirmation | V / O | Basis of slice F2 (decision 114): card auto-collection with no card data on Ikaro's servers |
| A19 | `PUT /v3/subscriptions/{id}` changes apply to future charges; `updatePendingPayments: true` also rewrites pending ones (observed); `DELETE` ends the recurrence and removes pending charges (observed); `INACTIVE` pauses, `ACTIVE` + a new `nextDueDate` resumes. The card is reused for later charges | V / O | Plan and price boundaries become `PUT` calls with `updatePendingPayments: true`; disable = `DELETE`, then Ikaro resumes its own charges |
| A20 | Card retry (blog, not API docs): three capture attempts on the due date (8h, 14h, 20h), then two more at 24 h intervals; behaviour after the fifth refusal NF | I | The normal Ikaro ladder wraps this; terminal behaviour is G11 |
| A21 | Hosted invoice payment: the payer types card data on Asaas's page; **the card is stored and returned as `creditCardToken`** (§ 1, item 7) | V / O | Changes the F2 discussion; G12 |
| A22 | Subscription charges are generated 40 days before the due date — see A6. With `nextDueDate` inside that window the first charge appeared at once | V / O | In F2 the provider-generated charge appears early; Ikaro mirrors it and must not issue its own for the same period. Behaviour for a date beyond 40 days is G11 |

---

## 4. Verdicts, and the launch gates that remain

### Slice F2 (hosted recurring card)

**Viable.** In the sandbox the checkout is created through the API, the card is typed only on Asaas's page, a refused card does not close the session, the success path creates an `ACTIVE` subscription with its first charge, the value can be changed with `PUT` (with `updatePendingPayments`) and the subscription can be deleted. Not yet known, so the slice stays behind G10–G13: production enablement, what Asaas does on the due date and after the fifth refusal, the first charge for a `nextDueDate` beyond 40 days, whether `CHECKOUT_PAID` / `SUBSCRIPTION_CREATED` are delivered, and the customer data the page demands.

### Webhook re-enable

**Possible through the API, effect unverified.** `PUT /v3/webhooks/{id}` with `interrupted: false` is accepted and persisted, so `reenableWebhookQueue` can be implemented. The sandbox never paused the queue (17 failed deliveries, backoff up to about 20 minutes), so nobody has seen that call resume a real paused queue.

**What the provider-health job does** (port `readAccountHealth` and `reenableWebhookQueue`, UC-140):
1. `readAccountHealth` reads `GET /v3/webhooks` and reports `PAUSED` when `interrupted` is true or `enabled` is false.
2. On `PAUSED` it calls `reenableWebhookQueue` (`PUT interrupted: false`, `enabled: true`) once, then re-reads. A webhook that is still not healthy after the call, or a call that fails, **raises the billing alert** (`docs/RUNBOOKS.md` § Billing (planned)) for an operator to fix in the Asaas console. It never retries in a loop.
3. Either way money state stays correct without the queue: failed events are replayed by Asaas (kept 14 days, original ids, in order) once the endpoint answers 200, and the daily reconcile re-reads charges by id.

So "re-enable is impossible" does not apply; if production proves the call ineffective, the job is the alert path above with no code change except removing step 2.

### Launch gates (verify in the real account; none blocks promotion, each blocks activating its slice)

| Gate | What to confirm | Why the sandbox could not |
|---|---|---|
| G1 | `invoiceUrl` and link regeneration after the due date; boleto auto-cancel days; whether a card can pay after the due date | A past due date cannot be created and no overdue action exists |
| G2 | Whether `PAYMENT_OVERDUE` and the overdue transitions match A1 | Same |
| G3 | The 15-failure pause: whether and when the queue pauses, what the UI shows, and that `PUT interrupted: false` resumes it | The queue did not pause (§ 2, check 5) |
| G4 | Whether `notificationDisabled = true` silences paid receipts; the fee of any remaining notification | Needs an inbox |
| G5 | Which event finalizes a **lost chargeback**; which event signals a revoked card | The sandbox cannot produce a chargeback (needs an email to Asaas support with the charge id) |
| G6 | Pix Automático eligibility of the real account (M29): PJ, CNPJ age, minimum days before due to create a charge, retry behaviour | Depends on the real account |
| G7 | NFS-e automatic emission: PJ setup, municipal registration, prefeitura homologation, payer data | Not observable in the sandbox |
| G8 | Boleto refund by API (the sandbox could not produce a real boleto payment) | Same artifact as § 1, item 5 |
| G9 | The settled `billingType` for Pix and boleto after a real payment | The sandbox confirm reports `BOLETO` |
| G10 | F2: account enablement for the hosted recurring checkout | Sandbox needs none |
| G11 | F2: what Asaas does on the due date, the retry schedule and the state after the fifth refused attempt; the first charge for `nextDueDate` beyond 40 days; whether `CHECKOUT_PAID` and `SUBSCRIPTION_CREATED` are delivered | Needs real time to pass; the two events were not registered while the checkout ran |
| G12 | A card stored by the hosted invoice (`creditCardToken`): reusable in production, with or without account enablement and `remoteIp`; whether it is a PCI-free alternative to F2 | Sandbox behaviour may differ |
| G13 | Slice H: a completed yearly checkout, the maximum single card value, instalments | Not completed in this run |

Owner and accountant items (legal texts, real prices, US tax) are not Asaas facts and stay in `docs/discovery/tenant-billing/tenant-billing_PROVIDERS.md` (its § 5), until their own stories close them.

---

## 5. Testing against the Asaas sandbox

- **Environment.** `https://api-sandbox.asaas.com/v3`, its own account and key (auto-approved, free). The key is generated in the web UI and shown once. Staging uses `BRL_ASAAS_SANDBOX`; the nightly contract suite runs against it.
- **Simulating payment.** `POST /v3/sandbox/payment/{id}/confirm` marks a charge `RECEIVED` and reports `billingType: BOLETO`. A card payment through the hosted invoice produces the real `CONFIRMED` path. Documented test cards (docs, **V**): approved Visa `4539 6560 4839 2220` (any future expiry, fictitious holder and CVV); refused Mastercard `5184 0197 4037 3151` and Visa `4916 5613 5824 0741`.
- **What the sandbox cannot do.** Create an overdue charge (past due date rejected, no overdue action), produce a chargeback, apply interest, fine or discount on boleto and Pix, refund a boleto, pause the webhook queue, and show whether receipt emails are sent. Contract-suite cases for these run against the fake only.
- **Webhooks to a developer machine.** The sandbox needs a public HTTPS URL. A local listener behind `cloudflared tunnel --url http://localhost:<port>` (no account) works; register it with `POST /v3/webhooks` (a 32–255 character `authToken`, `sendType`, `events`), have the listener compare `asaas-access-token` timing-safe, log every delivery, and answer 200 or 500 from a switch to test failures. Delete the webhook and stop the tunnel when done; the staging BFF is internal-only, so Asaas cannot reach it.
- **Noise to expect.** Opening an invoice page, even from a script, sends `PAYMENT_CHECKOUT_VIEWED`. A failed delivery is retried with the same event id.
- **Secrets.** Sandbox and live keys are separate Secret Manager entries per environment (`docs/ENGINEERING_RULES_INFRA.md` § Billing configuration (planned)); a live key never exists outside production.
