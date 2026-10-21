# M18 — Booking Improvements: Implementation Details (IA)

Eleven stories (S01–S11), all merged. Hotsite booking page and hotsite editor improvements (S01–S08), email sender change (S09), manager schedule buffer visibility (S10), shared `WeekNav` header (S11). Only M18 facts live here; the shared hotsite architecture is in `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md`.

## Artifacts

### Backend — platform context (hotsite)

| Artifact | Path |
|---|---|
| `HotsiteConfig` aggregate: `version`/`markPersisted()` (S03), `MODULE_DATA_VALIDATORS` dispatch map and `updateContent(branding, layout, seo, ctx)` (S01), `HotsiteSeo.ogImageUrl` (S03), independent module-data interfaces for every field below | `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts` |
| `HotsiteCarouselDaysExceedsMaxAdvanceError` (400, `PLATFORM_HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE`, field `carouselDays`) and `HotsiteConfigConcurrentModificationError` (409, `PLATFORM_HOTSITE_CONCURRENT_MODIFICATION`) | `apps/backend/src/contexts/platform/domain/errors/platform-domain.error.ts` |
| Error mapper (generic `PlatformDomainError` → 400 branch; concurrent-modification errors → 409) | `apps/backend/src/contexts/platform/infrastructure/http/platform-error.mapper.ts` |
| Manifest use case: `booking.maxBookingAdvanceDays` returned in both the published and unpublished branches (S01) | `apps/backend/src/contexts/platform/application/use-cases/get-hotsite-manifest.use-case.ts` |
| Update use case: reads the tenant inside `txManager.run()` through `findByIdForUpdate` to validate `carouselDays` (S01) | `apps/backend/src/contexts/platform/application/use-cases/update-hotsite-content.use-case.ts` |
| Locking tenant read (`findByIdForUpdate`) | `apps/backend/src/contexts/platform/application/ports/tenant-repository.port.ts` |
| Upload-purpose enum, copy 1 of 2 (includes `'seo-og-image'`) | `apps/backend/src/contexts/platform/application/dtos/generate-hotsite-image-signed-url.dto.ts` |
| Image path collection/rewrite and URL resolution now include `seo.ogImageUrl` (S03) | `apps/backend/src/contexts/platform/domain/services/hotsite-image-paths.service.ts`, `apps/backend/src/contexts/platform/domain/services/hotsite-image-url-resolver.service.ts` |
| Image promotion (`Promise.all`, log-redacted paths) | `apps/backend/src/contexts/platform/application/services/hotsite-image-promotion.service.ts`, `apps/backend/src/shared/utils/redact-storage-path-for-logging.ts` |
| Entity and repository (`@VersionColumn`; insert vs guarded `UPDATE ... WHERE id AND tenant_id AND version`) | `apps/backend/src/contexts/platform/infrastructure/entities/hotsite-config.entity.ts`, `apps/backend/src/contexts/platform/infrastructure/repositories/typeorm-hotsite-config.repository.ts` |
| Migration `AddVersionToHotsiteConfigs` (S03) | `apps/backend/src/contexts/platform/infrastructure/migrations/1748400000009-AddVersionToHotsiteConfigs.ts` |

### Backend — notification and tenant settings (S09)

| Artifact | Path |
|---|---|
| `EmailDeliveryChannelAdapter.send()`: From = platform `EMAIL_FROM`, `fromName` = tenant name, `replyTo` = `replyToEmail` | `apps/backend/src/contexts/notification/infrastructure/delivery/email-delivery-channel.adapter.ts` |
| Brevo and MailHog adapters pass `{ name, address }` and `replyTo` through nodemailer | `apps/backend/src/contexts/notification/infrastructure/delivery/brevo-email.adapter.ts`, `apps/backend/src/contexts/notification/infrastructure/delivery/mailhog-email.adapter.ts` |
| `EmailSendOptions` gained `fromName?` and `replyTo?`; `NotificationTenantInfo.fromEmail` became `replyToEmail: string \| null` | `apps/backend/src/contexts/notification/application/ports/email-sender.port.ts`, `apps/backend/src/contexts/notification/application/ports/notification-platform.port.ts` |
| `replyToEmail` mapped from `businessInfo.email` | `apps/backend/src/contexts/notification/infrastructure/cross-context/notification-platform.adapter.ts` |
| `settings.notification` block removed from the domain | `apps/backend/src/contexts/platform/domain/value-objects/tenant-settings.vo.ts` |

### Backend — booking context (S10)

