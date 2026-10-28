# Discovery: Tenant Billing — Operations Map (operator-free by default)

**Status:** Discovery — operating model (added 2026-10-27, second review). Owner decision: this is a SaaS meant to scale, so billing must run with the **smallest possible operational work**. Everything is solved by the system, the tenant (self-service) or the payment provider; a human operator is reserved for genuine edge cases, and every such case is **mapped here** with its trigger, its automatic first response and its runbook.

**Companion docs:** `tenant-billing.md` (R13, decisions 106–111) · `tenant-billing_USECASES.md` (CAND-34, CAND-35) · `tenant-billing_API.md` · `tenant-billing_PROMOTION_SKETCH.md` (stories C1, C5, C13).

## 1. Principle and target

1. **Default owner of every situation, in this order:** the *provider* (money mechanics) → the *system* (jobs, webhooks, self-healing) → the *tenant* (self-service on the billing page) → the *operator* (only the edge cases of §4).
2. A situation reaches the operator only when it is rare, needs a judgment or an external account, and cannot be resolved by retrying.
3. **No daily list for a human to work through.** The earlier "daily overdue/suspended digest" is removed (decision 107): dunning, suspension, reactivation and clean-up are automatic. Humans are alerted only by exceptions (§5).
4. **Measured, not assumed.** Every operator action is already written to `operator_audit`; the KPI is *operator interventions per 100 active tenants per month* (target ≤ 1 once past the first launch weeks), plus the share of charges paid with no manual action (§6). If a category grows, it becomes an automation story, not a bigger runbook.

## 2. What is fully automatic (no human, no tenant action)

| Situation | Handled by |
|---|---|
| Issuing the next charge, retrying a failed provider creation | issue job (daily) + creation-retry query |
| Confirming payment (Pix, boleto, card), reactivating, recording `has_ever_paid` | webhook + on-demand single-charge refresh + hourly reconcile for at-risk tenants |
| Reminders: trial ending, charge due soon, overdue during the 14-day grace | `billing-reminders` job (CAND-34) |
| Overdue → `PAST_DUE` → `SUSPENDED`, trial end, cancel-at | status sweep (hourly) |
| Stale charge cancel + recovery charge on suspension | status sweep |
| Price-change announcement to every affected manager | price-change transaction + outbox |
| Drift between Ikaro and the provider | reconcile (fixes by itself; alerts only above a threshold) |
| Tenant provisioned but Billing row missing | **provisioning self-heal** (CAND-35 step 1): creates the trial through the same idempotent use case |
| Webhook endpoint disabled/paused at the provider | **provider health job** (CAND-35 step 2): re-enables it through the provider API if the API allows (launch-gate check), otherwise alerts; reconcile keeps money correct meanwhile |
| Provider unhealthy (reconcile failing > 24 h, API down) | **suspension freeze** (CAND-35 step 3): the sweep stops suspending anyone until reconcile succeeds again, so an outage never locks out a paying tenant and no operator "grace" is needed |
| Billing identity missing/invalid blocks a charge | charge held, manager gets a banner + email; **issuing resumes automatically** when the identity is saved |
| First paid plan not confirmed | `PLAN_CONFIRMATION` reminders at 10/7/4 days, then the default plan is invoiced 3 days before trial end with a plain-language email (decision 115) |
| Payment attempted but not yet settled at trial end (boleto) | settlement margin extends to 3 business days when the manager already returned from the payment page (decision 117) |
| Wrong slug/country, lapsed unpaid trial blocking re-signup | the tenant discards its own never-paid tenant (CAND-36); until the purge participants ship, O13 |
| Card keeps being refused (slice F2) | the normal ladder and the hosted link; the manager updates the card |
| Erasure step fails | retried with backoff; alert only after N attempts |
| Retention of `provider_events` | purge job |

## 3. What the tenant does by themselves (self-service)

