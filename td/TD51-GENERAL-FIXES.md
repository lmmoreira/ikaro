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

### Story 2 — Show month context in the booking date carousel and selected-date label

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md` § UI layer model and § The `--ba-*` exception; `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys; `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` (booking CTA / branding sections only); `docs/TESTING_STRATEGY.md` § apps/web Testing Infrastructure; `journeys/guest/prototypes/book-a-service/dev-notes.md`
**Dependencies:** none (Story 1 already changed `SlotPicker`; this story builds on its current shape)
**Pattern:** plain composition — no named pattern applies (a presentational month-marker element rendered inside the existing day strip, plus a heading in `SlotPicker`)
**Discovered:** 2026-11-09, user report on the production hotsite `/smassagem/booking` with `carouselDays` set to 90: every day pill shows only a weekday and a day number, so the month is unknowable.
**Root cause:** `AvailabilityCarousel.tsx` renders each pill from `dayCarouselLabel()` (weekday, or "Hoje" for index 0) and `dayNumber()` (`apps/web/shared/lib/formatting/date-utils.ts`), neither of which carries month or year. `SlotPicker.tsx` renders no selected-date label either, so nothing after the click confirms which date was chosen.

**Description:**
Add month context to the date carousel in two places. The approved prototype is `journeys/guest/prototypes/book-a-service/02-calendar-slot.html` (commit `3b9d3b8e`).

1. **Month markers inside the strip.** `AvailabilityCarousel` renders a small muted marker in the scroll container before the first pill and before every pill whose year-month differs from the previous pill's (e.g. `JUN.`, then `JUL.`). Markers scroll with the pills, so a week that spans two months shows both and no scroll-position tracking is needed. A marker after the first one has a thin left divider. The marker shows the year only when its year differs from the first pill's year, which covers the January boundary. Month names come from `Intl.DateTimeFormat(locale, { month: 'short' })`, so no new i18n keys are needed for them. Month comparison uses the ISO string (`date.slice(0, 7)`), never a `Date` round-trip.
2. **Selected-date label.** `SlotPicker` renders a heading above the slots, e.g. "Horários disponíveis — **Quinta, 2 de julho**" (weekday long, day, month long, no year). It is rendered for every picker state once a date is selected: loaded, loading, empty and error. It uses `data-testid="slot-picker-date-label"`. `SlotPicker` is the one place that owns it, because all four carousel callers and the calendar variant render it. (The original prototype already showed this line but it was never built.)

**Where the carousel and picker are used (audit result):**

| Surface | Component | Branding | Change |
|---|---|---|---|
| Public hotsite booking, `datePickerType: 'carousel'` (`AvailabilityStep`) | `AvailabilityCarousel` `variant="hotsite"` | Tenant-branded (`--ba-*`) | Markers + label |
| Public hotsite booking, `datePickerType: 'calendar'` | `AvailabilityCalendar` (react-day-picker) | Tenant-branded | Month grid already shows the month; only the new `SlotPicker` label applies |
| Customer my-account reschedule (`ReschedulePicker`) | `AvailabilityCarousel` `variant="dashboard"` | Tailwind, not `--ba-*` | Markers + label |
| Staff reschedule (`RescheduleBookingPage`) | `AvailabilityCarousel` `variant="dashboard"` | Tailwind | Markers + label |
| Staff new booking (`NewBookingAvailabilityStep`) | `AvailabilityCarousel` `variant="dashboard"` | Tailwind | Markers + label |
| Availability alert form (`AvailabilityAlertPickers`), schedule range sheet, recurring schedule date field | shadcn `Calendar` popover | Dashboard | None: month caption already visible |

**Decisions (pre-made):**
- **Branding.** The `hotsite` variant uses only existing tokens: `color: var(--ba-text)` at reduced opacity, and `var(--ba-secondary)` for the divider. It introduces no new token and no hardcoded colour. The `dashboard` variant uses Tailwind (`text-slate-500`, `border-slate-200`). The two variants share the marker's structure and are never merged into one branding-aware style (CLAUDE.md §7 Web styling boundary).
- **Hotsite stays unchanged elsewhere.** No other hotsite component, token or `applyBranding()` path is touched. The existing `hotsite-token-isolation.spec.ts` must stay green.
- **Accessibility.** The marker is `aria-hidden="true"`. To keep month context for screen readers, each `day-option` gets an `aria-label` with the full date (weekday, day, month), e.g. "sábado, 6 de fevereiro". The pill's visible text and `data-testid`/`data-date` are unchanged.
- **Contrast.** The muted marker text must meet WCAG AA against `--ba-background` for the default hotsite palette. If reduced opacity fails AA, use the full `--ba-text` colour at a smaller weight and size instead. It must never fall back to a hardcoded grey.
- **Locale.** Both `pt-BR` and `en` are handled by `Intl` and by the new `slotPicker.availableOn` key. No locale literal is hardcoded.
- **Prototypes.** The guest prototype `02-calendar-slot.html` is already updated. The dashboard-variant prototypes that contain a day strip are updated to match: `journeys/customer/prototypes/minha-conta/15-reagendar.html` and `journeys/staff/prototypes/agenda/05-reschedule.html` (primary states). The sibling error and loading states (`15b`, `15d`, `15f`, `15h`, `15i`, `15k`, `05d`) and `journeys/manager/prototypes/scheduling-exceptions/01e-reagendar.html` get the same strip.

