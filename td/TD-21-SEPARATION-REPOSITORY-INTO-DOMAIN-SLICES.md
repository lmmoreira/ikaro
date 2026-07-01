# TD21 - Separation Repository Into Domain Slices

## Status
- **State**: Draft
- **Type**: Technical Debt / Repository Structure Migration Plan
- **Priority**: Medium
- **Scope**: `apps/backend`, `apps/bff`, `apps/web`
- **Non-goals**: no product feature changes, no domain behavior changes, no package-wide redesign unless a shared package is clearly polluted by app-specific code

## Purpose

This TD defines the ideal repository shape for a domain-first, slice-based organization across the web platform.

The goal is to make the codebase easier for an autonomous agent to navigate and modify by keeping each business capability in one obvious place, with clear rules for where transport code, orchestration code, pure logic, and shared cross-cutting code belong.

The migration is not equally large in every app:
- `apps/backend` is already close to the target shape and should mostly be verified, not rewritten.
- `apps/bff` is sliceable, but it still needs stronger feature ownership, clearer internal layers, and stricter transport boundaries.
- `apps/web` has the most room for improvement because it still mixes route composition, feature UI, transport, and page-model logic across several top-level buckets.

## Current Assessment

### Backend

The backend is already organized by bounded context under `apps/backend/src/contexts/<context>/`.

Current shape:
- `domain/` for entities, value objects, events, and domain services
- `application/` for use cases, DTOs, and ports
- `infrastructure/` for controllers, persistence, handlers, and adapters
- `src/shared/` for cross-cutting concerns only

This is already the right model. The remaining work for backend is mainly:
- confirm there are no domain objects leaking into `shared/`
- confirm each context stays isolated from other contexts
- keep tests and builders aligned with context ownership
- fix any remaining file-placement drift if an audit finds it

### BFF

The BFF is already separated by capability folders, but the ideal final shape is a true feature-slice tree with internal layers.

Current top-level capability folders include:
- `auth/`
- `bookings/`
- `customers/`
- `loyalty/`
- `platform/`
- `schedule/`
- `services/`
- `staff/`
- `uploads/`
- `shared/`

What still needs to be normalized:
- each capability should own a single feature slice with a clear internal layer structure
- controllers should stay thin transport adapters
- mapping and response shaping should live in slice-local mappers or application helpers
- helper code should not drift into root-level miscellaneous files
- module names should match the feature slice without ambiguity

### Web

The web app is the most mixed surface today because it combines:
- hotsite rendering
- dashboard rendering
- customer-shell flows
- booking flows
- public and authenticated API transport

Current broad organization already points in the right direction:
- `app/` for routes and layouts
- `components/<domain>/` for feature UI
- `lib/api/` for transport
- `lib/hotsite/` for pure hotsite logic
- `lib/dashboard/` and `lib/booking/` for domain helpers
- `lib/hooks/` for React Query orchestration

What still needs to be enforced:
- `lib/api` is a transitional bucket and should be drained into feature-owned `api/` folders
- pure hotsite logic must move into the hotsite feature slice, not remain in a global `lib/hotsite`
- route files must stay thin and delegate reusable work
- components must be grouped by feature slice, not by incidental implementation details
- shared UI primitives must remain domain-agnostic

## Current Inventory

This section exists so an autonomous agent can map the repo as it exists today into the target model without guessing.

### Backend inventory

Current structure already matches the target model:
- `apps/backend/src/contexts/booking`
- `apps/backend/src/contexts/customer`
- `apps/backend/src/contexts/loyalty`
- `apps/backend/src/contexts/notification`
- `apps/backend/src/contexts/platform`
- `apps/backend/src/contexts/staff`
- `apps/backend/src/shared`
- `apps/backend/src/test`

Current expectation:
- do not split backend further unless an audit finds a real boundary violation
- do not add a new top-level backend bucket for a feature that already belongs in a context

### BFF inventory

