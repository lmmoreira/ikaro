# TD17 — Decouple Use Cases from RequestContext: pass all caller context via DTO

## Status
- **Type**: Technical Debt / Architecture / Testability
- **Priority**: Medium (no functional bug; concern is layering, testability, and cross-context safety)
- **Contexts affected**: all 6 contexts — `booking`, `customer`, `platform`, `staff`, `loyalty`, `notification` (37 use cases decouple from `RequestContext` + 1 application service; all ~65 use cases across all contexts get `{UseCaseName}Input` / `{UseCaseName}Result` naming applied; 11 controllers, 2 cross-context adapters, 53 unit spec files + 2 integration spec files)
- **Created**: 2026-06-30
- **Resolved**: 2026-07-01 — implemented across 6 waves on `feat/td17-requestcontext-decoupling`; PR #72

---

## Problem

**37 use cases** across four bounded contexts inject `RequestContext` (a NestJS HTTP scope object) directly into their constructor instead of receiving caller context through their input DTO. This creates three concrete problems:

1. **Hard coupling to HTTP lifecycle.** Any use case that reads `this.tenantContext.*` can only be called from an HTTP request — not from event handlers, scheduled jobs, or cross-context adapters — without either a fake HTTP context or silent wrong-tenant reads. `GetBookingByIdUseCase` is already called from `LoyaltyBookingAdapter` (a cross-context call), which works today only by accident (the adapter is always invoked inside an HTTP request). That guarantee is invisible and fragile.

2. **Blurred authorization boundary.** `GetBookingByIdUseCase` and `ListBookingsUseCase` perform actor-level authorization (`actorId` / `actorRole` checks) inside the use case. This means the use case is coupled to the _identity_ of the caller, not just the _data_ it needs. Authorization belongs in the controller/guard layer; the use case should only receive what it needs to do its job.

3. **Noisy tests.** 54 spec files must build a `RequestContextBuilder` and inject a mock `RequestContext` into use cases just to supply `tenantId`, `correlationId`, or a locale string. After this change, those fields come in via plain DTO fields — no builder needed.

The dominant pattern in the `loyalty` context (all use cases take DTO params) is the target for the whole codebase.

---

## Scope: every affected use case

### booking (26 use cases)

| Use case | Fields to add to DTO |
|---|---|
| `approve-booking` | `tenantId`, `staffId`, `correlationId` |
| `cancel-booking-as-admin` | `tenantId`, `staffId`, `correlationId` |
| `cancel-booking-as-customer` | `tenantId`, `customerId`, `correlationId`, `cancellationWindowHours: number` |
| `close-schedule` | `tenantId`, `createdBy` |
| `complete-booking` | `tenantId`, `staffId`, `correlationId`, `currency: string`, `pointsPerCurrencyUnit: number` |
| `create-service` | `tenantId`, `currency: string`, `locale: string` |
| `deactivate-service` | `tenantId` |
| `generate-attachment-signed-url` | `tenantId` |
| `get-availability` | `tenantId`, `businessHours: BusinessHours`, `booking: BookingSettings` |
| `get-availability-summary` | `tenantId`, `businessHours: BusinessHours`, `booking: BookingSettings` |
| `get-booking-by-id` | `tenantId`, `locale: string` — **authorization check moves to controller** (see §Special cases) |
| `get-service-by-id` | `tenantId`, `locale: string` |
| `list-bookings` | `tenantId`, `locale: string` — **actor-filter logic moves to controller** (see §Special cases) |
| `list-closures` | `tenantId` |
| `list-openings` | `tenantId` |
| `open-schedule` | `tenantId`, `createdBy`, `businessHours: BusinessHours` |
| `reject-booking` | `tenantId`, `staffId`, `correlationId` |
| `remove-closure` | `tenantId` |
| `remove-schedule-opening` | `tenantId` |
| `request-authenticated-booking` | `tenantId`, `correlationId`, `customerId`, `countryCode: string` |
| `request-booking` | `tenantId`, `correlationId`, `countryCode: string` |
| `request-more-info` | `tenantId`, `staffId`, `correlationId` |
| `reschedule-booking` | `tenantId`, `staffId`, `correlationId` |
| `submit-booking-info` | `tenantId`, `customerId`, `correlationId` |
| `submit-guest-booking-info` | `tenantId`, `correlationId` |
| `update-service` | `tenantId`, `currency: string`, `locale: string` |

### customer (2 use cases)

| Use case | Fields to add to DTO |
|---|---|
| `search-customers` | `tenantId` |
| `update-customer-profile` | `tenantId`, `customerId`, `countryCode: string` (only when `defaultAddress` is set; move the `countryCode` lookup to the controller) |

### platform (7 use cases)

All hotsite use cases currently have no DTO at all (`execute()` with no argument). Each needs a DTO introducing `tenantId`.

| Use case | Change |
|---|---|
| `feature-booking-photo` | Add `tenantId` to existing DTO |
| `generate-hotsite-image-signed-url` | Add `tenantId` to existing DTO |
| `get-hotsite-content` | Introduce `{ tenantId }` DTO (was `execute()`) |
| `get-hotsite-manifest` | Introduce `{ tenantId }` DTO (was `execute()`) |
| `publish-hotsite` | Introduce `{ tenantId }` DTO (was `execute()`) |
| `unpublish-hotsite` | Introduce `{ tenantId }` DTO (was `execute()`) |
| `update-hotsite-content` | Add `tenantId` to existing DTO |

