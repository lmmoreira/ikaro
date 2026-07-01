# TD18-19-20 - Consolidated Bad-Smell Violations

## Status
- **State**: Resolved (2026-07-01)
- **Type**: Technical Debt / Consolidated Audit Baseline
- **Priority**: Medium
- **Scope**: whole repo - `apps/backend`, `apps/bff`, `apps/web`
- **Sources consolidated**:
  - `td/TD18-SMELLS-VIOLATIONS.md`
  - `td/TD19-BAD-SMELL-VIOLATIONS-2.md`
  - `td/TD20-SMELLS-VIOLATION.md`

## Purpose

This document is the single baseline inventory for the smell findings recorded across TD18, TD19, and TD20.

It serves two goals:
1. Deduplicate overlapping findings across the three TDs.
2. Turn the smell inventory into an actionable remediation plan, with work broken into story-sized waves.

## Consolidation Rules

- Exact duplicates are merged into one canonical item.
- Same smell family, different files, are merged into one item with file-level subentries.
- Items marked as "none found" in the source TDs are retained only as audit checkpoints, not as remediation work.
- Findings that appear in TD18 but are absent from TD20 are treated as historical baseline items unless a newer audit re-confirms them.

## Duplicate and Overlap Map

| Canonical item | Source overlap | Notes |
|---|---|---|
| Booking completion spec preset helper | TD18, TD19, TD20 | Exact same helper smell in `complete-booking.use-case.spec.ts`; covered under BE-B3 |
| Backend spec helpers / inline entity construction | TD18, TD20 | Same family, different file lists |
| BFF controller business logic in controllers | TD18, TD20 | TD20 expands the controller-level examples from TD18 |
| Web fetcher naming drift | TD18, TD20 | TD20 adds dashboard-specific files to the TD18 baseline |
| Booking DTO inline regex validation | TD19 | Unique to TD19, but belongs to the broader validation/normalization cleanup theme |

## Canonical Inventory

### Backend

#### BE-B1 - Aggregate props still use primitives where shared value objects exist

**Sources**
- TD18

**Observed files**
- `apps/backend/src/contexts/staff/domain/staff.aggregate.ts`
- `apps/backend/src/contexts/platform/domain/tenant.aggregate.ts`
- `apps/backend/src/contexts/customer/domain/customer.aggregate.ts`

**What needs to be done**
- Replace primitive aggregate fields with the matching shared value objects where those VOs already exist.
- Update reconstitution, builders, mappers, and specs together so the aggregate contract stays consistent.
- Keep the change aligned with the shared VO model instead of introducing new primitive-only shortcuts.

**Why it matters**
- Validation and normalization should live in one place.
- Primitive fields create inconsistent contracts across bounded contexts.

---

#### BE-B2 - Booking DTOs duplicate shared VO validation with inline regex

**Sources**
- TD19

**Observed files**
- `apps/backend/src/contexts/booking/application/dtos/request-booking.dto.ts`
- `apps/backend/src/contexts/booking/application/dtos/close-schedule.dto.ts`
- `apps/backend/src/contexts/booking/application/dtos/open-schedule.dto.ts`

**What needs to be done**
- Replace inline phone/time regexes with `PhoneNumber.isValid` and `TimeOfDay.isValid`.
- Keep the DTO schemas thin and delegate validation rules to the shared VO layer.
- Update the error messages only where they improve clarity without duplicating the regex itself.

**Why it matters**
- The DTOs are re-encoding rules that already exist in the domain layer.
- Any future validation change would otherwise need to be edited in multiple places.

---

#### BE-B3 - Test helpers and inline entity construction are spread across specs

**Sources**
- TD18
- TD20

