# TD51 — GENERAL-FIXES

## Status

- **Type**: Technical Debt / Product correctness
- **Priority**: High (customers are shown internal buffer time as appointment time, and managers cannot correct a legacy service buffer when the service has no resources)
- **Context**: Booking context — backend, BFF, public hotsite, and dashboard web app
- **Created**: 2026-10-27
- **Discovered**: Manager report while editing service `01a17e8d-879c-7830-8ef6-e75f03610509`: a resource-free appointment service created with a historical 60-minute default could not save a new 10-minute buffer because the Resources panel sent an empty requirements array; the public availability picker consequently rendered internal reserved windows as customer appointment times.
- **Decision status**: Ready for discovery and implementation in the dependency order below; each story still begins with `/story-discovery`.
- **Related**: `docs/BUSINESS_LOGIC_REFERENCE.md` § Buffer / turnover / transition-gap formulas; `docs/TENANTS_SETTINGS_SCHEMA.md` § `serviceBufferMinutes`

## Problem

Appointment services currently snapshot `tenantServiceBufferMinutes` into `bufferAfterMinutes` at creation. This turns the tenant default into a permanent per-service override: changing the tenant buffer later has no effect on existing services, even when a manager never opted into an override. The domain and API have no `null`/clear-to-inherit state for an appointment service.

The dashboard compounds the problem. `ServiceResourceRequirementsPanel` always PATCHes the resource-requirements endpoint before it PATCHes the service buffer. A resource-free service legitimately holds `resourceRequirements: []`, but the request schema requires at least one item, so the first request returns 400 and prevents the buffer update. This is the reported failure.

Finally, availability response `endsAt` represents the internal reserved window, including the trailing service buffer. The public slot picker renders that value as the customer's appointment end. A 50-minute service with a 10-minute operational buffer must be presented as `09:00–09:50`; the resource can remain internally unavailable through `10:00`. The buffer is operational information, not customer-facing appointment time.

### Why this matters

Customers receive inaccurate expectations about how long they will be at the business, while managers cannot repair the configuration that causes it for resource-free services. The current behavior is especially confusing for a service that inherited the historical 60-minute tenant default: it produces a 110-minute displayed window for a 50-minute service.

## Chosen approach (decided in this session, 2026-10-27)

Model the service buffer as an optional per-service override. `null` means “inherit the tenant’s current `serviceBufferMinutes`”; a numeric value, including `0`, is an explicit override. New appointment services start at `null`. Existing numeric values are preserved: the system cannot infer whether a historical value was intentional, so a manager must explicitly select “use tenant default” to clear it.

Keep the internal reservation end distinct from the customer appointment end in the availability contract. The public UI and customer-facing booking confirmation use the appointment end; availability and resource-conflict logic continue to use the reserved end.

### Story 0 — Restore buffer inheritance and resource-free service saves 🔴 ✅ Done

**Agent:** backend-ts + bff-ts + frontend-ts
**Complexity:** XL
**Docs to load:** `docs/ENGINEERING_RULES_SHARED.md` § Schema-level enforcement; `docs/ENGINEERING_RULES_BACKEND.md` § Transactions; `docs/BFF_ARCHITECTURE.md` § Web → BFF Transport Layer; `docs/TESTING_STRATEGY.md`; `docs/BUSINESS_LOGIC_REFERENCE.md` § Buffer / turnover / transition-gap formulas
**Dependencies:** none
**Pattern:** optional configuration override with explicit `null` inheritance, resolved by one domain method (`Service.effectiveBufferAfterMinutes(tenantDefault)`); plain composition for independent resource and buffer mutations
**Discovered:** 2026-10-27, manager report from the production service edit screen
**Root cause:** `apps/backend/src/contexts/booking/domain/service.aggregate.ts` snapshots the tenant buffer during creation; `apps/web/features/booking/components/dashboard/services/ServiceResourceRequirementsPanel.tsx` submits an empty requirements list before it updates the buffer; `packages/validation/src/booking.ts` rejects that empty list with `.min(1)`.

**Description:**
Make `bufferAfterMinutes` nullable for appointment services throughout the domain, validation, BFF, and web transport. `null` means "inherit the tenant's current `serviceBufferMinutes`"; a number, including `0`, is an explicit override. New appointment services start at `null`; existing numeric values are never rewritten. Permit a flat appointment service to hold no resource requirements (resource-free / LOCATION-fallback behavior); each leg keeps `min(1)`.

**Write-path consistency (discovery finding):** today `null` only occurs on legged/SESSION services, where the buffer is irrelevant. With inheritance, every path that reads a flat service's buffer must resolve `null` to the tenant value, otherwise availability offers slots against the tenant buffer while `resource_occupancy` is written with a 0 gap. Introduce `Service.effectiveBufferAfterMinutes(tenantDefault)` and use it in all of: `resource-occupancy-candidate-builders.helpers.ts:61` (booking create), `availability-window-resolution.helpers.ts:110`, `materialize-recurring-schedule-occurrences.helpers.ts:157`, `recurring-booking-schedule-request.helpers.ts:129` and `:173`, `resource-reassignment-window.helpers.ts:47`, plus the three read paths that already use `?? serviceBufferMinutes` (`availability-query.service.ts`, `availability-summary.helpers.ts`, `resource-scoped-availability.helpers.ts`). Each caller obtains the tenant default through the existing `IBookingPlatformPort` / tenant settings it already has access to (extend the port only if a path has none). Persisted gaps are not recomputed when the tenant default changes. Resolution rule: service `null` → tenant's current `serviceBufferMinutes`; service number (incl. `0`) → that number, never the tenant's. The tenant value is always a number (validated 0–120; platform default 60 when never configured), so the resolver has no tenant-null case.