### staff (2 use cases)

| Use case | Fields to add |
|---|---|
| `invite-staff` | `correlationId` — `tenantId` already in DTO |
| `deactivate-staff` | `correlationId` — `tenantId` and `deactivatedBy` already in positional params; consolidate to a single DTO while here |

### booking application service (1 service — not a use case, same problem)

`BookingSlotConflictService` (`booking/application/services/booking-slot-conflict.service.ts`) also injects `RequestContext` to read `settings.businessHours.timezone`:

```typescript
async assertSlotFree(tenantId, scheduledAt, totalDurationMins, excludeBookingId?) {
  const { timezone } = this.tenantContext.settings.businessHours; // ← reads context
  ...
}
```

Add `timezone: string` as a parameter to `assertSlotFree`. All three callers (`request-booking`, `request-authenticated-booking`, `reschedule-booking`) already receive `timezone` via their own `businessHours` DTO field after their Wave 3 changes — they pass it through.

---

## Special cases

### Authorization logic in `GetBookingByIdUseCase`

Currently the use case checks:
```typescript
const isStaffOrManager = actorRole === 'MANAGER' || actorRole === 'STAFF';
if (!isStaffOrManager && booking.customerId !== actorId) {
  throw new BookingNotFoundError(dto.bookingId);
}
```

This is controller-layer logic (identity-based access control). After the refactor, move it to `BookingController.getOne()`:
```typescript
// controller
@Get(':id')
async getOne(@Param('id') id: string): Promise<GetBookingByIdUseCaseResult> {
  const { tenantId, actorId, actorRole, settings } = this.tenantContext;
  const result = await this.getBooking
    .execute({ bookingId: id, tenantId, locale: settings.localization.language })
    .catch(mapBookingError);
  const isStaffOrManager = actorRole === 'MANAGER' || actorRole === 'STAFF';
  if (!isStaffOrManager && result.customerId !== actorId) {
    throw new NotFoundException(); // or BookingNotFoundError via mapper
  }
  return result;
}
```

The use case becomes a pure "find by id + tenant" reader, safe to call from `LoyaltyBookingAdapter`.

### Actor-filter logic in `ListBookingsUseCase`

Currently the use case applies `customerId = isStaffOrManager ? undefined : actorId` to scope results. This is the same category of concern. Move it to the controller:
```typescript
// controller
@Get()
list(@Query(...) query: ListBookingsDto): Promise<ListBookingsUseCaseResult> {
  const { tenantId, actorId, actorRole, settings } = this.tenantContext;
  const isStaffOrManager = actorRole === 'MANAGER' || actorRole === 'STAFF';
  return this.listBookings.execute({
    ...query,
    tenantId,
    locale: settings.localization.language,
    customerId: isStaffOrManager ? query.customerId : actorId ?? undefined,
  }).catch(mapBookingError);
}
```

### Cross-context adapters calling `GetBookingByIdUseCase`

Two adapters currently call `GetBookingByIdUseCase.execute({ bookingId })` while ignoring the `tenantId` they receive (underscore-prefixed parameter), relying on the use case to pull tenant from `RequestContext`:

**`loyalty/infrastructure/cross-context/loyalty-booking.adapter.ts` — `findBookingServices`**
**`platform/infrastructure/cross-context/platform-booking.adapter.ts` — `findById`**

After `GetBookingByIdUseCase` is decoupled from auth and context (Wave 3), both adapters apply the same fix:

```typescript
// loyalty-booking.adapter.ts
async findBookingServices(tenantId: string, bookingId: string): Promise<ServiceSummary[]> {
  try {
    const booking = await this.getBookingById.execute({
      bookingId,
      tenantId,          // was ignored with _tenantId prefix
      locale: 'pt-BR',  // adapter reads serviceNameAtBooking only — no price formatting
    });
    return booking.lines.map((line) => ({
      serviceId: line.serviceId,
      serviceName: line.serviceNameAtBooking,
    }));
  } catch {
    return [];
  }
}

// platform-booking.adapter.ts
async findById(bookingId: string, tenantId: string): Promise<BookingLookupSummary | null> {
  try {
    const booking = await this.getBookingById.execute({
      bookingId,
      tenantId,          // was ignored with _tenantId prefix
      locale: 'pt-BR',  // adapter reads photo URLs and IDs only — no price formatting
    });
    return {
      id: booking.id,
      customerId: booking.customerId,
      beforeServicePhotoUrls: booking.beforeServicePhotoUrls,
      afterServicePhotoUrls: booking.afterServicePhotoUrls,
    };
  } catch {
    return null;
  }
}
```

The remaining 9 cross-context adapters call use cases that already receive `tenantId` as an explicit parameter or DTO field — no changes needed there:

