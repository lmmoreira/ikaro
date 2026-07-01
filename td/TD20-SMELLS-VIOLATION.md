# TD20 — Repo Smells Violations Baseline

## Status
- **Type**: Technical Debt / Audit Baseline
- **Priority**: Medium
- **Scope**: whole repo - `apps/backend`, `apps/bff`, `apps/web`
- **Created**: 2026-07-01

## Purpose

This document records the current `bad-smell-audit` baseline so future story work can distinguish
new regressions from long-standing repository drift.

It is a companion inventory to TD18, but kept as a separate snapshot so the branch history can
track the latest scan results and the exact file/line locations that were confirmed on this branch.

## Snapshot

- **Scan**: `bad-smell-audit`
- **Date**: `2026-07-01`
- **Branch**: `feat/m13-s23`

## Summary

The latest repo-wide audit reported:
- **Backend**: 24 issues
- **BFF**: 13 issues
- **Web**: 10 issues
- **Total**: 47 issues

The findings are structural and pre-existing. They do not appear to be introduced by the service
work in this branch.

## Backend

### BE-1 - Aggregate props typed as plain primitives when a shared VO exists

(none found)

### BE-2 - Duplicated `isValidXxx` / inline validation

(none found)

### BE-3 - `makeXxx()` helpers / inline entity construction in tests

The current baseline still has a large number of test-local helpers named `make*` in spec files.
These do not represent production defects, but they are still part of the repo smell baseline.

- [ ] `apps/backend/src/shared/request/request.interceptor.spec.ts:8` - `function makeContext(...)`
- [ ] `apps/backend/src/shared/guards/manager-role.guard.spec.ts:4` - `function makeContext(...)`
- [ ] `apps/backend/src/shared/guards/staff-or-manager-role.guard.spec.ts:4` - `function makeContext(...)`
- [ ] `apps/backend/src/shared/guards/customer-role.guard.spec.ts:4` - `function makeContext(...)`
- [ ] `apps/backend/src/shared/guards/any-authenticated-role.guard.spec.ts:4` - `function makeContext(...)`
- [ ] `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.spec.ts:17` - `function makeConfig(...)`
- [ ] `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.spec.ts:23` - `function makeService(...)`
- [ ] `apps/backend/src/shared/infrastructure/gcp-pubsub-event-bus.adapter.spec.ts:49` - `function makeConfigService(...)`
- [ ] `apps/backend/src/contexts/notification/infrastructure/events/tenant-provisioned.handler.spec.ts:11` - `function makeEvent(...)`
- [ ] `apps/backend/src/contexts/notification/infrastructure/cross-context/notification-platform.adapter.spec.ts:8` - `function makeTenantResult(...)`
- [ ] `apps/backend/src/contexts/notification/infrastructure/delivery/email-delivery-channel.adapter.spec.ts:9` - `function makeAdapter(...)`
- [ ] `apps/backend/src/contexts/notification/infrastructure/delivery/notification-dispatcher.adapter.spec.ts:14` - `function makeChannel(...)`
- [ ] `apps/backend/src/contexts/staff/infrastructure/controllers/staff.controller.spec.ts:19` - `function makeController(...)`
- [ ] `apps/backend/src/contexts/staff/infrastructure/events/tenant-provisioned.handler.spec.ts:11` - `function makeEvent(...)`
- [ ] `apps/backend/src/contexts/staff/infrastructure/events/tenant-provisioned.handler.spec.ts:20` - `function makeHandler(...)`
- [ ] `apps/backend/src/contexts/loyalty/infrastructure/cross-context/loyalty-platform.adapter.spec.ts:8` - `function makeTenantResult(...)`
- [ ] `apps/backend/src/contexts/loyalty/infrastructure/events/booking-completed.handler.spec.ts:11` - `function makeEvent(...)`
- [ ] `apps/backend/src/contexts/platform/infrastructure/adapters/frontend-revalidation.adapter.spec.ts:4` - `function makeConfigService(...)`
- [ ] `apps/backend/src/contexts/customer/application/use-cases/search-customers.use-case.spec.ts:16` - `function makeUseCase(...)`
- [ ] `apps/backend/src/contexts/booking/application/use-cases/cancel-booking-as-customer.use-case.spec.ts:28` - `function makeUseCase(...)`
- [ ] `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts:38` - `function makeApprovedBooking(...)`
- [ ] `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts:59` - `function makeDto(...)`
- [ ] `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.spec.ts:83` - `function makeUseCase(...)`
- [ ] `apps/backend/src/contexts/loyalty/application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case.spec.ts:23` - `function makeDto(...)`

Why it matters:
- these helpers are scattered across many specs
- the repository prefers dedicated builders and more uniform setup patterns
- it increases maintenance cost when test fixtures need to change

### BE-4 - Missing `XxxEntityBuilder`

(none found)

### BE-5 - Seed DDL

(none found)

### BE-6 - Duplicated utilities

(none found)

### BE-7 - Builder fields without setters

(none found)

## BFF

### BFF-1 - Business logic in controllers

The repo still has controllers doing orchestration and data shaping that should live in services or
use-cases.

