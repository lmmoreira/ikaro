# TD31 — Bad-Smell Audit Coverage Snapshot (2026-07-23)

## Status
- **State**: ✅ Done — all 22 stories triaged, scoped, and merged (last landed: Story 18, PR #317, 2026-08-04). See Acceptance Criteria at the bottom of this file.
- **Type**: Technical Debt / Audit Snapshot — 🔴 items triaged into stories below (2026-07-23); 🟡/⚪ items triaged in the same pass
- **Priority**: See per-story priority below
- **Scope**: whole repo — `apps/backend`, `apps/bff`, `apps/web`
- **Created**: 2026-07-23
- **Origin**: a `skill-creator` eval session benchmarking `/bad-smell-audit` (`.claude/commands/bad-smell-audit.md`) against a freeform baseline audit with no checklist — same model, same three scopes (backend/BFF/web full scans), one pass each, run against the live repo at the time.

## Purpose

This file started as a **triage snapshot, not a committed remediation plan** — the full inventory of what the eval found, organized so a later session could decide what (if anything) becomes real work. That framing described the file only until the 2026-07-23 triage session below: it now has a full story breakdown (22 stories) and a 14-PR execution plan with acceptance criteria, the same rigor as `td/TD-18-19-20-BAD-SMELL-VIOLAVIONS.md`. Kept as one file rather than split out, since the raw audit findings (Part 1/Part 2 below) remain useful context for why each story exists.

Two things were compared:
1. **The checklist** (`/bad-smell-audit`'s 18 checks, BE-1–7 / BFF-1–4 / WEB-1–7) — found **3** issues total.
2. **A freeform baseline** (same model, told only "find code smells, report file:line, group by category, total count" — no fixed checklist) — found **61** issues total.

The gap is the point: the checklist is accurate (no false positives, all three previously-documented false-positive traps avoided — see `bad-smell-audit.md`'s own BE-3/WEB-7 notes and the WEB-2/WEB-4 stale-path fix made just before this eval ran) but narrow. It only checks 18 specific patterns; the baseline explored broadly and found entire categories the checklist has no concept of.

## Confidence key

- 🔴 **REAL** — matches a rule this project already wrote down in `CLAUDE.md`, is a verified security/correctness risk, or was independently cross-validated by two unrelated audit runs.
- 🟡 **DEBATABLE** — a real, verifiable fact (duplication, a gap), but whether it's worth fixing is a judgment call reasonable teams could differ on.
- ⚪ **STYLISTIC** — would vary project to project; most teams wouldn't flag this as a defect at all.

Tags are advisory, not final — re-judge at triage time.

---

## Part 1 — Checklist findings (`/bad-smell-audit`, 2 total — corrected 2026-07-23, originally miscounted as 3; see the Web section note below)

### Backend — 0 findings
Clean run across BE-1 through BE-7, verified category by category (VO usage, validation duplication, test-builder bypass, missing builders, seed DDL, utility duplication, builder readonly fields). Independently confirmed via direct grep during eval setup — no evidence of a missed finding, but note the eval set has no positive-control case for 6 of the 7 backend checks (only BE-3 had a known historical false positive to regress against).

### BFF — 1 finding
- 🟡 **BFF-1**: `apps/bff/src/features/booking/bookings.controller.ts:238,247,265` — `generateAttachmentSignedUrl()` contains a 3-way scenario-routing chain (JWT user / guest token / anonymous tenant slug) deciding tenant resolution. Verified directly against source — the branching is real. The auditing agent itself flagged this as arguably "infrastructure/routing logic" rather than strict domain business logic, but it does literally match BFF-1's stated criteria. **→ Story 22** (initially missed in the first triage pass on 2026-07-23; caught on a later completeness re-check the same day).

### Web — 1 finding
*(Corrected 2026-07-23: originally read "Web — 2 findings" with only one bullet ever listed below it. Re-checked and found no evidence a second finding existed — this was a header-count error in the document itself, not a dropped finding. Corrected to "1 finding" to match what's actually recorded.)*
- 🔴 **WEB-7**: `apps/web/features/booking/api/staff.ts` and `staff.server.ts` — named after the `Staff` aggregate, but every export (`listBookings`, `approveBooking`, `cancelBooking`, etc.) is a `Booking` operation. The real Staff-domain API lives separately at `apps/web/features/staff/api/staff.ts`. **Cross-validated** — the freeform baseline independently found the identical two files (see Web #1 below) with no shared context between the two runs.

---

## Part 2 — Freeform baseline findings (61 total)

### Backend (17)

| # | Tag | Location | Finding |
|---|---|---|---|
| 1.1 | 🟡 | `contexts/platform/application/dtos/update-tenant-settings.dto.ts:95-96` | `BusinessInfoSchema.phone`/`.email` are plain nullable strings, no format check — inconsistent with every other email/phone DTO field in the codebase |
| 1.2 | 🟡 | `contexts/customer/application/dtos/find-or-create-customer.dto.ts:6` | `email: z.string().min(1)` — no email-format validation at all |
| 1.3 | 🟡 | `contexts/customer/application/dtos/update-customer-profile.dto.ts:6` | `phone` has no `PhoneNumber.isValid` refinement, unlike `request-booking.dto.ts`'s identical shape |
| 1.4 | ⚪ | `shared/value-objects/address.ts`, `money.ts` | Don't use the `*.vo.ts` suffix every other VO uses — naming inconsistency only |
| 2.1 | 🟡 | `provision-tenant.dto.ts:13-23` + `update-tenant-settings.dto.ts:65-75` | `country_code` composite schema duplicated verbatim |
| 2.2 | 🟡 | `open-schedule.dto.ts`, `close-schedule.dto.ts`, `get-availability.dto.ts`, `get-availability-summary.dto.ts` | `YYYY-MM-DD` regex duplicated 9x |
| 2.3 | 🟡 | `shared/guards/{manager,staff-or-manager,customer,any-authenticated}-role.guard.ts` | Role-guard boilerplate duplicated 4x — candidate for one `createRoleGuard(allowedRoles, message)` factory |
| 2.4 | 🟡 | `admin-schedule-reminder.job.ts` + `booking-reminder.job.ts` | Day-boundary/window computation duplicated (byte-identical `WINDOW_START`/`WINDOW_END`, repeated `DateTime...startOf('day')` pattern) |
| 3.1 | 🔴 | `contexts/booking/infrastructure/controllers/booking.controller.ts:143-159` | Customer-can-only-see-own-booking authorization check lives only in the controller's `.then()` callback — `GetBookingByIdUseCase` has no notion of the requesting customer, so this rule is untested at the use-case level and absent from any other caller. Security-adjacent gap. |
| 3.2 | 🟡 | `contexts/customer/infrastructure/controllers/customer.controller.ts:78-84,95-101` | Byte-identical response-shaping duplicated across `getMe()`/`getById()` |
| 3.3 | 🟡 | `contexts/loyalty/infrastructure/controllers/loyalty.controller.ts:75-78,134` | Same pattern, smaller scale |
| 4.1 | 🟡 | `test/infrastructure/` (loyalty in-memory repos) | Misfiled — every other context's in-memory repos live under `test/repositories/<context>/`; loyalty's don't |
| 4.2 | 🔴 | `contexts/loyalty/infrastructure/events/booking-completed.handler.integration.spec.ts:181,227,265,270` | Bypasses the existing `LoyaltyBalanceEntityBuilder` with raw object literals passed directly to `.save({...})` — direct violation of the "Builders mandatory" testing rule |
| 5 | 🟡 | `test/builders/staff/` | `StaffActivated`/`StaffDeactivated` events have no builder despite being referenced across 7 spec files (only `staff-invited-event.builder.ts` exists) |
| 6.1 | ⚪ | `loyalty/pagination.dto.ts` vs `booking/list-bookings.dto.ts` vs `customer.controller.ts` | Inconsistent pagination conventions (page+limit vs limit+offset vs ad hoc clamping) — plausibly intentional per-endpoint |
| 6.2 | ⚪ | `customer.aggregate.ts:104`, `phone-number.vo.ts:26`, `request-booking.dto.ts:11` | E.164 error-message *wording* duplicated (not logic — the check itself is correctly centralized) |

### BFF (28, one excluded as ambiguous — see Caveat below)

| # | Tag | Location | Finding |
|---|---|---|---|
| A1 | 🔴 | `bookings.controller.ts:274-299` | `list()` branches on `user.role` and hand-assembles two response shapes inline instead of delegating to the mapper |
| A2 | 🔴 | `bookings.controller.ts:301-328` | `getOne()`'s private `fetchLoyaltyBalance()` reaches into the Loyalty context directly from the Booking controller, silently swallowing errors |
| A3 | 🔴 | `customers.controller.ts:47-68` | `searchCustomers()` — one loyalty-balance call **per customer** inside `Promise.all(items.map(...))`, an N+1 fan-out in the controller |
| A4 | 🟡 | `customers.controller.ts:89-118` | `getTenants()` batches tenant info but still fan-outs per-tenant balance calls, validates batch consistency inline |
| A5 | 🟡 | `platform.public.controller.ts:17-31` | `getManifest()` does two sequential backend calls, manually spreads them with an ad-hoc inline intersection type |
| A6 | 🔴 | `loyalty.controller.ts:162-196` | `getCustomerLoyaltyDetail()` runs a 4-way `Promise.all` and assembles the composite response directly in the controller |
| C1 | 🟡 | `bookings.types.ts:22,42,97-98` | `status`/`type` fields typed as plain `string` instead of the real union |
| C2 | 🟡 | `bookings.mapper.ts:19,38,53,94,96` | Forced `as X['status']`/`as X['type']` casts, consequence of C1 |
| C3 | 🟡 | `schedule.types.ts:6` | `ScheduleClosureResponse.reason: string` even though the write-side schema constrains it to 3 values |
| C4 | 🟡 | `shared/decorators/current-user.decorator.ts:10` | `CurrentUserPayload.role: string` despite `JwtRole` union already existing and never being reused here |
| C5 | 🟡 | `shared/decorators/roles.decorator.ts:4` | `Roles(...roles: string[])` — every `@Roles(...)` call site unchecked against the real role set at compile time |
| C6 | 🟡 | `features/auth/strategies/jwt.strategy.ts:27-29` | `validate()` performs zero runtime shape validation on the decoded JWT before it becomes `req.user` |
| C7 | ⚪ | `features/booking/services.types.ts:5` | `ServiceDetail.price.formatted` declared but never read — dead field |
| D1–D7 | 🟡 | `shared/guards/{active-staff,tenant,roles}.guard.ts`, `shared/http/backend-headers.ts`, `shared/decorators/current-user.decorator.ts:16`, `shared/request/request.interceptor.ts:31`, `features/auth/auth.controller.ts:35` | Same manual `req.user` cast repeated in 6 files with no global Express `Request` type augmentation; the 7th site (`auth.controller.ts:35`) casts the same property to a *different* type (`GoogleProfile`), showing the casts have already started drifting |
| E1 | 🔴 | `bookings.controller.ts:203-221` | `tryDecodeUserJwt()` hand-decodes a JWT and re-declares a zod schema duplicating `CurrentUserPayload`'s shape instead of reusing a shared auth utility — duplicated auth logic is a real maintenance/security risk |
| E2 | 🟡 | `bookings.controller.ts:206,248,478` | Three separate `config.getOrThrow('JWT_SECRET')` calls in one controller |
| F1 | 🟡 | 5 files (`schedule*.controller.ts`, `bookings.controller.ts`) | Date-format regex duplicated 12x |
| F2 | 🟡 | 4 files (`schedule*.controller.ts`) | Manual query-string interpolation bypassing `BackendHttpService`'s `params` support |
| F3 | 🟡 | `shared/http/backend-http.service.ts:61-100` | `getForPublic`/`postForPublic`/`patchForPublic` each re-declare the identical header object |
| G1 | ⚪ | `main.ts:8` | Dead re-export of `JWT_COOKIE_OPTIONS`, no importer anywhere |
| H1 | ⚪ | `loyalty.controller.ts:69` | Bare `@Controller()` with fully-qualified literal paths, inconsistent with every other controller's `@Controller('<prefix>')` convention |

### Web (16)

| # | Tag | Location | Finding |
|---|---|---|---|
| 1.1 | 🔴 | `features/booking/api/staff.ts`, `staff.server.ts` | Misnamed after `Staff` aggregate, contain only `Booking` ops — **cross-validated**, see Part 1 WEB-7 |
| 1.2 | 🟡 | `features/customer/api.ts:46-62` | `cancelBooking`/`submitInfo` (Booking-aggregate transitions) defined in the Customer slice |
| 1.3 | 🟡 | `features/customer/api.server.ts:42-99` | Booking reads + Loyalty reads (5 functions) all live in the Customer slice |
| 1.4 | 🟡 | (meta) | Codebase uses two contradictory conventions for "actor-scoped view of another domain's aggregate" — staff-facing booking ops live in the *owning* domain's slice, customer-facing booking/loyalty ops live in the *actor's* slice. No documented rule distinguishes which pattern applies when. |
| 2.1 | 🔴 | `features/loyalty/api.ts:9-17` | Local `LoyaltyEntryItem` (`entryId`, `serviceId`) has **drifted in shape** from canonical `@ikaro/types` (`id`, `bookingId`) — re-verified directly against current source 2026-07-23, still live. Not covered by `TD09` (resolved, but only examined `LoyaltyBalanceResponse`). |
| 2.2 | 🔴 | `features/loyalty/api.ts:24-29` | Same drift on `LoyaltyRedemptionItem` (`redemptionId` vs `id`/`amountDeducted`/`bookingId`) — re-verified, still live |
| 2.3 | 🟡 | `features/loyalty/api.ts:3-7` | `LoyaltyBalanceResponse` — shapes match exactly, pure avoidable duplicate (should just import from `@ikaro/types`) |
| 2.4 | 🟡 | `features/auth/session.ts:4-6` | `SwitchTenantRequest` — identical shape, hand-redeclared even though the sibling `SwitchTenantResponse` is already imported from `@ikaro/types` in the same file |
| 3.1 | 🔴 | `app/not-found.spec.tsx` | Unit-tests an async Server Component via `render()`, contradicting both `sonar-project.properties`' own coverage exclusion for this exact file and the sibling E2E test's own inline comment explaining why this can't be unit-tested |
| 4.1 | 🔴 | `shells/dashboard/components/WeekNav.tsx:65` | Hardcoded pt-BR `aria-label="Período anterior"`, no `useTranslations` in the file |
| 4.2 | 🔴 | `shells/dashboard/components/WeekNav.tsx:79` | Same file, `aria-label="Próximo período"` |
| 4.3 | 🔴 | `shells/hotsite/components/Footer.tsx:15` | Hardcoded pt-BR fallback copyright text regardless of tenant locale |
| 4.4 | 🔴 | `shells/hotsite/components/TestimonialCard.tsx:17` | Hardcoded pt-BR `aria-label` on star rating |
| 4.5 | 🟡 | `features/booking/components/public/AddressFields.tsx:188` | One hardcoded English fallback in a file that otherwise consistently uses `useTranslations` |
| 5.1 | 🔴 | `features/booking/api/public.ts:30` | `createBooking()` — raw `fetch()` to the BFF URL instead of `bffClient.post(...)`, no documented exemption (unlike the other raw-fetch sites elsewhere in the codebase, which cite TD29/isomorphic constraints inline) |
| 5.2 | 🔴 | `features/booking/api/public.ts:90` | `submitGuestBookingInfo()` — same pattern |

**Additional observations (not counted in the 16, reported as structural characteristics rather than discrete defects):**
- `shared/lib/api/bff-server.ts` has no `import 'server-only'` guard, unlike `bff-client.ts`'s `import 'client-only'` — asymmetric build-time enforcement of a documented rule, no live violation found today.
- `features/platform/components/hotsite/modules/module-config-panel.types.ts:15-21` — a documented, deliberate `as unknown as T` casting helper shared by all 8 hotsite module config panels; centralizes the risk but is not itself hidden/undocumented.
- The pattern `return res.json() as Promise<X>` appears 50+ times across the API layer with no runtime schema validation backing any of it — read as one systemic architectural characteristic, not 50 separate line items.

---

## Cross-validated findings

Two findings were produced independently by both the checklist run and the freeform baseline, working from completely unrelated prompts with no shared context:
1. **`staff.ts`/`staff.server.ts` misnaming** (Part 1 WEB-7 = Part 2 Web #1.1) — very high confidence this is real, not a hallucination.
2. **Web readonly-props cleanliness** — both runs independently confirmed zero violations across all component prop interfaces.

## Caveat — excluded from the count above

- **BFF "architecture drift"**: the baseline observed that `apps/bff/src/features/` is flat, with no `presentation/`/`application/`/`infrastructure/` subfolders, even though `CLAUDE.md` §11 documents that shape for BFF domain slices. This is ambiguous — it could mean the code needs restructuring, or that the docs are aspirational/stale and never applied to the BFF. Noted for awareness; not counted as one of the 61, and not tagged, since I can't tell which side is wrong without more digging.

## Related prior TD

- **`TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md`** (resolved 2026-07-14) covered `@ikaro/types` drift on `LoyaltyBalanceResponse`, `services`, `customers`, and `staff` — all closed. It never examined `LoyaltyEntryItem`/`LoyaltyRedemptionItem` (items 2.1/2.2 above), which appear to have been added to `@ikaro/types` after TD09 was written and have drifted since. Worth linking if either becomes a story.

## How this was produced

- Both runs used this session's model, one pass each (not the 3x-repeat variance protocol skill-creator recommends — no data on run-to-run consistency for either configuration).
- Several findings were independently re-verified against live source rather than taken on the auditing agent's word alone: BE-3's mock-factory ground truth, WEB-4's jsdom-pragma ground truth, the WEB-2/WEB-4 stale-path fix, BFF-1's controller branching, and the `LoyaltyEntryItem`/`LoyaltyRedemptionItem` shape drift.
- Full reports, grading, and the benchmark comparison lived in the session scratchpad (not committed to the repo) — this file is the durable record.

## Suggested triage grouping (optional — not a commitment)

If this snapshot gets acted on:
1. **🔴 REAL items first** — these either match a rule already written down in `CLAUDE.md`, or are cross-validated, or are security/correctness-adjacent (e.g. `3.1` backend authz gap, `2.1`/`2.2` type drift, `5.1`/`5.2` raw fetch, `4.1`–`4.4` localization gaps, `E1` duplicated JWT logic).
2. **🟡 DEBATABLE items** — candidates for a team conversation on duplication tolerance before committing to a refactor.
3. **⚪ STYLISTIC items** — probably skip unless already touched by other work in the same area.

---

## Implementation Stories (🔴 REAL items only)

All 17 🔴-tagged findings, re-verified directly against current source on 2026-07-23 (no stale claims — every file:line below was read, not taken on the audit's word), grouped into 10 small stories and ordered by criticality. The 🟡/⚪ tiers are **not** included here — they stay as open rows in the Part 2 tables above pending a team decision on duplication tolerance. Each story is independently reviewable/landable, same convention as `td/TD-18-19-20-BAD-SMELL-VIOLAVIONS.md`'s Implementation Stories — mark a story `✅ Done` in place once merged (no separate `/mark-done` command for TD stories).

### Story 1 — Customer booking-ownership check is controller-only, not use-case-enforced 🔴 Critical ✅ Done

**Landed**: PR #204 (2026-07-24), `fix/td31-s01-booking-ownership-check`. Implemented as specced, plus one fix from Codex's cross-tool review: the ownership comparison originally used a truthy check (`if (requestingCustomerId && ...)`), which silently treated an empty-string `requestingCustomerId` as "no requester supplied" instead of a mismatch — changed to `requestingCustomerId !== undefined`, with a regression test added.

**Source**: Backend 3.1

**Target files**:
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking.controller.ts:143-159` (`getOne()`)
- `apps/backend/src/contexts/booking/application/use-cases/get-booking-by-id.use-case.ts`
- `apps/backend/src/contexts/booking/application/use-cases/get-booking-by-id.use-case.spec.ts`

**Problem**: `getOne()` calls `GetBookingByIdUseCase.execute({ bookingId, tenantId, cancellationWindowHours })` — no notion of *who* is asking — then in a `.then()` callback checks `if (actorType === 'CUSTOMER' && result.customerId !== actorId) throw new BookingNotFoundError(id)`. The ownership rule (a customer can only fetch their own booking) exists nowhere except this one HTTP handler. Any other caller of `GetBookingByIdUseCase` (a future controller, a cron job, an event handler) gets zero protection, and the rule has no use-case-level test coverage.

**Work required**:
1. Add `requestingCustomerId?: string` to `GetBookingByIdUseCaseInput` (or equivalent DTO name in that file).
2. Inside `execute()`, after loading the booking, if `requestingCustomerId` is provided and doesn't match `result.customerId`, throw the same `BookingNotFoundError` the use case already imports/uses elsewhere in this context (do not leak "forbidden" vs "not found" — the existing behavior returns 404, keep that shape to avoid information disclosure about booking existence).
3. Update `booking.controller.ts:144-159` to pass `requestingCustomerId: actorType === 'CUSTOMER' ? actorId : undefined` in the DTO and remove the `.then()` ownership check — the controller should just call `.execute(...).catch(mapBookingError)` like every sibling method in this controller (`list()`, `create()`, etc. — see the same file for the pattern).
4. Add unit tests to `get-booking-by-id.use-case.spec.ts` covering: customer requesting their own booking (succeeds), customer requesting someone else's booking (throws `BookingNotFoundError`), staff/manager requesting any booking in-tenant (no `requestingCustomerId` passed, succeeds).

**Why this order/priority**: This is the only 🔴 item with a direct security/tenant-isolation flavor — CLAUDE.md §2 treats any authorization gap as a defect regardless of coverage. Fix before the others.

**Verification**: `pnpm --filter backend test -- get-booking-by-id`, `pnpm --filter backend type-check`, existing `booking.controller` integration spec (if one exercises `GET /bookings/:id` as a customer) must still pass unchanged.

**Definition of done**: Ownership check lives in the use case, not the controller. New use-case-level tests cover the 3 scenarios above. No behavior change in the HTTP response (still 404 on mismatch, not 403).

---

### Story 2 — `LoyaltyEntryItem`/`LoyaltyRedemptionItem` shapes have drifted from `@ikaro/types` 🔴 Critical ✅ Done

**Landed**: PR #280 (2026-07-27), `fix/td31-s02-loyalty-dead-code` (branch deleted post-merge). Scope diverged significantly from the plan below during story-discovery: all 4 target functions (plus `getLoyaltyBalance`/`getCustomerLoyaltyBalance` in the same file) turned out to be fully dead, duplicated by `features/customer/api.server.ts` and `features/loyalty/dashboard-api.ts` — deleted instead of retyped (see the Discovery update below). Also folded into the same PR, beyond the original scope: Story 20's loyalty item (see its own note), a follow-up deletion of `dashboard-api.ts`'s own unused `getCustomerLoyaltyBalance` (found post-review via a user follow-up question), and two fixes from Codex's cross-tool review — `useRedeemPoints`'s cache-invalidation predicate corrected from `queryKey[2]` to `queryKey[1]` (matching `docs/ANTI_PATTERNS.md`'s documented `[namespace, tenantId, ...params]` convention), plus a stale-reference note added to `plan/M13-DASHBOARD-FRONTEND.md`.

**Source**: Web 2.1, 2.2

**Target files**:
- `apps/web/features/loyalty/api.ts:9-17` (`LoyaltyEntryItem`), `:24-29` (`LoyaltyRedemptionItem`)
- `packages/types/src/loyalty.dto.ts:17-25` (canonical `LoyaltyEntryItem`), `:27-34` (canonical `LoyaltyRedemptionItem`)
- Any component/hook consuming `getLoyaltyEntries()` / `getLoyaltyRedemptions()` / `getCustomerLoyaltyEntries()` / `getCustomerLoyaltyRedemptions()` from `apps/web/features/loyalty/api.ts` — grep `from '@/features/loyalty/api'` under `apps/web/features/loyalty/` and `apps/web/shells/dashboard/` before starting, and treat every hit as in-scope.

**Problem**: The web-local interfaces declare `entryId`/`serviceId` (entry) and `redemptionId` (redemption), with no `bookingId` field at all. The real BFF response shape (`packages/types/src/loyalty.dto.ts`) uses `id`/`bookingId`/`serviceName` (entry) and `id`/`bookingId`/`amountDeducted` (redemption) — no `entryId`, `serviceId`, or bare `redemptionId`. TypeScript cannot catch this because the web file declares its own parallel interfaces instead of importing the canonical ones — any field access on the wrong name compiles fine and returns `undefined` at runtime. This is the same category of bug `TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md` fixed for `LoyaltyBalanceResponse`, `services`, `customers`, `staff` — but TD09 never looked at these two, and they've drifted since (confirmed live, not historical).

**Discovery update (2026-07-27, story-discovery for PR 2)**: The prescribed fix below is superseded. Two things the original triage missed:
1. **The "canonical types" named here are the wrong family for 2 of the 4 functions.** `getLoyaltyEntries()`/`getLoyaltyRedemptions()` call the *customer-facing* BFF routes (`/loyalty/entries`, `/loyalty/redemptions`), which actually return `CustomerLoyaltyEntriesResponse`/`CustomerLoyaltyRedemptionsResponse` (items shaped `entryId`/`pointsEarned`/`expired` and `redemptionId`/`pointsUsed`/`amountSaved`-as-formatted-string/`bookingReference`) — not the `LoyaltyEntryItem`/`LoyaltyRedemptionItem` family this story names, which only matches the *staff/admin* routes (`getCustomerLoyaltyEntries(customerId)`/`getCustomerLoyaltyRedemptions(customerId)`).
2. **All 4 functions (plus `getLoyaltyBalance`/`getCustomerLoyaltyBalance` in the same file) are dead code**, fully duplicated by already-correct, already-live implementations: `features/customer/api.server.ts`'s `fetchLoyaltyBalance`/`fetchLoyaltyEntries`/`fetchLoyaltyRedemptions` (feeds the real customer `LoyaltyPage.tsx`) and `features/loyalty/dashboard-api.ts`'s functions of the *same names* (feeds the real staff `CustomerLoyaltyPage.tsx`). Confirmed via grep: zero real (non-spec) consumers of `api.ts`'s loyalty-read functions or `useLoyalty.ts`'s corresponding hooks anywhere in `apps/web`. Git-blamed to `M13-S01` (generic TanStack Query foundation scaffolded ahead of the real pages); the pages that later got built (M13-S25 onward) used Server Components/`bffServerFetch` and a separate `dashboard-api.ts` instead, and this file was never wired up.

Retyping dead duplicate code doesn't fix anything real — per CLAUDE.md's own anti-pattern ("duplicate read endpoints/use cases for projections of the same aggregate → keep one canonical read endpoint/use case") and the "no workarounds" rule, the correct fix is **deletion**, not a type fix.

**Work required (revised)**:
1. Delete `getLoyaltyBalance`, `getLoyaltyEntries`, `getLoyaltyRedemptions`, `getCustomerLoyaltyBalance`, `getCustomerLoyaltyEntries`, `getCustomerLoyaltyRedemptions` and their now-orphaned local interfaces (`LoyaltyBalanceResponse`, `LoyaltyEntryItem`, `LoyaltyEntriesResponse`, `LoyaltyRedemptionItem`, `LoyaltyRedemptionsResponse`, `LoyaltyPaginationQuery`) from `apps/web/features/loyalty/api.ts`.
2. Delete the corresponding hooks (`useLoyaltyBalance`, `useLoyaltyEntries`, `useLoyaltyRedemptions`, `useCustomerLoyaltyBalance`, `useCustomerLoyaltyEntries`, `useCustomerLoyaltyRedemptions`) from `apps/web/features/loyalty/hooks/useLoyalty.ts`.
3. Remove the matching `describe` blocks from `api.spec.ts` and `useLoyalty.spec.tsx`.
4. Keep `redeemPoints`/`useRedeemPoints`/`RedeemPointsRequest`/`RedeemPointsResponse` untouched in both files — no duplicate exists, no drift (these types aren't in `@ikaro/types` at all), just an unbuilt feature.

**Why this order/priority**: Silent type-safety hole on a customer-facing loyalty feature — second only to the authz gap in correctness risk. (The risk was theoretical, not live, since the code path was dead — but the duplication itself was real and worth removing.)

**Verification**: `pnpm --filter web type-check`, `pnpm --filter web test -- loyalty`. No consumer fix-up needed — confirmed zero real callers exist.

**Definition of done**: `apps/web/features/loyalty/api.ts` and `hooks/useLoyalty.ts` contain only `redeemPoints`/`useRedeemPoints` and their types — the 6 duplicate read functions/hooks and their local interfaces are gone. Add a note in `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md` linking this fix, since TD09 explicitly didn't cover these two types.

---

### Story 3 — BFF re-implements JWT decoding instead of reusing `CurrentUserPayload` 🔴 High ✅ Done

**Landed**: PR #288 (2026-07-28), `fix/td31-pr3-bookings-controller-cleanup` (branch deleted post-merge), as part of the collapsed PR 3.

**Source**: BFF E1

**Target files**:
- `apps/bff/src/features/booking/bookings.controller.ts:203-221` (`tryDecodeUserJwt()`)
- `apps/bff/src/shared/decorators/current-user.decorator.ts:4` (canonical `CurrentUserPayload` interface)
- Likely a new shared file, e.g. `apps/bff/src/shared/auth/decode-user-jwt.ts` (exact location is an implementation choice — keep it in `shared/` since this is cross-cutting auth logic, not booking-specific)

**Problem**: `tryDecodeUserJwt()` hand-decodes the JWT and re-declares an inline zod schema (`sub`, `tenantId`, `tenantSlug`, `tenantName`, `userName`, `role`, `locale`) that duplicates the shape of `CurrentUserPayload` from `current-user.decorator.ts:4`. This is exactly the drift pattern CLAUDE.md's D1-D7 finding already flags elsewhere in the BFF (`req.user` cast to different shapes across 7 files) — a second, independent copy of the same payload shape is one more place that can silently diverge from the real one.

**Work required**:
1. Extract a shared helper (e.g. `decodeUserJwt(authHeader, secret): CurrentUserPayload | null`) that wraps `tryDecodeRawJwt()` + zod-parses against a schema derived from (or matching) `CurrentUserPayload`, placed under `apps/bff/src/shared/`.
2. Replace `tryDecodeUserJwt()` in `bookings.controller.ts` with a call to the shared helper — this route is `@Public()` so it still needs manual decode (the `JwtAuthGuard` doesn't run), but the decode logic itself shouldn't be re-implemented per-controller.
3. Grep for any other ad-hoc JWT decode in the BFF (this pattern may recur — the D1-D7 finding suggests it does) and point them at the same helper if found; if none, don't over-scope this story.

**Why this order/priority**: Duplicated auth-adjacent logic is a maintenance/security risk per CLAUDE.md's own framing of E1 — high priority, but not itself an active vulnerability today (unlike Story 1), so it ranks below the two correctness/security items above.

**Verification**: `pnpm --filter bff test -- bookings.controller`, `pnpm --filter bff type-check`. Confirm `generateAttachmentSignedUrl()`'s three scenarios (JWT user / guest token / anonymous tenant slug — see BFF-1 in Part 1) still all pass, since this method is the sole caller of the decode logic.

**Definition of done**: No inline zod schema duplicating `CurrentUserPayload`'s shape remains in `bookings.controller.ts`. One shared, reusable JWT-decode helper exists for `@Public()` routes that need manual decoding.

---

### Story 4 — `fetchLoyaltyBalance()` silently swallows all errors 🔴 High ✅ Done

**Landed**: PR #288 (2026-07-28), `fix/td31-pr3-bookings-controller-cleanup` (branch deleted post-merge), as part of the collapsed PR 3. Uses `AppLogger` (never NestJS's raw `Logger` — see the PR 3 discovery-update note below for why that distinction mattered here).

**Source**: BFF A2

**Target files**:
- `apps/bff/src/features/booking/bookings.controller.ts:319-328` (`fetchLoyaltyBalance()`)

**Problem**: `catch { return null }` treats every failure mode identically — a real backend 500, a timeout, an auth failure, and "customer genuinely has no loyalty balance" are all indistinguishable to the caller and to observability. `getOne()` (line 313-314) then renders `loyaltyBalance: null` in the staff booking detail view, which reads as "no points" even when the real cause was a backend outage.

**Work required**:
1. Inject the BFF's existing logger (check `apps/bff/src/shared/` for the standard logging pattern already used by sibling controllers — reuse it, don't invent a new one) into `BookingsController`.
2. In the `catch` block, log the error (include `customerId`, tenant context if available in the request scope) before returning `null`, so a real backend failure is visible in logs/traces instead of silently rendering as "no balance."
3. Do not change the return contract (`number | null`) — this is a small, surgical fix, not a redesign of the error path.

**Why this order/priority**: Silent failure with observability impact, but lower severity than Stories 1-3 since the fallback behavior (render `null`) is not itself incorrect from the caller's perspective — it's just unobservable when wrong.

**Verification**: `pnpm --filter bff test -- bookings.controller` — add a test asserting the logger is called with the error when the balance fetch throws.

**Definition of done**: A thrown error inside `fetchLoyaltyBalance()` is logged before the `null` fallback is returned.

---

### Story 5 — N+1 loyalty-balance fan-out in customer search 🔴 High (largest story — needs a new backend endpoint) ✅ Done

**Landed**: PR #293 (2026-07-30), `feat/td31-pr5-loyalty-balance-batch` (branch deleted post-merge). Two deviations from the plan below, both raised by the user after merge-readiness and fixed in follow-up commits on the same PR before it was merged:
1. **Naming**: `GetLoyaltyBalancesBatchUseCase`/`internal-loyalty-read.controller.ts` as spec'd didn't match this codebase's established `GetXxxByIdUseCase`/`GetXxxUseCase` (plural, no suffix) convention already used by `staff`/`platform` (`GetStaffByIdUseCase`/`GetStaffUseCase`, `GetTenantByIdUseCase`/`GetTenantsUseCase`). Renamed throughout to `GetLoyaltyBalancesUseCase`/`LoyaltyBalanceItemResult`, directory `get-loyalty-balances/`.
2. **Endpoint placement**: the `/internal/loyalty/balances` endpoint as spec'd (modeled on `/internal/tenants?ids=`) copied the wrong reference. `/internal/tenants` bypasses `RequestContext` because Tenant lookups are inherently cross-tenant (no "current tenant" to check a tenant-ID lookup against); a loyalty-balance batch read is scoped to exactly the caller's own tenant, identical in shape to the already-guarded `getBalanceAdmin()` single-customer route. Moved into `LoyaltyController` as `GET /loyalty/balances`, guarded by `StaffOrManagerRoleGuard`, deriving `tenantId` from `RequestContext` like its sibling — no `InternalApiGuard`, no explicit `tenantId` param needed from the BFF (dropped `@CurrentUser()` from `searchCustomers()` entirely).

Also fixed during CodeRabbit review on the PR: a real gap where `tenantId`/`customerIds` could bind as `string[]` on a repeated query param and throw an uncaught 500 instead of the intended 400 (now validates `typeof === 'string'` first). Two other CodeRabbit findings were reviewed and skipped as false positives (a `jest.fn()` mock of the TypeORM adapter itself — no InMemory double exists for the thing under test — and a doc-approval flag for an edit already explicitly approved in conversation).

**Source**: BFF A3

**Target files**:
- `apps/bff/src/features/customer/customers.controller.ts:47-68` (`searchCustomers()`)
- **New** backend use case, e.g. `apps/backend/src/contexts/loyalty/application/use-cases/get-loyalty-balances-batch.use-case.ts` (+ spec)
- `apps/backend/src/contexts/loyalty/application/ports/loyalty-balance-repository.port.ts:5-8` (`ILoyaltyBalanceRepository` — needs a new batch-read method)
- The repository's TypeORM adapter (find via `grep -rn "ILoyaltyBalanceRepository" apps/backend/src/contexts/loyalty/infrastructure/`)
- **New** backend controller, e.g. `apps/backend/src/contexts/loyalty/infrastructure/controllers/internal-loyalty-read.controller.ts` (+ integration spec) — model this directly on the existing batch pattern at `apps/backend/src/contexts/platform/infrastructure/controllers/internal-tenant-read.controller.ts:44-70` (`GET /internal/tenants?ids=a,b,c`), which solves the exact same "BFF needs N records in one call" problem for tenants.

**Problem**: `searchCustomers()` does one `Promise.all(items.map(...))` HTTP round-trip per search result to fetch that customer's loyalty balance — a real N+1 across the network (BFF → backend), not just in-process. This gets worse linearly with the search result/page size. `customers.controller.ts:89-118` (`getTenants()`, BFF A4, 🟡, not in scope here) already shows the *fix* pattern in the same file: batch-fetch tenant info via `/internal/tenants?ids=...`, and only fan out for the one thing that has no batch endpoint yet (per-tenant balance). This story closes that gap for `searchCustomers()`'s balance lookups specifically.

**Work required (backend)**:
1. Add `findManyByCustomers(tenantId: string, customerIds: string[]): Promise<LoyaltyBalance[]>` to `ILoyaltyBalanceRepository` (`loyalty-balance-repository.port.ts`) and implement it in the TypeORM adapter with a single `WHERE tenant_id = :tenantId AND customer_id IN (:...customerIds)` query.
2. Add `GetLoyaltyBalancesBatchUseCase` (model directly on `GetLoyaltyBalanceUseCase` at `apps/backend/src/contexts/loyalty/application/use-cases/get-loyalty-balance/get-loyalty-balance.use-case.ts` — same repo, same tenant-scoping, but takes `customerIds: string[]` and returns `{ customerId: string; currentPoints: number }[]`, defaulting missing customers to `currentPoints: 0` the same way the single-customer use case defaults `balance?.currentPoints ?? 0`).
3. Add a new internal controller with `@Get()` route reading a `customerIds` query param (comma-separated, same parsing/validation style as `internal-tenant-read.controller.ts:44-65` — empty/missing param is a 400 via `throwProblemDetail` + `GenericErrorCode.FIELD_REQUIRED`), registered under a path like `internal/loyalty/balances`.
4. Register the new use case/repository method/controller in the loyalty module's providers/controllers array and in `integration-global-setup.ts` if a new entity/migration is involved (it isn't here — this reuses the existing `LoyaltyBalanceEntity`).

**Work required (BFF)**:
5. Replace the `Promise.all(items.map(...))` loop in `searchCustomers()` with a single call to the new `/internal/loyalty/balances?customerIds=...` endpoint (same shape as the existing `/internal/tenants?ids=...` call at `customers.controller.ts:98`), then map results back onto `items` by `customerId`.

**Why this order/priority**: Real perf risk that compounds with tenant growth, but requires net-new backend work (not a pure refactor), so it's correctly the biggest and last-to-start of the "high priority" tier — sequence it after Stories 1-4 land, or in parallel on a separate branch since it touches different files entirely.

**Verification**: Backend: `pnpm --filter backend test -- get-loyalty-balances-batch`, new integration spec for the internal controller (follow `internal-tenant-read.controller.integration.spec.ts`'s structure). BFF: `pnpm --filter bff test -- customers.controller`, confirm `searchCustomers()` now makes exactly 2 backend calls total (search + batch balance) regardless of result-set size.

**Definition of done**: `searchCustomers()` makes one batch call for balances, not one per customer. New backend batch endpoint has its own unit + integration test coverage. No change to `CustomerSearchListResponse`'s external shape.

---

### Story 6 — Booking/Loyalty controllers assemble composite responses inline instead of via mappers 🔴 Medium ✅ Done

**Landed**: PR #288 (2026-07-28), `fix/td31-pr3-bookings-controller-cleanup` (branch deleted post-merge), as part of the collapsed PR 3.

**Source**: BFF A1, A6

**Target files**:
- `apps/bff/src/features/booking/bookings.controller.ts:274-299` (`list()`)
- `apps/bff/src/features/booking/bookings.mapper.ts` (existing mapper file — `toCustomerBookingListItem`, `toStaffBookingCard` already live here)
- `apps/bff/src/features/loyalty/loyalty.controller.ts:162-196` (`getCustomerLoyaltyDetail()`)
- `apps/bff/src/features/loyalty/loyalty.mapper.ts` (or equivalent — check for an existing loyalty mapper file first; per CLAUDE.md's "second mapper function → extract to `<module>.mapper.ts`" rule, one may already exist for `toStaffLoyaltyEntry`/`toStaffLoyaltyRedemption`)

**Problem**:
- `list()` already delegates per-item shaping to `toCustomerBookingListItem`/`toStaffBookingCard`, but the outer response envelope (`{ items, total, page, limit }` vs `{ items, total, page, limit }` — two near-identical inline object literals differing only by which mapper ran) is assembled directly in the controller instead of one function like `toBookingListResponse(backend, query, isStaffOrManagerRole(user.role))`.
- `getCustomerLoyaltyDetail()` runs a 4-way `Promise.all` (customer profile, enriched balance, entries, redemptions) and hand-assembles the `StaffCustomerLoyaltyDetailResponse` object directly in the controller body — this is exactly the "duplicate read endpoints/use cases for projections of the same aggregate" style smell CLAUDE.md's anti-pattern table warns about, just at the composition level rather than the endpoint level.

**Work required**:
1. In `bookings.mapper.ts`, add `toBookingListResponse(backend: BookingListResponse, query: StaffListBookingsQuery, isStaffOrManager: boolean): StaffBookingListResponse | CustomerBookingListResponse` and have `list()` call it instead of building the two branches inline.
2. In the loyalty mapper file, add a function that takes the 4 already-fetched pieces and returns `StaffCustomerLoyaltyDetailResponse` — `getCustomerLoyaltyDetail()` keeps the `Promise.all` (that part isn't the smell — parallel fetches are fine) but delegates only the *assembly* to the mapper.
3. Keep both controller methods' external route contracts identical — this is a pure extract-function refactor, no behavior change.

**Why this order/priority**: Architecture/maintainability cleanup, not a correctness or security issue — real and matches a documented rule, but ranks below anything with an actual failure mode.

**Verification**: `pnpm --filter bff test -- bookings.mapper loyalty` (extend `bookings.mapper.spec.ts`-style tests to cover the new functions), `pnpm --filter bff type-check`.

**Definition of done**: Neither `list()` nor `getCustomerLoyaltyDetail()` assembles its final response object inline — both delegate to a named mapper function.

---

### Story 7 — Raw `fetch()` calls bypass the required BFF transport helpers 🔴 Medium ✅ Done

**Landed**: PR #297 (2026-07-31), `fix/td31-pr13-bff-transport-fetch` (branch deleted post-merge), as part of PR 13.

**Discovery update (2026-07-31, story-discovery for PR 13):** Scope narrowed from the story's original "4 call sites" claim to 2 real fixes. `createAttachmentSignedUrl()`/`createGuestAttachmentSignedUrl()` (the 2 sites found during verification, not in the original TD31 count) target this app's own `/api/bookings/attachments/signed-url` Route Handler, not the BFF directly — confirmed out of scope and left on raw `fetch()` with a documented inline exemption, since routing them through `bffClient` would send the request through the generic `/v1/[...path]` same-origin gateway instead of the dedicated Route Handler, dropping the guest-token-overrides-cookie safety check that Route Handler implements (a real risk of an upload being misattributed to the wrong actor/tenant). Only `createBooking()` and `submitGuestBookingInfo()` were real violations — both migrated to `bffClient`.

`AuthError` was extended with a `.data` field (matching `ForbiddenError`'s existing shape) to preserve `submitGuestBookingInfo()`'s guest-token-expired UX through the migration — a root-cause fix, not a workaround, since `bffClient`'s 401 interceptor branch previously discarded the response body entirely. `CreateBookingError`/`SubmitGuestBookingInfoError` deleted; both consumers (`BookingForm.tsx`, `SubmitInfoForm.tsx`) now share one `extractProblemDetailShape()` helper in `errors.ts`.

Found and fixed via Codex's cross-tool review (Architecture + Requirements lenses, both independently): `extractProblemDetailShape()` duplicated an already-documented canonical helper, `extractProblemCode()`/`resolveErrorMessageFromApiError()` in `shared/lib/i18n/resolve-error-message.ts` (named in `docs/ENGINEERING_RULES.md`'s frontend-resolver section), whose own comment claimed `AuthError` "has no code to extract" — stale after the `.data` change above. Consolidated into one implementation (`extractProblemCode()` now delegates to `extractProblemDetailShape()`); `docs/ENGINEERING_RULES.md` updated to match. Not just cleanup — `AUTH_UNAUTHORIZED` already had real translations in both locale catalogs that no dashboard call site could previously reach, since every 401 fell through to the generic fallback message.

**Source**: Web 5.1, 5.2 (doc undercounts — 4 call sites confirmed, not 2)

**Target files**:
- `apps/web/features/booking/api/public.ts:30` (`createBooking()`)
- `apps/web/features/booking/api/public.ts:90` (`submitGuestBookingInfo()`)
- `apps/web/features/booking/api/public.ts:119` (attachment signed-url call — **not in the original TD31 count, found during verification**)
- `apps/web/features/booking/api/public.ts:148` (second attachment signed-url call — **also not in the original count**)

**Problem**: CLAUDE.md's transport rule is explicit — "never write a raw `fetch()` URL outside" `bffServerFetch`/`bffPublicFetch`/`bffClient`. All 4 sites in this file use raw `fetch()` with no documented exemption (contrast with other raw-`fetch()` sites elsewhere in the codebase that cite TD29/isomorphic constraints inline — grep the file for any such comment before assuming these are unexempted; if verification during implementation finds a real isomorphic constraint, document it inline instead of forcing the helper).

**Work required**:
1. For each of the 4 call sites, determine whether the call originates from a Server Component/Route Handler context (→ `bffPublicFetch`) or truly needs to run isomorphically client+server (→ check `bffClient` usage feasibility first, since `createGuestBookingRequest` etc. may be called from client components).
2. Replace each raw `fetch()` with the correct helper from `@/shared/lib/api/bff-server` or `@/shared/lib/api/bff-client` per CLAUDE.md's transport rules.
3. If any of the 4 genuinely cannot use a helper (e.g. a real isomorphic/edge-runtime constraint), add the same kind of inline comment the other TD29-exempted sites use, rather than leaving it silently unexplained.

**Why this order/priority**: Clear, mechanical rule violation with low fix risk — do after the architecture-cleanup story since it's isolated to one file and has no cross-cutting ripple.

**Verification**: `pnpm --filter web test -- public` (booking public API tests), `pnpm --filter web type-check`. Manually exercise the guest booking flow if a dev server check is wanted (ask before starting one, per the Local verification gate).

**Definition of done**: Zero raw `fetch()` calls remain in `apps/web/features/booking/api/public.ts` without either being replaced by a transport helper or carrying an explicit documented exemption.

---

### Story 8 — Hardcoded pt-BR strings with no `useTranslations` 🔴 Medium ✅ Done

**Landed**: PR #296 (2026-07-31), `fix/td31-pr14-web-i18n-type-dedup` (branch deleted post-merge), as part of PR 14. Also folded into the same PR: Story 20's `AddressFields.tsx` remainder (see Story 20's Landed note).

**Source**: Web 4.1, 4.2, 4.3, 4.4

**Target files**:
- `apps/web/shells/dashboard/components/WeekNav.tsx:65` (`aria-label="Período anterior"`), `:79` (`aria-label="Próximo período"`) — file has no `useTranslations` import at all
- `apps/web/shells/hotsite/components/Footer.tsx:15` (`copyrightNote = data.copyrightNote ?? 'Todos os direitos reservados.'`)
- `apps/web/shells/hotsite/components/TestimonialCard.tsx:17` (hardcoded pt-BR `aria-label` on star rating)
- `packages/i18n/locales/pt-BR/web.json` and `packages/i18n/locales/en/web.json` — dashboard components use the `dashboard` namespace (see `Sidebar.tsx`/`Topbar.tsx` for the `useTranslations('dashboard')` / `useTranslations('dashboard.<subsection>')` pattern), hotsite components use the `hotsite` namespace (see `TestimonialsModule.tsx`/`GalleryModule.tsx` for `useTranslations('hotsite')`) — an existing `hotsite.footer`/`hotsite.testimonials` section may already exist in `web.json` (check around the editor-config-panel keys before adding a duplicate section) — reuse it if the keys fit, add new keys under the right existing section otherwise.

**Problem**: Direct violation of CLAUDE.md §7 Testing: "every new dashboard UI component must be localization-ready... no hardcoded visible copy." These are existing components that never got wired up, not new ones — but the rule's intent applies equally.

**Work required**:
1. `WeekNav.tsx`: add `useTranslations('dashboard')` (or a more specific sub-namespace matching the file's role — check how sibling schedule components are namespaced), replace both hardcoded `aria-label`s with `t('weekNav.previousPeriod')`/`t('weekNav.nextPeriod')` (or whatever key names fit the existing `dashboard` namespace's conventions).
2. `Footer.tsx`: replace the hardcoded fallback with `t('footer.copyrightDefault')` (or similar) via `useTranslations('hotsite')`.
3. `TestimonialCard.tsx`: same pattern for the star-rating `aria-label`.
4. Add the new keys to **both** `packages/i18n/locales/pt-BR/web.json` and `packages/i18n/locales/en/web.json` in the same commit — CLAUDE.md's exhaustiveness test fails CI on a missing translation in either locale (same mechanism as the `AUTH_RATE_LIMITED` precedent in the anti-patterns table).
5. **Before closing this story, run a full grep sweep** (`grep -rn "aria-label=\"[À-ú]" apps/web/shells apps/web/features` or similar for other Portuguese-accented hardcoded strings) — this story's own verification already found 2 more instances than the original TD31 count, so treat 4 as a floor, not a ceiling.

**Why this order/priority**: Real, cheap to fix, matches a written rule — but purely cosmetic/accessibility impact for pt-BR-only tenants (which is most of them today), so ranks below anything with a functional or type-safety consequence.

**Verification**: `pnpm --filter web test -- WeekNav Footer TestimonialCard`, `pnpm --filter web type-check`, i18n exhaustiveness test (check `apps/web`'s test suite for the TD23-Story-17 exhaustiveness spec and confirm it still passes with the new keys).

**Definition of done**: No hardcoded pt-BR (or English) visible copy remains in the 3 named components (or any additional ones the grep sweep turns up). Both locale files have matching keys.

---

### Story 9 — `booking/api/staff.ts` is misnamed after the wrong aggregate 🔴 Low (mechanical, wide but shallow ripple) ✅ Done

**Landed**: PR #316 (2026-08-04), `fix-td31-pr12-booking-slice-reorg` (worktree removed post-merge), bundled with Story 11 as PR 12. Discovery found the real importer count was 17 files, not the 8 originally documented — `staff.server.ts`'s importers (5 files, including 3 `app/dashboard/**` route files and `shells/dashboard/model/booking-route.server.ts` + its spec) were never counted separately from `staff.ts`'s. All 17 updated, plus 2 renamed spec files' own internal self-imports (`./staff` → `./booking`) that `git mv` didn't touch, and a stale `staffApi` local variable in `useSchedule.spec.tsx` renamed to `bookingApi` for consistency. Codex's cross-tool review caught 2 real findings, both fixed in the same PR: `docs/24-BFF_ARCHITECTURE.md`'s and `plan/M13-DASHBOARD-FRONTEND.md`'s stale references to the deleted `staff.ts`/`staff.server.ts` paths.

**Source**: WEB-7 (Part 1) = Web 1.1 (Part 2) — cross-validated by two independent audit runs

**Target files**:
- `apps/web/features/booking/api/staff.ts` and `apps/web/features/booking/api/staff.server.ts` (rename targets — every export, e.g. `listBookings`, `getBooking`, `approveBooking`, `cancelBooking`, `rescheduleBooking`, `completeBooking`, `requestMoreInfo`, `submitBookingInfo`, `createAuthenticatedBooking`, is a Booking-aggregate operation, not a Staff one)
- Confirmed importers (8 files, verified via grep on 2026-07-23):
  - `apps/web/features/booking/hooks/useBookings.ts`
  - `apps/web/features/booking/hooks/useBookingMutations.ts`
  - `apps/web/features/booking/schedule/useSchedule.ts`
  - `apps/web/features/booking/components/dashboard/bookings/MarkCompleteBookingPage.tsx`
  - `apps/web/features/platform/components/hotsite/modules/BookingPhotoPicker.tsx`
  - `apps/web/features/platform/components/hotsite/modules/GalleryImageManager.spec.tsx` (both an import and a `vi.mock(...)` call)
  - `apps/web/features/platform/components/hotsite/modules/GalleryConfigPanel.spec.tsx` (`vi.mock(...)` only)
  - `apps/web/features/platform/components/hotsite/HotsiteEditor.spec.tsx` (`vi.mock(...)` only)
- The real Staff-domain API stays untouched at `apps/web/features/staff/api/staff.ts` / `staff.server.ts` — do not merge or collide with it.

**Work required**:
1. Rename `apps/web/features/booking/api/staff.ts` → `apps/web/features/booking/api/booking.ts` (or `bookings.ts`, matching whatever singular/plural convention the sibling `apps/web/features/staff/api/staff.ts` and other domain-slice API files use — check before deciding) and `staff.server.ts` → the matching `booking.server.ts`.
2. Update all 8 importers' import paths (both real imports and `vi.mock('@/features/booking/api/staff', ...)` calls — the mock path string must change too, or the mock will silently stop applying and tests will hit the real module).
3. Grep once more after the rename (`grep -rn "features/booking/api/staff" apps/web`) to confirm zero stragglers, including any barrel/index re-exports.

**Why this order/priority**: Purely a naming/maintainability issue with no functional risk, but the rename touches 8+ files — low severity, so it's sequenced last among the "real, worth doing" items, not because it's hard, but because nothing depends on it and it's easy to get a stale import wrong under time pressure if rushed.

**Verification**: `pnpm --filter web type-check` (will catch any missed import), `pnpm --filter web test -- useBookings useBookingMutations useSchedule MarkCompleteBookingPage BookingPhotoPicker GalleryImageManager GalleryConfigPanel HotsiteEditor`.

**Definition of done**: No file under `apps/web/features/booking/` is named `staff.ts`/`staff.server.ts`. All imports and `vi.mock()` paths updated. Zero hits for `features/booking/api/staff` anywhere in `apps/web`.

---

### Story 10 — Test hygiene: builder bypass + a unit spec contradicting its own documented exemption 🔴 Low ✅ Done

**Landed**: PR #315 (2026-08-04), `fix/td31-pr11-loyalty-test-hygiene` (worktree removed post-merge). Implemented exactly as specced — all 4 raw `.save({...})` literals in `booking-completed.handler.integration.spec.ts` replaced with `LoyaltyBalanceEntityBuilder`; `apps/web/app/not-found.spec.tsx` deleted. Codex's cross-tool review (4-perspective) and Copilot both found 0 critical/important/minor findings; CodeRabbit and SonarCloud raised nothing.

**Source**: Backend 4.2, Web 3.1

**Target files**:
- `apps/backend/src/contexts/loyalty/infrastructure/events/booking-completed.handler.integration.spec.ts:181,227,265,270` (confirmed: `ds.getRepository(LoyaltyBalanceEntity).save({ tenantId, customerId, currentPoints: ... })` raw literals at all 4 lines)
- `apps/backend/src/test/builders/` — find or confirm `LoyaltyBalanceEntityBuilder`'s exact path and its `withXxx()`/`build()` API before writing replacement calls
- `apps/web/app/not-found.spec.tsx` (delete or fix)
- `apps/web/e2e/not-found.spec.ts` (no change needed — already correct; read its header comment for context)
- `sonar-project.properties:14` (already correctly excludes `apps/web/app/not-found.tsx` from coverage — no change needed, just confirms the spec shouldn't exist)

**Problem**:
- Backend: 4 direct `.save({...})` calls with raw object literals bypass the existing `LoyaltyBalanceEntityBuilder`, violating CLAUDE.md's "Builders mandatory" testing rule.
- Web: `not-found.spec.tsx` unit-tests `not-found.tsx` (an async Server Component) by calling `NotFoundPage()` directly and rendering the resolved element with `@testing-library/react`. This directly contradicts `apps/web/e2e/not-found.spec.ts`'s own header comment, which states this exact file "became... untestable with Vitest's `render()`... Covered here by E2E instead," and contradicts `sonar-project.properties`' explicit coverage exclusion for the same file. The unit spec isn't broken, but it's redundant coverage that actively disagrees with the codebase's own documented rationale for *why* it's E2E-only.

**Work required**:
1. Replace all 4 raw `.save({...})` calls in `booking-completed.handler.integration.spec.ts` with the equivalent `LoyaltyBalanceEntityBuilder` chain (`.withTenantId(...).withCustomerId(...).withCurrentPoints(...).build()` or whatever its actual method names are).
2. Delete `apps/web/app/not-found.spec.tsx` — the E2E spec already covers the same behavior, and the file's own justification for existing (testing an async Server Component with Vitest) is the thing the codebase has explicitly documented as not working here.

**Why this order/priority**: Both are test-hygiene-only findings with zero production impact — correctly the lowest priority in the real-issue tier, useful cleanup but not urgent.

**Verification**: `pnpm --filter backend test -- booking-completed.handler.integration`, `pnpm --filter web test` (confirm removing `not-found.spec.tsx` doesn't drop overall coverage below the gate — it shouldn't, since the file was excluded from coverage accounting anyway).

**Definition of done**: Zero raw entity-literal `.save()` calls remain in the loyalty integration spec. `not-found.spec.tsx` no longer exists; E2E remains the sole coverage for `not-found.tsx`.

---

---

## Implementation Stories — 🟡 tier (2026-07-23 triage conversation)

Decisions made during triage:
1. **Web 1.2/1.3/1.4 (actor-scoped slice convention)** → **owning domain wins**. Documented as a new rule in `CLAUDE.md` §11 (via `.copilot/context.md`) in the same pass as this triage — see Story 11.
2. **BFF architecture-drift caveat (flat `features/` vs documented layered shape)** → **docs were stale/aspirational for the BFF**. `CLAUDE.md` §11's BFF row corrected in the same pass — see Story 12.
3. **The remaining 8 themes** (30 🟡 rows total) → all scoped as stories below, same rigor as the 🔴 tier. No 🟡 item was dropped; a few (`6.1`, `6.2`, `1.4` of Backend, `C7`, `G1`, `H1` of BFF) are ⚪-tagged and intentionally excluded — those stay as-is per the original triage grouping.

### Story 11 — Actor-scoped cross-domain code belongs in the owning domain's slice, not the actor's ✅ Done

**Landed**: PR #316 (2026-08-04), `fix-td31-pr12-booking-slice-reorg` (worktree removed post-merge), bundled with Story 9 as PR 12. Discovery found the suggested grep (`from '@/features/customer/api'`) missed relative-path imports (`'../../api'`) — 4 real consumers used that form (`CancelConfirmPage.tsx`, `InfoSubmitForm.tsx`, `CustomerPhotoUpload.tsx`, and `BookingDetailPage.spec.tsx`, the last one caught only on a post-implementation grep sweep). File layout chosen: `booking/api/customer.ts`/`customer.server.ts` (new files, actor-scoped, mirroring the existing `public.ts` guest-actor split already in that directory) and `loyalty/api.server.ts` (new file) — not folded into `booking.ts`/`booking.server.ts`. Renamed `cancelBooking`→`cancelBookingAsCustomer`, `submitInfo`→`submitBookingInfoAsCustomer` to avoid colliding with Story 9's staff-facing exports of the same name; `fetchCustomerBookings`/`fetchCustomerBookingDetailOrRedirect`/`createCustomerAttachmentSignedUrl`/the 3 loyalty fetchers kept their names (no collision). Copilot's cross-tool review caught a real finding fixed in the same PR: `CustomerFetchError` (previously customer-slice-local) had become a 3-way cross-slice dependency once `booking/api/customer.server.ts` and `loyalty/api.server.ts` both needed it — relocated to `shared/lib/api/errors.ts` alongside its structurally-identical siblings (`AuthError`/`ForbiddenError`/`ApiError`); `withAuthRedirect` stayed in the customer slice (still session/actor-specific, not a generic HTTP concern). Codex's review also flagged missing `bffServerFetch` call-argument assertions in the new fetcher specs — added.

**Source**: Web 1.2, 1.3, 1.4

**Decision**: owning domain wins (matches the existing Staff-facing pattern: `apps/web/features/staff/api/` never held Booking code; Booking ops for staff already live in `apps/web/features/booking/`). Rule now documented in `CLAUDE.md` §11.

**Target files**:
- `apps/web/features/customer/api.ts:46-62` (`cancelBooking`, `submitInfo`, `createCustomerAttachmentSignedUrl`) → move into `apps/web/features/booking/api/` (naming: rename to `cancelBookingAsCustomer`/`submitBookingInfoAsCustomer` or similar to avoid collision with the Story 9 rename's staff-facing `cancelBooking`/`submitBookingInfo` exports — confirm final names against whatever Story 9 lands as)
- `apps/web/features/customer/api.server.ts:42-99` (`fetchCustomerBookings`, `fetchCustomerBookingDetail`, `fetchCustomerBookingDetailOrRedirect` → `apps/web/features/booking/api/`; `fetchLoyaltyBalance`, `fetchLoyaltyEntries`, `fetchLoyaltyRedemptions` → `apps/web/features/loyalty/api.server.ts` or equivalent)
- Every importer of the moved functions (grep `from '@/features/customer/api'` and `from '@/features/customer/api.server'` under `apps/web/` before starting — this is the same kind of ripple as Story 9, do the grep first, don't guess)
- `apps/web/features/customer/api.ts` / `api.server.ts` keep only genuinely Customer-aggregate operations (`getCustomerProfile`, `getCustomerById`, `searchCustomers`, `updateCustomerProfile`, `withAuthRedirect`, `CustomerFetchError`)

**Work required**:
1. Move the Booking-shaped functions listed above into `apps/web/features/booking/api/` (client-side file) and a server-side equivalent; move the Loyalty-shaped ones into `apps/web/features/loyalty/`.
2. Update every importer's path. `withAuthRedirect`/`CustomerFetchError` stay in the Customer slice (they're generic error-handling helpers, not Booking/Loyalty-shaped) — moved functions that need them should import from the Customer slice, which is fine (cross-slice import of a generic helper is not the same smell as owning the wrong domain's business function).
3. Do not change any BFF-facing behavior — this is a pure file-organization move, same route paths, same request/response shapes.

**Verification**: `pnpm --filter web type-check` (surfaces every broken import), `pnpm --filter web test -- customer booking loyalty`.

**Definition of done**: `apps/web/features/customer/api.ts`/`api.server.ts` contain only Customer-aggregate operations. Booking/Loyalty reads and mutations live in their owning slices, actor-scoped by naming, not by folder location.

---

### Story 12 — (Docs only, no code) Correct `CLAUDE.md` §11's BFF layer-shape row ✅ Done

**Source**: BFF architecture-drift caveat

**Target files**: `.copilot/context.md` §11 only.

**Decision**: the documented `features/<domain>/{presentation,application,infrastructure}/` shape for BFF was never actually applied — every BFF domain slice today is flat (`<domain>.controller.ts`, `<domain>.public.controller.ts`, `<domain>.mapper.ts`, `<domain>.types.ts` directly under `features/<domain>/`). Applied directly in this pass — see the `.copilot/context.md` diff alongside this TD update. No code changes; this story exists only to record that the correction happened and why, since a future audit re-flagging the same "drift" should point here instead of reopening the question.

**Definition of done**: `CLAUDE.md` §11's BFF row describes the real flat shape. Done as part of this same edit — no follow-up code work.

---

### Story 13 — Backend: missing email/phone format validation on 3 DTOs 🟡 ✅ Done (superseded — no code needed)

**Resolved independently (2026-08-03, discovery for PR 6)**: no code change needed. All 3 findings are stale — a domain-layer validator now covers all 3 fields, added by other work between the 2026-07-23 audit and today, independent of this TD31 remediation stream:
- `update-tenant-settings.dto.ts` (`businessInfo.phone`/`.email`) → `BusinessInfoValidator.validate()` (`business-info.validator.ts`), throwing `PlatformErrorCode.SETTINGS_BUSINESS_PHONE_INVALID`/`_EMAIL_INVALID`. Tested in `business-info.validator.spec.ts`; confirmed live by running the existing integration test `tenant-settings.controller.integration.spec.ts:279` ("returns 400 for an invalid businessInfo.phone") — it passes today.
- `find-or-create-customer.dto.ts` (`email`) → `Customer.create()`'s `Email.isValid` check, throwing `CustomerErrorCode.EMAIL_INVALID`. Tested in `customer.spec.ts:43-47`.
- `update-customer-profile.dto.ts` (`phone`) → `Customer.updateProfile()`'s `PhoneNumber.isValid` check, throwing `CustomerErrorCode.PHONE_INVALID`. Tested in `customer.spec.ts:89-91`.

Implementing the story's original prescription (copying `request-booking.dto.ts`'s DTO-level `z.email()`/`PhoneErrorCode.FORMAT_INVALID` pattern) would now actively regress this: NestJS's `ZodValidationPipe` runs before the use case/aggregate, so a DTO-level check would shadow the domain layer's already-correct, already-tested, already-translated error codes, making them permanently unreachable — the exact violation CLAUDE.md §8 warns against ("Zod validation rule duplicates a VO's own check → Reuse that VO's error code — don't mint a new one").

Also checked in the same pass: `CUSTOMER_EMAIL_INVALID`'s translation is the generic fallback in both locale files, unlike sibling `CUSTOMER_PHONE_INVALID`'s specific copy — initially flagged as a possible gap, then ruled out. `email` is validated only inside `Customer.create()`, reachable solely from the internal OAuth-login path (`find-or-create-customer.use-case.ts`, populated from Google's own profile data) — `Customer.updateProfile()` (the real, user-editable profile-edit flow) doesn't even accept an `email` parameter. The generic copy is consistent with its true siblings `CUSTOMER_TENANT_ID_REQUIRED`/`CUSTOMER_GOOGLE_OAUTH_ID_REQUIRED` (both same "can't happen from real user input" class), not an oversight. Left unchanged.

**Source**: Backend 1.1, 1.2, 1.3

**Target files**:
- `apps/backend/src/contexts/platform/application/dtos/update-tenant-settings.dto.ts:95-96` (`BusinessInfoSchema.phone`/`.email`)
- `apps/backend/src/contexts/customer/application/dtos/find-or-create-customer.dto.ts:6` (`email: z.string().min(1)`)
- `apps/backend/src/contexts/customer/application/dtos/update-customer-profile.dto.ts:6` (`phone`, no refinement)
- Reference: `apps/backend/src/contexts/booking/application/dtos/request-booking.dto.ts:8` uses `z.email()` for email and `.refine(PhoneNumber.isValid, { error: ..., params: { code: PhoneErrorCode.FORMAT_INVALID } })` for phone (`../../../../shared/value-objects/phone-number.vo`) — copy this exact pattern, don't invent a new one.

**Work required**: Add `z.email()` to the two email fields; add the same `PhoneNumber.isValid` refine block (with matching `PhoneErrorCode.FORMAT_INVALID`) to the two phone fields. `BusinessInfoSchema`'s fields are nullable — keep them nullable, just add format validation on the non-null branch (`.nullable()` after the refinement, matching how nullable phone fields elsewhere in the codebase compose the two).

**Verification**: `pnpm --filter backend test -- update-tenant-settings find-or-create-customer update-customer-profile`, `pnpm --filter backend type-check`.

**Definition of done**: All 3 fields reject malformed input the same way `request-booking.dto.ts`'s equivalents already do.

---

### Story 14 — Backend + BFF: de-duplicate regex/schema constants 🟡 ✅ Done

**Landed**: PR #310 (2026-08-03), `fix/td31-pr7-dedup-regex-constants` (branch deleted post-merge). Implemented largely as specced, with two deviations found and confirmed during discovery/implementation:
1. **A third `country_code` format-regex duplicate**, not in the original scope: `apps/bff/src/features/platform/tenant-settings.controller.ts:63-64` re-implements the same `/^[A-Za-z]{2}$/` check as a lighter, format-only pre-check (it can't call the backend-only `CountryCode.isValid`, mirroring the existing `AddressShapeSchema`-vs-`Address.create()` shape-only-pre-check pattern already used elsewhere). Included in the fix.
2. **Shared location**: rather than app-local `apps/backend/src/shared/` and `apps/bff/src/shared/` constants as the story text suggested, both `DATE_ONLY_PATTERN` (21 sites across both apps) and `COUNTRY_CODE_FORMAT_PATTERN` (3 sites across both apps) were extracted into `@ikaro/validation` — the existing cross-app shared-schema package already holding `phone.ts`/`email.ts`/`address.ts`, imported by both backend and BFF today. Confirmed via `deriveViolation` (`packages/types/src/zod-violation.ts`) that every `.regex()`/`.refine()` message string is discarded before reaching the client — only `field` and `params.code` survive — so the extraction is purely mechanical, no wording to preserve. The full `country_code` composite (regex + the `CountryCode.isValid` semantic check) stays backend-only, in a new `contexts/platform/application/dtos/country-code.schema.ts` shared by `provision-tenant.dto.ts` and `update-tenant-settings.dto.ts` (used by exactly those 2 files, both in the `platform` slice, per CLAUDE.md §11 — not `shared/`).

Found and fixed via Codex's cross-tool review: `CountryCode` VO's own `isValid()`/`create()` still hardcoded a separate `/^[A-Z]{2}$/` literal instead of reusing the new `COUNTRY_CODE_FORMAT_PATTERN` — inconsistent with the sibling `PhoneNumber` VO, which already delegates to `@ikaro/validation`'s `isValidPhoneNumber` rather than re-implementing inline; fixed, plus a focused spec added for the new `CountryCodeSchema` composite (trim/uppercase/malformed/unsupported cases). Also fixed a Copilot-flagged stale JSDoc reference: `COUNTRY_CODE_FORMAT_PATTERN`'s comment named `isSupportedCountryCode` as if it were part of `CountryCode`'s public API, when it's actually an internal `@ikaro/i18n` import the VO uses privately — the real API is `CountryCode.isValid()`. CodeRabbit was rate-limited on this PR and never produced an actual review.

**Source**: Backend 2.1, 2.2 · BFF F1

**Target files**:
- `apps/backend/src/contexts/platform/application/dtos/provision-tenant.dto.ts:13-23` + `update-tenant-settings.dto.ts:65-75` (duplicated `country_code` composite schema — note `CountryCode` VO already exists at `apps/backend/src/shared/value-objects/country-code.vo.ts` with `CountryCode.isValid()`; confirm whether the "composite" duplication is this format check re-implemented inline or a larger multi-field schema wrapping it, then extract accordingly)
- `apps/backend/src/contexts/booking/application/dtos/{open-schedule,close-schedule,get-availability,get-availability-summary}.dto.ts` (9x duplicated `YYYY-MM-DD` regex)
- BFF: 5 files (`schedule*.controller.ts`, `bookings.controller.ts` — grep `apps/bff/src/features/booking/` for the date-format regex to get the exact 12 sites)

**Work required**:
1. Backend: extract the duplicated `country_code` composite schema into one exported zod schema/helper (reusing `CountryCode.isValid` for the format check, not re-implementing the regex), imported by both DTOs.
2. Backend: extract the `YYYY-MM-DD` regex into one shared constant or a small `DateOnly`-style helper under `apps/backend/src/shared/`, imported by all 4 schedule/availability DTOs.
3. BFF: same treatment — one shared date-format regex/constant under `apps/bff/src/shared/`, imported by all 5 files instead of each declaring its own.

**Verification**: `pnpm --filter backend type-check && pnpm --filter backend test -- dto`, `pnpm --filter bff type-check && pnpm --filter bff test -- schedule bookings.controller`.

**Definition of done**: Each duplicated regex/schema exists in exactly one place, imported everywhere it's used.

---

### Story 15 — BFF: tighten loose `string` types to existing unions 🟡 ✅ Done

**Landed**: booking-types slice (C1, C2, C3) shipped 2026-07-28 in PR #288, as part of PR 3. Auth-types slice (C4, C5) shipped 2026-07-29 in PR #290 (`fix/td31-pr4-auth-request-typing`), as part of PR 4 — see Story 16's Landed note for the full account, including the scope expansion beyond this story's original file list (`CurrentUserPayload.role`/`Roles(...)` ended up typed against a new `@ikaro/types` export, `ActorRole`, rather than a BFF-local `JwtRole`).

**Source**: BFF C1, C2, C3, C4, C5

**Target files**:
- `apps/bff/src/features/booking/bookings.types.ts:22,42,97-98` (`BookingListItem.status`/`.type`, `BookingResponse.status` — confirmed both fields typed as plain `string`)
- `apps/bff/src/features/booking/bookings.mapper.ts:19,38,53,94,96` (`as X['status']`/`as X['type']` casts — these disappear once C1 is fixed and the source field is already the right union)
- `apps/bff/src/features/booking/schedule.types.ts:6` (`ScheduleClosureResponse.reason: string` — confirmed; the write-side schema constrains it to 3 values, find that schema and reuse its literal union)
- `apps/bff/src/shared/decorators/current-user.decorator.ts:10` (`CurrentUserPayload.role: string` — a `JwtRole` union already exists elsewhere, confirm its import path and reuse it here)
- `apps/bff/src/shared/decorators/roles.decorator.ts:4` (confirmed: `export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)` — change to `(...roles: JwtRole[])` so every `@Roles(...)` call site is checked against the real role set at compile time)

**Work required**:
1. Find the backend's canonical booking-status/type union (likely already exported from `@ikaro/types` given the booking state machine in `CLAUDE.md` §5) and use it for `BookingListItem`/`BookingResponse`'s `status`/`type` fields instead of `string`.
2. Remove the now-unnecessary `as X['status']`/`as X['type']` casts in `bookings.mapper.ts` — the compiler should accept the direct assignment once the source type is correct.
3. Find the write-side 3-value union for schedule-closure `reason` and reuse it in `ScheduleClosureResponse`.
4. Change `CurrentUserPayload.role` to `JwtRole` and `Roles(...roles: string[])` to `Roles(...roles: JwtRole[])`.
5. After changing `Roles`'s signature, `tsc --noEmit` will flag any `@Roles(...)` call site passing a string outside the real role set — fix any that surface (there shouldn't be any if the codebase has been consistent, but this is the point of the change).

**Verification**: `pnpm --filter bff type-check` (does most of the verification work here), `pnpm --filter bff test -- bookings.mapper schedule`.

**Definition of done**: No plain `string` remains where a real union already exists for that field. The C2 casts are gone, not just narrowed.

---

### Story 16 — BFF: global `req.user` type augmentation + JWT runtime shape validation 🟡 ✅ Done

**Landed**: PR #290 (2026-07-29), `fix/td31-pr4-auth-request-typing`.

**Deviation from the plan below (discovered during implementation, not a shortcut)**: item 1 — a literal `declare global { namespace Express { interface Request { user?: CurrentUserPayload } } }` — does not work in this repo. `@types/passport` already declares `Express.Request.user` itself (via its own empty, extensible `Express.User` interface), and this repo's `skipLibCheck: true` means a second, conflicting `Request.user` declaration is silently dropped rather than erroring or being merged — confirmed by writing the augmentation and observing `tsc --noEmit` still resolve `req.user` to Passport's `User` type at every consumer site, not the intended union. Forcing the augmentation back in would reintroduce that exact false-confidence bug.

**What shipped instead**: one shared accessor, `getCurrentUser(req: Request): CurrentUserPayload | undefined`, exported from `current-user.decorator.ts`. It does the single necessary cast (`req.user as CurrentUserPayload | GoogleProfile | undefined`) and narrows on the presence of `sub` (the field `GoogleProfile` never has). All 6 confirmed consumer sites (`active-staff.guard.ts`, `tenant.guard.ts`, `roles.guard.ts`, `backend-headers.ts`, `request.interceptor.ts`, and the `CurrentUser` param decorator itself) call this instead of independently casting `req.user` — achieving the DoD's real goal (one canonical source of truth, not 7 independent guesses) without the non-functional global augmentation. `auth.controller.ts`'s `req.user as GoogleProfile` cast is intentionally left as the one remaining direct cast — that route needs the *other* union branch specifically and was never meant to go through `getCurrentUser()`; this was investigated per item 3 below and confirmed correct, not overlooked.

Item 4 (JWT runtime shape validation) landed as specced: `jwt.strategy.ts`'s `validate()` now parses the payload through the same zod schema `decode-user-jwt.ts` already used for `@Public()` routes (`CurrentUserPayloadSchema`, exported for this reuse), throwing `UnauthorizedException` on a shape mismatch.

**Scope grew beyond this story during implementation**, after a Codex cross-tool review of PR #290 flagged that the new `getCurrentUser()`/`Roles`/`CurrentUserPayload` code made `shared/` modules import feature-owned symbols (`JwtRole`, `JWT_ROLES`, `GoogleProfile`) from `features/auth/*` — a real `shared/` → `features/` dependency-direction violation the review was right to catch. Fixed in the same PR:
- `JwtRole`/`JWT_ROLES` promoted out of `features/auth/jwt-issuer.service.ts` into `@ikaro/types` as `ActorRole`/`ACTOR_ROLES` (`packages/types/src/enums.ts`) — this is the same 3-value role concept the backend's `request-context.ts`/`request.interceptor.ts` and 4 role guards (`manager-role.guard.ts`, `customer-role.guard.ts`, `staff-or-manager-role.guard.ts`, `any-authenticated-role.guard.ts`) already had as an untyped, independently-duplicated `string` (Backend 2.3's own duplication, previously untriaged into a story) — so promoting to `@ikaro/types` fixed both apps in one move rather than creating a second BFF-only type. Backend's `request.interceptor.ts` now validates `X-Actor-Role` against `ActorRole` the same way it already validated `X-Actor-Type` (a real, if low-severity, pre-existing gap: `actorRole` was the only one of the two headers with zero runtime narrowing before this). This is a type-safety fix only — the 4 guards remain 4 separate files; Backend 2.3's other half (consolidating them into one `createRoleGuard(allowedRoles, message)` factory) is untouched and still open.
- `GoogleProfile` relocated from `features/auth/strategies/google.strategy.ts` to `apps/bff/src/shared/auth/google-profile.ts` (new file) — `google.strategy.ts` now imports it instead of defining it, so `shared/decorators/current-user.decorator.ts` no longer reaches into `features/`.

**Source**: BFF D1-D7, C6

**Target files**:
- `apps/bff/src/shared/guards/active-staff.guard.ts`, `tenant.guard.ts`, `roles.guard.ts`
- `apps/bff/src/shared/http/backend-headers.ts`
- `apps/bff/src/shared/decorators/current-user.decorator.ts:16` (confirmed pattern: `ctx.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>()`)
- `apps/bff/src/shared/request/request.interceptor.ts:31`
- `apps/bff/src/features/auth/auth.controller.ts:35` (confirmed: this 7th site casts the same request property to `GoogleProfile` instead of `CurrentUserPayload` — the two shapes have already diverged in practice, which is the concrete evidence this theme is worth fixing, not just tidiness)
- **New**: a global Express type-augmentation file, e.g. `apps/bff/src/shared/types/express.d.ts`
- `apps/bff/src/features/auth/strategies/jwt.strategy.ts:27-29` (confirmed: `validate(payload: CurrentUserPayload): CurrentUserPayload { return payload; }` — zero runtime shape validation before this becomes `req.user`)

**Work required**:
1. Add `declare global { namespace Express { interface Request { user?: CurrentUserPayload } } }` in the new `express.d.ts` (import `CurrentUserPayload` from `current-user.decorator.ts`; check for circular-import risk and use a type-only import if needed).
2. Remove the repeated inline `Request & { user?: CurrentUserPayload }` intersection casts from the 6 confirmed sites — `req.user` is now typed globally.
3. For `auth.controller.ts:35`'s `GoogleProfile` cast — this is a **different** request-lifecycle stage (Passport's Google OAuth strategy populates `req.user` with a `GoogleProfile` before it's ever replaced by `CurrentUserPayload`), so it is not simply "wrong" — investigate whether Passport's OAuth flow and the JWT flow ever share the same request type at different times. If they do, the global augmentation may need a union (`CurrentUserPayload | GoogleProfile`) or the OAuth callback needs its own narrower request type — don't force this site to the same type as the other 6 without understanding why it diverged first.
4. In `jwt.strategy.ts`'s `validate()`, add a zod-parse of `payload` against a schema matching `CurrentUserPayload`'s shape before returning it, throwing `UnauthorizedException` on a shape mismatch (a JWT that fails signature/expiry checks never reaches `validate()` — this closes the separate gap where a *malformed but validly-signed* payload, e.g. from an older token schema, is trusted as-is).

**Verification**: `pnpm --filter bff type-check`, `pnpm --filter bff test -- guards request.interceptor auth.controller jwt.strategy`.

**Definition of done**: `req.user` has one global type, not 7 independent inline casts (with the OAuth site's divergence explicitly understood and resolved, not silently forced). `jwt.strategy.ts` validates payload shape at runtime, not just signature/expiry.

---

### Story 17 — Backend + BFF: controller response-shaping / config-lookup duplication 🟡 ✅ Done

**Landed**: the `E2` slice (JWT_SECRET cached once in `bookings.controller.ts`'s constructor instead of 3 separate `getOrThrow()` calls) shipped 2026-07-28 in PR #288 (`fix/td31-pr3-bookings-controller-cleanup`, branch deleted post-merge), as part of PR 3. The rest shipped 2026-08-04 in PR #311 (`fix/td31-pr8-controller-dedup`, branch deleted post-merge): backend `customer.controller.ts`'s `getMe()`/`getById()` duplication extracted into `customer-response.mapper.ts`'s `toGetCustomerProfileResponse`; BFF `platform.public.controller.ts`'s `getManifest()` inline intersection type named `BackendHotsiteManifestResponse` in new `platform.types.ts`; all 4 schedule controllers switched to `BackendHttpService`'s `params` argument instead of manual query-string interpolation; `BackendHttpService` given a shared `private publicHeaders(tenantId)` helper used by `getForPublic`/`postForPublic`/`patchForPublic`. Backend 3.3 (loyalty controller) was dropped during PR 8's story-discovery — it no longer matched the original "byte-identical" finding after Story 5 (PR #293) changed the code; the remaining duplication is a single differing `conversionRate` expression, not worth an extraction. PR #311 also surfaced two unrelated pre-existing CVEs via its CI checks — `brace-expansion` bumped to 5.0.9 (CVE-2026-69152, Trivy) directly in that PR, and `nanoid` bumped to 3.3.17 (CVE-2026-67213 / SNYK-JS-NANOID-18506897, Snyk) on a follow-up branch (`fix/nanoid-cve-postcss-override`) after PR #311 was merged via admin override ahead of the Snyk fix, since Snyk SCA is a required branch-protection check.

**Source**: Backend 3.2, 3.3 · BFF A5, E2, F2, F3

**Target files**:
- `apps/backend/src/contexts/customer/infrastructure/controllers/customer.controller.ts:78-84,95-101` (confirmed: `getMe()`/`getById()` both `.then((customer) => ({ customerId: customer.id, email: ..., name: ..., phone: ..., defaultAddress: ... }))` — byte-identical)
- `apps/backend/src/contexts/loyalty/infrastructure/controllers/loyalty.controller.ts:75-78,134` (same pattern, smaller scale)
- `apps/bff/src/features/platform/platform.public.controller.ts:17-31` (confirmed: `getManifest()` does a sequential `/internal/tenants/by-slug/:slug` call then a `getForPublic` call, spreads them with an inline `HotsiteResponse & { business: ...; localization: ... }` intersection type)
- `apps/bff/src/features/booking/bookings.controller.ts:206,248,478` (confirmed: 3x `this.config.getOrThrow<string>('JWT_SECRET')`)
- 4 files under `apps/bff/src/features/booking/` (`schedule*.controller.ts`) — manual query-string interpolation bypassing `BackendHttpService`'s `params` support (grep the exact sites; `BackendHttpService.get()` already accepts a `params` object per the confirmed `getForPublic` signature at `backend-http.service.ts:61-65`)
- `apps/bff/src/shared/http/backend-http.service.ts:61-100` (confirmed: `getForPublic`/`postForPublic`/`patchForPublic` each independently declare `{ 'X-Tenant-ID': tenantId, 'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY') }`)

**Work required**:
1. Backend: extract a shared `toCustomerProfileResponse(customer)` mapper function, used by both `getMe()`/`getById()`; same treatment for the smaller loyalty-controller duplication.
2. BFF: extract a `getPublicHeaders(tenantId: string)` private helper in `BackendHttpService`, used by all 3 `*ForPublic` methods instead of each declaring the header object inline.
3. BFF: cache `this.config.getOrThrow<string>('JWT_SECRET')` once (constructor-time or a private getter) in `bookings.controller.ts` instead of calling it 3 times.
4. BFF: replace manual query-string building in the 4 schedule controllers with `BackendHttpService`'s existing `params` argument.
5. BFF: for `getManifest()`, name the inline intersection type (e.g. a proper exported `HotsiteManifestBackendResponse` type in `platform.types.ts` if one doesn't already exist) instead of declaring it ad hoc at the call site — purely a readability fix, not a behavior change.

**Verification**: `pnpm --filter backend test -- customer.controller loyalty.controller`, `pnpm --filter bff test -- backend-http.service bookings.controller schedule platform.public.controller`, both apps' `type-check`.

**Definition of done**: No byte-identical response-shaping block duplicated across controller methods. `BackendHttpService`'s 3 public methods share one header-building helper. `JWT_SECRET` fetched once per request in `bookings.controller.ts`, not 3 times. Schedule controllers use `BackendHttpService`'s `params` support instead of manual string interpolation.

---

### Story 18 — BFF: extend the Story 5 batch loyalty-balance endpoint to `getTenants()` 🟡 (depends on Story 5) ✅ Done

**Landed**: PR #317 (2026-08-04), `feat/td31-story18-own-loyalty-balances` (worktree removed post-merge). Implemented per the 2026-08-04 discovery update below — new `GET loyalty/balances/own` route + `ILoyaltyCustomerPort.resolveAllTenantsByOAuthId()` + `ILoyaltyBalanceRepository.findManyByTenantCustomerPairs()`, replacing `getTenants()`'s per-tenant fan-out with one call. Not part of the original 14-PR plan (was split out as an open decision on 2026-07-30) — landed as its own standalone PR once the discovery session below found a real, minimal-machinery fix. Copilot and CodeRabbit cross-review both found one real gap each in the same underlying spot — `InMemoryLoyaltyCustomerPort.resolveAllTenantsByOAuthId()` always returned the home pair even when never seeded, contradicting the port's own not-found contract and blocking a real unit-level tenant-isolation test — fixed by adding explicit home-identity tracking (`seedHome()`) plus the missing test. A third CodeRabbit finding (use `LoyaltyBalanceBuilder` instead of `LoyaltyBalance.create()`+`.increment()` in the repository integration spec) was verified as a false positive — every sibling test in that file, including the pre-existing Story 5 block, uses the same `.create()`+`.increment()` pattern deliberately, to round-trip the aggregate's own lifecycle methods. Codex's independent 4-agent review found 0 critical/important/minor findings.

**Source**: BFF A4

**Target files**: `apps/bff/src/features/customer/customers.controller.ts:89-118` (`getTenants()`)

**Problem**: `getTenants()` already batches tenant info via `/internal/tenants?ids=...` (the exact pattern Story 5 replicates for loyalty balances) but still fans out one `/loyalty/balance` call per tenant in `Promise.all([...tenants.map(...)])` because no batch endpoint exists yet for that call.

**Discovery update (2026-07-30, story-discovery for PR 5):** Traced the actual mechanism behind `getTenants()`'s fan-out — the "just wire up Story 5's endpoint" branch doesn't apply. `getTenants()` resolves **one customer's identity across N different tenants**, each via `GetOwnLoyaltyBalanceUseCase` → `ILoyaltyCustomerPort.resolveCustomerIdByOAuthId(homeCustomerId, homeTenantId, targetTenantId)` (the TD20 cross-tenant-switch mechanism — customers are multi-tenant, each tenant has its own `Customer` row, resolved per-tenant via Google OAuth ID; there's no shared `customerId` to batch against). Story 5's `findManyByCustomers(tenantId, customerIds[])` solves a different problem (many customers, one known tenant) and can't be reused here. A real fix needs new cross-tenant batch machinery — a batch variant of `resolveCustomerIdByOAuthId` on `ILoyaltyCustomerPort` — out of Story 5's scope.

**Split from PR 5 (2026-07-30):** given the above, and that this fan-out is bounded by how many tenants one customer is linked to (small, unlike `searchCustomers()`'s page-size-scaled fan-out), this story is split out of PR 5 rather than folding new cross-tenant batch work into it. PR 5 now ships Story 5 only. Whether to build the new cross-tenant batch mechanism, or close this story via the "explicit note" branch of its own Definition of Done, is left as an open decision for a future session.

**Discovery update (2026-08-04, story-discovery):** The "new cross-tenant batch machinery" framing above overstated what's actually needed — traced the real call chain instead of reasoning from the endpoint shapes alone. `getTenants()` already calls `GET /customers/me/tenants` *first*, which returns `CustomerTenantSummaryResponse[]` = `{tenantId, customerId}[]` for **every** tenant the customer is linked to, in **one** query (`TypeOrmCustomerRepository.findAllTenantsByOAuthId`, `WHERE googleOAuthId = :id` — an existing, already-accepted cross-tenant read, the same one that powers TD20's switch-tenant screen). The BFF already has every `customerId` it needs, per tenant, from that first call — it just doesn't use it. Each of the N `/loyalty/balance?tenantId=X` fan-out calls then redundantly re-derives the *exact same* `{tenantId, customerId}` list from scratch via `GetOwnLoyaltyBalanceUseCase` → `resolveCustomerIdByOAuthId` → the same `GetCustomerTenantsByIdUseCase`, only to discard every result except the one matching tenant. Also confirmed: `/loyalty/balances` (plural) is already taken by Story 5's staff/manager batch route, so a new route needs a distinct path; `toTenantOption()` only reads `currentPoints` from the balance, so no `conversionRate` is needed on the new response.

Rather than having the BFF pass its already-known `{tenantId, customerId}` pairs into a new endpoint — which would mean trusting caller-supplied identity pairs, a real IDOR risk for any future caller of that endpoint that didn't happen to pass back exactly what it just fetched — the fix re-derives the pairs **server-side** from `actorId`/`tenantId` already in `RequestContext`, the same security model every other "own" route in this controller already uses. This resolves the "left as an open decision" note with a real fix that's *less* machinery than either horn of the original dilemma, not more.

**Target files (revised)**:
- `apps/backend/src/contexts/loyalty/application/ports/loyalty-customer.port.ts` — add `resolveAllTenantsByOAuthId(homeCustomerId, homeTenantId): Promise<{tenantId: string; customerId: string}[]>`
- `apps/backend/src/contexts/loyalty/infrastructure/cross-context/loyalty-customer.adapter.ts` (+ spec) — implement by calling `GetCustomerTenantsByIdUseCase.execute(...)` directly, no target-tenant filter (the method the single-target `resolveCustomerIdByOAuthId` already calls and then narrows down)
- `apps/backend/src/contexts/loyalty/application/ports/loyalty-balance-repository.port.ts` — add `findManyByTenantCustomerPairs(pairs: { tenantId: string; customerId: string }[]): Promise<LoyaltyBalance[]>`
- `apps/backend/src/contexts/loyalty/infrastructure/repositories/typeorm-loyalty-balance.repository.ts` (+ spec + integration spec) — implement via an OR of `(tenantId = t AND customerId = c)` per pair (e.g. TypeORM `Brackets`), modeled on the existing `findManyByCustomers`
- **New** `apps/backend/src/contexts/loyalty/application/use-cases/get-own-loyalty-balances/get-own-loyalty-balances.use-case.ts` (+ spec) — modeled on `GetOwnLoyaltyBalanceUseCase` (singular) but batched: input `{ contextTenantId, actorId }`, calls `resolveAllTenantsByOAuthId` then `findManyByTenantCustomerPairs`, returns `{ tenantId: string; currentPoints: number }[]` defaulting missing balances to 0 (same `Map` + `?? 0` pattern as `GetLoyaltyBalancesUseCase`)
- `apps/backend/src/contexts/loyalty/infrastructure/controllers/loyalty.controller.ts` — new route `GET loyalty/balances/own`, `@UseGuards(CustomerRoleGuard)`, no params, reads `actorId`/`tenantId` from `RequestContext`
- `apps/backend/http/loyalty/loyalty.http` — new request block for the route
- `apps/bff/src/features/customer/customers.controller.ts:89-118` (`getTenants()`) — replace `Promise.all([tenantInfos, ...tenants.map(fan-out)])` with `Promise.all([tenantInfos, balances])` calling the new route once; map results back onto `tenants` by `tenantId`, defaulting missing to 0

**Work required (revised)**:
1. Backend: add `resolveAllTenantsByOAuthId` to `ILoyaltyCustomerPort` + `LoyaltyCustomerAdapter` (delegates to the existing `GetCustomerTenantsByIdUseCase` — no new query).
2. Backend: add `findManyByTenantCustomerPairs` to `ILoyaltyBalanceRepository` + `TypeOrmLoyaltyBalanceRepository`.
3. Backend: add `GetOwnLoyaltyBalancesUseCase`, wired into `LoyaltyController` as `GET loyalty/balances/own` (`CustomerRoleGuard`).
4. Backend: add a `.http` block for the new route in `apps/backend/http/loyalty/loyalty.http`.
5. BFF: `getTenants()` calls the new route once instead of fanning out per tenant; map results back by `tenantId`.

**Verification (revised)**: `pnpm --filter backend test -- loyalty-customer loyalty-balance get-own-loyalty-balances loyalty.controller`, new integration spec coverage for the new route (tenant-isolation case: a customer's balance in a tenant they're NOT linked to must never appear in the response), `pnpm --filter bff test -- customers.controller` (confirm `getTenants()` now makes exactly 3 backend calls total, regardless of how many tenants the customer belongs to).

**Definition of done (revised)**: `getTenants()` makes one loyalty-balance call total, not one per tenant. The new backend route re-derives `{tenantId, customerId}` pairs from the authenticated actor's own identity — it accepts no caller-supplied customerId, so it can't be used to read another customer's balance. New use case + repository method have unit + integration test coverage, including a tenant-isolation case.

---

### Story 19 — Backend: test/builder hygiene — misfiled repos + missing event builder 🟡 ✅ Done

**Landed**: PR #312 (2026-08-04), `fix/td31-pr9-loyalty-test-hygiene` (branch deleted post-merge). Implemented as specced in the discovery update below. One additional fix found via `bad-smell-audit backend --pr` on this PR's own changed files (not in the original story scope): `complete-booking-loyalty-effects.use-case.spec.ts`'s `seedBalance()` helper called `LoyaltyBalance.reconstitute(...)` directly with raw literals instead of `LoyaltyBalanceBuilder`, while every sibling spec touched in this same PR already used the builder for the identical construction — fixed to use `LoyaltyBalanceBuilder`. Codex's cross-tool review (4-agent) found 0 critical/important/minor findings; Copilot approved with 0 comments; CodeRabbit was rate-limited and produced no review.

**Source**: Backend 4.1, 5

**Discovery update (2026-08-04, story-discovery for PR 9):** Two corrections to the original scope, both verified directly against source:
1. **Item 1's "6 files, move all of them" framing was wrong.** Of the 6 loyalty doubles in `test/infrastructure/`, only 3 are actually misfiled: `in-memory-loyalty-balance.repository.ts`, `in-memory-loyalty-redemption.repository.ts`, `in-memory-loyalty-entry.repository.ts` (doubles of Loyalty's *own* repository ports) — plus a 4th the original audit never counted, `in-memory-balance-expiry-log.repository.ts` (`IBalanceExpiryLogRepository`). The other 3 — `in-memory-loyalty-customer.port.ts`, `in-memory-loyalty-platform.port.ts`, `in-memory-loyalty-booking.port.ts` — are doubles of *cross-context* ports (`ILoyaltyCustomerPort`/`ILoyaltyPlatformPort`/`ILoyaltyBookingPort`), and every other context's cross-context-port doubles (Booking's 3, Notification's 4, Platform's 1 — 8 total, checked directly) also live in `test/infrastructure/`, never under `test/repositories/<context>/`. Moving Loyalty's 3 would have made Loyalty the only context with cross-context doubles somewhere else — a new inconsistency, not a fix.
2. **Item 2's "referenced across 7 spec files" count was wrong** (likely conflated with the unrelated `StaffDeactivatedError` guard-error class, which really does match 7 files by name). The real count: 3 spec files reference `StaffActivated`/`StaffDeactivated` at all (`activate-staff.use-case.spec.ts`, `deactivate-staff.use-case.spec.ts`, `staff.spec.ts`), and none construct either event via a raw literal — `new StaffActivated(...)`/`new StaffDeactivated(...)` appear exactly once each, both inside `staff.aggregate.ts`'s `activate()`/`deactivate()` (production code); every spec obtains the event by calling the real aggregate method and casting the already-emitted instance. There is no existing "Builders mandatory" violation to fix here. Per explicit user direction (2026-08-04), the two builders are being added anyway, as forward-looking completion of the documented `docs/08-TESTING_STRATEGY.md` builder-set for domain events (Staff already has one for `StaffInvited`; `StaffActivated`/`StaffDeactivated` are the only two Staff events without one) — not as a bugfix, since nothing currently needs them.

**Target files**:
- `apps/backend/src/test/infrastructure/in-memory-loyalty-{balance,redemption,entry}.repository.ts`, `in-memory-balance-expiry-log.repository.ts` (move — own-repository-port doubles, misfiled)
- `apps/backend/src/test/infrastructure/in-memory-loyalty-{customer,platform,booking}.port.ts` (**stay put** — cross-context port doubles, already correctly placed per the codebase-wide convention)
- `apps/backend/src/test/builders/staff/` (confirmed: contains only `staff.builder.ts`, `staff-entity.builder.ts`, `staff-invited-event.builder.ts` — no `StaffActivated`/`StaffDeactivated` event builder)

**Work required (revised)**:
1. Move the 4 own-repository-port doubles (balance, redemption, entry, balance-expiry-log) from `test/infrastructure/` to `test/repositories/loyalty/`. Update the 11 confirmed importers' paths: `get-own-loyalty-balance.use-case.spec.ts`, `get-loyalty-redemptions.use-case.spec.ts`, `complete-booking-loyalty-effects.use-case.spec.ts`, `get-loyalty-entries.use-case.spec.ts`, `notify-expiring-points.job.spec.ts`, `notify-expiring-points.job.integration.spec.ts`, `redeem-points.use-case.spec.ts`, `get-loyalty-balances.use-case.spec.ts`, `get-loyalty-balance.use-case.spec.ts`, `expire-points.job.spec.ts`, `loyalty.controller.spec.ts`. Do **not** touch `complete-booking-loyalty-effects.use-case.integration.spec.ts`, `loyalty.controller.integration.spec.ts`, or `test/utils/loyalty-integration-app.ts` — they only reference the 3 cross-context port doubles, which aren't moving.
2. Add `staff-activated-event.builder.ts` and `staff-deactivated-event.builder.ts` to `test/builders/staff/`, modeled exactly on `staff-invited-event.builder.ts`'s shape (`withTenantId`/`withCorrelationId`/`withStaffId` fluent setters + `build(): StaffActivated`/`StaffDeactivated`, constructing via `new StaffActivated(tenantId, correlationId, { staffId })`). Export both from `test/builders/staff/index.ts` alongside the existing three. No spec files need updating — this completes the builder set without a current consumer, since none of the 3 referencing specs construct the event directly.

**Verification**: `pnpm --filter backend type-check`, `pnpm --filter backend test -- loyalty staff` (confirm both the moved repos and the new builders don't break existing suites).

**Definition of done**: Loyalty's 4 own-repository-port doubles live at `test/repositories/loyalty/`; the 3 cross-context port doubles remain in `test/infrastructure/`. `StaffActivated`/`StaffDeactivated` have builders in `test/builders/staff/`, matching `StaffInvitedEventBuilder`'s shape, exported from the barrel.

---

### Story 20 — Web: last two `@ikaro/types` duplicates + one hardcoded fallback 🟡 ✅ Done

**Landed**: item 1 (loyalty) shipped 2026-07-27 in PR #280, as part of Story 2 — see Story 2's Landed note. Items 2 (`SwitchTenantRequest`) and 3 (`AddressFields.tsx`) shipped 2026-07-31 in PR #296, `fix/td31-pr14-web-i18n-type-dedup` (branch deleted post-merge), as part of PR 14 — both stories now fully closed.

**Source**: Web 2.3, 2.4, 4.5

**Target files**:
- `apps/web/features/loyalty/api.ts:3-7` (`LoyaltyBalanceResponse` — fold into Story 2's edit of this same file rather than a separate PR if Story 2 hasn't landed yet)
- `apps/web/features/auth/session.ts:4-6` (confirmed: `SwitchTenantRequest` hand-redeclared even though the canonical type already exists at `packages/types/src/auth.dto.ts:1` and the sibling `SwitchTenantResponse` in the same file already imports from `@ikaro/types`)
- `apps/web/features/booking/components/public/AddressFields.tsx:188` (confirmed: `label={addressSpec.neighborhoodLabel ?? 'Neighborhood'}` — hardcoded English fallback in a file that otherwise consistently uses `useTranslations`; fold into Story 8's i18n sweep if Story 8 hasn't landed yet)

**Discovery update (2026-07-27, story-discovery for PR 2)**: The original claim that `LoyaltyBalanceResponse` "matches `@ikaro/types` exactly" checked against the wrong type — the BFF's live `/loyalty/balance` and `/customers/:id/loyalty/balance` responses are actually `CustomerLoyaltyBalanceResponse`/`EnrichedLoyaltyBalanceResponse` (both add `conversionRate`), not the raw backend-internal `LoyaltyBalanceResponse`. This function is also dead code, superseded by other files — see Story 2's discovery update for the full trace. Folded into Story 2's item 1 (deletion, not a type fix).

**Work required**:
1. ~~Delete the local `LoyaltyBalanceResponse` interface from `apps/web/features/loyalty/api.ts`, import from `@ikaro/types` instead.~~ Superseded — see Story 2's revised Work required item 1 (this function is deleted outright, not retyped).
2. Delete the local `SwitchTenantRequest` interface from `session.ts`, import from `@ikaro/types` instead (matching how `SwitchTenantResponse` already does in the same file).
3. Replace the hardcoded `'Neighborhood'` fallback with a translated key, consistent with the rest of `AddressFields.tsx`'s `useTranslations` usage.

**Verification**: `pnpm --filter web type-check`, `pnpm --filter web test -- loyalty session AddressFields`.

**Definition of done**: Zero locally-redeclared types that already exist in `@ikaro/types` remain in these 2 files. No hardcoded English fallback remains in `AddressFields.tsx`.

---

---

## Implementation Stories — ⚪ tier (2026-07-23 spot-check)

The 6 ⚪ rows were re-verified directly against source (not just re-read from the audit's word) to check whether "stylistic" was the right call for all of them. Two turned out to be genuinely dead code — real, zero-risk, one-line-each fixes that just happen to be trivial rather than not real. The other 4 are confirmed correctly excluded: either purely cosmetic with real ripple cost (Backend 1.4), explicitly judgment-call/plausibly-intentional (Backend 6.1), message-text-only duplication with the actual logic already centralized (Backend 6.2), or a real observation whose "fix" is actually a bigger design decision (splitting a controller) than the finding implies (BFF H1) — none of these 4 get a story.

### Story 21 — Delete two confirmed-dead pieces of code ⚪→real, trivial ✅ Done

**Landed**: PR #300 (2026-08-01), `td31-pr10-dead-code` (worktree removed post-merge). Implemented as specced, plus a type-check ripple not called out in the original story text: 3 test mocks typed against `ServiceDetail` also had `formatted` stripped (the 2 `services.public.controller*.spec.ts` mocks were correctly left untouched — they're typed against the unrelated `HotsiteServiceResponse`/`Money`). Codex's cross-tool review (5 lens runs, 0 critical throughout) caught one real stale-doc reference — `plan/M00-MONOREPO-FOUNDATION_IMPLEMENTATION_DETAILS_IA.md:189` still said `JWT_COOKIE_OPTIONS` was declared in `main.ts` — fixed in the same PR. A second recurring review note (mapper spec no longer exercises "drops `formatted`") was judged not applicable: the field no longer exists on `ServiceDetail` at all, so the type system now provides a stronger guarantee than the runtime test it replaced.

**Source**: BFF C7, BFF G1

**Target files**:
- `apps/bff/src/features/booking/services.types.ts:5` (`ServiceDetail.price.formatted`)
- `apps/bff/src/features/booking/services.mapper.ts` (`toStaffServiceResponse()` — confirms the field is never read: it explicitly rebuilds `price: { amount: service.price.amount, currency: service.price.currency }`, dropping `.formatted`)
- `apps/bff/src/main.ts:8` (`export { JWT_COOKIE_OPTIONS } from './features/auth/cookie-options';`)
- `apps/bff/src/features/auth/cookie-options.ts` (real source of `JWT_COOKIE_OPTIONS` — untouched, still exported from here)
- `apps/bff/src/features/auth/auth-controller-flow.service.ts` (the only real consumer — confirmed it imports `JWT_COOKIE_OPTIONS` directly from `./cookie-options`, never from `main.ts`)

**Problem**:
- `ServiceDetail.price.formatted` is declared in the BFF-internal type used only by the **staff** service CRUD endpoints (`services.controller.ts`). Confirmed the one place that maps `ServiceDetail` to an external response (`toStaffServiceResponse()`) explicitly drops `.formatted`. The unrelated `.price.formatted` usages in `apps/web/features/booking/components/public/{ConfirmationStep,ServiceSelectionStep}.tsx` consume a completely different type (`HotsiteServiceResponse` from `@ikaro/types`, the public hotsite booking flow's own response shape) — not this field. Grep confirms zero reads of `ServiceDetail.price.formatted` anywhere in the BFF.
- `main.ts:8` re-exports `JWT_COOKIE_OPTIONS`, but the only real consumer (`auth-controller-flow.service.ts`, 6 call sites) imports it directly from `./cookie-options`. Grep confirms no file imports `JWT_COOKIE_OPTIONS` from `main.ts` (nor could it sensibly — `main.ts` is the Nest bootstrap entrypoint, not a module other files should import from).

**Work required**:
1. Remove `formatted: string` from the `price` field's inline type in `ServiceDetail` (`services.types.ts:5`) — the field becomes `price: { amount: number; currency: string }`, matching what `toStaffServiceResponse()` already outputs.
2. Confirm nothing else in the BFF constructs a `ServiceDetail`-typed value with a `formatted` property (grep `ServiceDetail` usage once more after the type change — `tsc --noEmit` will flag it if anything does).
3. Delete the `export { JWT_COOKIE_OPTIONS } from './features/auth/cookie-options';` line at `main.ts:8`.
4. Confirm `pnpm --filter bff type-check` still passes (it should — nothing imports from the deleted re-export).

**Why bundled into one story despite unrelated files**: both are one-line deletions of confirmed-dead code with zero behavioral risk — not worth two separate PRs for the review overhead.

**Verification**: `pnpm --filter bff type-check`, `pnpm --filter bff test -- services.controller services.mapper`. No test should reference either deleted piece; if one does, that test itself was asserting dead behavior and should be removed alongside it.

**Definition of done**: `ServiceDetail.price` no longer declares a `formatted` field. `main.ts` no longer re-exports `JWT_COOKIE_OPTIONS`. Both confirmed via `tsc --noEmit` passing with no new errors.

**Explicitly not stories** (re-verified, correctly left as ⚪):
- **Backend 1.4** (`address.ts`/`money.ts` missing `.vo.ts` suffix) — real inconsistency, but a rename ripples into every importer for a purely cosmetic gain. Skip.
- **Backend 6.1** (inconsistent pagination conventions) — the original audit already flagged this as "plausibly intentional per-endpoint"; no evidence surfaced during triage that it's actually a bug. Skip.
- **Backend 6.2** (E.164 error-message wording duplicated across 3 files) — confirmed real, but it's message-text only; the actual validation logic is already correctly centralized in `PhoneNumber.isValid`. Not worth a dedicated story.
- **BFF H1** (bare `@Controller()` in `loyalty.controller.ts`) — confirmed real, but the likely reason is structural: this controller serves two different route-prefix families (`loyalty/*` customer-self routes, `customers/:id/loyalty/*` admin routes) that can't share one NestJS `@Controller(prefix)`. A proper fix means splitting into two controllers — a real design decision, not a quick tidy-up. Left for a future conversation if the team wants that split.

---

---

### Story 22 — Extract `generateAttachmentSignedUrl()`'s 3-way tenant-resolution branching out of the controller ✅ Done

**Landed**: PR #288 (2026-07-28), `fix/td31-pr3-bookings-controller-cleanup` (branch deleted post-merge), as part of the collapsed PR 3.

**Source**: Part 1 `BFF-1` (missed in the initial 2026-07-23 triage pass, caught on a completeness re-check the same day — see the note under Part 1's BFF section)

**Target files**:
- `apps/bff/src/features/booking/bookings.controller.ts:223-272` (`generateAttachmentSignedUrl()` and its private `tryDecodeUserJwt()` helper)
- Depends on **Story 3** landing first (or being done together) — Story 3 extracts `tryDecodeUserJwt()`'s decode logic into a shared `decodeUserJwt()` helper under `apps/bff/src/shared/`; this story extracts the surrounding scenario-branching that *calls* it, so doing them in the same pass avoids editing the same method twice.
- Likely new file: `apps/bff/src/features/booking/attachment-tenant-resolver.ts` (or fold into an existing booking-feature service if one already exists for cross-cutting attachment logic — check first) — kept feature-owned per CLAUDE.md's "feature-owned transport helpers stay with the feature" rule, since this logic is booking-attachment-specific, not cross-cutting.

**Problem**: `generateAttachmentSignedUrl()` is a `@Public()` route (no `JwtAuthGuard`) that must resolve which tenant an attachment upload belongs to from one of 3 mutually exclusive scenarios, each with its own tenant-resolution path, all inlined directly in the controller method body:
1. **JWT present** (authenticated CUSTOMER or STAFF/MANAGER) → tenant comes from the decoded JWT.
2. **`body.guestToken` present** → tenant comes from verifying the guest token (`verifyGuestToken()`), 401-equivalent `GUEST_TOKEN_INVALID` problem-detail thrown on failure.
3. **Neither** → anonymous guest, tenant resolved from `body.tenantSlug` via `withPublicTenant()`.

This is exactly the "business logic lives in controllers" pattern CLAUDE.md's anti-pattern table and the prior `td/TD-18-19-20-BAD-SMELL-VIOLAVIONS.md`'s `BFF-B1` finding already called out elsewhere in this same controller — the route itself (`@Post`, `@Public`, `@Throttle`, body validation) is a legitimate controller responsibility; deciding *which of 3 auth scenarios applies and how to resolve a tenant from each* is not.

**Work required**:
1. Extract a single function/method — e.g. `resolveTenantIdForAttachmentUpload(authHeader, body, deps): Promise<string>` — that internally runs the 3-scenario branch and returns a resolved `tenantId`, throwing the existing `GUEST_TOKEN_INVALID` problem-detail on an invalid guest token (preserve the exact error/status behavior — this is a refactor, not a behavior change).
2. `generateAttachmentSignedUrl()` becomes: decode nothing itself, call the resolver, then make the one `postForPublic()` call with the resolved `tenantId` — the controller method should read as a thin dispatcher, matching every other method's shape in this file.
3. Keep the 3 scenario comments (they explain *why* the branching exists, which is exactly the kind of non-obvious context worth preserving) — move them onto the extracted function, don't discard them.
4. If Story 3's shared `decodeUserJwt()` helper exists by the time this lands, use it here instead of re-decoding inline.

**Verification**: `pnpm --filter bff test -- bookings.controller` — this method's existing tests (if any cover all 3 scenarios + the guest-token-invalid case) must still pass unchanged; add coverage for any scenario not already tested at the extracted-function level.

**Definition of done**: `generateAttachmentSignedUrl()` no longer contains inline tenant-resolution branching — it delegates to one extracted function. All 3 scenarios plus the guest-token-invalid error path behave identically to before the refactor.

---

---

## PR Execution Plan — 22 stories → 14 PRs (2026-07-23)

Grouping rule: two stories collapse into **one PR** only when they genuinely share a file/feature or have a hard dependency — never merely because they happen to be safe to run in parallel with *other* groups. Forcing unrelated stories into one PR just to shrink the PR count produces a diff with no single reviewable purpose and no clean revert story. Where a wave lists multiple PRs, those PRs have no file overlap with each other and can be worked/reviewed in any order relative to each other; ordering *within* a PR's own story list matters where noted.

### Wave 1 — Critical, ship first (2 PRs, independent of each other)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 1** ✅ | Story 1 | `booking.controller.ts`, `get-booking-by-id.use-case.ts` (+ spec) | Standalone. Highest priority — security-adjacent. **Merged as [#204](https://github.com/lmmoreira/ikaro/pull/204), 2026-07-24.** |
| **PR 2** ✅ | Story 2 + Story 20 (loyalty part only) | `apps/web/features/loyalty/api.ts` | Same file, same reason (both are `@ikaro/types` drift/duplication on this exact file) — always were meant to land together. **Merged as [#280](https://github.com/lmmoreira/ikaro/pull/280), 2026-07-27.** |

### Wave 2 — BFF `bookings.controller.ts` cleanup (1 PR — collapsed from 3 due to file overlap)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 3** ✅ | Story 3 + Story 22 + Story 4 + Story 6 + Story 15 (booking-types slice: `bookings.types.ts`/`.mapper.ts`/`schedule.types.ts`) + Story 17's `E2` slice (JWT_SECRET caching) | `apps/bff/src/features/booking/{bookings.controller.ts,bookings.mapper.ts,bookings.types.ts,schedule.types.ts}` | 6 stories worth of edits converge on 1-2 files. Collapsing avoids 5 sequential rebases on the same controller. Internal order: extract the shared JWT-decode helper (3) and the tenant-resolution branching (22) first, then the mapper extraction (6) and type-tightening (15) build on the now-cleaner controller, then fold in `fetchLoyaltyBalance` logging (4) and the JWT_SECRET dedup (17 slice) last since they're small and independent of the rest. Also folded in during story-discovery: fixing the raw `@nestjs/common` `Logger` anti-pattern (should always be `AppLogger`) at 4 sites — 1 BFF guard + 3 backend services/repositories. **Merged as [#288](https://github.com/lmmoreira/ikaro/pull/288), 2026-07-28.** |

**Discovery update (2026-07-28, story-discovery for PR 3):** Story 4's fix (log the error in `fetchLoyaltyBalance()`'s `catch` block) surfaced that the BFF has no established controller-logging convention to copy — the only `Logger` usage anywhere in the BFF was a raw `new Logger(AppThrottlerGuard.name)` from `@nestjs/common` in `apps/bff/src/shared/guards/app-throttler.guard.ts`, which itself violates the documented rule at `docs/10-OBSERVABILITY_STRATEGY.md:961`/`docs/ENGINEERING_RULES.md:233` ("`AppLogger` is never DI-injected — always `new AppLogger(ClassName.name)` as a field initializer... don't add a new logger-like utility for the same reason"). The same raw-`Logger` anti-pattern was found in 3 backend files: `contexts/platform/application/services/hotsite-image-promotion.service.ts`, `contexts/platform/infrastructure/repositories/caching-tenant.repository.ts`, `contexts/booking/application/services/photo-existence.service.ts`. Decision: fix all 4 sites in this same PR rather than deferring to a separate TD, even though 3 are backend files outside PR 3's original BFF-only scope — each is a mechanical one-line swap (`new Logger(X.name)` → `new AppLogger(X.name)`, matching the exact pattern already used at `apps/backend/src/contexts/notification/application/use-cases/base-notification.use-case.ts:1` and `apps/bff/src/main.ts`'s own `HealthController` example in `docs/10-OBSERVABILITY_STRATEGY.md:923,929`), no test/behavior changes beyond the logger class.

### Wave 3 — BFF auth/request-typing (1 PR — collapsed from 2 due to file overlap)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 4** ✅ | Story 16 + Story 15 (auth-types slice: `CurrentUserPayload.role`, `Roles` decorator) | `apps/bff/src/shared/decorators/current-user.decorator.ts`, `roles.decorator.ts`, `shared/guards/*`, `shared/http/backend-headers.ts`, `shared/request/request.interceptor.ts`, `features/auth/{auth.controller.ts,strategies/jwt.strategy.ts}`, new `shared/auth/google-profile.ts`, `packages/types/src/enums.ts`, 4 backend role guards + `request-context.ts`/`request.interceptor.ts` | Both edit `current-user.decorator.ts` — combine rather than two diffs on one small file. **Merged as [#290](https://github.com/lmmoreira/ikaro/pull/290), 2026-07-29.** No `shared/types/express.d.ts` — see Story 16's Landed note for why, and for the backend-touching scope growth found via cross-tool review. |

### Wave 4 — New batch loyalty-balance endpoint (1 PR — Story 18 split out 2026-07-30, see its discovery update)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 5** ✅ | Story 5 only (Story 18 split out) | Backend: new `get-loyalty-balances/get-loyalty-balances.use-case.ts`, `loyalty-balance-repository.port.ts` + adapter, `LoyaltyController` (`GET /loyalty/balances`, not a new `/internal/*` controller — see Story 5's Landed note). BFF: `customers.controller.ts` (`searchCustomers()` only) | Story 18 no longer bundled — story-discovery for this PR found its fan-out is a different, harder problem than assumed (cross-tenant identity resolution, not same-tenant batching) and split it out rather than rushing new machinery into this PR. See Story 18's discovery update. **Merged as [#293](https://github.com/lmmoreira/ikaro/pull/293), 2026-07-30.** |

### Wave 5 — Independent backend/BFF cleanups (6 PRs, deliberately NOT collapsed — unrelated concerns, no shared file forcing them together)

| PR | Story | Target files |
|---|---|---|
| **PR 6** ✅ | Story 13 | — no code needed; closed 2026-08-03 as superseded (domain-layer validation already covers all 3 fields — tested, wired, translated). See Story 13's note above. |
| **PR 7** ✅ | Story 14 | `provision-tenant.dto.ts`, `update-tenant-settings.dto.ts`, new `country-code.schema.ts`, 4 schedule/availability DTOs, 6 BFF booking/platform controller files, new `@ikaro/validation` `date.ts`/`country-code.ts` | See Story 14's note above — scope grew to a 3rd BFF site and moved to `@ikaro/validation`. **Merged as [#310](https://github.com/lmmoreira/ikaro/pull/310), 2026-08-03.** |
| **PR 8** ✅ | Story 17 (minus the `E2` slice already folded into PR 3) | `customer.controller.ts`, `platform.public.controller.ts`, 4 `schedule*.controller.ts` files, `backend-http.service.ts` | `loyalty.controller.ts` dropped during story-discovery — no longer duplicative after Story 5 (PR #293). **Merged as [#311](https://github.com/lmmoreira/ikaro/pull/311), 2026-08-04.** |
| **PR 9** ✅ | Story 19 | `test/infrastructure/in-memory-loyalty-*` (moved to `test/repositories/loyalty/`), new `test/builders/staff/staff-{activated,deactivated}-event.builder.ts` | Scope corrected during discovery — only 4 of the original 6 files moved (see Story 19's Discovery update). **Merged as [#312](https://github.com/lmmoreira/ikaro/pull/312), 2026-08-04.** |
| **PR 10** ✅ | Story 21 | `services.types.ts`, `services.mapper.ts`, `main.ts` — trivial, zero risk, could honestly go first of anything in this whole plan if you want an easy warm-up PR. **Merged as [#300](https://github.com/lmmoreira/ikaro/pull/300), 2026-08-01.** |
| **PR 11** ✅ | Story 10 | `booking-completed.handler.integration.spec.ts`, delete `apps/web/app/not-found.spec.tsx` — trivial, zero risk. **Merged as [#315](https://github.com/lmmoreira/ikaro/pull/315), 2026-08-04.** |

### Wave 6 — Web (3 PRs — the rename pair collapses, the other two stay separate)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 12** ✅ | Story 9 + Story 11 | `apps/web/features/booking/api/{staff,staff.server}.ts` (renamed) + 17 confirmed importers (not 8 — see Story 9's Landed note) + `apps/web/features/customer/{api,api.server}.ts` + new homes in `booking`/`loyalty` slices | Story 11 needs Story 9's final naming to avoid collisions — same purpose (reorganizing which slice owns what), sequential by construction, land as one PR. **Merged as [#316](https://github.com/lmmoreira/ikaro/pull/316), 2026-08-04.** |
| **PR 13** ✅ | Story 7 | `apps/web/features/booking/api/public.ts` | Unrelated to the rename — independent PR. **Merged as [#297](https://github.com/lmmoreira/ikaro/pull/297), 2026-07-31.** |
| **PR 14** ✅ | Story 8 + Story 20 (AddressFields part) | `WeekNav.tsx`, `Footer.tsx`, `TestimonialCard.tsx`, `AddressFields.tsx`, both locale JSON files | Story 20 already calls for folding its i18n item into Story 8's sweep. **Merged as [#296](https://github.com/lmmoreira/ikaro/pull/296), 2026-07-31.** |

### Already done (not a PR — applied directly as part of this triage)

- Story 12 + Story 11's documentation half: `.copilot/context.md` §11 corrections (BFF layer-shape, actor-scoped-slice rule) — landed 2026-07-23, no PR needed for a doc-only change made during triage.

**Total: 22 stories → 14 PRs.** Hard sequencing: PR 3 before nothing else depends on it, but internally ordered as noted; PR 5 has no upstream dependency; PR 12 must land before nothing else references its renamed paths (Stories 9/11 are the only consumers of the old names within this plan). All other PRs are mutually independent and can be worked in any order.

---

## Acceptance Criteria

- [x] Reviewed by the user/team (2026-07-23 — 🔴 tier reviewed and re-verified against live source)
- [x] Decision made on which items become scoped stories: the 17 🔴 REAL items → 10 stories (1-10). All 30 🟡 rows triaged in a follow-up conversation the same day → 10 more stories (11-20), including the two genuine open-decision items (slice-ownership convention, BFF layer-shape drift) resolved as documentation corrections rather than code stories. All 6 ⚪ rows spot-checked → 2 confirmed genuinely dead code → Story 21; 4 confirmed correctly excluded with rationale recorded above.
- [x] Completeness re-check performed 2026-07-23 after the initial triage pass — found and closed 2 gaps: Part 1's `BFF-1` finding had been missed entirely → Story 22; Part 1's "Web — 2 findings" header was a documentation error (only 1 finding was ever recorded) → corrected to "1 finding" in place.
- [x] 22 stories grouped into a 14-PR execution plan (2026-07-23), collapsing only where stories share a file or have a hard dependency (Waves 2, 3, 4, and the Wave 6 rename pair) — everything else kept as separate, single-purpose PRs.
- [x] PRs 1-14 implemented and landed (each independently, per its stories' Definitions of Done) — all 14 merged as of 2026-08-04 (PR 12, #316, was the last)
- [x] Story 11's documentation half (the slice-ownership rule) and Story 12 (BFF layer-shape correction) applied directly to `CLAUDE.md` §11 on 2026-07-23 — Story 11's code-move half is now PR 12
- [x] This snapshot closed 2026-08-04 — all 22 stories are `✅ Done`. The last two open items both landed: PR 12 (Story 9 + 11, #316) and Story 18 (BFF `getTenants()` per-tenant loyalty-balance fan-out, #317 — the one item split out of the original 14-PR plan as an unscheduled decision on 2026-07-30, resolved with a real fix rather than declined). Nothing further tracked in this file.
