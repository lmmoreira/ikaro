# TD09 — `apps/web/lib/api/dashboard/*.ts` type duplication & drift vs. `@ikaro/types`

## Status
- **Type**: Technical Debt / Type Duplication & Drift
- **Priority**: Medium (no live defect today — every affected fetcher has zero page/component consumers yet — but each will surface as a confusing bug or a wrong "fix" the first time a story builds a real page on top of it)
- **Context**: `apps/web/lib/api/dashboard/*.ts`, `packages/types/src/*.dto.ts`
- **Created**: 2026-06-22
- **Updated**: 2026-06-22

---

## Problem

Discovered while implementing `M13-S04` (BFF booking-detail endpoint for staff). `apps/web/lib/api/dashboard/bookings.ts` had its own locally-declared `BookingDetailResponse`/`BookingListItem`/`BookingListResponse`/`AddressDetail` instead of importing `StaffBookingDetailResponse`/`StaffBookingCardResponse`/`StaffBookingListResponse`/`Address` from `@ikaro/types`. It was scaffolded in `M13-S01` before those `@ikaro/types` shapes existed (`M13-S03` and `M13-S04` added them later) and nobody went back to reconcile it. That instance was fixed directly in the `M13-S04` PR.

A systematic grep across every other `apps/web/lib/api/dashboard/*.ts` file for local type names that collide with an existing `@ikaro/types` export of the same name found three more cases. Each has a different verdict — **this is not a uniform "swap to `@ikaro/types`" fix**:

### 1. `dashboard/services.ts` — real divergence, fix belongs to `M13-S05`
- Local `CreateServiceRequest`/`UpdateServiceRequest`: `{ priceAmount, durationMinutes, loyaltyPointsValue, ... }`
- `@ikaro/types`'s same-named exports (`packages/types/src/service.dto.ts`): `{ price, durationMinutes, loyaltyPoints, ... }`
- Same type name, different field names — not interchangeable.
- `M13-S05` ("BFF: staff service management endpoints") owns this BFF module and hasn't landed yet. It already re-verifies the `POST`/`PATCH /v1/services` contract from scratch, so it's the natural place to reconcile this rather than a standalone fix.

### 2. `dashboard/customers.ts` — safe, low-risk duplicate
- Local `CustomerProfileResponse`/`CustomerAddressResponse` is structurally near-identical to `@ikaro/types`'s `CustomerProfileResponse`/`Address` (`packages/types/src/customer.dto.ts`, `address.ts`).
- Only real difference: local `CustomerAddressResponse.neighborhood` is `string` (required); `Address.neighborhood` is `string | null` (optional).
- No live consumer yet (`useCustomerProfile.ts` has zero page/component callers in `apps/web/app` or `apps/web/components`).
- No story in the current `M13` plan owns building the page that would consume this — flagging here rather than attaching to a wrong story. Lowest risk of the four; a clean swap whenever it's next touched.

### 3. `dashboard/loyalty.ts` — `@ikaro/types` itself is stale, not the web file
- Local `LoyaltyBalanceResponse`: `{ currentPoints, nextExpiryDate, nextExpiryPoints }` — matches the real, live BFF contract (`apps/bff/src/loyalty/loyalty.types.ts`).
- `@ikaro/types`'s `LoyaltyBalanceResponse` (`packages/types/src/loyalty.dto.ts`): `{ tenantId, customerId, activePoints, entries }` — verified via repo-wide grep to have **zero real consumers** in `apps/backend`, `apps/bff`, or `apps/web`. Appears dead/superseded.
- The fix direction is reversed here: `@ikaro/types` needs cleanup (delete or correct the dead export) — naively pointing `dashboard/loyalty.ts` at the existing `@ikaro/types` export would silently break it.
- Most likely surfaced by `M13-S25` (`/dashboard/loyalty` — customer search + loyalty detail pages), the first story to build a real page on this fetcher.

### 4. `dashboard/staff.ts` — `@ikaro/types` itself is stale, not the web file
- Local `InviteStaffRequest`: `{ email, firstName, lastName, role }` — matches the live BFF schema (`apps/bff/src/staff/staff.controller.ts`'s `InviteStaffBodySchema` requires `firstName`/`lastName`).
- `@ikaro/types`'s `InviteStaffRequest` (`packages/types/src/staff.dto.ts`): `{ email, name, role }` — does not match what the BFF actually accepts today.
- `StaffResponse` and `StaffRole` are also redeclared locally alongside `@ikaro/types` exports of the same name, with smaller shape differences (`tenantId` presence, `name` nullability).
- Most likely surfaced by `M13-S32` (`/dashboard/team` list page) or `M13-S33` (invite member form) — whichever lands first and touches `dashboard/staff.ts`.

## Why this matters

None of these are live defects today — every affected fetcher (`services`, `customers`, `loyalty`, `staff`) is only wired into a TanStack Query hook with zero page/component callers, the same "scaffolded ahead of the real page" pattern that let `dashboard/bookings.ts` drift silently from `M13-S01` all the way to `M13-S04` before anyone noticed. But the first story that builds a real page on any of these hooks will hit one of two failure modes:
- A runtime field-name miss if it trusts the local type without checking the live BFF schema (`services`, `staff`).
- A silently wrong type if it "helpfully" swaps the import to `@ikaro/types` without first checking which side is actually correct (`loyalty`, `staff` — `@ikaro/types` is the stale one there, not the web file).

## Proposed fix (not yet scoped as stories)

Each case needs its own verification against the live BFF contract before touching anything — do not batch-fix these as one mechanical find-and-replace:

1. **`services`** — fold into `M13-S05`'s own discovery phase; it already re-verifies this exact contract end to end.
2. **`customers`** — swap `dashboard/customers.ts` to import `CustomerProfileResponse`/`Address` from `@ikaro/types`; adjust `Address.neighborhood` usage if needed. Standalone, low risk, can be done any time.
3. **`loyalty`** — confirm `@ikaro/types`'s `LoyaltyBalanceResponse` truly has no consumer (re-run the grep at fix time, not just trust this doc), then either delete it or correct it to the real shape; only then point `dashboard/loyalty.ts` at it.
4. **`staff`** — fix `@ikaro/types`'s `InviteStaffRequest`/`StaffResponse` to match the live `InviteStaffBodySchema`/the real BFF response first, then point `dashboard/staff.ts` at the corrected types.

**General rule worth adding to `docs/CODE_STANDARDS.md` or `docs/24-BFF_ARCHITECTURE.md` while resolving any of these:** before declaring a request/response type in `apps/web/lib/api/**`, grep `@ikaro/types` for an export of the same (or a similar) name first. If one already exists but the shape looks wrong, verify which side actually matches the live endpoint before assuming the shared package is the source of truth — it sometimes isn't.

## Acceptance criteria

- [ ] `dashboard/customers.ts` imports `CustomerProfileResponse`/`Address` from `@ikaro/types`; local duplicates removed
- [ ] `@ikaro/types`'s `LoyaltyBalanceResponse` resolved (deleted or corrected to match the live BFF contract); `dashboard/loyalty.ts` points at the shared type
- [ ] `@ikaro/types`'s `InviteStaffRequest`/`StaffResponse` corrected to match `InviteStaffBodySchema`/the real BFF response; `dashboard/staff.ts` points at the shared types
- [ ] `services` divergence resolved as part of `M13-S05`
- [ ] Re-run the grep this TD is based on (`apps/web/lib/api/dashboard/*.ts` interface names vs. `@ikaro/types` exports) once all four are resolved, to confirm no remaining collisions
