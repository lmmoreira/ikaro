# M08 — Booking Approval Workflow: Implementation Details (IA Reference)

**Milestone:** M08-BOOKING-APPROVAL  
**Status:** ✅ All 6 stories done  
**Depends on:** M07 (Booking aggregate, BookingLine, AvailabilityService, IBookingAvailabilityPort)  
**Blocks:** M09 (cancellation), M10 (completion)

---

## Artifacts

### Backend use cases (`apps/backend/src/contexts/booking/application/use-cases/`)

| File | Class | Source states | Target state | Event emitted |
|---|---|---|---|---|
| `approve-booking.use-case.ts` | `ApproveBookingUseCase` | PENDING, INFO_REQUESTED | APPROVED | `BookingApproved` |
| `reject-booking.use-case.ts` | `RejectBookingUseCase` | PENDING, INFO_REQUESTED | REJECTED | `BookingRejected` |
| `request-more-info.use-case.ts` | `RequestMoreInfoUseCase` | PENDING | INFO_REQUESTED | `BookingInfoRequested` |
| `submit-booking-info.use-case.ts` | `SubmitBookingInfoUseCase` | INFO_REQUESTED | PENDING | `BookingInfoSubmitted` |
| `submit-guest-booking-info.use-case.ts` | `SubmitGuestBookingInfoUseCase` | INFO_REQUESTED | PENDING | `BookingInfoSubmitted` |
| `list-bookings.use-case.ts` | `ListBookingsUseCase` | read-only | — | — |
| `get-booking.use-case.ts` | `GetBookingUseCase` | read-only | — | — |

### DTOs (`application/dtos/`)

| File | Key fields |
|---|---|
| `approve-booking.dto.ts` | `bookingId: string` |
| `reject-booking.dto.ts` | `bookingId, reason: string (min 10)` |
| `request-more-info.dto.ts` | `bookingId, message: string (min 20)` |
| `submit-booking-info.dto.ts` | `bookingId, response: string, photoUrls?: string[]` |
| `submit-guest-booking-info.dto.ts` | `bookingId, contactEmail: string, response: string, photoUrls?: string[]` (renamed from `guestEmail` in `M13-S38`) |
| `list-bookings.dto.ts` | `status?, from?, to?, limit (default 25), offset (default 0)` |

### Repository additions (`application/ports/booking-repository.port.ts`)

```ts
interface BookingFilters { status?, customerId?, scheduledAfter?, scheduledBefore? }
interface BookingListFilters extends BookingFilters { limit: number; offset: number }
interface BookingPaginatedResult { items: Booking[]; total: number }

findAllByTenantPaginated(tenantId, filters): Promise<BookingPaginatedResult>
```

`findAllByTenantPaginated` uses TypeORM `findAndCount` + bulk line fetch (N+1 avoided via `bookingIds.map(bookingId => ({ bookingId, tenantId }))` IN-style).

### Domain service (`application/services/booking-slot-conflict.service.ts`)

`BookingSlotConflictService.assertSlotFree(tenantId, scheduledAt, totalDurationMins)` — used exclusively by `ApproveBookingUseCase`.  
Half-open interval overlap: `slot.scheduledAt < bookingEnd && scheduledAt < slotEnd`.  
Throws `BookingSlotUnavailableError` on conflict.

### Backend controller (`infrastructure/controllers/booking.controller.ts`)

`@Controller('bookings')` — all 9 use cases wired. Mutation endpoints use `.catch(mapBookingError)` pattern. `@UseGuards(StaffOrManagerRoleGuard)` on approve/reject/request-info. No guard on submit-info (CUSTOMER) or submit-info/guest (no auth).

### Notification handlers (`apps/backend/src/contexts/notification/infrastructure/events/`)

| Handler | Event consumed | Email recipient | Subject (pt-BR) |
|---|---|---|---|
| `BookingApprovedHandler` | `BookingApproved` | customer | "Seu agendamento foi confirmado! ✓" |
| `BookingRejectedHandler` | `BookingRejected` | customer | "Sobre seu pedido de agendamento" |
| `BookingInfoRequestedHandler` | `BookingInfoRequested` | customer/guest | "Precisamos de mais informações sobre seu agendamento" |
| `BookingInfoSubmittedHandler` | `BookingInfoSubmitted` | admin (MANAGER) | "Cliente respondeu à solicitação de informações" |

All 4 handlers: thin, call one use case, rethrow errors, subscribe via `onModuleInit()`.

### Guest token flow (M08-S04/S05 carry-over, now complete)

`BookingInfoRequestedHandler` → `SendBookingInfoRequestedNotificationUseCase.buildRespondLink()`:
- **Authenticated customer** (`customerId !== null`): `${FRONTEND_URL}/dashboard/bookings/:id`
- **Guest** (`customerId === null`): signs JWT `{ bookingId, tenantId, tenantSlug?, contactEmail }` with `JWT_SECRET`, TTL 7 days → `${FRONTEND_URL}/bookings/:id/submit-info?token=<token>` (renamed from `guestEmail`/`/responder` in `M13-S38`; `tenantSlug` added the same story)