| Artifact | Path |
|---|---|
| `AvailabilityService.resolveFlatGap` (is `resolveGap`) and `effectiveFlatGapMinutes`, which delegates to it: one rule | `apps/backend/src/contexts/booking/domain/services/availability.service.ts` |
| `resolveGap(bufferAfterMinutes, turnoverMinutes)` → `{ minutes, source }` or `null` when both are 0; closed list `RESOURCE_GAP_SOURCES` / type `ResourceGapSource` (`SERVICE_BUFFER` \| `RESOURCE_TURNOVER`), mirrored by the DB CHECK | `apps/backend/src/contexts/booking/domain/resource-gap-source.ts` |
| `gapFor` (single source of truth shared with the availability pre-filter); candidates carry `gapMinutes`/`gapSource` | `apps/backend/src/contexts/booking/application/use-cases/resource-occupancy-candidate-builders.helpers.ts` |
| Recurring materialization and resource reassignment build their own candidates and persist/recompute the gap | `apps/backend/src/contexts/booking/application/use-cases/materialize-recurring-schedule-occurrences.helpers.ts`, `apps/backend/src/contexts/booking/application/use-cases/resource-reassignment.helpers.ts` |
| Entity columns `gap_minutes`, `gap_source`; insert binds the two extra arrays | `apps/backend/src/contexts/booking/infrastructure/entities/resource-occupancy.entity.ts`, `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource-occupancy.write-queries.ts` |
| Day-grid read selects the gap and the line's `service_name_at_booking` | `apps/backend/src/contexts/booking/infrastructure/cross-context/typeorm-booking-availability.adapter.ts`, `apps/backend/src/contexts/booking/domain/day-grid-occupancy-block.ts` |
| `DayGridBlock.gap` mapped (null for `CLASS_SESSION` and legacy rows) | `apps/backend/src/contexts/booking/application/use-cases/get-schedule-day-grid.use-case.ts` |
| Migration `AddGapToResourceOccupancy` (constraint `CHK_booking_resource_occupancy_gap`, `NOT VALID` then `VALIDATE`) | `apps/backend/src/contexts/booking/infrastructure/migrations/1748500000025-AddGapToResourceOccupancy.ts` |
| Test builder with defaults for the two new fields | `apps/backend/src/test/builders/booking/resource-occupancy-entity.builder.ts` |

### BFF

| Artifact | Path |
|---|---|
| Public manifest controller passes `booking` through its typed intersection (S01) | `apps/bff/src/features/platform/platform.public.controller.ts` |
| Upload-purpose Zod enum, copy 2 of 2 (includes `'seo-og-image'`) | `apps/bff/src/features/platform/hotsite-admin.schemas.ts` |
| BFF's own `DayGridBlock` copy gained `gap` (kept beside `@ikaro/types`; the `ikaro-types-drift` detector checks both) | `apps/bff/src/features/booking/schedule.types.ts` |

### Shared packages

| Artifact | Path |
|---|---|
| Hotsite module and manifest types: `datePickerType`, `backgroundImagePosition`, `contentPositionX/Y`, `GalleryImage.width/height`, `GalleryModuleData.layout: 'featured'`, `featuredPosition`, `seo.ogImageUrl`, `HotsiteImagePurpose` | `packages/types/src/hotsite.ts` |
| Error codes `HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE`, `HOTSITE_CONCURRENT_MODIFICATION` | `packages/types/src/error-codes.ts` |
| `DayGridBlock.gap` | `packages/types/src/schedule.dto.ts` |
| Image-path regex reused for `seo.ogImageUrl` (`HOTSITE_LOGO_URL_REGEX`) | `packages/validation/src/hotsite.ts` |
| `NotificationSettingsSchema` and the `notification` key removed (schema stays `.strict()`) | `packages/validation/src/tenant-settings.ts` |

### Web — hotsite editor (dashboard)

