# TD31 — Bad-Smell Audit Coverage Snapshot (2026-07-23)

## Status
- **Type**: Technical Debt / Audit Snapshot — **🔴 items triaged into stories below (2026-07-23); 🟡/⚪ items still pending review**
- **Priority**: See per-story priority below
- **Scope**: whole repo — `apps/backend`, `apps/bff`, `apps/web`
- **Created**: 2026-07-23
- **Origin**: a `skill-creator` eval session benchmarking `/bad-smell-audit` (`.claude/commands/bad-smell-audit.md`) against a freeform baseline audit with no checklist — same model, same three scopes (backend/BFF/web full scans), one pass each, run against the live repo at the time.

## Purpose

This is a **triage snapshot, not a committed remediation plan**. No story/wave breakdown, no acceptance-criteria checkboxes — just the full inventory of what the eval found, organized so a later session can decide what (if anything) becomes real work. Contrast with `td/TD-18-19-20-BAD-SMELL-VIOLAVIONS.md`, which *is* a committed, now-resolved remediation plan; this file deliberately stops one step short of that.

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

### Story 1 — Customer booking-ownership check is controller-only, not use-case-enforced 🔴 Critical

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

### Story 2 — `LoyaltyEntryItem`/`LoyaltyRedemptionItem` shapes have drifted from `@ikaro/types` 🔴 Critical

**Source**: Web 2.1, 2.2

**Target files**:
- `apps/web/features/loyalty/api.ts:9-17` (`LoyaltyEntryItem`), `:24-29` (`LoyaltyRedemptionItem`)
- `packages/types/src/loyalty.dto.ts:17-25` (canonical `LoyaltyEntryItem`), `:27-34` (canonical `LoyaltyRedemptionItem`)
- Any component/hook consuming `getLoyaltyEntries()` / `getLoyaltyRedemptions()` / `getCustomerLoyaltyEntries()` / `getCustomerLoyaltyRedemptions()` from `apps/web/features/loyalty/api.ts` — grep `from '@/features/loyalty/api'` under `apps/web/features/loyalty/` and `apps/web/shells/dashboard/` before starting, and treat every hit as in-scope.

**Problem**: The web-local interfaces declare `entryId`/`serviceId` (entry) and `redemptionId` (redemption), with no `bookingId` field at all. The real BFF response shape (`packages/types/src/loyalty.dto.ts`) uses `id`/`bookingId`/`serviceName` (entry) and `id`/`bookingId`/`amountDeducted` (redemption) — no `entryId`, `serviceId`, or bare `redemptionId`. TypeScript cannot catch this because the web file declares its own parallel interfaces instead of importing the canonical ones — any field access on the wrong name compiles fine and returns `undefined` at runtime. This is the same category of bug `TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md` fixed for `LoyaltyBalanceResponse`, `services`, `customers`, `staff` — but TD09 never looked at these two, and they've drifted since (confirmed live, not historical).

**Work required**:
1. Delete the local `LoyaltyEntryItem`/`LoyaltyRedemptionItem`/`LoyaltyEntriesResponse`/`LoyaltyRedemptionsResponse` interfaces from `apps/web/features/loyalty/api.ts`.
2. Import the canonical `LoyaltyEntryItem`, `LoyaltyRedemptionItem`, `PaginatedLoyaltyEntriesResponse`, `PaginatedLoyaltyRedemptionsResponse` from `@ikaro/types` instead (check the exact export names in `packages/types/src/loyalty.dto.ts` — the canonical pagination wrapper is `{ items, total, page, limit }`, not `{ entries, pagination: {...} }`/`{ redemptions, pagination: {...} }` like the current local shape, so the wrapper shape changes too).
3. Update `getLoyaltyEntries()`, `getLoyaltyRedemptions()`, `getCustomerLoyaltyEntries()`, `getCustomerLoyaltyRedemptions()` return types accordingly.
4. Fix every consumer that reads `.entryId`, `.serviceId`, `.redemptionId`, `.entries`, or `.redemptions` off these responses to use `.id`, `.bookingId`, `.items` instead — `tsc --noEmit` will surface every call site once the interfaces are swapped, so this is mechanically discoverable, but confirm no runtime-only (untyped) access slipped through.