Current structure:
- `apps/bff/src/auth`
- `apps/bff/src/bookings`
- `apps/bff/src/customers`
- `apps/bff/src/loyalty`
- `apps/bff/src/platform`
- `apps/bff/src/schedule`
- `apps/bff/src/services`
- `apps/bff/src/staff`
- `apps/bff/src/uploads`
- `apps/bff/src/shared`

Target change:
- each of the current capability folders should become or map into a `features/<capability>/` slice
- `shared/` remains for cross-cutting transport concerns only
- the current flat capability folders are a transition; the final shape is feature-owned layers inside each slice

### Web inventory

Current structure:
- `apps/web/app`
- `apps/web/components/booking`
- `apps/web/components/customer`
- `apps/web/components/dashboard`
- `apps/web/components/hotsite`
- `apps/web/components/staff`
- `apps/web/components/ui`
- `apps/web/lib/api`
- `apps/web/lib/booking`
- `apps/web/lib/dashboard`
- `apps/web/lib/formatting`
- `apps/web/lib/hotsite`
- `apps/web/lib/hooks`
- `apps/web/lib/i18n`
- `apps/web/lib/test`
- `apps/web/lib/utils`
- `apps/web/providers`

Target change:
- feature-owned code should move under `apps/web/features/<slice>/`
- global `lib/api` should be split into feature-owned transport folders
- global `components/<domain>` should become feature-owned UI folders
- `shared/` should contain only cross-surface reusable primitives and helpers

## Target Slice Model

The repository should follow these rules consistently:

- Each business capability owns a feature slice.
- A feature slice owns its UI, transport, orchestration, and pure logic.
- Shared code is only for truly cross-cutting concerns.
- If a file serves two domains only because the split has not happened yet, the split should be made explicit rather than hidden in a generic helper.
- Route files, controllers, and handlers should compose, not orchestrate.
- Technical buckets are secondary; ownership by capability is primary.

## Target Ownership Map

This map translates the current repo into the final shape expected by this TD.

### Backend ownership map

Current -> target:
- `apps/backend/src/contexts/booking` -> stays as-is
- `apps/backend/src/contexts/customer` -> stays as-is
- `apps/backend/src/contexts/loyalty` -> stays as-is
- `apps/backend/src/contexts/notification` -> stays as-is
- `apps/backend/src/contexts/platform` -> stays as-is
- `apps/backend/src/contexts/staff` -> stays as-is
- `apps/backend/src/shared` -> stays as-is only for cross-cutting concerns

### BFF ownership map

Current -> target:
- `apps/bff/src/auth` -> `apps/bff/src/features/auth`
- `apps/bff/src/bookings` -> `apps/bff/src/features/bookings`
- `apps/bff/src/customers` -> `apps/bff/src/features/customers`
- `apps/bff/src/loyalty` -> `apps/bff/src/features/loyalty`
- `apps/bff/src/platform` -> `apps/bff/src/features/platform`
- `apps/bff/src/schedule` -> `apps/bff/src/features/schedule`
- `apps/bff/src/services` -> `apps/bff/src/features/services`
- `apps/bff/src/staff` -> `apps/bff/src/features/staff`
- `apps/bff/src/uploads` -> `apps/bff/src/features/uploads`
- `apps/bff/src/shared` -> stays as shared cross-cutting infrastructure only

### Web ownership map