| Artifact | Path |
|---|---|
| Web-local zod schemas for every new module field | `apps/web/features/platform/hotsite/module-schemas.ts` |
| `parseManifestJson()` — structural check only (S02) | `apps/web/features/platform/hotsite/manifest-schema.ts` |
| `buildHotsiteMetadata()` reads `seo.ogImageUrl`; `buildHotsiteIconsMetadata()` for the favicon (S03) | `apps/web/features/platform/hotsite/seo.ts` |
| `buildContentStageClasses()` shared by Hero and Booking CTA (S05) | `apps/web/features/platform/hotsite/module-styles.ts` |
| Editor: Manifesto tab, `module-config-preview` view, discard confirm, "Visitar site" link | `apps/web/features/platform/components/hotsite/HotsiteEditor.tsx` |
| `mergeLocalDataIntoLayout` and `isModuleDataDirty` (extracted from the editor after S08; the editor and the module-config views both call them) | `apps/web/features/platform/components/hotsite/hotsite-editor-views.tsx` |
| Topbar back/title override hook; holds the `requestCancelConfigRef` refreshed in `useLayoutEffect` (extracted from the editor after S08) | `apps/web/features/platform/hotsite/useHotsiteEditorTopbarOverride.ts` |
| Manifesto tab; SEO share-image field | `apps/web/features/platform/components/hotsite/ManifestTab.tsx`, `apps/web/features/platform/components/hotsite/OgImageUpload.tsx`, `apps/web/features/platform/components/hotsite/SeoTab.tsx` |
| Module-config screen with Preview button and controlled discard `AlertDialog` | `apps/web/features/platform/components/hotsite/modules/ModuleConfigShell.tsx` |
| Config panels (Calendar section, focal point, content position, gallery Destaque) | `apps/web/features/platform/components/hotsite/modules/BookingCtaConfigPanel.tsx`, `apps/web/features/platform/components/hotsite/modules/HeroConfigPanel.tsx`, `apps/web/features/platform/components/hotsite/modules/GalleryConfigPanel.tsx` |
| Gallery dimension capture on upload and on booking-photo pick | `apps/web/features/platform/components/hotsite/modules/GalleryImageManager.tsx`, `apps/web/features/platform/components/hotsite/modules/BookingPhotoPicker.tsx` |
| Upload field: `TARGET_ASPECT_RATIO`, `MINIMUM_STORED_HEIGHT`, `lowResolutionErrorLabel` | `apps/web/features/platform/components/hotsite/SingleImageUploadField.tsx` |
| `compressImage()` (center-crop to ratio, minimum height, fail-closed), `compressImageWithDimensions()` | `apps/web/shared/utils/compress-image.ts` |

### Web — shared UI primitives added

| Artifact | Path |
|---|---|
| shadcn `Textarea` (S02) | `apps/web/shared/components/ui/textarea.tsx` |
| shadcn `AlertDialog` over `@radix-ui/react-alert-dialog`, in `dependencies` (S08) | `apps/web/shared/components/ui/alert-dialog.tsx` |
| `PillSelect` gained optional per-option `disabled` and a selected+disabled style (S07) | `apps/web/shared/components/ui/pill-select.tsx` |

### Web — public hotsite

| Artifact | Path |
|---|---|
| Month-grid date picker on `react-day-picker`, `--ba-*` styled, separate from the dashboard `Calendar` (S01) | `apps/web/features/booking/components/public/AvailabilityCalendar.tsx` |
| Carousel: `maxBookingAdvanceDays` is a required prop; window clamped to `min(carouselDays, maxBookingAdvanceDays)` | `apps/web/features/booking/components/public/AvailabilityCarousel.tsx` |
| Branches on `datePickerType` | `apps/web/features/booking/components/public/BookingForm.tsx` |
| Hero and Booking CTA modules (`vw`-relative floors, focal point, content position stage) | `apps/web/shells/hotsite/components/HeroModule.tsx`, `apps/web/shells/hotsite/components/BookingCtaModule.tsx` |
| Gallery: masonry flex-wrap, Destaque branch, `isFeaturedPrimary`, still wrapped by `GalleryGrid` (lightbox + "Ver mais") | `apps/web/shells/hotsite/components/GalleryModule.tsx`, `apps/web/shells/hotsite/components/GalleryItem.tsx`, `apps/web/shells/hotsite/components/GalleryGrid.tsx` |
| Logo in topbar and footer, initial-letter fallback | `apps/web/shells/hotsite/components/HotsiteAuthBar.tsx`, `apps/web/shells/hotsite/components/Footer.tsx` |
| Favicon via `generateMetadata()` | `apps/web/app/[slug]/layout.tsx` |
| Booking page passes the manifest limit down | `apps/web/app/[slug]/booking/page.tsx` |
| `.gallery-featured-grid` (grid-template-areas re-templated per breakpoint) | `apps/web/app/globals.css` |

### Web — dashboard schedule and navigation

