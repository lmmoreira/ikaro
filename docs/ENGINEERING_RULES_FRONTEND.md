# Ikaro — Engineering Rules: Frontend (apps/web)

> **When to load:** dashboard/admin frontend, hotsite/public frontend work.
> Split from the former single `ENGINEERING_RULES.md` (TD41-S4, 2026-09-23). Summary rules are in `CLAUDE.md §7`.
> **Tags:** agent-process, web

---

## Web — Shared Helpers (`apps/web`)

### Shared format functions belong in `shared/lib/formatting/`

Any function that takes `locale`, `currency`, `timezone`, or `dateFormat` as a parameter belongs in `apps/web/shared/lib/formatting/` — not in a feature-owned folder like `features/booking/` or `features/platform/hotsite/`. The boundary test: *if the function would work identically in the booking flow and the hotsite, it's shared formatting, not domain logic.*

Current `shared/lib/formatting/` inventory:

| File | Exports |
|---|---|
| `format-money.ts` | `formatMoney(amount, locale, currency)`, `formatCurrencySymbol(locale, currency)` |
| `format-duration.ts` | `formatDuration(minutes)` |
| `format-time.ts` | `formatTime`, `formatDate`, `formatDateLong`, `formatMonthYear`, `formatMonthYearRange` (the visible-period label, e.g. "Outubro – Novembro 2026", M18-S11); re-exports `DateFormat` from `@ikaro/i18n` |
| `date-utils.ts` | `toISODate`, `toISODateInTimezone`, `addDays`, `isSameDay`, `inWindow`, `dayNumber`, `dayCarouselLabel` — pure date math |
| `calendar-day.ts` | `toLocalISODate`, `localDateFromISO`, `utcDateFromISO` — calendar-day conversions without timezone drift |
| `locale-validators.ts` | `isValidTimezone`, `resolveDateFormat` |
| `formatting-context.ts` | `FormattingContext`, `FormattingState` |
| `use-formatting.ts` | `useFormatting()` hook |

### Other shared web helpers

- `apps/web/shared/lib/api/` owns the browser/server BFF transport helpers that multiple features need.
- `apps/web/shared/lib/i18n/` owns the shared Next Intl request helpers and locale resolution logic.
- `apps/web/shared/utils/` owns pure helpers like phone and postal-code formatting, digit/hex helpers, and initials (date math lives in `shared/lib/formatting/date-utils.ts`).
- Feature-specific helpers should live under `apps/web/features/<domain>/...`; shell-specific helpers should live under `apps/web/shells/<surface>/...`.

### `DateFormat` and `TimeFormat` types — use `@ikaro/i18n`

`DateFormat` (`'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'`) and `TimeFormat` (`'24h' | '12h'`) are exported from `packages/i18n` — they derive from `CountrySpec` which already defines them. Import from there, never redefine locally:

```ts
import type { DateFormat, TimeFormat } from '@ikaro/i18n';
```

### NBSP normalization in `Intl.NumberFormat` output

`Intl.NumberFormat` for currency formatting emits non-breaking spaces that vary by locale:
- `U+00A0` (NBSP) — `pt-BR` between `R$` and the amount; `ru-RU` emits two of them
- `U+202F` (narrow NBSP) — `fr-FR` between digits and currency symbol

A bare `.replace(' ', ' ')` is wrong in two ways: no `g` flag (misses duplicates) and misses `U+202F`. Always use:

```ts
.replace(/[  ]/g, ' ')
```

### `reconstitute()` skips domain validation — guard at the web boundary

`TenantSettings.reconstitute()` (used when loading an entity from the DB) deliberately skips validation to avoid erroring on rows written before a validation rule existed. Any web code that consumes a field loaded via `reconstitute()` — such as `timezone` from the hotsite manifest — must apply a defensive guard before passing the value to a strict API like `Intl.DateTimeFormat`:

```ts
// BAD — trusts that DB row is valid; Intl throws on malformed timezone
const timezone = manifest.localization.timezone;

// GOOD — falls back to 'UTC' if DB value is malformed
const timezone = isValidTimezone(manifest.localization.timezone)
  ? manifest.localization.timezone
  : 'UTC';
```