**Observed files**
- `apps/backend/src/shared/request/request.interceptor.spec.ts`
- `apps/backend/src/shared/infrastructure/gcp-pubsub-event-bus.adapter.spec.ts`
- `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.spec.ts`
- `apps/backend/src/contexts/staff/infrastructure/controllers/staff.controller.spec.ts`
- `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts`
- `apps/backend/src/contexts/booking/application/use-cases/cancel-booking-as-customer.use-case.spec.ts`
- `apps/backend/src/contexts/customer/application/use-cases/search-customers.use-case.spec.ts`
- `apps/backend/src/contexts/notification/infrastructure/events/tenant-provisioned.handler.spec.ts`
- `apps/backend/src/contexts/notification/infrastructure/cross-context/notification-platform.adapter.spec.ts`
- `apps/backend/src/contexts/notification/infrastructure/delivery/email-delivery-channel.adapter.spec.ts`
- `apps/backend/src/contexts/notification/infrastructure/delivery/notification-dispatcher.adapter.spec.ts`
- `apps/backend/src/contexts/staff/infrastructure/events/tenant-provisioned.handler.spec.ts`
- `apps/backend/src/contexts/loyalty/infrastructure/cross-context/loyalty-platform.adapter.spec.ts`
- `apps/backend/src/contexts/loyalty/infrastructure/events/booking-completed.handler.spec.ts`
- `apps/backend/src/contexts/loyalty/application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case.spec.ts`

**What needs to be done**
- Convert repeated local fixture helpers into dedicated builders when the setup is domain-shaped and reused.
- Remove one-off inline entity construction where a builder already exists or can be added once.
- Keep spec setup deterministic and uniform across backend contexts.

**Important sub-case**
- `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts`
  - The local `makeApprovedBooking()` helper should become a `BookingBuilder.approved(...)` preset.

**Why it matters**
- This is the highest concentration of test hygiene drift across the three TDs.
- The repo explicitly prefers builders over repeated ad-hoc setup.

---

#### BE-B4 - Missing entity builders

**Sources**
- TD18

**Observed files**
- `apps/backend/src/contexts/staff/infrastructure/entities/staff.entity.ts`
- `apps/backend/src/contexts/platform/infrastructure/entities/tenant.entity.ts`
- `apps/backend/src/contexts/platform/infrastructure/entities/hotsite-config.entity.ts`
- `apps/backend/src/contexts/booking/infrastructure/entities/booking.entity.ts`
- `apps/backend/src/contexts/customer/infrastructure/entities/customer.entity.ts`

**What needs to be done**
- Add the missing `XxxEntityBuilder` coverage for the listed entities.
- Use the builder pattern consistently in tests that touch those entities.
- Keep the builders small, explicit, and aligned with the actual entity shape.

**Why it matters**
- Missing builders force tests back into inline construction.
- It increases churn when entity fields change.

---

#### BE-B5 - Duplicated normalization logic is scattered across use cases and aggregates

**Sources**
- TD18

**Observed files**
- `apps/backend/src/contexts/platform/application/use-cases/update-tenant-settings.use-case.ts`
- `apps/backend/src/contexts/staff/application/use-cases/invite-staff.use-case.ts`
- `apps/backend/src/contexts/customer/domain/customer.aggregate.ts`
- `apps/backend/src/contexts/booking/domain/booking.aggregate.ts`
- `apps/backend/src/contexts/booking/domain/service.aggregate.ts`

**What needs to be done**
- Move repeated trimming / normalization to the right shared VO or shared utility.
- Avoid re-implementing the same cleanup logic in multiple contexts.
- If a rule is domain-specific, keep it in the aggregate method; if it is generic, centralize it.

**Why it matters**
- Normalization drift is a long-term correctness risk.
- The more places that trim or reformat the same field, the easier it is to diverge.

---

#### BE-B6 - Seed DDL and builder-field audit checkpoints

**Sources**
- TD18

**Current status**
- No concrete findings were reported in the snapshot.

**How to treat this item**
- Keep it as an audit checkpoint only.
- Do not create remediation work until a newer smell scan actually reports a violation.

---

### BFF

#### BFF-B1 - Business logic still lives in controllers