| Adapter | Calls | Status |
|---|---|---|
| `booking/booking-customer.adapter.ts` | `GetCustomerByIdUseCase.execute(customerId, tenantId)` | ✅ Already explicit |
| `booking/booking-platform.adapter.ts` | `GetTenantsUseCase.execute({ status })` | ✅ No tenant filter needed |
| `booking/typeorm-booking-availability.adapter.ts` | TypeORM queries directly | ✅ No use case calls |
| `notification/notification-booking.adapter.ts` | `GetServicesUseCase.execute({ tenantId, ids })` | ✅ Already explicit |
| `notification/notification-customer.adapter.ts` | `GetCustomerByIdUseCase.execute(customerId, tenantId)` | ✅ Already explicit |
| `notification/notification-platform.adapter.ts` | `GetTenantByIdUseCase.execute(tenantId)` | ✅ Already explicit |
| `notification/notification-staff.adapter.ts` | `GetStaffByIdUseCase.execute(id, tenantId)` | ✅ Already explicit |
| `loyalty/loyalty-platform.adapter.ts` | `GetTenantByIdUseCase.execute(tenantId)` | ✅ Already explicit |
| `platform/platform-tenant-settings.adapter.ts` | `GetTenantByIdUseCase.execute(tenantId)` | ✅ Already explicit |

---

## Naming convention: `{UseCaseName}Input` and `{UseCaseName}Result`

This TD is also the opportunity to standardise use case I/O type names across the entire codebase. Apply the rename to every use case touched per wave, and to the notification + remaining contexts in Wave 6.

### Rule

| Item | Convention | Location |
|---|---|---|
| Use case input type | `{UseCaseName}Input` | defined inside the `.use-case.ts` file |
| Use case output type | `{UseCaseName}Result` | defined inside the `.use-case.ts` file |
| HTTP request body/query schema | `{Action}Schema` + `{Action}Dto` | stays in `dtos/` — **HTTP-layer only** |

Both `Input` and `Result` live in the use case file. The HTTP Zod schemas stay in `dtos/` and are **not** reused as use case input types. The controller validates the HTTP input with the Zod schema, constructs the `{UseCaseName}Input` (adding context-derived fields), then calls `execute(dto: {UseCaseName}Input)`.

Use cases with genuinely no input (e.g. `ExpirePointsUseCase`, `ListPublishedHotsitesUseCase`) may keep `execute()` with no arguments. Do **not** create a dummy `{}` type. For use cases that currently take an optional scalar (`warningDays?`), wrap in `{ warningDays?: number }` as `NotifyExpiringPointsUseCaseInput`.

Nested helper types within a Result (e.g. `BookingLineResult`, `ServiceItemResult`, `DaySummary`) are **not** subject to this convention — they are data shapes, not use case output contracts.

### Input type renames — complete list by context

Renames happen in the use case file. Update all callers (controllers, event handlers, adapters, spec files) in the same commit.

#### booking
| Current | New | Notes |
|---|---|---|
| inline `{ bookingId }` | `GetBookingByIdUseCaseInput` | define in use case file |
| `ApproveBookingDto` (from `dtos/`) | `ApproveBookingUseCaseInput` | define in use case file; keep HTTP dto in `dtos/` |
| `CancelBookingAsAdminDto` (from `dtos/`) | `CancelBookingAsAdminUseCaseInput` | same |
| `CancelBookingAsCustomerDto` (from `dtos/`) | `CancelBookingAsCustomerUseCaseInput` | same |
| `CloseScheduleDto` (from `dtos/`) | `CloseScheduleUseCaseInput` | same |
| `CompleteBookingDto` (from `dtos/`) | `CompleteBookingUseCaseInput` | same |
| `CreateServiceDto` (from `dtos/`) | `CreateServiceUseCaseInput` | same |
| positional `id: string` | `DeactivateServiceUseCaseInput` | define `{ serviceId: string; tenantId: string }` |
| `GenerateAttachmentSignedUrlDto` (from `dtos/`) | `GenerateAttachmentSignedUrlUseCaseInput` | same |
| `GetAvailabilityDto` (from `dtos/`) | `GetAvailabilityUseCaseInput` | same |
| `GetAvailabilitySummaryDto` (from `dtos/`) | `GetAvailabilitySummaryUseCaseInput` | same |
| positional `id: string` | `GetServiceByIdUseCaseInput` | define `{ serviceId: string; tenantId: string; locale: string }` |
| `GetServicesDto` (already in use case file) | `GetServicesUseCaseInput` | rename in place |
| `ListBookingsDto` (from `dtos/`) | `ListBookingsUseCaseInput` | define in use case file; keep HTTP query schema in `dtos/`; note `customerId` does NOT come from the HTTP query — see §Special cases |
| `ListClosuresDto` (from `dtos/`) | `ListClosuresUseCaseInput` | same pattern |
| `ListOpeningsDto` (from `dtos/`) | `ListOpeningsUseCaseInput` | same pattern |
| `OpenScheduleDto` (from `dtos/`) | `OpenScheduleUseCaseInput` | same pattern |
| `RejectBookingDto` (from `dtos/`) | `RejectBookingUseCaseInput` | same pattern |
| positional `id: string` | `RemoveClosureUseCaseInput` | define `{ closureId: string; tenantId: string }` |
| positional `id: string` | `RemoveScheduleOpeningUseCaseInput` | define `{ openingId: string; tenantId: string }` |
| `RequestAuthenticatedBookingDto` (from `dtos/`) | `RequestAuthenticatedBookingUseCaseInput` | define in use case file |
| `RequestBookingDto` (from `dtos/`) | `RequestBookingUseCaseInput` | same |
| `RequestMoreInfoDto` (from `dtos/`) | `RequestMoreInfoUseCaseInput` | same |
| `RescheduleBookingDto` (from `dtos/`) | `RescheduleBookingUseCaseInput` | same |
| `SubmitBookingInfoDto` (from `dtos/`) | `SubmitBookingInfoUseCaseInput` | same |
| `SubmitGuestBookingInfoDto` (from `dtos/`) | `SubmitGuestBookingInfoUseCaseInput` | same |
| positional `id, dto: UpdateServiceDto` | `UpdateServiceUseCaseInput` | merge into single DTO |

