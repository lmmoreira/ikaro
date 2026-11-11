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
| `date-utils.ts` | `toISODate`, `toISODateInTimezone`, `addDays`, `isSameDay`, `inWindow`, `dayNumber`, `dayCarouselLabel`, `monthMarkerLabel` — pure date math |
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

## The `--ba-*` exception

**A dashboard or account component never reads a `--ba-*` custom property.** The staff dashboard and the customer account (`CustomerShell`) are the fixed SaaS palette, Tailwind and shadcn (`docs/DASHBOARD_FRONTEND_ARCHITECTURE.md` § 2). `applyBranding()` defines the variables on a wrapper element, so outside that wrapper they are undefined and a use renders the browser default (a black or transparent element, with no build error: `Topbar.tsx`, `HotsiteAuthBar` and `/switch-tenant` each broke this way). Under `app/[slug]/` the wrapper (`#hotsite-root`) also encloses `my-account`, so the variables are inherited there; the account shell still stays on the fixed palette by design, because a tenant colour would repaint account chrome.

**The exception: a `features/customer` component may read `--ba-*` only if it renders inside a wrapper that applies the tenant's `applyBranding()` styles.** Three files qualify, in two flows, and no other `features/customer` file does:

| Files (`features/customer/components/`) | Flow | Where the variables come from |
|---|---|---|
| `InformationCompletionPrompt.tsx`, `InformationCompletionPhoneField.tsx` | The information-completion prompt, reached from the hotsite | `app/[slug]/layout.tsx` renders the prompt inside `#hotsite-root` |
| `TenantOptionRow.tsx` | The tenant switch (`/switch-tenant`) | `app/switch-tenant/page.tsx` sits outside `[slug]` and wraps `SwitchTenantClient` in its own `applyBranding()` div |