`isValidTimezone` is in `lib/formatting/locale-validators.ts`. The same pattern applies to any manifest field whose DB-level validity is enforced only by `create()`, not `reconstitute()`.

---


## CSP allowances for a new external UI resource must be scoped to what a fresh document load can carry, not to the one page that uses it

**Content-Security-Policy is a document-response header — the browser only re-reads and re-applies it on a fresh top-level navigation, never on a Next.js client-side (`next/link`) route transition.** A CSP directive computed per-pathname in middleware (`apps/web/proxy.ts`'s `buildContentSecurityPolicy()`) only takes effect for the *document* the browser actually requested fresh; every subsequent client-side navigation inside that same document keeps enforcing whatever CSP came back with it, regardless of what the new pathname's own middleware logic would otherwise compute. Scoping a new external resource's CSP allowance narrowly — "only the one page that uses it" — is correct reasoning for a route the user always reaches via a fresh top-level load, but silently wrong for any route also reachable via client-side navigation from a page whose own CSP doesn't carry the allowance.

**Confirmed live (M20-S15, 2026-08-28):** `needsTurnstileSrc()` allowed `challenges.cloudflare.com` only when the pathname was exactly `/[slug]/lead-form`. The lead-form CTA (`LeadFormModule.tsx`) is a plain `next/link` `<Link>` from the hotsite home page — a soft navigation. A guest who loaded the home page fresh (its CSP excluded Turnstile) and then clicked the CTA kept enforcing the home page's CSP the whole time; the Turnstile script/iframe was silently blocked with no console error a casual check would catch, and the widget hung on "Verificando segurança..." forever. A hard refresh (Ctrl+F5) masked the bug during manual testing by forcing a fresh top-level load straight to `/lead-form`, which does get the correct CSP — every existing E2E spec also used `page.goto()` directly for the same reason, so none of them caught it either.

**Fix — scope the CSP allowance to the same route tree a user could soft-navigate within, not to the one page that actually needs the resource** (mirrors `needsMapsFrameSrc`'s existing tree-wide scoping in the same file):

```ts
// BAD — correct in isolation, wrong once soft navigation is possible from a page with a
// narrower CSP: a guest landing on the hotsite home page (no Turnstile allowance) and then
// clicking into /lead-form via <Link> keeps the home page's CSP the whole time.
function needsTurnstileSrc(pathname: string): boolean {
  return isHotsiteRoute(pathname) && pathname.split('/')[2] === 'lead-form';
}

// GOOD — whichever hotsite page loads fresh already carries a CSP that permits the resource,
// regardless of which page within that tree the user then soft-navigates to.
function needsTurnstileSrc(pathname: string): boolean {
  return isHotsiteRoute(pathname);
}
```

**Before adding CSP support for any new external service reachable from the UI** (a script, an iframe, a `fetch`/`connect-src` target, a font, an image host) — check every page a user could realistically soft-navigate *from* into the page that needs it, not just the page that needs it. If any such entry point's own CSP wouldn't carry the allowance, scope the directive to the whole reachable route subtree instead of the single consuming page. Widening the CSP tree-wide is almost always simpler and lower-risk than trying to force every entry point into a full top-level navigation — per the "mounting complexity" principle (CLAUDE.md §7): reach for the approach that needs no extra machinery, not the one that needs a new safeguard bolted on per entry point.

---


## Hotsite full-page components must explicitly paint `--ba-background`

**`app/[slug]/layout.tsx`'s `applyBranding()` only defines `--ba-*` CSS custom properties on the root element — it never sets an actual `background-color`.** Every existing full-page hotsite view (`/[slug]/login`, `/[slug]/booking`'s `BookingForm`, `InformationCompletionPrompt`, `Unavailable`, `SubmitInfoForm`/`SubmitInfoSuccessView`, the chatbot panel) independently wraps its own content in a `min-h-screen` element that explicitly sets `backgroundColor: 'var(--ba-background)'` — the branding variables are consumed, not inherited as an actual paint. A component that only sets `color: 'var(--ba-text)'` and skips the background falls through to the browser's default white background regardless of the tenant's actual branding.

**Confirmed via live manual testing (M20-S09 PR #433, 2026-08-26):** all 5 lead-form states (skeleton, form, login-required gate, terminal/error card, success) shipped without this, and passed every automated check — type-check, lint, `pnpm architecture-check`, and jsdom-based axe-core accessibility tests (41/41 green) — because none of them compute real rendered color contrast. The bug was invisible in CI and only surfaced when the user tested against a real dark-themed tenant (white `--ba-text`, near-black `--ba-background`): white text on the browser's default white background, completely unreadable, for every one of the 5 states.

**Fix — the established pattern, copy it exactly:**

```tsx
// BAD — text color is branded, but nothing paints an actual background
<div className="mx-auto max-w-2xl px-6 py-12" style={{ color: 'var(--ba-text)' }}>
  ...
</div>

// GOOD — matches every other full-page hotsite view
<main className="min-h-screen" style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}>
  <div className="mx-auto max-w-2xl px-6 py-12">
    ...
  </div>
</main>
```

A secondary trap in the same incident: a component with a *fixed*, non-branded accent background (e.g. a hardcoded `bg-blue-50` info callout) must pair it with a *fixed* text color (`text-blue-900`), never `--ba-text` — a dark-themed tenant's white text is invisible against a background that never changes with branding. This is the same fixed-bg/fixed-text pairing this codebase's validation/captcha banners already use (`text-red-800` on `bg-red-50`, `text-amber-800` on `bg-amber-50`) — the inconsistency was in the one component that didn't follow its own siblings' pattern.

**Since jsdom-based axe-core cannot catch this class of bug, don't treat a green component-test suite as proof a new full-page view is visually correct — this is exactly the class of defect the Local verification gate (CLAUDE.md §0) exists to catch, and is worth a real-browser check against at least one dark-themed and one light-themed tenant before considering a new public-facing page done.**

---

## Reuse the repo's UI primitives — never hand-roll a control that already exists

**Before writing any interactive control (a calendar, a date or time picker, a select, a popover, a dialog, a switch, a badge, a card), list `apps/web/shared/components/ui/` and grep the app for an existing usage — and build on that.** Writing the control from raw HTML or Tailwind (a hand-built month grid, a bare `<input type="date">`, a homemade popover or modal, a `<div>` styled as a button) when a primitive already exists is a defect, whatever the story's prototype looks like: the prototype shows the *result*, the repo already knows how to build it. A hand-rolled control also forfeits what the primitive carries for free — keyboard handling, focus management, WCAG 2.1 AA, the fixed shadcn palette, and a layout that has already been verified in a real browser (jsdom cannot catch broken layout or hit-testing, which is how M18-S01's calendar shipped three bugs).

**The inventory (account and dashboard shells — Tailwind + shadcn; hotsite pages have their own `--ba-*` building blocks, see `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md`):**

| Need | Use | A real usage to copy |
|---|---|---|
| A day (single or range) | `ui/calendar` inside `ui/popover` | `LeadFormDateRangeControl`, `ScheduleDateTimeRangeSheet`, `AvailabilityAlertPickers` |
| A time of day | `ui/time-picker` | `AvailabilityAlertPickers`, `ResourceWorkingHoursEditor` |
| A choice from a list | `ui/select`, or `ui/pill-select` for a few short options | `TimeSelectField`, `BrandingTab` |
| An on/off setting | `ui/switch-field` | `ResourceWorkingHoursEditor`, `LayoutTab` |
| A confirm / destructive prompt | `ui/alert-dialog` (or a dedicated confirmation page where the journey says so) | `DiscardChangesDialog` |
| Multi-line text | `ui/textarea` | `ManifestTab` |
| A status or count chip | `ui/badge` | `Topbar`, `LoyaltySearchResults` |
| A grouped surface | `ui/card`, `ui/section-card` | `CustomerLoyaltyPage`, `BrandingTab` |
| A save, submit or action result (error or success), or a page-level load failure | `ui/feedback-message`; in a screen with a primary action also `ui/action-pane` and `shared/lib/feedback/use-form-feedback`; a field's own message is `ui/field-feedback` — never a new `role="alert"` box (§ A form's error or success message lives in the action pane) | `NewBookingServicesStep` (`FeedbackMessage`); no screen uses `ActionPane` yet |
| A button | `ui/button` | `DiscardChangesDialog` |
| A user's avatar | `ui/avatar` | `Topbar`, `Sidebar` |
| A searchable list inside a popover | `ui/command` | `ui/font-picker` |
| Several choices from a few short options | `ui/pill-multi-select` | `RecurringScheduleFields` |
| A colour or font choice | `ui/color-picker`, `ui/font-picker` | `BrandingColorsSection`, `BrandingTab` |
| A weekday-with-hours row | `ui/week-day-row` | `ResourceWorkingHoursEditor`, `SettingsHoursSection` |
| A booking date + time-slot picker (a day strip, then the day's slots) | `AvailabilityCarousel` + `SlotPicker` (`features/booking/components/public/`) with `variant="dashboard"` in the account and dashboard shells (`hotsite` is the tenant-branded look, never used there) | `RescheduleBookingPage` |

Treat this table as a starting point, not the full list — `ls apps/web/shared/components/ui/` is the source of truth, and a feature-level component (a shared form field, a date helper in `shared/lib/formatting/`) may already do the job.

**Procedure:**
1. For each control the UI needs, name the existing primitive and one real usage *before* writing it (a story's discovery records this — `/story-discovery` § 4s).
2. If a primitive exists, compose it. Swap only colours/branding, never the structural classes.
3. If none exists, say so explicitly, then fetch the library's or shadcn's current reference source and port it wholesale (`docs/ANTI_PATTERNS.md`, the "reconstructed from memory" row; the M21-S04 hand-rolled toggle that duplicated `SwitchField` is the same defect), add it under `shared/components/ui/` with its spec so the next story reuses it — never a one-off inside a feature.
4. A deliberate deviation (the primitive cannot do what the story needs) is recorded in the story with the reason; it is never silent.

**A form that two shells both need — extract the fields, keep the shells.** The logic layer (`features/<domain>/model/`, hooks) is always shared. The *view* is duplicated per shell only when one of the two paints tenant `--ba-*` branding (the public booking steps vs `dashboard/bookings/new-booking/NewBooking*Step.tsx`), because the dashboard must never read it. When both shells are unbranded Tailwind/shadcn (the customer account and the dashboard), extract the fields card and its generic parts into the owning domain slice and let each shell keep its own title, action pane, help text, result and empty state; the shared field copy lives in a neutral i18n namespace, not under one shell's. Copying the form is the defect there. The existing specs of the first shell must pass unchanged after the move. (M23-S19, 2026-10-16: the customer's recurring-reservation form and the staff form.)

---

## A form's error or success message lives in the action pane, never at the bottom of the form

Every dashboard and customer-account screen reports a save, submit or action result through one shared pattern (TD57). Inline only — no toast, no new dependency. Build it from `ui/feedback-message`, `ui/action-pane`, `ui/field-feedback` and `shared/lib/feedback/use-form-feedback`; never draw a new `role="alert"` box. Reference: `journeys/manager/prototypes/feedback-pane/`.

| Surface | Rule |
|---|---|
| **Form with a primary action** | The form-level error and success render in a second card **below the buttons card, inside `ActionPane`**. On desktop the pane is `lg:sticky lg:top-6`, so the message follows the scroll. On mobile the fixed bottom bar renders it above the buttons, `max-height` about 6.5rem with scroll. The card exists only while there is a message. |
| **Roles** | Error `role="alert"`, success `<output>` (its implicit `status` role; SonarCloud S6819 rejects `role="status"` on a `<div>`). `FeedbackMessage` chooses both. Success persists until the next edit: the panel calls `clear()` from its `patch()`; no auto-fade. |
| **Field level** | The offending input gets `aria-invalid` and `aria-describedby` (`fieldProps(name)`), the `FIELD_INVALID_CLASS` outline, and a `FieldFeedback` under it (`id={fieldErrorId(name)}`). The first invalid field is scrolled to (`block: 'center'`) and focused. The error comes from the server (`setFromApiError(err, locale)` reads `ProblemDetail.field`) or from client validation (`setFieldErrors({ name: message })`). A `field` the form never registered leaves only the form-level message. |
| **Row action in a list** | When the action changes a status the row already shows (activate, deactivate, approve), the changed badge or button *is* the confirmation: no success text. An action with no visible change (resend invite) gets a short `FeedbackMessage size="inline"` beside the button. A failure shows the backend-resolved message inline beside the row, never a fixed string. |
| **Page level** | A load failure or a route `error.tsx` is a page-level `FeedbackMessage` with `onRetry`. Never exempt. |
| **Alignment** | Every tab or section body starts with a card level with the pane's card; intro text lives *inside* that card; only the tab bar sits above the grid. |
| **Public hotsite** | `FeedbackMessage` reads no `--ba-*`, so it is dashboard and account only. The branded counterpart is TD57-S06; until it lands the hotsite keeps `ErrorAlert variant="hotsite"`. |

The skeleton (hook, field marking, `ActionPane` with desktop and mobile actions): `docs/AGENT_PATTERNS.md` Pattern #25.

- `ActionPane` takes `actions` for the desktop card and an optional `mobileActions` for the bar (default: the same node; pass `null` for no bar). Desktop and mobile each render the controls, so give the two copies different `data-testid`s and scope an E2E click to `action-pane-desktop` (`docs/ENGINEERING_RULES_TESTING.md` § On a customer account or dashboard detail page every action exists twice).
- The mobile bar sits at `bottom-0` by default. A screen shown above the dashboard `BottomNav` passes `mobileOffsetClassName={MOBILE_ACTION_BAR_CLEARANCE_CLASS}` (`shells/dashboard/utils/mobile-action-bar.ts`); `shared/` imports nothing from `shells/`, so the caller supplies it.
- `registerField` takes any `HTMLElement`. A control that forwards no ref (`color-picker`, `pill-multi-select`, `time-picker`) attaches it to its wrapper; focus falls to the first focusable descendant.
- A spec that exercises `focusFirstInvalid` stubs `HTMLElement.prototype.scrollIntoView` (jsdom has none) with `Object.defineProperty`, and asserts `{ block: 'center' }` (§ `scrollIntoView({ block: 'start' })` in `docs/ENGINEERING_RULES_TESTING.md`).
- A new `FeedbackMessage` title that comes from an API error goes through `resolveApiErrorFeedback` / `resolveErrorMessageFromApiError`; never render `error.message` from the backend.

## Every `apps/web` route renders per request — verify the rendering mode before designing around a cache

The root layout sets `export const dynamic = 'force-dynamic'` (`apps/web/app/layout.tsx`, with its reasoning in the comment above it), so a production `next build` lists every HTML route as `ƒ` (dynamic), `app/[slug]/page.tsx` and `app/[slug]/booking/page.tsx` included. A page-level `export const revalidate = 300` does not make that page's HTML cacheable. What is cached is the **data**: `fetchManifest` and `fetchServices` carry `next.revalidate` and tags, and the hotsite and booking pages share them.

- **Before locking a design on "this page is cached" (or "static", "ISR", "stays cacheable"), read `app/layout.tsx` and the build's route table** (`pnpm --filter @ikaro/web build`, the `Route (app)` list: `○` static, `ƒ` dynamic; a local build needs the user's yes, CLAUDE.md §0) — not the page's `revalidate` export. (M23-S44 locked "the booking page stays cached" and an acceptance criterion on it in discovery, on the strength of that export; the build showed `ƒ` before and after the change, so there was nothing to preserve and the criterion had to be rewritten after merge.)
- On a dynamic route `useSearchParams` is available during the server render, so the component that reads it renders with the real query string and a `Suspense` fallback is never shown. The boundary is still worth keeping, with the plain component as its fallback: Next client-renders everything up to the nearest boundary on a prerendered route and fails the production build without one, so it keeps the route correct if the layout ever stops forcing dynamic rendering.
- Live booking data (availability, quotes, resource options) is fetched in the browser through `bffClient` and is never cached by Next.
- The caching model in full — the Data Cache that is in effect, the Full Route Cache that is not, and how on-demand revalidation uses tags — is `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § 6 Manifest Caching.

## A mutation that changes server state owned by another feature must invalidate that feature's query keys — and the E2E must navigate client-side to see it

**React Query keys are per feature (`['resources', tenantId]`, `['scheduling-exceptions', tenantId]`), and a mutation only refreshes the keys it names.** Deactivating a resource also creates "Reservas a resolver" entries and changes the sidebar badge, but `useDeactivateResource` only invalidated `['resources', tenantId]`: the manager deactivated a room, kept navigating, opened the worklist and saw an empty list and no badge until F5. The cached empty answer from the earlier visit was served as-is.

- **For every mutation, list what else the same request changes on the server** (rows another feature reads, counts, grouped lists) and invalidate those keys in `onSuccess`: `Promise.all([queryClient.invalidateQueries({ queryKey: [...] }), ...])`. `useDeactivateResource` and `useDeactivateStaff` now also invalidate `['scheduling-exceptions', tenantId]`; `useResolveSchedulingExceptions` invalidates the bookings and day-grid keys it moves.
- **The key prefix is the contract.** Invalidate the feature's prefix (`['scheduling-exceptions', tenantId]`), not one concrete child key, so a later `count` or `list` sibling is covered.
- **A mutation whose side effect lands asynchronously (an event, a cascade) can only be refreshed best-effort at `onSuccess`.** `useDeactivateStaff` raises its entries through the staff cascade event; if that lags, the next focus or mount refetch picks it up. Say so in the hook's comment instead of assuming it is synchronous.
- **Unit-test it with a query client you own** (`vi.spyOn(queryClient, 'invalidateQueries')`, then `toHaveBeenCalledWith({ queryKey: [...] })`), and **prove it end to end in Playwright by navigating client-side**: open the dependent page first (so its empty result is cached), click through the sidebar to the mutating page, mutate, click back. A `page.goto` reloads the document and throws the cache away, so it can never catch this bug. See `apps/web/e2e/scheduling-exceptions.spec.ts` ("without a reload"); removing the invalidation makes it fail.

Real incident: M23-S14, 2026-10-15 (found by the manager while testing, not by any spec).

## A detail page opened from a list must carry `?returnTo=` so its back arrow returns to that list

**The booking detail's back arrow goes to `/dashboard/bookings` (the queue) unless the URL carries `?returnTo=<a /dashboard/ path>`.** The Reservas a resolver card linked to `/dashboard/bookings/{id}` without it, so a manager who opened a booking from the worklist landed in the booking queue on back — the wrong place in the middle of a triage flow.

- **Build the link with `appendReturnTo(path, returnTo)` from `features/booking/model/booking-navigation.ts`** (the loyalty tabs and the schedule timeline already do); the destination validates it with `resolveReturnTo`, which only accepts a path starting `/dashboard/`.
- **Every list or card that opens a booking detail from somewhere other than the queue passes its own path.** The topbar back link, the aside's "Voltar" card and the reschedule/complete child routes all read the same value.
- **Cover it in the E2E that opens the detail:** click `topbar-back-button` and assert the URL is the list you came from, not just that the detail opened.

Real incident: M23-S14, 2026-10-15.

## A saved image is rendered as the URL the backend returned — the web composes no public storage URL

Every response field that refers to a saved public image is already a full URL (`docs/API_CONTRACTS.md` § Base Standards, "Stored objects in responses and requests"). Put it in `<img src>` / `next/image` as given. There is no web-side resolver for saved data: `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` is an **origin only**, read by `next.config.ts` (`remotePatterns`) and `proxy.ts` (CSP `img-src`), and nothing may append a path to it.

- **CI-enforced:** ESLint `IMAGE_BASE_URL_SELECTOR` (`apps/web/eslint.config.js`) rejects any mention of `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` outside `proxy.ts`, `next.config.ts`, `shared/lib/runtime-env/public-env.ts` and `test-utils.tsx` (specs are exempt). It does not catch a hardcoded host, a second variable, or a backend that returns a raw path — those rest on `/story-discovery` check 4h, `/pre-pr` and `/pr-review`.
- **The only image-path decision the web makes** is `isTmpImagePath()`: an upload not yet saved lives under `tmp/` in the private bucket and previews through a signed read URL (`docs/API_CONTRACTS.md` § Hotsite Image Preview).
- **On write, recover the path from the URL the form holds** with `extractRawStoragePath()` (`features/platform/hotsite/strip-resolved-image-urls.ts`), the function the hotsite editor's `stripResolvedImageUrls` uses — never a second copy. A `tmp/` path passes through unchanged.
- **A component test** that renders an image sets the base-URL variable to a deliberately wrong host and asserts the `src` is still the URL it was given; a web-side composition would change it.

Real incident: TD56-S07, 2026-10-25.
