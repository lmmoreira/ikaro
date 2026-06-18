# M07 — Booking Creation: Implementation Details (IA)

> Token-efficient reference for AI agents. No prose, no tutorials.

---

## Artifacts

| Artifact | Path |
|---|---|
| `Booking` aggregate | `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` |
| `BookingLine` entity | `apps/backend/src/contexts/booking/domain/booking-line.entity.ts` |
| `BookingDomainError` | `apps/backend/src/contexts/booking/domain/errors/booking-domain.error.ts` |
| `RequestBookingUseCase` (guest) | `apps/backend/src/contexts/booking/application/use-cases/request-booking.use-case.ts` |
| `RequestAuthenticatedBookingUseCase` | `apps/backend/src/contexts/booking/application/use-cases/request-authenticated-booking.use-case.ts` |
| `booking-request.helpers.ts` | `apps/backend/src/contexts/booking/application/use-cases/booking-request.helpers.ts` |
| `ICustomerProfilePort` | `apps/backend/src/contexts/booking/application/ports/customer-profile.port.ts` |
| `CustomerProfileAdapter` | `apps/backend/src/contexts/booking/infrastructure/adapters/customer-profile.adapter.ts` |
| `IBookingAvailabilityPort` | `apps/backend/src/contexts/booking/application/ports/booking-availability.port.ts` |
| `TypeOrmBookingAvailabilityAdapter` | `apps/backend/src/contexts/booking/infrastructure/adapters/typeorm-booking-availability.adapter.ts` |
| `TypeOrmBookingRepository` | `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-booking.repository.ts` |
| `BookingEntity` | `apps/backend/src/contexts/booking/infrastructure/entities/booking.entity.ts` |
| `BookingLineEntity` | `apps/backend/src/contexts/booking/infrastructure/entities/booking-line.entity.ts` |
| `BookingController` (backend) | `apps/backend/src/contexts/booking/infrastructure/controllers/booking.controller.ts` |
| `BookingModule` | `apps/backend/src/contexts/booking/booking.module.ts` |
| `BookingRequestedHandler` | `apps/backend/src/contexts/notification/infrastructure/events/booking-requested.handler.ts` |
| `SendBookingRequestedNotificationUseCase` | `apps/backend/src/contexts/notification/application/use-cases/send-booking-requested-notification/` |
| `GetCustomerProfileUseCase` | `apps/backend/src/contexts/customer/application/use-cases/get-customer-profile.use-case.ts` |
| `UpdateCustomerProfileUseCase` | `apps/backend/src/contexts/customer/application/use-cases/update-customer-profile.use-case.ts` |
| `CustomerController` (backend) | `apps/backend/src/contexts/customer/infrastructure/controllers/customer.controller.ts` |
| `CustomerModule` | `apps/backend/src/contexts/customer/customer.module.ts` |
| `BookingsController` (BFF) | `apps/bff/src/bookings/bookings.controller.ts` |
| `CustomersController` (BFF) | `apps/bff/src/customers/customers.controller.ts` |
| Migrations | `apps/backend/src/contexts/booking/infrastructure/migrations/1748000000014-CreateBookingBookings.ts` + `…015-AddBookingVersion.ts` |
| `createBookingIntegrationApp()` | `apps/backend/src/test/utils/booking-integration-app.ts` |
| `BookingBuilder` | `apps/backend/src/test/builders/booking/booking.builder.ts` |
| `BookingEntityBuilder` | `apps/backend/src/test/builders/booking/booking-entity.builder.ts` |
| HTTP file (backend) | `apps/backend/http/booking/bookings.http` |

---

## Structural decisions

### `linesModified` flag
`Booking` has a private `_linesModified` field (exposed via getter). Set to `true` in `requestBooking()` (new booking, lines always written) and `complete()` (actual prices set per line). Repository `save()` only runs the delete-then-insert on `booking_lines` when `linesModified === true` — prevents redundant I/O on pure state-machine transitions (approve, reject, cancel, etc.).

**Builder default:** `BookingBuilder` defaults `linesModified = true` so test saves always persist lines. Use `.withLinesModified(false)` only for DB-reconstitute scenarios.

### Post-commit event flush (not transactional outbox)
```ts
await this.txManager.run(async () => {
  await this.bookingRepo.save(booking);
});
for (const event of booking.clearDomainEvents()) {
  await this.eventBus.publish(event);
}
```
Events are flushed **after** `txManager.run()` returns — not inside the transaction. If publish fails, the booking is already committed. No outbox in MVP. `clearDomainEvents()` is on `AggregateRoot` (returns and drains the queue). Never call inside `txManager.run()`.

