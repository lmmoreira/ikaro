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