Current -> target:
- `apps/web/components/booking` -> `apps/web/features/booking/components`
- `apps/web/components/customer` -> `apps/web/features/customer/components`
- `apps/web/components/dashboard` -> `apps/web/features/dashboard/components`
- `apps/web/components/hotsite` -> `apps/web/features/hotsite/components`
- `apps/web/components/staff` -> `apps/web/features/staff/components`
- `apps/web/components/ui` -> `apps/web/shared/components/ui`
- `apps/web/lib/api/hotsite` and current hotsite fetchers -> `apps/web/features/hotsite/api`
- `apps/web/lib/api/dashboard` and current dashboard fetchers -> `apps/web/features/dashboard/api`
- `apps/web/lib/api/customer.ts` -> `apps/web/features/customer/api`
- `apps/web/lib/api/bookings.ts` -> `apps/web/features/booking/api` unless it remains intentionally shared after review
- `apps/web/lib/hotsite` -> `apps/web/features/hotsite/model`
- `apps/web/lib/booking` -> `apps/web/features/booking/model`
- `apps/web/lib/dashboard` -> `apps/web/features/dashboard/model`
- `apps/web/lib/hooks` -> feature-owned hooks folders when the hook belongs to one slice
- `apps/web/lib/utils` and `apps/web/lib/formatting` -> either `apps/web/shared/` if truly global or feature-owned `utils/` if not

## Migration Waves

The ideal implementation should be executed in waves so the repo remains reviewable and safe to change.

### Wave 1 - Lock the target model

Goal:
- document the final structure before moving more code

Work:
- update `docs/REPOSITORY_STRUCTURE.md`
- update `docs/11-ARCHITECTURE.md`
- update `docs/ENGINEERING_RULES.md` where needed
- use this TD as the canonical slice map

### Wave 2 - Backend audit only

Goal:
- verify the backend already matches the model

Work:
- audit `apps/backend/src/contexts/**`
- fix only real boundary violations
- do not churn correct code

### Wave 3 - BFF feature-slice migration

Goal:
- move the BFF to explicit `features/<capability>/` ownership

Work:
- relocate capability folders into feature slices
- split controllers into presentation + application responsibilities where needed
- keep shared transport helpers only in `shared/`
- update tests, imports, and module references in the same change

### Wave 4 - Web feature-slice migration

Goal:
- move the web app to feature-owned code paths

Work:
- create feature slices for booking, customer, dashboard, hotsite, staff, auth, and platform
- move feature UI into `features/<slice>/components`
- move feature transport into `features/<slice>/api`
- move feature logic into `features/<slice>/model`
- keep route files thin and composed from feature imports

### Wave 5 - Shared-code cleanup

Goal:
- shrink the shared surface to the true minimum

Work:
- move leftover code out of generic buckets if it is feature-owned
- keep only cross-cutting primitives in `shared/`
- remove duplicated helpers that are really feature-specific

### Wave 6 - Final audit and freeze

Goal:
- make the new layout the new baseline

Work:
- re-run smell audits
- re-run tests for touched slices
- update the TD status to resolved only after the layout is stable

## Explicit Placement Examples

These examples are intentionally concrete so the next agent has no ambiguity.

### Backend examples

- `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` stays in `booking/domain`
- `apps/backend/src/contexts/customer/application/use-cases/search-customers.use-case.ts` stays in `customer/application`
- `apps/backend/src/shared/value-objects/phone-number.ts` stays in shared because it is cross-cutting

### BFF examples

- `apps/bff/src/auth/auth.controller.ts` becomes part of `apps/bff/src/features/auth/presentation/`
- `apps/bff/src/bookings/bookings.mapper.ts` becomes part of `apps/bff/src/features/bookings/application/` or `presentation/` depending on whether it is response mapping or policy shaping
- `apps/bff/src/services/services.public.controller.ts` becomes part of `apps/bff/src/features/services/presentation/`
- `apps/bff/src/uploads/uploads.controller.ts` becomes part of `apps/bff/src/features/uploads/presentation/`

### Web examples

- `apps/web/app/[slug]/page.tsx` stays a route composition file and imports feature-owned hotsite modules
- `apps/web/components/booking/BookingForm.tsx` moves to `apps/web/features/booking/components/`
- `apps/web/components/customer/InformationCompletionPrompt.tsx` moves to `apps/web/features/customer/components/`
- `apps/web/lib/api/hotsite/services.ts` moves to `apps/web/features/hotsite/api/services.ts`
- `apps/web/lib/api/hotsite/customers.ts` moves to `apps/web/features/hotsite/api/customers.ts`
- `apps/web/lib/api/customer.ts` moves to `apps/web/features/customer/api/profile.ts`
- `apps/web/lib/hotsite/seo.ts` should be split so the page-model pieces land in `apps/web/features/hotsite/model/`

