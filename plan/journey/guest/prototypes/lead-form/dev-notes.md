# Dev Notes — GUEST: Submit Lead Form

**Status:** ❌ Gap — nothing built yet. Promoted from `docs/discovery/lead-form-module/prototype/` (M20 milestone, `docs/04-USE_CASES.md` UC-039). Full domain/data-model rationale: `docs/discovery/lead-form-module/lead-form-module.md`.

---

## Overview

A single-page public form at `/[slug]/lead-form`, reached from the `LEAD_FORM` hotsite module's teaser CTA (rendered on the hotsite itself — see `shared/hotsite.html`'s `.lead-form-teaser` section, mirroring `BookingCtaModule.tsx`'s full-section treatment, not `ask-chatbot`'s floating bubble — this module has its own dedicated page, so it earns a real section, not a widget). No dedicated teaser screen in this folder — the section lives directly on the already-shared hotsite mockup. Guest fills name/email/phone (always mandatory) plus up to 20 manager-authored questions, completes a Cloudflare Turnstile challenge, and submits.

**Also handles the `CUSTOMER_ONLY`-audience gate** (`01g-login-required.html`) — reached instead of `01-form.html` when the manager restricted this form to logged-in customers and the visitor isn't authenticated. See `customer/prototypes/lead-form/` for the authenticated, pre-filled variant of the same page.

---

## File map

| File | Status | Role |
|---|---|---|
| `apps/web/app/[slug]/lead-form/page.tsx` | ❌ Gap | Server component — fetches the question catalog, renders the form |
| `apps/web/shells/hotsite/components/LeadFormModule.tsx` | ❌ Gap | Teaser section on the hotsite itself, mirrors `BookingCtaModule.tsx` |
| `packages/types/src/hotsite.ts` | ❌ Gap (extend) | Add `LEAD_FORM` to `HotsiteModuleType`, add `LeadFormModuleData` |

---

## Prototype variants — alternate states

| Screen | Scenario | Notes |
|---|---|---|
| `01-form.html` | Happy path — `GUEST_AND_CUSTOMER` audience, unauthenticated | |
| `01b-loading.html` | Initial `GET /public/platform/lead-form/:slug` in flight | |
| `01c-validation-error.html` | Required question blank / invalid email — full form re-shown, only the invalid field highlighted (UC-039 A3/A4) | |
| `01d-captcha-error.html` | Turnstile token expired/failed at submit (UC-039 A1) | |
| `01e-rate-limited.html` | `429 PLATFORM_LEAD_FORM_DAILY_CAP_REACHED` (UC-039 A2) | |
| `01h-submitting.html` | `POST .../submissions` in flight | Whole form disabled, not just the button — a slow response can't let the visitor edit an answer mid-submit |
| `01i-submission-error.html` | Generic network/5xx failure — not a known error code | Distinct from `01c`/`01d`/`01e`, which each map to a specific documented status; "Tentar novamente" resubmits, data not lost |
| `01f-success.html` | Submission accepted (UC-039 postcondition) | Terminal state |
| `01g-login-required.html` | `audienceMode === 'CUSTOMER_ONLY'` + unauthenticated (UC-040 A1) | Gates into `../../../customer/prototypes/login/00-login.html` |

---

## BFF calls

```
GET /public/platform/lead-form/:slug
  Header: X-Tenant-Slug: {slug}
  Response: { audienceMode: 'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY',
              questions: [{ id, label, type, required, options? }] }
  404 — tenant slug not found, or LEAD_FORM module isn't enabled

POST /public/platform/lead-form/:slug/submissions
  Header: X-Tenant-Slug: {slug}
  Body: { name, email, phone, answers: [{questionId, value}], turnstileToken }
  Response 200: { submissionId }
  BFF verifies turnstileToken via Cloudflare siteverify BEFORE forwarding to backend.
  400 — missing/invalid name/email/phone, unanswered required question, or Turnstile failed
  401 — CUSTOMER_ONLY + unauthenticated
  429 PLATFORM_LEAD_FORM_DAILY_CAP_REACHED — tenant-wide or per-IP daily cap
    (enforced BACKEND-side via lead_form_submissions count queries, mirroring Chatbot's
    checkNewSessionVolumeCaps pattern — never a BFF-layer check)
  404 — tenant slug not found, or module isn't enabled
```

Full contract: `docs/14-API_CONTRACTS.md` § Lead Form Widget (Public).

---

## Validation (client-side)

| Field | Rule | Error message |
|---|---|---|
| `name` | min 1 char | "Informe seu nome." |
| `email` | valid email (`Email` VO — reuses `EMAIL_FORMAT_INVALID`) | "Informe um e-mail válido." |
| `phone` | valid phone (`PhoneNumber` VO — reuses `PHONE_FORMAT_INVALID`) | "Informe um telefone válido." |
| any `required: true` question | non-empty answer | "Selecione uma opção." / "Este campo é obrigatório." |
| `turnstileToken` | valid per Cloudflare `siteverify` | "Verificação de segurança expirou, tente novamente." |

## States

`idle → loading (fetch questions) → filled → submitting → validation-error / captcha-error / rate-limited / submission-error / success`

## Mobile notes

Single-column `step-container` layout throughout (same wrapper `guest/prototypes/book-a-service` uses) — no grid breakpoints needed since every field (name/email/phone/questions) is already full-width at every viewport. Choice-type question options (`.q-option` rows) stack vertically regardless of width. The Turnstile widget box (`.turnstile-box`) reflows to full-width on narrow screens; no horizontal scroll risk since it has no fixed-width children.

## Known limitations (flagged, not silently dropped)

- No manual delete/edit of a single submission — the retention cron (UC-043) is the only deletion path.
- No LGPD erasure-before-expiry path — explicitly out of scope for M20 (see `plan/M20-LEAD-FORM-MODULE.md` Non-Goals).
- No per-submission notification (email/webhook) to the manager for MVP — dashboard + list view only (CSV export also removed from scope, see Non-Goals).
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` must be added to `apps/web/shared/lib/runtime-env/public-env.ts`'s `PUBLIC_ENV_KEYS` allowlist and read via `getPublicEnv()` — not a raw build-time `NEXT_PUBLIC_*` read (TD29 precedent — a build artifact is shared across environments).