#### customer
| Current | New | Notes |
|---|---|---|
| `FindOrCreateCustomerDto` (from `dtos/`) | `FindOrCreateCustomerUseCaseInput` | define in use case file |
| positional `(customerId, tenantId)` | `GetCustomerByIdUseCaseInput` | define `{ customerId; tenantId }` in use case file |
| positional (multi-line, check file) | `GetCustomerTenantsByIdUseCaseInput` | define in use case file |
| `SearchCustomersDto` (already in use case file) | `SearchCustomersUseCaseInput` | rename in place |
| `UpdateCustomerProfileDto` (Zod-inferred) | `UpdateCustomerProfileUseCaseInput` | **do not rename the HTTP Zod type** — define a separate `UpdateCustomerProfileUseCaseInput` interface in the use case file that includes `tenantId`, `customerId`, `countryCode` alongside the body fields |

#### platform
| Current | New | Notes |
|---|---|---|
| `FeatureBookingPhotoDto` (from `dtos/`) | `FeatureBookingPhotoUseCaseInput` | define in use case file |
| inline multi-line params | `GenerateHotsiteImageSignedUrlUseCaseInput` | define in use case file |
| `execute()` (no args) | `GetHotsiteContentUseCaseInput` | define `{ tenantId: string }` |
| `execute()` (no args) | `GetHotsiteManifestUseCaseInput` | define `{ tenantId: string }` |
| positional `(tenantId)` | `GetTenantByIdUseCaseInput` | define `{ tenantId: string }` |
| positional `(slug)` | `GetTenantBySlugUseCaseInput` | define `{ slug: string }` |
| `GetTenantsDto` (already in use case file) | `GetTenantsUseCaseInput` | rename in place |
| `execute()` (no args) | keep `execute()` | `ListPublishedHotsitesUseCase` — genuinely cross-tenant; no input needed |
| `ProvisionTenantDto` (from `dtos/`) | `ProvisionTenantUseCaseInput` | define in use case file |
| `execute()` (no args) | `PublishHotsiteUseCaseInput` | define `{ tenantId: string }` |
| positional `(tenantId, dto: RenameTenantDto)` | `RenameTenantUseCaseInput` | merge into single DTO |
| `execute()` (no args) | `UnpublishHotsiteUseCaseInput` | define `{ tenantId: string }` |
| `UpdateHotsiteContentDto` (from `dtos/`) | `UpdateHotsiteContentUseCaseInput` | define in use case file |
| inline multi-line params | `UpdateTenantSettingsUseCaseInput` | define in use case file |

#### staff
| Current | New | Notes |
|---|---|---|
| `CreateInitialManagerDto` (already in use case file) | `CreateInitialManagerUseCaseInput` | rename in place |
| positional `(id, tenantId, deactivatedBy)` | `DeactivateStaffUseCaseInput` | already described in §Critical implementation notes |
| positional `(email, tenantId)` | `GetStaffByEmailUseCaseInput` | define `{ email; tenantId }` |
| positional `(id, tenantId)` | `GetStaffByIdUseCaseInput` | define `{ staffId; tenantId }` |
| positional `(googleOAuthId)` | `GetStaffByOAuthIdUseCaseInput` | define `{ googleOAuthId: string }` |
| `GetStaffDto` (already in use case file) | `GetStaffUseCaseInput` | rename in place |
| positional `(staffId, tenantId)` | `GetStaffTenantsByIdUseCaseInput` | define `{ staffId; tenantId }` |
| `InviteStaffDto` (from `dtos/`) | `InviteStaffUseCaseInput` | define in use case file |
| inline multi-line params | `LinkGoogleAccountUseCaseInput` | define in use case file |

#### loyalty
| Current | New | Notes |
|---|---|---|
| `CompleteBookingLoyaltyEffectsDto` (in use case file) | `CompleteBookingLoyaltyEffectsUseCaseInput` | rename in place |
| `execute()` (no args) | keep `execute()` | `ExpirePointsUseCase` — global scheduled job; no tenant input |
| `GetLoyaltyBalanceDto` (in use case file) | `GetLoyaltyBalanceUseCaseInput` | rename in place |
| `GetLoyaltyEntriesDto` (in use case file) | `GetLoyaltyEntriesUseCaseInput` | rename in place |
| `GetLoyaltyRedemptionsDto` (in use case file) | `GetLoyaltyRedemptionsUseCaseInput` | rename in place |
| `warningDays = DEFAULT_EXPIRY_WARNING_DAYS` | `NotifyExpiringPointsUseCaseInput` | define `{ warningDays?: number }` default in use case body |
| `RedeemPointsDto` (in use case file) | `RedeemPointsUseCaseInput` | rename in place |