## Target Repository Shape

### Backend target

The backend already matches the target model and should remain close to this shape:

```text
apps/backend/src/
├── contexts/
│   ├── booking/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── customer/
│   ├── loyalty/
│   ├── notification/
│   ├── platform/
│   └── staff/
├── shared/
└── test/
```

Backend rules:
- do not move context-owned domain objects into `shared/`
- do not add cross-context imports between `contexts/*`
- keep shared utilities cross-cutting only
- keep test builders aligned with the context they model

### BFF target

The BFF should read as one feature slice per capability, with slice-local transport, application logic, and mapping:

```text
apps/bff/src/
├── features/
│   ├── auth/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── test/
│   ├── bookings/
│   ├── customers/
│   ├── loyalty/
│   ├── platform/
│   ├── schedule/
│   ├── services/
│   ├── staff/
│   └── uploads/
├── shared/
│   ├── http/
│   ├── guards/
│   ├── interceptors/
│   └── observability/
└── main.ts
```

BFF rules:
- one feature slice per capability, no ambiguous root-level business helpers
- controllers belong in the feature slice's presentation layer
- branch logic belongs in application services or mapper helpers when the controller starts carrying real policy
- public and authenticated endpoints for the same capability stay together unless auth boundaries require a hard split
- `shared/` only contains genuinely reusable transport or infra helpers

### Web target

The web app should remain route-driven at the top, but the supporting code should be feature-first:

```text
apps/web/
├── app/
│   ├── [slug]/
│   ├── dashboard/
│   ├── auth/
│   ├── select-staff-tenant/
│   ├── switch-tenant/
│   └── api/
├── features/
│   ├── auth/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── model/
│   │   └── utils/
│   ├── booking/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── model/
│   │   └── utils/
│   ├── customer/
│   ├── dashboard/
│   ├── hotsite/
│   ├── platform/
│   └── staff/
├── shared/
│   ├── components/
│   │   └── ui/
│   ├── hooks/
│   ├── lib/
│   └── utils/
└── providers/
```

Web rules:
- each feature owns its `api`, `components`, `hooks`, `model`, and `utils` folders as needed
- `features/shared` is only for code shared across multiple features but still web-app-specific
- `shared/components/ui` is the home for primitives that are safe across every web surface
- route files must stay thin and unit-testable helper logic should live in the owning feature slice
- global `lib/api` should disappear once the feature-owned transport has been moved
- global `lib/hotsite` / `lib/booking` / `lib/dashboard` buckets should be replaced by feature-owned `model` or `utils` folders

## Migration Principles

- Start with the least risky structural changes first.
- Do not create a new shared bucket unless multiple slices genuinely need the same code.
- Prefer moving code next to the slice that owns it over inventing a generic utility layer.
- If a file can stay where it is without violating the slice model, do not move it just for symmetry.
- If a file is shared by two surfaces, keep it shared only until the split is justified by clear ownership.
- Preserve public behavior and route contracts throughout the migration.

## Implementation Stories

These stories are intended to be landed as separate waves, but the target shape should be consistent across all of them.

### Story 1 - Canonical slice map and boundary rules

Scope:
- repository-wide planning and structural rules
- documentation updates that define the final slice map for backend, BFF, and web

Target files:
- `docs/REPOSITORY_STRUCTURE.md`
- `docs/11-ARCHITECTURE.md`
- `docs/ENGINEERING_RULES.md`
- this TD file

Work required:
1. Define the canonical slice names for each app.
2. Record the allowed root-level exceptions for each app.
3. State clearly what belongs in `shared/` and what does not.
4. Write the migration rules that future agents should follow when moving files.
5. Keep the naming rules explicit enough that a new file location is obvious before the move starts.