**Sources**
- TD18
- TD20

**Observed files**
- `apps/bff/src/uploads/uploads.controller.ts`
- `apps/bff/src/services/services.public.controller.ts`
- `apps/bff/src/schedule/schedule-availability-summary.controller.ts`
- `apps/bff/src/customers/customers.controller.ts`
- `apps/bff/src/bookings/bookings.controller.ts`
- `apps/bff/src/auth/auth.controller.ts`

**What needs to be done**
- Move orchestration, branching, and data reshaping out of controllers.
- Keep controllers as thin transport adapters that validate input and delegate.
- Extract mappers or application services where the same branching logic is currently embedded in the endpoint.

**Recommended split**
- `bookings.controller.ts`
  - Move signed URL generation, role branching, pagination shaping, and cancel routing into dedicated use cases or service helpers.
- `auth.controller.ts`
  - Split staff login, tenant selection, and dev-login orchestration away from the controller body.
- `customers.controller.ts`
  - Push loyalty enrichment and tenant option assembly into a use case or mapper.
- `uploads.controller.ts`
  - Move content-type branching and storage-key construction into a dedicated helper.

**Why it matters**
- Controllers are becoming application services.
- This makes the transport layer harder to test and easier to regress.

---

#### BFF-B2 - Module naming drift

**Sources**
- TD20

**Observed file**
- `apps/bff/src/services/services.module.ts`

**What needs to be done**
- Rename or relocate the module so it matches the bounded-context naming rule.
- If the functionality belongs to Booking, the module should not remain in a generic `services/` folder.
- Keep the folder name aligned with the repo's bounded-context terminology.

**Why it matters**
- Naming drift is small individually, but it causes structural confusion across the BFF tree.

---

#### BFF-B3 - Clean audit checkpoints retained only as references

**Sources**
- TD18

**Current status**
- No cross-app import boundary violations were reported.
- No hotsite public response-type violations were reported.
- No module naming issue was flagged in that specific snapshot.

**How to treat this item**
- Do not turn clean checkpoints into backlog items.
- Re-run the smell audit in the touched area after future BFF changes.

---

### Web

#### WEB-W1 - `dangerouslySetInnerHTML` remains in the hotsite tree

**Sources**
- TD18

**Observed file**
- `apps/web/app/[slug]/page.tsx`

**What needs to be done**
- Replace raw HTML injection with a safer rendering path if the content source allows it.
- If HTML is truly required, centralize sanitization and document the allowlist.
- Add tests that prove unsafe payloads are rejected or neutralized.

**Why it matters**
- This is the highest-risk web smell in the set.
- The hotsite tree is the right place for dynamic content, but it needs a controlled rendering pipeline.

---

#### WEB-W2 - Component prop mutability on the shared button primitive

**Sources**
- TD20

**Observed file**
- `apps/web/components/ui/button.tsx`

**What needs to be done**
- Mark component props readonly.
- Keep the primitive aligned with the repo's React and Sonar conventions.

**Why it matters**
- This is a small fix, but it affects a shared UI primitive.
- Cleaning it up reduces repeated Sonar noise in downstream components.

---

#### WEB-W3 - Fetcher naming drift in `apps/web/lib/api/`

**Sources**
- TD18
- TD20

**Observed files**
- `apps/web/lib/api/auth.ts`
- `apps/web/lib/api/bff-client.ts`
- `apps/web/lib/api/bff-server.ts`
- `apps/web/lib/api/bookings.ts`
- `apps/web/lib/api/customers.ts`
- `apps/web/lib/api/errors.ts`
- `apps/web/lib/api/schedule.ts`
- `apps/web/lib/api/services.ts`
- `apps/web/lib/api/dashboard/bookings.ts`
- `apps/web/lib/api/dashboard/customers.ts`
- `apps/web/lib/api/dashboard/schedule.ts`
- `apps/web/lib/api/dashboard/services.ts`
- `apps/web/lib/api/dashboard/tenants.ts`