#### notification (Wave 6 — rename only, no RequestContext change)
| Current | New | Notes |
|---|---|---|
| inline multi-line params | `SendAdminDailyScheduleReminderNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendBookingApprovedNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendBookingCancelledNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendBookingInfoRequestedNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendBookingInfoSubmittedNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendBookingRejectedNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendBookingRequestedNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendBookingRescheduledNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendPointsExpiringSoonNotificationUseCaseInput` | define in use case file |
| inline multi-line params | `SendServicePointsEarnedNotificationUseCaseInput` | define in use case file |
| `SendStaffInvitationDto` (from `dtos/`) | `SendStaffInvitationUseCaseInput` | define in use case file |
| `SeedDefaultTemplatesDto` (from `dtos/`) | `SeedDefaultTemplatesUseCaseInput` | define in use case file |

### Output type renames — missing `UseCase` in name

Seven existing output types omit `UseCase` from the name. Rename in the use case file and all callers.

| Context | Current name | New name |
|---|---|---|
| booking | `GenerateAttachmentSignedUrlResult` | `GenerateAttachmentSignedUrlUseCaseResult` |
| loyalty | `CompleteBookingLoyaltyEffectsResult` | `CompleteBookingLoyaltyEffectsUseCaseResult` |
| loyalty | `ExpirePointsResult` | `ExpirePointsUseCaseResult` |
| loyalty | `GetLoyaltyBalanceResult` | `GetLoyaltyBalanceUseCaseResult` |
| loyalty | `GetLoyaltyEntriesResult` | `GetLoyaltyEntriesUseCaseResult` |
| loyalty | `GetLoyaltyRedemptionsResult` | `GetLoyaltyRedemptionsUseCaseResult` |
| loyalty | `NotifyExpiringPointsResult` | `NotifyExpiringPointsUseCaseResult` |

---

## Critical implementation notes

### HTTP schema ≠ use case DTO (do not conflate)

Several use cases currently derive their input DTO directly from a Zod HTTP schema (`z.infer<typeof XxxSchema>`). After this refactor the use case needs additional fields (`tenantId`, `actorId`, `correlationId`, `countryCode`, …) that come from the controller's context extraction — **not from the HTTP request body or query string**. These fields must never be added to the Zod schema.

The pattern: define a separate `XxxUseCaseDto` (plain TypeScript interface) that extends the HTTP fields with the context fields. The controller validates the HTTP input with the Zod schema, then constructs the use case DTO:

```typescript
// controller — correct pattern
async updateMe(
  @Body(new ZodValidationPipe(UpdateCustomerProfileSchema)) body: UpdateCustomerProfileDto,
): Promise<UpdateCustomerProfileUseCaseResult> {
  const { tenantId, actorId, settings } = this.ctx;
  return this.updateProfile
    .execute({
      ...body,                                        // HTTP body fields (name, phone, defaultAddress)
      tenantId,                                       // from context
      customerId: actorId!,                           // from context
      countryCode: settings.localization.countryCode, // from context
    })
    .catch(mapCustomerError);
}
```

**Affected use cases where this distinction matters most:**
- `update-customer-profile` — HTTP DTO has `name`, `phone`, `defaultAddress`; use case DTO adds `tenantId`, `customerId`, `countryCode`
- `list-bookings` — HTTP DTO (query) has `status`, `from`, `to`, `limit`, `offset`; use case DTO adds `tenantId`, `locale: string`, and computed `customerId?: string` (never a raw query param — computed from actor role in controller)
- all booking write use cases — HTTP body contains booking-specific fields; use case DTO adds `tenantId`, actor id, `correlationId`

### `deactivate-staff` — new DTO shape

Current signature: `execute(id: string, tenantId: string, deactivatedBy: string)`.
New shape (consolidate positional params + add `correlationId`):

```typescript
export interface DeactivateStaffUseCaseDto {
  staffId: string;
  tenantId: string;
  deactivatedBy: string;
  correlationId: string;
}
// execute(dto: DeactivateStaffUseCaseDto)
```

Controller call becomes:
```typescript
return this.deactivateStaff.execute({
  staffId: id,
  tenantId: this.tenantContext.tenantId,
  deactivatedBy: actorId,
  correlationId: this.tenantContext.correlationId,
}).catch(mapStaffError);
```

### `update-hotsite-content` — reads `tenantId` from context twice

The use case reads `this.tenantContext.tenantId` at line 44 (`const tenantId = ...`) and again at line 74 (`const tenantPrefix = \`tenants/${this.tenantContext.tenantId}/\``). Both must be replaced with `dto.tenantId`. Do not miss the second occurrence.

### `countryCode` in `update-customer-profile` — always pass it

The use case only uses `countryCode` when `dto.defaultAddress` is not `undefined`/`null`, but the controller should always pass it from `settings.localization.countryCode`. There is no benefit to conditionally passing it; always including it is simpler and avoids conditional logic at the controller boundary.

### `RequestModule` — already imported in all affected modules

All five module files already import `RequestModule`:
- `booking.module.ts` ✅
- `customer.module.ts` ✅
- `platform.module.ts` ✅
- `staff.module.ts` ✅
- `loyalty.module.ts` ✅

