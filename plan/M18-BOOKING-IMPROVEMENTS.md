# M18 — Booking Improvements

**Phase:** Local Development
**Goal:** Ongoing improvements to the public booking experience (hotsite `/[slug]/booking`) and its tenant-facing configuration surfaces. This is an open-ended milestone — stories are added incrementally as they're scoped, not a fixed set decided up front.
**Depends on:** M07 (Booking Creation), M12 (Hotsite Frontend) — individual stories below may add their own additional dependencies as needed.
**Blocks:** none yet

---

## Build order

| Story | Theme |
|---|---|
| M18-S01 | Configurable hotsite date picker (carousel/calendar) honoring `maxBookingAdvanceDays` |
| M18-S02 | Hotsite editor "Manifesto" tab: direct JSON editing of branding + layout + seo |
| M18-S03 | Dedicated SEO share image (`seo.ogImageUrl`), auto-cropped uploads, and rendering `branding.logoUrl` (topbar, footer, favicon) |
| M18-S04 | Hero banner responsive crop: breakpoint aspect-ratio, focal point, and a minimum upload resolution guard |
| M18-S05 | Hero & Booking CTA banners: tenant-configurable content position (independent X/Y anchor, decoupled from `variant`) |
| M18-S06 | Gallery module: automatic masonry layout (tile height from photo aspect ratio) |
| M18-S07 | Gallery module: "Destaque" layout — 1 large + 4 small photos, fixed 5-image template |
| M18-S08 | Hotsite editor usability: module-config Preview + discard-confirm, and a "visit live site" link |