**What needs to be done**
- Rename fetcher files so they mirror bounded-context naming rather than aggregate or generic naming.
- Update imports and barrels in the same change.
- Keep public BFF transport helpers separate from feature fetchers so the naming convention stays readable.

**Suggested naming direction**
- Prefer `booking`, `customer`, `platform`, and other bounded-context names over plural aggregate names where the repo rules require it.

**Why it matters**
- This drift makes the API layer harder to scan.
- It also encourages one-off naming exceptions that become persistent.

---

#### WEB-W4 - Clean audit checkpoints retained only as references

**Sources**
- TD18
- TD20

**Current status**
- No spec environment issues were reported in the snapshots.
- No bare Node.js builtin import issues were reported in the snapshots.
- No page/layout unit-test placement issue was reported in the snapshots.
- No CSS custom-property type-assertion issue was reported in the snapshots.

**How to treat this item**
- Keep these as monitoring checkpoints only.
- Do not schedule remediation work unless the next audit reintroduces them.

## Suggested Remediation Plan

### Wave 1 - Low-risk backend cleanup

Goal: remove the most obvious validation and fixture duplication without changing the application flow.

Work items:
1. Fix the booking DTO regex duplication.
   - Replace inline regexes with `PhoneNumber.isValid` and `TimeOfDay.isValid`.
2. Add `BookingBuilder.approved(tenantId)`.
   - Replace the local helper in `complete-booking.use-case.spec.ts`.
3. Normalize the most repeated spec helpers.
   - Convert repeated `make*` helpers into builders or explicit fixture presets where the setup is reused.

Success criteria:
- No inline booking validation regex remains in the DTOs.
- `complete-booking.use-case.spec.ts` no longer owns its own approved-booking factory.
- The affected specs still read clearly and pass unchanged behavior tests.

### Wave 2 - Backend structure and domain consistency

Goal: align aggregates, builders, and normalization rules with the shared-domain model.

Work items:
1. Replace primitive aggregate props with shared VOs where they already exist.
2. Add the missing entity builders.
3. Move duplicated normalization logic to the correct shared VO or utility boundary.

Success criteria:
- Aggregates no longer re-encode validation already present in shared VOs.
- Builders exist for the entities the repo expects to be testable through builders.
- Trimming / normalization logic is centralized instead of copied.

### Wave 3 - BFF controller thinning

Goal: move orchestration out of controllers and into use cases, services, or mappers.

Work items:
1. Extract the booking controller branches into focused helpers or use cases.
2. Split auth flows into smaller units so the controller only routes input and output.
3. Move customer enrichment and upload key generation out of the controllers.
4. Rename or relocate the `services/` module so the folder name matches the bounded-context rule.

Success criteria:
- Controllers become thin transport adapters.
- Role branching, token handling, and pagination shaping are not performed directly in controller bodies.
- Module naming matches the repo's bounded-context convention.

### Wave 4 - Web safety and naming cleanup

Goal: close the highest-risk frontend smell and remove naming drift from fetcher files.

Work items:
1. Replace or centralize the `dangerouslySetInnerHTML` usage in the hotsite page.
2. Mark shared UI primitive props as readonly.
3. Rename `apps/web/lib/api/**` files to the correct bounded-context naming.
4. Update imports and tests in the same change.

Success criteria:
- The hotsite page no longer relies on raw HTML injection without a clear sanitization story.
- The shared button primitive follows the immutable-props convention.
- API fetcher naming matches the repo rules and stays consistent across dashboard and non-dashboard paths.

## Implementation Stories

These stories are intended to be executed as one cleanup effort, but each story can still be reviewed and landed independently.

### Story 1 - Booking validation and booking spec preset ✅ Done

Scope:
- TD19 BE-B2
- TD18/19/20 BE-B3 sub-case for `makeApprovedBooking()`

