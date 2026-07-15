# TD26 — Replace SendGrid email adapter with Brevo

## Status
- **Type**: Technical Debt / Infra-driven provider change
- **State**: Open
- **Priority**: Medium — blocks nothing today (no environment sends real email yet), but must land before any story that actually enables `EMAIL_ADAPTER` outside `mailhog` (e.g. the deployment stories, M17-S27/S37)
- **Context**: `apps/backend/src/contexts/notification/infrastructure/delivery/sendgrid-email.adapter.ts`, `apps/backend/src/contexts/notification/notification.module.ts`, `apps/backend/src/config/env.validation.ts`
- **Created**: 2026-07-15 (surfaced during M17-S10 — Google OAuth + email provider bootstrap)

---

## Problem

The email provider decision changed mid-bootstrap. M17-S10's runbook originally called for SendGrid (per the M11-S03 adapter already implemented, and the M17 Portability Ledger's SendGrid row). During execution:

1. SendGrid rejected the new Twilio/SendGrid account during its own compliance/vetting review (generic denial, no reason disclosed — likely automated risk scoring against a brand-new domain with no live site yet, unrelated to anything misconfigured on our side).
2. Separately, SendGrid retired its free plan in 2025 (now a 60-day trial only), so even an approved account wouldn't have stayed free long-term.

**Brevo** was set up instead for `ikaro.online` (domain authenticated: DKIM via two CNAME records, DMARC published, ownership TXT verified) — see `docs/BOOTSTRAP_LOG.md`'s M17-S10 entry for the full DNS record trail. Two **SMTP keys** (not general API keys) were created — `ikaro-staging` and `ikaro-prod` — deliberately chosen over Brevo's broader API key type because SMTP keys are structurally send-only (they can't touch contacts, campaigns, or account settings), matching the "Mail Send permission only" requirement without needing Brevo to offer granular API-key scoping.

The application code still only knows about SendGrid:

```typescript
// env.validation.ts
EMAIL_ADAPTER: z.enum(['sendgrid', 'mailhog']).default('mailhog'),
SENDGRID_API_KEY: z.string().min(1).optional(),
// ...
if (data.EMAIL_ADAPTER === 'sendgrid' && !data.SENDGRID_API_KEY) { ... }
if (data.APP_ENV !== 'local' && data.EMAIL_ADAPTER === 'mailhog') {
  // message: 'EMAIL_ADAPTER=mailhog is not allowed... — use SendGrid'
}
```

```typescript
// notification.module.ts
sendgrid: SendGridEmailAdapter,
(config) => (config.get('EMAIL_ADAPTER') === 'sendgrid' ? sendgrid : mailhog),
```

`SendGridEmailAdapter` sends via the `@sendgrid/mail` SDK against a `SENDGRID_API_KEY`. None of this exists for Brevo yet — the actual API keys created in M17-S10 (two Brevo SMTP keys, in a password manager) have nowhere to plug in.

---

## Fix

Since the SMTP keys were deliberately chosen for their send-only scope, the new adapter should send via **SMTP transport** (e.g. `nodemailer`, pointed at Brevo's SMTP relay host) rather than pulling in Brevo's REST API SDK (`@getbrevo/brevo`), which would need a broader API key type to do anything useful — using the REST API here would silently widen the credential's blast radius back to what SMTP keys were chosen to avoid.

1. Add `BrevoEmailAdapter implements IEmailSender` (same port `apps/backend/src/contexts/notification/application/ports/email-sender.port.ts` that `SendGridEmailAdapter` already implements) — using `nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587, auth: { user: <brevo-account-email>, pass: <BREVO_SMTP_KEY> } })` (confirm exact host/port/auth-user convention against Brevo's current SMTP relay docs at implementation time — don't assume from this TD).
2. `env.validation.ts`: replace `SENDGRID_API_KEY` with `BREVO_SMTP_KEY` (or similar), update the `EMAIL_ADAPTER` enum from `['sendgrid', 'mailhog']` to `['brevo', 'mailhog']`, update the conditional-required check and the `APP_ENV !== 'local'` guard's error message.
3. `notification.module.ts`: swap the `sendgrid` branch for `brevo` → `BrevoEmailAdapter`.
4. `.env.example` (backend): update the `EMAIL_ADAPTER=sendgrid`/`SENDGRID_API_KEY` example lines to the Brevo equivalents.
5. Decide whether to delete `SendGridEmailAdapter` entirely (recommended — SendGrid is not usable for this project at all now, no account exists and none is planned) or leave it dead/unregistered. Per the project's "no workarounds, best long-term solution" rule, deleting it is cleaner than leaving unreachable code behind.
6. Update the M17 Portability Ledger's SendGrid row (`plan/M17-CLOUD-DEPLOY.md` §0) to name Brevo instead, and any other doc referencing `SENDGRID_API_KEY`/SendGrid as the intended provider (`docs/23-INFRASTRUCTURE_SETUP.md`'s Day-0 secrets step, if it names SendGrid specifically).
7. Existing `sendgrid-email.adapter.spec.ts` (if present) needs an equivalent `brevo-email.adapter.spec.ts` — builder pattern, InMemory doubles, per `docs/08-TESTING_STRATEGY.md`.

---

## Not in scope here

- Actually wiring `BREVO_SMTP_KEY` into Secret Manager / Cloud Run env — that's M17-S27 (staging) / S37 (prod), which populate real secret values as part of the deployment pipeline stories, not this TD.
- The Brevo SMTP keys created in M17-S10 expire after 90 days of inactivity — if this TD is picked up well after that window with no test sends in between, regenerate the keys in Brevo's dashboard first (noted in `BOOTSTRAP_LOG.md`).