*(more stories will be appended here as they're scoped)*

---

## M18-S01 — Configurable hotsite date picker (carousel/calendar) honoring `maxBookingAdvanceDays` ✅ Done

**Agent:** `fullstack-ts`
**Complexity:** L
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-011
**UC reference:** UC-011 (Guest Views Real-Time Calendar Availability)

### Background

Today, the public `/[slug]/booking` page renders a single fixed widget: `AvailabilityCarousel.tsx` (`apps/web/features/booking/components/public/AvailabilityCarousel.tsx`), a horizontally-scrolling strip of day buttons. Its size is controlled by `carouselDays` (`BookingCtaModuleData.carouselDays`, `packages/types/src/hotsite.ts`), a field that exists in the type/schema across all three layers (backend aggregate, `@ikaro/types`, web zod schema) but is **deliberately not exposed** in the hotsite admin editor's config panel — see the comment at `apps/web/features/platform/components/hotsite/modules/BookingCtaConfigPanel.tsx:13-14`, a decision made during M13-S36 discovery. Absent a configured value, the page falls back to a hardcoded default of `14` (`apps/web/app/[slug]/booking/page.tsx:42`).

Separately, `tenant.settings.booking.maxBookingAdvanceDays` (`TenantSettings` VO, `apps/backend/src/contexts/platform/domain/value-objects/tenant-settings.vo.ts`) is a tenant-configurable business rule (default `90`, editable today in `/dashboard/settings`'s "Agendamento" block) that bounds how far in advance a booking can be made. It is currently enforced only inside `GetAvailabilitySummaryUseCase`/`GetAvailabilityUseCase` (backend throws if a requested date range exceeds it) — **it is not present anywhere in the public hotsite manifest** (`HotsiteManifestResponse`, `GetHotsiteManifestUseCase`), so the public frontend has no way to know this boundary today.

This story does two things together because the second is meaningless without the first:
1. Makes the date-picker widget itself configurable (carousel vs. calendar), finishing what M13-S36 deliberately left half-built.
2. Threads `maxBookingAdvanceDays` through to the public frontend so both widget variants can respect it client-side, instead of only discovering the limit via a rejected API call.

### Description

Add a `datePickerType: 'carousel' | 'calendar'` field to `BookingCtaModuleData`, default `'carousel'` (no behavior change for tenants that never touch this setting). Expose it — plus the already-typed-but-hidden `carouselDays` — in `BookingCtaConfigPanel.tsx`, grouped under a new "Calendar" section, with `carouselDays` shown only when `datePickerType === 'carousel'`. When `datePickerType === 'calendar'`, the public booking page renders a new month-grid date picker instead of the existing day-carousel.

Both widgets must respect `tenant.settings.booking.maxBookingAdvanceDays`, which requires threading that value through to the public manifest first (it isn't there today).

**Branding — non-negotiable:** the new calendar is rendered on the public hotsite, so it must follow each tenant's branding configuration exactly like every other public hotsite component already does (`AvailabilityCarousel`, `SlotPicker`, etc.) — no exceptions. Concretely, it must consume the same `--ba-*` token set: `--ba-primary`/`--ba-secondary` for selected/hover/today states, `--ba-radius` for cell/button shape, `--ba-shadow`, and the inherited heading/body fonts. It must not fall back to shadcn's default styling or hardcoded colors (that's only acceptable for the tenant-agnostic dashboard `Calendar`, which this is explicitly not reusing).

### Part 1 — Expose `maxBookingAdvanceDays` on the public manifest (prerequisite)

- `apps/backend/src/contexts/platform/application/use-cases/get-hotsite-manifest.use-case.ts`: add a `booking: { maxBookingAdvanceDays: number }` field to `GetHotsiteManifestUseCaseResult`, sourced from `tenant.settings.booking.maxBookingAdvanceDays`. Populate it in both the unpublished and published return branches (it's a business rule, not CMS content — return it regardless of `isPublished`, matching how `localization` is already handled).
- `packages/types/src/hotsite.ts`: add the matching field to `HotsiteManifestResponse` (or a small `HotsiteBookingSettingsResponse` sub-type, consistent with how `HotsiteLocalizationResponse` is modeled).
- `apps/bff/src/features/platform/platform.public.controller.ts`: the `getManifest()` handler currently types the backend's `/hotsite` response as an inline intersection (`HotsiteResponse & { business: ...; localization: ... }`) and spreads it through unchanged — add `booking: ...` to that intersection so the new field survives the BFF's type layer, not just its runtime spread.
- `apps/web/app/[slug]/booking/page.tsx`: read `manifest.booking.maxBookingAdvanceDays` and pass it down to `BookingForm`.

### Part 2 — `datePickerType` field, all three layers

- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts`: add `datePickerType?: 'carousel' | 'calendar'` to `BookingCtaModuleData`.
- `packages/types/src/hotsite.ts`: mirror the field.
- `apps/web/features/platform/hotsite/module-schemas.ts`: add `datePickerType: z.enum(['carousel', 'calendar']).optional()` to `BookingCtaModuleDataSchema`, next to the existing `carouselDays` line.

### Part 3 — Config panel UI

- `apps/web/features/platform/components/hotsite/modules/BookingCtaConfigPanel.tsx`: remove the M13-S36 "deliberately not exposed" comment block; add a new "Calendar" section (visually grouped, matching the existing `PillSelect` pattern used for `variant`/`bgStyle`/`rightPanel`) containing:
  - `datePickerType` — `PillSelect` with `carousel`/`calendar` options.
  - `carouselDays` — numeric input (1–90, matching the existing zod bound), rendered only when `datePickerType` is `'carousel'` (or unset).
- New i18n keys under `dashboard.hotsitePage.layout.panels.bookingCta` in both `packages/i18n/locales/pt-BR/*.json` and `.../en/*.json` — labels for the new section heading, the pill options, and the `carouselDays` field.

### Part 4 — New calendar component

- New file `apps/web/features/booking/components/public/AvailabilityCalendar.tsx` — a month-grid date picker built on `react-day-picker` (already a dependency; see `apps/web/shared/components/ui/calendar.tsx` for how the shared dashboard instance wraps it). This is a **separate component**, not a reskin of the shared `Calendar` — per the styling boundary rule, `--ba-*` branding variables only exist under the hotsite tree, and the shared dashboard `Calendar` must stay tenant-agnostic (it hardcodes literal Tailwind colors today and is consumed by dashboard-only screens like `ScheduleDateTimeRangeSheet.tsx`).
  - Fetches availability the same way `AvailabilityCarousel` does (`fetchAvailabilitySummary`), but per visible month, refetching on forward/back navigation.
  - Styling reads `--ba-primary`, `--ba-radius`, etc. via inline styles / Tailwind arbitrary values — same technique `AvailabilityCarousel` and `SlotPicker` already use. See "Branding — non-negotiable" above.
  - Same props contract as `AvailabilityCarousel` where applicable (`slug`, `serviceIds`, `selectedDate`, `onSelectDate`) plus `maxBookingAdvanceDays: number`.
- `apps/web/features/booking/components/public/BookingForm.tsx`: branch on `datePickerType` — render `AvailabilityCarousel` (default/`'carousel'`) or `AvailabilityCalendar` (`'calendar'`).

### Part 5 — `maxBookingAdvanceDays` enforcement, per widget

- **Carousel:** clamp the fetched/rendered window to `min(carouselDays, maxBookingAdvanceDays)` when computing the `from`/`to` range (`AvailabilityCarousel.tsx`'s current `addDays(today, carouselDays - 1)` becomes `addDays(today, Math.min(carouselDays, maxBookingAdvanceDays) - 1)`). The carousel has no forward-navigation past its fetched window, so this clamp *is* the enforcement — there's no separate interaction to block.
  - `maxBookingAdvanceDays` becomes a **required** prop on `AvailabilityCarouselProps` (not optional) — per Part 7 below, both existing call sites (`BookingForm.tsx`, `RescheduleBookingPage.tsx`) are updated to always supply a real value, so the clamp applies unconditionally with no undefined-handling branch.
- **Calendar:** month navigation (prev/next) is capped at the month containing the `maxBookingAdvanceDays` boundary via DayPicker's `endMonth` prop — a tenant cannot page forward into a month that's entirely out of range. Selecting (clicking) a date after `today + maxBookingAdvanceDays - 1` (the last bookable day, inclusive) must **not** call `onSelectDate`; instead it renders visually muted/disabled (mirrors the carousel's existing `day.available === false` styling) and surfaces a message via the existing `ErrorAlert` component pattern, inline near the calendar (resolved — see "Resolved during story-discovery" below).

### Part 6 — Backend enforcement: `carouselDays` must not exceed `maxBookingAdvanceDays`

Today, `HotsiteConfig.validateLayout()` (`apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts:436-442`) only checks `module.type` membership — it never inspects `module.data`, for any module type (this is the existing, system-wide design, not a gap specific to `BookingCta`). This story adds the **first** module-data-specific business-rule check, so it's introduced as an extensible per-module-type dispatch map rather than a growing if/else chain — only `BOOKING_CTA` gets an entry; the other 7 module types get none, since they have no rule to enforce yet:

```ts
interface LayoutValidationContext {
  maxBookingAdvanceDays: number;
}

type ModuleDataValidator = (data: HotsiteModuleData, ctx: LayoutValidationContext) => void;

const MODULE_DATA_VALIDATORS: Partial<Record<HotsiteModuleType, ModuleDataValidator>> = {
  BOOKING_CTA: (data, ctx) => {
    const { carouselDays, datePickerType } = data as BookingCtaModuleData;
    // A stale carouselDays value retained from a prior carousel configuration must not block
    // saving an unrelated field once the picker has been switched to calendar.
    const isCarouselMode = (datePickerType ?? 'carousel') === 'carousel';
    if (isCarouselMode && carouselDays !== undefined && carouselDays > ctx.maxBookingAdvanceDays) {
      throw new HotsiteCarouselDaysExceedsMaxAdvanceError(carouselDays, ctx.maxBookingAdvanceDays);
    }
  },
};

private validateLayout(layout: HotsiteModule[], ctx: LayoutValidationContext): void {
  for (const module of layout) {
    if (!MODULE_TYPES.has(module.type)) {
      throw new HotsiteModuleTypeInvalidError(module.type);
    }
    MODULE_DATA_VALIDATORS[module.type]?.(module.data, ctx);
  }
}
```

- `updateContent(branding, layout, seo, ctx: LayoutValidationContext)` — drops `seo`'s default (`= DEFAULT_HOTSITE_SEO`); every call site now passes all 4 args explicitly, since `ctx` is required and there's no ergonomic benefit to a partial default in the middle of the list.
- New domain error `HotsiteCarouselDaysExceedsMaxAdvanceError extends PlatformDomainError` in `platform-domain.error.ts`, field `'carouselDays'`.
- New `PlatformErrorCode.HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE` = `'PLATFORM_HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE'` (`packages/types/src/error-codes.ts`, next to the other `HOTSITE_*` entries) — falls through `platform-error.mapper.ts`'s existing generic `PlatformDomainError → 400 BAD_REQUEST` branch (line 22); **no mapper change needed**.
- New translation entries in both `packages/i18n/locales/pt-BR/errors.json` and `.../en/errors.json`, keyed `PLATFORM_HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE`.
- `update-hotsite-content.use-case.ts`: currently only loads `HotsiteConfig` — inject `TENANT_REPOSITORY`/`ITenantRepository` (already used the same way by `GetHotsiteManifestUseCase` in this same context — not a new port). `carouselDays` vs. `maxBookingAdvanceDays` is a cross-aggregate invariant (Tenant vs. HotsiteConfig), so the tenant is read *inside* `txManager.run()` via a new locking `findByIdForUpdate(tenantId)` port method (`SELECT ... FOR UPDATE`, following the same pattern as `IStaffRepository.countActiveManagersByTenant()`) — not before the transaction opens, which would validate against a value a concurrent settings update could change before this save actually commits. Throws `TenantNotFoundError` if missing (mirrors the existing `HotsiteNotFoundError` check), then calls `config.updateContent(branding, layout, seo, { maxBookingAdvanceDays: tenant.settings.booking.maxBookingAdvanceDays })`.
- The hotsite editor's existing save-error handling surfaces this error's message inline — no new client-side pre-check is added (the backend is the single enforcement point; adding a duplicate client-side cross-field check would be redundant machinery for no additional correctness).

### Part 7 — Thread `maxBookingAdvanceDays` into the dashboard reschedule flow

`AvailabilityCarousel` isn't only used by the public hotsite — `apps/web/features/booking/components/dashboard/bookings/RescheduleBookingPage.tsx` (staff-facing reschedule) also renders it, today with a hardcoded `carouselDays={14}` and no advance-limit awareness. Since Part 5 makes `maxBookingAdvanceDays` a required prop, this call site must supply it too:

- `apps/web/app/dashboard/bookings/[id]/reschedule/page.tsx`: call the existing `fetchTenantSettings(token)` (`apps/web/features/platform/api/tenant-settings.server.ts` — already used by the settings page, no new fetcher needed) alongside `loadBookingDetailRouteData`, and pass `maxBookingAdvanceDays={settings.booking.maxBookingAdvanceDays}` down.
- `RescheduleBookingPageProps` gains `readonly maxBookingAdvanceDays: number`, forwarded to `AvailabilityCarousel`.
- Decision: staff rescheduling is now bound by the same tenant-configured advance-booking limit as customer self-service booking (not exempted) — deliberate, not a default-by-omission.

### Acceptance Criteria

- [ ] `BookingCtaModuleData.datePickerType` exists in backend aggregate, `@ikaro/types`, and web zod schema; absent/undefined behaves identically to `'carousel'` (no behavior change for existing tenants)
- [ ] `GetHotsiteManifestUseCase` / `HotsiteManifestResponse` / BFF public controller / web manifest fetch all carry `maxBookingAdvanceDays` through to the public `/booking` page
- [ ] `BookingCtaConfigPanel.tsx` has a "Calendar" section with `datePickerType` and `carouselDays` (the latter conditionally rendered); both persist through the existing hotsite-config save flow
- [ ] `AvailabilityCalendar.tsx` exists under `features/booking/components/public/`, renders a month grid via `react-day-picker`, is styled with `--ba-*` variables, and is a component distinct from `shared/components/ui/calendar.tsx`
- [ ] The calendar's selected/hover/today states visibly reflect the tenant's configured `primaryColor`/`secondaryColor`/`borderRadius` — verified against a tenant with non-default branding, not just the seed defaults
- [ ] `BookingForm.tsx` renders the correct widget based on `datePickerType`
- [ ] Carousel's effective window never exceeds `maxBookingAdvanceDays`, even if a tenant configures `carouselDays` larger than it
- [ ] `AvailabilityCarousel`'s `maxBookingAdvanceDays` prop is required; both `BookingForm` (public, from the manifest) and `RescheduleBookingPage` (dashboard, from `fetchTenantSettings`) supply it
- [ ] Calendar allows unrestricted month browsing but blocks selection past the boundary — the day renders visually muted/disabled and, without calling `onSelectDate`, a message appears via the `ErrorAlert` pattern inline near the calendar
- [ ] Saving a hotsite config where `BookingCtaModuleData.carouselDays > tenant.settings.booking.maxBookingAdvanceDays` is rejected with 400 `PLATFORM_HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE`; `HotsiteConfig.validateLayout()` enforces this via a per-module-type dispatch map (`MODULE_DATA_VALIDATORS`), not an if/else chain — only `BOOKING_CTA` has an entry
- [ ] New locale keys added to both `pt-BR` and `en` in the same commit (panel labels, calendar out-of-range message, and the new `PLATFORM_HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE` error code)
- [ ] Coverage ≥80% on changed code; `tsc --noEmit`, lint, and full test suite green

### Testing

**Unit — Vitest (`apps/web`):**
- NEW `apps/web/features/booking/components/public/AvailabilityCalendar.spec.tsx` — branding style assertions mirroring `AvailabilityCarousel.spec.tsx`'s `toHaveStyle` pattern (selected/today/hover state reads `var(--ba-primary, ...)`/`var(--ba-radius, ...)`), month-navigation triggers a refetch for the new range, clicking an in-range available day calls `onSelectDate`, clicking a day past `maxBookingAdvanceDays` renders muted/disabled and does **not** call `onSelectDate` and shows the message, loading/error states (mirroring `AvailabilityCarousel`'s existing `ErrorAlert`/retry coverage), pt-BR/en month and weekday label rendering.
- UPDATE `apps/web/features/booking/components/public/AvailabilityCarousel.spec.tsx` — new case(s) for the `min(carouselDays, maxBookingAdvanceDays)` clamp; `maxBookingAdvanceDays` is now a required prop in every existing test setup.
- UPDATE `apps/web/features/booking/components/public/BookingForm.spec.tsx` — renders `AvailabilityCarousel` vs. `AvailabilityCalendar` based on `datePickerType`.
- UPDATE `apps/web/features/booking/components/dashboard/bookings/RescheduleBookingPage.spec.tsx` — new required `maxBookingAdvanceDays` prop, forwarded to `AvailabilityCarousel`.
- UPDATE `apps/web/features/platform/components/hotsite/modules/BookingCtaConfigPanel.spec.tsx` — new "Calendar" section renders; `carouselDays` visibility toggles with `datePickerType`; `onChange` wiring for both fields.
- UPDATE `apps/web/features/platform/hotsite/module-schemas.spec.ts` — `datePickerType` enum accepts `'carousel'`/`'calendar'`/`undefined`, rejects other values.

**Unit — Jest (`apps/backend`):**
- UPDATE `apps/backend/src/contexts/platform/application/use-cases/get-hotsite-manifest.use-case.spec.ts` — `booking.maxBookingAdvanceDays` present and correct in both the unpublished and published result branches.
- UPDATE `apps/backend/src/contexts/platform/domain/hotsite-config.spec.ts` — `datePickerType` remains unvalidated by the aggregate (matches `carouselDays`/every other module-data field precedent — confirmed during `/story-discovery`, not a gap this story fixes). NEW cases: `updateContent()` throws `HotsiteCarouselDaysExceedsMaxAdvanceError` when a `BOOKING_CTA` module's `carouselDays > ctx.maxBookingAdvanceDays`; does not throw when `carouselDays` is within bound, undefined, or the module isn't `BOOKING_CTA`.
- UPDATE `apps/backend/src/contexts/platform/application/use-cases/update-hotsite-content.use-case.spec.ts` — mock `ITenantRepository` (new constructor dependency); assert `maxBookingAdvanceDays` is read from `tenant.settings.booking` and passed into `updateContent()`'s context arg; assert `TenantNotFoundError` when the tenant lookup fails (mirrors the existing `HotsiteNotFoundError` case).

**Unit — Jest (`apps/bff`):**
- UPDATE `apps/bff/src/features/platform/platform.public.controller.spec.ts` and `platform.public.controller.component.spec.ts` — manifest response's `booking` field survives the BFF's typed pass-through.

**Integration (`apps/backend`, real DB):**
- UPDATE `apps/backend/src/contexts/platform/infrastructure/controllers/hotsite.controller.integration.spec.ts` — extend the existing "unpublished" and "published hotsite" manifest test cases with `booking.maxBookingAdvanceDays` assertions, mirroring how `business`/`localization` are already asserted there. No new entity/migration in this story, so no `integration-global-setup.ts` change is needed.

**Playwright E2E (`apps/web/e2e`):**
- UPDATE `apps/web/e2e/hotsite-editor.spec.ts` — first E2E coverage of `BookingCtaConfigPanel` at all (none exists today): toggle `datePickerType` between carousel/calendar, edit `carouselDays`, save, reload, verify persisted.
- NEW test (new file or a `test.describe` block added to `guest-booking.spec.ts`) — calendar golden path: use the existing `updateHotsiteConfig` helper (`apps/web/e2e/helpers/hotsite/hotsite-api.ts`) to set the `BOOKING_CTA` module's `datePickerType: 'calendar'` via API on a test tenant, navigate to `/[slug]/booking`, verify the month grid renders, navigate months forward/back, select an in-range day, and confirm the flow proceeds into step 2/3 the same as the carousel path.
- NEW test — `maxBookingAdvanceDays` boundary in the calendar: navigate to a month beyond the configured limit, click a day past the boundary, assert the message appears and the booking flow does not advance.
- UPDATE `apps/web/e2e/guest-booking.spec.ts` — carousel clamp case: a tenant configured with `carouselDays` > `maxBookingAdvanceDays` never renders more day-options than the limit.
- UPDATE `apps/web/e2e/helpers/booking-form/index.ts` — add a calendar-flavored navigation helper alongside `navigateToStep3`/`navigateToAuthenticatedStep3` so calendar-based flows can reuse the later step 3/4 logic without duplicating it.
- **Known gap to close, not copy:** there is currently no existing E2E pattern asserting actual `--ba-*` branding values (only unit-level `apply-branding.spec.ts` and axe scans with contrast checks disabled) — add at least one E2E smoke check confirming the calendar's selected-day styling reflects a tenant's non-default `primaryColor`, since this is new coverage territory rather than a copy of an established test.

### Resolved during `/story-discovery M18-S01` (2026-07-28)

1. **Out-of-range calendar day styling:** renders visually muted/disabled before the user clicks it (mirrors the carousel's existing `day.available === false` styling) — not visually identical until click.
2. **Out-of-range message placement:** reuses the existing `ErrorAlert` component pattern, inline near the calendar (same as `AvailabilityCarousel`/`SlotPicker`) — not a toast/tooltip.
3. **`carouselDays <= maxBookingAdvanceDays` validation:** enforced server-side, in `HotsiteConfig.validateLayout()` via the `MODULE_DATA_VALIDATORS` dispatch map (see Part 6) — not a web zod cross-field check, and not left to the runtime clamp alone. Chosen over a client-side check because the backend is the single source of truth for tenant settings and the config panel doesn't otherwise load them; a client-side duplicate would be redundant machinery for no added correctness.
4. **Aggregate validation precedent:** confirmed by direct read of `hotsite-config.aggregate.ts` — `validateLayout()` only checks `module.type` membership; no module's `data` fields (not just `carouselDays`) are validated there today. `datePickerType` itself follows that same precedent (unvalidated). The *only* new aggregate validation this story adds is the `carouselDays` vs. `maxBookingAdvanceDays` cross-field business rule (Part 6) — a deliberate, scoped exception, not a general "start validating all module data" change.
5. **`RescheduleBookingPage` / dashboard reschedule flow:** `AvailabilityCarousel` is shared with the staff-facing reschedule flow, which the original story text didn't mention. Resolved as Part 7 — thread `maxBookingAdvanceDays` into that flow too via the existing `fetchTenantSettings()`, applying the same limit to staff reschedules (not exempted).

### Dependencies

None outstanding — `BookingCtaConfigPanel`, `AvailabilityCarousel`, and `tenant.settings.booking.maxBookingAdvanceDays` all already exist and ship today.

---

## M18-S02 — Hotsite editor "Manifesto" tab: direct JSON editing of branding + layout + seo ✅ Done

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-027
**UC reference:** UC-027 (Tenant Admin Manages Hotsite Content & Branding)

### Background

`HotsiteEditor.tsx` holds a single `draft: HotsiteAdminContentResponse` state (`branding`/`layout`/`seo`); the Branding, Layout, and SEO tabs are all controlled views over slices of it, and `handlePublish` sends all three together in one `PATCH /tenants/hotsite` call. There's no surface today for editing the underlying JSON directly — useful for support/debugging a tenant's config or copying a working layout between environments.

`@ikaro/validation` has Zod schemas (`HotsiteBrandingSchema`, `HotsiteModuleSchema`, `HotsiteSeoSchema`) that structurally match this exact shape, but its `package.json` explicitly documents it as **"never consumed by apps/web"**. This story does not cross that boundary — it builds a lightweight, purely structural, web-local schema instead, reusing the per-module `isValidModuleData()` already in `module-schemas.ts` for each layout item's `data`. Deep business-rule enforcement (hex color format, string length caps, enum membership, the M18-S01 `carouselDays` vs. `maxBookingAdvanceDays` check) stays backend-only, exactly as it is today for the other 3 tabs — Publish already surfaces those errors via the existing `actionBanner`.

### Description

Add a 4th tab, "Manifesto", always last (after SEO). It shows one JSON blob — `{ branding, layout, seo }`, the exact 3 keys `handlePublish` already sends — as an editable monospace `Textarea`. It follows the local-buffer-then-explicit-apply pattern this screen already established for per-module config panels (`ModuleConfigShell`'s "Aplicar"/"Cancelar"): typing never touches `draft` directly (unlike Branding/Layout/SEO's keystroke-level `onChange` — arbitrary JSON text is transiently invalid mid-edit); clicking "Aplicar" parses + structurally validates and, only if valid, merges into `draft` via `materializeLayout()`, exactly like the initial draft is built, so a JSON edit that drops a module block doesn't leave `LayoutTab`/Preview missing a row. Once applied, Preview and Publish behave exactly like edits from any other tab — no separate save path.

### Part 1 — Manifest structural schema

New `apps/web/features/platform/hotsite/manifest-schema.ts`, sibling to `module-schemas.ts`:

```ts
export interface ManifestDraft {
  branding: HotsiteBrandingResponse;
  layout: HotsiteModuleResponse[];
  seo: HotsiteSeoResponse;
}

export type ManifestParseResult =
  | { success: true; value: ManifestDraft }
  | { success: false; error: string };

export function parseManifestJson(raw: string): ManifestParseResult { ... }
```

- Structural only — mirrors the TS primitive shapes of `HotsiteBrandingResponse`/`HotsiteSeoResponse` (string/boolean/nullable), not `@ikaro/validation`'s deeper business rules.
- `layout`: 0–8 items, each `{ type: HotsiteModuleType, enabled: boolean, data: object }`; `type` values must be unique (duplicate ⇒ error — `LayoutTab`'s keys/dnd-kit ids assume uniqueness); each `data` validated via the existing `isValidModuleData(type, data)`.
- Extra/unknown top-level keys (e.g. a pasted full manifest GET response with `tenant`/`business`/`localization`/`isPublished`/`updatedAt`) are silently ignored, not rejected — only `branding`/`layout`/`seo` are read back out.
- Success result's `layout` is already run through `materializeLayout()`.
- One human-readable error message on failure (first failure only — a pre-flight sanity check, not per-field form validation).

### Part 2 — Textarea primitive

New `apps/web/shared/components/ui/textarea.tsx` (+ `.spec.tsx`) — standard shadcn wrapper, doesn't exist in this repo yet. Tenant-agnostic dashboard styling only (this screen is outside the `--ba-*` boundary already).

### Part 3 — ManifestTab component

New `apps/web/features/platform/components/hotsite/ManifestTab.tsx` (+ `.spec.tsx`), sibling to `BrandingTab`/`LayoutTab`/`SeoTab` but with a deliberately different prop shape (documented so it isn't forced into their per-keystroke `onChange` contract):

```ts
interface ManifestTabProps {
  readonly value: ManifestDraft;                    // seeds the textarea on (re)mount
  readonly onApply: (next: ManifestDraft) => void;   // called only when Aplicar succeeds
}
```

No live sync, no auto-apply on blur/tab-switch — switching away from Manifesto without clicking Aplicar discards the pending edit (mirrors `ModuleConfigShell`'s existing Cancelar-without-apply behavior elsewhere on this screen: leaving the tab is an implicit cancel, and re-entering Manifesto always reseeds the textarea from the current `draft`, never from whatever was last typed).

Reuses existing copy rather than inventing new UI text: the Aplicar button and the "changes apply to the draft, not yet public" hint both read from the already-shipped `dashboard.hotsitePage.layout.configShell.applyLabel`/`.description` keys (`useTranslations('dashboard.hotsitePage.layout.configShell')`) — same wording `ModuleConfigShell` already shows today, both literally true here too. Only the parse/validation error message needs a tab-specific key (Part 5).

### Part 4 — Wire into HotsiteEditor

- `EditorTab` gains `'manifest'`; `TABS` gains it last; new tabpanel renders `<ManifestTab value={{branding: draft.branding, layout: draft.layout, seo: draft.seo}} onApply={handleManifestApply} />`.
- `handleManifestApply(next)`: `setDraft(current => ({...current, ...next}))`; `setActionBanner(null)` — same "any edit clears a stale publish banner" rule the other three setters already follow.

### Part 5 — i18n

Reuses `dashboard.hotsitePage.layout.configShell.applyLabel` ("Aplicar"/"Apply") and `.description` ("As alterações são aplicadas ao rascunho — ainda não são visíveis no hotsite público." / "Changes are applied to the draft — they aren't visible on the public hotsite yet.") — no new keys needed for those. Exactly 2 new keys, in both `packages/i18n/locales/pt-BR/web.json` and `.../en/web.json`:

| Key | pt-BR | en |
|---|---|---|
| `dashboard.hotsitePage.tabs.manifest` | `Manifesto` | `Manifest` |
| `dashboard.hotsitePage.manifest.invalidJsonError` | `JSON inválido. Verifique a sintaxe e a estrutura (branding, layout, seo) antes de aplicar.` | `Invalid JSON. Check the syntax and structure (branding, layout, seo) before applying.` |

### Part 6 — Docs

`docs/04-USE_CASES.md` UC-027: add "Section D: Manifesto (raw JSON edit)" to the Main Flow (mirrors how "Section C: SEO (M12-S09)" was appended when SEO shipped) + a new alt flow "A3: Malformed/invalid JSON in Manifesto tab → inline error, Aplicar blocked, draft unchanged."

### Acceptance Criteria

- [ ] "Manifesto" tab renders last, after SEO
- [ ] Textarea seeds from the current draft, pretty-printed
- [ ] Valid edits, after Aplicar, flow through Preview/Publish exactly like the other 3 tabs — no separate save path, no backend/BFF changes
- [ ] Invalid JSON syntax or structurally invalid JSON (wrong types, unknown/duplicate module type, a module's `data` failing `isValidModuleData`) shows an inline error and leaves `draft` untouched
- [ ] A layout missing module types after Aplicar is backfilled via `materializeLayout()`
- [ ] Extra/unrecognized top-level keys are silently ignored
- [ ] Leaving the tab without Aplicar discards the pending edit; re-entering reseeds from the current draft
- [ ] A backend-rejected save (e.g. non-hex color that passed structural validation) surfaces via the existing `actionBanner`
- [ ] The 2 new locale keys (`tabs.manifest`, `manifest.invalidJsonError`) exist in both `pt-BR` and `en` in the same commit; the Aplicar button and hint text reuse the existing `layout.configShell.applyLabel`/`.description` keys rather than duplicating them
- [ ] Coverage ≥80% on changed code; `tsc --noEmit`, lint, full test suite green

### Testing

**Unit — Vitest (`apps/web`):**
- NEW `apps/web/features/platform/hotsite/manifest-schema.spec.ts` — valid full manifest parses; missing/extra branding fields; wrong primitive types; `seo` null vs. string vs. wrong type; layout with unknown type, duplicate type, >8 items, a module's `data` failing `isValidModuleData`; extra top-level keys ignored; success result's `layout` is materialized.
- NEW `apps/web/shared/components/ui/textarea.spec.tsx` — mirrors the other new `ui/*` primitives' spec shape (renders, forwards value/onChange/disabled).
- NEW `apps/web/features/platform/components/hotsite/ManifestTab.spec.tsx` — seeds from `value` on mount; Aplicar with valid JSON calls `onApply` once with the parsed value; Aplicar with invalid JSON shows the error and does not call `onApply`; editing the textarea without clicking Aplicar never calls `onApply`.
- UPDATE `apps/web/features/platform/components/hotsite/HotsiteEditor.spec.tsx` — loads with 4 tabs now (Manifesto last); Manifesto's Aplicar commits into the draft (`setDraft`) and clears a stale action banner, mirroring the existing Branding/Layout assertions; switching away from Manifesto without Aplicar leaves the draft unchanged.

**Playwright E2E (`apps/web/e2e`):**
- UPDATE `apps/web/e2e/hotsite-editor.spec.ts` — first E2E coverage of the Manifesto tab: open it, edit a branding color + a layout module's `enabled` flag directly in the JSON, Aplicar, Publish, reload, verify the change persisted (round-trips through the real backend); a deliberately malformed JSON (syntax error) shows the inline error and Publish is not reachable from that state; an invalid business-rule value that passes structural validation (e.g. a non-hex `primaryColor`) round-trips through the real backend rejection and shows the existing `actionBanner` error — reusing the pattern from the existing "an invalid branding color round-trips through the real backend validation" test.

### Resolved during story-discussion (2026-07-28, to confirm at `/story-discovery`)

1. **Scope:** branding + layout + seo — full parity with what Publish actually sends (not just branding+layout, which is what a raw example PATCH body happened to show).
2. **Validation depth:** lightweight structural check only, reusing `isValidModuleData` from `module-schemas.ts` for per-module `data`; `@ikaro/validation` stays off-limits to `apps/web` — its `package.json` explicitly documents it as backend/BFF-only, and crossing that boundary is a bigger architectural decision than this story's scope.
3. **Editor component:** plain shadcn `Textarea` (new primitive, doesn't exist yet), monospace, no new runtime dependency — not a CodeMirror/Monaco integration.
4. **Apply pattern:** local buffer + explicit "Aplicar", mirroring `ModuleConfigShell`'s existing pattern on this same screen. Switching tabs away from Manifesto without clicking Aplicar silently discards the pending edit (implicit cancel) — no state lifted to survive the tab unmounting.
5. **Extra/unknown top-level JSON keys** (e.g. pasting a full manifest GET response) are silently ignored rather than rejected — only `branding`/`layout`/`seo` are read back out.

### Resolved during `/story-discovery M18-S02` (2026-07-28)

1. **No `plan/journey/` prototype required.** This is a minor, self-contained addition (a textarea) to an already-shipped, already-validated screen — not a new journey. Consistent with M18-S01, which also shipped in this same milestone without a cited prototype.
2. **i18n footprint minimized by reuse, not by skipping it.** i18n itself is non-negotiable here — every other string on this screen already goes through `useTranslations()`/locale-file keys (this is how the codebase's dual pt-BR/en support works, enforced by a CI exhaustiveness check), so a hardcoded "Manifesto" label would be the one inconsistent, untranslated string on the page. What *was* trimmed: the Aplicar button and the "applies to draft, not yet public" hint reuse the already-shipped `layout.configShell.applyLabel`/`.description` keys instead of duplicating them under a new `manifest.*` block — only the tab label and the invalid-JSON error message are genuinely new copy (Part 5).

### Dependencies

None — `PATCH /tenants/hotsite` already accepts partial `branding`/`layout`/`seo`; this story is `apps/web`-only.

---

## M18-S03 — Dedicated SEO share image (`seo.ogImageUrl`), auto-cropped uploads, and rendering `branding.logoUrl` on the public hotsite ✅ Done

**Agent:** `fullstack-ts`
**Complexity:** L
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-027, `docs/VALUE_OBJECTS_REFERENCE.md`
**Prototype reference:** `plan/journey/shared/hotsite.html` (topbar + footer logo placement, validated 2026-07-29) — read this file before writing `HotsiteAuthBar`/`Footer` changes; it is the UX spec for size/placement, not just an illustration.

### Background

`buildHotsiteMetadata()` (`apps/web/features/platform/hotsite/seo.ts:62-64`) currently builds the `og:image` Open Graph tag directly from `manifest.branding.logoUrl`, hardcoding `width: 1200, height: 630` regardless of the uploaded asset's real dimensions:

```ts
images: manifest.branding.logoUrl
  ? [{ url: manifest.branding.logoUrl, width: 1200, height: 630 }]
  : [],
```

`branding.logoUrl` is used today only as a small, avatar-like brand mark — the login page's 64×64 circular badge (`apps/web/app/[slug]/login/page.tsx:43-58`) and the dashboard's Branding-tab upload/preview thumbnail (`LogoUpload.tsx`). Nothing about it is, or should be, a 1200×630 landscape image. Reusing it for `og:image` means the declared metadata is always a lie about the actual file.

`HotsiteSeo` (`apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts:183-270`) is already its own domain slice, structurally separate from `HotsiteBranding`. Adding `ogImageUrl` there follows the existing pattern rather than continuing to borrow a field from the wrong domain.

Separately: today the branding logo, despite existing in the domain model since M12, renders **nowhere on the live public hotsite page** — only on the login page. `HotsiteAuthBar` (topbar, every page) and `Footer` show only text (`tenantName`); neither has a `logoUrl` prop. A 2026-07-29 design exploration (now the validated prototype above) mocked up adding it to both.

Investigation also found **zero existing crop/aspect-ratio enforcement anywhere** in the upload pipeline: `compressImage()` (`apps/web/shared/utils/compress-image.ts:9-69`) only does a uniform proportional downscale (cap 1600px), preserving whatever aspect ratio the source file has — no cropping, client or server. This means today's `branding.logoUrl` uploads can be any shape, which the fixed square/circular slots (login badge, and now topbar/footer) will render inconsistently without a crop step.

### Description

**Part 1 — `seo.ogImageUrl` field, end-to-end:**
- New `SeoOgImageUrl`-style validation in `packages/validation/src/hotsite.ts` (or a dedicated VO in `shared/value-objects/`, per discovery) enforcing the same `tenants/<id>/hotsite/...` / `tmp/<id>/...` path shape already used for `logoUrl`.
- New signed-upload purpose **`'seo-og-image'`** (final name, confirmed at `/story-discovery`) added to **both** independent copies of the purpose enum — `apps/backend/src/contexts/platform/application/dtos/generate-hotsite-image-signed-url.dto.ts:14` and `apps/bff/src/features/platform/hotsite-admin.controller.ts:51` (currently identical: `z.enum(['branding', 'hero', 'gallery', 'about', 'booking-cta', 'testimonials'])`) — same-commit update, not automatically in sync.
- **`HotsiteImagePathsService.collect()`/`mapPaths()`** (`apps/backend/.../domain/services/hotsite-image-paths.service.ts`) currently only walk `branding.logoUrl` + `layout` module image fields — **`seo` is not in their signature at all today.** Both methods need a `seo: HotsiteSeo` parameter added (and `collect`/`mapPaths` extended to read/rewrite `seo.ogImageUrl`), and the one call site in `hotsite-image-promotion.service.ts:47,73` updated to pass it — otherwise a `tmp/...` `seo.ogImageUrl` silently never gets promoted to its permanent path on save.
- **`HotsiteImageUrlResolver.resolve()`** (`apps/backend/.../domain/services/hotsite-image-url-resolver.service.ts`) has the identical gap — its `ResolvedHotsiteContent` return type only has `branding`/`layout`. Needs a `seo` parameter/return field too. `GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` currently do `seo: content.seo` with **zero** resolution (never needed it — `seo` never held a storage path before `ogImageUrl`); both use cases need to route `seo` through the resolver, or `GET /hotsite` returns a raw, unresolved storage path instead of a public URL.
- **No migration needed:** `HotsiteConfigEntity.seo` (`apps/backend/.../entities/hotsite-config.entity.ts:19`) is a single `jsonb` column — `ogImageUrl` is just a new key on the `HotsiteSeo` interface/VO, same as `branding`/`layout` already are. Purely an application-code change (TS type, Zod schema, VO validation); no DDL.
- `HotsiteAdminContentResponse`/`HotsiteManifestResponse` (`@ikaro/types`) gain `seo.ogImageUrl`; `UpdateHotsiteContentDto`'s `HotsiteSeoSchema` gains the same field.
- **New `OgImageUpload.tsx`** (`apps/web/features/platform/components/hotsite/`), mirroring `LogoUpload.tsx`'s thin-wrapper pattern around `SingleImageUploadField` — fixed `purpose="seo-og-image"`, landscape-appropriate preview treatment (not the `previewSize="small"` square treatment `LogoUpload` uses). Wired into `SeoTab.tsx`, which today renders only `title`+`description` (confirmed — no image field exists there yet). No new `plan/journey/` prototype for this addition — same "minor, self-contained addition to an already-shipped, already-validated screen" reasoning as M18-S02's Manifesto tab.
- **New i18n keys** (both `packages/i18n/locales/pt-BR/web.json` and `.../en/web.json`, same namespace as the existing `dashboard.hotsitePage.seo.*` keys): `dashboard.hotsitePage.seo.ogImageLabel`, `.ogImageFormatHint`, and `.ogImageRemove`. Reuses the existing generic `dashboard.hotsitePage.branding.{logoClickToAdd,logoUploading,logoUploadError}` keys for the shared upload-interaction copy (identical wording regardless of field) rather than duplicating them under `seo.*` — only the field-specific label/format-hint/remove copy is new.
- `buildHotsiteMetadata()` updated to read `manifest.seo.ogImageUrl` with real `width`/`height` reflecting the enforced crop ratio (Part 2). **Null/empty `seo.ogImageUrl`:** `openGraph.images` is omitted entirely (conditional spread, not an empty-array value) — the object literally has no `images` key. No fallback to `branding.logoUrl`, since a square logo in a landscape slot is exactly the bad outcome this story fixes.

**Part 2 — Auto center-crop on upload (no crop-UI library, no user interaction):**
- Extend `compressImage()` with an optional `targetAspectRatio` parameter: before the existing proportional downscale, center-crop the source image (via the same canvas it already draws onto) to that ratio.
- Apply **ratio 1:1** to the existing `'branding'` upload purpose (`SingleImageUploadField.tsx` call site used by `LogoUpload.tsx`) — changes behavior for new `branding.logoUrl` uploads going forward only; no backfill of already-stored logos.
- Apply **ratio ~1.91:1** (1200×630) to the new `'seo-og-image'` purpose.
- Explicitly not: an interactive drag/zoom cropper (no new dependency — `react-easy-crop`/`cropperjs` etc. are not being introduced) and not a reject-on-mismatch validator. Automatic, deterministic, zero extra user steps.

**Part 3 — Render `branding.logoUrl` on the public hotsite, per the validated prototype:**

Per `plan/journey/shared/hotsite.html`'s topbar section: a small circular image (`1.75rem` / 28px, `object-fit: cover`, `border-radius: 9999px`) to the left of the brand name, ahead of the "Área da Equipe" link (separated by the existing divider). Per the footer section: same treatment at `1.25rem` / 20px, above the address/phone line.

- **`HotsiteAuthBar`** (`apps/web/shells/hotsite/components/HotsiteAuthBar.tsx`): add `logoUrl: string` and `tenantName: string` props (currently only takes `slug`). Wire at both call sites — `apps/web/app/[slug]/page.tsx:74` (already destructures `branding` at line 52 — pass `branding.logoUrl`) and `apps/web/app/[slug]/booking/page.tsx:47` (fetches `manifest` at line 32 but doesn't destructure `branding` yet — add it).
- **`Footer`** (`apps/web/shells/hotsite/components/Footer.tsx`): add `logoUrl: string` prop to `FooterProps`. Wire at `apps/web/app/[slug]/page.tsx:120-127` (same `branding` already in scope) **and** the admin live-preview call site `apps/web/features/platform/components/hotsite/HotsitePreview.tsx:262-269` (`branding.logoUrl` already in scope via `resolveDraftImageUrls` at lines 140-141) — this second call site must be updated in the same commit or the build breaks on the now-required prop.
- **Null/empty `branding.logoUrl` fallback (mandatory — do not skip):** reuse the exact pattern already established in `apps/web/app/[slug]/login/page.tsx:43-58` — `logoUrl ? <Image ... /> : <div>{firstLetter}</div>` — a circular badge using `--ba-primary` background / `--ba-btn-text` text color, showing `displayName.charAt(0).toUpperCase()` (via the already-existing `resolveHotsiteDisplayName(manifest)` helper), sized to match each slot (28px in the auth bar, 20px in the footer). Both `HotsiteAuthBar` and `Footer` must implement this ternary — a tenant with no logo uploaded yet must never render a broken/empty `<img>`.

**Part 4 — Browser tab favicon:**

`apps/web/app/[slug]/layout.tsx` has no `generateMetadata()` today — no tenant hotsite page sets a favicon, so every tenant shows the browser's blank/default tab icon (confirmed: no `icon`/`apple-icon` metadata anywhere under `app/[slug]/`, no favicon file in `public/`).

- Add `generateMetadata()` to `apps/web/app/[slug]/layout.tsx`, returning `icons: { icon: [{ url: manifest.branding.logoUrl }] } }` when `branding.logoUrl` is set. This layout already calls `fetchManifest(slug)` (line 20) for `applyBranding`/locale — Next.js's `fetch()` request memoization should dedupe the identical call `generateMetadata()` needs, so this isn't a second network round-trip in practice.
- **Null/empty `branding.logoUrl`:** omit `icons` entirely (browser/framework default favicon). Unlike the topbar/footer, a `<link rel="icon">` cannot render a DOM fallback (no letter-avatar badge is possible for a favicon) — there is no meaningful fallback beyond "don't set one."
- Since `branding.logoUrl` is guaranteed square after Part 2's crop, the same stored file is reused directly across the topbar, footer, and favicon — no separate favicon-specific asset, no additional crop. (Reusing one file across all three is the intended behavior, not a shortcut — same reasoning as any site's single `favicon.ico` referenced everywhere; the browser caches the one fetch.)
- **Scope resolved at `/story-discovery`: single `icon` size only — no Apple touch icon (180×180).** An Apple touch icon needs meaningfully more source resolution than the 28–32px targets here; upscaling a small tenant-uploaded logo to 180px would look soft. Adding that support later is a narrow follow-up (a minimum-source-resolution check on the `'branding'` purpose), not part of this story.
- Layout-level metadata applies to every page nested under `app/[slug]/` (main hotsite, `/booking`, `/login`) in one place.

### Acceptance Criteria

- [ ] `seo.ogImageUrl` persists through the same admin PATCH flow as `branding`/`layout`/`seo.title`/`seo.description`
- [ ] `OgImageUpload.tsx` renders in `SeoTab.tsx`; uploading sets `seo.ogImageUrl` on the draft, same interaction pattern as `LogoUpload.tsx` in `BrandingTab.tsx`
- [ ] The 3 new i18n keys (`dashboard.hotsitePage.seo.ogImageLabel`, `.ogImageFormatHint`, `.ogImageRemove`) exist in both `pt-BR` and `en` in the same commit
- [ ] Both upload-purpose enums (`generate-hotsite-image-signed-url.dto.ts` and `hotsite-admin.controller.ts`) include `'seo-og-image'` — updated together, not just one
- [ ] New `'branding'` and `'seo-og-image'` uploads are auto center-cropped (1:1 / 1.91:1 respectively) before storage — verified by checking the uploaded file's actual dimensions, not just that upload succeeds
- [ ] `HotsiteImagePathsService.collect()`/`mapPaths()` include `seo.ogImageUrl` in their field walk — a `tmp/...` `seo.ogImageUrl` is actually promoted on save, not silently skipped
- [ ] `HotsiteImageUrlResolver.resolve()` (and both `GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` call sites) resolve `seo.ogImageUrl` to a full public URL — `GET /hotsite` never returns a raw storage path for this field
- [ ] `tmp/...` staging path is promoted to a permanent `tenants/<id>/hotsite/...` path on save, same as `logoUrl`
- [ ] `GET /hotsite` manifest resolves `seo.ogImageUrl` to a full public URL, same as `branding.logoUrl`
- [ ] `buildHotsiteMetadata()` builds `og:image` from `manifest.seo.ogImageUrl` with accurate `width`/`height`; `openGraph.images` is omitted entirely (not an empty array) when `seo.ogImageUrl` is null/empty (no fallback to `branding.logoUrl`)
- [ ] `HotsiteAuthBar` renders `branding.logoUrl` (28px circle) on both the main hotsite page and the booking page; falls back to the initial-letter badge (matching `login/page.tsx`'s exact pattern) when empty
- [ ] `Footer` renders `branding.logoUrl` (20px circle) on the main hotsite page and the admin preview; same initial-letter fallback when empty
- [ ] All 4 render call sites (`app/[slug]/page.tsx` ×2, `app/[slug]/booking/page.tsx`, `HotsitePreview.tsx`) updated in the same commit — no broken build from an unaddressed required prop
- [ ] Browser tab favicon reflects `branding.logoUrl` on every page under `app/[slug]/` (main, booking, login) when set; falls back to the browser/framework default when empty — no letter-avatar fallback attempted (not possible for a `<link rel="icon">`)
- [ ] `seo.ogImageUrl` validated on both BFF and backend layers, scoped by the existing `tenant_id`-keyed `hotsite_configs` row (no new migration/DDL — it's a new key on the existing `seo` jsonb column)
- [ ] Coverage ≥80% on changed code; `tsc --noEmit`, lint, full test suite green

### Testing

**Backend:** unit + integration coverage for the new VO/validation; `HotsiteImagePathsService.spec.ts` and `HotsiteImageUrlResolver.spec.ts` updated to cover `seo.ogImageUrl` alongside their existing `branding`/`layout` cases (collect, mapPaths, resolve); `GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` specs updated to assert `seo.ogImageUrl` comes back resolved, not raw. No new migration to register.
**BFF:** schema validation for the new upload purpose (both enum locations) and the new `seo.ogImageUrl` field on the admin PATCH DTO.
**Web (Vitest):**
- `compress-image.spec.ts` updated — center-crop-to-ratio produces the expected output dimensions for both 1:1 and 1.91:1 targets, for both landscape- and portrait-sourced inputs.
- NEW `OgImageUpload.spec.tsx` — mirrors `LogoUpload.spec.tsx`'s existing test shape (renders, forwards purpose, upload triggers `onChange`).
- UPDATE `SeoTab.spec.tsx` — renders the new upload field alongside title/description; upload sets `seo.ogImageUrl` on the emitted value.
- `seo.spec.ts` updated — `og:image` reads from `manifest.seo.ogImageUrl` with correct `width`/`height`; `openGraph.images` key omitted entirely (not an empty array) when unset.
- `HotsiteAuthBar.spec.tsx` and `Footer.spec.tsx` updated — renders the logo image when `logoUrl` is set; renders the initial-letter fallback badge when empty/null.
- NEW/updated spec for `buildHotsiteIconsMetadata()` (`apps/web/features/platform/hotsite/seo.ts`) — returns the `icon` entry when `branding.logoUrl` is set; omits `icons` when empty. `app/[slug]/layout.tsx`'s `generateMetadata()` itself stays a 4-line pass-through with no direct spec (CLAUDE.md: layout.tsx/page.tsx are Playwright E2E only).
**Playwright E2E:** upload + auto-crop + publish an SEO share image, reload, verify the resolved `og:image` meta tag; upload a branding logo and verify it now appears in the topbar, footer, and `<head>`'s `<link rel="icon">` on the live hotsite page; a tenant with no logo uploaded shows the letter-fallback badge in the topbar/footer and the default favicon in the tab.

### Dependencies

None — no migration for `seo.ogImageUrl` itself (see Part 1); existing `branding.logoUrl` upload/promotion/resolver services and `compressImage()` are extended, not replaced.

### Resolved during PR review (Codex, PR #291, 2026-07-29)

Cross-tool review surfaced several findings; verified each against the actual diff before acting (some were pre-existing characteristics this story didn't introduce, not regressions):

1. **Optimistic locking added to `hotsite_configs`** (new, not pre-existing scope) — the config row had no version guard at all; two concurrent `PATCH` requests could silently last-write-wins, including deleting an image a concurrent request had just started referencing. Fixed by mirroring `Booking`'s existing pattern exactly (`docs/ENGINEERING_RULES.md` § TypeORM optimistic locking on detached entities): new `version` column (migration `1748400000009-AddVersionToHotsiteConfigs`), `@VersionColumn` on the entity, `HotsiteConfig.version`/`markPersisted()`, and `TypeOrmHotsiteConfigRepository.save()` rewritten to insert-vs-guarded-`UPDATE ... WHERE id AND tenant_id AND version`, throwing a new `HotsiteConfigConcurrentModificationError` (409) on `affected !== 1`.
2. **Image promotion parallelized** — `HotsiteImagePromotionService`'s existence-check loop and copy/delete loop were both sequential (`for...await`), adding one round-trip of latency per image. Changed to `Promise.all` (simple fix, appropriate for MVP scale — a full outbox-based redesign, decoupling promotion from the request lifecycle entirely, is a larger follow-up if image counts grow).
3. **PII redacted from promotion-failure logs** — the original uploaded filename survived into storage paths and was logged verbatim on failure. New `redactStoragePathForLogging()` util (`shared/utils/`) strips the final filename segment, keeping the `<uuid>` segment that already uniquely identifies the object for debugging.
4. **Direct `HotsiteImageUrlResolver.spec.ts` added** — this class had zero direct unit coverage (only indirect, via `hotsite-content-reader.service.spec.ts`); the story's Testing section had assumed a spec already existed to "update."
5. **BFF component spec, Playwright E2E** — added per the Testing section above (both were previously scoped but not delivered in the initial pass).
6. **i18n key names corrected in this doc** (see Description/AC above) — the doc had drifted from what was actually implemented (`ogImageFormatHint`/`ogImageRemove` vs. the originally-guessed `ogImageHint`).

**Not fixed — confirmed pre-existing, out of scope for this story:** `UpdateHotsiteContentUseCase`'s merge-before-transaction read pattern (same shape existed for `branding`/`layout` before this story — the new version guard above closes the actual data-loss risk, but a full redesign of the use case's read/merge ordering is separate); `hotsite-admin.controller.ts` lacking a component spec (pre-existing gap across its other 7 endpoints, not introduced here — this story's endpoints reuse existing routes, only the Zod enum changed).

### Resolved during PR review (CodeRabbit, PR #291, 2026-07-29 — second pass)

1. **`openGraph.images` now genuinely omitted, not just empty-array** — the earlier "empty array is behaviorally equivalent to omission" reasoning was correct for the rendered HTML, but two independent reviewers flagged it, so `seo.ts` was changed to a conditional spread (`...(ogImageUrl ? { images: [...] } : {})`) that actually removes the key, settling the ambiguity for good. Tests updated to assert `not.toHaveProperty('images')`.
2. **BFF component spec fixed a real bug** — a test labeled "concurrent modification" mocked/asserted `422` instead of the real `409` `HotsiteConfigConcurrentModificationError` contract this same PR added; corrected to `409`.
3. **`HotsitePreview.tsx`'s tmp/-signed-URL batch fixed to isolate per-path failures** — `Promise.all` without per-item `catch` meant one failing signed-URL request discarded every other path's already-successful result, contradicting the "best-effort" comment already there. Pre-existing pattern (not introduced by this story — `seo.ogImageUrl` just joined the same batch), but cheap to fix and directly adjacent to this story's changes, so fixed here rather than deferred. New test covers the isolation.
4. **`HotsiteImagePurpose` deduplicated** — was independently retyped in both `SingleImageUploadField.tsx` and `tenant-settings.ts`; moved to `@ikaro/types` (alongside `ImageContentType`, already shared) and both files now import it. (A third/fourth copy still exists in the backend and BFF Zod enums — those are runtime validators, not just a type, and already flagged in this same section above as an accepted, pre-existing duplication pattern for this codebase; not further consolidated here.)
5. **Reviewed, not changed:** the `as unknown as HotsiteSeo` cast in `hotsite-config.spec.ts`'s legacy-row regression test — tightened to cast the whole `HotsiteSeo` type directly (was redundantly redefining its shape inline) with a comment explaining why a cast is unavoidable here (the test's entire point is representing data that violates the current type by design; a real `withSeo()` builder setter would itself require the field, unable to construct this scenario at all). Not introducing a new "reconstitution builder" abstraction for one edge-case test — this file's other `reconstitute()` calls already use plain typed object literals with no builder, an established pre-existing pattern here, not something this story should unilaterally change.
6. **Reviewed, not changed:** `packages/types/src/hotsite.ts`'s `ogImageUrl: string` (required, not optional) — matches the exact existing convention `HotsiteBrandingResponse.logoUrl: string` already established in this same file (required string, empty-string-when-unset, never optional/nullable). Backward compatibility for pre-existing rows is already handled at the true source (`seoReconstitute()`'s `?? ''` default, added earlier in this same PR) — every real API response always includes the field.
7. **Reviewed, not changed (stale finding):** a request to rename `ogImageFormatHint` back to `ogImageHint` — this is the same doc-vs-code mismatch already resolved in item 6 of the section above, in the opposite direction (doc updated to match the shipped, more-consistent-with-`logoFormatHint` code, not the other way around).
8. **Reviewed, not changed:** `seo.ogImageUrl`'s validation regex (`HOTSITE_LOGO_URL_REGEX`, reused from `logoUrl`) checks only the generic `tenants/<id>/hotsite/...` / `tmp/<id>/<segment>/<uuid>/<file>` shape — it doesn't pin the purpose folder to `seo-og-image` specifically, so a client could in principle PATCH `seo.ogImageUrl` to point at an already-uploaded `branding` (or any other purpose's) path, bypassing the landscape-crop guarantee. Real, but **symmetric with every other image field in this file** — `logoUrl` itself has never purpose-locked either, and this predates M18-S03 entirely. Purpose-locking only the newest field would be an inconsistent special case (CLAUDE.md anti-pattern: "a route is added to an allow-list by pattern-matching neighbors... name the invariant every current member satisfies"). If per-field purpose-locking is wanted, it should be a uniform hardening pass across all image fields, not bolted onto this story for one.

### Resolved during PR review (Codex, PR #291, 2026-07-29 — third pass)

1. **`compressImage()` no longer fails open when a required crop can't be produced** — when `targetAspectRatio` is set (branding logo, SEO share image), a decode failure, a missing canvas 2D context, a `toBlob()` null result, or an unsupported `createImageBitmap` API all used to silently fall back to the original, unprocessed file — contradicting the function's own doc comment ("falling back to the original, wrong-shaped file would defeat the crop entirely"). Since the backend only signs the upload and never re-validates pixel dimensions, a wrong-shaped file could reach storage while the page's `og:image`/favicon metadata still declared the target dimensions. Fixed: every one of those paths now throws instead of falling back when a crop was actually required; `SingleImageUploadField.tsx`'s existing `try/catch` around `compressImage()` already surfaces any thrown error as the standard upload-error UI state, so no new UI work was needed. Also added a `matchesAspectRatio()` guard (2% tolerance) so a source too small to represent the target ratio in whole pixels (e.g. a 1×1 image toward 1200/630) is rejected rather than silently producing a still-wrong-shaped crop. `compress-image.spec.ts` updated (one pre-existing test asserting the old fail-open behavior was flipped to assert a throw) plus 4 new tests; `SingleImageUploadField.spec.tsx` gained a test confirming a rejected `compressImage()` surfaces the upload-error state.
2. **Stale testing note fixed** (this doc, `openGraph.images` line) — see the item directly above in the CodeRabbit section: the actual behavior (key omitted entirely) was already correct in three other places in this same file; only this one Testing-section line still said "empty `images` array."
3. **Reviewed, not changed:** `seo.ogImageUrl`'s purpose-lock — same finding as item 8 in the CodeRabbit section above, re-raised independently by Codex; reasoning stands unchanged.
4. **Reviewed, not changed:** `HotsiteImagePromotionService`'s `Promise.all` being unbounded and still awaited before the use case (and therefore the HTTP response) returns — mechanically true (`runInNewTransaction` awaits `flushAfterCommitCallbacks`, which awaits the promotion `Promise.all`, before returning), so this isn't purely fire-and-forget background work. This is the explicit MVP tradeoff already made in the Codex-first-pass item above ("simple fix, appropriate for MVP scale... a full outbox-based redesign is a larger follow-up if image counts grow") — standing as-is unless gallery sizes in practice warrant revisiting.
5. **Reviewed, not changed:** `HotsiteImagePurpose` still duplicated as a separate runtime Zod enum in the backend and BFF — already documented as an accepted pattern (CodeRabbit section, item 4 above; also called out in `packages/types/src/hotsite.ts`'s own comment on the type).

---

## M18-S04 — Hero banner responsive crop: breakpoint aspect-ratio, focal point, and a minimum upload resolution guard ✅ Done

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-027

### Background

`HeroModule.tsx` (`apps/web/shells/hotsite/components/HeroModule.tsx`) renders the tenant's uploaded `backgroundImageUrl` (`HeroModuleData.backgroundImageUrl`, `packages/types/src/hotsite.ts:19`) with `next/image`'s `fill` + `object-cover`, inside a container whose height is **viewport-relative**, not tied to the image's own aspect ratio:
- Centered variant: `className="relative flex min-h-screen items-center justify-center px-6 sm:min-h-[60vh]"` (line 132) — full device viewport height on mobile, `60vh` on `sm:` and up.
- Left-aligned variant's right-panel image: `className="relative h-64 sm:h-full sm:min-h-[40vh]"` (line 166), itself nested inside the section's own `min-h-screen sm:min-h-[60vh]` (line 152).

A typical hero banner is a wide, short landscape image (the example discussed was ~1900×600, ≈3:1). On mobile, `min-h-screen` forces the centered variant's container to the full device viewport height — far taller, proportionally, than the image itself. `object-fit: cover` then scales the image up until it covers that height, cropping most of the width in the process — this is the "gets really cut on mobile" behavior reported. The left-aligned variant's `h-64` (fixed 256px) container is comparatively less extreme today since it isn't viewport-height-driven, but still has no aspect-ratio relationship to the source image.

There is currently no crop-shape enforcement for the `'hero'` upload purpose — `SingleImageUploadField.tsx`'s `TARGET_ASPECT_RATIO` map (line 24) only covers `branding` (1:1) and `seo-og-image` (1200:630); hero images pass through `compressImage(file, undefined)` (line 108), which only proportionally downscales, capped at `MAX_DIMENSION = 1600` (`compress-image.ts:3`) on the longer axis — the shorter axis (height, for a landscape banner) ends up considerably smaller (e.g. a 1900×600 source becomes ~1600×505 after compression).

Two options were discussed for fixing the mobile crop:
1. **Art direction** — a second, tenant-curated image crop specifically for mobile, served via a breakpoint-toggled `<Image>` pair. Rejected: this product's tenants (SMB owners, not designers) upload one photo through a single-field UI; requiring a second well-composed crop adds real friction for a benefit most tenants won't realize (they'd likely re-upload the same photo).
2. **Single image + CSS-driven responsive crop** (chosen) — the approach mainstream SMB site builders (Wix/Squarespace/Webflow) use: one uploaded image, a per-breakpoint `aspect-ratio` container (replacing the viewport-relative height), and a tenant-adjustable focal point (`object-position`) so the important part of the photo (a logo, a storefront) can be kept in frame as the crop shape changes across breakpoints.

**Important coupling, resolved at `/story-discovery M18-S04`:** the mobile aspect ratio chosen in Part 1 and the minimum-resolution guard in Part 3 are not independent. `object-fit: cover` scales the image uniformly until it satisfies whichever axis needs more coverage; for a wide/short source image being fit into a *taller* mobile container, that's almost always the image's **height** (its naturally shorter axis) that becomes the bottleneck — the tighter (more portrait-like) the chosen mobile ratio, the more the source's height gets upscaled, and the more visible blur results.

A second, sharper coupling was found while measuring an actual reference banner (1604×494px, ≈3.25:1): `compressImage()`'s `MAX_DIMENSION = 1600` cap applies to whichever axis is larger — for a wide banner that's always width, so the **stored** height after compression converges to roughly `1600 / sourceAspectRatio` regardless of how large the raw upload was. A minimum-resolution check against the *raw, pre-compression* `bitmap.height` (as originally sketched below) doesn't actually protect anything — Part 3 checks the **post-compression** stored height instead (see Part 3).

Resolved values: mobile aspect ratio `21:9` (≈2.33:1) on both variants, `sm:` and up unchanged (today's existing height classes stay — desktop was never reported broken, so there's no reason to touch it). At a typical 390px-wide/3×-DPR phone, `21:9` needs ≈502px of stored height; a ≈450px minimum-stored-height floor (allowing at most a small, barely-visible ~1.1× upscale) clears the actual 1604×494 reference image (which compresses to ≈493px) while still rejecting genuinely tiny/thumbnail-grade uploads. `object-position` default: `'center'`.

**Accepted limitation:** the measured reference image has important content at *both* horizontal extremes (a text block on the left, a logo/wordmark on the right) — the exact case flagged in the Background above where a single `left`/`center`/`right` focal point can't preserve both sides at once. At `21:9` on mobile, keeping either edge in full crops the other; `center` avoids losing either side *entirely* but crops into both somewhat. This is an accepted trade-off of the single-image approach (Option 2), not a defect to fix in this story — a tenant whose banner needs both sides fully visible on mobile would need art direction (Option 1, deliberately out of scope here, see Background).

### Description

**Part 1 — Breakpoint-scoped aspect-ratio containers (replacing viewport-relative height):**
- **Centered variant** (formalized during implementation — see "Resolved during PR review" below): the image and the overlaid centered text share one `relative` box, so a literal CSS `aspect-ratio` there is unsafe — per the CSS sizing spec, `aspect-ratio` computes an `auto` height strictly from the ratio and does **not** grow to fit taller content the way `min-height` does, so it would clip the title/subtitle/button on short viewports. `HeroModule.tsx`'s centered variant instead replaces the mobile-default height class (`min-h-screen`) with `min-h-[42.86vw]` — the same `21:9` ratio expressed as a **floor**, not a hard box: identical crop when content fits within it, but the section grows instead of clipping when text needs more room.
- **`sm:` and up is also fixed, not left as `min-h-[60vh]`** (corrected during live testing — see "Resolved during live testing" below): a `vh` (viewport-*height*-relative) floor has the same category of bug as the original `min-h-screen` one, just less extreme — it stays pinned to the browser's viewport height as the *window* is narrowed, so the box gets progressively more portrait-shaped and crops progressively worse at every width in between, not just at the true-mobile breakpoint. `sm:min-h-[60vh]` becomes `sm:min-h-[31.25vw]` — width-relative like the mobile floor, approximating the same ~16:5 landscape shape the old `60vh` gave at a typical monitor's full-width proportions, but keeping that ratio roughly constant at every window width instead of only at one.
- **Left-aligned variant**'s right-panel image container (line 166): no text-overlap conflict — it's a standalone box, so the literal Tailwind `aspect-[21/9]` utility applies directly on mobile, replacing the mobile-default `h-64`. At `sm:` and up, `sm:min-h-[40vh]` has the same vh-relative bug as the centered variant's `60vh` and is fixed the same way: `sm:min-h-[15.6vw]` (half of `31.25vw`, since this panel renders at roughly half the section's width at `sm:`+ via `grid-cols-2`). **The section's own overall wrapper (line 152, governs the whole hero section's height, including the text column) is fixed too** (corrected during cross-tool review, not left as originally scoped — see "Resolved during cross-tool review" below): it also had `min-h-screen sm:min-h-[60vh]`, the same vh-relative bug, and becomes a single `min-h-[31.25vw]` at every breakpoint (no mobile/desktop split needed — this wrapper holds only normal-flow content, not a cropped image, so a single modest floor plus content-driven growth is enough).
- Both variants keep `fill` + `object-cover`; the container's height-determination mechanism changes at every breakpoint, not just mobile.

**Part 2 — Tenant-adjustable focal point:**
- New field on `HeroModuleData` (`packages/types/src/hotsite.ts`), e.g. `backgroundImagePosition?: 'left' | 'center' | 'right'` (default `'center'`) — a horizontal focus preset, since the crop axis that actually loses content when going from a wide desktop shape to a taller mobile shape is horizontal (left/right), not vertical.
- Mirror the field in the web zod schema (`apps/web/features/platform/hotsite/module-schemas.ts`) and the backend aggregate (`HeroModuleData` in `hotsite-config.aggregate.ts`) — same 3-layer field addition pattern as M18-S01's `datePickerType`.
- `HeroConfigPanel.tsx`: new `PillSelect` (same pattern as the existing `variant`/`rightPanel` selects, lines 83–92/176–186) with `left`/`center`/`right` options, shown only when `backgroundImageUrl` is set.
- `HeroModule.tsx`: apply as `style={{ objectPosition: ... }}` on both variants' `<Image>` alongside the existing `className="object-cover"`.
- New i18n keys under `dashboard.hotsitePage.layout.panels.hero` in both `pt-BR` and `en` locale files — the new PillSelect's label + 3 option labels.

**Part 3 — Minimum upload resolution guard for the `'hero'` purpose:**
- New `MINIMUM_STORED_HEIGHT` map in `SingleImageUploadField.tsx`, parallel to the existing `TARGET_ASPECT_RATIO` map (line 24) — only `hero` gets an entry (`450`), mirroring that map's own "only purposes with a real requirement get one" precedent.
- `compressImage()` (`apps/web/shared/utils/compress-image.ts`) gains an optional minimum-height parameter, checked against the **post-compression stored height** — i.e. `scaledDimensions(crop.sWidth, crop.sHeight, MAX_DIMENSION).height` (already computed at line 124), not the raw pre-scale `bitmap.height`. Checking the raw natural height would not actually guard anything: `MAX_DIMENSION`'s cap applies to whichever axis is larger, so for a wide banner the stored height always converges to roughly `1600 / sourceAspectRatio` regardless of the original upload's resolution (see the Background coupling note). Reject (throw) once the scaled dimensions are known, before drawing/encoding, if the resulting height is below the threshold.
- Threshold: **450px** (stored, post-compression) — comfortably covers a `21:9` mobile crop (needs ≈502px at a typical 390px/3× device, so this allows at most a mild ≈1.1× upscale) while rejecting genuinely tiny/thumbnail-grade uploads. Verified against the actual 1604×494 reference banner discussed at `/story-discovery` (compresses to ≈493px — passes).
- The thrown error needs a tenant-facing, translated message distinct from the generic upload-error fallback. Resolved mechanism: a new `lowResolutionErrorLabel` prop on `SingleImageUploadField`, following the same per-purpose label-prop pattern already used for `formatHintLabel`/`uploadingLabel`/etc. — not a typed error class. `HeroConfigPanel.tsx`'s `SingleImageUploadField` call site supplies it; other purposes' call sites simply don't pass it (optional prop), matching how purpose-specific copy already varies per call site today.
- New i18n key for this specific error message, in both locale files.

**Part 4 — Docs refresh:**
- `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4's `HeroModuleData` TypeScript snippet (~line 202) is already stale versus the real type — missing `eyebrow`, `secondaryCtaLabel`, `secondaryCtaTarget`, `rightPanel`, and `backgroundImageUrl`'s nullability; `ctaTarget` only lists 2 of its 6 values. Pre-existing drift, not caused by this story, but resolved at `/story-discovery` to refresh the whole snippet in the same commit rather than adding `backgroundImagePosition` on top of an already-wrong example.

### Acceptance Criteria

- [ ] Both `HeroModule` variants replace their viewport-*height*-relative sizing (`min-h-screen`/`h-64` on mobile, `sm:min-h-[60vh]`/`sm:min-h-[40vh]` at `sm:` and up) with a viewport-*width*-relative mechanism at **every** breakpoint — literal `aspect-[21/9]` (mobile) for the left-aligned variant's standalone image panel with `sm:min-h-[15.6vw]` above that; `min-h-[42.86vw]` (mobile, a floor to avoid clipping the overlaid text) with `sm:min-h-[31.25vw]` above that for the centered variant. No `vh` unit remains anywhere in either variant's height mechanism.
- [ ] The reference banner image (a wide, dual-focal-point composition) stays visibly in frame on a mobile viewport at the `center` focal-point default — not reduced to a thin vertical sliver as it is today
- [ ] `HeroModuleData.backgroundImagePosition` exists in backend aggregate, `@ikaro/types`, and web zod schema; defaults to `'center'`; absent/undefined behaves identically to today (no visual change for existing tenants who don't touch the new field)
- [ ] `HeroConfigPanel.tsx` exposes the focal-point picker (`left`/`center`/`right`) only when a background image is set; changing it visibly shifts the crop in the live preview (`HotsitePreview.tsx`)
- [ ] `SingleImageUploadField` rejects a `'hero'` upload whose post-compression stored height is below 450px, via the new `lowResolutionErrorLabel` prop — not the generic upload-error fallback
- [ ] The 1604×494 reference image (or an equivalent ≈3.25:1 source) uploads successfully as a `'hero'` background (verifies the 450px threshold doesn't over-reject)
- [ ] New locale keys (focal-point label/options, low-resolution error message) exist in both `pt-BR` and `en` in the same commit
- [ ] `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`'s `HeroModuleData` snippet matches the real type exactly (all fields, full `ctaTarget` enum, correct nullability, new `backgroundImagePosition` field)
- [ ] Coverage ≥80% on changed code; `tsc --noEmit`, lint, full test suite green

### Testing

**Unit — Vitest (`apps/web`):**
- UPDATE `HeroModule.spec.tsx` — asserts `aspect-[21/9]` on the mobile-default class (both variants), `sm:` classes unchanged; `objectPosition` style reflects `backgroundImagePosition` (`left`/`center`/`right`/default `center`).
- UPDATE `HeroConfigPanel.spec.tsx` — new focal-point `PillSelect` renders only when an image is set; `onChange` wiring.
- UPDATE `compress-image.spec.ts` — a source whose post-compression height would fall below 450px throws with the expected message; a source at/above it (including a case shaped like the 1604×494 reference, ≈493px stored) proceeds normally; the existing `branding`/`seo-og-image` crop-ratio behavior is unaffected (no minimum-height check applied to those purposes); a case confirms the check runs against scaled/stored dimensions, not raw natural ones (a huge but equally wide-aspect source must still be rejected if its post-cap stored height is under 450px).
- UPDATE `SingleImageUploadField.spec.tsx` — a rejected (too-low-resolution) `'hero'` upload surfaces `lowResolutionErrorLabel`, not the generic fallback; other purposes without the prop supplied fall back to the existing generic behavior.
- UPDATE `module-schemas.spec.ts` — `backgroundImagePosition` enum accepts `'left'`/`'center'`/`'right'`/`undefined`, rejects other values.

**Backend (Jest):** UPDATE `hotsite-config.spec.ts` — `backgroundImagePosition` remains unvalidated by the aggregate (matches the existing precedent for other non-business-rule module-data fields, e.g. `datePickerType`).

**Playwright E2E:** UPDATE `hotsite-editor.spec.ts` — set a hero background image + focal point, publish, reload, verify both persist; a structural check (e.g. computed `object-position` on the live hotsite page) confirms the setting actually applies.

### Resolved during `/story-discovery M18-S04` (2026-07-30)

1. **Reference image measured directly:** 1604×494px, ≈3.25:1 — close to the ~1900×600 estimate used when the story was first drafted.
2. **Mobile aspect ratio:** `21:9` (≈2.33:1) on both variants' image, mobile-default breakpoint only; `sm:` and up keep today's existing height classes unchanged, since desktop was never reported broken.
3. **Minimum stored-height threshold:** 450px, checked against the **post-compression** stored height (`scaledDimensions(...).height`), not the raw pre-scale natural height — the latter doesn't guard anything, since `MAX_DIMENSION`'s width-side cap squeezes any wide image's stored height down to roughly `1600 / sourceAspectRatio` regardless of the original upload's resolution. This threshold allows at most a small ≈1.1× upscale at a typical 390px/3×-DPR phone and passes the actual reference image (≈493px stored).
4. **Focal-point default:** `'center'`.
5. **Accepted limitation:** the reference image has important content at both horizontal extremes (text left, logo right) — a single focal-point value can't preserve both on a `21:9` mobile crop. `'center'` avoids fully losing either side. This is an accepted trade-off of the chosen single-image approach (Option 2 in Background), not something this story fixes — a tenant needing both sides fully visible on mobile would need art direction (Option 1), deliberately out of scope.
6. **Low-resolution error mechanism:** new `lowResolutionErrorLabel` prop on `SingleImageUploadField`, matching the existing per-purpose label-prop pattern — not a typed error class.
7. **No `plan/journey/` prototype required:** the measured reference image substituted for one — same reasoning precedent as M18-S02/M18-S03 for a scoped visual change, extended here to cover the "no prototype for a public-facing change" risk since a real image was reviewed and its exact numbers drove the resolved values above.
8. **`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` doc drift:** refreshed in this story's own Part 4, rather than left as a separately-tracked gap.

### Resolved during PR review (Codex + CodeRabbit, PR #294, 2026-07-30)

Cross-tool review surfaced 2 critical + 2 important findings (Codex) and 3 actionable comments (CodeRabbit), with meaningful overlap; triaged each against the actual diff before acting:

1. **Centered variant's mechanism formalized in this doc, not changed in code** (both tools flagged the literal-`aspect-[21/9]` AC as unmet for the centered variant) — the implementation deliberately uses `min-h-[42.86vw]` there instead, for the reason now captured in Part 1/AC above (a literal `aspect-ratio` on a box shared with overlaid text doesn't grow for content the way `min-height` does, and would clip the text on short viewports). This was disclosed in the PR body's "Implementation note" at merge time but the story's own Part 1/AC text still said the literal thing until this pass — fixed here so the doc and the code agree, not by changing the code to match a less-correct doc.
2. **`compressImage()`'s `minHeight` guard fixed to be fatal on every fail-open path, not just the "computed dimensions too small" one** (both tools independently found the same real bug) — `failOpenOrThrow()`, used by the "unsupported `createImageBitmap`," "canvas 2D context unavailable," and "`toBlob()` resolved null" branches, only escalated to a hard failure when `targetAspectRatio` was set; since `hero` never sets `targetAspectRatio`, all three branches silently uploaded the original, unverified-resolution file, contradicting the function's own doc comment. Fixed via a shared `hasHardRequirement(targetAspectRatio, minHeight)` used by both `failOpenOrThrow()` and `rethrowOrFailOpen()` — either parameter alone now makes every failure fatal. 4 new tests added (`compress-image.spec.ts`) covering each previously-silent fail-open path with `minHeight` set.
3. **E2E test strengthened** (both tools flagged the weak assertion; Codex additionally flagged the missing mobile-viewport regression coverage): `hotsite-editor.spec.ts`'s new Hero test now asserts the exact `object-position: 100% 50%` for the `'right'` focal point (was `not.toHaveCSS(..., '50% 50%')`, which would pass even if the mapping were broken to some other non-center value), and adds a real mobile-viewport (390×844) check that the centered variant's section height stays well short of the old `min-h-screen`-forced full-viewport-height behavior — the actual regression this story exists to fix, which nothing in the original E2E coverage asserted.
4. **Reviewed, not changed (CodeRabbit):** a suggestion to add backend runtime validation rejecting `backgroundImagePosition` values outside `left`/`center`/`right`, since a direct API write (bypassing the web zod schema) can currently persist an arbitrary string. Correct as stated, but not a regression this story introduces — `HotsiteConfig.validateLayout()` only checks `module.type` membership by design (confirmed at `/story-discovery`, same precedent already governing `variant`, `rightPanel`, `ctaTarget`, and `datePickerType`, none of which have aggregate-level enum validation either). Adding it only for this one new field would be the exact anti-pattern CLAUDE.md §8 calls out ("a route/field is validated by pattern-matching neighbors instead of naming the shared invariant") — if this is wanted, it should be a uniform hardening pass across every module-data enum field, not bolted onto this story for one.
5. **Not independently re-verified here (Codex):** the new Playwright spec had not been run against a live stack at PR-open time. CI's own Playwright E2E job covers this; see CI status before merging.

### Resolved during live testing (2026-07-30, after PR #294 opened)

1. **`sm:min-h-[60vh]`/`sm:min-h-[40vh]` (desktop/tablet, `sm:` and up) had the same category of bug as the original mobile `min-h-screen` issue — found by manually resizing the browser window, not by a specific test case.** `vh` is relative to the browser's *viewport* height, not the container's own width — so narrowing the *browser window* (without the screen itself changing height) leaves a `vh`-based floor fixed while the container's width shrinks, making the box progressively more portrait-shaped and cropping progressively worse at every intermediate width, not just a binary "desktop is fine, mobile is broken." This was out of M18-S04's original scope (desktop was only tested at full window width, where it happened to look fine) but is the same root cause the story's own Part 1 already fixed for mobile — just not applied consistently to every breakpoint.
2. **Fix:** replaced both `vh`-based rules with `vw`-based ones, chosen to approximate the same visual shape the old `vh` values gave at a typical monitor's full-width proportions (so no regression at the one width that was actually tested) while keeping that ratio roughly constant at every window width instead of only one: `sm:min-h-[60vh]` → `sm:min-h-[31.25vw]` (centered variant, ~16:5), `sm:min-h-[40vh]` → `sm:min-h-[15.6vw]` (left-aligned's right panel, half that ratio since the panel itself renders at roughly half the section's width at `sm:`+ via `grid-cols-2`).
3. **`HeroModule.spec.tsx` gained a regex assertion (`not.toMatch(/\bmin-h-\[\d+vh\]/)`) on both variants specifically to guard against this class of bug being reintroduced later** — at the time this passed, since it only checked the two elements this pass fixed. It missed the left-aligned variant's *outer* section, which still had `min-h-screen sm:min-h-[60vh]` — see "Resolved during cross-tool review" below for why the "no vh remains" claim wasn't actually true yet.

### Resolved during cross-tool review (Codex, PR #294, 2026-07-30 — after the live-testing fixes above)

1. **Critical, confirmed valid: the left-aligned variant's *outer* section (governing the whole hero, not just the image panel) still had `min-h-screen sm:min-h-[60vh]`** — the exact same `vh` bug just fixed elsewhere, missed because it was originally scoped out as "a separate whitespace concern, not an image-crop concern" (a real distinction, but the story's own AC made an unqualified "no vh unit remains anywhere" claim that this contradicted). Fixed: single `min-h-[31.25vw]` at every breakpoint, no mobile/desktop split — this wrapper holds only normal-flow content (text column + image-panel grid), not a cropped image directly, so a modest floor plus content-driven growth is sufficient; there's no image-ratio reasoning to differentiate mobile from desktop here the way there is for the image containers.
2. **Critical, confirmed valid: the E2E fixture (`HERO_PNG_BUFFER`) was 900×460 (≈1.96:1), not close to the ≈3.25:1 the story's own AC names** ("The 1604×494 reference image (or an equivalent ≈3.25:1 source) uploads successfully..."). The unit-level coverage of this exact case was already solid (`compress-image.spec.ts` has a dedicated 1604×494 test), but the E2E fixture didn't exercise the same edge case end-to-end. Fixed: `HERO_PNG_BUFFER` changed to `makeSolidPng(1604, 494)` — the actual reference banner's dimensions, not an arbitrary ratio.
3. **Important, reviewed, not changed (repeat finding):** `backgroundImagePosition: 'top'` still accepted at the backend/aggregate layer. Same finding CodeRabbit raised on the first review pass — reasoning stands unchanged (see the CodeRabbit section above): `HotsiteConfig.validateLayout()` deliberately doesn't validate module-data field values by design, same precedent as every other enum field on this and other modules.
4. **Important, acknowledged, not restructured:** rewriting this story's own acceptance-criteria text in place (rather than freezing the original wording and logging every decision in a separate section only) makes the review baseline a moving target. Fair process point. Not restructured retroactively here — the extensive "Resolved during..." sections throughout this story already provide a dated paper trail for every change, and rebuilding the doc around a frozen-original-plus-changelog structure at this point would be a large, low-value effort relative to what it'd buy. Taken as guidance for how new stories should be structured from the start, not applied backward.
5. **Important, stale at time of read:** "Playwright E2E still pending, don't treat as fully verified" — true when this review ran; CI has since completed with Playwright E2E passing.
6. **Minor, reviewed, not changed:** the E2E mobile-height regression check (`height < 700`) is a coarse guard, by design — it exists specifically to catch a reintroduction of the old `min-h-screen`-forced ~844px behavior, not to verify exact correct sizing (that's what the unit-level `vw`-class assertions are for).
7. **Minor, fixed:** code comments described `vh` as "pinned to screen height" — technically imprecise; corrected to "viewport height" throughout `HeroModule.tsx` and this doc.

### Dependencies

None — extends existing components (`HeroModule`, `HeroConfigPanel`, `SingleImageUploadField`, `compressImage`); no migration (module `data` is a `jsonb` field, same pattern as M18-S01's `datePickerType`).

---

## M18-S05 — Hero & Booking CTA banners: tenant-configurable content position (independent X/Y anchor, decoupled from `variant`) ✅ Done

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-027

### Background

`HeroModuleData.variant` and `BookingCtaModuleData.variant` (both `'centered' | 'left-aligned'`) each conflate text alignment, column layout (whether there's a right-hand image/brand-card panel), and where the text+CTA block sits, all in one field. Confirmed by direct read of both components — `HeroModule.tsx` and `BookingCtaModule.tsx` share near-identical structure: a `centered` branch hardcoding `items-center justify-center` on the section and `mx-auto ... text-center` on the content wrapper (`HeroModule.tsx:142,156`; `BookingCtaModule.tsx:153,157`), and a `left-aligned` branch with a 2-col grid (`items-center` row alignment) that already puts text on the left, vertically centered, as a side effect of `variant` rather than something explicitly chosen (`HeroModule.tsx:176-187`; `BookingCtaModule.tsx:122-145`). Neither variant lets a tenant anchor the block to the top or bottom, and `centered` has no way to move it off-center horizontally either.

Two real hotsite manifests were compared during discovery: one (`variant: 'centered'`) where the tenant wanted the CTA row somewhere other than dead-center, and one (`variant: 'left-aligned'`) that already looked right by accident of the variant's own layout.

**Design confirmed during `/story-discovery`:** rather than a single combined 9-point enum, use **two independent optional fields** — `contentPositionX?: 'left' | 'center' | 'right'` and `contentPositionY?: 'top' | 'center' | 'bottom'` — each rendered as its own `PillSelect` (`apps/web/shared/components/ui/pill-select.tsx`, already generic over `T extends string` and already `flex flex-wrap`, confirmed by direct read — no new UI primitive needed). This also matches the codebase's existing precedent of independent variation axes as separate fields (`variant` + `rightPanel`, not one combined enum), and sidesteps a 3×3-grid-picker component that a single enum would have required.

**Non-negotiable (explicit user requirement):** absent/undefined `contentPositionX`/`contentPositionY` must render **exactly as today**, for every existing manifest, on both modules. This falls out naturally once the default for each is fixed at `'center'`: both variants of both modules already vertically center via a hardcoded `items-center` today, and `centered`'s horizontal default is already `justify-center`/`text-center` — so `'center'` is a true no-op default, not a value that needs to vary per-variant.

Both CTA buttons on `HeroModuleData` (`ctaLabel`/`ctaTarget` and the optional `secondaryCtaLabel`/`secondaryCtaTarget`) already render together in one row (`HeroTextContent`'s `<div className="flex flex-wrap gap-4">`, `HeroModule.tsx:93`); `BookingCtaModuleData` has only one CTA (`ctaLabel`, no secondary). This story moves the whole heading/subtitle/CTA block as one unit per module — it does not add independent positioning per button.

**Scope confirmed during `/story-discovery`:** both `HERO` and `BOOKING_CTA` module types get this field in this same story (not deferred) — their component structure is close enough (both `centered`/`left-aligned`, both already using `PillSelect` for `variant`/`rightPanel`/`bgStyle`) that doing them together is barely more work than doing one, and avoids the exact inconsistency CLAUDE.md §8 flags ("a route/field added by pattern-matching neighbors" — here, the *reverse* risk: leaving an identical-shaped sibling field un-added would itself be the inconsistency).

### Description

**Part 1 — `contentPositionX`/`contentPositionY` fields, 3-layer mirror, on both module types (same pattern as `datePickerType`/`backgroundImagePosition`):**
- `packages/types/src/hotsite.ts`: add `contentPositionX?: 'left' | 'center' | 'right';` and `contentPositionY?: 'top' | 'center' | 'bottom';` to `HeroModuleData` (after `backgroundImagePosition`) and to `BookingCtaModuleData` (after `rightPanel`).
- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts`: mirror both fields on both interfaces (`HeroModuleData` line 26, `BookingCtaModuleData` nearby).
- `apps/web/features/platform/hotsite/module-schemas.ts`: add `contentPositionX: z.enum(['left', 'center', 'right']).optional()` and `contentPositionY: z.enum(['top', 'center', 'bottom']).optional()` to both `HeroModuleDataSchema` (line 26-38) and `BookingCtaModuleDataSchema`.
- **No BFF change** — `HotsiteModuleResponse.data` (`packages/types/src/hotsite.ts:119`) is an opaque `Record<string, unknown>` at the BFF/shared-response layer; new keys on either module's data type need no DTO/controller touch, confirmed from M18-S04's identical precedent (`backgroundImagePosition` shipped with zero BFF changes).
- **No migration** — `layout` module `data` is a `jsonb` column, same as every other module-data field added so far.

**Part 2 — Default derivation (no behavior change for existing tenants):**
- `contentPositionX` absent → `'center'`. Only read when `variant === 'centered'` (or unset, whose own default is `'centered'`) — for `'left-aligned'`, the value (default or explicit) has no rendering effect at all, since that variant's text column position is structural, not free-floating.
- `contentPositionY` absent → `'center'`. Read in **both** variants — replaces today's hardcoded `items-center` with a dynamic value that defaults to the exact same thing.
- This derivation is identical for `HeroModuleData` and `BookingCtaModuleData`.

**Part 3 — `HeroModule.tsx` rendering:**
- **Centered variant:** section's `items-center justify-center` (line 142) become `items-{start|center|end}` driven by `contentPositionY` (section keeps no `justify-*` of its own — see Part 8); a new **stage** div (`max-w-7xl mx-auto`, `flex`, `justify-{start|center|end}` driven by `contentPositionX`) is inserted between the section and the content wrapper; the wrapper itself becomes `max-w-3xl py-16 text-{left|center|right}` (no margin classes — positioning is the stage's job now, alignment of the text inside it is the wrapper's); the CTA row (line 93, shared via `HeroTextContent`) gets a matching `justify-start`/`justify-center`/`justify-end` so the buttons align with the text above them, not independently.
- **Left-aligned variant:** `contentPositionY` maps to `items-{start|center|end}` on the **inner CSS Grid row** (the 2-col grid at line 213-215, not the outer section) — this is the element that actually determines the text column's vertical position relative to the image/brand-card column. The outer section keeps a fixed `items-center` unconditionally (see "Resolved during PR review" below for why the section itself was the wrong element). `contentPositionX` is not read in this branch at all.
- `HeroTextContent` itself takes no new props — the alignment classes are applied by its caller (each variant branch), keeping the shared component unaware of which variant it's rendering into (matches its current design).

**Part 4 — `BookingCtaModule.tsx` rendering (same technique as Part 3):**
- **Centered variant:** same stage-plus-wrapper split as Hero's centered branch — section keeps `items-{start|center|end}` from `contentPositionY` only; a `max-w-7xl mx-auto flex justify-{start|center|end}` stage positions a `max-w-2xl text-{left|center|right}` wrapper around `BookingCtaContent`'s single CTA (`Link`, line 93-99).
- **Left-aligned variant:** `contentPositionY` maps to `items-{start|center|end}` on the inner CSS Grid row (line 136), same as Hero — not the outer section, which keeps a fixed `items-center`. `contentPositionX` not read.

**Part 5 — Config panel UI, both `HeroConfigPanel.tsx` and `BookingCtaConfigPanel.tsx`:**
- Two new `PillSelect` controls per panel, reusing the exact existing pattern (e.g. `HeroConfigPanel.tsx:83-92`'s `variant` PillSelect, `BookingCtaConfigPanel.tsx:77-85`'s):
  - `contentPositionY` PillSelect (`top`/`center`/`bottom`) — always rendered, regardless of `variant`.
  - `contentPositionX` PillSelect (`left`/`center`/`right`) — rendered **only** when `variant === 'centered'` (mirrors the existing `hero.backgroundImageUrl &&` conditional-render pattern already used in `HeroConfigPanel.tsx:203-215` for `backgroundImagePosition`) — for `left-aligned`, the control simply isn't shown, rather than shown-but-inert.

**Part 6 — i18n:**
- New keys under `dashboard.hotsitePage.layout.panels.hero` **and** `dashboard.hotsitePage.layout.panels.bookingCta`, in both `packages/i18n/locales/pt-BR/*.json` and `.../en/*.json` — per panel: `contentPositionXLabel`/`Left`/`Center`/`Right` and `contentPositionYLabel`/`Top`/`Center`/`Bottom` (8 new keys × 2 panels = 16 total), following the exact naming convention already confirmed live in the locale files (`<field>Label` / `<field><OptionValue>`, e.g. `backgroundImagePositionLabel`/`backgroundImagePositionLeft`).

**Part 7 — Docs refresh:**
- `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4: both the `HeroModuleData` snippet (confirmed zero drift as of this story's start — safe base) and the `BookingCtaModuleData` snippet gain `contentPositionX`/`contentPositionY`.

**Part 8 — Fix: left/right anchoring must respect the site's usual content width, not the raw viewport edge (found during manual review after the initial push):**
- The first implementation of Part 3/4 positioned `contentPositionX` directly against the `<section>`'s own edge (only inset by its `px-6` padding) — on a wide viewport, `'left'`/`'right'` pushed the text block almost flush against the true browser edge, unlike every other hotsite section (`ServiceListModule`, `AboutModule`, `ContactModule`), which all constrain their content to a `mx-auto max-w-7xl` container with `padding: var(--ba-section-py) 1.5rem` on the section itself.
- Fixed by inserting a **stage** div between the section and the content wrapper: `relative z-10 flex w-full max-w-7xl mx-auto`, with `justify-{start|center|end}` (from `contentPositionX`) applied to the stage, not the section. The section keeps only `items-{start|center|end}` (from `contentPositionY`) and its existing `px-6` — the background `<Image>` (a sibling of the stage, still a direct child of the section) is unaffected, staying full-bleed.
- **Regression-safe for the default (`'center'`) case on every viewport width:** nesting the stage's own `mx-auto` centering inside the section's available width, then `justify-center`-ing the wrapper inside the (possibly narrower) stage, lands the wrapper at the exact same horizontal midpoint as the original single-layer `mx-auto` — verified algebraically (both operations are symmetric around the same center point) and by test.
- `contentMarginClass()` (the margin-based positioning helper from the original Part 3/4 implementation) is removed from `module-styles.ts` — superseded entirely by the stage's `justify-content`, which is the only positioning mechanism now (previously a mix of margin-based wrapper positioning + a separately-computed CTA-row justify class).

**Part 9 — `BookingCtaModuleData` gets the M18-S04 responsive-crop treatment too (found during manual review — a sibling gap, not new scope creep):**
- `BookingCtaModule.tsx`'s background image had the exact pre-M18-S04 Hero bug — `min-h-[40vh]`/`h-64` (viewport-height-relative, cropping badly on narrow viewports) — never fixed alongside Hero because M18-S04 was scoped to Hero only.
- `backgroundImagePosition?: 'left' | 'center' | 'right'` added to `BookingCtaModuleData` (3-layer mirror, same as `contentPositionX`/`Y` above) — identical field/default/semantics to `HeroModuleData.backgroundImagePosition`.
- `BookingCtaModule.tsx`: centered variant's section `min-h-[40vh]` → `min-h-[42.86vw] sm:min-h-[31.25vw]` (identical numbers to Hero); left-aligned variant's outer section `min-h-[40vh]` → `min-h-[31.25vw]`, its image panel `h-64 sm:h-full sm:min-h-[40vh]` → `aspect-[21/9] sm:aspect-auto sm:h-full sm:min-h-[15.6vw]` (identical to Hero's left-aligned right panel). Both variants' `<Image>` gains `style={{ objectPosition }}` driven by the new field.
- `BookingCtaConfigPanel.tsx`: new focal-point `PillSelect` (shown only when `backgroundImageUrl` is set), identical pattern to `HeroConfigPanel.tsx`'s existing one; its `SingleImageUploadField` call also gains `lowResolutionErrorLabel` (was missing entirely before this story — the low-resolution rejection existed in the shared `compressImage()`/`SingleImageUploadField` machinery, but this call site had never wired a purpose-specific message for it).
- `SingleImageUploadField.tsx`'s `MINIMUM_STORED_HEIGHT` map gains a `'booking-cta': 450` entry (identical threshold to `'hero'` — same 21:9 mobile crop target, same derivation).
- New i18n keys (`backgroundImagePositionLabel`/`Left`/`Center`/`Right`, `backgroundImageLowResolutionError`) under `dashboard.hotsitePage.layout.panels.bookingCta`, both locales.
- `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`'s `BookingCtaModuleData` snippet gains `backgroundImagePosition` (this snippet also had pre-existing drift from a prior story, refreshed in full as part of this same story rather than compounding it — see the Description's opening background note).

### Acceptance Criteria

- [ ] `contentPositionX`/`contentPositionY` exist on both `HeroModuleData` and `BookingCtaModuleData`, in backend aggregate, `@ikaro/types`, and web zod schema
- [ ] Absent/undefined `contentPositionX`/`contentPositionY` renders **identically to today** for every existing manifest, on both modules, both variants — verified as an explicit regression test, not just an assumption
- [ ] `centered` variant (both modules): all 9 combinations of `contentPositionX` × `contentPositionY` visibly reposition the heading/subtitle/CTA block as one unit, in the live preview (`HotsitePreview.tsx`)
- [ ] `left-aligned` variant (both modules): only `contentPositionY` (top/center/bottom) has a visible effect; `contentPositionX`'s picker is not rendered in the config panel for this variant
- [ ] `HeroModuleData`'s two CTA buttons move together with the heading/subtitle — no independent per-button positioning
- [ ] `HeroConfigPanel.tsx` and `BookingCtaConfigPanel.tsx` both expose the `contentPositionY` PillSelect unconditionally and the `contentPositionX` PillSelect only when `variant === 'centered'`
- [ ] New locale keys (16 total, 8 per panel) exist in both `pt-BR` and `en` in the same commit
- [ ] `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`'s `HeroModuleData` and `BookingCtaModuleData` snippets both include the two new fields, with no other drift from the real types
- [ ] `contentPositionX: 'left'`/`'right'` anchors content within the same `max-w-7xl` content container every other hotsite section uses — not flush against the raw viewport edge — on both modules
- [ ] `BookingCtaModuleData.backgroundImagePosition` exists in backend aggregate, `@ikaro/types`, and web zod schema; absent/undefined behaves identically to today (no visual change for existing tenants)
- [ ] `BookingCtaModule.tsx` uses the same `vw`-relative sizing as `HeroModule.tsx` at every breakpoint — no `vh` unit remains in either variant's height mechanism
- [ ] `SingleImageUploadField` rejects a `'booking-cta'` upload whose post-compression stored height is below 450px, via `lowResolutionErrorLabel` — mirroring the existing `'hero'` behavior
- [ ] `BookingCtaConfigPanel.tsx` exposes the focal-point picker (`left`/`center`/`right`) only when a background image is set; changing it visibly shifts the crop in the live preview
- [ ] Coverage ≥80% on changed code; `tsc --noEmit`, lint, full test suite green

### Testing

**Unit — Vitest (`apps/web`):**
- UPDATE `HeroModule.spec.tsx` — `centered`: each `contentPositionX`/`contentPositionY` combination produces the expected `justify-content`/`align-items`/`text-align` classes on the stage/wrapper/CTA row; `left-aligned`: `contentPositionY` repositions the column, `contentPositionX` (even if present in data) has no rendering effect; absent fields render identically to the pre-existing fixture for both variants (explicit regression case); the stage carries `max-w-7xl mx-auto` regardless of `contentPositionX`.
- UPDATE `BookingCtaModule.spec.tsx` — same coverage shape as `HeroModule.spec.tsx` for content position, adapted for the single-CTA content; plus M18-S04-style aspect-ratio/vw-relative-sizing/`objectPosition` coverage mirroring `HeroModule.spec.tsx`'s existing "responsive crop" describe block.
- UPDATE `HeroConfigPanel.spec.tsx` and `BookingCtaConfigPanel.spec.tsx` — `contentPositionY` PillSelect always renders; `contentPositionX` PillSelect renders only when `variant === 'centered'`; `onChange` wiring for both; switching `variant` away from `centered` while `contentPositionX` is set doesn't crash (control just unmounts); `BookingCtaConfigPanel.spec.tsx` additionally covers the new focal-point picker (mirrors `HeroConfigPanel.spec.tsx`'s existing coverage).
- UPDATE `module-schemas.spec.ts` — both schemas accept the new `contentPositionX`/`contentPositionY` enums (including `undefined`), reject invalid values; `BookingCtaModuleDataSchema` additionally accepts/rejects `backgroundImagePosition` the same way `HeroModuleDataSchema` already does.
- UPDATE `SingleImageUploadField.spec.tsx` — a rejected (too-low-resolution) `'booking-cta'` upload surfaces `lowResolutionErrorLabel`, mirroring the existing `'hero'` case.

**Backend (Jest):** UPDATE `hotsite-config.spec.ts` — `contentPositionX`/`contentPositionY`/`backgroundImagePosition` remain unvalidated by the aggregate on both module types (matches the existing precedent for other non-business-rule module-data fields).

**Playwright E2E:** UPDATE `hotsite-editor.spec.ts` — set non-default `contentPositionX`/`contentPositionY` on the `centered` variant for both Hero and Booking CTA modules, publish, reload, verify persistence and the expected computed alignment on the live hotsite page.

### Resolved during `/story-discovery M18-S05` (2026-07-30)

1. **Two independent fields, not a combined 9-point enum** — `contentPositionX`/`contentPositionY`, each its own `PillSelect`. Confirmed by direct read that `PillSelect` already supports wrapping and is generic over any string union, so no new grid-picker primitive is needed; also matches the existing `variant`+`rightPanel` precedent of separate independent fields rather than one combined enum.
2. **Scope extended to `BookingCtaModuleData`, in this same story** — not deferred. Its component (`BookingCtaModule.tsx`) has the same `centered`/`left-aligned` shape and already uses the identical `PillSelect` pattern for `variant`/`bgStyle`/`rightPanel`.
3. **`contentPositionX` is not applicable to `left-aligned` for either module** — the text column's left position is structural (grid order), not a free placement; the config panel simply doesn't render that control for this variant rather than rendering an inert one.
4. **Default-preserves-current-behavior is the hard requirement, confirmed explicitly by the user** — both fields default to `'center'`, which is a true no-op against both modules' current hardcoded `items-center`/`justify-center`/`text-center` behavior; no variant-dependent default logic is needed (simpler than the original single-enum draft's `centered → 'center'`, `left-aligned → 'center-left'` derivation, which is no longer needed under the two-field design).

### Resolved after initial push (manual review, 2026-07-30)

Two additional findings surfaced after the initial commit/push, both folded into this same branch/story per explicit user direction rather than split into separate follow-up stories:

1. **Edge-flush bug (Part 8):** user found that anchoring `contentPositionX` to `'left'`/`'right'` pushed content almost flush against the true browser edge on a wide viewport, unlike the rest of the hotsite's `max-w-7xl`-constrained sections. Root cause: the original Part 3/4 implementation positioned the wrapper directly against the `<section>`'s own edge rather than against a `max-w-7xl`-constrained content container. Fixed via the stage-div restructure in Part 8.
2. **Booking CTA image never got M18-S04's treatment (Part 9):** user separately noticed the Booking CTA background image still crops badly on a narrow viewport, unlike Hero's (already fixed by M18-S04). Confirmed this is a real, pre-existing gap — M18-S04 was scoped to Hero only, and nothing since then extended the same fix to `BookingCtaModuleData`/`BookingCtaModule.tsx`. Fixed via Part 9, mirroring M18-S04's Hero treatment exactly (same ratio, same thresholds).

### Resolved during PR review (Codex, PR #295, 2026-07-31)

Cross-tool review surfaced 2 critical + 1 minor finding; verified each against the actual diff before acting:

1. **Critical, confirmed valid: `contentPositionY` in the `left-aligned` variant was applied to the outer `<section>` instead of the inner CSS Grid row, making it a no-op for realistic content.** The section's `min-h-[31.25vw]` is a *floor*, not a fixed height (M18-S04: "grows instead of clipping") — for any real content taller than that floor (the common case once there's a right-panel image or brand-card, since those routinely exceed the floor), the section's own height equals its content's height, and `align-items` on a flex container with no spare cross-axis space has nothing to do. The *inner* grid row (the 2-column `grid` aligning the text column against the image/brand-card column) is where `contentPositionY` actually needs to apply for it to have any visible effect when the two columns differ in height. Fixed in both `HeroModule.tsx` and `BookingCtaModule.tsx`: `contentPositionY`'s `itemsClass` moved from the section (now a fixed, always-`items-center` unconditional class) to the grid row. Tests updated to assert the grid's class (with a right-panel image present, so the two columns actually differ in height) rather than the section's.
2. **Critical, confirmed valid (verification gap, not a code bug): the acceptance criterion requiring all 9 `contentPositionX` × `contentPositionY` combinations to be verified was only satisfied by inference from two independent-axis test suites, not by directly exercising the combined pairs.** Added a dedicated `it.each` covering all 9 combinations for the `centered` variant in both `HeroModule.spec.tsx` and `BookingCtaModule.spec.tsx`, asserting both the stage's `justify-*` and the section's `items-*` together per pair.
3. **Minor, fixed: the Hero E2E content-position test assumed the seeded Hero module was already on the `centered` variant instead of asserting/setting it explicitly.** The test would have failed loudly (not silently) if that assumption ever became false, since the `contentPositionX` picker only renders for `centered` — but made explicit anyway: the test now clicks `hero-variant-centered` before setting `contentPositionX`/`contentPositionY`, removing the implicit seed-state dependency.

### Resolved during PR review (CodeRabbit, PR #295, 2026-07-31)

1. **Trivial, fixed: the centered-variant section/stage/wrapper class composition was duplicated between `HeroModule.tsx` and `BookingCtaModule.tsx`, built independently from the same `contentJustifyClass`/`contentItemsClass`/`contentTextAlignClass` primitives.** Extracted into a new `buildContentStageClasses()` helper in `module-styles.ts`, parameterized by each module's own section base classes and wrapper max-width; both modules now call it instead of assembling the same three class strings inline. (Utility class order within a single `className` doesn't affect Tailwind's output, so standardizing `itemsClass`'s position — always appended last — is cosmetic, not a behavior change; confirmed by the full test suite passing unchanged.)
2. **Major, confirmed valid: `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`'s own newly-added content-width rule (Part 8 above) said section padding stays on the outer `<section>` with a padding-free `max-w-7xl mx-auto` stage — but the pre-existing `left-aligned` branches of both modules had it the other way around** (`px-6 py-16` on the inner `max-w-7xl` div, no padding on the section at all), predating this story. Rather than write an exception into the doc, fixed the code to match the stated convention — `px-6 py-16` moved to the outer section in both modules' `left-aligned` branches, the inner `max-w-7xl mx-auto` div is now padding-free. Verified behavior-preserving (the rendered content width/centering is identical either way, since the `max-w-7xl` div was already the effective content boundary) — confirmed by the full test suite passing unchanged.

### Dependencies

None — extends existing components (`HeroModule`, `HeroConfigPanel`, `BookingCtaModule`, `BookingCtaConfigPanel`, `SingleImageUploadField`); no migration (module `data` is a `jsonb` field, same pattern as M18-S04's `backgroundImagePosition`).

---

## M18-S06 — Gallery module: automatic masonry layout (tile height from photo aspect ratio) ✅ Done

**Agent:** `fullstack-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-027
**UC reference:** UC-027 (Tenant Admin Manages Hotsite Content & Branding)

### Background

`GalleryModuleData.layout` already offers `'grid' | 'masonry'` (`packages/types/src/hotsite.ts:64`), surfaced in `GalleryConfigPanel.tsx` as "Grade"/"Mosaico". `GalleryModule.tsx:33-36` does apply different container CSS per option — `grid grid-cols-2 sm:grid-cols-3 gap-4` for `'grid'`, `columns-2 sm:columns-3 gap-4 [&>*]:mb-4` for `'masonry'` — and CSS multi-column layout genuinely packs variable-height children natively; no custom packing algorithm is needed for the visual effect this story wants.

Confirmed by direct read: the reason "Mosaico" renders identically to "Grade" today is a single unconditional line in `GalleryItem.tsx:25` — `className="relative aspect-[4/3] w-full overflow-hidden"` — applied regardless of which layout the parent chose. A masonry/mosaic look only exists when tiles have unequal heights; clamping every tile to the same ratio removes the one input the `columns` technique needs to do anything different from a grid.

`GalleryImage` (`packages/types/src/hotsite.ts:52`) has no `width`/`height` field today, so even removing the clamp would have nothing to size a tile from. This story adds that field and the two places it needs to be captured, then makes masonry mode actually use it.

### Description

**Part 1 — `GalleryImage.width`/`height`, 3-layer mirror, both optional:**
- `packages/types/src/hotsite.ts`: add `width?: number;` and `height?: number;` to `GalleryImage`.
- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts`: mirror both fields on its own independent `GalleryImage` interface (line 57) — this file doesn't import `@ikaro/types`, same as every other module-data field added in this milestone.
- `apps/web/features/platform/hotsite/module-schemas.ts`: add `width: z.number().optional()` and `height: z.number().optional()` to `GalleryImageSchema` (line 52-58).
- **No migration** — `hotsite_config.layout` is a `jsonb` column (confirmed in the entity); every gallery already stored simply has no `width`/`height` key, which is a legitimate, permanent state this story must render correctly, not a transitional one.
- **No `@ikaro/validation` change** — `HotsiteModuleSchema` (`packages/validation/src/hotsite.ts`) *is* applied to gallery modules, by both the BFF's and backend's save-path Zod pipes (`UpdateHotsiteContentSchema` reuses it directly), but its `data` field is `z.record(z.string(), z.unknown())` — deliberately opaque, same as every other module's `data`. `width`/`height` pass through both validation layers untouched with no schema change needed.
- `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4 GALLERY: add `width?`/`height?` to the documented `GalleryImage` snippet (lines 241-247), matching M18-S03/S05's precedent of refreshing this doc whenever a module's data shape changes.

**Part 2 — Capture dimensions on fresh upload:**
- `apps/web/shared/utils/compress-image.ts`: new sibling export `compressImageWithDimensions(file: File): Promise<{ file: File; width?: number; height?: number }>` — `width`/`height` are optional, not guaranteed: an unsupported source type/API or a decode failure still falls back to the original `File` with no dimensions, the same fail-open shape `compressImage` itself already has. `compressImage` itself is unchanged in its public signature — it's shared by callers (branding logo, SEO share image, hero background) that only want a `File` back. Internally, both share one `createImageBitmap` decode via a `compressDecodedBitmap` helper (reconciled 2026-08-07 after cross-tool review found the original version decoding the same file twice, once per function — see Part 5's own follow-up note below for the parallel `break-inside-avoid` reconciliation).
- `apps/web/features/platform/components/hotsite/modules/GalleryImageManager.tsx`: `handleUpload` (line 85) calls `compressImageWithDimensions` instead of `compressImage`, and the new `GalleryImage` built at line 97 carries `width`/`height` from the result.

**Part 3 — Capture dimensions on booking-photo pick:**
- `apps/web/features/platform/components/hotsite/modules/BookingPhotoPicker.tsx`: the thumbnail `<img>` elements already rendered to browse photos (lines 208, 224) gain an `onLoad` handler reading `naturalWidth`/`naturalHeight` off the loaded element — no extra network request, the browser already fetched the image for display. `handlePick` (line 107) attaches the captured dimensions to the `GalleryImage` passed to `onPick`.

**Part 4 — Rendering: `GalleryItem.tsx` and `GalleryModule.tsx`:**
- `GalleryItem.tsx`: new props `layout: 'grid' | 'masonry'` (the image's `width`/`height` are already on `image: GalleryImage`, no new prop needed beyond `layout`).
  - `layout === 'grid'`: fixed box, unconditionally — see Part 6 for why this is `aspect-square`, not the original `aspect-[4/3]`.
  - `layout === 'masonry'` and both dimensions present: wrapper gets `style={{ aspectRatio: \`${image.width} / ${image.height}\` }}` instead of the fixed-box class (`<Image fill>` stays as-is inside the now-variably-sized wrapper — simpler than switching Image modes). As originally written, this bullet also specified `break-inside-avoid` for the then-current CSS-`columns` masonry technique; Part 5 replaces that technique with flex-wrap, which has no concept of a column break to avoid — see Part 5's own note.
  - `layout === 'masonry'` and either dimension missing (pre-existing image): falls back to the same fixed box grid mode uses — explicit, not accidental; matches this codebase's "unset renders identically to today" precedent.
- `GalleryModule.tsx`: passes `data.layout` down to each `GalleryItem` (line 69) so it can select its own sizing; the container's `gridClass` computation for `layout: 'grid'` is unchanged — see Part 5 for the masonry side, which is not.

**Part 5 — Masonry: CSS `columns` replaced with flex-wrap rows (found during user testing after Parts 1-4 shipped; revised a second time after further testing against real screenshots — see below):**
- Problem (round 1): `GalleryModule.tsx`'s masonry `gridClass` was an unconditional `columns-2 sm:columns-3`, regardless of `images.length`. With too few images for 3 desktop columns (e.g. 4 images), the browser's `column-fill: balance` heuristic commonly produces a lopsided 2-1-1 split — column 1 gets 2 stacked images, columns 2-3 get 1 each — which reads as "3 images across the top, 1 hanging below," not an intentional mosaic. Round-1 fix (superseded, see below): a `masonryColumnsClass(visibleCount)` helper tiering `columns-1`/`columns-2`/`columns-2 sm:columns-3` by count.
- **Problem (round 2 — the round-1 fix didn't actually solve the underlying issue, just capped it):** tested against real screenshots. 3 images in `columns-2` still produced the same lopsided gap (2 stacked in column 1, column 2 empty below its single image) — because CSS `columns` is column-major with **no concept of a row at all**, so it has no way to center a remainder, no matter how the column count is tuned. Separately, capping at `columns-2` for low counts (round 1's fix for a *different* problem — an empty 3rd column) made every tile render very wide on desktop ("really big... had to reduce zoom").
- **Fix: switch the technique entirely, not tune the tiering further.** `GalleryModule.tsx`'s masonry container is now `flex flex-wrap justify-center items-start gap-4` (not `columns-N`). Each tile gets a **fixed, count-independent** per-tile class, `MASONRY_TILE_BASIS_CLASS = 'basis-[calc(50%-0.5rem)] sm:basis-[calc(33.333%-0.667rem)]'` — 2 per row on mobile, 3 per row on desktop, always. The `calc()` compensates for `gap-4`'s 1rem, which flex-basis percentages don't otherwise account for. `align-items: flex-start` keeps each tile's own `aspect-ratio`-driven height (the actual masonry effect, unchanged from Part 1-4) rather than stretching to match its row. `justify-content: center` is what actually solves the round-2 problem: a short last row (e.g. 1 leftover tile) centers itself automatically — CSS `columns` categorically cannot do this. `GalleryItem.tsx`'s `break-inside-avoid` (a CSS-`columns`-specific property) is removed — meaningless with flex-wrap, there's no "column break" to avoid.
- **Round 3 (further user testing): dropped the remaining count-based branching entirely.** The fix above still capped desktop at 2/row for ≤3 visible images (reasoning: avoid tiny tiles at very low counts). User tested with exactly 3 images and reported the tiles were still "really big... enormous" — the 2-column cap made each tile 50% width for the *one* count (3) that fits a clean, complete 3-column row with zero remainder, no centering even needed. Since flex-wrap centers any remainder gracefully regardless of column count, there was no longer a reason to reduce it for a low count at all — `MASONRY_TILE_BASIS_CLASS` is now the single fixed value above, with no `visibleCount` parameter.
- Called with the same `Math.min(data.images.length, data.maxVisible)` as round 1, for the same reason — images beyond `maxVisible` are `display: none` (`app/globals.css:56`) until "Ver mais," so they don't participate in the layout yet.
- `layout: 'grid'`'s `gridClass` is untouched — a CSS Grid with an incomplete last row is normal, expected grid behavior (unlike a masonry column left empty), so it never had either problem.
- **Considered and rejected: real Pinterest-style column-packed masonry** (a JS component measuring each tile's rendered height and placing the next tile into the shortest column — what Pinterest/most masonry libraries actually do; native CSS `grid-template-rows: masonry` would be the zero-JS version, but isn't shipped in Chrome/Safari stable). Confirmed with user this is more machinery than the payoff justifies for a ~5-20 photo small-business gallery — flex-wrap rows get most of the visual quality (especially given real photos here are mostly similar, portrait-ish proportions) for CSS-only simplicity. The honest tradeoff, stated to the user and accepted: row-based flex can't tuck a short photo directly under a tall one in the same column the way true masonry can, so it's not pixel-identical to Pinterest for widely disparate photo heights — just close enough for this product without a stateful layout component.
- Explicitly rejected (still applies): a tenant-facing "number of columns" config field. Same reasoning as rejecting manual per-image size in Part 1's story discussion — a non-technical tenant has no intuition for "how many columns," and a manual field would let them recreate the exact sparse/oversized-tile problem this fix prevents. Solved automatically instead.

**Part 6 — Grade crop ratio: `aspect-[4/3]` → `aspect-square` (found during user testing after Parts 1-4 shipped):**
- Problem: `GalleryItem.tsx`'s fixed box (both `layout: 'grid'` and the masonry width/height-missing fallback) was `aspect-[4/3]`, a landscape-biased ratio. `object-cover`'s crop loss for a source ratio `S` in a box ratio `R` is `1 - min(R/S, S/R)`. Into `4:3` (R=1.333), a portrait phone photo (3:4, S=0.75) loses ~44% of its height cropped away; a landscape photo (16:9, S=1.778) loses only ~25% — a hard bias against portrait shots, which are common for a service business's before/after close-ups.
- Fix: box ratio changed to `aspect-square` (R=1) in `GalleryItem.tsx`, for both the `layout: 'grid'` box and the masonry no-dimensions fallback (kept identical on purpose — see Part 4). Square is not an arbitrary pick: it's the exact geometric mean between a 4:3 landscape source and its 3:4 portrait mirror (`R² = 1.333 × 0.75 = 1.0`), so it crops both by the same ~25% instead of favoring one orientation — a rebalancing toward this gallery's likely mixed-orientation content, not a claim of zero cropping (a genuinely panoramic 16:9 photo now crops ~44% in a square box, the same magnitude the portrait-bias problem started from, just relocated to wide shots instead).
- Side effect, not the goal: this also fixes a pre-existing mismatch where `GalleryImageManager.tsx`'s own admin-panel thumbnail preview (line 151) and `BookingPhotoPicker.tsx`'s picker thumbnails were already `aspect-square`, while the live public site rendered `aspect-[4/3]` — what the admin previewed didn't match what shipped.
- Explicitly rejected: a tenant-facing crop-ratio or per-image focal-point picker. No fixed ratio is crop-free for every source orientation — that's mathematically inherent to a uniform-cell grid, not a gap this story can close by picking a smarter number. The actual zero-crop answer for a tenant who cares is `layout: 'masonry'` (Parts 1-4); Grade's own lightbox (`GalleryGrid.tsx`, pre-existing) already lets anyone see the full, uncropped photo on click regardless of which layout is active — no image content is ever actually lost, only previewed smaller.

**Explicitly out of scope for this story (real gaps, not silently dropped):**
- No drag-to-reorder added to `GalleryImageManager.tsx` — there is none today (order is purely upload/pick sequence); a real, pre-existing gap, independent of this story.
- No backfill for galleries already stored without `width`/`height` — they keep the fixed-box fallback in masonry mode until re-uploaded/re-picked, permanently, unless a future story adds one.

**No new i18n keys.** This story changes what the already-shipped `layout: 'masonry'`/`layout: 'grid'` options render as — it doesn't expose any new tenant-facing copy or config control.

### Acceptance Criteria

- [ ] `GalleryImage.width`/`height` exist in `@ikaro/types`, the backend aggregate's own `GalleryImage` interface, and the web zod schema — all optional
- [ ] A freshly uploaded gallery image (`GalleryImageManager`'s file-upload path) has `width`/`height` set, matching the compressed/scaled output's real dimensions
- [ ] A gallery image added via `BookingPhotoPicker` has `width`/`height` set, captured from the already-rendered thumbnail with no extra network request
- [ ] `layout: 'grid'` renders identically for every image regardless of `width`/`height` being present — but is **not** pixel-identical to the pre-story crop: the fixed box is `aspect-square`, not the original `aspect-[4/3]` (Part 6)
- [ ] `layout: 'masonry'` with photos of different aspect ratios visibly produces unequal tile heights (verified in the live preview and/or a Playwright screenshot, not just class-name assertions)
- [ ] `layout: 'masonry'` with a `width`/`height`-less image (pre-existing gallery) falls back to the same fixed `aspect-square` box `layout: 'grid'` uses — no broken/zero-height tile
- [ ] Masonry uses `flex flex-wrap justify-center`, not CSS `columns`; every tile — regardless of image count — is `basis-[calc(50%-0.5rem)]` (2/row) on mobile and `sm:basis-[calc(33.333%-0.667rem)]` (3/row) on desktop (Part 5, round 3). `break-inside-avoid` was part of an earlier CSS-`columns`-based draft of this AC; Part 5's flex-wrap replacement has no column break for it to avoid, so it was dropped, not missed (reconciled 2026-08-07 after cross-tool review flagged the stale AC line still requiring it)
- [ ] A masonry gallery with an uneven image count (e.g. 3 images at 2/row) renders its incomplete last row centered, not lopsided against one side — verified visually/via bounding-box position, not just class presence
- [ ] `layout: 'grid'`'s column count (`grid-cols-2 sm:grid-cols-3`) is unaffected by image count — only masonry's column count scales
- [ ] No `@ikaro/types`/backend/web schema drift — the same 3-layer mirror check every other module-data field in this milestone follows
- [ ] Coverage ≥80% on changed code; `tsc --noEmit`, lint, full test suite green

### Testing

**Unit — Vitest (`apps/web`):**
- NEW `apps/web/shells/hotsite/components/GalleryItem.spec.tsx` — doesn't exist today. Grid mode always renders `aspect-square` regardless of `width`/`height`; masonry mode with both dimensions renders the computed `aspectRatio` style, not the fixed class; masonry mode missing either dimension falls back to `aspect-square` (same box grid mode uses).
- UPDATE `apps/web/shells/hotsite/components/GalleryModule.spec.tsx` — `layout` is forwarded to each `GalleryItem`; masonry container is `flex flex-wrap justify-center`, not `grid`; new `describe('masonry tile width is fixed..., regardless of image count')` block (`it.each([1, 2, 3, 4, 20])`) confirms every tile always gets the same `MASONRY_TILE_BASIS_CLASS`, at any count; confirms `layout: 'grid'` is unaffected (no basis class, unchanged `grid-cols-2 sm:grid-cols-3`).
- UPDATE `apps/web/shared/utils/compress-image.spec.ts` — new `compressImageWithDimensions` cases: returns the same file `compressImage` would, plus `width`/`height` matching the scaled (not source) dimensions; respects `MAX_DIMENSION` downscaling the same way.
- UPDATE `apps/web/features/platform/components/hotsite/modules/GalleryImageManager.spec.tsx` — uploading an image stores `width`/`height` on the resulting `GalleryImage` passed to `onChange`.
- UPDATE `apps/web/features/platform/components/hotsite/modules/BookingPhotoPicker.spec.tsx` — picking a photo stores `width`/`height` (from the thumbnail's simulated `load` event) on the `GalleryImage` passed to `onPick`.
- UPDATE `apps/web/features/platform/hotsite/module-schemas.spec.ts` — `GalleryImageSchema` accepts `width`/`height` as optional numbers, accepts their absence, rejects non-number values.

**Backend (Jest):** UPDATE `apps/backend/src/contexts/platform/domain/hotsite-config.spec.ts` — `GalleryImage.width`/`height` remain unvalidated by the aggregate, matching the existing precedent for every other module-data field.

**Playwright E2E (`apps/web/e2e`):** UPDATE `apps/web/e2e/hotsite-editor.spec.ts` — upload two gallery images with visibly different aspect ratios (e.g. one portrait crop, one landscape), switch layout to Mosaico, publish, and assert the two tiles render at different heights on the live hotsite page (not just that the `columns` class is present).

### Resolved during story discussion (2026-08-07, to confirm at `/story-discovery`)

1. **No hand-rolled packing algorithm.** `GalleryModule.tsx` already applies CSS `columns-3` in masonry mode; CSS multi-column layout natively packs variable-height children. The only defect is `GalleryItem.tsx:25`'s unconditional `aspect-[4/3]` clamp — fixing this is removing a clamp, not building a layout engine.
2. **Automatic sizing (photo's own aspect ratio), not a manual size picker.** Considered a bento-style explicit size-per-image control (small/large, or spanning tiles); rejected for this product — Ikaro's hotsite editor targets small-business owners (car wash, gym, salon) without a strong intuition for "pick a size class," and a manual picker would need a different CSS technique entirely (`grid-auto-flow: dense` with explicit spans, since `columns` can't span tiles).
3. **No backfill for pre-existing galleries.** They keep the fixed-box fallback in masonry mode (`aspect-square` as of Part 6, originally `aspect-[4/3]`), permanently, until re-uploaded/re-picked. Treated as a legitimate default, not a shortcut — matches this codebase's "unset renders identically to today" precedent (`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`).
4. **Reordering is a real, separate gap**, explicitly not folded into this story.

### Resolved after initial implementation (2026-08-07)

Two additional findings surfaced from user testing after Parts 1-4 were built and verified, both folded into this same story rather than split off, per explicit user direction:

1. **Masonry column count didn't account for how few images might be visible (Part 5).** User observed that 4 images under the unconditional `columns-2 sm:columns-3` rendered as "3 across the top, 1 hanging below" rather than a balanced mosaic — a real CSS multi-column quirk (`column-fill: balance` is a height-estimate heuristic, not a symmetry optimizer). Considered and rejected: a tenant-facing "number of columns" field (same "no manual knob for something automatic can solve" reasoning as the size-picker rejection above) and a hand-rolled JS packing algorithm (unnecessary — CSS `columns` already packs correctly once given enough images to fill each column). Fixed by scaling the column count itself off the count actually visible pre-expansion.
2. **Grade's fixed `aspect-[4/3]` box cropped portrait photos far more aggressively than landscape ones (Part 6).** User reported "cropping in half" for some photos. Confirmed by direct calculation: a 3:4 portrait source loses ~44% of its height in a 4:3 box, vs. ~25% for a 16:9 landscape source in the same box — a real, systematic bias, not a misperception. Considered and rejected: a tenant-facing crop-ratio/focal-point picker (no fixed ratio is crop-free for every orientation, so this would trade one manual-config burden for a problem that isn't actually solvable that way) and treating `layout: 'masonry'` as sufficient on its own (it solves the problem differently, but doesn't help a tenant who specifically wants Grade's uniform look). Fixed by changing the box ratio to `aspect-square` — the mathematically balanced midpoint between a 4:3 landscape source and its 3:4 portrait mirror, not an arbitrary swap. Explicitly not a claim of zero cropping: a genuinely panoramic photo still crops meaningfully in a square box, same magnitude as the portrait bias this fix removes, just relocated. The pre-existing lightbox (`GalleryGrid.tsx`, predates this story) remains the actual "see the uncropped photo" answer, for either layout.

### Resolved during PR review (Codex, PR #329, 2026-08-07)

1. **`compressImageWithDimensions` decoded the same source file twice.** Its original implementation called `compressImage(file)` and a separate `readImageDimensions(file)` concurrently via `Promise.all` — each independently ran its own `createImageBitmap(file, ...)`, so every gallery upload decoded the full source bitmap twice (doubling decoded-buffer/CPU cost, notable on 12-48MP phone photos). Fixed by extracting the shared post-decode logic into `compressDecodedBitmap(file, bitmap, ...)` and decoding once: `compressImage` still decodes its own bitmap (unaffected, used by callers that never need dimensions back), but `compressImageWithDimensions` now decodes a single bitmap and shares it between the compress path and the dimensions read.

### Dependencies

None — extends existing components (`GalleryItem`, `GalleryModule`, `GalleryImageManager`, `BookingPhotoPicker`, `compress-image.ts`); no migration (`layout` module `data` is a `jsonb` field, same pattern as every other module-data field added in this milestone).

---

## M18-S07 — Gallery module: "Destaque" layout — 1 large + 4 small photos, fixed 5-image template ✅ Done

**Agent:** `fullstack-ts`
**Complexity:** L
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-027
**UC reference:** UC-027 (Tenant Admin Manages Hotsite Content & Branding)
**Reference:** two external HTML mockups supplied directly by the user — `go-cowork-site.html` and `cf-cross-site.html` (not under `plan/journey/`; read directly, not copied from memory) — both a `#galeria` section captioned "Conheça o espaço."/"Conheça o box.". Both are static desktop-only wireframes: `.photo` is a placeholder `<div>` with caption text, not a real `<img>`; **zero `@media` queries in either file** — no mobile behavior to copy, it has to be designed for this story.

### Background

Confirmed by direct read of both reference files: the mechanism is plain CSS Grid, not the `columns` technique `layout: 'masonry'` uses:

```css
.galeria-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 220px 220px; gap: 12px; }
.galeria-grid .photo:first-child { grid-row: span 2; }
```

Exactly 5 photos in both files. The first one spans both rows (`go-cowork` also gives it a wider `2fr` column — bigger both ways; `cf-cross` uses equal `1fr` columns — only taller). Both use fixed pixel row heights (220px/240px) — this story does not carry that over; see Part 3 for the actual technique landed on (a solved container `aspect-ratio`, not the `vw`-clamp pattern from M18-S04/S05, which turned out not to fit — that pattern is for a full-bleed background image outside normal flow, and this grid isn't full-bleed).

`layout: 'grid'`/`'masonry'` both flow with however many photos exist. This layout doesn't — it's a fixed template, a real departure the config panel has to guard against, not paper over (Part 4).

### Description

**Part 1 — `layout` gains a third value, `GalleryModuleData` gains `featuredPosition`, 3-layer mirror:**
- `packages/types/src/hotsite.ts`: `GalleryModuleData.layout: 'grid' | 'masonry' | 'featured'`; add `featuredPosition?: 'left' | 'right'` (only meaningful when `layout === 'featured'`; default `'left'`, matching both reference files, which both place the large photo in the first column).
- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts`: mirror both on its own independent `GalleryModuleData`/`GalleryImage`-adjacent interface — same pattern as every prior field in this milestone; no new aggregate validation (`layout`/`featuredPosition` join `contentPositionX`-style fields that stay unvalidated by `HotsiteConfig.validateLayout()`, since there's no cross-field business rule here, just a rendering choice).
- `apps/web/features/platform/hotsite/module-schemas.ts`: `layout: z.enum(['grid', 'masonry', 'featured'])`, `featuredPosition: z.enum(['left', 'right']).optional()`.
- **No migration, no `@ikaro/validation` change** — same reasoning as M18-S06 Part 1: `jsonb` column, `HotsiteModuleSchema.data` stays a deliberately opaque `z.record()` at both the BFF's and backend's save-path Zod pipes.
- `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4 GALLERY: update the `GalleryModuleData` snippet's `layout` union and add `featuredPosition`.

**Part 2 — Which photo is "featured" is array order, not a new field (confirmed with user):**
- `images[0]` is always the large photo. No per-image "is featured" flag. If a tenant wants a different photo featured, they remove and re-add it in the order they want — accepted as good enough; `GalleryImageManager`'s lack of drag-to-reorder (flagged as a separate gap in M18-S06) is **not** a blocker for this story, but reordering would directly benefit this layout more than Grade/Mosaico ever needed it to, since order now has real visual meaning beyond "which shows first."

**Part 3 — Rendering: new `layout === 'featured'` branch in `GalleryModule.tsx`, widened `GalleryItem.tsx`, new `.gallery-featured-grid` CSS in `globals.css`:**
- `GalleryItem.tsx`: `layout` prop becomes `'grid' | 'masonry' | 'featured'`. For `'featured'`, the wrapper does **not** self-impose a box at all (no `aspect-square`, no computed `aspectRatio`, no per-tile ratio of any kind) — `className="relative h-full w-full overflow-hidden"`, filling whatever grid cell it's given. This is a third, distinct sizing strategy alongside grid's fixed box and masonry's natural-ratio box.
- `GalleryModule.tsx`: currently one `gridClass` ternary + one `data.images.map()` (confirmed at today's line numbers: 46-49, 70-85). `'featured'` needs a genuinely separate JSX branch, not a third value slotted into that structure — different image slice (`data.images.slice(0, 5)`, not the full array), different per-tile roles (1 large + 4 small), not a uniform map with just a container-class difference. Each tile's wrapping `<a>` gets `style={{ gridArea: 'big' | 's1' | 's2' | 's3' | 's4' }}` — a JS-computed area name per index, constant across breakpoints.
- **Still wraps in `<GalleryGrid>`, does not skip it.** `GalleryGrid.tsx` owns both the "Ver mais" reveal *and* the lightbox (full-image click-through) — skipping it for "no Ver mais needed" would silently lose the lightbox too, which this whole milestone's cropping discussion (M18-S06 Part 6) treats as the standing safety net for any crop/sizing choice. Call it with `maxVisible`/`totalImages` both set to the effective count (5, or fewer if the fallback below is active) — `hasMore` is then always false, so "Ver mais" naturally never renders, while the lightbox machinery stays intact for free.
- **`.gallery-featured-grid` (`app/globals.css`, alongside the pre-existing `data-gallery-expanded` rule):** `grid-template-areas` re-templates the *same* 5 elements between breakpoints — `'big big' / 's1 s2' / 's3 s4'` on mobile, `'big s1 s2' / 'big s3 s4'` at `sm:` (640px) and up — rather than duplicating markup per breakpoint (no precedent for that pattern anywhere else in this codebase, confirmed absent at `/story-discovery`). `[data-featured-position='right']` swaps the desktop columns/areas to put "big" last instead of first.
- **Sizing: solved, not guessed, so every cell — big and small alike — is exactly square. Landed in two rounds — the first attempt (container-level `aspect-ratio`) turned out not to actually solve it; see the PR-review note below for why and what replaced it.** Originally planned as per-tile `aspect-[4/3]`/`aspect-square` (and, briefly during implementation, unsolved `fr` ratios that produced a uniform-but-non-square ~1.31:1 desktop / 1.5:1 mobile rectangle for every tile — user feedback: "it feels like it is cutting"). Round 1 tried setting a container-level `aspect-ratio` (`2/1` desktop, `1/2` mobile) derived from the `2fr`/`1fr` column split — this reads as exact at first glance but isn't (see PR-review note). **Round 2 (PR #329 cross-tool review) — actually exact, at any container width or gap size:** every tile gets its own `aspect-ratio: 1` directly; on desktop, 4 *equal* columns (not `2fr`/`1fr`/`1fr`) let the 4 small tiles derive a uniform row height from their own square shape (implicit/auto rows, no `grid-template-rows` needed), and the big tile — spanning 2 of those columns and both derived rows — comes out the same square side length for free, with no container-level ratio to keep in sync with the gap value at all. On mobile the big tile has no sibling in its own row, so its own `aspect-ratio: 1` is what makes it square there. Square still matches Grade's own square choice (M18-S06 Part 6) rather than the reference's fixed-pixel, landscape-biased proportions. `featuredPosition` still has no effect on mobile — there's no "side" once stacked; noted explicitly, not a silent no-op.

**Part 4 — Config panel: `GalleryConfigPanel.tsx`, guarded to at least 5 images:**
- New `'featured'` option on the existing `layout` `PillSelect` (pt-BR "Destaque", en "Featured" — "Destaque" reused directly from the reference's own "Foto destaque" caption, not invented).
- New `featuredPosition` `PillSelect` (`left`/`right`), rendered only when `layout === 'featured'` — same conditional-render pattern as `contentPositionX` (M18-S05).
- **`PillSelect` needs an optional per-option `disabled` field first — it doesn't have one today** (confirmed by direct read of `pill-select.tsx`: `PillSelectOption<T>` is just `{value, label}`, the rendered `<button>` has no `disabled` attribute at all). Add `disabled?: boolean` to `PillSelectOption`, wire it to the button's native `disabled` + a muted style. Purely additive — backward-compatible with all 8 existing consumers (Branding/About/ServiceList/Testimonials/Contact/Hero/BookingCta/Gallery config panels), none of which need to pass it.
- **Revised after hands-on testing: "at least 5," not "exactly 5."** Originally disabled the `'featured'` option unless `images.length === 5`. User, after testing the disabled state directly: extra images beyond 5 should just be ignored (`images.slice(0, 5)`, already what the renderer does), not blocked — only a genuine *shortfall* (fewer than 5) is the real problem, since there's no way to fill 5 template slots from fewer photos. The `'featured'` option is now `disabled` only while `images.length < 5`, with inline copy explaining why (i18n key, Part 5); a **separate**, non-blocking note appears once `layout === 'featured'` and `images.length > 5`, clarifying that only the first 5 are used.
- **Confirmed fallback:** if a tenant already has `layout: 'featured'` saved and then removes photos down to fewer than 5, the live public site (and admin preview) renders as `layout: 'grid'` until back to at least 5 — the *stored* `layout` value stays `'featured'` unchanged; only the rendering falls back. Restoring a 5th photo restores the featured view with no re-selection needed — this is a display-time fallback, not a data mutation. More than 5 never triggers this fallback — `GalleryModule`'s guard is `images.length < 5`, not `!== 5`.

**Part 5 — i18n:**
- `dashboard.hotsitePage.layout.panels.gallery.layoutFeatured` — pill option label.
- `dashboard.hotsitePage.layout.panels.gallery.featuredPositionLabel`/`Left`/`Right` — mirrors `contentPositionXLabel`/`Left`/`Right`'s naming convention (M18-S05).
- `dashboard.hotsitePage.layout.panels.gallery.featuredRequiresFiveImages` (or similar) — the disabled-state explanation from Part 4.
- All new keys in both `packages/i18n/locales/pt-BR/web.json` and `.../en/web.json` in the same commit.

### Acceptance Criteria

- [ ] `GalleryModuleData.layout` accepts `'featured'`; `featuredPosition` exists in `@ikaro/types`, the backend aggregate, and the web zod schema — all following the existing 3-layer mirror pattern
- [ ] `layout: 'featured'` renders exactly `images[0]` as the large tile, spanning 2 rows on desktop, with `featuredPosition` controlling which side it's on
- [ ] Grid sizing is fully responsive (container-relative `aspect-ratio` + `fr` tracks), not the reference's hardcoded `220px`/`240px`
- [ ] Every tile — the large one and all 4 small ones — renders exactly square (`aspect-ratio: 1/1`) on both breakpoints, not the reference's landscape-biased proportions
- [ ] Mobile (below `sm:`) renders the large photo full-width first, then the remaining 4 in a 2×2 grid — verified as an actual rendered layout, not just "doesn't crash on narrow viewports"
- [ ] `featuredPosition` has no visible effect on the mobile layout — confirmed explicitly, not just untested
- [ ] The `layout` `PillSelect`'s "Destaque" option is disabled while `images.length < 5`, with an inline explanation; a separate, non-blocking note appears once `layout === 'featured'` and `images.length > 5`, explaining that only the first 5 are used
- [ ] A previously-saved `layout: 'featured'` gallery that drops below 5 images on the public site does not render a broken/incomplete grid — falls back to `'grid'`. Gaining more than 5 does **not** trigger any fallback — it keeps rendering as `'featured'` using the first 5
- [ ] `GalleryItem.tsx`'s `'featured'` branch fills its grid cell (no self-imposed `aspect-square`/`aspectRatio`) — confirmed not to conflict with the parent's explicit `grid-row`/`grid-column` sizing
- [ ] New i18n keys exist in both `pt-BR` and `en` in the same commit
- [ ] Coverage ≥80% on changed code; `tsc --noEmit`, lint, full test suite green

### Testing

**Unit — Vitest (`apps/web`):**
- UPDATE `pill-select.spec.tsx` — a `disabled: true` option renders a disabled `<button>` and doesn't call `onChange` when clicked; existing options without `disabled` are unaffected.
- UPDATE `GalleryItem.spec.tsx` — `layout="featured"` renders the fill-parent wrapper (no `aspect-square`, no computed `aspectRatio`), distinct from both existing branches.
- UPDATE `GalleryModule.spec.tsx` — new `describe('layout: featured')` block: renders exactly 5 tiles at exactly 5 images; renders as featured (using only the first 5) at more than 5, not a grid fallback; falls back to grid below 5; first tile spans 2 rows; `featuredPosition: 'left'` vs `'right'` produces the expected column placement; the "Ver mais" button never renders for `layout: 'featured'` (confirms `GalleryGrid` is still wrapping, with `maxVisible`/`totalImages` both set to the effective count); the lightbox still opens on tile click (confirms `GalleryGrid`'s interaction-capture is intact); mobile-viewport-equivalent class assertions for the stacked large-then-2×2 structure (jsdom has no real viewport, so this asserts responsive class names/structure, not actual rendered pixels — real cross-breakpoint verification is the Playwright test below).
- UPDATE `module-schemas.spec.ts` — `layout` accepts `'featured'`; `featuredPosition` accepts `'left'`/`'right'`/absent, rejects other values.
- UPDATE `GalleryConfigPanel.spec.tsx` — "Destaque" pill disabled below 5 images, enabled at exactly 5 *and* above 5; the "uses only the first 5" note appears only when `layout === 'featured'` and `images.length > 5`, not at exactly 5 and not for other layouts; `featuredPosition` pill renders only when `layout === 'featured'`.

**Backend (Jest):** UPDATE `hotsite-config.spec.ts` — `layout: 'featured'` and `featuredPosition` remain unvalidated by the aggregate, matching the existing precedent for every other module-data field.

**Playwright E2E (`apps/web/e2e`):** UPDATE `hotsite-editor.spec.ts` — upload exactly 5 images, select "Destaque", set `featuredPosition`, publish; verify on the live public page that the first image's tile is visibly larger than the other 4 (bounding-box comparison, same technique as M18-S06's masonry test) at a desktop viewport, and verify the stacked large-then-grid structure at a mobile viewport (`page.setViewportSize`, same pattern as M18-S04/S05's mobile crop regression tests).

### Resolved during story discussion (2026-08-07, to confirm at `/story-discovery`)

1. **Featured photo is `images[0]`, not a new per-image field.** User: "we can make the first one to be the destaque, since user can just reupload another, ok for him to replace. Easy and simple." Reordering stays out of scope for this story too, same as M18-S06 — but is now a more valuable follow-up than it was there.
2. **Originally: fixed at exactly 5 images, no graceful degradation for other counts.** User: "more than that will become just bad layout." The `'featured'` layout option was disabled in the config panel until exactly 5 images existed. **Revised after hands-on testing — see "Resolved after initial implementation" below: "at least 5," extras above 5 are just ignored, not blocked.**
3. **Mobile gets a real, distinct design, not a copy of the (nonexistent) reference mobile behavior.** User: "design thinking in mobile as well, to be well enough." Proposed: large photo full-width first, then the other 4 in a 2×2 grid — preserves the "1 hero + 4 supporting" hierarchy the desktop layout has, using the same square tiles Grade already settled on (M18-S06 Part 6) for visual consistency.
4. **`featuredPosition` is a plain enum field** (`'left' | 'right'`), same pattern as `contentPositionX`/`backgroundImagePosition` elsewhere in this milestone — confirmed with user ("left right, is a property right?").
5. **Fallback when a saved `'featured'` gallery drifts away from exactly 5 images: render as `'grid'` on both admin preview and public site until back at exactly 5.** The stored `layout` value is untouched — this is a display-time fallback, not a data mutation (confirmed at `/story-discovery`, see Part 4).
6. **No `plan/journey/` prototype.** Confirmed with user: the UX-validation purpose that process serves has already happened here, directly — two real external reference files (read in full, not recalled from memory) plus point-by-point design decisions confirmed in conversation. Same precedent as M18-S01/S02/S06 (no separate prototype needed absent a new UX surface requiring validation from scratch).

### Resolved during `/story-discovery M18-S07` (2026-08-07)

1. **`PillSelect` needs an optional `disabled` field added — confirmed by direct read, not assumed.** `pill-select.tsx`'s `PillSelectOption<T>` has no such field today; Part 4 now specifies adding it as a purely additive change.
2. **`GalleryModule.tsx`'s `'featured'` branch is a structural fork, not a third ternary value** — confirmed against the file's current shape (one `gridClass` + one `.map()`, lines 46-49/70-85 as of this story's discovery).
3. **`GalleryGrid` must still wrap `'featured'` mode — confirmed by direct read of `GalleryGrid.tsx`, which owns both "Ver mais" and the lightbox together.** The naive reading ("fixed 5, no Ver mais needed, so skip the wrapper") would have silently dropped the lightbox too. Fixed in Part 3: still wrap, with `maxVisible`/`totalImages` both set to the effective count so "Ver mais" never renders on its own.
4. **M18-S06 dependency verified directly, not via its plan-file status.** M18-S06 isn't `✅ Done`-marked (neither story has gone through `/pre-pr`/merge yet — both ship in the same PR, per user direction), but its code is confirmed present and correct in this branch by direct file read, which is sufficient here.

### Resolved after initial implementation (2026-08-07)

1. **"Exactly 5" relaxed to "at least 5" after hands-on testing.** User tested the disabled "Destaque" pill directly and pushed back: extra images beyond 5 should just be ignored, not force the tenant to delete photos to unlock the layout. The renderer already truncated to `images.slice(0, 5)` regardless — only the config panel's gate and `GalleryModule`'s fallback guard were stricter than the actual rendering needed. Both changed from `=== 5`/`!== 5` to `< 5`; a new, separate non-blocking note (`featuredUsesFirstFiveImages`) tells the tenant only the first 5 show once they're over that count. A genuine shortfall (fewer than 5) still blocks selection and still falls back to `'grid'` on the live site — there's no way to fill 5 template slots from fewer photos, so that half of the original constraint was correct and unchanged.
2. **Tile cropping was landscape-biased and unaddressed — user, testing the live result: "it feels like it is cutting."** Traced to `.gallery-featured-grid`'s container `aspect-ratio` (`21/8` desktop, `3/4` mobile), inherited from the reference's own pixel proportions without solving for cell shape — every tile (`object-cover`, always centered, same mechanism as Grade) came out ~1.31:1 on desktop and 1.5:1 on mobile, both landscape-biased ratios in the same severity class as the pre-M18-S06-Part-6 Grade problem this milestone already fixed once. Root cause: `GalleryItem`'s original Part 3 design called for per-tile `aspect-square` on the small mobile tiles (matching Grade's precedent) — that requirement was silently dropped during implementation when the sizing strategy moved to "no self-imposed box at all, fill the parent cell" to sidestep a CSS-specificity conflict with `GalleryModule`'s grid placement (see Part 3's `useNaturalAspectRatio`-style reasoning). Fixed by solving for the container `aspect-ratio` instead of guessing it: with this grid's specific track structure (2 equal rows, a `2fr` column against two `1fr` columns), setting the container to `2/1` (desktop) or `1/2` (mobile) makes every cell — big and small alike — resolve to exactly square, matching Grade's standard rather than reintroducing its already-fixed bias. Considered and rejected: tuning the ratio to something between the reference's original proportions and square (a "less bad" middle ground) — square is the same principled, already-user-approved standard this milestone settled on for Grade, not a new judgment call to make from scratch.

### Resolved during PR review (Codex + CodeRabbit + Copilot, PR #329, 2026-08-07)

1. **The Part 3 "solved, not guessed" container-`aspect-ratio` technique wasn't actually exact.** Codex's review re-derived the grid-track algebra directly: the big tile's horizontal axis crosses 2 column gaps while the vertical axis it spans only crosses 1 internal row gap, so the two axes disagree by exactly one `gap` value — on desktop the big tile came out `gap`-px narrower than tall; on mobile, the mirror error (wider than tall). Small tiles were unaffected (each sits in exactly 1 column and 1 row either way, so the gap-count asymmetry never applied to them) — which is why this passed the existing E2E assertion (`bigBox!.width > smallBox!.width * 1.5`, never a squareness check). Fixed per Part 3's updated description above: every tile gets its own `aspect-ratio: 1`, desktop columns changed from `2fr 1fr 1fr` to 4 equal columns (`big` now spans 2 of them), container-level `aspect-ratio` and `grid-template-rows` both removed entirely — exact regardless of container width or gap size, not just closer.
2. **`BookingPhotoPicker.tsx`'s dimension capture had a real click-before-load race.** The pick buttons were never gated on whether `handleThumbnailLoad` had actually run — a fast click right after the photo grid mounted could call `handlePick` before the thumbnail's `load` event fired, persisting a `GalleryImage` with no `width`/`height` (degrading gracefully to the same fixed-box fallback a pre-M18-S06 image gets, but still violating this story's own AC). Fixed by making the captured-dimensions map reactive `useState` (was a plain mutated `Map`, never re-rendering) and disabling each pick button until its own thumbnail's dimensions are in it.
3. **`pill-select.tsx`'s disabled and selected states visually collided.** A previously-saved `layout: 'featured'` choice that becomes disabled (images drop below 5) rendered with plain disabled styling — `aria-checked` stayed `true`, but nothing on screen distinguished it from "unavailable and not yours," losing the "this is your current pick" signal (Copilot). Fixed with a 4th, distinct selected+disabled style (muted blue, not muted gray) — also resolved the pre-existing Sonar S3358 nested-ternary flag on the same line by extracting the variant logic into its own function.
4. **`GalleryConfigPanel.tsx`'s Position selector stayed visible and editable for an inactive layout.** Once a saved `'featured'` gallery drops below 5 images, `gallery.layout` is still `'featured'` (only the *rendering* falls back to grid — Part 4's own display-time-fallback design, unchanged) — but the Position pill was gated on `layout === 'featured'` alone, so it kept rendering as if live (CodeRabbit). Fixed by additionally requiring `images.length >= 5`; the stored `featuredPosition` value itself is untouched either way, so it's still there once a 5th image brings the layout back.
5. **`featuredRequiresFiveImages`/`featuredUsesFirstFiveImages` copy read as referring to whichever layout was currently selected.** Both hints render regardless of the active layout (the first below 5 images no matter what; the second whenever `layout === 'featured'` specifically, but was worded generically) — "Este layout exige.../This layout requires..." is ambiguous when Grade or Mosaico is actually selected (Copilot, both locales). Reworded to name "Destaque"/"Featured" explicitly in both `pt-BR` and `en`.
6. **`GalleryItem.tsx`'s `sizes` prop was one fixed value for every layout, including `'featured'`.** The featured big tile renders ~50vw desktop / 100vw mobile and its 4 small siblings ~25vw / 50vw — neither matches the grid/masonry-tuned `33vw`/`50vw`/`100vw` value that was being reused unconditionally, under-fetching the big tile and over-fetching the small ones (Codex, `docs/ANTI_PATTERNS.md`'s `<Image fill>` row). Fixed with a new `isFeaturedPrimary` prop (mirrors `priority`'s own `i === 0` wiring) driving a layout/role-specific `sizes` value.

### Dependencies

M18-S06 — code confirmed present in this branch (not yet `✅ Done`-marked; both stories ship in the same PR). No migration (`jsonb`, same pattern as every module-data field in this milestone).

---

## M18-S08 — Hotsite editor usability: module-config Preview + discard-confirm, and a "visit live site" link

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-027
**UC reference:** UC-027 (Tenant Admin Manages Hotsite Content & Branding)

This story bundles three small, independently-scoped usability improvements to `HotsiteEditor.tsx`, all raised in the same conversation: (1) a "Preview" button inside the per-module config screen (Parts 1–6), (2) a confirm-before-discard prompt when leaving that same screen with unsaved edits (Part 7), and (3) a "visit live site" link on the main tabs screen's action bar (Part 8, unrelated to module-config).

### Background

`HotsiteEditor.tsx` holds one `draft: HotsiteAdminContentResponse` plus a `view: EditorView` union (`'tabs' | 'preview' | {view:'module-config', type, localData}`). Opening "Configurar" on a module (`handleConfigure`, `HotsiteEditor.tsx:245-248`) seeds `view.localData` from `draft.layout`; editing a panel (`handleLocalDataChange`, `:250-252`) mutates only `localData`. "Aplicar" (`handleApply`, `:254-263`) merges `localData` into `draft.layout` and returns to `'tabs'`; "Cancelar" (`handleCancelConfig`, `:265-267`) discards `localData` and also returns to `'tabs'`.

"Preview" already exists (`HotsitePreview.tsx`, shipped in M13-S37) but is only reachable from the `'tabs'` view — the desktop aside and mobile action bar buttons in `HotsiteEditor.tsx:404-412`/`:423-431` both do `setView({view:'preview'})`, and it renders `draft` directly (a true live/in-memory preview, not a saved-data fetch). Because a module's edits only land in `draft` after Aplicar, previewing an in-progress module change today requires Aplicar → back to tabs → Preview, and — per the user's report — if the tenant then wants to tweak further, they must navigate back into "Configurar" on that module again from scratch, having already committed the previous attempt. There is no Preview affordance inside `ModuleConfigShell.tsx` at all today.

"Back" from Preview isn't a route — it's the shared dashboard Topbar's back-arrow override (`apps/web/shells/dashboard/components/topbar-status-context.tsx`), wired in the `useEffect` at `HotsiteEditor.tsx:139-171`. Today it always resolves to `() => setView({view:'tabs'})` when `isPreview` is true, regardless of how Preview was reached.

### Description

Add a "Preview" button to `ModuleConfigShell.tsx` so a tenant admin can see their in-progress module edit rendered in the real hotsite layout without first committing it via Aplicar, and without losing that edit if they come back to keep tweaking.

**Part 1 — New `EditorView` variant + a shared merge helper**

- `HotsiteEditor.tsx:40-47`: add a fourth `EditorView` member, sibling to `'module-config'`, sharing its `type`/`localData` shape:

  ```ts
  | {
      readonly view: 'module-config-preview';
      readonly type: HotsiteModuleType;
      readonly localData: Record<string, unknown>;
    }
  ```

- Extract the merge logic `handleApply` already does inline (`current.layout.map((m) => (m.type === type ? { ...m, data: localData } : m))`, `:257-260`) into a small top-level pure function `mergeLocalDataIntoLayout(layout, type, localData)`, reused by both `handleApply` and the new preview-draft computation below — avoids duplicating the same merge in two places.

**Part 2 — Ephemeral preview draft, rendered via the existing `HotsitePreview`**

- New render branch in `HotsiteEditor.tsx`, alongside the existing `view.view === 'module-config'`/`'preview'` branches (`:269-284`):

  ```ts
  if (view.view === 'module-config-preview') {
    const previewDraft: HotsiteAdminContentResponse = {
      ...draft,
      layout: mergeLocalDataIntoLayout(draft.layout, view.type, view.localData),
    };
    return (
      <HotsitePreview
        draft={previewDraft}
        onPublish={() => handlePublish(previewDraft)}
        isPublishing={isPublishing}
      />
    );
  }
  ```

- No changes to `HotsitePreview.tsx` itself — it already renders whatever `draft` it's given; this is the same component used for the ordinary tabs → Preview path, just fed a merged-but-not-yet-committed draft instead of the real one. `draft` and `view.localData` are both untouched by entering this state — neither is written to.

**Part 3 — `handlePublish` accepts an optional content override, and every existing wiring must be fixed to not leak a click event into it**

- `HotsiteEditor.tsx:196`: change the signature from `async function handlePublish(): Promise<void>` to `async function handlePublish(contentOverride?: HotsiteAdminContentResponse): Promise<void>`, with `const content = contentOverride ?? draft;` at the top, and every `draft.branding`/`draft.layout`/`draft.seo` reference inside the function body (currently just the one `stripResolvedImageUrls(draft.branding, draft.layout, draft.seo, tenantId)` call at `:198`) reading from `content` instead. This makes Publish-from-module-config-preview submit exactly what's visually shown — the in-progress module edit merged with the rest of the draft — in the same single mutation call `handlePublish` already makes, not a separate "apply, then publish" step. The ordinary tabs → Preview → Publish path is unaffected: no `contentOverride` passed, `content` falls back to `draft`, byte-for-byte the same behavior as today.
  - **Gotcha the refactor must not introduce:** `handlePublish` is currently wired directly as a raw DOM/React event handler in three places, all of which pass the click's `SyntheticEvent` as the function's first argument today — harmless while `handlePublish` took zero parameters, but a real bug once it has an optional first parameter, since the event object would silently become `contentOverride` (crashing `stripResolvedImageUrls` on `event.branding` being undefined). Every one of these three sites must be changed to a zero-arg wrapper, `() => handlePublish()`, so no event ever reaches the parameter:
    - `HotsiteEditor.tsx:398` — desktop aside "Publicar" button, `onClick={handlePublish}` → `onClick={() => handlePublish()}`.
    - `HotsiteEditor.tsx:435` — mobile action bar "Publicar" button, same fix.
    - `HotsiteEditor.tsx:283` — `<HotsitePreview draft={draft} onPublish={handlePublish} .../>` (tabs → Preview path) → `onPublish={() => handlePublish()}`. (`HotsitePreview.tsx:295,312` themselves wire their Publish buttons as `onClick={onPublish}` directly, so whatever function reaches its `onPublish` prop is invoked with the click event as the first argument — the prop's `readonly onPublish: () => void` type doesn't change, but the caller must supply a genuinely zero-arg closure, not rely on structural typing to save it.)
  - The new Part 2 call site (`onPublish={() => handlePublish(previewDraft)}`) is written correctly from the start — called out here so the fix to the three *existing* sites isn't skipped as "not part of this change."

**Part 4 — Back from this preview returns to module-config, not tabs, with the same edit intact**

- In the topbar-override `useEffect` (`HotsiteEditor.tsx:139-171`), add a third branch (alongside `configuringType` and `isPreview`) for `view.view === 'module-config-preview'`:

  ```ts
  const moduleConfigPreview = view.view === 'module-config-preview' ? view : null;
  // ...
  if (moduleConfigPreview) {
    const backToModuleConfig = () =>
      setView({
        view: 'module-config',
        type: moduleConfigPreview.type,
        localData: moduleConfigPreview.localData,
      });
    setOnBackOverride?.(() => backToModuleConfig);
    setBackLabelOverride?.(t('previewView.backLabel'));
    setPageTitleOverride?.(t('previewView.pageTitle'));
    return () => {
      setOnBackOverride?.(null);
      setBackLabelOverride?.(null);
      setPageTitleOverride?.(null);
    };
  }
  ```

  Add `moduleConfigPreview` to the effect's dependency array alongside the existing `configuringType`/`isPreview`. This is the one concrete behavior change the user asked for: clicking the topbar back arrow from a module-config-triggered preview lands back on `{view:'module-config', type, localData}` with `localData` exactly as it was — never reset to the last-Aplicar'd value, never discarded.
- Reuses `previewView.backLabel` ("Voltar a editar"/"Back to edit") and `previewView.pageTitle` ("Preview") — both already generic enough to apply regardless of which screen Preview was opened from. No new i18n keys for this part.

**Part 5 — "Preview" button on `ModuleConfigShell`**

- `ModuleConfigShellProps` (`ModuleConfigShell.tsx:8-13`) gains `readonly onPreview: () => void`.
- Desktop aside (`ModuleConfigShell.tsx:43-59`): insert a new outline `Button` between the existing Aplicar and Cancelar buttons, `onClick={onPreview}`, `data-testid="module-config-preview-desktop"`, label `t('...preview')` reusing the existing top-level `dashboard.hotsitePage.preview` key ("Preview" in both locales) — the same word already used for the tabs-level Preview button. `useTranslations('dashboard.hotsitePage.layout.configShell')` is scoped to that sub-namespace today (`ModuleConfigShell.tsx:28`); reach the sibling top-level key via a second `useTranslations('dashboard.hotsitePage')` call (mirrors how `HotsiteEditor.tsx` itself calls `t('preview')` off the unscoped `dashboard.hotsitePage` namespace).
- Mobile fixed bar (`ModuleConfigShell.tsx:65-85`): currently 2 buttons, `flex-1` Cancelar + `flex-[2]` Aplicar. Revise to 3 evenly-weighted (`flex-1` each) buttons in order Cancelar / Preview / Aplicar — both Cancelar and the new Preview stay `variant="outline"`; Aplicar keeps sole use of the primary color so the "most likely next action" stays visually distinct even without the extra width it had at 2 buttons. `data-testid="module-config-preview-mobile"`.
- `HotsiteEditor.tsx:269-279` (the `view.view === 'module-config'` render branch): pass `onPreview={() => setView({view: 'module-config-preview', type: view.type, localData: view.localData})}` into `<ModuleConfigShell>`.

**Part 6 — i18n**

No new keys for Parts 1–5. Part 4 and Part 5 both reuse existing copy (`previewView.backLabel`, `previewView.pageTitle`, top-level `preview`) — confirmed accurate for this new entry point, not repurposed from an unrelated meaning. (Parts 7 and 8, below, each need their own new keys.)

**Part 7 — Confirm before discarding unsaved module-config edits**

Today, both ways of leaving the module-config screen without clicking Aplicar — the "Cancelar" button and the topbar back arrow — discard `view.localData` immediately and silently (`handleCancelConfig`, `HotsiteEditor.tsx:265-267`, and the `backToTabs` closure at `:141`, both just `setView({view:'tabs'})`). This adds a confirmation prompt, but **only when there's actually something to lose** — an edit that differs from the module's last-Aplicar'd value. This is the first confirm-dialog anywhere in `apps/web` today (confirmed by direct search — not even the existing "Unpublish" destructive button at `HotsiteEditor.tsx:380-388` has one; that stays out of scope here, unrelated to this story).

- **New primitive:** `apps/web/shared/components/ui/alert-dialog.tsx` (+ `.spec.tsx`) — standard shadcn `AlertDialog` composition wrapping `@radix-ui/react-alert-dialog` (new dependency, added to `apps/web/package.json` at the same major version already used by this workspace's other `@radix-ui/react-*` packages, e.g. `-popover`/`-select`). Mirrors how `popover.tsx`/`select.tsx` already wrap their own Radix primitives in this repo — tenant-agnostic dashboard styling only, no `--ba-*` (this screen is outside the hotsite styling boundary, same as every other dashboard component). **Must land in `dependencies`, not `devDependencies`** — it's imported by production code (`alert-dialog.tsx`, itself imported by `ModuleConfigShell.tsx`), and `docs/ANTI_PATTERNS.md`'s "production import listed only in `devDependencies`" row documents exactly this failure mode: `pnpm deploy --prod` strips `devDependencies` entirely, so a misclassified package boots fine in dev/test and fails only in production with `Cannot find module`.
- **Dirty check:** a new top-level, unexported function in `HotsiteEditor.tsx`, alongside `mergeLocalDataIntoLayout` (Part 1):

  ```ts
  function isModuleDataDirty(
    committed: Record<string, unknown>,
    local: Record<string, unknown>,
  ): boolean {
    return JSON.stringify(committed) !== JSON.stringify(local);
  }
  ```

  Structural (`JSON.stringify`) comparison, not a deep-equal library — none is currently a dependency of `apps/web` (confirmed by direct check of `package.json`), and this data is always plain JSON (no functions/dates) coming straight out of the config panels. Accepted, deliberate limitation: if a panel ever rebuilds an unchanged object with different key insertion order, this reports a false "dirty" (an unnecessary prompt), never a false "clean" (never silently loses a real edit) — the safe direction to be wrong in.
- **State + wiring, in `HotsiteEditor.tsx`:**
  - New `const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);`.
  - Replace `handleCancelConfig` (`:265-267`) with three functions:

    ```ts
    function requestCancelConfig(): void {
      if (view.view !== 'module-config') return;
      const committedData = draft.layout.find((m) => m.type === view.type)?.data ?? {};
      if (isModuleDataDirty(committedData, view.localData)) {
        setDiscardConfirmOpen(true);
      } else {
        setView({ view: 'tabs' });
      }
    }

    function handleConfirmDiscardConfig(): void {
      setDiscardConfirmOpen(false);
      setView({ view: 'tabs' });
    }

    function handleCancelDiscardConfig(): void {
      setDiscardConfirmOpen(false);
    }
    ```

  - `<ModuleConfigShell onBack={...}>` (`:274`) changes from `handleCancelConfig` to `requestCancelConfig` — the Cancelar button now goes through the dirty check.
  - **Stale-closure gotcha the topbar wiring must avoid:** the topbar back-arrow override is (re)created only when `configuringType` changes (`HotsiteEditor.tsx:139-171`'s `useEffect` dependency array) — deliberately, so it doesn't re-run on every keystroke (see the effect's own comment). `requestCancelConfig` itself, however, needs the *current* `view.localData`/`draft` on every click, which the effect's stale dependency array won't provide if wired in directly. Fix: keep a ref holding the latest function, refreshed every render via `useLayoutEffect` (not a plain assignment during render, which `react-hooks/refs` disallows, and not `useEffect`, which doesn't guarantee running before the topbar-wiring effect on the same commit):

    ```ts
    const requestCancelConfigRef = useRef<() => void>(() => {});
    useLayoutEffect(() => {
      requestCancelConfigRef.current = requestCancelConfig;
    });
    ```

    and inside the `configuringType` branch of the existing effect, change `const backToTabs = () => setView({ view: 'tabs' }); setOnBackOverride?.(() => backToTabs);` to `setOnBackOverride?.(() => () => requestCancelConfigRef.current());` — the effect's dependency array stays exactly as-is (`configuringType`, `isPreview`, `setOnBackOverride`, `setBackLabelOverride`, `setPageTitleOverride`, `t`), but the invoked function always reads the fresh ref, so a click on the topbar arrow always dirty-checks against the edit the admin is actually looking at, not whatever was there when the panel first opened. `useLayoutEffect` (not `useEffect`) makes this ordering structural — React flushes all of a component's layout effects before any of its passive effects, so the ref is guaranteed fresh before the topbar-wiring effect (a plain `useEffect`) can ever run on the same commit, regardless of declaration order (PR #330 review, Copilot).
- **Dialog rendering — lifted state, child-rendered UI:** `discardConfirmOpen` must be visible to both trigger points (`ModuleConfigShell`'s Cancelar button and the topbar arrow, which lives outside `ModuleConfigShell`'s subtree entirely), so the boolean stays in `HotsiteEditor`. The dialog's JSX itself renders inside `ModuleConfigShell` (it's only ever relevant while that screen is mounted, exactly matching this component's existing scope). `ModuleConfigShellProps` (`ModuleConfigShell.tsx:8-13`) gains:

  ```ts
  readonly discardConfirmOpen: boolean;
  readonly onConfirmDiscard: () => void;
  readonly onCancelDiscard: () => void;
  ```

  Rendered as a fully-controlled `AlertDialog` (no `AlertDialogTrigger` — it's opened programmatically via the `open` prop, a standard supported Radix usage):

  ```tsx
  <AlertDialog
    open={discardConfirmOpen}
    onOpenChange={(open) => { if (!open) onCancelDiscard(); }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('discardConfirmTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('discardConfirmDescription')}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('discardConfirmKeepEditing')}</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirmDiscard}>
          {t('discardConfirmDiscardButton')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  ```

  `AlertDialogCancel` needs no explicit `onClick` — Radix's own Cancel element dismisses the dialog, which fires the `Root`'s `onOpenChange(false)` above, which already calls `onCancelDiscard()`; pressing Escape takes the same path (correctly treated as "keep editing," never as a silent discard). **Clicking outside the dialog does not dismiss it** — confirmed by direct read of `@radix-ui/react-alert-dialog`'s `AlertDialogContent` source: it hardcodes `onPointerDownOutside`/`onInteractOutside` to an unconditional `event.preventDefault()`, with no prop-based way to override it (those handlers are spread after consumer props, so they always win). This is deliberate, not a gap — it's the same behavior every alert/confirm dialog implementation uses (native `confirm()`, Radix, MUI, Chakra), distinguishing `AlertDialog` from a plain `Dialog` for exactly this "the user must make an explicit choice" class of interaction. Confirmed correct as-is during PR review (Codex) rather than worked around — switching to a plain `Dialog` to add outside-click dismissal would trade away `role="alertdialog"` semantics and the focus-trap behavior tuned for this flow, for a UX pattern this kind of dialog isn't supposed to have.
  - `HotsiteEditor.tsx:269-279` (the `view.view === 'module-config'` render branch) passes the three new props through: `discardConfirmOpen={discardConfirmOpen}`, `onConfirmDiscard={handleConfirmDiscardConfig}`, `onCancelDiscard={handleCancelDiscardConfig}`.
- **Scope, confirmed:** this only guards the module-config screen's two discard paths (Cancelar, topbar back arrow) — not the top-level Branding/Layout/SEO/Manifest tabs (switching tabs there already silently discards in-progress state today, e.g. Manifesto per M18-S02 Part 3, and that's unchanged by this story), and not browser-level navigation (closing the tab, the browser back button) — this view is client-side state on one route, not a real route change, so there's no `beforeunload`/route-guard mechanism to hook into, and none is added here.
- **i18n** — 4 new keys under `dashboard.hotsitePage.layout.configShell`, both `pt-BR` and `en`, same commit:

  | Key | pt-BR | en |
  |---|---|---|
  | `discardConfirmTitle` | Descartar alterações? | Discard changes? |
  | `discardConfirmDescription` | Você tem alterações neste módulo que ainda não foram aplicadas. Se sair agora, elas serão perdidas. | You have unapplied changes to this module. If you leave now, they'll be lost. |
  | `discardConfirmKeepEditing` | Continuar editando | Keep editing |
  | `discardConfirmDiscardButton` | Descartar alterações | Discard changes |

**Part 8 — "Visitar site": a link to the real, live public hotsite, from the main tabs screen only**

Not related to module-config — this is the top-level tabs screen's action area (`HotsiteEditor.tsx`'s desktop aside, `:392-417`, and mobile fixed bar, `:420-441`), which today has exactly "Publicar"/"Preview". Confirmed by direct read of `apps/web/app/[slug]/page.tsx:42-48`: the public hotsite route already renders gracefully for an unpublished tenant (`<Unavailable />`, not a 404/error), so this link needs no conditional disabling for that case — it's always safe to offer.

- Both the dashboard (`/dashboard/hotsite`) and the public hotsite (`/[slug]`) are routes within this same `apps/web` Next.js app, on the same origin — confirmed by the user's own examples (`localhost:3000/dashboard/hotsite` + `localhost:3000/ikaro`; staging `ikaro-web-crle4i3nrq-rj.a.run.app` for both). So the link is a plain relative path, `/${tenantSlug}` — no origin-detection logic needed, `tenantSlug` already comes from the existing `useTenant()` call (`HotsiteEditor.tsx:123`).
- A real `<a>` tag (not Next.js `<Link>`, and not a `window.open()` in a click handler) — `target="_blank" rel="noopener noreferrer"` — opens the live site in a new tab, so the admin's in-progress draft in the editor is never at risk of being navigated away from. Uses the existing `Button asChild` + Radix `Slot` pattern already established at ~15 other call sites in `apps/web` (e.g. `ServiceEditPage.tsx:45`, `StaffDetailPage.tsx:170`) — not a new pattern.
- Desktop aside (`HotsiteEditor.tsx:392-417`): new `variant="outline"` button, placed after the existing Preview button and before the `<hr>`/hint text — order becomes Publicar (primary) → Preview (outline) → Visitar site (outline):

  ```tsx
  <Button asChild variant="outline" className="w-full" data-testid="hotsite-view-live-site-desktop">
    <a href={`/${tenantSlug}`} target="_blank" rel="noopener noreferrer">
      {t('viewLiveSite')}
    </a>
  </Button>
  ```

- Mobile fixed bar (`HotsiteEditor.tsx:420-441`): currently 2 buttons (`flex-1` Preview, `flex-[2]` Publicar). Revised to 3 evenly-weighted (`flex-1` each) buttons, same rebalancing approach as Part 5's `ModuleConfigShell` mobile bar: Visitar site (outline) / Preview (outline) / Publicar (primary, keeps sole use of the primary color).
- **i18n** — 1 new key, both locales:

  | Key | pt-BR | en |
  |---|---|---|
  | `dashboard.hotsitePage.viewLiveSite` | Visitar site | Visit site |

### Acceptance Criteria

- [ ] "Preview" button appears in `ModuleConfigShell`, both desktop aside and mobile action bar, alongside Aplicar/Cancelar
- [ ] Clicking Preview from an open module-config panel shows the hotsite preview reflecting the in-progress (not-yet-Aplicar'd) edit merged with the rest of the current `draft` — without discarding `view.localData` and without writing into `draft`
- [ ] Clicking the topbar back arrow from that preview returns to the same `module-config` view — same `type`, same `localData` — not reset to the last-Aplicar'd value and not sent to the tabs view
- [ ] Clicking Publish from that preview submits the in-progress module edit merged with the rest of `draft` in a single mutation call, publishes it, and lands back on the tabs view with the success banner — same end state as today's Publish-from-tabs success path
- [ ] All three pre-existing `handlePublish` call sites (`HotsiteEditor.tsx:398`, `:435`, and the tabs-view `HotsitePreview`'s `onPublish` wiring at `:283`) are wrapped as zero-arg closures — none of them can accidentally pass a click `SyntheticEvent` as `contentOverride`
- [ ] The ordinary tabs → Preview → Publish flow (module-config never involved) is behaviorally unchanged
- [ ] Aplicar/Cancelar from the plain `module-config` view behave exactly as before this story **when there is no unsaved edit** — Cancelar/topbar-back navigate straight to `'tabs'`, no dialog
- [ ] Cancelar or the topbar back arrow, when `view.localData` differs from the module's last-Aplicar'd value, opens the discard-confirm dialog instead of navigating away; "Keep editing" (or pressing Escape) closes the dialog and stays on the same `module-config` view with `localData` untouched; clicking outside the dialog does **not** dismiss it (deliberate `AlertDialog` behavior, not a gap — see Part 7); "Discard changes" navigates to `'tabs'`, discarding it — same end state as today's silent Cancelar
- [ ] The discard-confirm dialog correctly reflects the *current* edit, not the edit that existed when the panel was first opened — verified by editing a field, waiting (no click), then clicking Cancelar, confirming the dialog appears (proves the stale-closure/ref fix in Part 7 actually works, not just "a dialog exists")
- [ ] No new i18n keys required for Parts 1–6; existing `previewView.backLabel`/`previewView.pageTitle`/top-level `preview` keys are confirmed accurate when reused from this new entry point
- [ ] The 4 new `discardConfirm*` keys (Part 7) and the 1 new `viewLiveSite` key (Part 8) exist in both `pt-BR` and `en` in the same commit
- [ ] A "Visitar site"/"Visit site" link appears on the main tabs screen's action area only (desktop aside + mobile bar) — **not** on the module-config or module-config-preview screens — opens `/${tenantSlug}` in a new browser tab (`target="_blank"`), leaving the editor's current state untouched in the original tab
- [ ] Coverage ≥80% on changed code; `tsc --noEmit`, lint, full test suite green

### Testing

**Unit — Vitest (`apps/web`):**
- NEW `apps/web/shared/components/ui/alert-dialog.spec.tsx` — mirrors the other new `ui/*` primitive specs' shape (renders when `open`, hidden when not; `AlertDialogAction`/`AlertDialogCancel` fire their respective callbacks).
- UPDATE `apps/web/features/platform/components/hotsite/modules/ModuleConfigShell.spec.tsx`:
  - New Preview button renders in both the desktop aside and mobile bar; clicking it calls `onPreview` exactly once and does not call `onApply`/`onBack`.
  - The discard-confirm dialog renders when `discardConfirmOpen` is `true` and not when `false`; clicking "Discard changes" calls `onConfirmDiscard`; clicking "Keep editing" calls `onCancelDiscard`; neither calls `onBack`/`onApply` directly (`ModuleConfigShell` no longer owns the discard decision, just the dialog's visibility).
- UPDATE `apps/web/features/platform/components/hotsite/HotsiteEditor.spec.tsx`:
  - Opening a module's Configurar panel, editing a field, then clicking Preview switches to a preview showing the merged (draft + `localData`) content — assert against the specific edited value, not just "a preview rendered."
  - Clicking Back from that preview (invoking the pushed `onBackOverride`) returns to the `module-config` view with the same `type` and the edited `localData` still present — not reverted to the pre-edit value.
  - Publish from that preview calls the update-config mutation with the merged layout (not the stale `draft.layout` that predates the edit) and, on success, returns to `'tabs'` with the success banner — mirrors the existing Publish-from-tabs assertions.
  - Regression: the existing Publish-from-tabs tests (aside button, mobile button, `HotsitePreview`'s own Publish button) continue to pass unmodified — proves the optional-override refactor doesn't change default behavior when no override is supplied.
  - Clicking Cancelar (or invoking the topbar back-arrow override) with no edit made goes straight to `'tabs'` — no dialog opens.
  - Clicking Cancelar (or the topbar back-arrow override) after editing a field opens the dialog instead of navigating; confirming discards and returns to `'tabs'`; keep-editing stays on `module-config` with the edit intact.
  - Editing a field, waiting a render cycle (no further interaction), then invoking the topbar back-arrow override still correctly detects the edit as dirty — regression test for the ref-based staleness fix specifically (asserts against the *current* `requestCancelConfigRef.current`, not a snapshot captured at panel-open time).
  - The "Visitar site" link renders in the tabs view's desktop aside and mobile bar with `href="/${tenantSlug}"` and `target="_blank"`; does **not** render in the `module-config` or `module-config-preview` views.

**Playwright E2E (`apps/web/e2e`):**
- UPDATE `apps/web/e2e/hotsite-editor.spec.ts`:
  - Open a module's Configurar panel, edit a field, click Preview (without Aplicar first) — verify the preview reflects the edited value. Click Back — verify the field still shows the edited value (not reverted). Then Aplicar, Publish, reload, verify persisted.
  - Separate case: from that same module-config-preview screen, click Publish directly (skipping Aplicar entirely) — verify the edit persists after reload. This is the case that specifically proves the merged-submit path in Part 3, not just the visual preview.
  - Discard-confirm: open a module's Configurar panel, edit a field, click Cancelar — assert the dialog appears; click "Keep editing" — assert still on the config panel with the edit intact; click Cancelar again, then "Discard changes" — assert back on the tabs view and the field's value (re-opening Configurar) reflects the pre-edit, last-Aplicar'd value.
  - "Visitar site": click it from the tabs view, assert a new tab/page opens at `/${tenantSlug}` (Playwright's `context.waitForEvent('page')` pattern).

### Dependencies

None outstanding for Parts 1–6 — `ModuleConfigShell`, `HotsitePreview`, `draft`/`view` state, and the topbar back-override mechanism all already exist and ship today (M13-S37). Part 7 adds one new runtime dependency, `@radix-ui/react-alert-dialog` (not currently installed — confirmed by direct check of `apps/web/package.json`). Part 8 has no new dependencies.

### Resolved during `/story-discovery M18-S08` (2026-08-07)

1. **No `plan/journey/` prototype required.** All three parts of this story are small, self-contained additions to an already-shipped, already-validated screen (`HotsiteEditor.tsx`, M13-S37) — not a new UX surface needing validation from scratch. Same precedent as M18-S01/S02/S06/S07 in this same milestone.
2. **`docs/04-USE_CASES.md` UC-027 updated in the same pass** (not deferred to this story's own implementation) — step 4 of the Main Flow now describes both the module-config Preview entry point and the "Visitar site" link; a new Alternative Flow A4 describes the discard-confirm prompt. Confirmed by direct read of UC-027 that neither the pre-existing module-config screen nor this story's additions were previously documented there.
3. **`@radix-ui/react-alert-dialog` must be added to `dependencies`, not `devDependencies`** — confirmed against `docs/ANTI_PATTERNS.md`'s documented failure mode (a production-only import misclassified as dev-only passes CI, since tests see the full graph regardless, and only breaks at `pnpm deploy --prod`). Called out explicitly in Part 7 above so it isn't missed during implementation.