Target files:
- `apps/backend/src/contexts/booking/application/dtos/request-booking.dto.ts`
- `apps/backend/src/contexts/booking/application/dtos/close-schedule.dto.ts`
- `apps/backend/src/contexts/booking/application/dtos/open-schedule.dto.ts`
- `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts`
- `apps/backend/src/contexts/booking/infrastructure/builders/booking.builder.ts` or the existing booking builder location

Work required:
1. Replace inline phone/time regex validation in the booking DTOs with the shared VO validators.
2. Add `BookingBuilder.approved(tenantId)`.
3. Replace the local `makeApprovedBooking()` helper with the new builder preset.
4. Keep the behavior tests intact and confirm the DTO error messaging still reads clearly.

Implementation notes:
- Use `PhoneNumber.isValid` for the E.164 phone check.
- Use `TimeOfDay.isValid` for the `HH:MM` checks.
- Keep the schema messages expressive, but avoid re-encoding the regex inline.
- The new builder preset should return an `APPROVED` booking with the minimum stable fixture data required by the spec.
- If the existing booking builder lives in a different path, add the preset there rather than creating a parallel builder.

Verification:
- `pnpm test -- --runInBand` or the repo’s standard backend unit-test command for the touched scope.
- `pnpm type-check`
- Re-run the smell audit for the affected booking DTO and booking spec files.

Risks:
- The preset may need small helper adjustments if the booking builder currently assumes a different default status.
- Changing validation messages can break snapshot or string-assertion tests if they exist.

Definition of done:
- DTO validation no longer duplicates shared VO regex rules.
- `complete-booking.use-case.spec.ts` no longer owns a local approved-booking factory.
- Tests continue to pass with the new builder preset.

### Story 2 - Backend fixture and domain cleanup ✅ Done

Scope:
- TD18 BE-B1
- TD18 BE-B4
- TD18 BE-B5

Target files:
- `apps/backend/src/contexts/staff/domain/staff.aggregate.ts`
- `apps/backend/src/contexts/platform/domain/tenant.aggregate.ts`
- `apps/backend/src/contexts/customer/domain/customer.aggregate.ts`
- `apps/backend/src/contexts/staff/infrastructure/entities/staff.entity.ts`
- `apps/backend/src/contexts/platform/infrastructure/entities/tenant.entity.ts`
- `apps/backend/src/contexts/platform/infrastructure/entities/hotsite-config.entity.ts`
- `apps/backend/src/contexts/booking/infrastructure/entities/booking.entity.ts`
- `apps/backend/src/contexts/customer/infrastructure/entities/customer.entity.ts`
- `apps/backend/src/contexts/platform/application/use-cases/update-tenant-settings.use-case.ts`
- `apps/backend/src/contexts/staff/application/use-cases/invite-staff.use-case.ts`
- `apps/backend/src/contexts/customer/domain/customer.aggregate.ts`
- `apps/backend/src/contexts/booking/domain/booking.aggregate.ts`
- `apps/backend/src/contexts/booking/domain/service.aggregate.ts`

Work required:
1. Replace primitive aggregate props with shared value objects where those VOs already exist.
2. Add missing `XxxEntityBuilder` coverage for the entity set listed in the canonical inventory.
3. Move repeated trimming / normalization rules to the correct shared VO or shared utility boundary.
4. Update builders, reconstitution, and specs together so the domain contract stays aligned.

Implementation notes:
- Treat each aggregate field one at a time so the VO migration stays reviewable.
- When a value object already exists, prefer `create()` at the boundary and `reconstitute()` only for persistence hydration.
- If a builder is missing, add it alongside the affected entity and use it in the spec that needs it.
- For normalization, decide whether the rule belongs in the VO, the aggregate, or a shared utility before moving it.
- Keep composite IDs, persistence mappings, and DTOs consistent after the field type change.

Verification:
- Backend type-check.
- Focused unit tests for the touched aggregates, entities, and use cases.
- Any integration tests that load the affected persistence model.
- Re-run the smell audit for the changed backend area.