BFF guest endpoint: `PATCH /v1/bookings/:id/submit-info/guest?token=<token>` (`@Public()`):
- Verifies JWT with `jsonwebtoken.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`
- Validates payload with `GuestTokenPayloadSchema` (Zod)
- Asserts `payload.bookingId === id`
- Calls `backendHttp.patchForPublic(...)` with `tenantId` from token

### BFF controller additions (`apps/bff/src/bookings/bookings.controller.ts`)

| Method | Path | Auth | Zod schema |
|---|---|---|---|
| `GET` | `/bookings` | CUSTOMER, MANAGER, STAFF | `ListBookingsQuerySchema` |
| `GET` | `/bookings/:id` | CUSTOMER, MANAGER, STAFF | — (ParseUUIDPipe) |

`ListBookingsQuerySchema` uses `z.coerce.number()` for `limit`/`offset` (query params are strings).

### BFF types (`apps/bff/src/bookings/bookings.types.ts`)

Three response interfaces: `BookingResponse` (create), `BookingListResponse` (list), `BookingDetailResponse` (get-one — richer: phone, notes, infoRequest/Response, actualPriceCharged).

---

## Critical gotchas

### 1. Slot conflict check on approve only
`BookingSlotConflictService` is called only in `ApproveBookingUseCase`, not at booking creation (creation pre-dates this service). If you add features that need creation-time conflict checking, wire the service there too.

### 2. linesModified skip in approve/reject/request-info/submit-info
All state-transition use cases call `booking.approve/reject/requestMoreInfo/submitInformation` which do NOT set `linesModified = true`. The repository `save()` checks `booking.linesModified` before delete-then-insert of lines — state transitions skip this path, saving the extra DELETE + INSERT per call.

### 3. Role-based filtering in ListBookingsUseCase
`actorRole === 'MANAGER' || actorRole === 'STAFF'` → `customerId = undefined` (sees all tenant bookings).  
Otherwise (`CUSTOMER`) → `customerId = actorId` (sees own bookings only).  
This logic lives in the use case, not the controller or repository.

### 4. Customer ownership check in GetBookingUseCase
Customer accessing another customer's booking gets `BookingNotFoundError` (404), not `BookingForbiddenError` (403). This is intentional — avoids leaking booking existence to other customers.

### 5. Guest submit-info: contactEmail from token, not request body
BFF extracts `contactEmail` (renamed from `guestEmail` in `M13-S38`) from the verified JWT token and forwards it to the backend. The guest does not provide their email in the request body — it comes from the token created when the info-request notification was sent.

### 6. Notification idempotency via notification_logs
Each notification use case queries `logRepo.findByEventAndChannel(tenantId, eventId, NOTIFICATION_TYPE, CHANNEL)` before dispatching. If found, returns `{ emailSent: false }` without sending. Log is persisted inside `txManager.run()` after dispatch.

### 7. z.coerce.number() mandatory for BFF list query params
HTTP query parameters arrive as strings. `ListBookingsQuerySchema` uses `z.coerce.number().int().min(1).max(100).default(25)` for `limit` and `z.coerce.number().int().min(0).default(0)` for `offset`. Without `.coerce`, Zod rejects them.

### 8. findAllByTenantPaginated N+1 avoidance
Lines are fetched in a single query after the paginated booking query using `bookingIds.map(bookingId => ({ bookingId, tenantId }))` — TypeORM expands this to `WHERE (booking_id = $1 AND tenant_id = $2) OR (booking_id = $3 AND tenant_id = $4) ...`. Map built in memory for O(n) assembly.

---

## State machine (M08 additions in bold)

```
PENDING        → INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED → PENDING (customer responded) | APPROVED | REJECTED | CANCELLED
APPROVED       → COMPLETED | CANCELLED
COMPLETED      (terminal)
REJECTED       (terminal)
CANCELLED      (terminal)
```

APPROVED and REJECTED are blocked from approve/reject again (`InvalidBookingTransitionError`).

---

## New domain errors (M08)

| Error class | HTTP code | Thrown by |
|---|---|---|
| `BookingSlotUnavailableError` | 409 | `BookingSlotConflictService` |
| `BookingForbiddenError` | 403 | `SubmitBookingInfoUseCase` |
| `InvalidBookingTransitionError` | 422 | approve/reject use cases |

All in `booking/domain/errors/booking-domain.error.ts`. Mapped by `mapBookingError`.

---

## Env vars (new in M08)

| Var | Used by | Purpose |
|---|---|---|
| `FRONTEND_URL` | `SendBookingInfoRequestedNotificationUseCase` | Base URL for respond link in email |
| `JWT_SECRET` | same use case + BFF guest endpoint | Signs/verifies guest token (shared secret) |
