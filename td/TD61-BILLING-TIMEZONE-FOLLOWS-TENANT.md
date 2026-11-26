# TD61 — BILLING-TIMEZONE-FOLLOWS-TENANT

## Status

- **Type**: Technical Debt / Cross-context contract
- **Priority**: Medium (the gap only bites a tenant that changes its timezone after signing up; the effect is a boundary off by the offset between the two zones, up to several hours, on the one Billing date another context compares today: the BOOKING `bookableUntil` cap)
- **Context**: Billing (cap derivation, the removal guard's input), Booking (the cap's consumers)
- **Created**: 2026-11-26 (rewritten the same day: the first draft missed decision 47)
- **Discovered**: M26-S18b PR #847 review: CodeRabbit's finding on `apps/backend/src/contexts/booking/application/use-cases/update-availability-alert.use-case.ts` (the `bookableUntil` cap date is derived in the subscription's timezone, the alert check reads the tenant's). Declined in that PR with a documented limitation in `docs/BUSINESS_LOGIC_REFERENCE.md` § The billing `bookableUntil` cap.
- **Decision status**: One story, recommended direction already chosen (the boundary crosses the context boundary as an instant). Its `/story-discovery` confirms it with the user and settles one product question (below) before any code. Because M26-S19 builds on the cap's date contract, it is far cheaper **before M26-S19 starts**.
- **Related**: `docs/discovery/tenant-billing/tenant-billing.md` decision 47 and decision 119; `docs/DOMAIN_MODEL.md` § Aggregate: Subscription (`timezone`: "snapshot of the tenant timezone, IMMUTABLE"); `docs/TENANTS_SETTINGS_SCHEMA.md` (`businessHours.timezone`); `docs/BUSINESS_LOGIC_REFERENCE.md` § The billing `bookableUntil` cap; M26-S18a, M26-S18b (PR #847), M26-S19

## Problem

`Subscription.timezone` is copied once, from the `TenantProvisioned` event, when Billing creates the trial subscription (`create-trial-subscription.use-case.ts`, `tenant-provisioned-billing.handler.ts:38`) and is a `readonly` field of the aggregate (`subscription.aggregate.ts:76`). **This is a documented decision, not an oversight:** decision 47 of the tenant-billing discovery says "`billing.subscriptions.timezone` is copied from `TenantProvisioned` at creation and is immutable; period boundaries are local midnight in it; Billing never reads Platform settings", and `docs/DOMAIN_MODEL.md` § Aggregate: Subscription repeats it. Billing keeps its own calendar on purpose, so Billing's own dates (periods, due dates, trial end) are consistent inside Billing.

The tenant's own timezone, `tenants.settings.businessHours.timezone`, is editable (`packages/validation/src/tenant-settings.ts:45`, the dashboard's settings form), and Platform publishes no event when it changes.

Until M26-S18b every Billing date stayed inside Billing, so the two calendars never met. The `bookableUntil` cap is the **first Billing date another context compares in its own calendar**: Billing derives a `YYYY-MM-DD` in the subscription's zone, Booking turns it into a boundary at the local midnight of the tenant's **current** zone. After a timezone change the boundary can sit up to the offset difference away from the instant Billing meant, and a commitment ending in that gap could later block the removal. S18a's removal guard has the same shape (it takes an effective date and converts it with the tenant's timezone).

The defect is therefore the **contract**, not Billing's timezone: a local date crossed a context boundary without a timezone owner both sides agree on.

## Chosen approach (decided in this session, 2026-11-26)

The boundary crosses the context boundary as an **instant**. Billing's own item end (`SubscriptionItem.endsAt`, local midnight in Billing's zone) is already an instant: the cap and the removal guard carry it, Booking compares instants and never converts a Billing date with its own zone, and decision 47 stays true. No event, consumer, migration or infrastructure rollout is needed. The date a manager reads on the Plano tab stays in Billing's calendar, as decision 47 accepted.

**Open question for the story's discovery (the user decides):** is "the manager reads the removal date in Billing's calendar" acceptable after a tenant has changed its timezone? If the product instead wants Billing's dates to follow the tenant's current zone, a larger change is needed and is not drafted here: Platform publishes a `TenantTimezoneChanged` event (a new Pub/Sub topic, the playbook's multi-step Foundation rollout), Billing consumes it and changes the subscription's timezone (reversing decision 47, with a decided policy for dates and charges already computed: apply from the next period or re-anchor), and a repair aligns subscriptions that already drifted. `/create-story` adds those stories only if discovery chooses that.

**Rejected:** deriving every Billing date in the tenant's zone at read time (Billing would read Platform settings on every money-date computation, against decision 47); a Billing-side cache of the tenant timezone (a second copy that drifts the same way).

## Stories

### Story 0 — The cap and the removal guard boundary travel as instants 🟡