Risks:
- VO adoption can cascade into mapper and builder updates across nearby tests.
- Some fields may already be serialized or stored as primitives in persistence code, which will require a coordinated change.

Definition of done:
- Aggregates stop re-encoding validation already represented in shared VOs.
- The missing entity builders exist and are used in tests.
- Normalization logic is no longer duplicated across multiple use cases and aggregates.

### Story 3 - Backend spec-helper cleanup ✅ Done

Scope:
- TD18/TD20 BE-B3

Target files:
- `apps/backend/src/shared/request/request.interceptor.spec.ts`
- `apps/backend/src/shared/infrastructure/gcp-pubsub-event-bus.adapter.spec.ts`
- `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.spec.ts`
- `apps/backend/src/contexts/staff/infrastructure/controllers/staff.controller.spec.ts`
- `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts`
- `apps/backend/src/contexts/booking/application/use-cases/cancel-booking-as-customer.use-case.spec.ts`
- `apps/backend/src/contexts/customer/application/use-cases/search-customers.use-case.spec.ts`
- `apps/backend/src/contexts/notification/infrastructure/events/tenant-provisioned.handler.spec.ts`
- `apps/backend/src/contexts/notification/infrastructure/cross-context/notification-platform.adapter.spec.ts`
- `apps/backend/src/contexts/notification/infrastructure/delivery/email-delivery-channel.adapter.spec.ts`
- `apps/backend/src/contexts/notification/infrastructure/delivery/notification-dispatcher.adapter.spec.ts`
- `apps/backend/src/contexts/staff/infrastructure/events/tenant-provisioned.handler.spec.ts`
- `apps/backend/src/contexts/loyalty/infrastructure/cross-context/loyalty-platform.adapter.spec.ts`
- `apps/backend/src/contexts/loyalty/infrastructure/events/booking-completed.handler.spec.ts`
- `apps/backend/src/contexts/loyalty/application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case.spec.ts`

Work required:
1. Convert repeated local fixture helpers into builders or named presets where the setup is reused.
2. Remove one-off inline entity construction where a builder already exists or is being added.
3. Keep spec setup deterministic and idiomatic across backend contexts.

Implementation notes:
- Keep helper extraction local to the test domain when the setup is only used in one file.
- Promote repeated setup to a shared builder only when more than one spec benefits from it.
- Prefer small named presets over ad-hoc `make*` helpers when the fixture has a stable semantic meaning.
- Do not over-abstract test data that is only used once.

Verification:
- Targeted unit tests for each modified spec.
- Backend type-check.
- Compare the changed test files against the repo’s builder conventions to ensure consistency.

Risks:
- Over-abstracting a one-off test fixture can make the spec harder to read.
- Multiple specs may need coordinated updates if a helper gets replaced by a builder preset.

Definition of done:
- Repeated test fixture helpers are removed or replaced with builders.
- Spec files read as behavior tests instead of fixture factories.
- The backend test style is more uniform across contexts.

### Story 4 - BFF controller thinning and module naming ✅ Done

Scope:
- TD18/20 BFF-B1
- TD20 BFF-B2

Target files:
- `apps/bff/src/uploads/uploads.controller.ts`
- `apps/bff/src/services/services.public.controller.ts`
- `apps/bff/src/schedule/schedule-availability-summary.controller.ts`
- `apps/bff/src/customers/customers.controller.ts`
- `apps/bff/src/bookings/bookings.controller.ts`
- `apps/bff/src/auth/auth.controller.ts`
- `apps/bff/src/services/services.module.ts`

Work required:
1. Move orchestration, branching, and response shaping out of controllers.
2. Split auth flows into smaller helpers or use cases so the controller only delegates.
3. Move customer enrichment and upload key generation out of controller bodies.
4. Rename or relocate the `services/` module so the folder name matches the bounded-context rule.

