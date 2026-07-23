# TD31 — Bad-Smell Audit Coverage Snapshot (2026-07-23)

## Status
- **Type**: Technical Debt / Audit Snapshot — **not yet triaged**
- **Priority**: TBD — pending review
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

## Part 1 — Checklist findings (`/bad-smell-audit`, 3 total)

### Backend — 0 findings
Clean run across BE-1 through BE-7, verified category by category (VO usage, validation duplication, test-builder bypass, missing builders, seed DDL, utility duplication, builder readonly fields). Independently confirmed via direct grep during eval setup — no evidence of a missed finding, but note the eval set has no positive-control case for 6 of the 7 backend checks (only BE-3 had a known historical false positive to regress against).

### BFF — 1 finding
- 🟡 **BFF-1**: `apps/bff/src/features/booking/bookings.controller.ts:238,247,265` — `generateAttachmentSignedUrl()` contains a 3-way scenario-routing chain (JWT user / guest token / anonymous tenant slug) deciding tenant resolution. Verified directly against source — the branching is real. The auditing agent itself flagged this as arguably "infrastructure/routing logic" rather than strict domain business logic, but it does literally match BFF-1's stated criteria.

### Web — 2 findings
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

## Acceptance criteria

- [ ] Reviewed by the user/team
- [ ] Decision made on which items (if any) become scoped stories or their own TDs
- [ ] This snapshot closed, superseded, or split once triaged
