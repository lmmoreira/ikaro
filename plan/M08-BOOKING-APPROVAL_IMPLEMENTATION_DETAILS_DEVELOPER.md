# M08 — Booking Approval Workflow: Developer Reference

**Milestone:** M08-BOOKING-APPROVAL  
**Goal:** Admin can approve, reject, or request more information for a PENDING booking. Customer can respond to an info request. Notification emails sent at each transition. Booking list and detail APIs for both staff and customer views.

---

## What was built

### Stories

| Story | What it added |
|---|---|
| M08-S01 | `ApproveBookingUseCase` + slot-conflict check before approval |
| M08-S02 | `RejectBookingUseCase` — terminal state |
| M08-S03 | `RequestMoreInfoUseCase` — PENDING → INFO_REQUESTED |
| M08-S04 | `SubmitBookingInfoUseCase` (authenticated customer) + `SubmitGuestBookingInfoUseCase` (guest via tokenised link) |
| M08-S05 | 4 notification handlers for the approval workflow events + guest token generation in the info-requested email |
| M08-S06 | `ListBookingsUseCase` + `GetBookingUseCase` + `findAllByTenantPaginated` repository method + BFF `GET /bookings` and `GET /bookings/:id` endpoints |

---

## Architecture patterns illustrated in M08

### Pattern: use case result type convention

Every use case declares its own result interface in the same file:

```ts
export interface ApproveBookingUseCaseResult {
  bookingId: string;
  status: string;
  approvedAt: string;
}
```

This keeps the contract visible and avoids coupling callers to the aggregate type.

### Pattern: state-transition use cases (approve/reject/requestMoreInfo)

All three follow the same structure:

```ts
async execute(dto): Promise<Result> {
  const tenantId = this.tenantContext.tenantId;
  const staffId = this.tenantContext.actorId!;             // 1. extract actor from context
  const correlationId = this.tenantContext.correlationId;

  const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
  if (!booking) throw new BookingNotFoundError(dto.bookingId); // 2. load — 404 if not found

  // 3. validate source state (approve/reject only; requestMoreInfo checks inside aggregate)
  if (booking.status !== BookingStatus.PENDING && ...) {
    throw new InvalidBookingTransitionError(booking.status, BookingStatus.APPROVED);
  }

  booking.approve(staffId, correlationId);                  // 4. mutate aggregate

  await this.txManager.run(async () => {                    // 5. persist inside transaction
    await this.bookingRepo.save(booking);
  });

  for (const event of booking.clearDomainEvents()) {        // 6. flush events AFTER tx
    await this.eventBus.publish(event);
  }

  return { bookingId: booking.id, status: booking.status, approvedAt: ... };
}
```

Key invariant: **events are published after the transaction commits**, not inside it. If the process crashes between commit and publish, Pub/Sub won't receive the event — this is an accepted trade-off for MVP (at-least-once delivery is handled by Pub/Sub retry; no outbox pattern yet).

### Pattern: state guard at use case vs aggregate level

Approve and reject check the source state explicitly in the use case before calling the aggregate method. This is intentional — the use case can return a structured error (`InvalidBookingTransitionError`) that the HTTP mapper converts to `422`. The aggregate method itself also enforces invariants for defense-in-depth.

### Pattern: BookingSlotConflictService — domain service extracted from use case

The slot-conflict check involves reading from two ports (`IBookingAvailabilityPort` and `IScheduleTenantSettingsPort`) and running overlap math. Extracting it as a domain service keeps `ApproveBookingUseCase.execute()` readable and makes the check independently testable:

```ts
await this.slotConflictService.assertSlotFree(
  tenantId,
  booking.scheduledAt,
  booking.totalDurationMins,
);
```

Half-open interval overlap algorithm:
```ts
const bookingEnd = scheduledAt.getTime() + totalDurationMins * 60_000;
const hasConflict = existingSlots.some((slot) => {
  const slotEnd = slot.scheduledAt.getTime() + slot.totalDurationMins * 60_000;
  return slot.scheduledAt.getTime() < bookingEnd && scheduledAt.getTime() < slotEnd;
});
```

Two intervals `[A_start, A_end)` and `[B_start, B_end)` overlap iff `A_start < B_end && B_start < A_end`.

### Pattern: role-based visibility in ListBookingsUseCase

The use case, not the controller or repository, decides what a caller can see:

```ts
const isStaffOrManager = actorRole === 'MANAGER' || actorRole === 'STAFF';
const customerId = isStaffOrManager ? undefined : (actorId ?? undefined);

const { items, total } = await this.bookingRepo.findAllByTenantPaginated(tenantId, {
  customerId, // undefined = no filter = all tenant bookings; set = customer's own bookings
  ...
});
```

This keeps the repository interface generic (it just takes optional filters) while the business rule lives in the application layer.

### Pattern: 404 instead of 403 for customer cross-booking access

In `GetBookingUseCase`:

```ts
if (!isStaffOrManager && booking.customerId !== actorId) {
  throw new BookingNotFoundError(dto.bookingId); // 404, not 403
}
```

Returning 404 when a customer tries to access another customer's booking prevents leaking the existence of the booking. This is the correct security pattern — never confirm that a resource exists to an unauthorized caller.

### Pattern: N+1 avoidance in paginated repository

`findAllByTenantPaginated` fetches the paginated booking page, then fetches all lines for those bookings in **one query**, then assembles in memory:

```ts
const [entities, total] = await this.repo.findAndCount({ where, take, skip });

const bookingIds = entities.map((e) => e.id);
const allLines = await this.lineRepo.find({
  where: bookingIds.map((bookingId) => ({ bookingId, tenantId })),
  // TypeORM expands to: WHERE (booking_id=$1 AND tenant_id=$2) OR (booking_id=$3 AND ...)
});

const linesByBookingId = new Map<string, BookingLineEntity[]>();
for (const line of allLines) {
  const list = linesByBookingId.get(line.bookingId) ?? [];
  list.push(line);
  linesByBookingId.set(line.bookingId, list);
}
```

Without this pattern you'd issue one query per booking — 25 queries for a page of 25.

---

## Guest info-submission flow (M08-S04 + M08-S05)

This was the most complex feature in M08. The problem: guests (unauthenticated users) need to respond to an info request, but they have no JWT. Solution: a short-lived signed token embedded in the email link.

### Token generation (backend notification use case)

`SendBookingInfoRequestedNotificationUseCase.buildRespondLink()`:

```ts
if (dto.customerId !== null) {
  // authenticated customer — link to dashboard
  return `${FRONTEND_URL}/dashboard/bookings/${dto.bookingId}`;
}

// guest — embed a short-lived JWT in the link
// NOTE: field renamed guestEmail -> contactEmail, and the URL responder -> submit-info,
// in M13-S38 (tenantSlug was also added to the payload the same story) — kept here as
// contactEmail/submit-info to match current code, not the field/URL this doc originally shipped with.
const token = jwt.sign(
  { bookingId: dto.bookingId, tenantId: dto.tenantId, tenantSlug: dto.tenantSlug, contactEmail: dto.contactEmail },
  JWT_SECRET,
  { expiresIn: 7 * 24 * 60 * 60 }, // 7 days
);
return `${FRONTEND_URL}/bookings/${dto.bookingId}/submit-info?token=${token}`;
```

### Token verification (BFF)

`PATCH /v1/bookings/:id/submit-info/guest?token=<token>` is `@Public()` (no JWT auth guard):

```ts
// 1. verify signature and expiry
const rawPayload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

// 2. validate shape with Zod
const payload = GuestTokenPayloadSchema.safeParse(rawPayload).data;

// 3. assert token matches route
if (payload.bookingId !== id) throw 400;

// 4. forward to backend with tenantId from token (no X-Actor headers = guest)
return this.backendHttp.patchForPublic(`/bookings/${id}/submit-info/guest`,
  { contactEmail: payload.contactEmail, ...body },
  payload.tenantId,
);
```

### Backend guest use case

`SubmitGuestBookingInfoUseCase` receives `contactEmail` (renamed from `guestEmail` in `M13-S38`, extracted from token by BFF) and passes it to `booking.submitInformation(contactEmail, { notes: response }, correlationId, photoUrls, null)`. The last argument (`customerId = null`) marks it as a guest submission.

**Why contactEmail comes from the token, not the request body:** the guest's email was captured at booking-creation time. The token is proof they received the email at that address. Letting guests supply their own email would allow anyone with the URL to respond as any email address.

---

## Notification handler pattern (M08-S05)

All 4 handlers follow this structure:

```ts
@Injectable()
export class BookingApprovedHandler implements OnModuleInit {
  onModuleInit(): void {
    this.eventBus.subscribe<BookingApproved>(
      'BookingApproved',
      (event) => this.handle(event),
      'notification',                      // consumerName → Pub/Sub subscription name
    );
  }

  async handle(event: BookingApproved): Promise<void> {
    try {
      await this.useCase.execute({ eventId: event.eventId, ... });
    } catch (err) {
      this.logger.error(...);
      throw err;                           // rethrow → Pub/Sub nack → retry
    }
  }
}
```

Handler is infrastructure (`notification/infrastructure/events/`), not application layer. It calls exactly one use case.

### Idempotency

Each notification use case checks `logRepo.findByEventAndChannel(tenantId, eventId, NOTIFICATION_TYPE, CHANNEL)` before dispatching. If the record exists (i.e., this event was already processed), it returns `{ emailSent: false }` immediately. After a successful dispatch it persists a `NotificationLog` inside a transaction. The DB unique constraint on `(tenant_id, event_id, notification_type, channel)` provides the final idempotency guarantee.

---

## BFF list/detail endpoints

### ListBookingsQuerySchema — coerce query params

HTTP query strings are always text. Zod won't coerce automatically for number fields unless you use `z.coerce.number()`:

```ts
const ListBookingsQuerySchema = z.object({
  status: BookingStatusEnum.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
```

The `.default()` means `limit` and `offset` are always present on the parsed object even if not in the URL.

### BookingListItem vs BookingDetailResponse

Two different response shapes:

- **List item** (`BookingListItem`): lightweight — `lineSummary[]` (serviceId, name, price snapshot), no phone, no notes, no photo arrays.
- **Detail** (`BookingDetailResponse`): full — phone, address, all photo arrays, `adminNotes`, `infoRequestMessage`, `infoResponseMessage`, `actualPriceCharged` per line.

This is intentional to keep the list query fast. The detail loads the full aggregate from the DB.

---

## Error mapping

`mapBookingError` in `infrastructure/http/booking-error.mapper.ts` handles all domain errors and converts them to RFC 9457 responses:

| Domain error | HTTP status |
|---|---|
| `BookingNotFoundError` | 404 |
| `BookingForbiddenError` | 403 |
| `BookingSlotUnavailableError` | 409 |
| `InvalidBookingTransitionError` | 422 |
| Unknown | re-throws (becomes 500) |

Pattern: `return this.useCase.execute(dto).catch(mapBookingError)` — controller is a pure pass-through.

---

## New env vars introduced

| Var | Where needed | Example value |
|---|---|---|
| `FRONTEND_URL` | backend notification use case | `http://localhost:3001` |
| `JWT_SECRET` | backend notification use case + BFF guest endpoint | `a-long-random-secret` |

`JWT_SECRET` is **shared** between backend and BFF so the BFF can verify tokens signed by the backend.

---

## Testing patterns used

### State-transition use case unit tests

```ts
describe('ApproveBookingUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let slotConflictService: BookingSlotConflictService; // with InMemoryBookingAvailabilityPort stub
  let useCase: ApproveBookingUseCase;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    // ... wire ports
    useCase = new ApproveBookingUseCase(tenantContext, bookingRepo, slotConflictService, txManager, eventBus);
  });

  it('approves a PENDING booking', async () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    await bookingRepo.save(booking);
    const result = await useCase.execute({ bookingId: booking.id });
    expect(result.status).toBe('APPROVED');
  });

  it('throws InvalidBookingTransitionError for COMPLETED booking', async () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.COMPLETED).build();
    await bookingRepo.save(booking);
    await expect(useCase.execute({ bookingId: booking.id })).rejects.toBeInstanceOf(InvalidBookingTransitionError);
  });
});
```

### Integration: controller integration spec uses createBookingIntegrationApp()

```ts
// booking.controller.integration.spec.ts
const { app, tenantId } = await createBookingIntegrationApp();

// approve
await request(app.getHttpServer())
  .patch(`/bookings/${bookingId}/approve`)
  .expect(200);
```

Tenant isolation test pattern — Tenant B cannot see Tenant A's bookings:

```ts
const TENANT_B = '11111111-1111-1111-1111-111111111111'; // unique to this test

await request(app.getHttpServer())
  .get(`/bookings/${bookingId}`)
  // request carries Tenant B's context
  .expect(404);
```
