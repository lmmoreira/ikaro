# TD51 — GENERAL-FIXES

## Status

- **Type**: Technical Debt / Product correctness
- **Priority**: High (customers are shown internal buffer time as appointment time, and managers cannot correct a legacy service buffer when the service has no resources)
- **Context**: Booking context — backend, BFF, public hotsite, and dashboard web app
- **Created**: 2026-10-27
- **Discovered**: Manager report while editing service `01a17e8d-879c-7830-8ef6-e75f03610509`: a resource-free appointment service created with a historical 60-minute default could not save a new 10-minute buffer because the Resources panel sent an empty requirements array; the public availability picker consequently rendered internal reserved windows as customer appointment times.
- **Decision status**: Ready for discovery and implementation in the dependency order below; each story still begins with `/story-discovery`.
- **Related**: `docs/BUSINESS_LOGIC_REFERENCE.md` § Booking / buffer rules; `docs/TENANTS_SETTINGS_SCHEMA.md` § `serviceBufferMinutes`

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
**Complexity:** L
**Docs to load:** `docs/ENGINEERING_RULES_SHARED.md` § Schema-level enforcement; `docs/ENGINEERING_RULES_BACKEND.md` § Transactions; `docs/BFF_ARCHITECTURE.md` § Web → BFF Transport Layer; `docs/TESTING_STRATEGY.md`
**Dependencies:** none
**Pattern:** optional configuration override with explicit `null` inheritance; plain composition for independent resource and buffer mutations
**Discovered:** 2026-10-27, manager report from the production service edit screen
**Root cause:** `apps/backend/src/contexts/booking/domain/service.aggregate.ts` snapshots the tenant buffer during creation; `apps/web/features/booking/components/dashboard/services/ServiceResourceRequirementsPanel.tsx` submits an empty requirements list before it updates the buffer; `packages/validation/src/booking.ts` rejects that empty list with `.min(1)`.

**Description:**
Make `bufferAfterMinutes` nullable for appointment services throughout the domain, validation, BFF, and web transport. `null` must explicitly clear an existing override and restore inheritance from the tenant’s current value; `0` remains an explicit no-buffer override. New appointment services must begin with `null`, while existing saved numeric values must not be rewritten automatically. Permit a flat appointment service to intentionally hold no resource requirements, preserving the established resource-free/LOCATION-fallback behavior. Refactor the Resources save action so a buffer-only edit does not PATCH resource requirements; when requirements are edited, persist them independently and then persist a changed buffer. The UI must make the effective configuration clear and provide an explicit “use tenant default” action/state rather than treating a blank numeric field as zero.

**Backend use case steps:**
1. Create an appointment service with `bufferAfterMinutes = null` so availability resolves the tenant value dynamically.
2. Update an appointment service with a non-negative number to set an explicit override, or `null` to clear it; preserve SESSION and legged-service constraints.
3. Accept an empty flat `resourceRequirements` array as the supported resource-free service configuration, while retaining the one-or-more requirement rule for every leg.
**Backend HTTP surface:** extends existing `PATCH /v1/services/:id` to accept `bufferAfterMinutes: number | null`; extends existing `PATCH /v1/services/:id/resource-requirements` to accept `[]` for flat appointment services.
**BFF endpoint spec:** preserves the same authenticated same-origin `PATCH /v1/services/:id` and `/v1/services/:id/resource-requirements` endpoints; forwards nullable buffer and empty flat requirement requests unchanged after shared-schema validation.
**New migration / i18n keys / env vars / feature flags:** no migration, env vars, or feature flags; add paired pt-BR/en-US dashboard strings for the inheritance state and action.

**Files to create/modify:**
- `packages/validation/src/booking.ts`
- `apps/backend/src/contexts/booking/domain/service.aggregate.ts`
- `apps/backend/src/contexts/booking/application/use-cases/create-service.use-case.ts`
- `apps/backend/src/contexts/booking/application/use-cases/create-service.use-case.spec.ts`
- `apps/backend/src/contexts/booking/application/use-cases/update-service.use-case.ts`
- `apps/backend/src/contexts/booking/application/use-cases/update-service.use-case.spec.ts`
- `apps/backend/src/contexts/booking/infrastructure/controllers/service.controller.integration.spec.ts`
- `apps/bff/src/features/booking/services.controller.spec.ts`
- `apps/web/features/booking/components/dashboard/services/ServiceBufferAfterMinutesField.tsx`
- `apps/web/features/booking/components/dashboard/services/ServiceResourceRequirementsPanel.tsx`
- `apps/web/features/booking/components/dashboard/services/ServiceResourceRequirementsPanel.spec.tsx`
- `packages/i18n/locales/pt-BR/web.json`
- `packages/i18n/locales/en-US/web.json`

**Acceptance criteria — product:**
- [ ] A new appointment service uses the current tenant buffer unless a manager explicitly sets a service-specific value.
- [ ] A manager can set, change, or clear a service buffer on a service with no resources; clearing it visibly restores the tenant default.
- [ ] A resource-free flat appointment service saves without a validation error.
- [ ] Existing explicit numeric service buffers retain their behavior until a manager changes or clears them.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `create-service.use-case.spec.ts` proves new appointment services persist a null override and availability falls back to the current tenant setting.
  - [ ] `update-service.use-case.spec.ts` proves numeric overrides, explicit zero, and null clearing while preserving SESSION/legged restrictions.
  - [ ] `ServiceResourceRequirementsPanel.spec.tsx` proves a buffer-only edit on a resource-free service does not call the requirements endpoint.
- Integration:
  - [ ] `service.controller.integration.spec.ts` proves nullable buffer updates and an empty flat requirements list return 200, while an empty leg requirement list remains rejected.
- Tenant isolation:
  - [ ] Service buffer updates and resource-requirement updates cannot affect a same-id service belonging to another tenant.
- E2E:
  - [ ] Manager changes a resource-free service to inherit the tenant buffer and sees the saved effective value after reload.
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