No module-level changes are needed. Do not add duplicate `RequestModule` imports.

---

## Controllers that need to inject RequestContext

Controllers that currently delegate context-reading to their use cases must now read from context themselves and forward values in the DTO call.

| Controller | Currently injects `RequestContext`? | After |
|---|---|---|
| `booking.controller.ts` | No | Must inject and pass `tenantId`, `staffId`/`customerId`, `correlationId`, `settings.*` |
| `schedule-availability.controller.ts` | No | Must inject and pass `tenantId`, `businessHours`, `bookingSettings` |
| `schedule-availability-summary.controller.ts` | No | Must inject and pass `tenantId`, `businessHours`, `bookingSettings` |
| `schedule-closure.controller.ts` | No | Must inject and pass `tenantId`, `actorId` (createdBy) |
| `schedule-opening.controller.ts` | No | Must inject and pass `tenantId`, `actorId` (createdBy), `businessHours` |
| `booking-attachments.controller.ts` | No | Must inject and pass `tenantId` |
| `service.controller.ts` | Yes | Already injects; update `getServiceById` call to forward `tenantId`, `locale` |
| `hotsite-admin.controller.ts` | No | Must inject and pass `tenantId` to all 6 use case calls |
| `hotsite.controller.ts` | No | Must inject and pass `tenantId` |
| `customer.controller.ts` | Yes | Already injects; update `updateProfile` call to forward `customerId`, `tenantId`, `countryCode` |
| `staff.controller.ts` | Yes | Already injects; forward `correlationId` to `inviteStaff` and `deactivateStaff` |

---

## Test migration

### Use case unit specs — drop `RequestContextBuilder`

The 27 use case unit spec files listed below currently inject a mock `RequestContext` into the use case constructor. After the refactor they pass context fields as plain DTO fields. `RequestContext` is no longer a constructor dependency, so it disappears from these test setups entirely.

**Booking (26 specs + 1 service spec):**
- `approve-booking.use-case.spec.ts`
- `cancel-booking-as-admin.use-case.spec.ts`
- `cancel-booking-as-customer.use-case.spec.ts`
- `close-schedule.use-case.spec.ts`
- `complete-booking.use-case.spec.ts`
- `create-service.use-case.spec.ts`
- `deactivate-service.use-case.spec.ts`
- `generate-attachment-signed-url.use-case.spec.ts`
- `get-availability-summary.use-case.spec.ts`
- `get-availability.use-case.spec.ts`
- `get-booking-by-id.use-case.spec.ts`
- `get-service-by-id.use-case.spec.ts`
- `list-bookings.use-case.spec.ts`
- `list-closures.use-case.spec.ts`
- `list-openings.use-case.spec.ts`
- `open-schedule.use-case.spec.ts`
- `reject-booking.use-case.spec.ts`
- `remove-closure.use-case.spec.ts`
- `remove-schedule-opening.use-case.spec.ts`
- `request-authenticated-booking.use-case.spec.ts`
- `request-booking.use-case.spec.ts`
- `request-more-info.use-case.spec.ts`
- `reschedule-booking.use-case.spec.ts`
- `submit-booking-info.use-case.spec.ts`
- `submit-guest-booking-info.use-case.spec.ts`
- `update-service.use-case.spec.ts`
- `booking-slot-conflict.service.spec.ts` — remove context mock; pass `timezone` directly to `assertSlotFree`

**Customer (2 specs):**
- `search-customers.use-case.spec.ts`
- `update-customer-profile.use-case.spec.ts`

**Platform (7 specs):**
- `feature-booking-photo.use-case.spec.ts`
- `generate-hotsite-image-signed-url.use-case.spec.ts`
- `get-hotsite-content.use-case.spec.ts`
- `get-hotsite-manifest.use-case.spec.ts`
- `publish-hotsite.use-case.spec.ts`
- `unpublish-hotsite.use-case.spec.ts`
- `update-hotsite-content.use-case.spec.ts`

**Staff (2 specs):**
- `invite-staff.use-case.spec.ts`
- `deactivate-staff.use-case.spec.ts`

**Before (every affected use case spec):**
```typescript
const ctx = new RequestContextBuilder()
  .withTenantId('tenant-1')
  .withActorId('staff-1')
  .withCorrelationId('corr-1')
  .build();
const useCase = new ApproveBookingUseCase(bookingRepo, ctx, txManager, eventBus);
```

**After:**
```typescript
const useCase = new ApproveBookingUseCase(bookingRepo, txManager, eventBus);
await useCase.execute({
  bookingId: 'booking-1',
  tenantId: 'tenant-1',
  staffId: 'staff-1',
  correlationId: 'corr-1',
});
```

### Controller unit specs — mock moves from use case to controller

Controller specs currently provide `RequestContext` mocks so the **use cases** (which are themselves mocked as simple stubs) can read from them. After the refactor, controller specs provide `RequestContext` to the **controller** instead. The mock itself stays (`RequestContextBuilder` is still valid here); only the provider target changes.

