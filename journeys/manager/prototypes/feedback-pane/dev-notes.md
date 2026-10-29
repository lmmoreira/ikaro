# Dev Notes — MANAGER: Feedback e painel de ações (TD57)

**Journey:** MANAGER — Feedback e painel de ações (`manager/feedback-pane.md`)
**UCs:** none — a cross-cutting UI pattern, not a use case. Source: `td/TD57-INLINE-FEEDBACK-AND-ACTION-PANE-PATTERN.md`
**Prototype:** `manager/prototypes/feedback-pane/`
**Status:** Draft — nothing here is built. Target stories: TD57-S01 (components), S02–S04 (service edit, rows), S06 (branded), S07–S16 (area migrations).

---

## Overview

Every form-level error or success message renders in a **second card directly below the buttons card**, inside the sticky action pane. The card exists only while there is a message. This prototype shows the pattern on the three surfaces TD57 touches: the staff dashboard, the customer account, and the branded public hotsite. It also shows the mobile bar and the page-level load failure.

Shared CSS: `journeys/shared/feedback-pane.css` (`.fb*` SaaS skin, `.fb-pane*`, `.fb-mobile-bar`, `.fb-ba*` branded). Colours are fixed semantic reds and greens so a message stays readable on any tenant background.

## File map

| File | Status | Action |
|---|---|---|
| `apps/web/shared/components/ui/feedback-message.tsx` | ❌ Gap | Create — TD57-S01 (`error` → `role="alert"`, `success` → `role="status"`, `inline` size, optional hint / retry / `focusOnMount`; Tailwind only, never `--ba-*`) |
| `apps/web/shared/components/ui/action-pane.tsx` | ❌ Gap | Create — TD57-S01 (props `actions`, `feedback`; desktop `hidden lg:block lg:sticky lg:top-6`; mobile fixed bar) |
| `apps/web/shared/lib/feedback/use-form-feedback.ts` | ❌ Gap | Create — TD57-S01 (`{ error, success, fieldErrors }`, `setFromApiError`, `setSuccess`, `clear`, `registerField`, `focusFirstInvalid`) |
| `apps/web/shared/lib/i18n/resolve-error-message.ts` | ✅ EXISTS | Add `resolveApiErrorFeedback(err, locale): { message, field? }` — TD57-S01 |
| Branded feedback component (built on `ErrorAlert variant="hotsite"`) | ❌ Gap | Create — TD57-S06 |
| `apps/web/features/booking/components/dashboard/services/ServiceEditPanels.tsx` | ✅ EXISTS | Extract pane + mobile bar into `ActionPane`; render feedback in the pane — TD57-S02 |
| `apps/web/features/booking/components/dashboard/services/ServiceResourceModePicker.tsx` | ✅ EXISTS | Wrap in a card level with the pane — TD57-S03 |
| `apps/web/features/staff/components/team/MemberRow.tsx` | ✅ EXISTS | Drop the unseen success text; inline failure — TD57-S04 |
| `apps/web/features/customer/components/my-account/CancelConfirmPage.tsx` | ✅ EXISTS | Move the error into the pane — TD57-S11 |

## Screen 01 / 01b / 01c / 01d — Service edit, Políticas (`ServiceEditPanels` + `ActionPane`)

**BFF call:** `PATCH /v1/services/:id` → `422 BOOKING_SERVICE_BOOKING_POLICY_INVALID`, `field: "durationMinMinutes"`.

**States:** idle (01) → submit error (01b, 01c) → success (01d). `patch()` on any edit clears the message.

| Surface | Rule |
|---|---|
| Form-level message | Second card under the buttons card, inside `<aside>`; only rendered when a message exists |
| Error | `role="alert"`; success `role="status"`; success persists until the next edit (no auto-fade, no toast) |
| Field | `aria-invalid="true"` + `aria-describedby` + red outline + inline message; driven by the server `field` and by client validation |
| Focus | First invalid field is scrolled to (`block: 'center'`) and focused. An unregistered `field` falls back to the form-level message only |

**Error copy (pt-BR):** title "Não foi possível salvar"; body "Para duração escolhida pelo cliente, informe mínimo, máximo e incremento." Success: "Alterações salvas" / "As políticas do serviço foram atualizadas." Final strings live in `packages/i18n/locales/{pt-BR,en}/errors.json` and `web.json` (both locales in the same change).

## Screen 02 — Tab alignment (`ServiceResourceModePicker`)

Every tab body starts with a card level with the pane's card; intro text sits inside that card; only the tab bar is above the grid. Measured on 2026-10-29: pane card top 145 px on every tab; first box 265 px on Recursos, 181 px on Políticas and Formulário, 145 px on Detalhes and Página pública.

## Screen 03 — Row actions (`MemberRow`)

- Activate / deactivate: the changed badge and button are the confirmation; no extra success text.
- Resend invite (no visible change): short inline confirmation beside the button (`FeedbackMessage size="inline"`, `role="status"`).
- Failure: the backend-resolved message inline beside the row (`role="alert"`), not a fixed string.

## Screens 04 / 04b — Customer account (`CancelConfirmPage`)

Same `ActionPane` and `FeedbackMessage` as the dashboard (SaaS skin; the customer account reads no `--ba-*` for feedback). Replaces the customer-only `data-testid="action-pane-desktop"` div.

## Screens 05 / 05b — Public hotsite (branded)

Branded counterpart, reads `--ba-*`. No `ActionPane`: the public hotsite has no shell, so the message sits directly under the submit button. Same `useFormFeedback` hook and `{ message, field }` resolver; only the markup differs.

## Screen 06 — Page-level failure

Load failures and route `error.tsx` use a page-level `FeedbackMessage` with a retry. They are migrated, never exempt, so the Story 5 lint rule carries no path exemptions.

## Screen 07 — Mobile bar

`fixed inset-x-0 bottom-0 lg:hidden`. The message renders above the buttons, `max-height` about 6.5 rem with scroll, so a long message never pushes the bar off screen. Content keeps `MOBILE_ACTION_BAR_CLEARANCE_CLASS`.

## Known limitations

- ⚠ The desktop pane and the mobile bar both contain the message in these static files. The real component renders one of them at a time.
- ⚠ Branded error colour is a fixed semantic red on a white surface here. Whether it stays fixed or derives from tenant tokens is undecided (TD57 open item).
- ⚠ Customer screens render their mobile pane in normal flow today, not fixed. Screen 07 shows the fixed bar; adopting it for the customer account is undecided (TD57-S01 discovery).
- ⚠ The first-box alignment numbers (screen 02) are from the current implementation. This prototype shows the target, not the current layout.

## data-testid changes

Dozens of ad-hoc ids (`service-submit-error`, `settings-submit-error`, `resource-create-submit-error`, `invite-submit-error`, `policy-error`, …) are replaced by `form-feedback`, `page-feedback`, `row-feedback`, `action-pane`, `action-pane-mobile`. The exact per-story list and the Playwright specs that reference them are in each migration story of the TD (`e2e/team-invite.spec.ts`, `e2e/team-deactivate.spec.ts`, `e2e/services-resource-config.spec.ts`, `e2e/settings.spec.ts` are the known ones).
