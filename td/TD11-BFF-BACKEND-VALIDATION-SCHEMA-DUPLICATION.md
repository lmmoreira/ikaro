# TD11 — BFF and backend independently re-validate the same business rules

## Status
- **Type**: Technical Debt / Architecture
- **Priority**: Low
- **Context**: `apps/bff/src/platform/tenant-settings.controller.ts`, `apps/backend/src/contexts/platform/application/dtos/update-tenant-settings.dto.ts`; same pattern in `apps/bff/src/platform/hotsite-admin.controller.ts` vs. `apps/backend/src/contexts/platform/application/dtos/update-hotsite-content.dto.ts`
- **Created**: 2026-06-24

## Problem

The BFF and backend each define their own Zod schema to validate the same request body. For `tenants/settings`, this only became visible as a literal SonarCloud finding after M13-S10 normalized the backend's `tenants.settings` JSONB from snake_case to camelCase: once both layers spoke the same casing, their schemas became textually near-identical (43%/59% duplication on the two files), tripping the 3% new-code duplication gate. Fixed for that PR with a `sonar.cpd.exclusions` entry — see `sonar-project.properties`.

The same pattern already exists for hotsite content (`HotsiteAdminController`'s branding/layout/seo schema vs. the backend's `update-hotsite-content.dto.ts`) — it just stays under the duplication threshold there because the schema is large enough that the percentage doesn't cross 3%, not because the architecture is different.

This is a real "two sources of truth" risk, independent of the SonarCloud metric: if a business rule changes on one side (e.g. backend extends `cancellationWindowHours`'s max from 720 to 1000) and the BFF's copy isn't updated in the same PR, the BFF will reject valid requests with a stale, wrong error before they ever reach the backend. Nothing currently catches this drift automatically.

## Why not fixed now

Properly deduplicating means extracting the shared Zod schema into a new package both `apps/backend` and `apps/bff` import — not `@ikaro/types` (that's the BFF→frontend contract; backend importing it would violate the anti-pattern already in `docs/ANTI_PATTERNS.md` about coupling the backend domain to the frontend-facing shape). A new package with real runtime code (Zod schemas execute, they're not type-only) needs the full treatment already documented for `packages/*` runtime packages: a `build` script compiling to `dist/`, a root `postinstall` so `dist/` is fresh locally, and **both apps' Dockerfiles updated** to build it before `pnpm deploy --prod` (a previous package skipped this and broke production with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). That's new package scaffolding + build-chain wiring + two Dockerfile changes + verification — disproportionate to bundle into the PR that happened to surface the metric, and it should cover hotsite too for consistency rather than fixing one instance ad hoc.

## Proposed fix (not yet scoped as a story)

1. Decide where shared backend↔BFF validation schemas should live (new package, e.g. `packages/contracts` or `packages/validation` — name TBD) and confirm it's distinct in purpose from `@ikaro/types`.
2. Add the package with compiled `dist/` output, `build` script, `postinstall`, and wire both `apps/backend/Dockerfile` and `apps/bff/Dockerfile` to build it before deploy.
3. Migrate `update-tenant-settings.dto.ts` + `tenant-settings.controller.ts`'s schemas to import from the shared package; remove the `sonar.cpd.exclusions` entry once duplication is gone for real.
4. Migrate `update-hotsite-content.dto.ts` + `hotsite-admin.controller.ts`'s schemas the same way for consistency.
5. Decide whether the shared schema's defaults/refinements differ at all between the two layers (e.g. does the BFF need `.strict()` if the backend doesn't, or vice versa) before assuming a single export works for both call sites unmodified.

## Acceptance criteria (when this is picked up)

- [ ] Tenant settings and hotsite content schemas have exactly one source of truth for business rules (min/max, regex, enums), imported by both `apps/backend` and `apps/bff`
- [ ] `sonar.cpd.exclusions` entry for `tenant-settings.controller.ts` removed
- [ ] New shared package builds correctly in both apps' Docker images; a no-op `docker run` boot smoke test (per TD06) passes for both
- [ ] No behavior change to either endpoint's validation (same accept/reject decisions as before, verified by existing test suites)