Affected controller unit specs (15 files):
- **booking:** `booking.controller.spec.ts`, `booking-attachments.controller.spec.ts`, `schedule-availability.controller.spec.ts`, `schedule-availability-summary.controller.spec.ts`, `schedule-closure.controller.spec.ts`, `schedule-opening.controller.spec.ts`, `service.controller.spec.ts`
- **customer:** `customer.controller.spec.ts`
- **loyalty:** `loyalty.controller.spec.ts` *(already correct pattern — minimal change expected)*
- **platform:** `hotsite-admin.controller.spec.ts`, `hotsite.controller.spec.ts`, `tenant.controller.spec.ts`, `tenant-settings.controller.spec.ts`
- **staff:** `staff.controller.spec.ts`

### Integration specs — unchanged in structure

- `staff.controller.integration.spec.ts` — references RequestContext only in test description strings; no mock change needed.
- `loyalty/infrastructure/events/booking-completed.handler.integration.spec.ts` — uses the real HTTP stack; RequestContext is populated by the middleware; no mock change needed.

---

## Execution plan (suggested waves)

Execute in separate PRs to keep diffs reviewable. Each wave is self-contained and CI-safe.

### Wave 1 — Staff + Customer (smallest, clearest pattern)
Files: 4 use cases, 2 controllers, ~6 spec files.
- `invite-staff`: add `correlationId` to DTO
- `deactivate-staff`: add `correlationId` to DTO; consolidate positional params into DTO
- `search-customers`: add `tenantId` to DTO
- `update-customer-profile`: add `tenantId`, `customerId`, `countryCode` to DTO
- Update `staff.controller.ts` and `customer.controller.ts` to forward from context
- Update affected specs

### Wave 2 — Platform hotsite (7 use cases, all just need `tenantId`)
Files: 7 use cases, 2 controllers, ~7 spec files.
- Introduce `{ tenantId: string }` DTO where `execute()` had no args
- Add `tenantId` to existing DTOs for `feature-booking-photo` and `update-hotsite-content`
- Update `hotsite-admin.controller.ts` and `hotsite.controller.ts` to inject context and forward
- Update affected specs

### Wave 3 — Booking (26 use cases + 1 service, largest)
Files: 26 use cases, 1 application service, 7 controllers, ~33 spec files.
- Move auth check out of `GetBookingByIdUseCase` to controller
- Move actor-filter out of `ListBookingsUseCase` to controller
- Add `timezone: string` param to `BookingSlotConflictService.assertSlotFree`
- Add all DTO fields listed in §Scope above to each use case
- Update all 7 booking controllers to inject `RequestContext` and forward extracted fields
- Update affected specs

### Wave 4 — Cross-context adapters (unblocked by Wave 3)
Files: 2 adapters, 2 adapter specs.
- `loyalty/cross-context/loyalty-booking.adapter.ts`: remove `_tenantId` prefix, pass `tenantId` and `locale: 'pt-BR'` to `GetBookingByIdUseCase`
- `platform/cross-context/platform-booking.adapter.ts`: same fix — remove `_tenantId` prefix, pass `tenantId` and `locale: 'pt-BR'`
- Update both `*.adapter.spec.ts` files accordingly

### Wave 6 — Notification context + remaining positional-param renames (naming only)

These use cases do **not** inject `RequestContext` — the only change is standardising the input/output type names. No controller or context-extraction logic changes.

Files: 12 notification use cases + 8 remaining positional-param use cases from other contexts that weren't touched in Waves 1–3.

- Notification: define `{UseCaseName}Input` for each of the 12 notification use cases; update all callers (event handlers, scheduled tasks) to use the named type.
- Rename `SendStaffInvitationDto` → `SendStaffInvitationUseCaseInput` and `SeedDefaultTemplatesDto` → `SeedDefaultTemplatesUseCaseInput` (these are in `dtos/` files; move the type into the use case file).
- Remaining platform positional params: `GetTenantBySlugUseCase`, `GetTenantByIdUseCase`, `RenameTenantUseCase`, `ListPublishedHotsitesUseCase` (no-arg — stays no-arg), `UpdateTenantSettingsUseCase`.
- Remaining staff positional params: `GetStaffByIdUseCase`, `GetStaffByEmailUseCase`, `GetStaffTenantsByIdUseCase`, `GetStaffByOAuthIdUseCase`.
- Remaining customer positional params: `GetCustomerByIdUseCase`, `GetCustomerTenantsByIdUseCase`, `FindOrCreateCustomerUseCase`.
- Rename all 7 output types missing `UseCase` (see §Output type renames table above).

### Wave 5 — Update all IA documentation to prevent recurrence

This is the most important wave for long-term prevention. The anti-pattern was introduced because the agent documentation **explicitly taught** injecting `RequestContext` into use cases. Every agent that reads these docs before writing a use case must see the correct rule.

**`docs/AGENT_PATTERNS.md`** — highest priority; contains the explicit permission and code examples that caused this. Also add the `{UseCaseName}Input` / `{UseCaseName}Result` naming rule here so all future use cases are named correctly from creation:

1. In the `## RequestContext` section (around line 100), change:
   > **Use cases** — single invocation context (HTTP) — may inject `RequestContext` directly and read `.settings`, `.tenantId`, etc.

   To:
   > **Controllers** — the only layer that may inject `RequestContext`. Extract `tenantId`, `actorId`, `correlationId`, and any `settings.*` fields needed, then forward them as explicit DTO fields to the use case. **Use cases must never inject `RequestContext`.**