- [ ] `apps/bff/src/bookings/bookings.controller.ts:232` - `generateAttachmentSignedUrl()` branches across user, guest, and anonymous flows, including token decoding and tenant resolution.
- [ ] `apps/bff/src/bookings/bookings.controller.ts:303` - `list()` computes pagination offset and date-range parameters inline, then reshapes the response by role.
- [ ] `apps/bff/src/bookings/bookings.controller.ts:342` - `getOne()` branches on role and conditionally fetches loyalty balance before mapping the response.
- [ ] `apps/bff/src/bookings/bookings.controller.ts:404` - `cancel()` routes to different backend endpoints based on the caller role.
- [ ] `apps/bff/src/auth/auth.controller.ts:61` - `handleGoogleCallback()` contains a multi-branch login flow split by staff/customer and tenant slug presence.
- [ ] `apps/bff/src/auth/auth.controller.ts:98` - `getStaffTenants()` filters, de-duplicates, and maps tenant data in the controller.
- [ ] `apps/bff/src/auth/auth.controller.ts:125` - `switchStaffTenant()` performs active-staff lookup, throws `ForbiddenException`, and issues the JWT in-controller.
- [ ] `apps/bff/src/auth/auth.controller.ts:163` - `switchTenant()` does the same tenant selection/orchestration work for customers.
- [ ] `apps/bff/src/auth/auth.controller.ts:203` - `devLogin()` branches on env flags and actor type, validates email length, and orchestrates link-or-create logic inline.
- [ ] `apps/bff/src/customers/customers.controller.ts:48` - `searchCustomers()` enriches each customer with a loyalty-balance call inside the controller.
- [ ] `apps/bff/src/customers/customers.controller.ts:86` - `getTenants()` batches tenant and balance reads, then assembles the final options list in-controller.
- [ ] `apps/bff/src/uploads/uploads.controller.ts:19` - `getSignedUrl()` does inline content-type branching and uses `Date.now()` to build the storage key.

Why it matters:
- controllers are acting as application services
- branching and mapping logic becomes duplicated and harder to test
- the repo prefers thinner controllers that forward work to dedicated services/use-cases

### BFF-2 - Module/controller naming drift

- [ ] `apps/bff/src/services/services.module.ts:1` - `services/` is an aggregate-name module folder; `Service` belongs inside the Booking bounded context.

### BFF-3 - Hotsite public controller response types

(none found)

### BFF-4 - Cross-app boundary violation

(none found)

## Web

### WEB-1 - `dangerouslySetInnerHTML` without sanitization

(none found)

### WEB-2 - Non-`readonly` fields in React component prop interfaces

- [ ] `apps/web/components/ui/button.tsx:35` - `asChild?: boolean` is not `readonly` in `ButtonProps`.

Why it matters:
- SonarCloud flags mutable props on component interfaces
- this is a repo-wide UI primitive that still predates the stricter convention

### WEB-3 - CSS custom property type assertions

(none found)

### WEB-4 - Component spec files missing `@vitest-environment jsdom`

(none found)

### WEB-5 - Page/layout unit tests

(none found)

### WEB-6 - Bare Node.js built-in imports without `node:` prefix

(none found)

### WEB-7 - Fetcher files not mirroring bounded-context names

These fetcher files still mirror aggregate or generic names instead of bounded-context names.

- [ ] `apps/web/lib/api/bookings.ts:1` - `bookings.ts` mirrors an aggregate/collection name; it should mirror `booking`.
- [ ] `apps/web/lib/api/customers.ts:1` - `customers.ts` mirrors an aggregate/collection name; it should mirror `customer`.
- [ ] `apps/web/lib/api/schedule.ts:1` - `schedule.ts` does not mirror a bounded-context name from CLAUDE.md.
- [ ] `apps/web/lib/api/services.ts:1` - `services.ts` mirrors an aggregate/collection name; it should mirror `booking` instead of `Service`.
- [ ] `apps/web/lib/api/dashboard/bookings.ts:1` - `bookings.ts` mirrors an aggregate/collection name; it should mirror `booking`.
- [ ] `apps/web/lib/api/dashboard/customers.ts:1` - `customers.ts` mirrors an aggregate/collection name; it should mirror `customer`.
- [ ] `apps/web/lib/api/dashboard/schedule.ts:1` - `schedule.ts` does not mirror a bounded-context name from CLAUDE.md.
- [ ] `apps/web/lib/api/dashboard/services.ts:1` - `services.ts` mirrors an aggregate/collection name; it should mirror `booking` instead of `Service`.
- [ ] `apps/web/lib/api/dashboard/tenants.ts:1` - `tenants.ts` maps to the `Tenant` aggregate inside `platform`, not a bounded-context name.

Why it matters:
- fetcher names drift away from the bounded-context model used by the repo
- this makes the API layer harder to scan and maintain

## Notes

1. This TD is a baseline snapshot, not a fix plan.
2. Future story work should re-run `bad-smell-audit` on the touched area and update this TD if the
   baseline changes.
3. The current service story changes are not the source of these findings.