Implementation notes:
- The target is clarity, not extra abstraction.
- The BFF and web slice maps should be written so they can be used as the source of truth during later story execution.
- Do not over-specify file names where the capability-level rule is enough.

Verification:
- documentation review
- consistency check against the current repo layout

Definition of done:
- the slice map is explicit enough that later migration stories can follow it without reinterpretation
- root-level exceptions are documented, not implied

### Story 2 - Backend conformance sweep

Scope:
- `apps/backend/src/contexts/**`
- `apps/backend/src/shared/**`
- `apps/backend/src/test/**`

Target files:
- any backend file that violates the context-isolation model
- any backend test helper or builder that is owned by the wrong context

Work required:
1. Verify that context-owned code stays inside its own bounded context.
2. Confirm that `shared/` contains only cross-cutting utilities, ports, and primitives.
3. Move any misfiled backend code back into the owning context if the audit finds it.
4. Keep builders, fixtures, and test helpers aligned with the context they model.
5. Ensure no new backend slice should need a root-level special case.

Implementation notes:
- This story is expected to be small because the backend is already mostly correct.
- Treat backend as the reference implementation of slice discipline.
- If a backend file is already in the right place, leave it alone.

Verification:
- backend type-check
- targeted backend unit tests if any files move
- backend smell audit for the changed subtree

Risks:
- unnecessary churn if the audit tries to "improve" already-correct context layout
- accidental cross-context imports if a helper is moved without updating all consumers

Definition of done:
- backend code remains cleanly bounded by context
- no domain object or use case lives in `shared/`
- any drift that existed is corrected and documented

### Story 3 - BFF domain slice normalization

Scope:
- `apps/bff/src/features/**`
- `apps/bff/src/shared/**`
- `apps/bff/src/main.ts`

Work required:
1. Create or normalize a `features/<capability>/` slice for every capability.
2. Move branching, shaping, and repeated mapping out of controllers.
3. Put reusable response shaping into slice-local application services or mappers instead of controller bodies.
4. Keep auth helpers, DTOs, guards, and strategies inside the auth feature unless they are truly cross-cutting.
5. Keep module names aligned with the feature slice and its internal layers.
6. Keep `shared/` limited to transport and infra helpers that are genuinely shared.
7. Make sure public and authenticated flows in the same capability stay inside the same feature slice unless auth boundaries require a separation.

Implementation notes:
- the feature tree should be the primary navigation surface for the BFF
- if a controller owns logic that belongs to application code or a mapper, extract it
- if a helper is only used by one slice, keep it next to that slice
- if a helper is reused across slices, move it to `shared/` only after confirming it is not slice-specific policy

Recommended target conventions:
- presentation: controllers, DTOs, request validation, auth entrypoints
- application: flow services, orchestration, response mappers, feature policies
- infrastructure: external adapters, token handling, HTTP clients, route plumbing
- slice-local utilities: `helpers/` or `utils/` inside the feature
- truly shared transport helpers: `shared/http/`, `shared/guards/`, `shared/interceptors/`

Verification:
- BFF type-check
- focused controller and component tests for touched slices
- route-level integration tests where available
- BFF smell audit after the refactor

Risks:
- controller refactors can change request/response shape if the mapper boundary is not kept explicit
- module renames can break nested provider imports if not swept completely

Definition of done:
- BFF controllers are thin transport adapters
- folder names match capability ownership
- there are no ambiguous root-level helpers masquerading as shared code

### Story 4 - Web domain slice normalization

Scope:
- `apps/web/app/**`
- `apps/web/features/**`
- `apps/web/shared/**`
- `apps/web/providers/**`
- `apps/web/e2e/**` if helper paths need to follow the new slice map

