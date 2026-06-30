# TD18 — Pre-PR Smells Violations Baseline

## Status
- **Type**: Technical Debt / Audit Baseline
- **Priority**: Medium
- **Scope**: whole repo — `apps/backend`, `apps/bff`, `apps/web`
- **Created**: 2026-06-30

---

## Problem

The repo-wide `bad-smell-audit` pass surfaced a large set of **pre-existing** findings that are not specific to a single story branch.

This TD exists so future story work can treat them as an explicit baseline instead of re-discovering the same violations during pre-PR checks.

The audit reported **161 total issues** across:
- backend domain and test hygiene
- BFF controller structure
- web rendering and fetcher naming
- a handful of repo-wide conventions that were already present before the current story work

---

## What This TD Covers

This document groups the baseline violations into the same categories used by `bad-smell-audit`, with examples from the repo scan.

It is intentionally a **tracking document**, not a fix plan for one story.

---

## Backend

### BE-1 — Aggregate props still use primitives where shared VOs exist

Examples found:
- `apps/backend/src/contexts/staff/domain/staff.aggregate.ts:73` - `email: string`
- `apps/backend/src/contexts/staff/domain/staff.aggregate.ts:107` - `email: string`
- `apps/backend/src/contexts/platform/domain/tenant.aggregate.ts:56` - `slug: string`
- `apps/backend/src/contexts/customer/domain/customer.aggregate.ts:56` - `email: string`
- `apps/backend/src/contexts/customer/domain/customer.aggregate.ts:80` - `phone: string`

Why it matters:
- shared value objects exist for these fields
- primitive usage keeps validation and normalization duplicated
- it makes aggregate contracts inconsistent across bounded contexts

### BE-2 — Inline validation helpers outside `src/shared/value-objects/`

Audit result:
- no direct `isValidXxx` hits were reported in the scan

This category is included here because it is part of the baseline audit set and should be re-checked on future changes.

### BE-3 — Test helpers and inline entity construction in specs

Examples found:
- `apps/backend/src/shared/request/request.interceptor.spec.ts:8`
- `apps/backend/src/shared/infrastructure/gcp-pubsub-event-bus.adapter.spec.ts:49`
- `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.spec.ts:17`
- `apps/backend/src/contexts/staff/infrastructure/controllers/staff.controller.spec.ts:19`
- `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts:38`

Why it matters:
- factory-style helpers are still spread across many specs
- some tests construct domain/entity objects inline instead of using builders
- future refactors should move toward the repo’s builder pattern

### BE-4 — Missing `XxxEntityBuilder` coverage

Examples found:
- `apps/backend/src/contexts/staff/infrastructure/entities/staff.entity.ts`
- `apps/backend/src/contexts/platform/infrastructure/entities/tenant.entity.ts`
- `apps/backend/src/contexts/platform/infrastructure/entities/hotsite-config.entity.ts`
- `apps/backend/src/contexts/booking/infrastructure/entities/booking.entity.ts`
- `apps/backend/src/contexts/customer/infrastructure/entities/customer.entity.ts`

Why it matters:
- tests are missing the builder abstraction expected by the repo rules
- this keeps test setup inconsistent across contexts

### BE-5 — Seed DDL

Audit result:
- no DDL was found in the seed path during the scan

### BE-6 — Duplicated utilities / normalization logic

Examples found:
- `apps/backend/src/contexts/platform/application/use-cases/update-tenant-settings.use-case.ts:32` - `deepMerge`
- `apps/backend/src/contexts/staff/application/use-cases/invite-staff.use-case.ts:31` - `email.toLowerCase().trim()`
- `apps/backend/src/contexts/customer/domain/customer.aggregate.ts:68` - `name.trim()`
- `apps/backend/src/contexts/booking/domain/booking.aggregate.ts:259` - `contactName.trim()`
- `apps/backend/src/contexts/booking/domain/service.aggregate.ts:72` - `name?.trim()`

Why it matters:
- normalization logic is repeated in multiple places
- some of this belongs in shared value objects or shared utilities
- it increases the risk of inconsistent behavior over time

### BE-7 — Builder fields without setters

Audit result:
- no builder readonly-field violations were reported in the scan

---

## BFF

### BFF-1 — Business logic still lives in controllers

Examples found:
- `apps/bff/src/uploads/uploads.controller.ts:20`
- `apps/bff/src/services/services.public.controller.ts:16`
- `apps/bff/src/schedule/schedule-availability-summary.controller.ts:27`
- `apps/bff/src/customers/customers.controller.ts:52`
- `apps/bff/src/bookings/bookings.controller.ts:241`
- `apps/bff/src/auth/auth.controller.ts:65`

Why it matters:
- controllers are doing orchestration and branching work that should be pushed down into services or use cases
- this makes controller code harder to test and easier to drift

### BFF-2 — Module/controller naming drift

Audit result:
- no new naming violation was flagged during this scan

### BFF-3 — Hotsite public controller response types

Audit result:
- no response-type violations were flagged during this scan

### BFF-4 — Cross-app import boundary

Audit result:
- no `apps/backend/src/contexts/*` imports were flagged inside `apps/bff/src/`

---

## Web

### WEB-1 — `dangerouslySetInnerHTML` still exists in the hotsite tree

Example found:
- `apps/web/app/[slug]/page.tsx:73`

Why it matters:
- the hotsite page uses raw HTML injection
- this is acceptable only where the value is explicitly sanitized
- it should be kept under periodic review as a high-risk surface

### WEB-2 — Non-readonly component props

Audit result:
- no new prop-readonly violations were reported in the changed dashboard components

### WEB-3 — CSS custom property type assertions

Audit result:
- no hits were reported in the scan

### WEB-4 — Component spec files missing `@vitest-environment jsdom`

Audit result:
- no hits were reported in the scan

### WEB-5 — Page/layout unit tests

Audit result:
- no page/layout sibling spec violations were reported in the scan

### WEB-6 — Bare Node.js built-in imports

Audit result:
- no hits were reported in the scan

### WEB-7 — Fetcher naming drift in `apps/web/lib/api/`

Examples found:
- `apps/web/lib/api/auth.ts`
- `apps/web/lib/api/bff-client.ts`
- `apps/web/lib/api/bff-server.ts`
- `apps/web/lib/api/bookings.ts`
- `apps/web/lib/api/customers.ts`
- `apps/web/lib/api/errors.ts`
- `apps/web/lib/api/schedule.ts`
- `apps/web/lib/api/services.ts`

Why it matters:
- these filenames do not follow the bounded-context naming convention used by the repo rules
- the audit treats them as baseline structure drift

---

## Summary

This TD records the known pre-existing smell baseline observed on 2026-06-30.

Current audit snapshot:
- **Backend issues**: many, mostly structural and historical
- **BFF issues**: many controller-structure concerns
- **Web issues**: a small number of high-signal findings plus legacy naming drift
- **Total**: **161 issues**

---

## Notes for Future Work

1. Treat this document as a baseline inventory for future refactors.
2. When a story touches one of these files, re-run the audit for the touched area.
3. Prefer story-specific fixes over broad cleanup unless the cleanup is the story itself.
4. If a future story resolves one of these items, update this TD with the reduced baseline.