Confirm the first plan, pay, re-generate an expired link, discard a never-paid tenant, download the receipt (the provider's hosted receipt/invoice link is exposed on each paid charge in the history), change the plan, change identity data (the provider customer is updated on the next charge), cancel, undo a scheduled cancel, reactivate after suspension (pay the recovery charge), see the exact reason and date for any state. The billing page never needs a support contact for these.

## 4. Operator edge cases (the complete list)

| # | Situation | Why a human | Expected frequency | Automatic first response | Operator action (audited) |
|---|---|---|---|---|---|
| O1 | List-price change | A deliberate business decision | ~1–2 per year | dry run shows every new price and sample tenant totals; announcement fan-out (one consolidated email per tenant) is automatic | one `adjust` call (e.g. +20 % for a country, whole-real rounding) after the dry run; the single-price endpoint only for exact corrections |
| O2 | Free/partner/internal tenant | A commercial decision | rare | none | `exempt` set/clear (R12) |
| O3 | Abuse or takedown of a tenant's hotsite | Judgment | rare | Turnstile, rate limits, reserved/impersonation slug list | `suspend` with reason `OPERATOR`; later `unsuspend` (only for this reason) |
| O4 | Chargeback/dispute evidence | The provider requires the merchant's evidence | per dispute, rare | webhook records `CHARGEBACK`; a lost dispute suspends automatically (`PAYMENT_REVERSED`) | upload evidence in the provider console |
| O5 | Refund request outside the "no refund" policy | A policy exception | rare | none; the refund webhook records it | refund in the provider console |
| O6 | Data-subject (LGPD) export/erasure request | Legal | rare | none until the self-service export story (G11) | manual export; erasure by operator-triggered purge |
| O7 | Provider-side incident beyond the automatic freeze (account blocked, KYC question, key compromised) | External account | very rare | suspension freeze + alert | runbook: rotate secret, contact provider |
| O8 | A stuck item after automatic retries (charge creation, purge step, reconcile drift) | Retries exhausted | rare, alert-driven | exponential retries, then one alert with the runbook link | per-alert runbook |
| O9 | Operator grace extension | Only meaningful for a provider-side failure the freeze did not cover | very rare | the freeze makes it unnecessary in nearly every case | `grace_until` (kept as a mapped edge case) |
| O10 | Accountant tasks (US sales-tax registration, tax filings, month closing) | Outside the product | periodic | none | calendar owner: the accountant |
| O11 | NFS-e (Brazil) | Legal duty | **monthly if manual** | **provider-automatic emission configured once in the Asaas account (launch gate, decision 109); no per-charge work** | none once configured |
| O12 | Secret rotation (provider keys, webhook tokens) | Security hygiene | yearly or on incident | none | runbook |
| O13 | **Interim only:** a tenant stuck with a wrong slug/country or a lapsed unpaid trial that blocks re-signup, *before* the purge participants ship (so the self-service discard, CAND-36, is not available yet) | The self-service path depends on the purge pipeline | rare, launch weeks only | the signup error page says plainly what to do | operator-triggered purge of that never-paid tenant (`OPERATOR_REQUEST`) per M17-S51 runbook; retired when CAND-36 ships |

Explicitly **not** operator work any more: marking a charge paid, reactivating a suspended tenant, granting a payment extension, fixing statuses by hand, working a daily overdue list, issuing invoices, answering "where is my receipt", re-sending a payment link, provisioning a self-signup tenant, creating a missing subscription.

A wrongly suspended `NON_PAYMENT` tenant has no operator shortcut (decision 97): a payment the provider confirmed but Ikaro missed is repaired by reconcile; otherwise the tenant pays the recovery charge.

## 5. Exception-only alerting

Alerts are metric/log-based alert policies first (`docs/OBSERVABILITY_STRATEGY.md` § Dashboards, alerts and uptime checks); the email to Ikaro's ops manager is secondary. Each alert names its runbook and fires **only after the automatic response failed**.

| Alert | Fires when | Automatic response before it fires | Runbook |
|---|---|---|---|
| Webhook failure ratio | > 5% non-200 over 15 min, or provider queue paused and not re-enabled | retry, re-enable, reconcile | Webhook |
| Reconcile failing | no successful reconcile for 24 h (also starts the suspension freeze) | retry hourly | Provider incident |
| Reconcile drift | more than N charges differ in one run | drift is corrected | Drift |
| Charge creation stuck | `provider_creation_status = PENDING` > 24 h after N attempts | backoff retries | Charge creation |
| Missing subscription | self-heal could not create it | self-heal | Provisioning |
| Purge step stuck | a step failed N times | backoff retries | Purge |
| Missing price row for an enabled country | caught at **deploy time** by a startup/CI check, not at runtime | — | Catalog |
| Suspension freeze active | provider unhealthy | the freeze itself | Provider incident |

Missing templates, missing price rows and a live-adapter misconfiguration are prevented by startup validation and CI, so they never become runtime operator work.

## 6. Metrics

Operator interventions per 100 active tenants per month (from `operator_audit`) · share of charges paid with no manual action · involuntary churn (suspended for `NON_PAYMENT` then lost) · webhook p95 lag · reconcile corrections per run · time from payment to reactivation · open exceptions older than 24 h. Reported weekly as numbers, not as a worklist.

## 7. Documentation and runbook work this implies

- `docs/RUNBOOKS.md` gains a **Billing** section with exactly the runbooks named in §5 plus O3, O4, O5, O6, O7, O12 (each short: symptom, check, action, who).
- `UC-024` (operator provisioning) is documented as the **exception path** for exempt/partner tenants; self-signup is the default path.
- `docs/OBSERVABILITY_STRATEGY.md` § 7 gets the billing alert policies; the dashboard shows the §6 numbers.
- A customer-facing FAQ/help text for the self-service flows in §3 (owner), so support volume stays near zero.
- Decided by the owner (2026-10-27): the **BR billing address is required before the first paid selection** so NFS-e is automatic (decision 109); **no refunds**, exceptions are operator work (O5, decision 112); **any manager** may cancel, with an email to the billing address (decision 113). Still open, with owners: the accountant's confirmation that automatic NFS-e satisfies the BR duty, whether Terms need a withdrawal-right clause for CPF buyers (legal), and **Asaas webhook re-enable via API** (spike A0).