**Where the rule is enforced.** `scripts/pre-pr.sh` check 27 greps every changed file under `shells/dashboard/components/`, `features/*/components/dashboard/` and `features/customer/components/` for `--ba-`, and its `web_dashboard_tsx` filter excludes exactly the three files above by path. `/bad-smell-audit` WEB-10 flags the same pattern in a full audit and reads this section for the same three names. A new tenant-branded customer flow needs three changes in one PR: its wrapper, a row in the table above and its path in that filter; an exception added to the script alone is invisible to the audit and to a reader. A tenant-branded component that draws its own `<input>`, `<textarea>` or `<select>` also needs its path (or its tree) in `rawFormControlExemptPaths` in `apps/web/eslint.config.js`, the one list the raw-control lint rule reads (§ Reuse the repo's UI primitives).

**A surface painted with a tenant colour takes its text and accent from the matching derived token (TD51-S05).** A panel, a field or a card drawn on `--ba-secondary` never leaves its text on an inherited `--ba-text` or on `--ba-primary`: a tenant whose `textColor` is close to its `secondaryColor` then gets text the same colour as its background (the "Mensagem da equipe" box on the submit-info page of the `smassagem` tenant was unreadable this way). `applyBranding()` derives `--ba-secondary-text` (text readable on the secondary colour), `--ba-secondary-accent` (a label or accent) and `--ba-secondary-muted` (an input hint or a secondary line, a softened tint of the text colour that still meets 4.5:1; use it, via `BRANDED_MUTED_TEXT`, instead of an `opacity-*` class on text over the secondary colour, because an opacity lowers a colour that was derived to exactly the minimum), and the shared pieces in `shared/components/hotsite/` apply them so a caller never chooses a colour: `BrandedPanel` (a bordered panel with an optional label), `brandedFieldStyle({ invalid })` plus `BRANDED_FIELD_PLACEHOLDER_CLASS` (an input; the class styles the placeholder, which an inline style cannot reach) and `brandedSurfaceStyle` (a row, card or button that is not a panel). All three tokens are derived, so a manager gets no new editor field. **CI-enforced**: ESLint `SECONDARY_SURFACE_SELECTOR` (`apps/web/eslint.config.js`) flags a literal `backgroundColor`/`background` of `var(--ba-secondary)`, also as a template literal, a conditional or `??` branch, a computed key or a spread object. The files that may write the colour are listed by exact path in `secondarySurfaceExemptPaths` (the shared helper, `module-styles.ts` and the shell files verified to pair it with the derived tokens); a new shell file needs the same check before it is added. **Not covered, by design:** a Tailwind `bg-[var(--ba-secondary)]` class, a colour held in a constant or returned by a function, and `borderColor: 'var(--ba-secondary)'` (a border is decorative and never hides content). `branded-panel-contrast.spec.ts` pins the 4.5:1 ratios for every catalogue template and the `textColor === secondaryColor` palette.

---

## UI layer model — where a piece of UI lives, what it may import and what the repo enforces

**`apps/web` is built bottom-up in six layers (atomic design).** Read this before adding any component, hook or folder: a piece placed in the wrong layer is the commonest source of duplicated markup and of dependencies pointing the wrong way.

| Layer | Where | Holds | May import | Enforced by |
|---|---|---|---|---|
| 1. Tokens | `app/globals.css` | role-named colour tokens (`--primary`, `--border`, `--surface-app`, …) | — | `shared/lib/design-tokens/globals-css-tokens.spec.ts`, `hotsite-token-isolation.spec.ts` |
| 2. Primitives (atoms) | `shared/components/ui/` | one control or surface, no domain word in it (`button`, `input`, `badge`, `dialog`, `tabs`) | tokens, other primitives, `shared/lib` | ESLint `no-restricted-imports` (no feature, shell, provider, app or i18n import); raw controls elsewhere are lint errors |
| 3. Composed patterns (molecules) | `shared/components/ui/` too | a frame built only from primitives, repeated 3+ times (`labeled-section`, `empty-state`, `page-header`, `form-action-pane`, `feedback-message`, `filter-chip`, `choice-card`) | primitives | review |
| 4. Feature components (organisms) | `features/<domain>/components/`, grouped by flow (`bookings/detail/`, `bookings/sheets/`, `public/`) | domain-aware screens and sections that compose layers 2–3 | `ui/`, `shared/lib`, their own slice's `model/`, `hooks/`, `api/`; another slice only under the actor-scoped rule (`docs/REPOSITORY_STRUCTURE.md` § Web placement rules) | review |
| 5. Shells (templates) | `shells/dashboard/`, `shells/hotsite/` | chrome and route composition: sidebar, topbar, section shell, the topbar status context; no business policy | features, `ui/` | review |
| 6. Pages | `app/**/page.tsx`, `layout.tsx` | thin: read the route, call a fetcher, render a shell or feature component | anything | E2E only (no unit test beside a page) |

**Logic never sits in a view layer.** `model/` (pure functions, shared types), `hooks/` and `api/` hold state, effects, fetching and mapping; a component renders what they return. A `hooks/` or `model/` file imports nothing from a `components/` directory (ESLint, `shared/components/ui/**` excepted): a type both sides need lives in `model/`, and a value a component owns is passed into the hook as a parameter (`useBookingDetailTopbarSync` takes the topbar handle).

**Where does a new piece go?**

| The piece is… | Put it in |
|---|---|
| a single control with no domain word (a toggle, a field) | `shared/components/ui/`, ported wholesale from the shadcn/Radix reference with a spec (never a one-off inside a feature) |
| a frame built only from primitives that **3 or more** places already draw the same way | `shared/components/ui/` as a composed pattern; migrate the copies in the same change |
| the same, with fewer than 3 copies, or it names a domain type (`Booking`, `Service`) | the feature, in its flow folder; promote it when a third copy appears |
| form values, selection, submit state or an effect | a hook in `features/<domain>/hooks/`; the component renders it. A hook over the 40-line function cap is sub-hooks plus module-level helpers from the start, never an `eslint-disable`. Skeleton: `docs/AGENT_PATTERNS.md` Pattern #26; exemplars: `useServiceDetailsForm`, `useServiceEditSession`, `useAvailabilityCalendarState`, `useBookingSubmitRunner` |
| a fetcher or a response mapper | `features/<domain>/api/` or a BFF mapper (`docs/BFF_ARCHITECTURE.md`); never in a component |
| chrome shared by every screen of a surface | `shells/<surface>/` |
| needed by both the branded hotsite and the dashboard | share `model/` and hooks, write two views (the dashboard never reads `--ba-*`; § The `--ba-*` exception) |
| a customer's or staff's view of another domain's aggregate | the owning domain's slice, with an actor-scoped export name (`.copilot/context.md` §11) |
| route-level logic that needs a test | extract it to `shared/lib/**` or the feature and unit-test it there; `page.tsx` stays thin |

**Rules of thumb that review checks.** Promote at 3 copies, not 1 or 2: an early promotion freezes a guess, a late one leaves drift (TD58 audited `apps/web` and found 32 copies of one input string and 25 of one eyebrow, each spelled slightly differently). A `ui/` primitive uses the semantic tokens, never a raw `gray-*` or a hex literal (§ Reuse the repo's UI primitives); feature components may use the Tailwind palette classes. A screen is one folder per flow, not a flat folder of 60 files.

**What the repo enforces, and what only review catches.**

| Rule | Mechanism |
|---|---|
| a raw `<input>`, `<textarea>`, `<select>`, `<label htmlFor>` or `<button>` outside `ui/` and the tenant-branded trees | ESLint `no-restricted-syntax` (the exempt lists are by exact path in `eslint.config.js`) |
| a bare `<Input type="number">` (a numeric field with no visible unit), including `type={'number'}`, a template literal and a conditional; a `type` held in a variable or spread is the one shape the selector cannot follow | ESLint `no-restricted-syntax` (`NUMBER_INPUT_SELECTOR`; `ui/number-input.tsx` is exempt by exact path in `numberInputExemptPaths`) |
| a hand-written `role="alert"` / `role="status"`, a hardcoded locale literal, a raw `fetch()`, an `as React.CSSProperties` return | ESLint `no-restricted-syntax` |
| a `hooks/` or `model/` file importing from a `components/` directory | ESLint `no-restricted-imports` (`features/*/hooks`, `features/*/model`, `shells/*/model`); a dynamic `import()` is not covered |
| function and file size (40 lines for a `.ts` function, 200 for a `.tsx`, 250 per file) | ESLint `max-lines-per-function`, `max-lines` |
| a token without its `--color-*` alias; the hotsite reading dashboard tokens | `globals-css-tokens.spec.ts`, `hotsite-token-isolation.spec.ts` |
| a `--ba-*` variable in a dashboard or account component | `scripts/pre-pr.sh` check 27 and `/bad-smell-audit` WEB-10 (not ESLint) |
| a `shared/components/ui/**` file importing from `features/`, `shells/`, `providers/`, `app/` or `i18n/` (alias or relative; a spec may) | ESLint `no-restricted-imports` in `apps/web/eslint.config.js`; pinned by `shared/lib/eslint/ui-layer-imports.eslint.spec.ts`. A dynamic `import()` is not covered. `shared/components/hotsite/**` and `shared/lib/**` are outside it |
| **not enforced, review only:** the 3-copies promotion threshold; one folder per flow; keeping a page thin; a state-heavy component being split into a hook | — |

**Known reach-ups, not a licence to add more.** The dashboard shell hands services to features: `topbar-status-context` (14 importers), `mobile-action-bar` and `WeekNav`, and `shells/` imports `features/platform/hotsite`. Two `shared/lib` files import from a feature (`i18n/resolve-locale.ts` → `platform/api.server`, `api/bff-server.ts` → `auth/session-cookie`). Each is a deliberate seam; a new one needs the same reason written next to it.

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
| A modal that holds a form or read-only content and closes on Escape or a backdrop click | `ui/dialog` (Radix; mounted by the caller only while open, `open` + `onOpenChange`; it has **no** built-in close "X", so compose `DialogClose` with a translated label; a popover opened inside it must portal into the dialog's content element, since a modal leaves the rest inert). Never a native `<dialog>` with a hand-written focus trap | `BookingActionSheetShell` (booking's bottom-sheet molecule, used by every action sheet), `IntakeVersionModal` |
| Tabs (a tab bar or a small mode switch, with its panels) | `ui/tabs` (Radix; `TabsList variant="underline"` for a page's tab bar, `"segmented"` for a small mode switch; roving focus, arrow keys, Home/End come with it). Every tab controls a real `role="tabpanel"`: wrap each branch of a conditional block in `TabsContent` (it unmounts the inactive panel unless `forceMount`, which also needs the panel hidden), never a `role="tab"` with nothing behind it. A panel that is its own component and owns its `role="tabpanel"` and id keeps the `TabsTrigger` `id` / `aria-controls` overrides, and sets `aria-controls` only while that panel is the mounted one | `HotsiteEditorMainView`, `CustomerChooserStep` (`segmented`, one `TabsContent` per mode), `ServiceEditTabBar` (panels in their own components) |
| Single-line text or other native text-like input (not a number) | `ui/input` (same look as `ui/textarea`; `className` overrides the default `w-full`; `aria-invalid` paints the red border and background, callers still add `FIELD_INVALID_CLASS` for the ring) | `ConfigTextField`, `SettingsFormFields` |
| A number the user types (a duration, a count, points, a percentage, an amount of money) | `ui/number-input` (`NumberInput`: an `Input` with `type="number"` and the unit drawn inside the field; `unit` is a required, already-translated string, `unitPosition="prefix"` puts a currency symbol before the number; `wrapperClassName` sets the width of the whole field, `className` styles the `<input>`; it hides the browser spin buttons, which would sit under the unit). A bare `<Input type="number">` fails lint (`NUMBER_INPUT_SELECTOR`, TD51-S3). New units live in `common.units` (`minutes`, `hours`, `days`, `points`, `people`, `spots`, …); the settings page keeps its own `*Suffix` keys, so min, horas and dias exist in both places on purpose; the label no longer carries it ("Duração mínima", not "Duração mínima (minutos)"). A tenant-branded tree (`features/booking/components/public/**`) cannot use it (`--ba-*`): it keeps its raw `<input>` and draws its own branded unit | `ServiceBufferAfterMinutesField`, `PolicyNumberField`, `SuffixNumberField` (`SettingsFormFields`); branded: `IntakeAnswersStep` |
| The label of a field | `ui/label` (`htmlFor` association; carries the shared `mb-1.5 block text-sm font-semibold text-gray-900` look). A caption above a `Textarea` is `<div><Label htmlFor={id}>…</Label><Textarea id={id} /></div>` with `useId()`, never a `<label>` wrapping a styled `<span>` | `ConfigTextField`, `AboutConfigPanel`, `SettingsFormFields` |
| A tick box | `ui/checkbox` (a native `<input type="checkbox">`, found by `getByRole('checkbox')`) | `LeadFormSortableQuestion` |
| A radio button | `ui/radio` (a native `<input type="radio">`, found by `getByRole('radio')`; a radio drawn as a clickable card keeps its own wrapping `<label>`) | `ReassignSheet`, `NewBookingIntakeStep` |
| A native dropdown that must stay a real `<select>` (specs drive it with `selectOptions`, the value can be empty, or the mobile picker is wanted) | `ui/native-select` (shadcn's `NativeSelect`: a width goes on `wrapperClassName`, `className` styles the `<select>`); Radix `ui/select` stays for custom pickers | `SettingsFormFields` (`SelectField`), `SettingsHoursSection` |
| A file picker | `ui/file-input` (a native `<input type="file">`, `sr-only`; the visible control is a label), or `ui/file-dropzone` for the dashed "click to add" card (takes translated `title`/`hint`, an optional `preview`, an `invalid` flag; every other prop goes to the hidden input) | `SingleImageUploadField`, `AfterServicePhotoUpload`, `CustomerPhotoUpload` (`FileDropzone`); `GalleryImageManager` (`FileInput`) |
| Multi-line text | `ui/textarea` | `ManifestTab`, `AboutConfigPanel` |
| A status or count chip | `ui/badge`; a chip with a fixed meaning uses a tone variant (`neutral`, `info`, `success`, `warning`, all borderless) and `size="sm"` for the compact text; a chip whose colour comes from data (a status or type class map) keeps passing its own `className` | `Topbar`, `LoyaltySearchResults`; tones: `BookingParticipantsCard`, `BookingCard` |
| The uppercase eyebrow above a group of fields or cards | `ui/section-label` (`as` picks the element, default `p`; `tone="info"` is the blue form; margins stay with the caller through `className`) | `BookingDetailSection`, `MarkCompleteSummaryCard` |
| A block of a dashboard screen under its uppercase label (a card, a list, a photo grid) | `ui/labeled-section` (renders the `<section>`, the `SectionLabel` and the `mb-2` gap; the caller composes the content below it, usually a `Card`, so there are no card props; `testId`, `labelTestId` and `className` are the only options; a block where the label shares a row with a badge or action, or whose gap is not 0.5rem, stays hand-written) | `BookingStatusHistory`, `MarkCompleteSummaryCard`; with a note and divided rows: `BookingDetailSection` |
| An empty list: icon, title, body and an optional call to action | `ui/empty-state` (takes already-translated strings and an icon node; the action is a slot, so the caller owns its link and `data-testid`; the card keeps its own `<section>`, it does not compose `Card`) | `BookingEmptyState`, `RecurringScheduleList` |
| The header of a dashboard or account page: an optional eyebrow, the `h1`, an optional description and an optional actions slot (a badge, a menu) | `ui/page-header` (takes already-translated strings; the title is always the page's `h1`, the eyebrow is drawn by `SectionLabel`; it draws no card chrome, so a title shown inside a `Card` puts it inside the card, and `className="items-center"` centres the actions on a one-line title. It is not the topbar title, which stays in its provider, and a branded public or auth page keeps its own heading. A page with no container component: page widths are the shell's, and a second `PageContainer` was rejected until a third consumer needs one). The raw `<h1>`s that remain are legitimate and need no migration: the topbar title (`Topbar`), the staff login, the auth error and not-found pages, the schedule day header and the screen-reader-only heading of the recurring-schedule result. | `BookingsList`, `RecurringScheduleDetail` (description and badge), `NewRecurringScheduleForm` (eyebrow) |
| A grouped surface | `ui/card`, `ui/section-card` | `CustomerLoyaltyPage`, `BrandingTab` |
| A save, submit or action result (error or success), or a page-level load failure | `ui/feedback-message`; in a screen with a primary action also `ui/action-pane` and `shared/lib/feedback/use-form-feedback`; a field's own message is `ui/field-feedback` — never a new `role="alert"` box (§ A form's error or success message lives in the action pane) | `NewBookingServicesStep` (`FeedbackMessage`); `ResourceCreateForm`, `InviteForm` (`ActionPane` through `FormActionPane`) |
| The save and cancel buttons of a create or edit form (desktop pane, mobile bar, message under the buttons) | `ui/form-action-pane` | `ResourceCreateForm`, `InviteForm`, `StaffDetailPage` |
| A button | `ui/button`; a secondary action beside a primary one on an action rail is `variant="surface"`, a destructive one that has to stand out from the neutral rail (rejecting a recurring-schedule request beside approve) is `variant="destructive-outline"`, while a neutral triage action on the booking action panel (reject, request info, cancel) stays `surface`; a text action inside a row or a paragraph ("Remover", "Ativar", "Selecionar todos") is `variant="link" size="inline"`, red is `link-destructive` and gray is `link-muted`; an icon-only action is `size="icon"` (36px) or `icon-sm` (32px) with `variant="ghost-muted"` or `outline`; add width with `className`, never re-spell the colours. A raw `<button>` outside `ui/` fails lint (`RAW_BUTTON_SELECTOR`, TD58-S13): a genuinely bespoke control (a full-width option row, a week cell, a nav item) is added to `rawButtonExemptPaths` in `apps/web/eslint.config.js` by exact path, with the reason | `DiscardChangesDialog`; variants: `BookingActionPanel`, `RecurringApprovalActions`; text links and icons: `MemberRow`, `IntakeQuestionCard` |
| A filter row on a list screen: rounded chips, one applied, each showing a count ("Todos (12)") | `ui/filter-chip` (`selected` drives `aria-pressed` and the filled look, so it is a toggle button, not a radio; everything else is a plain button prop). A choice inside a form, with a label and group semantics, is `ui/pill-select` / `ui/pill-multi-select` instead | `ResourceListPage`, `ServiceListPage`, `TeamListPage` |
| One of a few mutually exclusive options drawn as a bordered card with a title and a hint (a booking model, a resource mode, a role) | `ui/choice-card` (`selected` drives `aria-pressed` and the blue look; a toggle button, found by its test id; `className` adds padding or alignment). A radio drawn as a card is `ui/radio` | `ServiceCreatePage`, `ServiceResourceModePicker`, `RoleOption` |
| The grip a sortable row is dragged by | `ui/drag-handle` (`label` is the translated accessible name; spread `@dnd-kit`'s `attributes` and `listeners` onto it; the six-dot icon is the default child) | `LayoutTab`, `LeadFormSortableQuestion`, `NavigationItemRow` |
| The mobile create action of a list screen (a round "+" floating above the bottom nav; desktop uses the topbar) | `ui/floating-create-button` | `ResourceListPage`, `ServiceListPage`, `TeamListPage` |
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

**Form-field conventions that go with the primitives:**
- A raw `<input>` (except `type="hidden"`), `<textarea>`, `<select>` or `<label htmlFor>` outside `shared/components/ui/` and the tenant-branded trees is a lint error (ESLint `RAW_FORM_CONTROL_SELECTORS`; the exempt list is `rawFormControlExemptPaths` in `apps/web/eslint.config.js`, which also names the branded trees). A `<label>` that wraps its control and has no `htmlFor` is allowed. A label drawn as a button for a hidden file input is the one case that keeps its `htmlFor`, with an inline disable that says so (`GalleryImageManager`).
- `ui/label` always takes `htmlFor` with the control's `id`; a `Label` with no matching control leaves the field unnamed for screen readers. A group of radios or checkboxes is a `<fieldset>` with a `<legend>` (a legend cannot be a `<label>`), and a wrapping `<label>` with a caption `<span>` around its control stays hand-written.
- Pass only the *differences* in `className` on `ui/input`, `ui/textarea` and `ui/native-select` (a width, a height, a state colour). Re-spelling the border, padding and focus string forks the look again.
- A `ui/` primitive's colours are the semantic tokens of `app/globals.css` (`bg-background`, `border-input`, `text-foreground`, `bg-primary`, `focus:ring-ring`, `text-subtle-foreground`, `border-border-strong`, `bg-destructive-tint`, …), never a raw `gray-*`/`blue-*`/`red-*` class or a hex literal; the token roles and the `@theme inline` alias trap are in `docs/DASHBOARD_FRONTEND_ARCHITECTURE.md` § 3. The tenant hotsite tree never reads them.
- A `<select>` that must stay a real native select (specs drive it with `selectOptions`, or its value can be empty) is `ui/native-select`; Radix `ui/select` does not accept `value=""` and cannot be driven that way.

**A form that two shells both need — extract the fields, keep the shells.** The logic layer (`features/<domain>/model/`, hooks) is always shared. The *view* is duplicated per shell only when one of the two paints tenant `--ba-*` branding (the public booking steps vs `dashboard/bookings/new-booking/NewBooking*Step.tsx`), because the dashboard must never read it. When both shells are unbranded Tailwind/shadcn (the customer account and the dashboard), extract the fields card and its generic parts into the owning domain slice and let each shell keep its own title, action pane, help text, result and empty state; the shared field copy lives in a neutral i18n namespace, not under one shell's. Copying the form is the defect there. The existing specs of the first shell must pass unchanged after the move. (M23-S19, 2026-10-16: the customer's recurring-reservation form and the staff form.)

---

## A form's error or success message lives in the action pane, never at the bottom of the form

Every dashboard and customer-account screen reports a save, submit or action result through one shared pattern (TD57). Inline only — no toast, no new dependency. Build it from `ui/feedback-message`, `ui/action-pane`, `ui/field-feedback` and `shared/lib/feedback/use-form-feedback`; never draw a new `role="alert"` box. Reference: `journeys/manager/prototypes/feedback-pane/`.

| Surface | Rule |
|---|---|
| **Form with a primary action** | The form-level error and success render in a second card **below the buttons card, inside `ActionPane`**. On desktop the pane is `lg:sticky lg:top-6`, so the message follows the scroll. On mobile the fixed bottom bar renders it above the buttons, `max-height` about 6.5rem with scroll. The card exists only while there is a message. |
| **Roles** | Error `role="alert"`, success `<output>` (its implicit `status` role; SonarCloud S6819 rejects `role="status"` on a `<div>`). `FeedbackMessage` chooses both. Success persists until the next edit: the panel calls `clear()` from its `patch()`; no auto-fade. |
| **Field level** | The offending input gets `aria-invalid` and `aria-describedby` (`fieldProps(name)`), the `FIELD_INVALID_CLASS` outline, and a `FieldFeedback` under it (`id={fieldErrorId(name)}`). The first invalid field is scrolled to (`block: 'center'`) and focused. The error comes from the server (`setFromApiError(err, locale)` reads `ProblemDetail.field`) or from client validation (`setFieldErrors({ name: message })`). A `field` the form never registered leaves only the form-level message. |
| **An action's failure vs a state of the booking** | A failure of the action the user just took (approve, reject, cancel, complete, reschedule, a no-show or correction that failed on the network) is a pane message with its retry. A *state* the booking is now in (the no-show `409` "already closed", an approved or cancelled result banner, a hold banner, the "precisa de decisão" notice) is page content: a banner, never `role="alert"`, pinned by a test. A sheet's own validation message stays in the sheet. |
| **Row action in a list** | When the action changes a status the row already shows (activate, deactivate, approve), the changed badge or button *is* the confirmation: no success text. An action with no visible change (resend invite) gets a short `FeedbackMessage size="inline"` beside the button. A failure shows the backend-resolved message inline beside the row, never a fixed string. |
| **Page level** | A load failure or a route `error.tsx` is a page-level `FeedbackMessage` with `onRetry`. Never exempt. |
| **Alignment and cards** | Every tab or section body starts with a card level with the pane's card; intro text lives *inside* that card (a card takes an optional `intro` prop); only the tab bar sits above the grid. Every control sits inside a card: no loose label, input, button or filter chip on the page background, including below the last card (a list screen's filter chips sit inside the list card). A floating action button is the one exemption: it is `position: fixed`, overlays the viewport instead of sitting on the page background, and cannot live in a card (the mobile create action of a list screen, `ui/floating-create-button`). Card headings use `text-sm font-semibold`; do not mix in `SectionCard`'s larger title on a page of plain `Card`s. |
| **Public hotsite** | `FeedbackMessage` reads no `--ba-*`, so it is dashboard and account only. The public hotsite uses `shared/components/hotsite/branded-feedback-message` (with `BrandedFieldFeedback` and `BRANDED_FIELD_INVALID_CLASS`): no `ActionPane`, the message sits under the submit button. Only `--ba-radius`, `--ba-body-font` and `--ba-heading-font` are branded; the colours are a fixed semantic pair painted on the box's own white surface, with an accent bar and a fixed dark 1px ring (so the white surface or the ring stands out by at least 3:1 on any tenant background), **never** `--ba-text`, `--ba-background` or a tenant colour (a tenant colour equal to the message colour would make the box vanish). Every public hotsite form and step uses it (TD57-S16 removed `ErrorAlert`); a form that can receive a backend `field` routes it through `useFormFeedback` and marks the input with `BRANDED_FIELD_INVALID_CLASS`, `aria-invalid` and `aria-describedby`. A component with a `dashboard` and a `hotsite` look (`PickerLoadError`) picks `FeedbackMessage` or the branded message by its `variant`; it never reads both skins in one markup. |

The skeleton (hook, field marking, `ActionPane` with desktop and mobile actions): `docs/AGENT_PATTERNS.md` Pattern #25.

- `ActionPane` takes `actions` for the desktop card and an optional `mobileActions` for the bar (default: the same node; pass `null` for no bar). Desktop and mobile each render the controls, so give the two copies different `data-testid`s and scope an E2E click to `action-pane-desktop` (`docs/ENGINEERING_RULES_TESTING.md` § On a customer account or dashboard detail page every action exists twice).
- The mobile bar sits at `bottom-0` by default. A screen shown above the dashboard `BottomNav` passes `mobileOffsetClassName={MOBILE_ACTION_BAR_CLEARANCE_CLASS}` (`shells/dashboard/utils/mobile-action-bar.ts`); `shared/` imports nothing from `shells/`, so the caller supplies it.
- `registerField` takes any `HTMLElement`. A control that forwards no ref (`color-picker`, `pill-multi-select`, `time-picker`) attaches it to its wrapper; focus falls to the first focusable descendant.
- A spec that exercises `focusFirstInvalid` stubs `HTMLElement.prototype.scrollIntoView` (jsdom has none) with `Object.defineProperty`, and asserts `{ block: 'center' }` (§ `scrollIntoView({ block: 'start' })` in `docs/ENGINEERING_RULES_TESTING.md`).
- A new `FeedbackMessage` title that comes from an API error goes through `resolveApiErrorFeedback` / `resolveErrorMessageFromApiError`; never render `error.message` from the backend.
- **A field-level message has no `role` — by design, always.** `FieldFeedback` and `BrandedFieldFeedback` render without `role="alert"` (TD57 Story 1, § 3a); the form-level `FeedbackMessage` / `BrandedFeedbackMessage` is the one `role="alert"` box. A field message reaches assistive technology through `aria-invalid` + `aria-describedby`, with focus moved to the first invalid input, and a `role="alert"` on each would fire several announcements beside the form-level one. A review finding asking for `role="alert"` on field messages is answered with this rule (TD57-S16 round 4). A message about a button group or picker with no single input (the availability-alert weekday pills and date and time pickers) is linked the same way: the group is a `<fieldset>` with a `<legend>` (SonarCloud S6819 rejects `role="group"` on a `<div>`) and takes `aria-describedby` pointing at the message. A form that validates on submit must announce the refusal some other way than a field role: focus moves to the first invalid input (`useFormFeedback.setFieldErrors`), or, when the invalid things are groups, a form-level `BrandedFeedbackMessage` under the buttons (`focusOnMount`, `key` bumped per refused submit so the same errors are announced again). Check this before removing a role from a field message: a failed validation that sets state and moves nothing is silent to a screen reader.
- **A hand-written `role="alert"` or `role="status"` is a lint error** (TD57-S05, ESLint `FEEDBACK_ROLE_SELECTOR`). Only `feedback-message.tsx` and `branded-feedback-message.tsx` may write the role; every other message uses the shared components above. The rule keys on the role attribute and its bypass shapes only: a role-less red box and `<output>` are not covered (`docs/ANTI_PATTERNS.md`), so a review still checks that a new message goes through `FeedbackMessage` / `BrandedFeedbackMessage`.
- **A hand-drawn red field message is a lint error too, by a naming heuristic** (TD57-S17, ESLint `FEEDBACK_FIELD_MESSAGE_SELECTOR`): a `text-red-*` class and a `data-testid` naming an error (`error` or `invalid`) on the same element or props object. A red class alone is not a usable signal (page banners, the required `*` marker, destructive links, status badges and error icons all use it; 41 elements in `apps/web` at TD57-S17, 7 of them field messages), and the pair matched exactly those 7 with no file allowlist. It is a heuristic, not proof: a field message with no `data-testid`, or one named otherwise, passes the rule, so a review still checks that every message under an input is a `FieldFeedback` / `BrandedFieldFeedback` with an `id` that the input points at with `aria-invalid` + `aria-describedby`. A message that is a **live hint**, not a submit result (a blank intake label, fewer than two legs, a lead-form question with fewer than two options), needs no focus move and no role: the control it describes carries `aria-describedby`, so a screen reader reads it on focus, and the action it blocks (Save, Publish) is already disabled.
- **A message that must name a value** (a business limit the request exceeded) takes it from the problem's `params`: the backend error carries `params`, its mapper forwards them, `errors.json` holds the `{placeholder}` and `resolveApiErrorFeedback` interpolates them. Never read the backend `detail` to build the text.
- **A panel that does not own the action pane** (the service edit tabs register their Save with the page) passes its feedback up with the action: `useRegisterTabAction(onActionChange, { …, feedback })` where `feedback` comes from `useTabFeedback(form)` (`features/booking/components/dashboard/services/service-tab-action.ts`). It is memoized on the message strings, so a re-render never re-registers an unchanged message.

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
