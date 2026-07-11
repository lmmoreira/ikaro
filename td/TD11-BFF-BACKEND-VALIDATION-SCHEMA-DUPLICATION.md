# TD11 — BFF and backend independently re-validate the same business rules

## Status
- **Type**: Technical Debt / Architecture
- **Priority**: Low
- **Context**: `apps/bff/src/features/platform/tenant-settings.controller.ts`, `apps/backend/src/contexts/platform/application/dtos/update-tenant-settings.dto.ts`; same pattern in `apps/bff/src/features/platform/hotsite-admin.controller.ts` vs. `apps/backend/src/contexts/platform/application/dtos/update-hotsite-content.dto.ts`; also `apps/bff/src/features/booking/bookings.controller.ts` and `apps/bff/src/features/customer/customers.controller.ts`, each defining their own `AddressSchema` (+ inline `contactPhone`/`phone`/`contactEmail` checks) duplicating the backend's `Address`/`PhoneNumber`/`Email` VOs — found during TD23 Story 10 discovery (2026-07-11), not previously catalogued here. (Paths updated to post-TD-21 domain-slice locations; originally recorded as `apps/bff/src/platform/...`.)
- **Created**: 2026-06-24

## Problem

The BFF and backend each define their own Zod schema to validate the same request body. For `tenants/settings`, this only became visible as a literal SonarCloud finding after M13-S10 normalized the backend's `tenants.settings` JSONB from snake_case to camelCase: once both layers spoke the same casing, their schemas became textually near-identical (43%/59% duplication on the two files), tripping the 3% new-code duplication gate. Fixed for that PR with a `sonar.cpd.exclusions` entry — see `sonar-project.properties`.

The same pattern already exists for hotsite content (`HotsiteAdminController`'s branding/layout/seo schema vs. the backend's `update-hotsite-content.dto.ts`) — it just stays under the duplication threshold there because the schema is large enough that the percentage doesn't cross 3%, not because the architecture is different.

This is a real "two sources of truth" risk, independent of the SonarCloud metric: if a business rule changes on one side (e.g. backend extends `cancellationWindowHours`'s max from 720 to 1000) and the BFF's copy isn't updated in the same PR, the BFF will reject valid requests with a stale, wrong error before they ever reach the backend. Nothing currently catches this drift automatically.

TD23's discovery (2026-07-11) found this problem is worse than originally catalogued: `bookings.controller.ts` and `customers.controller.ts` each define their own `AddressSchema` (identical field shape, no country-awareness) plus their own `contactPhone`/`phone` E.164 regex and `contactEmail` checks — duplicating the backend's `Address`/`PhoneNumber`/`Email` VOs independently of the tenant-settings/hotsite instances above. That's four BFF-side Address copies total (the fourth being `BusinessInfoAddressSchema` in `tenant-settings.controller.ts`) plus at least three independent phone/email format copies. TD23 Story 10 assigns the backend's own error codes to these copies as an interim consistency fix (same code regardless of which layer rejects the request) — it does not deduplicate the schemas themselves, that remains this TD's scope.

Also found: `tenant-settings.controller.ts`'s `BusinessInfoSchema.phone`/`.email` fields have **no** format validation at all in the BFF today (bare `z.string().nullable()`), unlike every other phone/email field in the BFF — an invalid business phone/email currently round-trips to the backend before being rejected there. When this TD's shared-schema package lands, this gap should be closed for real as part of the migration, not patched with another ad-hoc regex copy in the interim.

## Why not fixed now

Properly deduplicating means extracting the shared Zod schema into a new package both `apps/backend` and `apps/bff` import — not `@ikaro/types` (that's the BFF→frontend contract; backend importing it would violate the anti-pattern already in `docs/ANTI_PATTERNS.md` about coupling the backend domain to the frontend-facing shape). A new package with real runtime code (Zod schemas execute, they're not type-only) needs the full treatment already documented for `packages/*` runtime packages: a `build` script compiling to `dist/`, a root `postinstall` so `dist/` is fresh locally, and **both apps' Dockerfiles updated** to build it before `pnpm deploy --prod` (a previous package skipped this and broke production with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). That's new package scaffolding + build-chain wiring + two Dockerfile changes + verification — disproportionate to bundle into the PR that happened to surface the metric, and it should cover hotsite too for consistency rather than fixing one instance ad hoc.

## Proposed fix (not yet scoped as a story)

1. Decide where shared backend↔BFF validation schemas should live (new package, e.g. `packages/contracts` or `packages/validation` — name TBD) and confirm it's distinct in purpose from `@ikaro/types`.
2. Add the package with compiled `dist/` output, `build` script, `postinstall`, and wire both `apps/backend/Dockerfile` and `apps/bff/Dockerfile` to build it before deploy.
3. Migrate `update-tenant-settings.dto.ts` + `tenant-settings.controller.ts`'s schemas to import from the shared package; remove the `sonar.cpd.exclusions` entry once duplication is gone for real.
4. Migrate `update-hotsite-content.dto.ts` + `hotsite-admin.controller.ts`'s schemas the same way for consistency.
5. Decide whether the shared schema's defaults/refinements differ at all between the two layers (e.g. does the BFF need `.strict()` if the backend doesn't, or vice versa) before assuming a single export works for both call sites unmodified.
6. Migrate `bookings.controller.ts` and `customers.controller.ts`'s `AddressSchema` copies (and their `contactPhone`/`phone`/`contactEmail` checks) the same way — 4 Address copies + 3+ phone/email copies total once fully centralized.
7. Include `businessInfo.phone`/`businessInfo.email` format validation in the migrated shared schema (currently unvalidated at the BFF layer — see Problem section) rather than leaving that gap in place.

## Acceptance criteria (when this is picked up)

- [ ] Tenant settings, hotsite content, booking, and customer-profile schemas have exactly one source of truth for business rules (min/max, regex, enums), imported by both `apps/backend` and `apps/bff`
- [ ] `sonar.cpd.exclusions` entry for `tenant-settings.controller.ts` removed
- [ ] New shared package builds correctly in both apps' Docker images; a no-op `docker run` boot smoke test (per TD06) passes for both
- [ ] No behavior change to either endpoint's validation (same accept/reject decisions as before, verified by existing test suites) — except `businessInfo.phone`/`.email` gaining format validation for the first time, which is a deliberate bug fix, not a regression
- [ ] `businessInfo.phone`/`businessInfo.email` reject invalid format at the BFF, matching every other phone/email field