| Artifact | Path |
|---|---|
| Reschedule page receives `maxBookingAdvanceDays` from `fetchTenantSettings` (S01 Part 7) | `apps/web/features/booking/components/dashboard/bookings/RescheduleBookingPage.tsx`, `apps/web/app/dashboard/bookings/[id]/reschedule/page.tsx` |
| Buffer tail derivation per resource column (S10) | `apps/web/features/booking/schedule/schedule-resource-columns.ts` |
| New `buffer` timeline-event kind | `apps/web/features/booking/schedule/schedule-timeline-events.ts`, `apps/web/features/booking/schedule/schedule-timeline.ts` |
| Rendering of the held-time segment | `apps/web/features/booking/components/dashboard/schedule/ScheduleTimelineEventRenderer.tsx`, `apps/web/features/booking/components/dashboard/schedule/TimelineBlockShell.tsx`, `apps/web/features/booking/components/dashboard/schedule/ScheduleResourceColumnsBoard.tsx` |
| `WeekNav` header uses `formatMonthYearRange(start, end, locale)` (S11) | `apps/web/shells/dashboard/components/WeekNav.tsx`, `apps/web/shared/lib/formatting/format-time.ts` |

### Journey / prototype files touched

| Artifact | Path |
|---|---|
| S10 buffer screens | `journeys/staff/prototypes/horarios/09-colunas-buffer.html`, `journeys/staff/prototypes/horarios/09b-so-walace.html` |
| S11 month-boundary screen | `journeys/staff/prototypes/agenda/00b-agenda-month-boundary.html` |

### E2E

| Artifact | Path |
|---|---|
| First E2E coverage of the booking CTA panel, Manifesto tab, hero focal point and mobile height, content position, masonry/featured gallery | `apps/web/e2e/hotsite-editor.spec.ts` |
| Buffer segments per resource column | `apps/web/e2e/schedule-resource-columns.spec.ts` |

## DB Schema

| Change | Story | Detail |
|---|---|---|
| `platform.hotsite_configs.version` | S03 | `@VersionColumn`; optimistic locking mirrors `Booking`'s pattern. Save is insert-vs-guarded `UPDATE`; `affected !== 1` throws `HotsiteConfigConcurrentModificationError` (409). |
| `booking.resource_occupancy.gap_minutes INT NULL`, `gap_source VARCHAR(20) NULL` | S10 | CHECK `CHK_booking_resource_occupancy_gap`: both NULL, or `gap_source IN ('SERVICE_BUFFER','RESOURCE_TURNOVER') AND gap_minutes > 0`. Added `NOT VALID` then a separate `VALIDATE CONSTRAINT`. No backfill. |
| No DDL | S01, S02, S04–S08 | Module data, `seo.ogImageUrl`, `GalleryImage.width/height` live in the existing `jsonb` columns. |
| Data cleanup, not a migration | S09 | The staging `settings.notification` key was removed by hand; no migration file, no `integration-global-setup.ts` change. |

## Structural Decisions

### Three-layer mirror for every module-data field (S01, S04–S07)
A new field on a hotsite module is added in three independent places: the backend aggregate interface, `@ikaro/types`, and the web zod schema. The aggregate does not import `@ikaro/types`. `HotsiteModuleSchema.data` in `@ikaro/validation` is a deliberately opaque `z.record()`, so no BFF or validation-package change is needed and no migration (`jsonb`).

### The aggregate validates module data in exactly one place (S01)
`validateLayout()` only checked `module.type` membership before M18. S01 added the first data rule, `carouselDays <= maxBookingAdvanceDays`, as a per-module-type dispatch map (`MODULE_DATA_VALIDATORS`, only `BOOKING_CTA` has an entry). The rule applies only in carousel mode, so a stale `carouselDays` does not block saving after switching to calendar. The tenant is read with `findByIdForUpdate` inside the transaction because this is a cross-aggregate invariant. Every other enum-valued module field (`datePickerType`, `backgroundImagePosition`, `contentPosition*`, `layout`, `featuredPosition`) stays unvalidated at the aggregate by design; review requests to validate one of them were declined as an inconsistent special case, and would need a uniform pass over all fields.

### Purpose enum has two runtime copies (S03)
`'seo-og-image'` had to be added to both the backend DTO enum and the BFF Zod enum in the same commit. The TypeScript type `HotsiteImagePurpose` was deduplicated into `@ikaro/types`; the two runtime enums remain separate on purpose.

### `seo` now holds a storage path (S03)
`HotsiteImagePathsService` and `HotsiteImageUrlResolver` previously took only `branding` and `layout`. Without the `seo` parameter a `tmp/...` `seo.ogImageUrl` is never promoted and `GET /hotsite` returns a raw storage path. `GetHotsiteManifestUseCase` and `GetHotsiteContentUseCase` route `seo` through the resolver. `openGraph.images` is omitted entirely (key absent) when `ogImageUrl` is empty; there is no fallback to `branding.logoUrl`.