2. In the **§5 Use Case — Read** code template (around line 132), replace the constructor that injects `private readonly tenantContext: RequestContext` with a DTO pattern:
   ```typescript
   // BEFORE (anti-pattern — do not use):
   export class GetXxxUseCase {
     constructor(
       @Inject(XXX_REPOSITORY) private readonly repo: IXxxRepository,
       private readonly tenantContext: RequestContext,
     ) {}
     async execute(): Promise<GetXxxUseCaseResult> {
       const { tenantId, actorId } = this.tenantContext;
       ...
     }
   }

   // AFTER (correct pattern):
   export interface GetXxxDto {
     tenantId: string;
     actorId: string;
   }
   export class GetXxxUseCase {
     constructor(@Inject(XXX_REPOSITORY) private readonly repo: IXxxRepository) {}
     async execute(dto: GetXxxDto): Promise<GetXxxUseCaseResult> {
       const entity = await this.repo.findById(dto.actorId, dto.tenantId);
       ...
     }
   }
   ```

3. In the **§6 Use Case — Write** code template (around line 171), apply the same DTO replacement — remove `private readonly tenantContext: RequestContext` from constructor, replace `this.tenantContext.tenantId`/`actorId`/`correlationId` with `dto.tenantId`/`dto.actorId`/`dto.correlationId`.

4. Add a **controller template** (new §) that shows how the controller injects `RequestContext` and populates the use case DTO:
   ```typescript
   // Controller extracts context — use case knows nothing about HTTP
   @Patch(':id')
   async update(
     @Param('id', ParseUUIDPipe) id: string,
     @Body(new ZodValidationPipe(UpdateXxxSchema)) body: UpdateXxxDto,
   ): Promise<UpdateXxxUseCaseResult> {
     const { tenantId, actorId, correlationId, settings } = this.tenantContext;
     return this.updateXxx
       .execute({ ...body, id, tenantId, actorId, correlationId })
       .catch(mapXxxError);
   }
   ```

**`docs/ENGINEERING_RULES.md`** — add an explicit rule in the Architecture section:

   > **Use cases and application services must not inject `RequestContext`.** All caller context (`tenantId`, `actorId`, `correlationId`, settings fields) is passed by the controller via the input DTO. This keeps use cases callable from event handlers, scheduled jobs, and cross-context adapters without an HTTP request in scope. The controller is the sole layer that reads from `RequestContext` and translates it into use case inputs.

**`docs/CODE_STANDARDS.md`** — line 79 currently says "`correlationId` must come from `RequestContext.correlationId`" without specifying WHERE. Clarify:

   > **`correlationId`** is read by the **controller** from `RequestContext.correlationId` and forwarded in the use case DTO. The use case receives it as `dto.correlationId` — never reads `RequestContext` directly and never generates a fresh `uuidv7()`.

**`.copilot/context.md`** (written via `.copilot/context.md`, symlinked as `CLAUDE.md`) — §7 Critical code invariants, line about `correlationId`:

   Change:
   > `correlationId` from `RequestContext.correlationId` (not `uuidv7()`).

   To:
   > `correlationId` — controllers read from `RequestContext.correlationId` and pass via DTO. Use cases receive it as `dto.correlationId` — never inject `RequestContext`, never call `uuidv7()`.

   Also add a new invariant line:
   > **Use cases never inject `RequestContext`.** Extract `tenantId`, `actorId`, `correlationId`, and any `settings.*` fields in the controller, then forward them in the DTO. Use cases are pure functions of their input — safe to call from event handlers and cross-context adapters.

---

## Definition of Done

- [x] Zero use cases or application services import or inject `RequestContext`
- [x] All `this.tenantContext.*` reads occur only in controllers and event handlers
- [x] Auth checks (actor identity / role) live only in controllers or guards
- [x] `BookingSlotConflictService.assertSlotFree` takes `timezone: string` as a parameter
- [x] `LoyaltyBookingAdapter` and `PlatformBookingAdapter` pass `tenantId` explicitly (no `_tenantId` prefix in either)
- [x] 38 use case / service unit specs no longer require `RequestContextBuilder`
- [x] 15 controller unit specs provide `RequestContext` to the controller (not to use case stubs)
- [x] 2 integration specs unchanged and still green
- [x] All CI gates green across all four waves
- [x] All use case input types follow `{UseCaseName}Input` convention; all output types follow `{UseCaseName}Result` convention; no `{Action}Dto` or inline object types remain as use case inputs
- [x] All 7 output types missing `UseCase` in their name are renamed (`GenerateAttachmentSignedUrlResult`, 6 loyalty types)
- [x] `docs/AGENT_PATTERNS.md` updated: `RequestContext` section flipped from "use cases may inject" → "use cases must NOT inject"; §5 and §6 use case code templates replaced with DTO pattern; new controller template added showing extraction + forwarding; naming convention (`{UseCaseName}Input` / `{UseCaseName}Result`) added to use case template section
- [x] `docs/ENGINEERING_RULES.md` updated: explicit rule added in Architecture section
- [x] `docs/CODE_STANDARDS.md` updated: `correlationId` rule clarified to say "controller reads from `RequestContext`, passes via DTO"
- [x] `.copilot/context.md` updated: `correlationId` invariant clarified; new invariant added — "use cases never inject `RequestContext`"