**UX:** no checkbox. The buffer input is blank = inherit (saves `null`), with the tenant-effective value as placeholder and hint; a number (incl. `0`) is an override. Clearing the field is the "use tenant default" action. The Resources panel saves requirements only when they changed and the buffer only when it changed (per-field dirty tracking); a buffer-only edit never PATCHes requirements. When both changed, requirements persist first, then the buffer. The backend adds `tenantDefaultBufferMinutes` (the tenant's current `serviceBufferMinutes`; effective buffer = `bufferAfterMinutes ?? tenantDefaultBufferMinutes`) to the staff service result so the web can show the inherited value even after an override is cleared, with no tenant-settings call. Legged and SESSION services keep today's behavior (field disabled/hidden; buffer forced to `null`; SESSION→APPOINTMENT lands on `null`).

**Backend use case steps:**
1. Create an appointment service with `bufferAfterMinutes = null` (stop passing `tenantServiceBufferMinutes` from `service.controller.ts:135`; remove the create-time snapshot from `service.aggregate.ts`/`service.types.ts`).
2. Update an appointment service with a non-negative integer (override, incl. `0`) or `null` (clear); preserve SESSION and legged-service restrictions.
3. Accept an empty flat `resourceRequirements` array for APPOINTMENT services without legs; retain one-or-more for every leg.
4. Resolve the effective buffer through `Service.effectiveBufferAfterMinutes(tenantDefault)` on every read and write path above; expose `tenantDefaultBufferMinutes` on the staff service result.
**Backend HTTP surface:** extends existing `PATCH /v1/services/:id` to accept `bufferAfterMinutes: number | null`; extends existing `PATCH /v1/services/:id/resource-requirements` to accept `[]` for flat appointment services; staff service result gains `tenantDefaultBufferMinutes` (not on the public payload).
**BFF endpoint spec:** same authenticated same-origin endpoints; forwards nullable buffer and empty flat requirements after shared-schema validation; maps `tenantDefaultBufferMinutes` in the staff mapper only (`toPublicServiceResponse` stays whitelisted).
**Prototype references:** none — edit of an existing panel; copy and layout follow the current Resources tab.
**New migration / i18n keys / env vars / feature flags:** no migration, env vars, or feature flags; paired `pt-BR`/`en` keys under `dashboard.servicesPage` for the inherit placeholder/hint (existing `recursosBuffer*` keys reworded).

**Files to create/modify:**
- `packages/validation/src/booking.ts` (flat `UpdateServiceResourceRequirementsSchema` allows `[]`; legs keep `min(1)`)
- `packages/types/src/service.dto.ts` (nullable request field; `tenantDefaultBufferMinutes` on the staff response)
- `apps/backend/src/contexts/booking/domain/service.aggregate.ts`, `service.types.ts`, `service.spec.ts`
- `apps/backend/src/contexts/booking/application/dtos/update-service.dto.ts`
- `apps/backend/src/contexts/booking/application/use-cases/create-service.use-case.ts` + `.spec.ts`
- `apps/backend/src/contexts/booking/application/use-cases/update-service.use-case.ts` + `.spec.ts`
- `apps/backend/src/contexts/booking/application/use-cases/service-result.mapper.ts`
- `apps/backend/src/contexts/booking/infrastructure/controllers/service.controller.ts` + `service.controller.integration.spec.ts`
- Write/read-path helpers listed under Write-path consistency, each with its `.spec.ts`; `availability-query.service.ts`
- `apps/backend/http/booking/services.http`, `apps/bff/http/booking/services.http` (nullable buffer + empty flat requirements examples)
- `apps/bff/src/features/booking/services.schemas.ts`, `services.mapper.ts`, `services.types.ts`, `services.controller.spec.ts`
- `apps/web/features/booking/components/dashboard/services/ServiceBufferAfterMinutesField.tsx` + spec
- `apps/web/features/booking/components/dashboard/services/ServiceResourceRequirementsPanel.tsx` + spec
- `apps/web/features/booking/components/dashboard/services/ServiceEditConfigTabPanels.tsx` (passes the effective value) + spec
- `apps/web/e2e/services-resource-config.spec.ts`
- `packages/i18n/locales/pt-BR/web.json`, `packages/i18n/locales/en/web.json`
- Docs: `docs/USE_CASES.md` (UC-053), `docs/DOMAIN_MODEL.md`, `docs/API_CONTRACTS.md`, `docs/BUSINESS_LOGIC_REFERENCE.md` (already updated at discovery)

**Acceptance criteria — product:**
- [ ] A new appointment service uses the current tenant buffer unless a manager explicitly sets a service-specific value; later tenant-default changes apply to it.
- [ ] A manager can set, change, or clear a service buffer on a service with no resources; clearing the field restores the tenant default, and the field shows the effective value.
- [ ] A resource-free flat appointment service saves without a validation error.
- [ ] Existing explicit numeric service buffers retain their behavior until a manager changes or clears them; `0` means no buffer.
- [ ] The gap persisted on a booking's resource occupancy equals the gap availability offered the slot with, for an inheriting service.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `service.spec.ts`: create → `null`; set number / `0` / `null`; rejected for legs and SESSION; SESSION→APPOINTMENT lands on `null`; `effectiveBufferAfterMinutes()` resolves `null` → tenant and keeps `0`.
  - [ ] `create-service.use-case.spec.ts` proves a new appointment service persists `null` and no tenant value is snapshotted.
  - [ ] `update-service.use-case.spec.ts` proves numeric overrides, explicit zero, and null clearing while preserving SESSION/legged restrictions; an untouched buffer is not modified (negative guarantee: existing numeric values are never rewritten).
  - [ ] Shared-schema spec: flat `[]` accepted; a leg with `[]` still rejected (negative guarantee).
  - [ ] Each write-path helper spec (`resource-occupancy-candidate-builders`, `availability-window-resolution`, `materialize-recurring-schedule-occurrences`, `recurring-booking-schedule-request`, `resource-reassignment-window`) proves a `null` buffer uses the tenant default and an explicit `0` does not.
  - [ ] BFF `services.controller.spec.ts` / mapper spec: nullable buffer and empty flat requirements forwarded; `tenantDefaultBufferMinutes` mapped on the staff response and absent from the public one.
  - [ ] `ServiceResourceRequirementsPanel.spec.tsx`: buffer-only edit makes zero requirements calls; requirements-only edit makes zero buffer calls; both changed → requirements first, then buffer; a blank field sends `null`, `0` sends `0`.
- Integration:
  - [ ] `service.controller.integration.spec.ts`: nullable buffer update and flat `[]` return 200; a leg with `[]` returns 400; legged/SESSION buffer edits still rejected.
  - [ ] Booking-create integration test: for a service with `null` buffer and a non-default tenant buffer, the persisted occupancy `gap_minutes`/`endsAt` equals the availability-offered window; an explicit `0` yields no gap.
- Tenant isolation:
  - [ ] Buffer and resource-requirement updates by tenant B cannot affect (404) a tenant A service with the same id; inheritance reads only the caller's tenant default.
- E2E (needs the user's yes to run the compose stack):
  - [ ] Extend `services-resource-config.spec.ts`: a manager clears the override on a resource-free service, saves, reloads, and sees the tenant default as the effective value.
- [ ] Coverage ≥80% on changed code.
- [ ] `tsc --noEmit` clean, lint clean.

### Story 1 — Present customer appointment time separately from reserved time 🔴 ✅ Done

**Agent:** backend-ts + bff-ts + frontend-ts
**Complexity:** M
**Docs to load:** `docs/API_CONTRACTS.md` § 4 Schedule & Availability; `docs/BFF_ARCHITECTURE.md` § Web → BFF Transport Layer; `docs/ENGINEERING_RULES_FRONTEND.md` § Hotsite full-page components; `docs/TESTING_STRATEGY.md`; `docs/BUSINESS_LOGIC_REFERENCE.md` § Buffer / turnover / transition-gap formulas
**Dependencies:** Story 0 (✅ Done, #688)
**Pattern:** explicit dual-time API contract — `appointmentEndsAt` for what the customer receives, `endsAt` unchanged for internal reservation/availability
**Discovered:** 2026-10-27, manager report of public slots such as `09:00–10:50` for a 50-minute service
**Root cause:** `AvailabilityService.generateSlots()` (`apps/backend/src/contexts/booking/domain/services/availability.service.ts`) builds `endsAt` as start + summed durations + the last line's effective buffer; `SlotPicker.tsx`, `CustomerReschedulePage.tsx` and `RescheduleActionRail.tsx` render that value as the appointment end.

**Description:**
Add a required `appointmentEndsAt` to every availability slot, computed in the domain `generateSlots()` as start + summed line durations (a legged service's duration is already its total span, transition gaps included; never the trailing buffer). `endsAt` is unchanged: start + durations + the last line's effective buffer. It excludes resource turnover (unknown at the outer pre-filter), so it is the offered window, not the full occupancy. Propagate the field through the query result, `@ikaro/types`, the BFF types and the web, and render it everywhere a slot's end is shown to a user. Buffer duration and the reserved end are never shown.

**Decisions (discovery, 2026-10-28):**
- The slot button keeps the range display and shows `start–appointmentEndsAt`; the validated prototype (start time only) is updated to match.
- Every surface reading `slot.endsAt` switches: `SlotPicker` (guest, customer and dashboard variants), `CustomerReschedulePage` (both uses) and the staff `RescheduleActionRail`, so the from → to comparison is like for like.
- `appointmentEndsAt` is required in `@ikaro/types`, the BFF and the backend (one PR, one deploy; no fallback in the web).
- `BookingSummaryCard`, `BookingSubmittedDetails`, `BasketLines` and `LegItineraryStep` already compute their ends from durations without the buffer; they get regression tests only.

**Backend use case steps:**
1. `generateSlots()` returns `appointmentEndsAt` and `endsAt` for every slot; all three compute paths (explicit `resourceId`, degenerate LOCATION, resource-scoped incl. pinned selections and legs) carry both.
2. `AvailableSlotResult` in `availability-query.service.ts` carries the field.
**Backend HTTP surface:** extends public `GET /v1/schedule/availability` slot items with `appointmentEndsAt`; `startsAt` and `endsAt` keep their meaning.
**BFF endpoint spec:** passthrough (`getForPublic<AvailabilityResponse>`); types only.
**Prototype references:** `journeys/guest/prototypes/book-a-service/02-calendar-slot.html` (slot buttons drawn start-only; update to the range) and `journeys/customer/prototypes/book-a-service/` (shares the guest flow, `dev-notes.md` line 167); parent `journeys/customer/book-a-service.md`.
**New migration / i18n keys / env vars / feature flags:** none.
**UI reuse:** no new control; existing `SlotPicker` only.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/domain/services/availability.service.ts` + `availability.service.spec.ts`
- `apps/backend/src/contexts/booking/application/services/availability-query.service.ts` + `.spec.ts`
- `apps/backend/src/contexts/booking/infrastructure/controllers/schedule-availability.controller.integration.spec.ts`
- `apps/backend/http/booking/availability.http`, and the BFF availability `.http`
- `apps/bff/src/features/booking/schedule.types.ts`, `schedule-availability.controller.component.spec.ts`
- `packages/types/src/schedule.dto.ts`
- `apps/web/features/platform/hotsite/api/schedule.ts`, `apps/web/features/booking/api/booking.spec.ts`
- `apps/web/features/booking/components/public/SlotPicker.tsx` + `.spec.tsx`
- `apps/web/features/customer/components/my-account/CustomerReschedulePage.tsx` + spec
- `apps/web/features/booking/components/dashboard/bookings/reschedule/RescheduleActionRail.tsx` + spec
- Regression specs for `BookingSummaryCard`, `BookingSubmittedDetails`, `BasketLines`
- `apps/web/e2e/` booking spec (customer booking and customer reschedule)
- Docs: `docs/API_CONTRACTS.md` § 4, `docs/BUSINESS_LOGIC_REFERENCE.md` (buffer formulas), `docs/DOMAIN_MODEL.md` (if it describes the slot), `journeys/customer/book-a-service.md` (status), guest and customer `dev-notes.md`, `02-calendar-slot.html`

**Acceptance criteria — product:**
- [ ] A customer sees only the time they will receive, never the trailing operational buffer, on the slot picker and the reschedule screens.
- [ ] A 50-minute service starting at 09:00 with a 10-minute buffer displays `09:00–09:50`; the resource stays internally reserved through 10:00.
- [ ] Booking summaries and post-submission details show the same appointment end as the picker.
- [ ] Staff reschedule compares the booking's real end with the new appointment end, not the buffer-inclusive one.

**Acceptance criteria — technical:**
- Unit (`availability.service.spec.ts`):
  - [ ] Buffer `0`: `appointmentEndsAt === endsAt`.
  - [ ] Multi-service basket with different buffers: only the last line's buffer enters `endsAt`; `appointmentEndsAt` = start + summed durations.
  - [ ] A slot whose appointment fits before closing but whose buffer would run past it stays hidden (negative guarantee: the buffer-inclusive fit rule is unchanged).
  - [ ] Both timestamps are UTC ISO for a `America/Sao_Paulo` day.
- Unit (`availability-query.service.spec.ts`):
  - [ ] `CUSTOMER_SELECTED` service with `durationMinutes`: `appointmentEndsAt` uses the chosen duration.
  - [ ] Service buffer `null` → `endsAt − appointmentEndsAt` equals the tenant default; explicit `0` → no difference (ties to S00).
  - [ ] All three paths return the field: explicit `resourceId`, degenerate, resource-scoped (incl. pinned `resourceSelections`); a legged service includes transition gaps and excludes the trailing buffer.
  - [ ] Negative guarantee: `endsAt` values are unchanged versus before this story.
- Integration (`schedule-availability.controller.integration.spec.ts`):
  - [ ] Buffered flat service and a legged service: `endsAt − appointmentEndsAt` equals the effective buffer.
- BFF:
  - [ ] Component spec: `appointmentEndsAt` passes through verbatim.
- Web:
  - [ ] `SlotPicker.spec.tsx` for guest, customer and dashboard variants renders `appointmentEndsAt`, not `endsAt`; the within-notice dot still renders.
  - [ ] `CustomerReschedulePage` ("moved to" end and "to" window) and `RescheduleActionRail` ("to" end) use `appointmentEndsAt`.
  - [ ] Regression: `BookingSummaryCard`, `BookingSubmittedDetails` and `BasketLines` show no buffer.
- Tenant isolation:
  - [ ] The availability tenant-isolation test is extended: both timestamps resolve only from the resolved tenant's services.
- E2E (needs the user's yes to run the compose stack):
  - [ ] Customer books a 50-minute service with a 10-minute buffer and sees `09:00–09:50` on the picker and the same end in the summary and confirmation.
  - [ ] Customer reschedule screen shows the appointment end, not the buffer-inclusive one.
- [ ] Coverage ≥80% on changed code.
- [ ] `tsc --noEmit` clean, lint clean.

### Story 2 — Show month context in the booking date carousel and selected-date label ✅ Done

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md` § UI layer model and § The `--ba-*` exception; `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys; `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` (booking CTA / branding sections only); `docs/TESTING_STRATEGY.md` § apps/web Testing Infrastructure and § Layer 5 (before adding an E2E test); `journeys/README.md`; `journeys/guest/prototypes/book-a-service/dev-notes.md`
**Dependencies:** none (Stories 0 and 1 are unrelated to this story)
**Pattern:** plain composition — no named pattern applies (a presentational month-marker element rendered inside the existing day strip, plus a date line above the slots)
**Discovered:** 2026-11-09, user report on the production hotsite `/smassagem/booking` with `carouselDays` set to 90: every day pill shows only a weekday and a day number, so the month is unknowable.
**Root cause:** `AvailabilityCarousel.tsx` renders each pill from `dayCarouselLabel()` (weekday, or "Hoje" for index 0) and `dayNumber()` (`apps/web/shared/lib/formatting/date-utils.ts`), neither of which carries month or year. The hotsite `AvailabilityStep.tsx` renders no selected-date line above `SlotPicker`, so nothing after the click confirms which date was chosen.

**Description:**
Add month context to the date carousel in two places. The approved prototype is `journeys/guest/prototypes/book-a-service/02-calendar-slot.html` (commit `3b9d3b8e`; its copy and styling are adjusted as decided below).

1. **Month markers inside the strip.** `AvailabilityCarousel` renders a small marker in the scroll container before the first pill and before every pill whose year-month differs from the previous pill's (e.g. `JUN.`, then `JUL.`). Markers scroll with the pills, so a week that spans two months shows both and no scroll-position tracking is needed. A marker after the first one has a thin left divider. A marker shows the year only when its year differs from the first pill's year, which covers the January boundary. The first marker is always shown, also when the strip stays within one month (consistency across every strip). Month names come from `Intl.DateTimeFormat(locale, { month: 'short' })`, so no i18n keys are needed for them. Month comparison uses the ISO string (`date.slice(0, 7)`), never a `Date` round-trip. The only new helper is `monthMarkerLabel(isoDate, locale, includeYear)` in `date-utils.ts`, following that file's local-time parsing convention.
2. **Selected-date line.** Every surface that picks a day gets the chosen date in the heading above its slots. It reuses `formatDateLong` (via `useFormatting()`) fed by `utcDateFromISO(date)`, which gives "Quinta-feira, 2 de julho" (capitalised, UTC-pinned); no new date-formatting helper is created.
   - **Hotsite** (`AvailabilityStep`, both `datePickerType: 'carousel'` and `'calendar'`): a new line above `SlotPicker`, "Horários disponíveis — {date}" (key `booking.availability.slotsHeading`). `SlotPicker` itself is unchanged: it renders no label.
   - **Dashboard** (`ReschedulePicker`, `NewBookingAvailabilityStep`, `RescheduleBookingPage`): the existing heading above `SlotPicker` gains the date instead of a second heading appearing: `customer.reschedule.slotsSectionLabel`, the new-booking `slotsLabel` and the staff reschedule `availableSlotsLabel` become "… — {date}" in both locales.

**Where the carousel and picker are used (audit result):**

| Surface | Component | Branding | Change |
|---|---|---|---|
| Public hotsite booking, `datePickerType: 'carousel'` (`AvailabilityStep`) | `AvailabilityCarousel` `variant="hotsite"` | Tenant-branded (`--ba-*`) | Markers + date line |
| Public hotsite booking, `datePickerType: 'calendar'` | `AvailabilityCalendar` (react-day-picker) | Tenant-branded | Month grid already shows the month; only the date line applies |
| Customer my-account reschedule (`ReschedulePicker`) | `AvailabilityCarousel` `variant="dashboard"` | Tailwind, not `--ba-*` | Markers + heading gains the date |
| Staff reschedule (`RescheduleBookingPage`), also reused by the scheduling-exceptions reschedule | `AvailabilityCarousel` `variant="dashboard"` | Tailwind | Markers + heading gains the date |
| Staff new booking (`NewBookingAvailabilityStep`) | `AvailabilityCarousel` `variant="dashboard"` | Tailwind | Markers + heading gains the date |
| Availability alert form (`AvailabilityAlertPickers`), schedule range sheet, recurring schedule date field | shadcn `Calendar` popover | Dashboard | None: month caption already visible |

**Decisions (pre-made):**
- **Branding.** The `hotsite` variant marker uses only existing tokens: the full `var(--ba-text)` colour (no opacity, so its contrast is exactly the tenant's own text contrast) and `var(--ba-secondary)` for the divider; small, uppercase. It introduces no new token and no hardcoded colour. The `dashboard` variant uses Tailwind (`text-gray-500`, `border-gray-200`). The two variants are never merged into one branding-aware style (CLAUDE.md §7 Web styling boundary).
- **Hotsite stays unchanged elsewhere.** No other hotsite component, token or `applyBranding()` path is touched; the pill styling (radius, colours) is unchanged and pinned by a test. The existing `hotsite-token-isolation.spec.ts` must stay green.
- **Accessibility.** No `aria-label` on the pills: it would override the visible text ("Hoje", the weekday) and fail WCAG label-in-name. Each pill instead contains an `sr-only` span with its month name, so the accessible name still contains the visible text; the marker itself is `aria-hidden="true"`.
- **Locale.** `pt-BR` and `en` come from `Intl` and from locale keys. No locale literal is hardcoded.
- **Prototypes.** Marker styling is a `.month-marker` class in the two shared stylesheets, `journeys/shared/tokens.css` (hotsite look) and `journeys/shared/reschedule-picker.css` (dashboard look), never inline per file. The guest `02-calendar-slot.html` already updated is refactored from inline styles to that class and its copy changes to "Quinta-feira, 2 de julho". Every prototype file with a day strip gets the markers and the dated heading: guest `02`, `02d`, `02e`, `02f`, `09b`, `10b`; customer `book-a-service/02`; customer `minha-conta/15`, `15b`, `15d`, `15f`, `15h`, `15i`, `15k`; staff `agenda/05`, `05d`; manager `scheduling-exceptions/01e`. `guest/prototypes/book-a-class/01-class-agenda.html` is a different journey and out of scope.
- **One PR** carries the code, the locale keys and the prototype updates.

**Prototype references:** `journeys/guest/prototypes/book-a-service/02-calendar-slot.html` (approved, refactored as above) and the prototypes listed under Prototypes.
**Backend HTTP surface:** none.
**BFF endpoint spec:** none.
**New migration / i18n keys / env vars / feature flags:** new key `booking.availability.slotsHeading` ("Horários disponíveis — {date}" / "Available times — {date}"); modified keys `customer.reschedule.slotsSectionLabel`, the new-booking `slotsLabel` and the staff reschedule `availableSlotsLabel`, all with a `{date}` parameter, in both `packages/i18n/locales/pt-BR/web.json` and `.../en/web.json`. No migration, env var or flag.

**Files to create/modify:**
- `apps/web/features/booking/components/public/AvailabilityCarousel.tsx` and `.spec.tsx` (modify)
- `apps/web/features/booking/components/public/AvailabilityStep.tsx` and `.spec.tsx` (modify)
- `apps/web/features/customer/components/my-account/ReschedulePicker.tsx` and `.spec.tsx` (modify)
- `apps/web/features/booking/components/dashboard/bookings/new-booking/NewBookingAvailabilityStep.tsx` and `.spec.tsx` (modify)
- `apps/web/features/booking/components/dashboard/bookings/reschedule/RescheduleBookingPage.tsx` and `.spec.tsx` (modify)
- `apps/web/shared/lib/formatting/date-utils.ts` and `.spec.ts` (modify: add `monthMarkerLabel`)
- `packages/i18n/locales/pt-BR/web.json`, `packages/i18n/locales/en/web.json` (modify)
- `apps/web/e2e/guest-booking.spec.ts` (modify: steps inside the existing golden-path test)
- `journeys/shared/tokens.css`, `journeys/shared/reschedule-picker.css` (modify: `.month-marker`)
- The prototype files listed under Prototypes, including `journeys/guest/prototypes/book-a-service/02-calendar-slot.html` (modify)
- `journeys/guest/prototypes/book-a-service/dev-notes.md`, `journeys/customer/prototypes/minha-conta/dev-notes.md`, `journeys/staff/prototypes/agenda/dev-notes.md`, `journeys/manager/prototypes/scheduling-exceptions/dev-notes.md` (modify, to document the markers and the dated heading)

**Acceptance criteria — product:**
- [ ] A customer scrolling a long hotsite carousel (for example 90 days) always sees which month a day belongs to: a marker appears before the first day and at every month boundary.
- [ ] A week that spans two months shows both month markers.
- [ ] The year appears on a marker only when it differs from the first day's year.
- [ ] After choosing a day on the hotsite, the date is confirmed above the time slots, e.g. "Horários disponíveis — Quinta-feira, 2 de julho", for both the carousel and the calendar.
- [ ] The customer reschedule, staff reschedule (including the scheduling-exceptions reschedule) and staff new-booking screens show the markers, styled with the dashboard palette, and their slots heading includes the chosen date.
- [ ] A tenant's branding looks unchanged apart from the new markers: no new colours, the same radius, and the same selected and unselected pill styling.
- [ ] The calendar (`datePickerType: 'calendar'`) layout is unchanged apart from the new date line.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `date-utils.spec.ts`: `monthMarkerLabel` for pt-BR and en, with and without year.
  - [ ] `AvailabilityCarousel.spec.tsx`: a marker precedes the first pill and each month-boundary pill; a 14-day strip crossing a month boundary renders exactly 2 markers; a single-month strip renders 1.
  - [ ] `AvailabilityCarousel.spec.tsx`: the marker carries the year across a December-to-January boundary and not within a single year.
  - [ ] `AvailabilityCarousel.spec.tsx`: the `hotsite` marker reads `var(--ba-text)`/`var(--ba-secondary)` (`toHaveStyle`) and the `dashboard` marker uses its Tailwind classes and no `--ba-*`.
  - [ ] `AvailabilityCarousel.spec.tsx`: each pill's accessible name contains its visible text ("Hoje" on the first, the weekday, the day number) plus the month; the marker is `aria-hidden`; `data-testid`/`data-date`/`aria-pressed` are unchanged.
  - [ ] `AvailabilityCarousel.spec.tsx` (negative guarantee): the hotsite pill keeps its `var(--ba-radius)`, `--ba-secondary` and `--ba-primary` styling, unchanged by this story.
  - [ ] `AvailabilityStep.spec.tsx`: the dated heading renders after a day is selected, for both `datePickerType` values, in pt-BR and en (negative guarantee: the calendar branch still renders `AvailabilityCalendar` unchanged).
  - [ ] `ReschedulePicker.spec.tsx`, `NewBookingAvailabilityStep.spec.tsx`, `RescheduleBookingPage.spec.tsx`: the existing slots heading now includes the formatted date.
  - [ ] Regression: `hotsite-token-isolation.spec.ts` stays green.
- Tenant isolation: none — pure presentation, no tenant data read or written.
- E2E:
  - [ ] `guest-booking.spec.ts`: extend the existing golden-path test (no new test): after `openFirstDayWithSlots`, assert a `month-marker` is visible and the dated heading contains the picked day. Not a separate test, because the flow is identical and each assertion is already proven at unit level.
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean (including the `LOCALE_LITERAL_SELECTOR` ESLint rule)

---

### Story 3 — Show the unit of every numeric input through one shared `NumberInput` primitive, and lint raw `<Input type="number">` ✅ Done

**Agent:** frontend-ts
**Complexity:** L
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md` § UI layer model and § Reuse the repo's UI primitives (and § The `--ba-*` exception); `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys and § `no-restricted-syntax` selectors must be checked against the 3 already-documented bypass classes; `docs/TESTING_STRATEGY.md` § apps/web Testing Infrastructure and § Layer 5 (before touching an E2E test); `docs/CODE_STANDARDS.md`; `journeys/README.md` (prototype updates)
**Dependencies:** none (Stories 0–2 are unrelated)
**Pattern:** Atomic design — one new atom, `ui/number-input.tsx` (an `Input` with its unit overlaid inside the field, `unit` a required prop so a missing unit is a type error), consumed by every feature form; plus a lint-enforced ban (a `no-restricted-syntax` selector) so the next form cannot regrow the gap. Plain composition otherwise.
**Discovered:** 2026-11-10, user report on the production service edit page (`/dashboard/services/<id>/edit`): the buffer field ("Tempo de preparo após o serviço (buffer)") and the leg fields give no hint whether the number is minutes, hours or days, while the same concept on the settings page ("Buffer entre agendamentos") shows a "min" suffix.
**Root cause:** the unit-aware field exists only as `SuffixNumberField` inside `features/platform/components/settings/SettingsFormFields.tsx:65`, local to the settings feature and typed to `SettingsFieldName`, so no other form could reuse it. Every other form draws a bare `<Input type="number">` (27 call sites, listed below). Nothing enforces a unit: the existing raw-control rule (`RAW_INPUT_SELECTOR`) only forbids a raw `<input>`, and `ui/input` with `type="number"` passes. The policy cards instead hand-write the unit into the label ("Duração mínima (minutos)"), and `ServicePriceDurationFields.tsx` hardcodes the literal `min` (not translated).

**Description:**
Every numeric input in `apps/web` states its unit next to the value, through one primitive, and the repo fails lint when a new one does not.

1. **New atom `apps/web/shared/components/ui/number-input.tsx` (`NumberInput`) + `number-input.spec.tsx`.** It renders `ui/input` with `type="number"` and overlays the unit inside the input's edge: the look the validated prototypes (`.input-suffix-group` / `.input-suffix`) and the settings page's `SuffixNumberField` already use (a `relative` wrapper, an absolutely positioned, `pointer-events-none` span, extra padding on the input so digits never run under the unit; decided in discovery 2026-11-10, not a separate bordered segment). Props: everything `Input` takes, minus `type`, plus a required `unit: string` (already translated by the caller; the primitive imports no i18n, per the layer table) and `unitPosition?: 'suffix' | 'prefix'` (default `'suffix'`; `'prefix'` overlays on the left, for money: the currency symbol). The unit span gets an `id` and is appended to the input's `aria-describedby` (merged with the caller's own value, never replacing it) so a screen reader announces "Tempo de virada, 10, min". It uses semantic tokens only (`text-muted-foreground`, never `gray-*` or `--ba-*`; the old `SuffixNumberField` used `gray-500` because it is a feature component). It forwards the ref, keeps `aria-invalid` styling on the input, `wrapperClassName` sets the width of the whole field (`w-48`, `max-w-56`) and `className` styles the `<input>`, the way `NativeSelect` splits them. It also hides the browser spin buttons, which would sit under the unit (a small visible change on the settings fields, accepted).
2. **Convert every call site below to `NumberInput`.** The label text stays as it is except where the unit moves out of it (policy cards). Every `data-testid`, `id`, `name` and `aria-*` stays identical so no E2E selector changes. Unit text comes from locale keys in `pt-BR` and `en` (never a literal in JSX).
3. **Migrate `SuffixNumberField` onto `NumberInput`** (it keeps its label, hint, feedback wiring and `SettingsFieldName` typing; only the input-plus-span markup it draws by hand goes) so there is one implementation, not two. It has **11 call sites**, all migrated: 6 in `SettingsBookingSection.tsx`, 2 in `SettingsLoyaltySection.tsx`, 3 in `SettingsLeadFormSection.tsx`; their existing suffix keys (`hoursSuffix`, `minutesSuffix`, `daysSuffix`, `monthsSuffix`, `perDaySuffix`) are kept, so the settings page does not change visually.
4. **New lint rule `NUMBER_INPUT_SELECTOR`** in `apps/web/eslint.config.js`, added to `NON_FETCH_SELECTORS`: a JSX `<Input>` carrying a `type` attribute that resolves to `"number"` is an error: *"A bare <Input type=\"number\"> shows no unit. Use ui/number-input with a unit (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo's UI primitives; TD51-S3)."* It must cover the three documented bypass classes (`docs/ENGINEERING_RULES_SHARED.md` § `no-restricted-syntax` selectors): the value as `type={'number'}` (expression container), as a no-substitution template literal `` type={`number`} ``, and as a conditional/logical expression containing the literal (`type={cond ? 'number' : 'text'}`). A `type` held in a variable or spread (`{...props}`) is the one shape a syntax selector cannot follow; the story documents that limit in the config comment, as `RAW_CONTROL_TAG` does. `shared/components/ui/**` is exempt (it contains `NumberInput` itself and `Input`'s own spec). **ESLint flat-config trap:** a later block REPLACES an earlier block's `no-restricted-syntax` list for the files it matches. `rawFormControlExemptPaths` (which includes `shared/components/ui/**` together with the branded public trees) filters out `RAW_FORM_CONTROL_SELECTORS` only, so the new selector would also be dropped for the branded trees by accident, or kept for `ui/**` by accident. Give `ui/**` its own exemption by exact filter, and add a spec proving the selector fires in a feature file, in a branded public-tree file that uses `ui/Input`, and not in `ui/**`. A genuinely unit-less numeric input (none is expected: a count carries "unid." or "pessoas") is listed by exact path in a new `numberInputExemptPaths` array with a reason, never a wildcard, mirroring `rawButtonExemptPaths`.
5. **Docs and prototypes in the same PR.** `docs/ENGINEERING_RULES_FRONTEND.md` § Reuse the repo's UI primitives and its "What the repo enforces" table gain a row for the new selector and the `NumberInput` rule. The prototypes below show the unit on the same fields, so the validated UX matches what ships.

**Audit — every numeric input in `apps/web` (grep `type="number"` over non-spec `.tsx`, 2026-11-10), with the unit it gets:**

| # | File:line | Field (pt-BR label today) | Unit pt-BR / en | Position | Notes |
|---|---|---|---|---|---|
| 1 | `features/booking/components/dashboard/services/ServiceBufferAfterMinutesField.tsx:49` | Tempo de preparo após o serviço (buffer) | `min` / `min` | suffix | The reported bug. The `w-48` and disabled styling move to `NumberInput`'s frame. The blank-means-inherit placeholder stays. |
| 2 | `.../services/ServiceLegsPanel.tsx:136` | Duração (etapa) | `min` / `min` | suffix | |
| 3 | `.../services/ServiceLegsPanel.tsx:154` | Transição até a próxima etapa | `min` / `min` | suffix | |
| 4 | `.../services/ServiceResourceTypeFields.tsx:158` | Quantidade necessária | `unid.` / `units` | suffix | Used in the main requirements panel and in every leg (`scope`). |
| 5 | `.../services/ServiceFormFields.tsx:110` | Pontos de fidelidade | `pts` / `pts` | suffix | |
| 6 | `.../services/ServicePriceDurationFields.tsx:55` | Preço | currency symbol | prefix | Replaces the hand-built `relative` + absolute span; the symbol already comes from the tenant. |
| 7 | `.../services/ServicePriceDurationFields.tsx:88` | Duração | `min` / `min` | suffix | Replaces the hardcoded, untranslated `min` span. |
| 8 | `.../services/PolicyNumberField.tsx:46` | feeds 8 fields: `PolicyDurationPricingCard` (duração mínima, máxima, intervalo de escolha, incremento de cobrança → `min`; valor por incremento, cobrança mínima → currency prefix) and `PolicyConfirmationAndWindowCards` (aviso mínimo → `horas`; antecedência máxima → `dias`) | per field | per field | `PolicyNumberField` takes `unit` (+ `unitPosition`) as a required prop and passes it through. The labels drop their parentheses: "Duração mínima (minutos)" → "Duração mínima", "Valor por incremento (R$)" → "Valor por incremento", "Cobrança mínima (R$, opcional)" → "Cobrança mínima (opcional)". |
| 9 | `.../services/PolicyConfirmationAndWindowCards.tsx:41` | Segurar horário por (min) | `min` / `min` | suffix | Label → "Segurar horário por". |
| 10 | `.../services/PolicyConfirmationAndWindowCards.tsx:68` | Cancelar até (horas antes) | `h antes` / `h before` | suffix | Label → "Cancelar até". |
| 11 | `.../services/PolicyConfirmationAndWindowCards.tsx:85` | Reagendar até (horas antes) | `h antes` / `h before` | suffix | Label → "Reagendar até". |
| 12 | `.../services/PolicyWhoHowCard.tsx:67` | Duração máxima de uma reserva recorrente (dias) | `dias` / `days` | suffix | Label drops "(dias)". |
| 13 | `.../resources/ResourceCreateForm.tsx:113` | Tempo de virada (turnover) | `min` / `min` | suffix | |
| 14 | `.../resources/ResourceCreateForm.tsx:127` | Capacidade máxima | `vagas` / `spots` | suffix | Decided in discovery (a resource can be a room, a staff member or equipment). |
| 15 | `.../resources/ResourceEditFormFields.tsx:124` | Tempo de virada (turnover) | `min` / `min` | suffix | Same copy as 13. |
| 16 | `.../resources/ResourceEditFormFields.tsx:138` | Capacidade máxima | `vagas` / `spots` | suffix | Same copy as 14. |
| 17 | `.../bookings/mark-complete/MarkCompleteLineFields.tsx:53` | Cobrado | currency symbol | prefix | The quoted price line above it already prints the money format. |
| 18 | `.../bookings/mark-complete/MarkCompleteLoyaltyPanel.tsx:60` | Pontos a usar | `pts` / `pts` | suffix | |
| 19 | `.../bookings/new-booking/NewBookingIntakeStep.tsx:192` | Quantidade de participantes | `pessoas` / `people` | suffix | Dashboard counterpart of row 22. |
| 20 | `features/platform/components/settings/SettingsLoyaltySection.tsx:64` | Pontos por unidade monetária | `pts / {currency}` / `pts / {currency}` | suffix | Decided in discovery; the key takes a `{currency}` parameter, the tenant's currency symbol (e.g. `pts / R$`). |
| 21 | `features/platform/components/settings/SettingsLoyaltySection.tsx:106` | Saldo mínimo para notificar | `pts` / `pts` | suffix | |
| 22 | `features/platform/components/hotsite/modules/BookingCtaConfigPanel.tsx:174` | Número de dias exibidos | `dias` / `days` | suffix | |
| 23 | `.../hotsite/modules/GalleryConfigPanel.tsx:89` | Máximo de imagens visíveis | `imagens` / `images` | suffix | |
| 24 | `.../hotsite/modules/presentation-field-parts.tsx:44` (`OpacityField`) | Opacidade (%), Opacidade inicial (%), Opacidade final (%) | `%` | suffix | The three labels (`overlayOpacityLabel`, `overlayFromOpacityLabel`, `overlayToOpacityLabel`) drop "(%)". |
| 25 | `features/platform/components/settings/SettingsFormFields.tsx:84` (`SuffixNumberField`) | all 11 settings fields (6 booking, 2 loyalty, 3 lead form) | existing `horas`/`min`/`dias`/`meses`/`por dia` keys | suffix | Migrated onto `NumberInput`, no visible change. |
| 26 | `features/booking/components/public/IntakeAnswersStep.tsx:98` | Quantidade de participantes (guest booking) | `pessoas` / `people` | suffix | **Out of lint scope**: a raw `<input>` in `features/booking/components/public/**`, a tenant-branded tree (`--ba-*`) listed in `rawFormControlExemptPaths`, where a `ui/` primitive cannot be used. It gets a local branded unit span built from `--ba-text` (decision pre-made: no second primitive, no `--ba-*` in `ui/`). |

Not numeric-quantity inputs, so out of scope: phone fields (`type="tel"`, `inputMode="numeric"`), the postal code (`type="text"`), `AddressTextField`, and every `datetime`/time picker.

**Prototype references:** the validated prototypes already draw the unit inside the input (`.input-suffix-group` + `.input-suffix`, defined inline in each file's `<style>`) for service duration, buffer, leg duration and transition, `Aviso mínimo` (`h`), `Antecedência máxima` (`dias`), the resource turnover and the settings fields (`journeys/staff/prototypes/servicos/02*`, `03*`; `journeys/manager/prototypes/resources/02*`; `journeys/manager/prototypes/configuracoes/01*`); the code regressed from them, and they are the visual reference. Prototype work is limited to screens that lack a unit, reusing the same inline `.input-suffix` pattern (no shared stylesheet class): `journeys/staff/prototypes/servicos/03-service-edit.html` and its variants for `Cancelar até` / `Reagendar até` (drawn as text inputs reading "24 horas antes", changed to number fields with the `h antes` suffix), `Pontos de fidelidade`, `Quantidade necessária`, and the policy fields without a suffix; `journeys/manager/prototypes/resources/02*` for `Capacidade máxima`; `journeys/manager/prototypes/configuracoes/01*` for the loyalty fields; `journeys/manager/prototypes/hotsite/01f-module-config.html` (carousel days, gallery max, opacity); `journeys/guest/prototypes/book-a-service/13*.html` and `journeys/customer/prototypes/book-a-service/03b/03c/03e` (participants). `journeys/manager/prototypes/turmas/06-matriculas.html` is a different, unbuilt journey and out of scope.
**Backend HTTP surface:** none.
**BFF endpoint spec:** none.
**New migration / i18n keys / env vars / feature flags:** no migration, env var or flag. The new units live in one namespace, `common.units` (`minutes`, `hours`, `days`, `hoursBefore`, `points`, `pointsPerCurrency` with `{currency}`, `quantity`, `people`, `spots`, `images`, `percent`), in both `packages/i18n/locales/pt-BR/web.json` and `.../en/web.json`, so a unit is spelled once. Implementation deviation from the discovery text (which said to reuse the settings suffix keys): a `useTranslations('dashboard.settingsPage')` call from the service, resource and hotsite forms would cross feature namespaces, so the settings page keeps its own five suffix keys untouched (`hoursSuffix`, `minutesSuffix`, `daysSuffix`, `monthsSuffix`, `perDaySuffix`) and the three words they share with `common.units` (min, horas/h, dias) are the one accepted duplication; consolidating them is a follow-up. Wording decisions: `min`, `h` and `dias` on the narrow policy cards, the existing `horas` stays on settings. The changed labels in rows 8–12 and 24 (parenthesised unit removed) are updated in both locales. The hardcoded `min` literal in `ServicePriceDurationFields.tsx` is removed. Discovery greps every reader of a key before it is moved or removed.

**Files to create/modify:**
- `apps/web/shared/components/ui/number-input.tsx` and `number-input.spec.tsx` (create)
- `apps/web/eslint.config.js` (modify: `NUMBER_INPUT_SELECTOR`, `numberInputExemptPaths`, the `ui/**` exemption block)
- `apps/web/shared/lib/eslint/number-input.eslint.spec.ts` (create, next to `raw-form-control.eslint.spec.ts` and `restricted-syntax.eslint.spec.ts`)
- `apps/web/features/booking/components/dashboard/services/`: `ServiceBufferAfterMinutesField.tsx`, `ServiceLegsPanel.tsx`, `ServiceResourceTypeFields.tsx`, `ServiceFormFields.tsx`, `ServicePriceDurationFields.tsx`, `PolicyNumberField.tsx`, `PolicyDurationPricingCard.tsx`, `PolicyConfirmationAndWindowCards.tsx`, `PolicyWhoHowCard.tsx` and each one's existing `.spec.tsx` (modify)
- `apps/web/features/booking/components/dashboard/resources/ResourceCreateForm.tsx`, `ResourceEditFormFields.tsx` and their `.spec.tsx` (modify)
- `apps/web/features/booking/components/dashboard/bookings/mark-complete/MarkCompleteLineFields.tsx`, `MarkCompleteLoyaltyPanel.tsx` and their `.spec.tsx` (modify)
- `apps/web/features/booking/components/dashboard/bookings/new-booking/NewBookingIntakeStep.tsx` and `.spec.tsx` (modify)
- `apps/web/features/booking/components/public/IntakeAnswersStep.tsx` and `.spec.tsx` (modify: branded unit span only)
- `apps/web/features/platform/components/settings/SettingsFormFields.tsx`, `SettingsLoyaltySection.tsx` and their `.spec.tsx` (modify)
- `apps/web/features/platform/components/hotsite/modules/BookingCtaConfigPanel.tsx`, `GalleryConfigPanel.tsx`, `presentation-field-parts.tsx` and their `.spec.tsx` (modify)
- `packages/i18n/locales/pt-BR/web.json`, `packages/i18n/locales/en/web.json` (modify)
- `docs/ENGINEERING_RULES_FRONTEND.md` (modify: § Reuse the repo's UI primitives, "What the repo enforces" table)
- The prototype files listed under Prototype references that lack a unit (inline `.input-suffix` pattern), and the `dev-notes.md` of `staff/prototypes/servicos`, `manager/prototypes/resources`, `manager/prototypes/configuracoes`, `manager/prototypes/hotsite` (modify)
- E2E specs only if a selector changes (none should): `apps/web/e2e/services-manage.spec.ts`, `services-resource-config.spec.ts`, `services-create.spec.ts`, `booking-intake.spec.ts`, `hotsite-editor.spec.ts` reference these `data-testid`s and are run, not edited

**Acceptance criteria — product:**
- [ ] On the service edit page, the buffer, each leg's duration and transition, and the required quantity show their unit (`min`, `min`, `min`, `unid.`) next to the number, in pt-BR and en.
- [ ] Every numeric field listed in the audit table shows its unit; money fields show the tenant's currency symbol before the number; no label keeps its unit in parentheses.
- [ ] The settings page looks and behaves the same as today (same units, same hints and errors), now drawn by the shared primitive.
- [ ] A field in an error state still shows its invalid border and message, and the overlaid unit does not hide the digits or the invalid border.
- [ ] A screen reader announces the unit with the field (label, then value, then unit).
- [ ] The guest booking participants field shows "pessoas" in the tenant's branded colours, and the tenant hotsite is otherwise visually unchanged.
- [ ] Adding a new `<Input type="number">` anywhere in `apps/web` fails `pnpm lint` with a message pointing to `NumberInput`.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `number-input.spec.tsx`: renders the unit overlaid on the right (suffix) and on the left (prefix) with the matching input padding, `wrapperClassName` applies to the wrapper and `className` to the input; forwards `value`, `onChange`, `min`, `max`, `step`, `id`, `data-testid`, `disabled` and the ref; `type` is `number` and cannot be overridden; the unit span's id is merged into `aria-describedby` alongside a caller-supplied value (negative guarantee: a caller `aria-describedby` is never replaced); `aria-invalid` still styles the input; `axe` clean (same `axe-helper` as `input.spec.tsx`).
  - [ ] `number-input.spec.tsx` (type-level): `unit` is required (`// @ts-expect-error` on a render without it).
  - [ ] One spec per converted component asserts the unit text is rendered for its field, in both locales where the spec already switches locale (`ServiceBufferAfterMinutesField`, `ServiceLegsPanel` ×2, `ServiceResourceTypeFields` incl. a leg `scope`, `ServiceFormFields`, `ServicePriceDurationFields` ×2, `PolicyNumberField` for a suffix and a prefix, the 4 policy-card inputs, `PolicyWhoHowCard`, `ResourceCreateForm` ×2, `ResourceEditFormFields` ×2, `MarkCompleteLineFields`, `MarkCompleteLoyaltyPanel`, `NewBookingIntakeStep`, `IntakeAnswersStep`, `SettingsLoyaltySection` ×2, `BookingCtaConfigPanel`, `GalleryConfigPanel`, `OpacityField` ×3, `SuffixNumberField`, covering its 11 call sites through the three settings section specs).
  - [ ] Negative guarantee, own test: every existing `data-testid`/`id`/`name` on a converted input is unchanged (assert by the same `getByTestId` the E2E specs use).
  - [ ] Negative guarantee, own test: a label that lost its parenthesised unit no longer contains it (policy cards and opacity), and the unit is read from the shared locale key, not a literal.
  - [ ] `number-input.eslint.spec.ts`: the selector flags `<Input type="number">`, `type={'number'}`, ``type={`number`}`` and `type={cond ? 'number' : 'text'}`; it does not flag `<Input type="text">`, `<Input>` with no type, `<NumberInput>`, or a number input inside `shared/components/ui/**`; it still flags `<Input type="number">` in a branded public-tree file (the replace-not-merge trap); a path in `numberInputExemptPaths` is exempt. Existing `raw-form-control.eslint.spec.ts` and `restricted-syntax.eslint.spec.ts` stay green.
  - [ ] Locale parity: the i18n exhaustiveness/parity tests stay green with the new keys in both locales; no `LOCALE_LITERAL_SELECTOR` violation.
  - [ ] Regression: `hotsite-token-isolation.spec.ts` stays green (the primitive uses only semantic tokens).
- Integration: none (frontend-ts, no integration tier).
- Tenant isolation: none — pure presentation, no tenant data read or written.
- E2E:
  - [ ] none new: the touched fields keep their `data-testid`s and the existing specs (`services-manage`, `services-resource-config`, `services-create`, `booking-intake`, `hotsite-editor`) run unchanged as the regression net; if any of them fails on a changed selector, that is a Story 3 bug. Reason for no new test: every assertion is a unit-level render check, and the flows are identical.
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean (including `NUMBER_INPUT_SELECTOR` over the whole of `apps/web`, proving no bare numeric `Input` remains)

---

### Story 4 — Number the booking-detail itinerary by leg, not by resource row 🔴 ✅ Done

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md` § UI layer model; `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys; `docs/TESTING_STRATEGY.md` § apps/web Testing Infrastructure and § Layer 5 (before touching an E2E test); `docs/CODE_STANDARDS.md`; `journeys/README.md` (prototype updates and the §15 hard stop); `journeys/staff/prototypes/agenda/dev-notes.md`; `journeys/customer/prototypes/minha-conta/dev-notes.md`
**Dependencies:** none (Stories 0–3 are unrelated)
**Pattern:** plain composition — no named pattern applies. A pure grouping helper (`groupItineraryByLeg`) in the booking slice, consumed by the existing card; no API or contract change.
**Discovered:** 2026-11-10, user report on the production booking detail page (`/dashboard/bookings/01a1c78c-43ec-7edf-90f0-ddd62ac6526f`): a service with 3 legs shows a "Trajeto" list numbered 1 to 6.
**Root cause:** `BookingItineraryCard.tsx:28-34` renders one `<li>` per `BookingItineraryLeg` and numbers it `index + 1`. Despite its name, a `BookingItineraryLeg` is one *resource reservation*, not one leg: `buildItinerary()` in `booking-detail-resources.helpers.ts:135-172` emits one entry per (line, legIndex, resource assignment), sorted by `legIndex` then `resourceType`. A leg that needs a room and a professional therefore appears twice, with the same `legIndex`, `legName` and time range. In the reported booking: Massagem (Sala Fogo, Leonardo Moreira) = rows 1–2, Pedras Aromatizantes (Sala Fogo) = row 3, Ventosas (Ventosas, Sala Agua, Leonardo Moreira) = rows 4–6.

**Description:**
The itinerary card shows one numbered step per leg, in order, with the leg's name and time range once and the leg's resources listed beneath it. The badge counts legs (1, 2, 3), not resource rows.

1. **Grouping.** A pure helper `groupItineraryByLeg(itinerary)` (in `apps/web/features/booking/model/`, next to its spec, like the sibling `basket-lines.ts`) folds the flat `BookingItineraryLeg[]` into `{ key, lineId, serviceName, legIndex, legName, startsAt, endsAt, resourceNames[] }[]`. The group key is `lineId + legIndex`, so two lines of the same service, or two lines whose legs share an index, never merge. Order is the input order of first appearance (the backend emits the lines in stored order and sorts each line's legs by `legIndex`, then resource type, so rows of one leg are adjacent); the helper never re-sorts. The group's time range is the earliest `startsAt` and the latest `endsAt` among its rows, and null when no row has times (cancelled, rejected or purged booking); a group whose rows disagree on whether times exist uses the ones that exist. Resource names keep the input order and are de-duplicated.
2. **Card.** `BookingItineraryCard` maps the groups: the badge shows the group's position (`index + 1`), the first line is the leg name (falling back to the new key `itineraryLegFallback`, "Etapa {number}" / "Step {number}", when `legName` is null), with the time range after ` · ` as today; the second line lists the resource names joined with ", ". When the itinerary spans more than one distinct `serviceName`, the leg line is prefixed with the line's service name; a single-service booking shows no prefix. `data-testid="booking-itinerary-card"` is unchanged; each `<li>` gets `data-testid="booking-itinerary-leg"`.
3. **Copy.** `itineraryNote` ("The legs, in order, with each leg's resource…") is reworded to match: each step lists the resources it uses. Both locales in the same change.
4. **Decisions locked in discovery (2026-11-10).** (a) Layout: the first line of a step is the leg name and its time range, the second line lists the leg's resources (not the prototype's former "resource bold, leg name grey" look, which only ever drew one resource per leg); the prototypes are redrawn to match (item 5). (b) Steps are numbered 1…N continuously across all lines of a basket, never restarted per service. (c) Resource names inside a leg keep the backend's order (resource type, alphabetical). (d) The fallback "Etapa {number}" / "Step {number}" is for a leg whose name cannot be resolved: the domain requires a leg name (`service-leg.ts:37`), so `legName` is null only when the service's current legs no longer include that `legIndex` (the service was edited after the booking), never because a name was left empty.
5. **Prototypes and journey docs.** The validated Trajeto card is redrawn leg by leg in the 14 screens that carry the `?forma=trajeto` variant, with one leg that has two resources (the "Passeio" step lists "Paula Nogueira (guia), Van 2"), and the cancelled and rejected screens keep their legs without times. Order, per `CLAUDE.md` §15: a clean `/docs-audit` baseline of `journeys/` first, then the journey `.md` rows, then the prototype files. The journey docs and both `dev-notes.md` files describe the card as "per leg: name, time, every resource of the leg". No `❓ GAP` status changes (the card is already ✅ built, M23-S47). A grep of `docs/`, `journeys/**` and the two `_IMPLEMENTATION_DETAILS_IA.md` files for "per leg: resource" or "each leg's resource" wording finds any other stale statement, and each is fixed in the same change.
6. **No contract change.** `BookingItineraryLeg` in `@ikaro/types`, the BFF mapper (`bookings-detail.mapper.ts`) and the backend helper are untouched. The type name stays; the doc comment on the interface in `booking.dto.ts` is corrected to say each entry is one resource of a leg, so the next reader is not misled the same way.

**Backend HTTP surface:** none — reuses the existing booking detail endpoints.
**BFF endpoint spec:** none — the detail payload is unchanged.
**Prototype references:** `journeys/staff/prototypes/agenda/` — `01-booking-detail`, `01e-acao-falhou`, `03-booking-detail-approved`, `03f-booking-detail-no-show`, `03h-booking-detail-completed`, `03i-booking-detail-cancelled`, `03j-booking-detail-precisa-decisao`, `03k-booking-detail-precisa-decisao-staff` (.html); `journeys/customer/prototypes/minha-conta/` — `02-agendamento-detail`, `02b-agendamento-info-requested`, `02c-agendamento-historico`, `02f-agendamento-nao-compareceu`, `02g-agendamento-cancelado`, `02h-agendamento-recusado` (.html); parent journeys `journeys/staff/agenda.md` (Trajeto row, ~line 168) and `journeys/customer/minha-conta.md` (Trajeto line, ~line 359).
**New migration / i18n keys / env vars / feature flags:** i18n keys `booking.detailCards.itineraryLegFallback` (new) and `itineraryNote` (reworded), in `packages/i18n/locales/pt-BR/web.json` and `.../en/web.json`; no migration, env var or flag.

**Files to create/modify:**
- `apps/web/features/booking/components/booking-detail/BookingItineraryCard.tsx` (modify; exists)
- `apps/web/features/booking/components/booking-detail/BookingItineraryCard.spec.tsx` (modify; exists)
- `apps/web/features/booking/model/group-itinerary-by-leg.ts` + `group-itinerary-by-leg.spec.ts` (new; sibling pattern: `basket-lines.ts` / `basket-lines.spec.ts` in the same folder)
- `packages/i18n/locales/pt-BR/web.json`, `packages/i18n/locales/en/web.json` (modify; `booking.detailCards.*` near line 404)
- `packages/types/src/booking.dto.ts` (modify the comment on `BookingItineraryLeg` only, line ~245)
- `apps/web/e2e/booking-detail.spec.ts` (modify; the existing itinerary scenario at line ~146)
- The 14 prototype `.html` files listed under Prototype references (modify; the `?forma=trajeto` block and its `fx-note`)
- `journeys/staff/prototypes/agenda/dev-notes.md`, `journeys/customer/prototypes/minha-conta/dev-notes.md`, `journeys/staff/agenda.md`, `journeys/customer/minha-conta.md` (modify; the Trajeto wording)
- `journeys/README.md` (modify only if its index mentions the card; checked at implementation)

**Acceptance criteria — product:**
- [ ] A service with 3 legs shows steps numbered 1, 2, 3, never more than the number of legs, however many resources each leg needs.
- [ ] Each step shows the leg name and its time range once, with every resource of that leg listed beneath it.
- [ ] A cancelled, rejected or purged booking shows the same steps and resources without times.
- [ ] A leg without a name shows "Etapa N" (pt-BR) / "Step N" (en) instead of a blank line.
- [ ] A basket with more than one service keeps its steps distinguishable by service name; a single-service booking shows no service prefix.
- [ ] The visual style of the card (badge, divider, note) is unchanged.
- [ ] The 14 Trajeto prototype screens show one numbered step per leg, with a leg that has two resources, and the staff and customer journey docs and `dev-notes.md` describe it that way; no other doc under `docs/` or `journeys/` still says the card lists one resource per leg.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `group-itinerary-by-leg.spec.ts`: the reported case (6 rows: 2 + 1 + 3) groups into 3 legs with resources `[Sala Fogo, Leonardo Moreira]`, `[Sala Fogo]`, `[Ventosas, Sala Agua, Leonardo Moreira]`; empty input gives an empty list; a leg with one row stays one group.
  - [ ] `group-itinerary-by-leg.spec.ts`: two lines with the same `legIndex` do not merge (key is `lineId + legIndex`); a duplicate resource name within a leg is listed once; the time range is min start / max end; all-null times give null.
  - [ ] `group-itinerary-by-leg.spec.ts` (negative guarantee, own test): the helper never re-sorts — rows given in a non-ascending `legIndex` order come out in the same order.
  - [ ] `BookingItineraryCard.spec.tsx`: the existing "lists the legs in the given order" test is rewritten for grouping — 6 rows of 3 legs render exactly 3 `listitem`s numbered 1–3 (negative guarantee: no badge reads 4, 5 or 6); resources appear under their leg; the time range renders once per leg; a null `legName` renders the fallback in both locales; the service-name prefix appears only when the itinerary has more than one `serviceName`; the existing no-times and empty-list tests stay green.
  - [ ] Locale parity: the i18n exhaustiveness/parity tests stay green with the new key in both locales.
- Integration: none (frontend-ts, no integration tier).
- Tenant isolation: none — pure presentation of data already scoped by the existing endpoint; no tenant data read or written.
- E2E:
  - [ ] `booking-detail.spec.ts`: extend the existing legged-booking scenario (line ~137). The seeded journey is Sauna (1 room), Massagem (a professional and a room) and Relaxamento (equipment): 3 legs, 4 resource rows. Assert exactly 3 `booking-itinerary-leg` items numbered 1–3, the Massagem item naming both the professional and the room, and, after the cancel, the same 3 items with no time range. It is a step of that scenario, not a new test: same route, same booking.
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

---

### Story 5 — Give branded tenant surfaces one readable pattern: `BrandedPanel` + branded field style, and lint the raw secondary background 🔴

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md` § The `--ba-*` exception and § Reuse the repo's UI primitives; `docs/ENGINEERING_RULES_SHARED.md` § `no-restricted-syntax` selectors must be checked against the 3 already-documented bypass classes and § Authoring new i18n UI copy keys; `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § Branding & Design Token System (and its paragraph on `--ba-secondary-text`/`--ba-secondary-accent`); `docs/TESTING_STRATEGY.md` § apps/web Testing Infrastructure; `docs/CODE_STANDARDS.md`
**Dependencies:** none (Stories 0–4 are unrelated)
**Pattern:** Design-system atom with a lint-enforced entry point, mirroring TD57's `BrandedFeedbackMessage` (`shared/components/hotsite/branded-feedback-message.tsx` + `branded-feedback-palette.ts` + `branded-feedback-contrast.spec.ts` + the `FEEDBACK_ROLE_SELECTOR` ban). Plain composition otherwise.
**Discovered:** 2026-11-10, user report on the public "submit info" page (`/bookings/<id>/submit-info?token=…`) of the `smassagem` tenant: the "Mensagem da equipe" box is unreadable, its text the same colour as its background.
**Root cause:** `SubmitInfoForm.tsx:146-164` paints `backgroundColor: 'var(--ba-secondary)'` and sets no text colour, so the message `<p>` inherits the page's `--ba-text`; the label above it uses `--ba-primary`. When a tenant's `textColor` is close to its `secondaryColor`, the text vanishes. `applyBranding()` already derives `--ba-secondary-text` (text readable on the secondary colour, ≥4.5:1) and `--ba-secondary-accent` (primary if it reads on secondary, else the text) at `apply-branding.ts:246-248`, but only the hotsite shell (`HotsiteAuthBar*`, `HotsiteNavigation`, `Footer`, `ServiceDetailPage`) consumes them. About 20 sites in the public booking, customer and lead-form trees paint the secondary colour as a surface and rely on inheritance or on `--ba-primary`. Nothing enforces the tokens, so each new panel or field is a fresh chance for the bug.

**Description:**
A branded tenant gets one pattern for every surface painted with its secondary colour, so the text on it is always readable and the look stays natural and comfortable: the tenant's own palette, with text and accent colours chosen to read on it, never a new fixed colour.

1. **`BrandedPanel` (new, `apps/web/shared/components/hotsite/branded-panel.tsx`).** A bordered, rounded panel on `--ba-secondary` with `color: var(--ba-secondary-text, var(--ba-text))` and `borderRadius: var(--ba-radius)`. An optional `label` prop renders the small uppercase heading in `var(--ba-secondary-accent, var(--ba-primary))`, so a caller never chooses a colour for text inside the panel. It forwards `className`, `data-testid` and `children`. It replaces the hand-built box in `SubmitInfoForm` (the reported bug) and the other panel sites (list below). Two `shells/hotsite` files have the same bug and are converted too: `BrandCard.tsx` (name in `--ba-primary`, tagline in `--ba-text` at 0.6 opacity, on `--ba-secondary`) and `TestimonialCard.tsx` (quote inherits, author in `--ba-text`, on `cardBg ?? --ba-secondary`; its text takes `--ba-section-text` when the section sets one, else `--ba-secondary-text`).
2. **Branded field style (new, `apps/web/shared/components/hotsite/branded-field-style.ts`).** One function `brandedFieldStyle({ invalid })` returning the shared input look: secondary background, `--ba-secondary-text` colour, secondary border (or the branded error border from `BRANDED_FEEDBACK_PALETTE` when invalid), `--ba-radius`. Today seven files each keep their own copy of the same style object and none sets a text colour, so what a visitor types inherits `--ba-text` and has the same bug (`AddressTextField`, `IntakeQuestionField`, `IntakeAnswersStep`, `ContactInfoFields` ×3, `InformationCompletionPhoneField` ×2, `IntakeAttendeesList`, `LeadFormFields`). They all call the helper instead. Placeholder colour (decided 2026-11-11, applied to every tenant): the module also exports `BRANDED_FIELD_PLACEHOLDER_CLASS = 'placeholder:[color:var(--ba-secondary-muted,var(--ba-secondary-text))]'`, which each converted field adds to its `className` (an inline style cannot reach `::placeholder`; no global CSS file changes).
3. **New derived token `--ba-secondary-muted`.** Computed in `applyBranding()` with the existing `mixHex`: `--ba-secondary-text` blended toward the secondary colour, falling back to `--ba-secondary-text` itself when the blend is below 4.5:1. Derived only: no editor field, no stored value, no schema or API change; the editor preview (`HotsitePreviewCanvas`) gets it through `applyBranding()`. No hardcoded hex and no fixed grey. The same token colours every secondary line (a hint, a count, a caption) on the secondary surface, through the `BrandedMutedText` component (`branded-muted-text.tsx`): an `opacity-*` class or an inline `opacity` on text over the secondary colour is never used, because it lowers a colour that was derived to exactly the 4.5:1 minimum (a PR review round found six such lines). Any further case the existing tokens cannot express uses the same approach with a contrast test.
4. **Lint ban.** A `no-restricted-syntax` selector (`SECONDARY_SURFACE_SELECTOR`) flags the literal `backgroundColor: 'var(--ba-secondary)'` (property `backgroundColor`, string value `var(--ba-secondary)`), with a message pointing to `BrandedPanel` / `brandedFieldStyle`. Exempt, by exact path only (never a folder): the two new files, `features/platform/hotsite/module-styles.ts`, and the shell files verified in discovery to pair the colour with `--ba-secondary-text`: `HotsiteAuthBar.tsx`, `HotsiteAuthBarDropdown.tsx`, `HotsiteAuthBarSignedOut.tsx`, `HotsiteNavigation.tsx`, `Footer.tsx`, `ServiceDetailPage.tsx`. `ChatbotPanel.tsx` (its body only holds bubbles that paint their own surface) is exempt as well. `BrandCard` and `TestimonialCard` are not exempt; they are converted. Known limit: `legacySectionBackground()` and `sectionCardBackground()` in `module-styles.ts` return the colour as a bare string, which the AST rule cannot see; sections already pair them with `--ba-section-text`. It must be checked against the 3 documented bypass classes, and the flat-config replace-not-merge trap (a later block listing `no-restricted-syntax` for the same files discards this selector, as `ui/**` and the branded trees share `rawFormControlExemptPaths`). Indirect forms that the AST cannot see (a Tailwind `bg-[var(--ba-secondary)]` class, a shared constant) are named in the rule's comment as the known limit, not silently ignored; `AvailabilityCarousel.tsx:224` (`border-[var(--ba-secondary)]`, a border) is not a surface and stays.
5. **Contrast test across tenants.** `branded-panel-contrast.spec.ts` (same shape as `branded-feedback-contrast.spec.ts` and `template-palette-contrast.spec.ts`) asserts that for every catalogue template, plus a fixture where `textColor` equals `secondaryColor` (the `smassagem` case), the panel text and accent and the field text meet AA (≥4.5:1) over `secondaryColor`.
6. **Out of scope, recorded:** `borderColor: var(--ba-secondary)` (a border is decorative; it can be faint when secondary is close to the page background but never hides content), the `--ba-primary`-on-`--ba-primary` button text (already derived by `deriveButtonTokens`), and the dashboard/account trees, which never use `--ba-*`.

**Backend HTTP surface:** none.
**BFF endpoint spec:** none.
**Prototype references:** `journeys/guest/prototypes/submit-info/` (`01-submit-form.html`, the reported "Mensagem da equipe" box), plus the booking and lead-form prototypes under `journeys/guest/prototypes/{book-a-service,lead-form}/` and `journeys/customer/prototypes/{book-a-service,lead-form}/`. The panel and field look must stay as in the prototypes with the tenant's palette applied; no prototype changes (the story changes the colour source, not the look), and implementation re-checks that the submit-info info box still reads.
**New migration / i18n keys / env vars / feature flags:** none (no new visible copy; the existing `teamMessageLabel` key is reused).

**Files to create/modify:**
- `apps/web/shared/components/hotsite/branded-panel.tsx` + `branded-panel.spec.tsx` (new; sibling pattern: `branded-feedback-message.tsx` / `.spec.tsx`)
- `apps/web/shared/components/hotsite/branded-field-style.ts` + `branded-field-style.spec.ts` (new)
- `apps/web/shared/components/hotsite/branded-panel-contrast.spec.ts` (new; sibling: `branded-feedback-contrast.spec.ts`)
- `apps/web/shared/components/hotsite/branded-muted-text.tsx` + `branded-muted-text.spec.tsx` (new, added during implementation: the atom for a secondary line on the secondary surface, so no call site writes the muted colour)
- `apps/web/shared/components/hotsite/branded-surface-style.ts` (new, added during implementation: `brandedSurfaceStyle`, `brandedSkeletonStyle` and `BRANDED_MUTED_TEXT`, the colour `BrandedMutedText` paints; the one place outside the reviewed shell files that writes the secondary colour as a surface)
- `apps/web/features/platform/hotsite/module-styles.ts` + `module-styles.spec.ts` and `apps/web/shells/hotsite/components/TestimonialsModule.tsx` (modify, added during implementation: `sectionCardTextColor(bgVariant)` and the `SectionBgVariant` alias, so a testimonial card reads on its own surface)
- `apps/web/shared/lib/eslint/secondary-surface.eslint.spec.ts` (new; the `SECONDARY_SURFACE_SELECTOR` spec)
- `apps/web/features/booking/components/public/SubmitInfoForm.tsx` (modify; the reported box, lines 146-164, and the response textarea style at ~201)
- `apps/web/shells/hotsite/components/BrandCard.tsx` and `TestimonialCard.tsx` (modify; discovery 2026-11-11) + their existing specs
- Panel sites to convert (verified 2026-11-11; `TenantOptionRow` has two surfaces, lines 91 and 109): `apps/web/features/customer/components/TenantOptionRow.tsx`, `apps/web/features/booking/components/public/AvailabilityAlertLoginGate.tsx`, `apps/web/features/platform/components/public/LeadFormLoginRequiredGate.tsx`, `apps/web/features/platform/components/public/LeadFormTerminalCard.tsx`, `apps/web/features/booking/components/public/VariableDurationStep.tsx` (~line 150)
- Field sites to convert: `apps/web/features/booking/components/public/AddressTextField.tsx`, `IntakeQuestionField.tsx`, `IntakeAnswersStep.tsx`, `ContactInfoFields.tsx`, `IntakeAttendeesList.tsx`, `apps/web/features/customer/components/InformationCompletionPhoneField.tsx`, `apps/web/features/platform/components/public/LeadFormFields.tsx`
- `apps/web/features/platform/components/public/LeadFormSkeleton.tsx` (a skeleton block with no text; exempt or convert, decided in discovery)
- The matching `.spec.tsx` of every modified component (modify; each already exists beside it)
- `apps/web/eslint.config.js` (modify; add `SECONDARY_SURFACE_SELECTOR` and its exempt paths, mind the replace-not-merge trap) + its selector spec (sibling of `raw-form-control.eslint.spec.ts` / `restricted-syntax.eslint.spec.ts`; new file, name checked in discovery)
- `apps/web/features/platform/hotsite/apply-branding.ts` + its spec (modify; adds `--ba-secondary-muted`)
- `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § Branding & Design Token System (modify; document the new derived token beside `--ba-secondary-text`/`--ba-secondary-accent`)
- `docs/ENGINEERING_RULES_FRONTEND.md` § The `--ba-*` exception (modify; one short rule: a surface painted with a branding colour takes its text and accent from the matching derived token, via `BrandedPanel` / `brandedFieldStyle`) and the `docs/ANTI_PATTERNS.md` row (doc gate: asked at that step)

**Acceptance criteria — product:**
- [ ] On the `smassagem` tenant (text colour equal to the secondary colour), the "Mensagem da equipe" message and its label are readable on the submit-info page.
- [ ] Every panel and input on the public booking, customer and lead-form pages shows readable text and typed text, whatever the tenant's palette.
- [ ] The look stays the tenant's own: panels and fields keep the secondary colour, radius and border of today; the text and accent colours change only when the old ones did not reach 4.5:1 (a tenant whose palette already read keeps exactly the colours it had). The one deliberate change for every tenant is the input placeholder, which moves from the browser grey to a tint of the tenant's own text colour, at least 4.5:1 over the secondary colour.
- [ ] The editor gains no new field: the placeholder colour is derived from the colours a manager already sets, and the editor preview shows it.
- [ ] A new panel or field written with the raw secondary background fails `pnpm lint` with a message pointing to `BrandedPanel` / `brandedFieldStyle`.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `branded-panel.spec.tsx`: renders children on the secondary background with `--ba-secondary-text` colour and `--ba-radius`; `label` renders in `--ba-secondary-accent`; without `label` no heading renders; `className` and `data-testid` forward; `axe` clean.
  - [ ] `branded-panel.spec.tsx` (negative guarantee, own test): the panel never renders `--ba-primary` or `--ba-text` as a text colour, so no caller path can reintroduce the inherited-colour bug.
  - [ ] `branded-field-style.spec.ts`: valid and invalid styles (the invalid border is the branded error border); text colour is `--ba-secondary-text`; background is `--ba-secondary`.
  - [ ] `branded-panel-contrast.spec.ts`: for every catalogue template and the `textColor === secondaryColor` fixture, panel text, panel accent and field text over `secondaryColor` are ≥4.5:1 (negative guarantee: this fails against the pre-story inherited text colour for the fixture).
  - [ ] One spec per converted component asserts the readable-colour tokens are applied (panel/field uses the helper), and `SubmitInfoForm.spec.tsx` asserts the team message sits inside `BrandedPanel` with the label.
  - [ ] ESLint selector spec: `SECONDARY_SURFACE_SELECTOR` flags `{ backgroundColor: 'var(--ba-secondary)' }` in a public-tree file, in a branded file, and when the value is a template literal with no expression; does not flag `borderColor: 'var(--ba-secondary)'`, the helper files or an exempt shell path; existing `raw-form-control.eslint.spec.ts` and `restricted-syntax.eslint.spec.ts` stay green (replace-not-merge proven).
  - [ ] `apply-branding.spec.ts`: `--ba-secondary-muted` is the blend when it reaches 4.5:1 over the secondary colour and equals `--ba-secondary-text` otherwise; `branded-panel-contrast.spec.ts` asserts the placeholder is ≥4.5:1 for every catalogue template and the `textColor === secondaryColor` fixture; `branded-field-style.spec.ts` asserts `BRANDED_FIELD_PLACEHOLDER_CLASS` is exported and names the token.
  - [ ] `BrandCard.spec.tsx` and `TestimonialCard.spec.tsx` (negative guarantee, own test each): neither renders `--ba-primary` or `--ba-text` as the text colour on the secondary background; `TestimonialCard` uses `--ba-section-text` when the section sets a card background.
  - [ ] `hotsite-token-isolation.spec.ts` and `default-branding.spec.ts` stay green.
- Integration: none (frontend-ts, no integration tier).
- Tenant isolation: none — pure presentation of already tenant-scoped branding tokens; no tenant data read or written.
- E2E:
  - [ ] none new beyond a regression net: the existing public booking, submit-info, lead-form and customer information-completion specs run unchanged (their `data-testid`s are kept). Reason for no new test: the contract is a colour contrast, proven exactly at unit tier by `branded-panel-contrast.spec.ts`; a Playwright pixel check would be flaky.
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean (including `SECONDARY_SURFACE_SELECTOR` over the whole of `apps/web`, proving no raw secondary surface remains)

## Self-dry-run findings

- The two stories are sequenced because Story 1 must present the inheritance-correct effective buffer behavior from Story 0.
- No database migration is appropriate: the column is already nullable, and historical numeric values are ambiguous. Preserving them avoids silently changing a manager’s intentional configuration.
- Story discovery must confirm the applicable validated journey/prototype paths and the full customer-confirmation component set before implementation.
- Story 2 (month markers) is independent of Stories 0 and 1. `AvailabilityCarousel` is one component with a `variant` prop used by five surfaces, so one change covers the hotsite and the three dashboard callers; the calendar variant and the calendar popovers already show the month. Discovery (2026-11-09) fixed three draft errors: the dashboard callers already print a slots heading (so the date goes into those headings instead of a second label inside `SlotPicker`), `formatDateLong` already exists (no new date helper), and an `aria-label` on the pills would break label-in-name (an `sr-only` month span is used instead).
- Story 3 (numeric-input units) is independent of Stories 0–2. Audit method: `grep type="number"` over non-spec `.tsx` in `apps/web` (26 inputs; the 27th site is `SuffixNumberField`, already counted in row 25), then each label read from `pt-BR/web.json`; all 19 files already have a `.spec.tsx`, so no spec has to be invented. Two design traps are pinned in the story: the ESLint flat-config replace-not-merge behaviour (`ui/**` shares `rawFormControlExemptPaths` with the branded trees) and the branded `IntakeAnswersStep`, where a `ui/` primitive cannot be used (`--ba-*`). The open questions (capacity unit, points-per-currency wording, prototype stylesheet) were settled in discovery, see the next note.
- Story 3 discovery (2026-11-10) corrected the draft: the validated prototypes and the settings page overlay the unit inside the input (not a bordered segment), `SuffixNumberField` has 11 call sites (not 4), the prototype suffix styles are inline per file (no shared stylesheet), and the settings suffix keys already exist (no parallel `common.units` namespace). Decisions: capacity unit `vagas`, points unit `pts / {currency symbol}`, `h` on narrow policy cards and `horas` kept on settings.
- Story 4 (itinerary numbering by leg) is independent of Stories 0–3. Premise verified 2026-11-10: `BookingItineraryCard.tsx:28-34` numbers by `index + 1` and `buildItinerary()` emits one entry per resource assignment, so a 3-leg service with 6 resource rows shows 1–6. Open for discovery: whether the service-name prefix is wanted in multi-service baskets, whether a `journeys/` booking-detail prototype also numbers by row, and whether the seeded E2E journey has a leg with two resources. Renaming the `BookingItineraryLeg` type was deliberately left out (churn across types, BFF and web); a possible follow-up.
- Story 5 (branded secondary surfaces) is independent of Stories 0–4. Premise verified 2026-11-10: `SubmitInfoForm.tsx:146-164` paints `--ba-secondary` with no text colour; `apply-branding.ts:246-248` already derives `--ba-secondary-text`/`--ba-secondary-accent` but only `shells/hotsite` consumes them; ~12 content-tree sites paint it as a background (5 panels, 7 field files). Mirrors TD57's `BrandedFeedbackMessage` pattern. Open for discovery: which `shells/hotsite` files truly pair the colour with the derived tokens (lint exempt list), placeholder colour, whether a muted-text or border token is needed, the `LeadFormSkeleton` and `TestimonialCard` (`cardBg ?? secondary`) cases, and the exact prototype slugs. Borders on `--ba-secondary` are deliberately out of scope.
- Story 5 discovery (2026-11-11) corrected the draft: `shells/hotsite` is not wholly safe (`BrandCard` and `TestimonialCard` have the same bug and are converted; the lint exemption is a list of exact paths, not the folder); `TenantOptionRow` has two surfaces, `ContactInfoFields` three, `InformationCompletionPhoneField` two; `module-styles.ts` returns the colour as a bare string the rule cannot see (known limit). Decisions: the placeholder is fixed in this story through a new derived token `--ba-secondary-muted` plus `BRANDED_FIELD_PLACEHOLDER_CLASS`, applied to every tenant; no new editor field. Recorded follow-up, not in this story: the dashboard editor does not warn a manager who picks a text colour equal to the secondary colour.
