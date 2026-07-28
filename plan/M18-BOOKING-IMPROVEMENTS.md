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

*(more stories will be appended here as they're scoped)*

---

## M18-S01 — Configurable hotsite date picker (carousel/calendar) honoring `maxBookingAdvanceDays`

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