### `ICustomerProfilePort` cross-context pattern
BookingContext must read Customer data for authenticated booking (UC-002) without importing CustomerRepository directly.
- Port (interface): `booking/application/ports/customer-profile.port.ts` — `CUSTOMER_PROFILE_PORT` symbol
- Adapter (infra): `booking/infrastructure/adapters/customer-profile.adapter.ts` — injects `CustomerQueryService` (not `CUSTOMER_REPOSITORY`)
- `CustomerQueryService` is exported from `CustomerModule`
- `BookingModule` imports `CustomerModule` and provides `CustomerProfileAdapter`

**Rule:** adapters inject services, never repository tokens from other contexts.

### Money VO storage
No `currency` column in DB. Currency hardcoded to `'BRL'` everywhere. Entity stores `price_at_booking_amount NUMERIC(10,2)` as TypeScript `string` (TypeORM returns NUMERIC as string). Reconstruct via `Money.from(entity.priceAtBookingAmount, 'BRL')`.

### BookingLine PK and FK
- PK is `line_id UUID` (not `id`) — maps to `BookingLine.lineId`
- No TypeORM composite FK decorator — FK enforced in migration: `FOREIGN KEY (tenant_id, booking_id) REFERENCES booking.bookings(tenant_id, id)`
- Save strategy: `DELETE WHERE bookingId + tenantId`, then `INSERT` — no upsert

### Optimistic locking
`@VersionColumn()` on `BookingEntity` → `version INTEGER DEFAULT 0`. `BookingProps` has optional `version?: number`. Repository sets it on `toEntity()`: `if (booking.version !== undefined) entity.version = booking.version`.

### `guestAddress` and `pickupAddress` as JSONB
Both stored as JSONB. Mapper uses `Address.reconstitute(entity.guestAddress as unknown as AddressProps)` (double cast required — TypeORM returns JSONB as `Record<string,unknown>`).

---

## BFF patterns

### `postForPublic()` — public (guest) booking
```ts
async postForPublic<T>(path: string, body: unknown, tenantId: string): Promise<T>
// Headers sent: { 'X-Tenant-ID': tenantId }
// No X-Actor-* headers — backend runs in guest context
```
BFF resolves `tenantId` first via `GET /internal/tenants/by-slug/{slug}` then calls `postForPublic`.

### BFF phone validation
```ts
guestPhone: z.string().refine(
  (v) => { const d = v.replace(/\D/g, ''); return d.length === 10 || d.length === 11; },
  'guestPhone must have 10 or 11 digits'
)
```
No `+55` prefix required. Digits-only 10 or 11. Backend `PhoneNumber` VO enforces the same rule.

### Customer profile BFF validation
```ts
phone: z.string().refine(
  (v) => { const d = v.replace(/\D/g, ''); return d.length === 10 || d.length === 11; },
  'phone must have 10 or 11 digits'
).nullable().optional()
```
`@Roles('CUSTOMER')` guard on GET/PATCH `/v1/customers/me`. BFF enforces role; backend trusts `X-Actor-*`.

---

## `UpdateCustomerProfileUseCase` partial-update pattern
Non-nullable field (name): use `??` — `null` is not a valid value.
Nullable-clearable field (phone, defaultAddress): must distinguish `undefined` (omitted → keep) from `null` (explicit → clear).

```ts
const name = dto.name ?? customer.name;
const phone = dto.phone === undefined ? (customer.phone?.value ?? null) : dto.phone;

let defaultAddress: Address | null;
if (dto.defaultAddress === undefined) {
  defaultAddress = customer.defaultAddress;
} else if (dto.defaultAddress === null) {
  defaultAddress = null;
} else {
  defaultAddress = Address.create({ ...dto.defaultAddress, complement: dto.defaultAddress.complement ?? undefined });
}
```
SonarCloud S3923 flags `!== undefined` negated conditions — always use `=== undefined` on the positive branch.

---

## Integration test helpers

### `createBookingIntegrationApp()`
Location: `apps/backend/src/test/utils/booking-integration-app.ts`