**Why this order/priority**: Silent type-safety hole on a customer-facing loyalty feature — second only to the authz gap in correctness risk.

**Verification**: `pnpm --filter web type-check` (this alone will surface every broken call site), `pnpm --filter web test -- loyalty`, manual check of any `.spec.tsx` mocking these functions (mocks will need the corrected shape too).

**Definition of done**: `apps/web/features/loyalty/api.ts` has zero locally-declared response interfaces for entries/redemptions — everything imported from `@ikaro/types`. Add a note in `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md` linking this fix, since TD09 explicitly didn't cover these two types.

---

### Story 3 — BFF re-implements JWT decoding instead of reusing `CurrentUserPayload` 🔴 High

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

### Story 4 — `fetchLoyaltyBalance()` silently swallows all errors 🔴 High

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

### Story 5 — N+1 loyalty-balance fan-out in customer search 🔴 High (largest story — needs a new backend endpoint)

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

### Story 6 — Booking/Loyalty controllers assemble composite responses inline instead of via mappers 🔴 Medium

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

### Story 7 — Raw `fetch()` calls bypass the required BFF transport helpers 🔴 Medium

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

### Story 8 — Hardcoded pt-BR strings with no `useTranslations` 🔴 Medium

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

### Story 9 — `booking/api/staff.ts` is misnamed after the wrong aggregate 🔴 Low (mechanical, wide but shallow ripple)

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

### Story 10 — Test hygiene: builder bypass + a unit spec contradicting its own documented exemption 🔴 Low

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

### Story 11 — Actor-scoped cross-domain code belongs in the owning domain's slice, not the actor's

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

### Story 12 — (Docs only, no code) Correct `CLAUDE.md` §11's BFF layer-shape row

**Source**: BFF architecture-drift caveat

**Target files**: `.copilot/context.md` §11 only.

**Decision**: the documented `features/<domain>/{presentation,application,infrastructure}/` shape for BFF was never actually applied — every BFF domain slice today is flat (`<domain>.controller.ts`, `<domain>.public.controller.ts`, `<domain>.mapper.ts`, `<domain>.types.ts` directly under `features/<domain>/`). Applied directly in this pass — see the `.copilot/context.md` diff alongside this TD update. No code changes; this story exists only to record that the correction happened and why, since a future audit re-flagging the same "drift" should point here instead of reopening the question.

**Definition of done**: `CLAUDE.md` §11's BFF row describes the real flat shape. Done as part of this same edit — no follow-up code work.

---

### Story 13 — Backend: missing email/phone format validation on 3 DTOs 🟡

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

### Story 14 — Backend + BFF: de-duplicate regex/schema constants 🟡

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

### Story 15 — BFF: tighten loose `string` types to existing unions 🟡

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

### Story 16 — BFF: global `req.user` type augmentation + JWT runtime shape validation 🟡

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

### Story 17 — Backend + BFF: controller response-shaping / config-lookup duplication 🟡

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

### Story 18 — BFF: extend the Story 5 batch loyalty-balance endpoint to `getTenants()` 🟡 (depends on Story 5)

**Source**: BFF A4

**Target files**: `apps/bff/src/features/customer/customers.controller.ts:89-118` (`getTenants()`)

**Problem**: `getTenants()` already batches tenant info via `/internal/tenants?ids=...` (the exact pattern Story 5 replicates for loyalty balances) but still fans out one `/loyalty/balance` call per tenant in `Promise.all([...tenants.map(...)])` because no batch endpoint exists yet for that call.

**Work required**: Once Story 5 lands (`GET /internal/loyalty/balances?customerIds=...` — note `getTenants()`'s fan-out is per-*tenant*, not per-*customer*, since this is the customer switching tenants, not staff searching customers; confirm whether Story 5's new endpoint needs a tenant-scoped variant or whether the same customer-scoped batch endpoint can be called once per tenant here — likely still one call per tenant unless the batch endpoint is extended to accept `(tenantId, customerId)` pairs cross-tenant, which Story 5 does not currently scope). Given this nuance, this story may reduce to "just wire up Story 5's endpoint" if the customer's own ID is constant across tenants, or may need its own small batch variant — resolve this during Story 5's implementation, not blindly before.

