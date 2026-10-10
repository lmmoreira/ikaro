# Ikaro — Engineering Rules: Frontend (apps/web)

> **When to load:** dashboard/admin frontend, hotsite/public frontend work.
> Split from `docs/ENGINEERING_RULES.md` (TD41-S4, 2026-09-23). Summary rules are in `CLAUDE.md §7`.

---

## Web — Shared Helpers (`apps/web`)

### Shared format functions belong in `shared/lib/formatting/`

Any function that takes `locale`, `currency`, `timezone`, or `dateFormat` as a parameter belongs in `apps/web/shared/lib/formatting/` — not in a feature-owned folder like `features/booking/` or `features/platform/hotsite/`. The boundary test: *if the function would work identically in the booking flow and the hotsite, it's shared formatting, not domain logic.*

Current `shared/lib/formatting/` inventory:

| File | Exports |
|---|---|
| `format-money.ts` | `formatMoney(amount, locale, currency)` |
| `format-duration.ts` | `formatDuration(minutes)` |
| `format-time.ts` | `formatTime`, `formatDate`, `formatDateLong`; re-exports `DateFormat` from `@ikaro/i18n` |
| `date-utils.ts` | `toISODate`, `addDays` — pure date math |
| `locale-validators.ts` | `isValidTimezone`, `resolveDateFormat` |
| `formatting-context.ts` | `FormattingContext`, `FormattingState` |
| `use-formatting.ts` | `useFormatting()` hook |

### Other shared web helpers

- `apps/web/shared/lib/api/` owns the browser/server BFF transport helpers that multiple features need.
- `apps/web/shared/lib/i18n/` owns the shared Next Intl request helpers and locale resolution logic.
- `apps/web/shared/utils/` owns pure helpers like phone formatting, date math, and initials.
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

**The inventory (account and dashboard shells — Tailwind + shadcn; hotsite pages have their own `--ba-*` building blocks, see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`):**

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
| A button | `ui/button` | `DiscardChangesDialog` |
| A colour or font choice | `ui/color-picker`, `ui/font-picker` | `BrandingColorsSection`, `BrandingTab` |
| A weekday-with-hours row | `ui/week-day-row` | `ResourceWorkingHoursEditor`, `SettingsHoursSection` |
| A booking date + time-slot picker (a day strip, then the day's slots) | `AvailabilityCarousel` + `SlotPicker` (`features/booking/components/public/`) with `variant="dashboard"` in the account and dashboard shells (`hotsite` is the tenant-branded look, never used there) | `RescheduleBookingPage` |

Treat this table as a starting point, not the full list — `ls apps/web/shared/components/ui/` is the source of truth, and a feature-level component (a shared form field, a date helper in `shared/lib/formatting/`) may already do the job.

**Procedure:**
1. For each control the UI needs, name the existing primitive and one real usage *before* writing it (a story's discovery records this — `/story-discovery` § 4s).
2. If a primitive exists, compose it. Swap only colours/branding, never the structural classes.
3. If none exists, say so explicitly, then fetch the library's or shadcn's current reference source and port it wholesale (`docs/ANTI_PATTERNS.md`, the "reconstructed from memory" row; the M21-S04 hand-rolled toggle that duplicated `SwitchField` is the same defect), add it under `shared/components/ui/` with its spec so the next story reuses it — never a one-off inside a feature.
4. A deliberate deviation (the primitive cannot do what the story needs) is recorded in the story with the reason; it is never silent.

---

## Every `apps/web` route renders per request — verify the rendering mode before designing around a cache

The root layout sets `export const dynamic = 'force-dynamic'` (`apps/web/app/layout.tsx`, with its reasoning in the comment above it), so a production `next build` lists every HTML route as `ƒ` (dynamic), `app/[slug]/page.tsx` and `app/[slug]/booking/page.tsx` included. A page-level `export const revalidate = 300` does not make that page's HTML cacheable. What is cached is the **data**: `fetchManifest` and `fetchServices` carry `next.revalidate` and tags, and the hotsite and booking pages share them.

- **Before locking a design on "this page is cached" (or "static", "ISR", "stays cacheable"), read `app/layout.tsx` and the build's route table** (`pnpm --filter @ikaro/web build`, the `Route (app)` list: `○` static, `ƒ` dynamic; a local build needs the user's yes, CLAUDE.md §0) — not the page's `revalidate` export. (M23-S44 locked "the booking page stays cached" and an acceptance criterion on it in discovery, on the strength of that export; the build showed `ƒ` before and after the change, so there was nothing to preserve and the criterion had to be rewritten after merge.)
- On a dynamic route `useSearchParams` is available during the server render, so the component that reads it renders with the real query string and a `Suspense` fallback is never shown. The boundary is still worth keeping, with the plain component as its fallback: Next client-renders everything up to the nearest boundary on a prerendered route and fails the production build without one, so it keeps the route correct if the layout ever stops forcing dynamic rendering.
- Live booking data (availability, quotes, resource options) is fetched in the browser through `bffClient` and is never cached by Next.
- The caching model in full — the Data Cache that is in effect, the Full Route Cache that is not, and how on-demand revalidation uses tags — is `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § 6 Manifest Caching.