Entities list (required — integration-global-setup does not include Booking entities by default):
`TenantEntity, HotsiteConfigEntity, CustomerEntity, ServiceEntity, ScheduleClosureEntity, ScheduleOpeningEntity, BookingEntity, BookingLineEntity`

Pass `overrideEventBus: true` to swap in `InMemoryEventBus` (no real Pub/Sub in controller integration specs).

### `createNotificationIntegrationApp()`
Location: `apps/backend/src/test/utils/notification-integration-app.ts`

Entities: `TenantEntity, HotsiteConfigEntity, StaffEntity, NotificationLogEntity` + `extraEntities`.
Uses real `EventBusModule` (Pub/Sub emulator) — unique subscription suffix required.

### Notification idempotency test isolation
```ts
process.env['PUBSUB_SUBSCRIPTION_SUFFIX'] = `-si-${Date.now()}`;
```
Set in `beforeAll` so each test run gets a unique subscription. Prevents stale message delivery from prior runs.

**Dispatcher filter must be scoped to the test's email** — concurrent Jest integration tests create tenants (via `PlatformModule`) which publish unrelated `StaffInvited` events that hit the same notification handler:
```ts
// WRONG — counts all staff-invitation dispatches globally:
dispatcher.dispatched.filter((m) => m.templateKey === 'staff-invitation').length

// CORRECT — scoped to this test's email:
dispatcher.dispatched.filter((m) => m.templateKey === 'staff-invitation' && m.to === adminEmail).length
```

### `createCustomerIntegrationApp()`
Location: `apps/backend/src/test/utils/customer-integration-app.ts`
Entities: `TenantEntity, HotsiteConfigEntity, CustomerEntity`
Override `EVENT_BUS` with `InMemoryEventBus` — no Pub/Sub needed for customer controller tests.
Imports `PlatformModule` + `CustomerModule` + `EventBusModule`.

---

## Gotchas

| Gotcha | Detail |
|---|---|
| `BookingLine` PK is `lineId` not `id` | `@PrimaryColumn({ name: 'line_id' })` — entity getter and mapper must use `lineId` |
| NUMERIC columns return `string` in TypeORM | `entity.totalPriceAmount` is `string` — always pass through `Money.from(str, 'BRL')` |
| `serviceNameAtBooking` is a snapshot | Never read from the live `Service` aggregate after booking creation |
| `clearDomainEvents()` must be called after `txManager.run()` | Inside the transaction = events published before commit; on failure you'd get orphan events |
| `CustomerModule` must export `CustomerQueryService` | `BookingModule` imports `CustomerModule` to wire `CustomerProfileAdapter` |
| `BookingModule` must NOT export repository tokens | Cross-context access goes through the port, not the repository |
| `createBookingIntegrationApp` needs `CustomerEntity` | `CustomerQueryService` joins nothing but TypeORM needs the entity declared |
| `@UsePipes` at method level breaks `@CurrentUser()` | Attach `ZodValidationPipe` to `@Body()` parameter, never at method level |
| BFF component spec error propagation | Mock with `new HttpException({status: N}, N)` — plain objects are not caught by the error filter |
| `Date.now()` not unique enough for parallel tests | Use `uuidv7()` for `withGoogleOAuthId()` in `beforeEach` — avoids UNIQUE constraint race |

---

## Pub/Sub subscription names (M07 consumers)

| Handler | Topic | Subscription |
|---|---|---|
| `BookingRequestedHandler` in notification | `ikaro-BookingRequested` | `ikaro-BookingRequested-notification` |

---

## `BookingRequested` event payload key fields

```ts
data: {
  bookingId, type, customerId, guestEmail, guestName, guestPhone,
  scheduledAt (ISO-8601), totalDurationMins, totalPrice: {amount, currency},
  requiresPickup, pickupAddress (null | AddressPayload),
  lines: [{ lineId, serviceId, serviceNameAtBooking, priceAtBooking, durationMinsAtBooking, pointsValueAtBooking, requiresPickupAddressAtBooking }],
  beforeServicePhotoUrls,
}
```
`serviceNameAtBooking` is in the event payload so notification templates can render service names without a DB lookup.

---

## `getManagerEmails` port (notification)

`IGetManagerEmailsPort` (`GET_MANAGER_EMAILS_PORT`) — cross-context port in notification application layer. Adapter queries `StaffRepository` for `role = 'MANAGER'` rows in the tenant. Used by `SendBookingRequestedNotificationUseCase` to send admin confirmation email.