Implementation notes:
- Start by identifying the shared branching or mapping logic that is repeated inside each controller.
- Prefer dedicated application services or mappers when the logic is transport-agnostic.
- Preserve controller signatures where possible so route contracts stay stable.
- If a helper is reused across multiple controller methods, extract it once rather than duplicating it.
- For the module naming drift, keep the implementation source of truth and the Nest module import path aligned.

Verification:
- BFF type-check.
- Focused controller/unit tests for the touched endpoints.
- Any route-level integration tests already present in the repo.
- Re-run the smell audit on the BFF subtree after the refactor.

Risks:
- Controller refactors can accidentally change authorization branching or response shape.
- Module moves can break imports in both tests and nested providers if the path changes without a full sweep.

Definition of done:
- Controllers are thin transport adapters.
- Role branching, token handling, and pagination shaping are not done directly in controller bodies.
- Module naming matches the repo’s bounded-context convention.

### Story 5 - Web safety and fetcher naming ✅ Done

Scope:
- TD18 WEB-W1
- TD20 WEB-W2
- TD18/20 WEB-W3

Target files:
- `apps/web/app/[slug]/page.tsx`
- `apps/web/components/ui/button.tsx`
- `apps/web/lib/api/auth.ts`
- `apps/web/lib/api/bff-client.ts`
- `apps/web/lib/api/bff-server.ts`
- `apps/web/lib/api/bookings.ts`
- `apps/web/lib/api/customers.ts`
- `apps/web/lib/api/errors.ts`
- `apps/web/lib/api/schedule.ts`
- `apps/web/lib/api/services.ts`
- `apps/web/lib/api/dashboard/bookings.ts`
- `apps/web/lib/api/dashboard/customers.ts`
- `apps/web/lib/api/dashboard/schedule.ts`
- `apps/web/lib/api/dashboard/services.ts`
- `apps/web/lib/api/dashboard/tenants.ts`

Work required:
1. Replace or centralize the `dangerouslySetInnerHTML` usage in the hotsite page.
2. Mark shared UI primitive props as readonly.
3. Rename `apps/web/lib/api/**` files to the correct bounded-context naming.
4. Update imports, barrels, and any affected tests in the same change.

Implementation notes:
- Treat `dangerouslySetInnerHTML` as a controlled exception only if the source is already sanitized and the sanitization path is explicit.
- Keep `button.tsx` aligned with the repo’s shared UI primitive conventions; this is a small but shared surface.
- Rename fetcher files together with their imports so the API tree stays searchable and consistent.
- Preserve the `bff-client` / `bff-server` transport helper split if the rename work touches those files.
- If a fetcher file is only a transport wrapper, keep the implementation thin and move feature-specific logic elsewhere.

Verification:
- `apps/web` type-check and unit tests.
- Any existing Playwright coverage for the hotsite or dashboard paths touched by the rename.
- Re-run the smell audit for the changed web area.

Risks:
- Web fetcher renames can create broad import churn.
- Sanitization changes in the hotsite tree can affect visible rendering if the content source is not fully understood.

Definition of done:
- The hotsite page no longer relies on raw HTML injection without a clear sanitization story.
- The shared button primitive follows the immutable-props convention.
- API fetcher naming matches the repo rules across dashboard and non-dashboard paths.

## Acceptance Criteria

- [x] Duplicate entries from TD18, TD19, and TD20 are consolidated into the canonical items above.
- [x] Historical items are clearly marked when they were only present in an earlier snapshot.
- [x] Low-risk fixes are grouped first, followed by larger refactors.
- [x] The plan is split into story-sized waves that can be implemented and reviewed independently.
- [x] Future smell-audit updates can point at this file as the single baseline source.

## Notes

1. The no-findings sections from the original TDs are preserved here as audit checkpoints, not backlog items.
2. This document is intended to replace the three separate smell-baseline files as the working reference for cleanup planning.
3. If a newer audit confirms that a historical item is still present, update this document instead of creating another snapshot file.