**Verification**: `pnpm --filter bff test -- customers.controller`.

**Definition of done**: `getTenants()` no longer makes one loyalty-balance call per tenant, or an explicit note is added explaining why it still must (e.g. if balances are genuinely per-tenant-scoped and no cross-tenant batch is feasible without backend changes beyond Story 5's scope).

---

### Story 19 — Backend: test/builder hygiene — misfiled repos + missing event builder 🟡

**Source**: Backend 4.1, 5

**Target files**:
- `apps/backend/src/test/infrastructure/in-memory-loyalty-{customer,platform,booking}.port.ts`, `in-memory-loyalty-{balance,redemption,entry}.repository.ts` (confirmed: 6 files live here; every other context's in-memory repos live under `test/repositories/<context>/` instead)
- `apps/backend/src/test/builders/staff/` (confirmed: contains only `staff.builder.ts`, `staff-entity.builder.ts`, `staff-invited-event.builder.ts` — no `StaffActivated`/`StaffDeactivated` event builder despite both events being referenced across 7 spec files)

**Work required**:
1. Move the 6 loyalty in-memory test doubles from `test/infrastructure/` to `test/repositories/loyalty/`, matching every other context's layout. Update all importers (grep `test/infrastructure/in-memory-loyalty` across `apps/backend/src`).
2. Add `staff-activated-event.builder.ts` and `staff-deactivated-event.builder.ts` to `test/builders/staff/`, modeled on the existing `staff-invited-event.builder.ts`'s class + `withXxx()`/`build()` shape. Update the 7 spec files currently constructing these events inline (or however they currently reference them) to use the new builders.

**Verification**: `pnpm --filter backend type-check`, `pnpm --filter backend test -- loyalty staff` (confirm both the moved repos and the new builders don't break existing suites).

**Definition of done**: Loyalty in-memory repos live at `test/repositories/loyalty/`. `StaffActivated`/`StaffDeactivated` events have builders, used by all 7 spec files that reference them.

---

### Story 20 — Web: last two `@ikaro/types` duplicates + one hardcoded fallback 🟡

**Source**: Web 2.3, 2.4, 4.5

**Target files**:
- `apps/web/features/loyalty/api.ts:3-7` (`LoyaltyBalanceResponse` — confirmed shape matches `@ikaro/types` exactly; fold into Story 2's edit of this same file rather than a separate PR if Story 2 hasn't landed yet)
- `apps/web/features/auth/session.ts:4-6` (confirmed: `SwitchTenantRequest` hand-redeclared even though the canonical type already exists at `packages/types/src/auth.dto.ts:1` and the sibling `SwitchTenantResponse` in the same file already imports from `@ikaro/types`)
- `apps/web/features/booking/components/public/AddressFields.tsx:188` (confirmed: `label={addressSpec.neighborhoodLabel ?? 'Neighborhood'}` — hardcoded English fallback in a file that otherwise consistently uses `useTranslations`; fold into Story 8's i18n sweep if Story 8 hasn't landed yet)

**Work required**:
1. Delete the local `LoyaltyBalanceResponse` interface from `apps/web/features/loyalty/api.ts`, import from `@ikaro/types` instead.
2. Delete the local `SwitchTenantRequest` interface from `session.ts`, import from `@ikaro/types` instead (matching how `SwitchTenantResponse` already does in the same file).
3. Replace the hardcoded `'Neighborhood'` fallback with a translated key, consistent with the rest of `AddressFields.tsx`'s `useTranslations` usage.

**Verification**: `pnpm --filter web type-check`, `pnpm --filter web test -- loyalty session AddressFields`.

**Definition of done**: Zero locally-redeclared types that already exist in `@ikaro/types` remain in these 2 files. No hardcoded English fallback remains in `AddressFields.tsx`.

---

---

## Implementation Stories — ⚪ tier (2026-07-23 spot-check)

The 6 ⚪ rows were re-verified directly against source (not just re-read from the audit's word) to check whether "stylistic" was the right call for all of them. Two turned out to be genuinely dead code — real, zero-risk, one-line-each fixes that just happen to be trivial rather than not real. The other 4 are confirmed correctly excluded: either purely cosmetic with real ripple cost (Backend 1.4), explicitly judgment-call/plausibly-intentional (Backend 6.1), message-text-only duplication with the actual logic already centralized (Backend 6.2), or a real observation whose "fix" is actually a bigger design decision (splitting a controller) than the finding implies (BFF H1) — none of these 4 get a story.

### Story 21 — Delete two confirmed-dead pieces of code ⚪→real, trivial

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

### Story 22 — Extract `generateAttachmentSignedUrl()`'s 3-way tenant-resolution branching out of the controller

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
| **PR 1** | Story 1 | `booking.controller.ts`, `get-booking-by-id.use-case.ts` (+ spec) | Standalone. Highest priority — security-adjacent. |
| **PR 2** | Story 2 + Story 20 (loyalty part only) | `apps/web/features/loyalty/api.ts` | Same file, same reason (both are `@ikaro/types` drift/duplication on this exact file) — always were meant to land together. |

### Wave 2 — BFF `bookings.controller.ts` cleanup (1 PR — collapsed from 3 due to file overlap)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 3** | Story 3 + Story 22 + Story 4 + Story 6 + Story 15 (booking-types slice: `bookings.types.ts`/`.mapper.ts`/`schedule.types.ts`) + Story 17's `E2` slice (JWT_SECRET caching) | `apps/bff/src/features/booking/{bookings.controller.ts,bookings.mapper.ts,bookings.types.ts,schedule.types.ts}` | 6 stories worth of edits converge on 1-2 files. Collapsing avoids 5 sequential rebases on the same controller. Internal order: extract the shared JWT-decode helper (3) and the tenant-resolution branching (22) first, then the mapper extraction (6) and type-tightening (15) build on the now-cleaner controller, then fold in `fetchLoyaltyBalance` logging (4) and the JWT_SECRET dedup (17 slice) last since they're small and independent of the rest. |

### Wave 3 — BFF auth/request-typing (1 PR — collapsed from 2 due to file overlap)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 4** | Story 16 + Story 15 (auth-types slice: `CurrentUserPayload.role`, `Roles` decorator) | `apps/bff/src/shared/decorators/current-user.decorator.ts`, `roles.decorator.ts`, `shared/guards/*`, `shared/http/backend-headers.ts`, `shared/request/request.interceptor.ts`, `features/auth/{auth.controller.ts,strategies/jwt.strategy.ts}`, new `shared/types/express.d.ts` | Both edit `current-user.decorator.ts` — combine rather than two diffs on one small file. |

### Wave 4 — New batch loyalty-balance endpoint (1 PR — collapsed from 2 due to hard dependency)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 5** | Story 5 + Story 18 | Backend: new `get-loyalty-balances-batch.use-case.ts`, `loyalty-balance-repository.port.ts` + adapter, new `internal-loyalty-read.controller.ts` (+ specs). BFF: `customers.controller.ts` (`searchCustomers()` **and** `getTenants()`) | Story 18 *requires* Story 5's endpoint to exist — shipping as one "add batch loyalty lookup, use it in both call sites" PR avoids a two-step merge-then-depend dance. Largest PR in the plan; consider it a mini-story of its own even though it's 2 doc-stories. |

### Wave 5 — Independent backend/BFF cleanups (6 PRs, deliberately NOT collapsed — unrelated concerns, no shared file forcing them together)

| PR | Story | Target files |
|---|---|---|
| **PR 6** | Story 13 | 3 DTO files (`update-tenant-settings.dto.ts`, `find-or-create-customer.dto.ts`, `update-customer-profile.dto.ts`) |
| **PR 7** | Story 14 | `provision-tenant.dto.ts`, `update-tenant-settings.dto.ts`, 4 schedule/availability DTOs, 5 BFF schedule/booking controller files |
| **PR 8** | Story 17 (minus the `E2` slice already folded into PR 3) | `customer.controller.ts`, `loyalty.controller.ts` (backend), `platform.public.controller.ts`, 4 `schedule*.controller.ts` files, `backend-http.service.ts` |
| **PR 9** | Story 19 | `test/infrastructure/in-memory-loyalty-*` (moved to `test/repositories/loyalty/`), new `test/builders/staff/staff-{activated,deactivated}-event.builder.ts` |
| **PR 10** | Story 21 | `services.types.ts`, `services.mapper.ts`, `main.ts` — trivial, zero risk, could honestly go first of anything in this whole plan if you want an easy warm-up PR |
| **PR 11** | Story 10 | `booking-completed.handler.integration.spec.ts`, delete `apps/web/app/not-found.spec.tsx` |

### Wave 6 — Web (3 PRs — the rename pair collapses, the other two stay separate)

| PR | Stories | Target files | Notes |
|---|---|---|---|
| **PR 12** | Story 9 + Story 11 | `apps/web/features/booking/api/{staff,staff.server}.ts` (renamed) + 8 confirmed importers + `apps/web/features/customer/{api,api.server}.ts` + new homes in `booking`/`loyalty` slices | Story 11 needs Story 9's final naming to avoid collisions — same purpose (reorganizing which slice owns what), sequential by construction, land as one PR. |
| **PR 13** | Story 7 | `apps/web/features/booking/api/public.ts` | Unrelated to the rename — independent PR. |
| **PR 14** | Story 8 + Story 20 (AddressFields part) | `WeekNav.tsx`, `Footer.tsx`, `TestimonialCard.tsx`, `AddressFields.tsx`, both locale JSON files | Story 20 already calls for folding its i18n item into Story 8's sweep. |

### Already done (not a PR — applied directly as part of this triage)

- Story 12 + Story 11's documentation half: `.copilot/context.md` §11 corrections (BFF layer-shape, actor-scoped-slice rule) — landed 2026-07-23, no PR needed for a doc-only change made during triage.

**Total: 22 stories → 14 PRs.** Hard sequencing: PR 3 before nothing else depends on it, but internally ordered as noted; PR 5 has no upstream dependency; PR 12 must land before nothing else references its renamed paths (Stories 9/11 are the only consumers of the old names within this plan). All other PRs are mutually independent and can be worked in any order.

---

## Acceptance Criteria

- [x] Reviewed by the user/team (2026-07-23 — 🔴 tier reviewed and re-verified against live source)
- [x] Decision made on which items become scoped stories: the 17 🔴 REAL items → 10 stories (1-10). All 30 🟡 rows triaged in a follow-up conversation the same day → 10 more stories (11-20), including the two genuine open-decision items (slice-ownership convention, BFF layer-shape drift) resolved as documentation corrections rather than code stories. All 6 ⚪ rows spot-checked → 2 confirmed genuinely dead code → Story 21; 4 confirmed correctly excluded with rationale recorded above.
- [x] Completeness re-check performed 2026-07-23 after the initial triage pass — found and closed 2 gaps: Part 1's `BFF-1` finding had been missed entirely → Story 22; Part 1's "Web — 2 findings" header was a documentation error (only 1 finding was ever recorded) → corrected to "1 finding" in place.
- [x] 22 stories grouped into a 14-PR execution plan (2026-07-23), collapsing only where stories share a file or have a hard dependency (Waves 2, 3, 4, and the Wave 6 rename pair) — everything else kept as separate, single-purpose PRs.
- [ ] PRs 1-14 implemented and landed (each independently, per its stories' Definitions of Done); PR 5 has no dependency, PR 12 must land before anything downstream references the renamed paths
- [x] Story 11's documentation half (the slice-ownership rule) and Story 12 (BFF layer-shape correction) applied directly to `CLAUDE.md` §11 on 2026-07-23 — Story 11's code-move half is now PR 12
- [ ] This snapshot closed, superseded, or split once all 14 PRs land
