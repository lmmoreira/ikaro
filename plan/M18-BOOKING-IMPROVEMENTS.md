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

## M18-S03 — Dedicated SEO share image (`seo.ogImageUrl`), auto-cropped uploads, and rendering `branding.logoUrl` on the public hotsite

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
- `buildHotsiteMetadata()` updated to read `manifest.seo.ogImageUrl` with real `width`/`height` reflecting the enforced crop ratio (Part 2). **Null/empty `seo.ogImageUrl`:** `openGraph.images` is an empty array (`manifest.seo.ogImageUrl ? [...] : []`) — same shape Next.js already produced for the `branding.logoUrl` version of this code, and it renders zero `<meta property="og:image">` tags either way (an empty array and an omitted key are behaviorally identical here). No fallback to `branding.logoUrl`, since a square logo in a landscape slot is exactly the bad outcome this story fixes.

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
- [ ] `buildHotsiteMetadata()` builds `og:image` from `manifest.seo.ogImageUrl` with accurate `width`/`height`; `openGraph.images` is an empty array when `seo.ogImageUrl` is null/empty (no fallback to `branding.logoUrl`) — no `og:image` tag is rendered either way
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
- `seo.spec.ts` updated — `og:image` reads from `manifest.seo.ogImageUrl` with correct `width`/`height`; empty `images` array when unset.
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
6. **i18n key names and `openGraph.images` wording corrected in this doc** (see Description/AC above) — the doc had drifted from what was actually implemented (`ogImageFormatHint`/`ogImageRemove` vs. the originally-guessed `ogImageHint`; "omit `images` entirely" vs. the actual/equivalent empty-array behavior).

**Not fixed — confirmed pre-existing, out of scope for this story:** `UpdateHotsiteContentUseCase`'s merge-before-transaction read pattern (same shape existed for `branding`/`layout` before this story — the new version guard above closes the actual data-loss risk, but a full redesign of the use case's read/merge ordering is separate); `hotsite-admin.controller.ts` lacking a component spec (pre-existing gap across its other 7 endpoints, not introduced here — this story's endpoints reuse existing routes, only the Zod enum changed).
