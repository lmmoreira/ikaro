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

### Story 0 — Restore buffer inheritance and resource-free service saves 🔴

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

### Story 1 — Present customer appointment time separately from reserved time 🔴

**Agent:** backend-ts + bff-ts + frontend-ts
**Complexity:** M
**Docs to load:** `docs/API_CONTRACTS.md`; `docs/BFF_ARCHITECTURE.md` § Web → BFF Transport Layer; `docs/ENGINEERING_RULES_FRONTEND.md` § Hotsite full-page components; `docs/TESTING_STRATEGY.md`
**Dependencies:** Story 0
**Pattern:** explicit dual-time API contract — `appointmentEndsAt` for customer communication and `endsAt` for internal reservation/availability
**Discovered:** 2026-10-27, manager report of public slots such as `09:00–10:50` for a 50-minute service
**Root cause:** `apps/backend/src/contexts/booking/application/services/availability-query.service.ts` returns the buffer-inclusive window as `endsAt`, and `apps/web/features/booking/components/public/SlotPicker.tsx` renders that value directly as the customer-facing end time.

**Description:**
Extend the availability response with an explicit appointment end calculated from the selected services’ actual customer-visible duration. Preserve the existing buffer-inclusive `endsAt` for availability, conflict checks, alerts, and any operational tooling that needs the reserved window. Propagate the new field through backend, BFF, shared types, and hotsite API clients. Render the appointment end in the public slot picker and all customer-facing booking summaries/confirmations; do not expose buffer duration or reserved end to customers.

**Backend use case steps:**
1. Return both customer appointment end and reserved end for every availability slot.
2. Ensure multi-service and legged-service appointment ends include service/leg duration and configured inter-leg transitions, but never a trailing internal buffer.
**Backend HTTP surface:** extends existing public `GET /v1/schedule/availability` slot items with `appointmentEndsAt`; retains `startsAt` and buffer-inclusive `endsAt` for backward-compatible operational semantics.
**BFF endpoint spec:** extends existing public `GET /v1/schedule/availability` response to pass through `appointmentEndsAt` alongside `startsAt` and `endsAt`.
**Prototype references:** `journeys/customer/prototypes/` — identify and update the validated booking-slot/confirmation prototype during story discovery before implementation.
**New migration / i18n keys / env vars / feature flags:** no migration, i18n keys, env vars, or feature flags expected.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/services/availability-query.service.ts`
- `apps/backend/src/contexts/booking/application/services/availability-query.service.spec.ts`
- `apps/backend/src/contexts/booking/infrastructure/controllers/schedule-availability.controller.integration.spec.ts`
- `apps/bff/src/features/booking/schedule.types.ts`
- `apps/bff/src/features/booking/schedule-availability.controller.component.spec.ts`
- `packages/types/src/schedule.dto.ts`
- `apps/web/features/platform/hotsite/api/schedule.ts`
- `apps/web/features/booking/api/booking.spec.ts`
- `apps/web/features/booking/components/public/SlotPicker.tsx`
- `apps/web/features/booking/components/public/SlotPicker.spec.tsx`

**Acceptance criteria — product:**
- [ ] A customer sees only the time they will receive the selected service(s), never the trailing operational buffer.
- [ ] A 50-minute service beginning at 09:00 with a 10-minute buffer displays as `09:00–09:50`; the resource remains internally reserved through 10:00.
- [ ] Customer booking summaries and post-submission details use the same appointment end as the slot picker.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `availability-query.service.spec.ts` proves `appointmentEndsAt` excludes trailing buffers for single, multi-service, and legged bookings.
  - [ ] `SlotPicker.spec.tsx` proves the rendered label uses `appointmentEndsAt`, not reserved `endsAt`.
- Integration:
  - [ ] `schedule-availability.controller.integration.spec.ts` proves the public response exposes both timestamps with the expected distinct values.
- Tenant isolation:
  - [ ] The public availability response resolves both timestamps only from services belonging to the resolved tenant.
- E2E:
  - [ ] Customer selects a buffered service and sees its actual appointment end consistently in the picker and confirmation.
- [ ] Coverage ≥80% on changed code.
- [ ] `tsc --noEmit` clean, lint clean.

## Self-dry-run findings

- The two stories are sequenced because Story 1 must present the inheritance-correct effective buffer behavior from Story 0.
- No database migration is appropriate: the column is already nullable, and historical numeric values are ambiguous. Preserving them avoids silently changing a manager’s intentional configuration.
- Story discovery must confirm the applicable validated journey/prototype paths and the full customer-confirmation component set before implementation.
