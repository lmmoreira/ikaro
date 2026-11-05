# Dev Notes — MANAGER: Feedback e painel de ações (TD57)

**Journey:** MANAGER — Feedback e painel de ações (`manager/feedback-pane.md`)
**UCs:** none — a cross-cutting UI pattern, not a use case. Source: `td/TD57-INLINE-FEEDBACK-AND-ACTION-PANE-PATTERN.md`
**Prototype:** `manager/prototypes/feedback-pane/`
**Status:** Stories 0–16 done (S05, the lint guard, merged in #718); S17 (nine leftover role-less field messages: intake, legs, buffer, horizon, quantity, lead-form questions; prototype `01e`; naming-heuristic lint rule; TD close) built, awaiting merge — the shared components shipped with TD57-S01; the service edit screen (all five tabs) and the five New-booking steps use them; TD57-S02 also split the policy error into per-reason codes. TD57-S03 made every service edit tab start with a card level with the pane. Done: S04 (rows), S06 (branded component), S07 (Resources), S08 (Team, deactivate screens, tenant picker), S09 (Settings), S10 (Hotsite editor) S11 (Customer account) and S14 (Recurring schedule form fields) and S05 (lint guard) and S15 (Loyalty and route error pages) and S16 (public hotsite forms; prototypes: `guest/prototypes/book-a-service`, `submit-info`, `lead-form` `01c`/`01d`, `ask-chatbot` `01e`, `customer/prototypes/book-a-service` `03c`/`16*`, `login` `00b`); S15 is built (prototypes: `staff/prototypes/fidelidade` `00c`, `01d`, `01e`); S13 (Service create, deactivate and list) is built (prototypes: `staff/prototypes/servicos` `01`, `01b`, `02b`, `02c`, `03b`, `03j`); S12 (Bookings dashboard, schedule and scheduling exceptions) is built (prototypes: `staff/prototypes/agenda` `01`, `01e`, `03e`, `04c`, `05d`; `staff/prototypes/horarios` `11`; `manager/prototypes/scheduling-exceptions` `01d`, `01j`, `01k`).

---

## Overview

Every form-level error or success message renders in a **second card directly below the buttons card**, inside the sticky action pane. The card exists only while there is a message. This prototype shows the pattern on the three surfaces TD57 touches: the staff dashboard, the customer account, and the branded public hotsite. It also shows the mobile bar and the page-level load failure.

Shared CSS: `journeys/shared/feedback-pane.css` (`.fb*` SaaS skin, `.fb-pane*`, `.fb-mobile-bar`, `.fb-ba*` branded). Colours are fixed semantic reds and greens so a message stays readable on any tenant background.

## File map

| File | Status | Action |
|---|---|---|
| `apps/web/shared/components/ui/feedback-message.tsx` | ✅ EXISTS | TD57-S01 — required `title`, optional body (`children`), `hint`, `onRetry`/`retryLabel`, `focusOnMount`, `size="inline"`; error renders `<div role="alert">`, success renders `<output>` (implicit `status` role); Tailwind only, never `--ba-*` |
| `apps/web/shared/components/ui/field-feedback.tsx` | ✅ EXISTS | TD57-S01 — the inline message under an invalid input (`id` for `aria-describedby`) and `FIELD_INVALID_CLASS`, the red outline for an `aria-invalid` input |
| `apps/web/shared/components/ui/action-pane.tsx` | ✅ EXISTS | TD57-S01 — props `actions`, `mobileActions` (default: `actions`; `null` = no bar), `feedback`, `mobileOffsetClassName` (default `bottom-0`; a screen above the dashboard `BottomNav` passes `MOBILE_ACTION_BAR_CLEARANCE_CLASS`); desktop `hidden lg:block lg:sticky lg:top-6`, mobile fixed bar |
| `apps/web/shared/lib/feedback/use-form-feedback.ts` | ✅ EXISTS | TD57-S01 — `{ error, success, fieldErrors, feedback }`, `setFromApiError`, `setError`, `setSuccess`, `setFieldErrors`, `clear`, `registerField`, `fieldProps`, `fieldErrorId`, `focusFirstInvalid` |
| `apps/web/shared/lib/i18n/resolve-error-message.ts` | ✅ EXISTS | TD57-S01 — `resolveApiErrorFeedback(err, locale): { message, field? }`; `resolveErrorMessageFromApiError` delegates to it |
| `apps/web/shared/components/hotsite/branded-feedback-message.tsx` (+ `branded-field-feedback.tsx`, `branded-feedback-palette.ts`) | ✅ EXISTS | TD57-S06 — branded counterpart: `variant` error (`role="alert"`) / success (`<output>`), `title`, `children`, `hint`, `onRetry`/`retryLabel`, `focusOnMount`; fixed semantic palette on its own white surface, 4px accent bar, a fixed dark 1px ring and a faint shadow; reads only `--ba-radius`, `--ba-body-font`, `--ba-heading-font`. Used by every public hotsite form since TD57-S16 (`ErrorAlert` removed) |
| `apps/web/features/booking/components/dashboard/services/ServiceEditPanels.tsx` | ✅ DONE | TD57-S02 — pane + mobile bar render through `ActionPane`; each tab registers its `feedback` with the action (`useTabFeedback`); Detalhes passes its own |
| `apps/web/features/booking/components/dashboard/services/ServiceResourceModePicker.tsx` | ✅ DONE | TD57-S03 — the mode buttons sit in a `Card` headed by the question, level with the pane |
| `apps/web/features/staff/components/team/MemberRow.tsx` | ✅ DONE | TD57-S04 — the changed badge/button is the confirmation; an inline failure beside the row |
| `apps/web/features/booking/components/dashboard/services/ServiceCreatePage.tsx`, `ServiceFormFields.tsx`, `ServiceDeactivatePage.tsx`, `ServiceListPage.tsx` | ✅ DONE | TD57-S13 — drawn in `staff/prototypes/servicos/` (`02b`, `02c`, `03b`, `03j`, `01`, `01b`); the pages use `FormActionPane`, `ActionPane`, `FieldFeedback` and a page-level `FeedbackMessage` |
| `apps/web/features/customer/components/my-account/CancelConfirmPage.tsx` | ✅ DONE | TD57-S11 — the error renders under the buttons, in the pane |

## Screen 01 / 01b / 01c / 01d — Service edit, Políticas (`ServiceEditPanels` + `ActionPane`)

**BFF call:** `PATCH /v1/services/:id/booking-policy` → `422` with a per-reason code (TD57-S02 replaced the catch-all `BOOKING_SERVICE_BOOKING_POLICY_INVALID`), e.g. `BOOKING_SERVICE_POLICY_DURATION_DETAILS_REQUIRED` with `field: "durationMinMinutes"`; the window codes carry the business limit in `params`. The web also blocks the three checkable rules before sending (empty custom-duration fields, max below min, per-increment pricing missing details).

**States:** idle (01) → submit error (01b, 01c) → success (01d). `patch()` on any edit clears the message.

| Surface | Rule |
|---|---|
| Form-level message | Second card under the buttons card, inside `<aside>`; only rendered when a message exists |
| Error | `role="alert"`; success `role="status"`; success persists until the next edit (no auto-fade, no toast) |
| Field | `aria-invalid="true"` + `aria-describedby` + red outline + inline message; driven by the server `field` and by client validation |
| Focus | First invalid field is scrolled to (`block: 'center'`) and focused. An unregistered `field` falls back to the form-level message only |

**Error copy (pt-BR):** title "Não foi possível salvar"; body "Para duração escolhida pelo cliente, informe mínimo, máximo e incremento." Success: "Alterações salvas" / "As políticas do serviço foram atualizadas." Final strings live in `packages/i18n/locales/{pt-BR,en}/errors.json` and `web.json` (both locales in the same change).

## Screen 01e — Live validation hints (`IntakeQuestionsCard`, `ServiceLegsPanel`, TD57-S17)

Intake and legs validation is a **live hint, not a submit result**: Publicar / Salvar is already disabled while it holds, so the message needs no role, no pane card and no focus move. The control the manager edits carries the link: each affected question label has `aria-invalid` + `aria-describedby` listing the ids that apply (a blank label also derives an empty key and two blank labels share it, so one label can point at several messages), and the "Adicionar etapa" button points at the minimum-legs message. Messages are `FieldFeedback` (no role). Related field messages migrated in the same story: `policy-recurring-horizon-error`, `resource-buffer-invalid`, `resource-type-quantity-error` (to `FieldFeedback`) and the lead-form question label/options messages (`lead-form-question-label-error`, `lead-form-question-options-error`, with `id` + `aria-describedby`).

**Copy (pt-BR):** `formularioBlankLabelError`, `formularioEmptyFieldKeyError`, `formularioDuplicateFieldKeyError`, `legsMinRequiredError` — unchanged, already in both locales.

## Screen 02 — Tab alignment (`ServiceResourceModePicker`)

Every tab body starts with a card level with the pane's card; intro text sits inside that card; only the tab bar is above the grid. Measured on 2026-10-29: pane card top 145 px on every tab; first box 265 px on Recursos, 181 px on Políticas and Formulário, 145 px on Detalhes and Página pública. TD57-S03 (measured again 2026-10-30): first box 145 px on all five tabs. The intro is an optional `intro` prop on the first card (`PolicyDurationPricingCard`, `IntakeQuestionsCard`); Recursos wraps the mode picker in a `Card` with the same small heading as its sibling cards.

## Screen 03 — Row actions (`MemberRow`)

- Activate / deactivate: the changed badge and button are the confirmation; no extra success text.
- Resend invite (no visible change): short inline confirmation beside the button (`FeedbackMessage size="inline"`, `role="status"`).
- Failure: the backend-resolved message inline beside the row (`role="alert"`), not a fixed string.

## Screens 03c / 03d — Customer account (`CancelConfirmPage`) — files in `customer/prototypes/minha-conta/`

Same `ActionPane` and `FeedbackMessage` as the dashboard (SaaS skin; the customer account reads no `--ba-*` for feedback). Replaces the customer-only `data-testid="action-pane-desktop"` div.

## Screens 01j / 01k — Public hotsite (branded) — files in `guest/prototypes/lead-form/`

Branded counterpart, reads `--ba-*`. No `ActionPane`: the public hotsite has no shell, so the message sits directly under the submit button. Same `useFormFeedback` hook and `{ message, field }` resolver; only the markup differs.

## Screen 06 — Page-level failure

Load failures and route `error.tsx` use a page-level `FeedbackMessage` with a retry. They are migrated, never exempt, so the Story 5 lint rule carries no path exemptions.

## Screen 07 — Mobile bar

`fixed inset-x-0 bottom-0 lg:hidden`. The message renders above the buttons, `max-height` about 6.5 rem with scroll, so a long message never pushes the bar off screen. Content keeps `MOBILE_ACTION_BAR_CLEARANCE_CLASS`.

## Known limitations

- ⚠ The desktop pane and the mobile bar both contain the message in these static files. The real component renders one of them at a time.
- Branded error colour is a fixed semantic red/green on the box's own white surface, never derived from tenant tokens (decided in TD57-S06 discovery: a tenant colour equal to the message colour would make the box vanish).
- ✅ Customer screens use the same fixed bottom bar (TD57-S11). `ActionPane` ships only the fixed bar, with a `mobileOffsetClassName` prop; the customer account adopts it (decided in TD57-S11).
- ⚠ The first-box alignment numbers (screen 02) are from the current implementation. This prototype shows the target, not the current layout.

## data-testid changes

Dozens of ad-hoc ids (`service-submit-error`, `settings-submit-error`, `resource-create-submit-error`, `invite-submit-error`, `policy-error`, …) are replaced by `form-feedback` (`form-feedback-mobile` inside the mobile bar), `page-feedback`, `row-feedback`, `action-pane-desktop`, `action-pane-mobile` (the names the customer account already uses). The exact per-story list and the Playwright specs that reference them are in each migration story of the TD (`e2e/team-invite.spec.ts`, `e2e/team-deactivate.spec.ts`, `e2e/services-resource-config.spec.ts`, `e2e/settings.spec.ts` are the known ones).