**Prototype references:** `journeys/guest/prototypes/book-a-service/02-calendar-slot.html` (approved); the dashboard prototypes above.
**Backend HTTP surface:** none.
**BFF endpoint spec:** none.
**New migration / i18n keys / env vars / feature flags:** i18n key `booking.slotPicker.availableOn` ("Horários disponíveis — {date}" / "Available times — {date}") in both `packages/i18n/locales/pt-BR/web.json` and `.../en/web.json`. No migration, env var or flag.

**Files to create/modify:**
- `apps/web/features/booking/components/public/AvailabilityCarousel.tsx` (modify)
- `apps/web/features/booking/components/public/AvailabilityCarousel.spec.tsx` (modify)
- `apps/web/features/booking/components/public/SlotPicker.tsx` (modify)
- `apps/web/features/booking/components/public/SlotPicker.spec.tsx` (modify if it exists, else create)
- `apps/web/shared/lib/formatting/date-utils.ts` (modify: add `monthMarkerLabel(isoDate, locale, includeYear)` and `slotDateLabel(isoDate, locale)`)
- `apps/web/shared/lib/formatting/date-utils.spec.ts` (modify)
- `packages/i18n/locales/pt-BR/web.json`, `packages/i18n/locales/en/web.json` (modify)
- `apps/web/e2e/guest-booking.spec.ts` (modify)
- `journeys/customer/prototypes/minha-conta/15*.html`, `journeys/staff/prototypes/agenda/05-reschedule.html`, `journeys/staff/prototypes/agenda/05d-reagendar-erro.html`, `journeys/manager/prototypes/scheduling-exceptions/01e-reagendar.html` (modify)
- `journeys/guest/prototypes/book-a-service/dev-notes.md` and the matching dev-notes for the customer and staff prototypes (modify, to document the markers)

**Acceptance criteria — product:**
- [ ] A customer scrolling a long hotsite carousel (for example 90 days) always sees which month a day belongs to. A marker appears before the first day and at every month boundary.
- [ ] A week that spans two months shows both month markers.
- [ ] The year appears on a marker only when it differs from the first day's year.
- [ ] After choosing a day, the date is confirmed above the time slots, e.g. "Horários disponíveis — Quinta, 2 de julho".
- [ ] The same behavior applies to the customer reschedule and the staff reschedule and new-booking carousels, styled with the dashboard (Tailwind) palette.
- [ ] A tenant's branding looks unchanged apart from the new markers: no new colours, the same radius, and the same selected and unselected pill styling.
- [ ] The calendar (`datePickerType: 'calendar'`) layout is unchanged, and it gains the selected-date label.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `date-utils.spec.ts`: `monthMarkerLabel` for pt-BR and en, with and without year; `slotDateLabel` for pt-BR and en.
  - [ ] `AvailabilityCarousel.spec.tsx`: a marker precedes the first pill and each month-boundary pill, and a 14-day strip crossing a month boundary renders exactly 2 markers.
  - [ ] `AvailabilityCarousel.spec.tsx`: the marker carries the year across a December-to-January boundary and not within a single year.
  - [ ] `AvailabilityCarousel.spec.tsx`: the `hotsite` variant marker reads `var(--ba-text)`/`var(--ba-secondary)` (`toHaveStyle`), and the `dashboard` variant uses its Tailwind classes and no `--ba-*`.
  - [ ] `AvailabilityCarousel.spec.tsx`: each `day-option` has the full-date `aria-label`, and `data-testid`/`data-date`/`aria-pressed` are unchanged.
  - [ ] `SlotPicker.spec.tsx`: the date label renders in the loaded, loading, empty and error states, in both locales.
  - [ ] Regression: `hotsite-token-isolation.spec.ts` stays green.
- Tenant isolation: none — pure presentation, no tenant data read or written.
- E2E:
  - [ ] `guest-booking.spec.ts`: after loading the carousel, at least one `month-marker` is visible, and after picking a day `slot-picker-date-label` shows that date.
  - [ ] No other E2E selector breaks (`day-option`, `day-strip` unchanged).
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean (including the `LOCALE_LITERAL_SELECTOR` ESLint rule)

## Self-dry-run findings

- The two stories are sequenced because Story 1 must present the inheritance-correct effective buffer behavior from Story 0.
- No database migration is appropriate: the column is already nullable, and historical numeric values are ambiguous. Preserving them avoids silently changing a manager’s intentional configuration.
- Story discovery must confirm the applicable validated journey/prototype paths and the full customer-confirmation component set before implementation.
- Story 2 (month markers) is independent of Stories 0 and 1. `AvailabilityCarousel` is one component with a `variant` prop used by five surfaces, so one change covers the hotsite and the three dashboard callers; the calendar variant and the calendar popovers already show the month. Contrast of the muted marker against tenant palettes is the main risk and is covered by an explicit fallback decision.
