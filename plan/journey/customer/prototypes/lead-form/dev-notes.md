# Dev Notes — CUSTOMER: Submit Lead Form (prefilled)

**Status:** ❌ Gap — nothing built yet. Promoted from `docs/discovery/lead-form-module/prototype/` (M20 milestone, `docs/04-USE_CASES.md` UC-040).

---

## Overview

Same page and same `LeadFormPage` component as `guest/prototypes/lead-form/01-form.html` — not a separate component. An authenticated Customer reaches `/[slug]/lead-form` and the page additionally resolves `GET /customers/me` server-side to pre-fill name/email/phone (visible, editable autofill — not a hidden field, matching the user's explicit request during discovery). `customerId` is set on the submission from the JWT `sub`, never shown to the visitor as a field.

Loading, validation error, captcha error, rate-limited, and submission-error are **identical** to the guest flow (same markup, same copy) — see `../../../guest/prototypes/lead-form/` for those. **Success is the one state duplicated in this folder** (`01b-success.html`), not because the content differs, but because the auth bar does: the guest success screen (`01f-success.html`) shows the unauthenticated "Entrar" link, which would be visibly wrong for a customer who is already logged in — this screen swaps in the same avatar-dropdown auth bar `01-form-prefilled.html` itself uses. A real bug in an earlier draft of `01-form-prefilled.html` linked its "Enviar" button straight to the guest success screen; fixed to link here instead.

**Also handles the `CUSTOMER_ONLY`-audience gate's resolution:** when a guest hits `guest/prototypes/lead-form/01g-login-required.html` and logs in, they land back on `/[slug]/lead-form` — which, now that they're authenticated, renders this exact prefilled screen.

---

## File map

Same as `guest/prototypes/lead-form/dev-notes.md` — `apps/web/app/[slug]/lead-form/page.tsx` is one shared component for both actors, not two.

---

## BFF calls

Same as guest (`docs/14-API_CONTRACTS.md` § Lead Form Widget), plus a server-side `GET /customers/me` call (existing endpoint) to resolve the prefill values before first render.

## Validation

Same as `guest/prototypes/lead-form/dev-notes.md` § Validation — the prefilled name/email/phone go through the identical `Email`/`PhoneNumber` VO checks on edit, not a relaxed variant.

## States

Same as `guest/prototypes/lead-form/dev-notes.md` § States, with `filled` starting pre-populated instead of empty.

## Known limitations

Same as `guest/prototypes/lead-form/dev-notes.md`.