### Image upload pipeline fails closed (S03, S04)
`compressImage(file, targetAspectRatio?, minHeight?)` center-crops to a ratio (`branding` 1:1, `seo-og-image` 1200:630) and rejects below a minimum stored height (`hero`, `booking-cta` 450 px; `lead-form` was added later by M20). `MAX_DIMENSION` is 1600 on the longer axis. `hasHardRequirement` makes every failure path (no `createImageBitmap`, no canvas context, null `toBlob`) throw when either parameter is set, because the backend only signs the upload and never re-checks pixels. The 450 px floor is checked against the post-compression height, not the raw one, because the 1600 px cap squeezes any wide banner to about `1600 / aspectRatio`. `matchesAspectRatio` (2% tolerance) rejects a source too small to represent the ratio.

### Hero/Booking CTA sizing uses `vw`, never `vh` (S04, S05)
A `vh` floor stays pinned to the browser window height and crops badly when the window narrows. Centered variants use `min-h-[42.86vw] sm:min-h-[31.25vw]` (a floor, so overlaid text can grow the box instead of being clipped; a literal `aspect-ratio` would clip). The left-aligned image panel uses `aspect-[21/9] sm:aspect-auto sm:h-full sm:min-h-[15.6vw]`, and its outer section `min-h-[31.25vw]`. Accepted limitation: one focal point cannot keep both horizontal extremes of a banner in frame on mobile.

### Content position is a stage, and Y goes on the grid row (S05)
`contentPositionX/Y` default to `'center'`, a true no-op against the previous hardcoded alignment. The centered variant inserts a `max-w-7xl mx-auto flex` stage between the section and the content wrapper, so left/right anchoring respects the site's content width and not the viewport edge. In the left-aligned variant `contentPositionY` applies to the inner 2-column grid row (the section's `min-h` is a floor, so `align-items` on it does nothing for real content); `contentPositionX` is not read there and its picker is not rendered. Section padding lives on the outer section.

### Gallery: masonry is flex-wrap, grid and featured are square (S06, S07)
Masonry is `flex flex-wrap justify-center items-start gap-4` with one fixed `MASONRY_TILE_BASIS_CLASS` (2 per row on mobile, 3 on desktop) regardless of image count; CSS `columns` was dropped because it cannot center a short last row. Tiles use `GalleryImage.width/height` as `aspectRatio`; images without them fall back to the grid box. The grid box is `aspect-square` (the geometric midpoint between 4:3 and 3:4 sources). Pre-existing galleries are not backfilled. "Destaque" (`layout: 'featured'`): `images[0]` is always the large tile, extras beyond 5 are ignored, and fewer than 5 renders as `grid` at display time without touching the stored value. Every tile is `aspect-ratio: 1` on 4 equal desktop columns, because a container-level ratio derived from `2fr/1fr` tracks is off by one `gap`. `GalleryGrid` still wraps the featured branch so the lightbox survives.

### Editor view state and handlers (S02, S08)
`handlePublish(contentOverride?)` takes an optional draft, so every existing wiring must call `() => handlePublish()`; passing the function directly would hand the click event in as the override. The topbar back override is created only when `configuringType` changes, so it reads `requestCancelConfig` through a ref refreshed in `useLayoutEffect` (not `useEffect`, not a render-time assignment); that wiring now lives in `useHotsiteEditorTopbarOverride.ts`. Back from a module-config preview returns to `module-config` with `localData` intact. The discard check is `JSON.stringify` equality, which can only over-prompt, never lose an edit. The `AlertDialog` ignores outside clicks by Radix design. The Manifesto tab applies only through "Aplicar", discards on tab switch, and ignores unknown top-level keys.

### Email sender (S09)
Per-tenant From addresses cannot work with Brevo (each needs validation; Gmail cannot be authenticated). From is always `EMAIL_FROM` with the tenant name as display name, Reply-To is `businessInfo.email`, and no header is sent when it is null. Names go through nodemailer's structured form, never string concatenation (CRLF and quotes in tenant names). `businessInfo.email` is public, so nothing is auto-copied into it. The update schema stays `.strict()`, so a stale client that still sends `notification` gets a 400. Section 4 of `docs/TENANTS_SETTINGS_SCHEMA.md` was kept as a tombstone, so the citations of sections 5 to 8 still hold.

