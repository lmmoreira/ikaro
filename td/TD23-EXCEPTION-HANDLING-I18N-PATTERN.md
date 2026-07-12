# TD23 — Exception Handling & i18n Pattern: Backend → BFF → UI

## Status
- **State**: In Progress — Stories 1-10 done (Wave 1 complete; Wave 2 complete: booking, customer, staff, loyalty, platform contexts + shared VOs all done; Wave 3 complete: backend + BFF Zod pipes both emit code-bearing violations. Wave 4 — Story 11, BFF-originated errors — remaining)
- **Type**: Technical Debt / Cross-Cutting Architecture Pattern
- **Priority**: Medium — no single instance is a P0 outage, but the systemic gap already causes 2 confirmed raw-English-in-pt-BR-UI leaks in production code, a fragile string-match anti-pattern, a dead-but-leak-shaped mechanism, and 40+ error paths across the app that lose specificity they could have
- **Scope**: `apps/backend` (all 6 contexts + shared value objects), `apps/bff` (all feature slices), `apps/web` (all domain/shell slices), `packages/types`, `packages/i18n`
- **Supersedes**: `td/TD14-BOOKING-ADDRESS-ERROR-ATTRIBUTION.md` — folded in as Story 3's concrete example (booking context, `AddressValidationError` field discriminator)
- **Related, not superseded**:
  - `td/TD10-BFF-BACKEND-UNREACHABLE-GENERIC-500.md` — BFF timeout/unreachable handling collapsing to a generic 500. Orthogonal to this TD's scope (network-level, not error-shape/i18n), but when TD10 is picked up, its `502` branch should emit a `code` (e.g. `BFF_UPSTREAM_UNAVAILABLE`) under this TD's envelope rather than a bare string.
  - `td/TD11-BFF-BACKEND-VALIDATION-SCHEMA-DUPLICATION.md` — BFF and backend independently re-validate the same business rules. This TD's discovery found the problem is **worse than TD11 catalogued**: TD11 only lists `tenant-settings.controller.ts` and `hotsite-admin.controller.ts` vs. their backend DTOs. The actual count is **three independent BFF copies of address validation** (`bookings.controller.ts`, `customers.controller.ts`, `tenant-settings.controller.ts`) plus the backend's own `countrySpec`-driven `Address` VO — four total — and the BFF copies are not just textually duplicated, they are **semantically looser** (no country-awareness, so a value the backend would reject can pass the BFF's shallower `zipCode`/`state` length checks). TD11's proposed shared-schema package, if/when built, is where a single `code` per validation rule would live instead of being assigned four times in the interim. This TD does not re-scope TD11's fix — Story 10 below assigns codes to all four copies as an interim measure and explicitly flags TD11 for a scope update.
- **Non-goals**: no product feature changes to what's valid/invalid; no visual/UX redesign of error states; does not replace TD11's shared-schema-package proposal.

---

## Problem

Backend errors reach the UI today through **four incompatible shapes**, none of which carry a stable machine-readable identifier — only free-text strings and an HTTP status code. Every one of these strings is either static English/mixed-language prose or dynamically built from non-translated country/domain labels. The frontend has no reliable way to select the right message for the right situation without either (a) branching on HTTP status alone and losing all specificity, or (b) rendering the raw backend string and leaking untranslated/backend-internal text into a pt-BR (or `en`) UI.

This was discovered incrementally while auditing `td/TD14-BOOKING-ADDRESS-ERROR-ATTRIBUTION.md` (which addresses one specific instance: the booking form can't tell which of two addresses a 400 is about). Pulling that thread across the whole stack surfaced that the same disease exists everywhere a domain error crosses an HTTP boundary:

- **Backend**: 5 of 6 context error mappers (`booking`, `customer`, `staff`, `loyalty`, `platform`) emit a flat `{ type: 'about:blank', title, status, detail: err.message }` for every domain error, with **zero** `violations` and **zero** machine-readable code. Only the shared Zod validation pipe produces `violations[]` today, and even those carry raw Zod-generated `message` text, not a code.
- **BFF**: has its own independent Zod pipe (same shape, same gap) and its own duplicated business-rule schemas (see TD11 cross-reference above). It also has ~15 BFF-originated error conditions (guest-token failures, guard rejections, dev-login guards, tenant-not-registered checks) spread across 3 further incompatible shapes, plus one genuine reshape-and-simplify bug (`ActiveStaffGuard` discards the backend's real error and substitutes a generic 503).
- **Web**: 40+ distinct error-consumption sites, of which 2 render raw backend text directly to users (`ScheduleRemovalDialog.tsx`, `ScheduleDateTimeRangeSheet.tsx` — a pt-BR user hitting a schedule-closure validation error sees literal English), 1 fragile site string-matches raw backend English prose to decide which translated key to show (`ServiceEditPage.tsx` — silently breaks if backend wording changes), 1 dead mechanism is already leak-shaped and only inert because of an empty `catch {}` two levels up (`BookingDetailPage.tsx`'s `extractValidationMessage`), and roughly 14 more sites are "blind" — they only branch on HTTP status, discarding any specificity the backend could have provided even today.

There is exactly one working reference implementation of a better pattern already in the codebase: `InformationCompletionPrompt.tsx` reads `violations[].field` (never `.message`) and maps the field name to its own translated copy via `next-intl`. This TD generalizes that pattern into a single contract used everywhere, replaces free-text `message` with a stable `code`, and closes the gaps found along the way (including three real, previously-unknown bugs — see Wave 2/4 notes).

---

## Current State — Full Inventory

### Backend: base domain error classes

| Class | File:Line | Shape |
|---|---|---|
| `BookingDomainError` | `apps/backend/src/contexts/booking/domain/errors/booking-domain.error.ts:1-7` | `extends Error`, `setPrototypeOf` ✓, sets `this.name` ✓, no `code` |
| `CustomerDomainError` | `apps/backend/src/contexts/customer/domain/errors/customer-domain.error.ts:1-7` | same shape, no `code` |
| `StaffDomainError` | `apps/backend/src/contexts/staff/domain/errors/staff-domain.error.ts:1-7` | same shape, no `code` |
| `LoyaltyDomainError` | `apps/backend/src/contexts/loyalty/domain/errors/loyalty-domain.error.ts:1-7` | same shape, no `code` |
| `PlatformDomainError` | `apps/backend/src/contexts/platform/domain/errors/platform-domain.error.ts:1-7` | same shape, no `code` |
| `NotificationDomainError` | `apps/backend/src/contexts/notification/domain/errors/notification-domain.error.ts:1-6` | `setPrototypeOf` ✓ but does **not** set `this.name` in the base (inconsistency vs. the other 5) |

No context shares a common base — each is an independent copy-pasted `extends Error` class. None have a `code` property today.

### Backend: Booking context — 32 named subclasses + ~23 raw base-class throws

All in `apps/backend/src/contexts/booking/domain/errors/booking-domain.error.ts` unless noted; all `extends BookingDomainError`.

| Class | Def line | Message (S=static/D=dynamic) | Throw site | Mapper branch (`booking-error.mapper.ts`) | Violations? |
|---|---|---|---|---|---|
| ServiceNotFoundError | 9 | D `Service not found: ${id}` | `activate-service.use-case.ts:29` | `:85-99` (404) | N |
| ServiceDeactivatedError | 16 | S `Cannot update a deactivated service` | `service.aggregate.ts:125` | `:100-113` (409) | N |
| ClosureDateInPastError | 23 | S `Cannot close a schedule for a past date` | `schedule-closure.aggregate.ts:115` | `:146-160` (422) | N |
| ScheduleClosureNotFoundError | 30 | D `Schedule closure not found: ${id}` | `remove-closure.use-case.ts:28` | `:85-99` (404) | N |
| ScheduleAlreadyClosedError | 37 | D `Schedule is already closed for date: ${date}` | `close-schedule.use-case.ts:53` | `:100-113` (409) | N |
| OpeningDateInPastError | 44 | S `Cannot open a schedule for a past date` | `open-schedule.use-case.ts:48` | `:146-160` (422) | N |
| DayAlreadyOpenInSettingsError | 51 | D `Day is already open...: ${date}` | `open-schedule.use-case.ts:51` | `:146-160` (422) | N |
| ScheduleOpeningAlreadyExistsError | 58 | D `A schedule opening already exists for date: ${date}` | `open-schedule.use-case.ts:55` | `:100-113` (409) | N |
| ScheduleOpeningNotFoundError | 65 | D `Schedule opening not found: ${id}` | `remove-schedule-opening.use-case.ts:28` | `:85-99` (404) | N |
| AvailabilityDateInPastError | 72 | S `Cannot check availability for a past date` | `get-availability.use-case.ts:57` | `:146-160` (422) | N |
| AvailabilityRangeInvalidError | 79 | D `Invalid availability range: ${reason}` | `get-availability-summary.use-case.ts:61` | `:146-160` (422) | N |
| BookingNotFoundError | 86 | D `Booking not found: ${id}` | `complete-booking.use-case.ts:50` | `:85-99` (404) | N |
| BookingLineRequiredError | 93 | S `A booking must have at least one service line` | `booking.aggregate.ts:249` | **none — generic branch `:161-169` (400)** | N |
| PickupAddressRequiredError | 100 | S `pickupAddress is required when a pickup service is selected` | `booking.aggregate.ts:252` | **none — generic branch** | N |
| InvalidBookingTransitionError | 107 | D `Cannot transition booking from ${from} to ${to}` | `reject-booking.use-case.ts:46` | `:137-145` (422) | N |
| BookingSlotUnavailableError | 114 | S `The requested time slot is no longer available` | `booking-slot-conflict.service.ts:31` | `:100-113` (409) | N |
| BookingServiceNotActiveError | 121 | D `Service is not active: ${id}` | `request-authenticated-booking.use-case.ts:63` | **none — generic branch** | N |
| BookingServiceNotInTenantError | 128 | D `Service does not belong to tenant: ${id}` | `booking-request.helpers.ts:24` | **none — generic branch** | N |
| CancellationWindowExpiredError | 135 | S `Cancellation window has expired for this booking` | `cancel-booking-as-customer.use-case.ts:47` | `:128-136` (422) | N |
| BookingCustomerNotFoundError | 142 | D `Customer not found: ${customerId}` | `request-authenticated-booking.use-case.ts:54` | `:85-99` (404) | N |
| CustomerPhoneNotSetError | 149 | S `Customer must set a phone number before booking` | `request-authenticated-booking.use-case.ts:55` | `:76-84` (422) | N |
| BookingRejectionReasonTooShortError | 156 | S `Rejection reason must be at least 10 characters` | `booking.aggregate.ts:377` | `:63-75` (400) | N |
| BookingInfoMessageTooShortError | 163 | S `Info request message must be at least 20 characters` | `booking.aggregate.ts:406` | `:63-75` (400) | N |
| BookingForbiddenError | 170 | S `You are not allowed to perform this action on the booking` | `cancel-booking-as-customer.use-case.ts:43` | `:54-62` (403) | N |
| BookingScheduledInPastError | 177 | S `New scheduled time must be in the future` | `approve-booking.use-case.ts:57` | `:128-136` (422) | N |
| BookingScheduledAtInvalidError | 184 | S `Scheduled time must be a valid date` | `approve-booking.use-case.ts:56` | **none — generic branch** | N |
| CompleteBookingLinesIncompleteError | 191 | D `Completion request is missing entries for line(s): ${ids}` | `complete-booking.use-case.ts:57` | `:63-75` (400) | N |
| BookingPhotoNotUploadedError | 198 | D `Photo was not found in storage: ${storagePath}` | `photo-existence.service.ts:36` | **none — generic branch** | N |
| BookingDiscountNotAvailableError | 205 | S `A loyalty discount cannot be applied to a guest booking` | `complete-booking.use-case.ts:105` | `:114-127` (422) | N |
| BookingDiscountDisabledError | 212 | S `Loyalty redemption is disabled for this tenant` | `complete-booking.use-case.ts:108` | `:114-127` (422) | N |
| BookingDiscountMismatchError | 219 | S `discountByPoints.amountDeducted does not reconcile...` | `complete-booking.use-case.ts:115` | `:114-127` (422) | N |
| BookingDiscountExceedsTotalError | 228 | S `discountByPoints.amountDeducted cannot exceed the booking lines total` | `booking.aggregate.ts:486` | `:114-127` (422) | N |

Default/unhandled fallthrough: `booking-error.mapper.ts:170-171` (`if (err instanceof Error) throw err`).

**~23 raw `throw new BookingDomainError(...)` with inline messages, no named subclass**, all hitting the generic `:161-169` (400) branch: `service.aggregate.ts:84,86,88,91,94,127,129,132,135`; `schedule-closure.aggregate.ts:109,110,112,123,127,130`; `schedule-opening.aggregate.ts:83,84,88,91`; `get-availability.use-case.ts:64,67`; `get-availability-summary.use-case.ts:74,75`.

### Backend: Customer context — 1 named subclass + 6 raw throws

| Class | Def | Message | Throw site | Mapper | Violations |
|---|---|---|---|---|---|
| CustomerNotFoundError | `customer-domain.error.ts:9` | D `Customer not found: ${customerId}` | `get-customer-by-id.use-case.ts:27` | `customer-error.mapper.ts:29-37` (404) | N |

Default: `:38-46` generic branch (400) → `:47-48` Error passthrough. Raw throws: `customer.aggregate.ts:58,59,60,62,84,86` (e.g. `'tenantId is required'`, `'email must be a valid email address'`).

### Backend: Staff context — 9 named subclasses, all individually mapped + 10 raw throws

| Class | Def | Message | Throw site | Mapper branch | Violations |
|---|---|---|---|---|---|
| StaffNotFoundError | `:9` | D `Staff member not found: ${identifier}` | `get-staff-tenants-by-id.use-case.ts:27` | `staff-error.mapper.ts:17-25` (404) | N |
| StaffAlreadyActiveError | `:16` | D `Staff member ${staffId} is already active` | `activate-staff.use-case.ts:40` | `:26-34` (409) | N |
| StaffDeactivatedError | `:23` | S `Staff account is deactivated` | `link-google-account.use-case.ts:36` | `:71-79` (403) | N |
| StaffEmailMismatchError | `:30` | S `The Google account email does not match the invited email address` | `link-google-account.use-case.ts:38` | `:89-97` (422) | N |
| StaffAlreadyExistsError | `:37` | D `Staff with email ${email} already exists in this tenant` | `invite-staff.use-case.ts:46` | `:35-43` (409) | N |
| StaffSelfDeactivationError | `:44` | S `Cannot deactivate your own account` | `deactivate-staff.use-case.ts:39` | `:44-52` (403) | N |
| StaffSelfReactivationError | `:51` | S `Cannot reactivate your own account` | `activate-staff.use-case.ts:39` | `:53-61` (403) | N |
| LastActiveManagerError | `:58` | S `Cannot remove the last active manager` | `update-staff-profile.use-case.ts:39` | `:62-70` (409) | N |
| StaffGoogleAccountConflictError | `:65` | S `This Google account is already linked to a different staff member` | `staff.aggregate.ts:143` | `:80-88` (409) | N |

Default: `:98-106` generic (400) → `:107-108` Error passthrough. **Bug (Story 5): no `AddressValidationError`/`CountryCodeValidationError` branch exists in this mapper at all** — unlike booking/customer/platform, staff falls straight to unshaped `Error` passthrough for those VO errors. Raw throws: `staff.aggregate.ts:82,83,85,88,111,112,139,141,152,168`.

### Backend: Loyalty context — 4 named subclasses, structurally different mapper

| Class | Def | Message | Throw site | Mapper branch | Violations |
|---|---|---|---|---|---|
| LoyaltyInvalidPointsError | `:9` | S `points must be greater than zero` | `loyalty-entry.aggregate.ts:66` | **none — unconditional 500 default (`:30-38`)** | N |
| LoyaltyEntryNotFoundError | `:16` | D `LoyaltyEntry not found: ${id}` | **never thrown anywhere** (dead class) | none — 500 fallback | N |
| LoyaltyInsufficientPointsError | `:23` | S `insufficient points to complete this operation` | `loyalty-balance.aggregate.ts:40` | `loyalty-error.mapper.ts:19-29` (422) | N |
| LoyaltyBalanceNotFoundError | `:30` | S `no loyalty balance found for this customer` | `redeem-points.use-case.ts:46` | `:8-18` (404) | N |

**Bug (Story 6): unlike the other 4 mappers, `loyalty-error.mapper.ts` has no generic domain-error catch-all and no `Error` passthrough — its default (`:30-38`) unconditionally returns 500 for anything unmatched, including `LoyaltyInvalidPointsError`, which should be a 4xx.**

### Backend: Platform context — 7 named subclasses + 1 outlier VO error + ~29 raw throws

| Class | Def | Message | Throw site | Mapper branch | Violations |
|---|---|---|---|---|---|
| SlugAlreadyTakenError | `platform-domain.error.ts:9` | D `Slug '${slug}' is already in use` | `provision-tenant.use-case.ts:41` | `platform-error.mapper.ts:15-23` (409) | N |
| TenantNotFoundError | `:16` | D `Tenant '${tenantId}' not found` | `unpublish-hotsite.use-case.ts:46` | `:33-45` (404) | N |
| TenantInactiveError | `:23` | D `Tenant '${tenantId}' is inactive and cannot be modified` | `tenant.aggregate.ts:100` | `:24-32` (409) | N |
| HotsiteNotFoundError | `:30` | D `Hotsite config for tenant '${tenantId}' not found` | `hotsite-content-reader.service.ts:30` | `:33-45` (404) | N |
| HotsiteImageNotUploadedError | `:37` | D `Image was not found in storage: ${storagePath}` | `feature-booking-photo.use-case.ts:25` | **none — generic branch `:64-72`** | N |
| FeaturedBookingNotFoundError | `:44` | D `Booking '${bookingId}' not found` | **never thrown** (dead, still mapped) | `:33-45` (404) | N |
| PhotoNotOnBookingError | `:51` | D `Photo '${photoUrl}' was not found on the booking's before/after photo lists` | **never thrown** (dead, unmapped) | **none — generic branch** | N |
| **TenantSettingsValidationError** (outlier — lives in `domain/value-objects/tenant-settings.vo.ts:353-358`, not `domain/errors/`) | `:353` | Mixed, 5 sites: `tenant-settings.vo.ts:185,192,200,210,347` | see above | **none — generic branch** | N |

Default: `:73-74` Error passthrough. **~29 raw `PlatformDomainError` throws**: `tenant.aggregate.ts:65,68,109`; `hotsite-config.aggregate.ts:388,402,408,425,432,439,442`; `tenant-settings.vo.ts:216,222,225,228,231,234,240,243,246,249,252,255,258,264,283,286,293,296,339` — dynamic per-field messages (e.g. `` `${field} must be a valid hex color (e.g. #FF5733)` ``). Heaviest single-context load.

### Backend: Notification context — no HTTP surface

`NotificationDomainError` + `EmailDeliveryException` (D `Email delivery failed: ${cause}`, thrown at `sendgrid-email.adapter.ts:31`). No controller, no error mapper anywhere under `contexts/notification/` — event-consumer-only, never surfaces to HTTP. Out of scope for the mapper work below; only the base-class `this.name` fix (Story 2) touches this context.

### Backend: Shared value objects — only 2 of ~11 have named error classes

| VO | Error class? | Def | Call sites | Mapper coverage |
|---|---|---|---|---|
| Address | `AddressValidationError` (`shared/value-objects/address.ts:14-20`) | D, e.g. `` `Invalid ${spec.postalLabel}: ${value}` `` | `address.ts:59,62,65,71` | Explicit branch in booking/customer/platform (400); **absent in staff** |
| CountryCode | `CountryCodeValidationError` (`country-code.vo.ts:8-14`) | S+D | `country-code.vo.ts:30,35` | Explicit branch in booking/customer/platform; **absent in staff** |
| Money | **plain `Error`, no class** | D, `money.ts:18,22,41,48` | — | Falls to bottom `instanceof Error` passthrough → generic 500/unshaped by Nest's default filter (no global `ExceptionFilter` exists) |
| PhoneNumber | plain `Error` | D `` `"${phone}" is not a valid phone number...` `` | `phone-number.vo.ts:12` | same |
| SeoTitle | plain `Error` | D | `seo-title.vo.ts:12` | same |
| SeoDescription | plain `Error` | D | `seo-description.vo.ts:12` | same |
| Slug | plain `Error` | D | `slug.vo.ts:12` | same |
| HexColor | plain `Error` | D | `hex-color.vo.ts:12` | same |
| Timezone | plain `Error` | D | `timezone.vo.ts:14` | same |
| TimeOfDay | plain `Error` | D | `time-of-day.vo.ts:22` | same |
| Email | plain `Error` | D | `email.vo.ts:22` | same |

**8 of ~11 shared VOs throw bare `new Error(...)`**, invisible to every mapper's `instanceof` chain — the least-structured, least-visible error source in the whole backend.

### BFF: Zod schemas behind `ZodValidationPipe`

| File:Line | Schema | Duplicates a backend rule? |
|---|---|---|
| `bookings.controller.ts:51-59` | `AddressSchema` | **YES, independently and more loosely** — `state` any 1-10 chars, `zipCode` any 1-20 chars, no country-awareness. Backend `Address.create()` validates against `countrySpec` (country-specific postal/state regex). |
| `customers.controller.ts:23-31` | `AddressSchema` (2nd copy) | **YES — 2nd independent copy**, identical shallow rules |
| `tenant-settings.controller.ts:60-70` | `BusinessInfoAddressSchema` (3rd copy) | **YES — 3rd independent copy** |
| `hotsite-admin.controller.ts:73-78` | `HotsiteSeoBodySchema` | **YES, different kind** — a hand-kept copy of `SeoTitle.MAX_LENGTH`/`SeoDescription.MAX_LENGTH` (comment at lines 68-72 admits this explicitly) |
| ~30 further schemas across `bookings`, `customers`, `tenant-settings`, `tenant`, `staff`, `loyalty`, `hotsite-admin`, `services`, `schedule*`, `auth` controllers | various | not independently duplicated — see full BFF discovery notes for the complete list (30+ schemas, all producing the same `{field, message}` violation shape via the BFF's own `zod-validation.pipe.ts:11-14`) |

**Address validation is duplicated 4 times total** (backend `countrySpec`-driven VO + 3 shallow BFF copies) — see TD11 cross-reference above.

### BFF: BFF-originated error conditions (non-passthrough)

| File:Line | Condition | Status | Shape |
|---|---|---|---|
| `bookings.controller.ts:250-258` | guest-token decode fails | 401 | ad-hoc object, no `violations`/`code` |
| `bookings.controller.ts:334-343` | loyalty-balance fetch fails | n/a | **swallowed — any error discarded, returns `null`** |
| `bookings.controller.ts:473-483` | guest booking not in `INFO_REQUESTED` status | 409 | ad-hoc object |
| `bookings.controller.ts:488-524` | missing/invalid/mismatched guest token (3 branches) | 400/401/400 | ad-hoc objects |
| `schedule-availability.controller.ts:25-35` | missing `X-Tenant-Slug` header | 400 | ad-hoc object |
| `customers.controller.ts:119` | tenant missing from internal batch lookup | n/a | **plain `throw new Error(...)`, not `HttpException`** — falls to generic 500 with no `detail` at all |
| `auth-controller-flow.service.ts:131` | same batch-lookup-miss pattern | n/a | same plain-`Error`-then-500 bug, 2nd occurrence |
| `auth-controller-flow.service.ts:152-159,191-198` | staff/customer not registered for target tenant | 403 (×2) | ad-hoc objects |
| `auth-controller-flow.service.ts:235-294` | dev-login guards (env checks, oversized synthetic ID) | 403/403/400 | ad-hoc objects, one missing `type` field |
| `auth-controller-flow.service.ts:367-386` | backend 404 silently converted to `null` sentinel | n/a | error-reshaping (absorbed, not rethrown) |
| `auth-controller-flow.service.ts:412-423` | `mapStaffLinkError` — collapses backend 422/403/409 into `StaffLoginFailureReason` enum for a redirect query param | n/a | the one genuine "mapper" in the BFF — confirmed exception, not a systemic pattern |
| `active-staff.guard.ts:57-85` | **Real bug**: uses raw `HttpService` (not `BackendHttpService`, justified by DI scope — see code comment) and **reshapes/discards the backend's real error body**, substituting a generic 503 "Could not verify staff account status" | 403/503 | the only true reshape-and-simplify of a genuine backend error found anywhere in the BFF |
| `uploads.controller.ts:22-26` | invalid `contentType` | 400 | Nest's default `BadRequestException(string)` shape — `{statusCode, message, error}`, a 3rd shape incompatible with the other two |

Every other endpoint across `bookings`, `customers`, `services`, `schedule*`, `staff` (6), `loyalty` (8), `hotsite-admin` (8), `tenant`, `tenant-settings` is confirmed pure passthrough via `BackendHttpService`.

**Four incompatible error-body shapes coexist in the BFF today**: (1) ad-hoc ProblemDetail-ish objects, (2) the Zod-pipe shape with `violations`, (3) Nest's default `BadRequestException(string)` shape, (4) raw backend passthrough. None carry a `code`.

**HTTP clients**: `BackendHttpService` (canonical, transparent passthrough — `backend-http.service.ts:100-110`) and a second, structurally different client: raw `HttpService` in `active-staff.guard.ts` (DI-scope-justified, but the only place that doesn't pass through cleanly).

**No BFF-side named error classes exist** — confirmed via repo search. `error.interceptor.ts` is the last-resort net: passes `HttpException` through unchanged; anything else (a plain `Error`, like the two batch-lookup bugs above) becomes a bare `{type:'about:blank', title:'Internal Server Error', status:500}` with no trace of the real cause.

### Web: custom frontend error classes

| Class | File:line | Properties | Notes |
|---|---|---|---|
| `ApiError` | `shared/lib/api/errors.ts:17-26` | `status`, `detail`, `data?` (raw body incl. `violations` if sent) | populated by `bffClient` axios interceptor for non-401/403 non-2xx |
| `AuthError` / `ForbiddenError` | `shared/lib/api/errors.ts:1-15` | `message` only | 401/403 via `bffClient` |
| `AuthFetchError` | `features/auth/api.ts:5-11` | `status` | |
| `FetchCustomerProfileError` | `features/platform/hotsite/api/customers.ts:13-19` | `status` | |
| `UpdateHotsiteCustomerProfileError` | `features/platform/hotsite/api/customers.ts:40-49` | `status`, `violations` (parses body) | **the good example** |
| `GuestBookingReadError`, `ServiceListFetchError`, `ServiceDetailFetchError`, `BookingDetailFetchError`, `CustomerFetchError`, `ScheduleFetchError`, `StaffDetailFetchError` | various `*.server.ts` files | `status`, hardcoded English `message` — never backend text | |
| `CreateBookingError` | `features/booking/api/public.ts:9-18` | `status` only — **discards response body on error, never calls `res.json()`** | blocks TD14's fix from reaching `BookingForm.tsx` regardless of backend changes |
| `SubmitGuestBookingInfoError` | `features/booking/api/public.ts:65-74` | `status`, hardcoded `message` | |

### Web: error-consumption sites (condensed — full per-site detail available in the discovery transcript; summarized by classification here)

| Classification | Count | Representative sites |
|---|---|---|
| **LEAK** (renders raw backend text) | 2 confirmed | `booking/components/dashboard/schedule/ScheduleRemovalDialog.tsx:57-58`, `ScheduleDateTimeRangeSheet.tsx:119-124` — both render `err.detail` directly with only a fallback for the "no detail" case |
| **STRING-MATCH** (fragile, matches raw English backend prose to pick a key) | 1 | `booking/components/dashboard/services/ServiceEditPage.tsx:24-40` — `err.detail.toLowerCase().includes('cannot update a deactivated service')` |
| **Dead but leak-shaped** | 1 mechanism, 2 call sites | `BookingDetailPage.tsx:161-166` (`extractValidationMessage`, reads raw `violation.message`) → `RejectBookingSheet.tsx:40-42`, `RequestInfoSheet.tsx:40-42` (both swallow it in an empty `catch {}` today, so the leak is currently inert — but the mechanism itself needs to be code-based before it's ever reactivated) |
| **SAFE reference implementation** | 1 | `customer/components/InformationCompletionPrompt.tsx:99-118` — `violations[].field` → translated key, never raw text |
| **BLIND** (status-only, loses specificity) | ~14 | `BookingForm.tsx`, `SubmitInfoForm.tsx`, `ServiceCreatePage.tsx`, `BookingQueuePage.tsx`, `RescheduleBookingPage.tsx`, `BookingDetailPage.tsx` (approve/reject flows), `StaffDetailPage.tsx`, `InviteForm.tsx`, `DeactivateConfirmPage.tsx`, `CancelConfirmPage.tsx`, `app/bookings/[id]/submit-info/page.tsx` |
| **SAFE** (generic fallback only, no leak, no specificity attempted) | ~20 | loyalty search/detail pages, hotsite editor/upload components, error boundaries, tenant-switch flows — mostly bare `catch` blocks with fixed translated copy |
| **ROUTING/SAFE** (status used correctly for navigation, not messaging) | ~6 | `*-route.server.ts` files, `customer/api.server.ts`'s redirect helpers — `404→notFound()`, `401/403→redirect(login)` |

40+ distinct consumption points total across booking, customer, staff, loyalty, platform/hotsite, and the dashboard/hotsite shells.

---

## Architecture Decisions (target pattern)

### 1. Canonical envelope

```ts
interface ProblemDetail {
  type: string;      // RFC 9457 URI reference. Stays 'about:blank' (or a real relative URI later) — never repurposed to carry the app code. Keeps RFC compliance and the app-internal contract as separate concerns.
  title: string;
  status: number;     // Transport/routing only from here on — see §6.
  code: string;        // NEW. Stable, namespaced, machine-readable (see §3), backed by a literal union type per origin (not bare `string`) so a typo or an uncatalogued code is a compile error, not a runtime gap — see §9. The ONLY thing frontend message-selection is allowed to branch on.
  field?: string;       // NEW. Present when a single-cause error is attributable to one specific request field (e.g. 'pickupAddress', 'phone'). Absent when there's no natural field (e.g. BookingNotFoundError).
  params?: Record<string, string | number>;  // NEW. Only for genuinely dynamic, server-derived values the client can't already know (e.g. a computed minimum date). Never echoes back what the user typed; never pre-formatted/localized text.
  detail: string;      // EXISTING. Backend-internal/debug text only. Contractually never rendered to a user — enforced by the new ANTI_PATTERNS.md rule (Story 17).
  violations?: { field: string; code: string; params?: Record<string, string | number> }[]; // EXISTING shape, `message` replaced with `code`+`params`. See §2.
}
```

### 2. Two shapes, not one

- **Single-cause errors** (the ~65 named domain error classes + ~68 raw base-class throws + the 8 plain-`Error` VOs — i.e. almost everything in the backend inventory above) use top-level `code` + optional `field`. They are **not** wrapped in a one-element `violations` array — that was always a semantic stretch for something that fails fast on the first problem.
- **Batch/multi-field validation** (Zod pipes, both backend's and BFF's, which can legitimately report several simultaneous field failures from one request body) use `violations[]`.

### 3. Code naming convention

`<ORIGIN>_<REASON>`, upper snake case, origin prefix identifies the layer/context at a glance:
- Backend domain, by context: `BOOKING_*`, `CUSTOMER_*`, `STAFF_*`, `LOYALTY_*`, `PLATFORM_*`
- Backend shared VOs (cross-context, not context-owned): `ADDRESS_*`, `COUNTRY_CODE_*`, `PHONE_*`, `MONEY_*`, `SEO_TITLE_*`, `SEO_DESCRIPTION_*`, `SLUG_*`, `HEX_COLOR_*`, `TIMEZONE_*`, `TIME_OF_DAY_*`, `EMAIL_*`
- BFF-originated: `BFF_*` (e.g. `BFF_GUEST_TOKEN_INVALID`, `BFF_UPSTREAM_UNAVAILABLE`)
- Framework/generic fallback, used only when nothing more specific applies: `AUTH_UNAUTHORIZED`, `AUTH_FORBIDDEN`, `INTERNAL_ERROR`, `NOT_FOUND`

### 4. Shared catalog — single source of truth

`packages/types/src/error-codes.ts` — one const object/union type per origin (matches the convention TD09 already established for shared DTOs: check `@ikaro/types` before declaring a shape independently). Imported by backend (error classes reference their own codes), BFF (BFF-originated codes + re-exports backend codes for its own violations), and web (the resolver maps code → i18n key).

`packages/i18n/locales/{locale}/errors.json` (new file, parallel to existing `web.json`/`notifications.json`/`email-tables.json`) — one translation entry per code, **keyed by the exact code string**, so lookup is mechanical and the exhaustiveness test (Story 17) is a straightforward "every catalog code has a key in every locale file" check.

### 5. Frontend resolver

One shared helper, `apps/web/shared/lib/i18n/resolve-error-message.ts` — `resolveErrorMessage(code, params?) → string`, backed by `errors.json`. Feature components call this instead of hand-branching on `status`/`.detail`/`.message`. `field` is used for routing (which step/screen to highlight), never for message selection.

### 6. `status` vs `code` — roles redefined, not left overlapping

`status` becomes transport/routing only: 401 → redirect to login, 403 → forbidden screen, 404 → `notFound()`, 409 → conflict-specific UI state (e.g. fetch alternative slots), 5xx → generic retry copy. `code` is the only thing that selects a message, everywhere, once a site is migrated. No component should branch on `status===400` to pick a message after Wave 5.

### 7. Fallback discipline

A `ProblemDetail` with no `code` (pre-migration) or an unrecognized `code` (client/server version skew) → generic fallback message + a `console.warn`/telemetry signal, so the gap is observable rather than silently swallowed. Never fall through to rendering `detail`.

### 8. Relationship to TD10 / TD11

This TD does not re-scope either. TD10's eventual `502` branch should emit `code: 'BFF_UPSTREAM_UNAVAILABLE'` under this envelope. TD11's shared-schema package, if executed, becomes the single place the (currently 4) independent address-validation copies' `code` assignment would live — Story 10 below assigns codes to all 4 copies independently as an interim measure and flags TD11 for a scope update to include the 3rd BFF copy and the SEO-length duplicate it didn't catalog.

### 9. Code lifecycle & compile-time governance

Codes are additive-only once shipped: never renamed or repurposed, since a released frontend bundle may still hold a cached reference to one during a rolling deploy. Retiring a code means removing every throw site first, then leaving its catalog entry and translation in place for at least one release cycle before deleting it, so an in-flight client never resolves an unknown code.

Governance against a *future* error class shipping without a code is enforced at compile time, not by a lint rule or a runtime check: `packages/types/src/error-codes.ts` exports each origin's codes as a literal union (`type BookingErrorCode = ...`), and each context's base error class constructor (Story 2) types its `code` parameter against that union — not `string`. A developer adding error #66 next year cannot construct it with a code that isn't already in the catalog; TypeScript rejects the call. This is stronger than the exhaustiveness test in Story 17 (which only catches a catalog code missing a *translation*, not a thrown error missing a *catalog entry*).

### 10. Security-sensitive errors: specificity is a per-case decision, not a default

The pattern's default is "assign the most specific code available." That default is wrong for error paths where revealing the precise internal reason creates an enumeration or information-disclosure risk — e.g. distinguishing "no account with this email" from "account exists, wrong linked provider" in an auth/staff-linking flow tells an attacker something they shouldn't learn for free. Story 5 (staff — Google account linking/conflict errors) and Story 11 (BFF-originated auth/guest-token errors) must each evaluate their error set for this risk explicitly and deliberately collapse multiple internal reasons into one generic code where warranted (e.g. a single `AUTH_INVALID_CREDENTIALS` rather than separate codes per internal cause), rather than mechanically exposing the most specific code by default.

### 11. Proof of the full chain, not just isolated layers

Each story's acceptance criteria verifies its own layer in isolation (backend emits `code`, frontend consumes `code`). That's necessary but not sufficient proof the pattern actually works end-to-end through a real deploy of all three apps. Story 14 (fixing the two confirmed live leaks) is the natural place for at least one full-chain proof: a Playwright test that submits an invalid value, and asserts the *correct, translated* message renders — not just that some message renders. This is the pattern's own regression test, not a per-story nicety.

---

## Migration Waves — Implementation Stories

18 stories across 6 waves (Story 18 is a recommended, non-blocking follow-up), sequenced so each is independently PR-sized and the contract is additive (non-breaking) until Wave 5 starts consuming it.

### Wave 1 — Foundation

#### Story 1 — Canonical envelope + shared code catalog skeleton ✅ Done

**Scope:** `packages/types`, `packages/i18n`, this TD.

**Work required:**
1. Add `code`, `field`, `params` to `ProblemDetail`/`ValidationProblemDetail` in `packages/types/src/errors.dto.ts` and the mirrored `apps/backend/src/shared/http/problem-detail.ts` (keep both in sync — same pattern already used for this interface pair).
2. Change `ValidationViolation` from `{ field, message }` to `{ field, code, params? }`.
3. Create `packages/types/src/error-codes.ts` — one `as const` object + derived literal union type per origin (`BookingErrorCode`, `CustomerErrorCode`, `StaffErrorCode`, `LoyaltyErrorCode`, `PlatformErrorCode`, `AddressErrorCode`, `PhoneErrorCode`, `MoneyErrorCode`, `SeoErrorCode`, `SlugErrorCode`, `HexColorErrorCode`, `TimezoneErrorCode`, `TimeOfDayErrorCode`, `EmailErrorCode`, `BffErrorCode`, `GenericErrorCode`) — e.g. `export const BookingErrorCode = { NOT_FOUND: 'BOOKING_NOT_FOUND', ... } as const; export type BookingErrorCode = (typeof BookingErrorCode)[keyof typeof BookingErrorCode];`. The union, not just the object, is what Story 2's base classes type against — see §9. Empty/placeholder members populated context-by-context in Wave 2.
4. Create `packages/i18n/locales/pt-BR/errors.json` and `packages/i18n/locales/en/errors.json` — empty skeleton, populated alongside each Wave 2/3/4 story.
5. No behavior change anywhere — purely additive types.

**Acceptance criteria:**
- [ ] `ProblemDetail`/`ValidationProblemDetail` compile with the new optional fields; no existing call site breaks
- [ ] `error-codes.ts` exports the full set of empty per-origin catalogs, each as an `as const` object with a derived literal union type (not a bare `string` alias)
- [ ] `errors.json` skeleton exists in both locales

**DoD:** Types compile, zero runtime behavior change, existing test suites pass unmodified.

---

### Wave 2 — Backend: base classes + per-context code assignment

#### Story 2 — `DomainErrorShape` pattern + apply it to booking (the other 5 contexts follow one-by-one) ✅ Done

**Scope:** `apps/backend/src/shared/domain/`, `BookingDomainError`, `NotificationDomainError`.

**Found during Story 2+3 discovery:** this story cannot uniformly touch all 6 base classes at once. `implements DomainErrorShape` requires `code` to be a real, non-undefined value on every instance — but `CustomerErrorCode`/`StaffErrorCode`/`LoyaltyErrorCode`/`PlatformErrorCode` are still empty unions (`never`) until their own stories populate them. Typing a base class against an empty union and still expecting every existing subclass to compile is only possible for the one context whose catalog is populated in the same PR (booking, via Story 3) — for the other 4, it would either fail to compile or force a fake fallback that defeats the typed-governance goal of §9. So `DomainErrorShape` is applied **one context at a time**, each bundled with that context's own code-population story — not as one upfront pass across all 6. Stories 4/5/6/7 each carry this same work for their own base class (see the added line in each below).

**Work required:**
1. Add `interface DomainErrorShape { code: string; field?: string }` in `apps/backend/src/shared/domain/` — a structural contract, not a shared base class (bounded contexts stay independent per CLAUDE.md's no-cross-context-imports rule; this only pins the *shape*, defined in the sanctioned cross-cutting location). Reused by every context's own story, not just this one.
2. `BookingDomainError implements DomainErrorShape`, with its constructor's `code` parameter typed against `BookingErrorCode` (not `string`) — this is what makes the compile-time governance in §9 real, not just documented intent. Real values exist because Story 3 populates `BookingErrorCode` in the same PR.
3. Add `readonly field?: string` to `BookingDomainError`'s constructor signature.
4. Fix `NotificationDomainError`'s missing `this.name` assignment (the one inconsistency vs. the other 5) — a pure bug fix, independent of any catalog state, safe to do now regardless of context sequencing.
5. `CustomerDomainError`, `StaffDomainError`, `LoyaltyDomainError`, `PlatformDomainError` are untouched by this story — each gets its own `DomainErrorShape` treatment in Stories 4/5/6/7 respectively.
6. No mapper changes beyond booking's (Story 3) — the other 4 contexts' mappers are untouched until their own story.

**Acceptance criteria:**
- [ ] `DomainErrorShape` interface exists in `apps/backend/src/shared/domain/`
- [ ] `BookingDomainError` implements `DomainErrorShape`, `code` typed against `BookingErrorCode` — constructing a booking subclass with a code outside that union fails to compile
- [ ] `NotificationDomainError` sets `this.name` correctly
- [ ] `CustomerDomainError`/`StaffDomainError`/`LoyaltyDomainError`/`PlatformDomainError` compile unchanged (untouched by this story)

**DoD:** Structural only for booking + the notification bug fix; no behavior change to the other 4 contexts; unit tests for error classes pass.

---

#### Story 3 — Booking context: codes + `AddressValidationError` field discriminator (TD14's fix, correctly scoped) ✅ Done

**Scope:** `apps/backend/src/contexts/booking/**`, `booking-error.mapper.ts`, `apps/backend/src/shared/value-objects/address.ts`, `apps/backend/src/shared/value-objects/country-code.vo.ts`.

**Work required:**
1. Assign a `code` to each of the 32 named subclasses (table above) — e.g. `BookingNotFoundError` → `BOOKING_NOT_FOUND`, `ClosureDateInPastError` → `BOOKING_CLOSURE_DATE_IN_PAST`.
2. Convert the ~23 raw `throw new BookingDomainError(...)` inline-message sites into either a `code` parameter on the base constructor or a new named subclass where the call site is a real, distinct business rule (judgment call per site — prefer a code parameter for genuinely one-off messages, a named subclass when the same condition is thrown from >1 place).
3. Update `booking-error.mapper.ts` to emit `code`/`field` in every branch (currently flat `detail`-only).
4. Give `AddressValidationError` a real `code: AddressErrorCode` per validation branch in `address.ts` (e.g. `ADDRESS_POSTAL_CODE_INVALID`, `ADDRESS_STATE_INVALID`, `ADDRESS_NEIGHBORHOOD_REQUIRED`, `ADDRESS_FIELD_REQUIRED`), populating `AddressErrorCode` (scaffolded empty in Story 1). Same for `CountryCodeValidationError` — add a new `CountryCodeErrorCode` origin to `error-codes.ts` (not present in Story 1's original 16; added here) and a `COUNTRY_CODE_*` prefix to §3. Found during Story 3 discovery: neither VO was actually in scope anywhere else — Story 8 excludes `Address`/`CountryCode` (they already have typed classes, unlike the 9 VOs Story 8 covers), but nothing else ever assigned them a `code`, even though Story 10 already presupposes "the backend VO (Story 3/4)" did.
5. Add `BookingAddressValidationError` — a booking-owned `Error` subclass implementing the structural `DomainErrorShape` interface directly (not extending `BookingDomainError`: its `code` belongs to the `AddressErrorCode`/`CountryCodeErrorCode` namespace, not `BookingErrorCode`, and forcing a fake booking-origin code would either misrepresent the type or lose the per-rule specificity Story 3 exists to add). Booking's two `Address.create()` call sites (`request-booking.use-case.ts`, `request-authenticated-booking.use-case.ts`) catch `AddressValidationError`/`CountryCodeValidationError` and construct this new type, forwarding the caught error's own `code` and attaching `field: 'pickupAddress' | 'contactAddress'`. Requires one new explicit branch in `booking-error.mapper.ts` (it won't be swept up by the generic `BookingDomainError` catch-all, since it isn't one) — the existing raw `AddressValidationError`/`CountryCodeValidationError` branches stay as a defensive fallback for any address error reaching the mapper unwrapped (now also emitting `code`, just without `field`). This replaces TD14's original catch-and-rethrow-same-type idea with a proper VO-error → domain-error translation at the use-case boundary.
6. Populate `packages/types/src/error-codes.ts`'s `BookingErrorCode`, `AddressErrorCode`, `CountryCodeErrorCode` and both `errors.json` locale files with translated copy for every new code.

**Acceptance criteria:**
- [ ] Every booking domain error (named + previously-raw) emits `code` (+ `field` where applicable) via the mapper
- [ ] `AddressValidationError`/`CountryCodeValidationError` carry a real `code` (not just a message) for every validation branch
- [ ] `BookingAddressValidationError` carries `field: 'pickupAddress' | 'contactAddress'` and forwards the underlying VO error's `code`
- [ ] Both locale files have a translated entry for every new booking, address, and country-code code
- [ ] Existing booking integration tests pass; new unit tests assert `code`/`field` presence per error class

**DoD:** No `AddressValidationError` (or any booking domain error) leaves this context without a `code`.

---

#### Story 4 — Customer context: codes + `AddressValidationError` field discriminator ✅ Done

**Scope:** `apps/backend/src/contexts/customer/**`, `customer-error.mapper.ts`.

**Work required:** first, `CustomerDomainError implements DomainErrorShape` with `code` typed against `CustomerErrorCode` + `readonly field?: string` on its constructor (Story 2's pattern, applied to this context now that its catalog is populated — see Story 2's note). Then same treatment as Story 3, scaled to 1 named subclass + 6 raw throws. `Address.create()`'s customer-profile call site (default address) attaches `field: 'contactAddress'`.

**Acceptance criteria:** mirrors Story 3's, scoped to customer.

---

#### Story 5 — Staff context: codes + fix the missing VO-error branch (real bug) ✅ Done

**Scope:** `apps/backend/src/contexts/staff/**`, `staff-error.mapper.ts`.

**Work required:**
0. `StaffDomainError implements DomainErrorShape` with `code` typed against `StaffErrorCode` + `readonly field?: string` on its constructor (Story 2's pattern, applied to this context now that its catalog is populated).
1. Codes for the 9 named subclasses + 10 raw throws.
2. **Bug fix**: add the missing `AddressValidationError`/`CountryCodeValidationError` branches to `staff-error.mapper.ts` — today these fall to unshaped `Error` passthrough, unlike every other context that has them.
3. **Security review (§10)**: `StaffEmailMismatchError` and `StaffGoogleAccountConflictError` both arise from the Google account-linking flow and reveal information about existing account/email associations. Before assigning their final codes, evaluate whether either should be collapsed into a more generic code to avoid confirming account existence to an unauthenticated or wrong-account caller — decide explicitly, don't default to maximal specificity.

**Acceptance criteria:** mirrors Story 3's, plus: `[ ] staff-error.mapper.ts` now has explicit `AddressValidationError`/`CountryCodeValidationError` branches emitting the same shape as booking/customer/platform. `[ ]` the account-linking error codes' specificity vs. enumeration-risk tradeoff is documented as a deliberate decision, not left as a default.

---

#### Story 6 — Loyalty context: codes + fix the mapper's structural gap (real bug) ✅ Done

**Scope:** `apps/backend/src/contexts/loyalty/**`, `loyalty-error.mapper.ts`.

**Work required:**
0. `LoyaltyDomainError implements DomainErrorShape` with `code` typed against `LoyaltyErrorCode` + `readonly field?: string` on its constructor (Story 2's pattern, applied to this context now that its catalog is populated).
1. Codes for the 4 named subclasses (3 live + `LoyaltyEntryNotFoundError`, confirmed dead — delete it, it's never thrown).
2. **Bug fix**: add a generic `LoyaltyDomainError` catch-all branch + `Error` passthrough default, matching the other 4 mappers' structure — today anything unmatched (including `LoyaltyInvalidPointsError`, which should 4xx) returns an unconditional 500.

**Acceptance criteria:** mirrors Story 3's, plus: `[ ] LoyaltyInvalidPointsError` returns 4xx with a `code`, not 500. `[ ] LoyaltyEntryNotFoundError` removed (or, if a future use case is planned to throw it, wired up instead of deleted — confirm with the user before deleting a class, per CLAUDE.md's no-workarounds/ask-when-unsure rule).

---

#### Story 7 — Platform context: codes (heaviest single-context load) + dead-class decisions ✅ Done

**Scope:** `apps/backend/src/contexts/platform/**`, `platform-error.mapper.ts`.

**Decided during Story 7 discovery:**
- Raw-throw codes: distinct code per validation rule, matching the precedent set by booking/customer/staff/loyalty's populated catalogs (none use a generic `FIELD_INVALID`+`params` code) — supersedes the mechanical-helper option below.
- `TenantSettingsValidationError`: relocate from `domain/value-objects/tenant-settings.vo.ts` to `domain/errors/platform-domain.error.ts`, matching every other named platform error's location.
- `FeaturedBookingNotFoundError`/`PhotoNotOnBookingError`: confirmed dead (never thrown in live source; only a stale `dist/` build artifact references the old flow) — delete both classes, including `FeaturedBookingNotFoundError`'s mapper branch.
- `platform-error.mapper.ts`'s inline `AddressValidationError`/`CountryCodeValidationError` branches (lines 46-63) are replaced with a call to the shared `mapSharedAddressError()` helper, matching booking/customer/staff's mappers — not in the original work-item list, but required to satisfy Story 3's "mirrors" acceptance criteria.

**Work required:**
0. `PlatformDomainError implements DomainErrorShape` with `code` typed against `PlatformErrorCode` + `readonly field?: string` on its constructor (Story 2's pattern, applied to this context now that its catalog is populated).
1. Codes for 7 named subclasses + relocated `TenantSettingsValidationError` + ~29 raw throws (distinct code per site — see decision above).
2. Delete `FeaturedBookingNotFoundError` and `PhotoNotOnBookingError` (dead classes) and remove `FeaturedBookingNotFoundError`'s mapper branch.
3. Replace `platform-error.mapper.ts`'s inline Address/CountryCode branches with `mapSharedAddressError(err)`.

**Acceptance criteria:** mirrors Story 3's, plus:
- [ ] Both dead classes removed, no dangling references
- [ ] `TenantSettingsValidationError` lives in `domain/errors/platform-domain.error.ts`
- [ ] `platform-error.mapper.ts` calls `mapSharedAddressError()` instead of duplicating the Address/CountryCode branches inline

---

#### Story 8 — Shared value objects: typed errors for the 8 plain-`Error` VOs (real correctness gap) ✅ Done

**Scope:** `apps/backend/src/shared/value-objects/{money,phone-number,seo-title,seo-description,slug,hex-color,timezone,time-of-day,email}.vo.ts`, all 5 context mappers. (`Address`/`CountryCode` already have typed error classes with real codes as of Story 3 — not part of this story's scope.)

**Work required:**
1. Give each of the 8 VOs (`Money`, `PhoneNumber`, `SeoTitle`, `SeoDescription`, `Slug`, `HexColor`, `Timezone`, `TimeOfDay`, `Email`) a proper typed error class (not bare `Error`) with a `code`.
2. Wire each into every mapper's `instanceof` chain (currently invisible — these fall straight to Nest's unshaped default 500/passthrough since there's no global `ExceptionFilter`).
3. This is the highest-value story in Wave 2 for user-facing correctness: today, a `PhoneNumber` or `Money` validation failure produces an unshaped, unmessaged error response regardless of context.

**Acceptance criteria:**
- [ ] All 8 VOs throw a typed, code-bearing error
- [ ] Every context mapper that can trigger one of these VOs (grep call sites) has an explicit branch
- [ ] A previously-unshaped VO validation failure now returns a proper `ProblemDetail` with `code`, in every context that can trigger it

**Decided during Story 8 discovery:**
- Loyalty context needs zero changes — none of the 8 VOs are referenced anywhere under `contexts/loyalty/` (confirmed via grep).
- `Timezone.create()` has zero call sites in application code (only `.isValid()` is used, in Zod refines and `business-hours.validator.ts`) — still gets a typed error class per AC #1, but no mapper wiring is reachable for it.
- 4 of 8 VOs (SeoTitle, SeoDescription, Slug, HexColor) are practically unreachable via their own `.create()` throw in `platform-error.mapper.ts`: `hotsite-config.aggregate.ts`/`tenant.aggregate.ts` pre-validate with `.isValid()` and throw their own existing typed `PlatformDomainError` subclasses first. Still wiring the branch for defense-in-depth/consistency with the literal AC — reachable today only via corrupted-DB-data repository hydration, not the validated request path.
- New shared `mapSharedVoError()` helper in `shared/http/` (alongside `mapSharedAddressError()`) rather than duplicating ~9 `instanceof` branches across 4 mappers — avoids repeating Story 4+6's SonarCloud new-code-duplication hit.
- `SeoErrorCode` stays one shared union for both `SeoTitle`/`SeoDescription` (as Story 1 scaffolded it) — `TITLE_TOO_LONG`/`DESCRIPTION_TOO_LONG` as two distinct members, mirroring `AddressErrorCode`'s multi-member pattern.
- Mapper touch list: booking (Money, PhoneNumber, Email, TimeOfDay), customer (PhoneNumber, Email), staff (Email), platform (SeoTitle, SeoDescription, Slug, HexColor — defensive only), loyalty (none).
- **Preparatory fix, bundled here (found during discovery, not in original scope):** `apps/backend/src/shared/http/problem-detail.ts` is a byte-for-byte duplicate of `packages/types/src/errors.dto.ts` (`ProblemDetail`/`ValidationViolation`/`ValidationProblemDetail`), both added in the same Story 1 commit. The backend already imports every `*ErrorCode` union from `@ikaro/types` (17 files) but hand-copied these 3 transport-shape interfaces instead of importing them — the `@ikaro/types` copy is currently unused by anything. Fix: delete `problem-detail.ts`, update its 12 consumers to import from `@ikaro/types` directly, matching the existing `*ErrorCode` import pattern.

---

### Wave 3 — Validation pipes (Zod, code-per-rule)

#### Story 9 — Backend Zod pipe: code-bearing violations ✅ Done

**Scope:** `apps/backend/src/shared/http/zod-validation.pipe.ts`, every backend Zod schema.

**Work required:**
1. Replace free-text Zod issue messages with a stable `code` per validation rule — either via a custom Zod error map keyed by `ZodIssueCode` + path, or by requiring every `.min()`/`.max()`/`.regex()`/`.refine()` call to supply an explicit code-shaped `message` (team decision — document whichever is chosen as the convention for all future schemas).
2. Update `zod-validation.pipe.ts:12-15` to emit `{ field, code, params? }` instead of `{ field, message }`.

**Acceptance criteria:**
- [ ] Every backend Zod validation failure emits a `code` per violation
- [ ] Convention documented in `docs/CODE_STANDARDS.md` or `docs/ENGINEERING_RULES.md` for future schema authors

**Decided during Story 9 discovery:**
- Single source of truth: a Zod check that duplicates a VO's own rule (22 of 26 `.refine()` calls — e.g. `PhoneNumber.isValid`, `HexColor.isValid`) reuses that VO's code from Story 8/Story 3 rather than minting a new one — the same principle Story 10 already applies to the BFF's address triplication.
- The remaining ~121 sites (117 native `.min()/.max()/.regex()` + 4 non-VO `.refine()` calls) have no VO backing them — these share a small closed `GenericErrorCode` set (required / too-short / too-long / format-invalid) rather than one bespoke code per site, mirroring `AddressErrorCode.FIELD_REQUIRED` already being reused across 5 different fields.
- For the 117 native-rule sites, the code is derived automatically from Zod's own issue type in the pipe — no edits to those call sites needed. Only the 26 `.refine()` sites need an explicit code supplied per call.
- **Exhaustiveness requirement:** the issue-type → `GenericErrorCode` derivation must be an exhaustively-typed switch (TypeScript `never` check on the default branch), not a runtime switch with a silent fallback. Zod v3→v4 already restructured issue-code granularity once (e.g. `invalid_string` split into a more granular scheme); a silent fallback would let a future Zod upgrade silently degrade violation specificity to a generic catch-all with no compiler or test signal. A test exercising every Zod issue kind is required alongside it.

---

#### Story 10 — BFF's own Zod schemas: code-bearing violations + interim address-triplication fix ✅ Done

**Scope:** `apps/bff/src/shared/http/zod-validation.pipe.ts`, all 30+ BFF Zod schemas, especially the 3 `AddressSchema` copies and `HotsiteSeoBodySchema`.

**Work required:**
1. Same code-per-rule treatment as Story 9, applied to the BFF's independent pipe.
2. For the 3 duplicated `AddressSchema` copies (`bookings.controller.ts`, `customers.controller.ts`, `tenant-settings.controller.ts`): assign each the **same** `ADDRESS_*` codes as the backend VO (Story 3/4), so the frontend behaves identically regardless of which layer rejects the request. Do not attempt to deduplicate the schemas themselves here — that's TD11's scope.
3. File a scope-update note on TD11 (or ask the user whether to edit TD11 directly) documenting the newly-found 3rd copy and the SEO-length duplicate, since TD11 currently only knows about 2 instances.

**Acceptance criteria:**
- [ ] Every BFF Zod validation failure emits a `code` per violation
- [ ] All 3 `AddressSchema` copies emit codes matching the backend `Address` VO's codes for the same logical failure (e.g. invalid postal code → same `ADDRESS_POSTAL_CODE_INVALID` whether the backend or any BFF copy catches it first)
- [ ] TD11 flagged/updated with the corrected duplication count

**Decided during Story 10 discovery:**
- All 3 `AddressSchema` copies reuse `AddressErrorCode`/`CountryCodeErrorCode` (Story 3/4) per matching field.
- `contactPhone`/`contactEmail`/`phone` regex duplicates in `bookings.controller.ts`/`customers.controller.ts` also reuse Story 8's `PhoneErrorCode.FORMAT_INVALID`/`EmailErrorCode.FORMAT_INVALID` — same single-source-of-truth principle as Story 9, applied one layer further out, not limited to the Address fields the story text calls out explicitly.
- `tenant-settings.controller.ts`'s `businessInfo.phone`/`.email` fields have **no** BFF-side format check at all today — left as-is here rather than adding a new ad-hoc regex copy; recorded as a concrete gap in TD11 instead, to be closed for real once the shared-schema package lands.
- `HotsiteSeoBodySchema.title`/`.description` reuse Story 8's `SeoErrorCode.TITLE_TOO_LONG`/`DESCRIPTION_TOO_LONG`.
- BFF's own native `.min()/.max()` sites with no VO backing (e.g. `LoyaltySchema`/`BookingSchema` numeric ranges) reuse Story 9's `GenericErrorCode` set — not the separate, still-empty `BffErrorCode` union, which stays reserved for genuinely BFF-originated conditions (guest-token/guard failures — Story 11's scope).
- BFF pipe gets the same `ProblemDetail`/`ValidationProblemDetail` typing from `@ikaro/types` that Story 8/9 apply to the backend pipe (currently a raw untyped object literal) — same dedup principle, applied for consistency.
- TD11 updated directly (not just flagged): added the 2 newly-found `AddressSchema` copies, the phone/email duplication count, the `businessInfo.phone`/`.email` validation gap, and corrected file paths to their post-TD-21 domain-slice locations.

---

### Wave 4 — BFF-originated errors + the one real reshape bug

#### Story 11 — BFF-originated errors: canonical shape + `ActiveStaffGuard` fix

**Scope:** all ~15 BFF-originated error sites cataloged above; `uploads.controller.ts`; `customers.controller.ts:119`; `auth-controller-flow.service.ts:131`; `active-staff.guard.ts`; plus 4 gaps found during this story's own `/story-discovery` pass (not in the original inventory above, folded in per user decision):
- The 3 global BFF guards — `jwt-auth.guard.ts` (401), `roles.guard.ts` (403), `tenant.guard.ts` (403) — and `error.interceptor.ts`'s catch-all 500 fallback. All four throw ad-hoc code-less `ProblemDetail` objects and fire on far more traffic than the cataloged feature-specific sites.
- Every `ParseUUIDPipe`/`ParseIntPipe` usage in **both** `apps/backend/src` and `apps/bff/src` (confirmed cross-app per AC below) — 9 backend controllers (`internal-tenant-read`, `schedule-closure`, `schedule-opening`, `service` ×4, `customer`, `internal-staff` ×2, `staff` ×6, `loyalty` ×3, `booking` ×6) and 7 BFF controllers (`services` ×4, `schedule`, `schedule-opening`, `loyalty` ×4, `customers`, `bookings` ×2, `staff` ×6) all emit Nest's default `BadRequestException(string)` shape on failure — the same 3rd shape `uploads.controller.ts` already targets.
- A new backend endpoint, `GET /staff/me/status` (see bug fix 4c below).

**Work required:**
1. Convert every ad-hoc BFF-originated error object (including the 3 global guards + interceptor fallback above) to the canonical envelope with a `code`.
2. Fix `uploads.controller.ts`'s Nest-default `BadRequestException(string)` to use the canonical shape instead.
3. Fix the two plain-`Error`-then-500 bugs (`customers.controller.ts:119`, `auth-controller-flow.service.ts:131`) to throw a proper `HttpException` with the canonical shape and a real `code` instead of losing all detail to Nest's generic 500.
4. **`active-staff.guard.ts` — three distinct fixes found here, not one:**
   - **4a. Error passthrough**: currently discards the backend's real error and substitutes a generic 503 because it can't use the request-scoped `BackendHttpService` (documented DI-scope reason — do not elevate the guard to `Scope.REQUEST` to fix this, see `docs/ANTI_PATTERNS.md`'s `ActiveStaffGuard` row). Align its error handling with `BackendHttpService.call()`'s passthrough behavior as closely as the scope constraint allows — preserve the backend's `code`/`detail` when available instead of always substituting a generic message.
   - **4b. Fail-open-on-404 → fail closed**: change the 404 branch from `return true` to deny. No hard-delete path exists anywhere in `apps/backend/src/contexts/staff/` (confirmed via grep — deactivation only ever sets `isActive=false`), so a 404 on the caller's own `staffId` can only mean a stale/mismatched JWT. There is no benign case where "allow" is the safe default. Confirmed as a deliberate behavior change with the user during Story 11 discovery.
   - **4c. Real bug found during discovery — STAFF-role actors get a 503 on every request**: the guard self-checks status via `GET /staff/:id`, which is guarded by `ManagerRoleGuard` (`staff.controller.ts:93-94`, `MANAGER` only, no self-access exception) — that endpoint is a management lookup (any manager viewing any staff member), not a self-status-check. Every `STAFF`-role (non-manager) actor's self-check therefore always gets a backend `403`, which (pre-fix-4a) becomes an opaque `503` for every authenticated `STAFF`-role request in the app. Neither app's own test suite catches this: BFF component tests mock `HttpService.get()` directly (`setupActiveGuardMock`), bypassing the backend's real guard chain entirely; backend integration tests only call this endpoint with a `MANAGER` actor header. **Fix**: add `GET /staff/me/status` to `staff.controller.ts`, mirroring the existing `GET /staff/me/tenants` pattern (line 85-91, `StaffOrManagerRoleGuard`) — derives the target from `RequestContext.actorId` (never a URL param, so it can't be used to probe another staff member), reuses `GetStaffByIdUseCase` internally (`staffId: tenantContext.actorId!`), maps the result down to `{ isActive: boolean }` at the controller boundary (no new use case class). Update `active-staff.guard.ts` to call this new endpoint instead of `GET /staff/:id`.
5. **Security review (§10)**: guest-token validation errors (`bookings.controller.ts`, current lines ~259-270/499-539 — TD's originally-cited 250-258/488-524 have drifted, re-locate before editing) keep **3 distinct codes** (missing / invalid-expired / booking-ID-mismatch) — decided during Story 11 discovery: booking IDs are uuidv7 and not guessable, so the enumeration risk is low and distinct codes give a clearer guest-facing message per case. The tenant-not-registered checks (`auth-controller-flow.service.ts:152-159,191-198`) still need their own explicit specificity-vs-enumeration-risk write-up during implementation (not pre-decided here) — evaluate the same way as Story 5, document the call made either way.
6. **Framework-fallback code catalog**: no origin in `packages/types/src/error-codes.ts` currently holds TD §3's "framework fallback" codes (`AUTH_UNAUTHORIZED`, `AUTH_FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`). Decided during Story 11 discovery: add a new `AuthErrorCode` origin (mirrors every other origin's one-union-per-prefix pattern, same precedent as Story 3 adding `CountryCodeErrorCode` mid-stream) for the 3 global guards + interceptor fallback. `BffErrorCode` (still `{}` from Story 1) stays reserved for genuinely BFF-feature-originated codes — guest-token, dev-login guard, tenant-registration, batch-lookup-miss, etc.

**Acceptance criteria:**
- [ ] All BFF-originated errors — including the 3 global guards and `error.interceptor.ts`'s fallback — use the canonical envelope with a `code`
- [ ] `uploads.controller.ts` no longer uses Nest's default string-message shape
- [ ] The two plain-`Error`-then-500 sites now surface a real `code`+`detail` instead of a bare 500
- [ ] `ActiveStaffGuard` preserves backend error information where DI scope allows (4a); the 404 branch fails closed, not open (4b); `STAFF`-role actors no longer receive a 503 on every request (4c — `GET /staff/me/status` added, guard updated to call it)
- [ ] Guest-token codes stay 3 distinct codes (decided); tenant-registration codes' specificity vs. enumeration-risk tradeoff is documented as a deliberate decision made during implementation
- [ ] Every `ParseUUIDPipe`/`ParseIntPipe` usage across **both** `apps/backend/src` and `apps/bff/src` (full file list above) emits the canonical shape on failure
- [ ] New `AuthErrorCode` origin added to `error-codes.ts` for framework-fallback codes; `BffErrorCode` populated for BFF-feature-originated codes; both get pt-BR + en entries in `errors.json` in the same commit

**Decided during Story 11 discovery:**
- Scope explicitly includes both apps (backend touched for the new `GET /staff/me/status` endpoint + the Parse*Pipe fix) and the 3 global guards + interceptor, not just the originally-cataloged ~15 BFF sites — user chose "include everything now" over splitting into a follow-up story, to avoid a half-migrated state.
- `active-staff.guard.ts` stays a singleton `@Injectable()` guard (not `Scope.REQUEST`) per `docs/ANTI_PATTERNS.md`'s existing `ActiveStaffGuard` row — the DI-scope constraint that motivated 4a's design is settled precedent, not open for reconsideration in this story.

---

### Wave 5 — Frontend consumption migration

#### Story 12 — Shared resolver + fix response-body-discarding error classes

**Scope:** `apps/web/shared/lib/i18n/resolve-error-message.ts` (new), `apps/web/features/booking/api/public.ts`, and every other frontend error class that discards the response body on error.

**Work required:**
1. Build `resolveErrorMessage(code, params?)` per §5 of the Architecture Decisions.
2. Fix `CreateBookingError`/`SubmitGuestBookingInfoError` (and any other class found to discard the body) to actually parse `res.json()` on error and populate `code`/`field`/`violations` — otherwise Story 3's backend fix can never reach `BookingForm.tsx`.
3. `resolveErrorMessage` validates in development mode only (no production runtime cost) that every ICU placeholder referenced in the resolved translation string has a matching key in the passed `params`, and warns (does not throw) on mismatch in either direction. This is the cheap, practical substitute for full compile-time `code`→`params`-shape binding (considered and rejected as disproportionate to hand-maintain across 90+ codes) — it catches the real failure mode (silent missing-interpolation-variable) during development instead of shipping it.

**Acceptance criteria:**
- [ ] `resolveErrorMessage` exists, tested, backed by `errors.json`
- [ ] Every frontend error class that currently discards the response body now parses it
- [ ] A dev-mode mismatch between a translation string's placeholders and the passed `params` produces a console warning, verified by a unit test

---

#### Story 13 — Booking feature migration (the other half of TD14, plus 3 related fixes)

**Scope:** `apps/web/features/booking/components/**`.

**Work required:**
1. `BookingForm.tsx` — switch from `status`-only branching to `resolveErrorMessage(err.code)`; route to the correct step using `err.field`. This closes TD14.
2. `ServiceEditPage.tsx` — replace the fragile `err.detail.toLowerCase().includes(...)` string-match with `err.code === 'BOOKING_SERVICE_DEACTIVATED'` / `'BOOKING_SERVICE_DUPLICATE_NAME'` etc.
3. `BookingDetailPage.tsx`'s `extractValidationMessage` — reactivate properly using `violation.code` (never `.message`), and remove the empty `catch {}` in `RejectBookingSheet.tsx`/`RequestInfoSheet.tsx` now that there's a safe value to surface.
4. Remaining BLIND booking sites (`ServiceCreatePage.tsx`, `BookingQueuePage.tsx`, `RescheduleBookingPage.tsx`, `SubmitInfoForm.tsx`) migrated to code-based branching where a more specific message is now available.

**Acceptance criteria:**
- [ ] `BookingForm.tsx` shows the correct step for pickup vs. contact address failures
- [ ] `ServiceEditPage.tsx` no longer depends on raw backend English text to select a key
- [ ] `extractValidationMessage` uses `code`, not `message`; both sheet call sites surface it instead of swallowing it

---

#### Story 14 — Fix the 2 confirmed live leaks (can be pulled forward as a standalone quick win)

**Scope:** `apps/web/features/booking/components/dashboard/schedule/ScheduleRemovalDialog.tsx`, `ScheduleDateTimeRangeSheet.tsx`.

**Work required:** replace direct `err.detail` rendering with `resolveErrorMessage(err.code)`. Depends on Story 3 (booking codes) and Story 12 (resolver) being done first — cannot be fixed correctly before those land, but is the single highest-value fix in the whole TD (it's the only *currently live* untranslated-text-in-production bug found), so it should be the first Wave 5 story executed once its dependencies are ready.

**Acceptance criteria:**
- [ ] Neither component renders `err.detail` (or any other raw backend string) under any circumstance
- [ ] A pt-BR user hitting a closure/opening validation error sees translated pt-BR text
- [ ] At least one Playwright E2E test (per §11) drives this exact path end-to-end — trigger the validation error for real, assert the specific translated message renders, not just that some fallback text appears. This is the pattern's own proof-of-concept, not just a component-level fix.

---

#### Story 15 — Customer + Staff feature migration

**Scope:** `apps/web/features/customer/components/**`, `apps/web/features/staff/components/**`.

**Work required:**
1. `InformationCompletionPrompt.tsx` — already the reference pattern; extend it to also branch on `violations[].code` where a field alone isn't specific enough, keep the `.field`-based routing as-is.
2. `StaffDetailPage.tsx`, `InviteForm.tsx`, `DeactivateConfirmPage.tsx` — migrate from `status`-only to `code`-based branching (duplicate-email, last-manager, self-action cases now have real codes from Story 5).

**Acceptance criteria:** mirrors Story 13's for this scope.

---

#### Story 16 — Platform/hotsite + Loyalty feature migration

**Scope:** `apps/web/features/platform/**`, `apps/web/features/loyalty/**`, remaining dashboard/hotsite shell sites.

**Work required:** migrate remaining BLIND sites found in the inventory (`CancelConfirmPage.tsx`, `app/bookings/[id]/submit-info/page.tsx`, hotsite editor/settings error paths where a specific code is now available) to `code`-based messaging. Sites already classified SAFE (bare-catch, generic fallback, no leak) are lower priority — migrate opportunistically, not required for this TD's DoD.

**Acceptance criteria:** no remaining BLIND site in booking/customer/staff/platform/loyalty for which a specific backend `code` exists but isn't used.

---

### Wave 6 — Enforcement & documentation lock

#### Story 17 — Exhaustiveness test + `ANTI_PATTERNS.md` entry + docs sync

**Scope:** repo-wide.

**Work required:**
1. Add a test (Vitest, in `apps/web` or a shared script) asserting every code in `packages/types/src/error-codes.ts` has a translation key in both `packages/i18n/locales/pt-BR/errors.json` and `.../en/errors.json`. Fails CI if a new code ships without its translation.
2. Add a new `docs/ANTI_PATTERNS.md` entry: "A frontend error handler renders `err.detail`/`violation.message`/raw backend text directly" → fix: use `resolveErrorMessage(err.code)`. Include the `ScheduleRemovalDialog`/`ScheduleDateTimeRangeSheet` case (post-fix) as the canonical example, replacing/supplementing the existing `InformationCompletionPrompt`/`BookingForm` entry this TD's discovery started from.
3. Sync `docs/ENGINEERING_RULES.md` (new § Exception handling & i18n pattern), `docs/24-BFF_ARCHITECTURE.md` (BFF error passthrough contract), `docs/14-API_CONTRACTS.md` (canonical `ProblemDetail` shape), and `docs/25-ERROR_CATALOG.md` to the final pattern. The `docs/ENGINEERING_RULES.md` section must include a concrete "adding a new error" checklist: (1) add the code to the relevant literal union in `error-codes.ts` — the compiler rejects step (3) below until this is done, per §9; (2) add a translation entry to both locale files — the Story 17 exhaustiveness test rejects a missing one; (3) construct/throw the error with the typed constructor from Story 2. `docs/25-ERROR_CATALOG.md` needs more than a sync — it currently documents a contradicting, never-implemented pattern (machine-readable identifier encoded in `type` as a URI fragment, e.g. `type: 'https://api.<ikaro-domain>/errors#invalid-services-empty'`, with frontend guidance to branch on `type`). Rewrite it to describe the actual shipped pattern: `type` stays `'about:blank'`, `code` is the only branchable field (§1/§6 above). Found during Story 1 discovery — flagged because it's the doc `docs/14-API_CONTRACTS.md:7` points to as "the complete error reference," so it would otherwise survive this whole TD unaddressed and contradicted.
4. Re-run `bad-smell-audit` across all three apps for a final consistency pass.
5. Mark this TD resolved once all 16 prior stories are done and the audit is clean. Story 18 (observability) is a recommended follow-up and does not block marking this TD resolved.

**Acceptance criteria:**
- [ ] Exhaustiveness test is CI-enforced and currently green
- [ ] `ANTI_PATTERNS.md` entry lands
- [ ] `docs/ENGINEERING_RULES.md`, `docs/24-BFF_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md`, `docs/25-ERROR_CATALOG.md` reflect the final pattern, including the explicit "adding a new error" checklist
- [ ] Final `bad-smell-audit` clean

---

### Wave 6 (continued) — Recommended follow-up

#### Story 18 — Observability: wire `code` into OTel spans/structured logs (recommended, non-blocking)

**Scope:** `apps/backend/src/shared/observability/**`, `apps/bff/src/shared/observability/**` (or wherever OTel instrumentation currently lives in each app), the exception filters/interceptors that construct the final HTTP response in both apps.

**Work required:**
1. Attach `error.code` as a standard span attribute alongside the existing `tenant.id`/`user.id`/`correlation.id` attributes (per CLAUDE.md §2) whenever a `ProblemDetail` with a `code` is about to be returned.
2. Include `error.code` in the structured server-side log line for every non-2xx response, backend and BFF.
3. Do not attach `params` to spans/logs if any value could be tenant-sensitive (e.g. a raw `field` name is fine; avoid logging PII-shaped `params` values without checking first).

**Acceptance criteria:**
- [ ] Every error response with a `code` produces a span/log entry carrying that code
- [ ] No sensitive `params` values are logged

**DoD:** Purely additive observability — no behavior change to any HTTP response.

---

## Acceptance Criteria (overall)

- [ ] Every backend domain error (named or previously-raw) emits a `code`, and `field` where a single request field is at fault
- [ ] `violations[]` is used only for genuine multi-field batch validation; single-cause errors use top-level `code`/`field`
- [ ] The BFF passes every backend `code`/`field`/`violations` through unchanged (already true structurally — confirmed in the original discovery — this TD doesn't need to fix passthrough, only populate what's passed through)
- [ ] All BFF-originated errors use the same canonical envelope with a `BFF_*`/`AUTH_*`/generic code — no more than one error-body shape reaches the client
- [ ] No frontend code renders `err.detail`/`violation.message`/any raw backend string under any circumstance (enforced by the Wave 6 anti-pattern rule)
- [ ] The 2 confirmed live leaks and 1 fragile string-match site are fixed
- [ ] Every code in the shared catalog has a pt-BR and en translation, mechanically verified by CI
- [ ] Every `code` is typed against a literal union per origin — constructing an error with an uncatalogued code is a compile error, not just a documented convention
- [ ] Every enumeration/information-disclosure-sensitive error path (staff account linking, guest-token validation, tenant registration checks) has an explicit, documented specificity decision, not a default maximally-specific code
- [ ] At least one full backend→BFF→UI chain has E2E coverage proving the correct translated message renders, not just that layer-isolated unit tests pass
- [ ] TD14 is marked superseded and points here
- [ ] TD11 is flagged/updated with the corrected address-duplication count (3 BFF copies, not the 2 it currently documents)

## Notes

1. This TD treats the backend inventory as the anchor — every other layer's work (BFF passthrough shape, frontend consumption) is downstream of what code the backend actually emits, which is why Wave 2 (backend) comes before Wave 4 (BFF-originated) and Wave 5 (frontend).
2. Three real, previously-unknown bugs were found during discovery and are bundled into the relevant context's story rather than filed as separate TDs, since fixing them requires touching the exact same mapper file the code-assignment work already touches: staff's missing VO-error branch (Story 5), loyalty's wrong-500 mapper gap (Story 6), and `ActiveStaffGuard`'s error-reshaping (Story 11).
3. The address-validation quadruplication (backend + 3 BFF copies) is real and should eventually be fixed at the root by TD11, not by this TD — Story 10 only makes the interim state consistent, it doesn't deduplicate.
4. Waves 2-4 are backend/BFF-only and additive (no frontend behavior changes) — safe to land independently of Wave 5's readiness. Wave 5 stories should not start until their corresponding Wave 2-4 story has landed (e.g. Story 14 needs Story 3 and Story 12 first).
5. Per CLAUDE.md's story-discovery gate, each story above still needs its own `/story-discovery` pass before implementation begins — this TD provides the scope and file-level detail so that discovery is fast, not a substitute for it.
6. The typed-union governance in §9 is what upgrades this TD from "a migration that fixes what we found" to "a pattern that stays fixed" — without it, nothing stops error #66 from being added next year the same way the ~68 raw, code-less throws in the current inventory were added. This is why Story 2 lands before any context's codes are assigned: the enforcement mechanism has to exist before the first real code is written against it.
7. Items 9-11 in the Architecture Decisions section (code lifecycle, security-sensitive specificity, full-chain proof) were added after an explicit review pass asking whether the pattern, once fully implemented, would actually qualify as solid engineering — not just "every current gap fixed." All three came from that review, not from the original discovery.
8. Story 18 (OTel observability) is scoped as a recommended follow-up, not a blocker, because it extends the pattern's value (queryable error analytics) rather than closing a correctness or i18n gap — the two things this TD's Priority is actually about.