Work required:
1. Keep route files thin and move reusable logic into the owning feature slice.
2. Move transport out of global `lib/api` and into feature-owned `api/` folders.
3. Move hotsite page-model logic into the hotsite feature slice.
4. Keep feature UI inside `features/<slice>/components`.
5. Keep shared primitives inside `shared/components/ui`.
6. Keep dashboard, hotsite, booking, customer, and staff code paths distinct enough that a reader can tell which surface they are in without following imports.
7. Split or move any feature-specific logic that currently lives in route files, generic helpers, or transport wrappers.

Implementation notes:
- each feature owns its transport, UI, orchestration, and pure logic unless the code is truly shared
- `app/[slug]` is a composition layer, not a business-logic home
- `features/hotsite` should own the hotsite page model and public fetchers
- `features/dashboard` should own authenticated dashboard transport and presentation
- shared code should only survive if more than one feature truly needs it

Recommended target conventions:
- feature UI: `features/<slice>/components/*`
- feature transport: `features/<slice>/api/*`
- feature orchestration: `features/<slice>/hooks/*`
- feature pure logic: `features/<slice>/model/*`
- feature utility helpers: `features/<slice>/utils/*`
- shared primitives: `shared/components/ui/*`
- shared cross-cutting helpers: `shared/lib/*`, `shared/utils/*`

Verification:
- web type-check
- web unit tests
- Playwright coverage for touched route trees if a route file changes
- web smell audit after the refactor

Risks:
- transport renames can cascade across many tests and imports
- route files can accidentally grow again if helper extraction is incomplete
- component grouping can regress into a generic shared bucket if slice ownership is not enforced

Definition of done:
- route files are composition-only
- transport code is grouped by feature slice
- hotsite, dashboard, customer, booking, and staff surfaces are easy to identify from the folder tree alone

### Story 5 - Enforcement, audit, and final baseline lock

Scope:
- repository-wide review of the new slice map
- documentation and guardrail updates after the structural migration

Target files:
- `docs/REPOSITORY_STRUCTURE.md`
- `docs/11-ARCHITECTURE.md`
- `docs/ENGINEERING_RULES.md`
- any remaining root-level files that still need a final move after the slice migration

Work required:
1. Re-run smell audits for backend, BFF, and web.
2. Update the repository structure docs to describe the final slice conventions.
3. Confirm the allowed exceptions are still valid and minimal.
4. Remove any leftover drift that the earlier stories exposed.
5. Freeze the new structure as the baseline for future work.

Implementation notes:
- This story should not introduce new architecture, only solidify the one already chosen.
- If a file still looks misplaced after the earlier stories, move it now or explain why it is intentionally shared.
- The final state should be readable by a new agent without external context.

Verification:
- repo-level lint/type-check/tests for the touched apps
- smell audit on the changed subtrees
- final doc consistency pass

Definition of done:
- the repository reads as domain slices end-to-end
- the docs match the actual folder layout
- future cleanup work can use this TD as the single baseline

## Acceptance Criteria

- [ ] Backend remains aligned with bounded contexts and has no new context leakage
- [ ] BFF folders are organized by feature slice, with thin controllers and slice-local application/mapping layers
- [ ] Web folders are organized by feature slice, with transport and page-model logic owned by the feature
- [ ] Shared web code is isolated in `shared/` and feature-specific transport no longer depends on global `lib/api`
- [ ] Route files stay thin and composition-oriented
- [ ] Shared code is cross-cutting only and no longer acts as a dumping ground
- [ ] The repository structure docs match the implementation
- [ ] Smell audits can use this TD as the canonical baseline

## Notes

1. This TD intentionally treats the backend as already mostly compliant.
2. The most important work is in BFF and web, where the slice boundaries need to be explicit and stable.
3. The target is not "one folder per technical layer" but "one folder per business capability, with layers inside it."
4. If a slice is used in multiple places, first ask whether it is truly shared or just not split yet.
5. Any future refactor should preserve the ability for an autonomous agent to locate the owning code path quickly.