**Agent:** backend-ts
**Complexity:** M
**Docs to load:** `docs/BUSINESS_LOGIC_REFERENCE.md` § The billing `bookableUntil` cap and § Booking — Booking Window, `docs/DOMAIN_MODEL.md` § Entry point: `TenantAccessPort` and § Aggregate: Subscription, `docs/USE_CASES.md` UC-136 A11, `docs/LOCK_CATALOG.md` § Billing locks (B-U1), `docs/discovery/tenant-billing/tenant-billing.md` decisions 47 and 119, `docs/ENGINEERING_RULES_SHARED.md` § Re-check a same-file documented invariant
**Dependencies:** none (ideally lands before M26-S19)
**Pattern:** plain composition: an instant replaces the `YYYY-MM-DD` at the one contract that crosses Billing to Booking; no new abstraction.

**Description:**
`Subscription.bookableUntil(now)` returns the **instant** the BOOKING entitlement ends (the end of the latest covering item, or the trial end), as an ISO-8601 UTC string, instead of a date derived in the subscription's zone. `TenantAccess.bookableUntil` and `TenantAccessPort.getBookableUntil` carry that instant. Booking's pure rule compares an end instant with it directly (`end > bookableUntil` is refused; an end equal to it is accepted, the same rule as today); the display clamps derive the whole tenant-local days from today to that instant in the tenant's current zone (`daysUntilBookableUntil`); the recurring rule refuses a schedule when the end of its `endsOn` local day, or the end of its last occurrence, is after the instant. S18a's `GetBookingFeatureRemovalImpactUseCase` takes the boundary **instant** (the plan save passes the removal item's `endsAt`) instead of an effective date; its result and the `BILLING_FEATURE_IN_USE` params keep `effectiveFrom` as a date for the manager's display, derived in Billing's zone. The schedule blocker query compares the end of the `endsOn` local day with the instant. The documented limitation note in `docs/BUSINESS_LOGIC_REFERENCE.md` and the `TENANTS_SETTINGS_SCHEMA.md` timezone note are removed, and UC-136 A11, `docs/DOMAIN_MODEL.md` § Entry point and the M26-S19 plan text are updated to the instant contract.

**Backend use case steps:**
1. `Subscription.bookableUntil(now)`: return `entitlementEndsAt('BOOKING', now)` as an ISO instant (no zone conversion).
2. `assertEndsWithinBookableUntil`, `assertTermWithinBookableUntil`, `daysUntilBookableUntil`, `clampAdvanceDaysToBookableUntil`: take the instant; the term rule uses the end of the `endsOn` local day in the tenant's zone.
3. `GetBookingFeatureRemovalImpactUseCase(tenantId, boundary: Date)` and its read model: schedules block when the end of the `endsOn` local day is after the boundary; bookings block when `scheduled_end_at` is after it.

**Backend HTTP surface:** none (internal ports only; no response carries the cap).
**New migration / i18n keys / env vars / feature flags:** none.

**Files to create/modify:**
- `apps/backend/src/contexts/billing/domain/subscription.aggregate.ts` (+ `.booking-cap.spec.ts`) (modify)
- `apps/backend/src/shared/ports/tenant-access.port.ts`, `apps/backend/src/contexts/billing/application/use-cases/get-tenant-access.use-case.ts`, `get-bookable-until.use-case.ts` (+ specs) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/bookable-until.helpers.ts`, `apps/backend/src/shared/utils/bookable-until-days.ts` (+ specs) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/get-booking-feature-removal-impact.use-case.ts`, `apps/backend/src/contexts/booking/application/ports/feature-removal-blockers-repository.port.ts`, `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-feature-removal-blockers.repository.ts`, `apps/backend/src/contexts/billing/application/ports/billing-booking.port.ts` and its adapter (+ specs, integration specs) (modify)
- every cap consumer's spec that builds a `bookableUntil` date (the booking, reschedule, recurring, alert, manifest, service and reschedule-options specs) (modify)
- `docs/BUSINESS_LOGIC_REFERENCE.md`, `docs/DOMAIN_MODEL.md`, `docs/USE_CASES.md`, `docs/TENANTS_SETTINGS_SCHEMA.md`, `docs/LOCK_CATALOG.md` (modify), `plan/M26-TENANT-BILLING-COLLECTION-LAUNCH.md` S19 text (modify)

**Acceptance criteria — product:**
- [ ] After a tenant edits its timezone, the cap's boundary is still the instant Billing's removal takes effect, and no commitment the cap accepted can block the removal.
- [ ] The date the manager reads for a pending removal is unchanged (Billing's calendar), or the story's discovery records the user's different decision.

**Acceptance criteria — technical:**
- Unit:
  - [ ] the pure rule over instants: an end equal to the boundary is accepted, a millisecond later is refused, whatever the tenant's zone (table over São Paulo, Tokyo and UTC)
  - [ ] the display clamp counts whole tenant-local days from today to the instant, and is 0 once the instant is past
  - [ ] the recurring term and the removal guard agree on the boundary for a tenant whose zone differs from Billing's (a named case that fails on the date contract)
- Integration:
  - [ ] a tenant whose timezone was edited after provisioning: a booking ending after Billing's instant is refused and one ending before it is accepted; the removal guard counts the same set
- Tenant isolation:
  - [ ] one tenant's pending removal never caps another
- E2E: none — covered by integration
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean, `pnpm architecture-check` clean