### Persisted gap origin (S10)
The held time after a booking is `max(service.bufferAfterMinutes, resource.turnoverMinutes)`; a tie with a positive buffer goes to `SERVICE_BUFFER`; `resolveGap` returns `null` when both are 0. Only the last booking line carries the service buffer; a legged line's gap is the resource turnover only; `CLASS_SESSION` rows get none. The origin is stored at write time, because recomputing from current config is wrong after any edit. Recurring materialization and reassignment build their own candidates and must use `resolveFlatGap`; reassignment recomputes the gap for the target resource and validates the recomputed window. The web draws the tail geometrically from `block.endsAt − booking end`; `gap` supplies only the label. Legacy NULL rows render "Origem não registrada" and never a guessed cause. The tenant default buffer is not folded into a stored `ends_at`. The Day merged timeline and Week day-cards show one strip per booking for MANAGER only.

### `WeekNav` formats the visible range once (S11)
One `formatMonthYearRange(start, end, locale)` in the shared formatter serves Agenda (tenant-configurable window, default 14 days) and Horários (7 days). Same month keeps the previous output exactly; different months show both names and one year; a year boundary shows both years.

## Error Mapping

| Error | Code | HTTP |
|---|---|---|
| `HotsiteCarouselDaysExceedsMaxAdvanceError` | `PLATFORM_HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE` | 400 (generic `PlatformDomainError` branch, no mapper change) |
| `HotsiteConfigConcurrentModificationError` | `PLATFORM_HOTSITE_CONCURRENT_MODIFICATION` | 409 |
| Removed with S09 | `PLATFORM_SETTINGS_NOTIFICATION_EMAIL_INVALID` | — |

Both new codes need a translation in `packages/i18n/locales/{pt-BR,en}/errors.json`.

## i18n Keys Added (both `pt-BR` and `en`)

| Story | Namespace / keys |
|---|---|
| S01 | `dashboard.hotsitePage.layout.panels.bookingCta` (Calendar section, picker options, `carouselDays`, out-of-range message) |
| S02 | `dashboard.hotsitePage.tabs.manifest`, `dashboard.hotsitePage.manifest.invalidJsonError` (Aplicar button and hint reuse `layout.configShell.applyLabel`/`.description`) |
| S03 | `dashboard.hotsitePage.seo.ogImageLabel`, `.ogImageFormatHint`, `.ogImageRemove` |
| S04 | `dashboard.hotsitePage.layout.panels.hero`: focal-point label and 3 options, low-resolution error |
| S05 | `panels.hero` and `panels.bookingCta`: `contentPositionX/Y` label and options (16 keys); `bookingCta` focal point and low-resolution error |
| S07 | `panels.gallery`: `layoutFeatured`, `featuredPositionLabel`/`Left`/`Right`, `featuredRequiresFiveImages`, `featuredUsesFirstFiveImages` |
| S08 | `layout.configShell.discardConfirm*` (4 keys), `dashboard.hotsitePage.viewLiveSite` |
| S09 | Removed: `sections.notification`, `notificationFromEmailLabel`, `notificationFromEmailHint`, `errors.notificationFromEmailInvalid`, and the error code above |
| S10 | `dayGridBufferHeading`, `dayGridBufferServiceBuffer`, `dayGridBufferResourceTurnover`, `dayGridBufferUnknownOrigin`, and 3 tooltip keys |
| S11 | none |

## Env Vars / Feature Flags

None added. S09 relies on the existing `EMAIL_FROM` (staging `noreply@ikaro.online`).

## Test Infrastructure Notes

- E2E for S10 creates brand-new uniquely named resources and a far-future date through the real write path, so there is no fixed-slot booking race.
- `resource-occupancy-entity.builder.ts` defaults for `gap_minutes`/`gap_source` are required by the `test-builder-coverage` detector.
- The editor E2E (`hotsite-editor.spec.ts`) asserts exact computed styles (`object-position: 100% 50%`) and a mobile-viewport (390×844) height check, not class names alone.

## Known Open Items (recorded, not defects)

- No drag-to-reorder in `GalleryImageManager`; order is upload/pick sequence, which now decides the featured tile.
- Per-field purpose-locking of image paths (a `seo.ogImageUrl` pointing at another purpose's file) is symmetric with `logoUrl` and was left as a uniform-hardening candidate.
- Image promotion runs `Promise.all` and is awaited before the response; an outbox-based redesign is a follow-up only if gallery sizes grow.
