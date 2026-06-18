# M04 — Staff Management: Developer Learning Guide

**Milestone:** M04-STAFF-MANAGEMENT  
**What this doc is:** A deep-dive into every concept, pattern, and decision introduced in M04. Read this to understand NestJS, DDD aggregates, event-driven design, and hexagonal architecture as practised in this codebase.

---

## What M04 Built

M04 delivered the complete staff lifecycle:

1. **First login / account activation (M04-S01)** — A staff member with `is_active=false` completes Google OAuth; their account is activated and a JWT is issued.
2. **Staff list + detail (M04-S02)** — Paginated list and individual lookup, tenant-scoped, MANAGER-only via BFF.
3. **Invite staff (M04-S03)** — A MANAGER invites a new member by email+role; an inactive row is created and `StaffInvited` is published.
4. **Deactivate staff (M04-S04)** — A MANAGER deactivates a member, with guards against self-deactivation and last-manager lockout.
5. **Notification bootstrap + invitation email (M04-S05)** — The Notification context is bootstrapped; `StaffInvited` events trigger invitation emails via a strategy-pattern delivery system.
6. **TenantProvisioned → first MANAGER staff (M04-S06)** — When a new tenant is provisioned, the Staff context subscribes to `TenantProvisioned` and creates the first MANAGER row, then publishes `StaffInvited` so M04-S05 sends the welcome email.

---

## 1. The Staff Aggregate

### Why an aggregate?

A DDD aggregate is a cluster of domain objects treated as a single unit for writes. The `Staff` class owns all state changes: you never mutate `StaffEntity` fields directly — you call methods on `Staff` and let it enforce business rules.

```typescript
// staff.aggregate.ts — key shape
export class Staff extends AggregateRoot {
  private readonly props: StaffProps;

  // Getters expose props; no public setters
  get email(): Email { return this.props.email; }
  get isActive(): boolean { return this.props.isActive; }

  // Factory: create a new invited staff
  static invite(tenantId, email, role, name, invitedBy, correlationId): Staff

  // Factory: create the first MANAGER via provisioning (no human inviter)
  static inviteFromProvisioning(tenantId, email): Staff

  // Reconstruction from DB — skips validation
  static reconstitute(props): Staff

  // Domain mutations — enforce rules + record events
  activate(googleOAuthId, name): void
  reinvite(role, name, invitedBy, correlationId): void
  deactivate(deactivatedBy, correlationId): void
}
```

### Why `email` is an `Email` VO, not a string

The `Email` value object (in `src/shared/value-objects/email.vo.ts`) validates format and normalises to lowercase at construction time. Storing `Email` on the aggregate means you can never accidentally save an invalid or mixed-case email address — the constraint is structural, not a test or a comment.

```typescript
// ✅ email is Email VO — string access via .address
staff.email.address  // 'maria@lavacar.com.br'

// ❌ never this
staff.email  // returns Email object, not string
```

The TypeORM entity stores a plain `string` column. The repository's `toDomain()` maps `entity.email → Email.create(entity.email)` and `toEntity()` maps `staff.email.address → entity.email`. This is the VO mapper pattern from `docs/VALUE_OBJECTS_REFERENCE.md`.

### Static factories vs constructors

The `Staff` constructor is `private`. You can only create instances through:
- `Staff.invite()` — validates everything, records `StaffInvited` domain event
- `Staff.inviteFromProvisioning()` — no human actor, no domain event
- `Staff.reconstitute()` — DB reads, no validation

This prevents the aggregate from ever existing in an invalid state. If you call `Staff.invite('', email, ...)` you get a `StaffDomainError` immediately — not a DB constraint error at save time.

### Domain events on the aggregate

`Staff extends AggregateRoot`, which provides `addDomainEvent()` and `clearDomainEvents()`. When you call `staff.invite(...)` it creates the Staff and calls `this.addDomainEvent(new StaffInvited(...))` internally. The use case then:

```typescript
await this.txManager.run(async () => {
  await this.staffRepo.save(staff);
});
// After transaction commits — flush events
for (const event of staff.clearDomainEvents()) {
  await this.eventBus.publish(event);
}
```

Events are **flushed after the transaction**, not inside it. This is the aggregate-driven event pattern from CLAUDE.md. If the save fails, no event is published. If the event publish fails after a successful save, the event is lost — this is an accepted tradeoff for MVP (M11 will add outbox-style reliability).

**Exception: `Staff.inviteFromProvisioning()`** does NOT add a domain event. The `CreateInitialManagerUseCase` publishes `StaffInvited` directly. Reason: the provisioning flow is system-initiated, `correlationId` comes from the outer event (not TenantContext), and keeping it separate from `Staff.invite()` made the aggregate cleaner.

---

## 2. Use Case Patterns

### InviteStaffUseCase — reinvite / upsert pattern

When inviting, the use case first checks for an existing staff row with that email:

```typescript
const existing = await this.staffRepo.findByTenantAndEmail(tenantId, normalizedEmail);

if (existing?.isActive) {
  throw new StaffAlreadyExistsError(normalizedEmail);  // active → conflict
}

const staff = existing
  ?? Staff.invite(tenantId, normalizedEmail, role, name, invitedBy, correlationId);
if (existing) staff.reinvite(role, name, invitedBy, correlationId);
```

If the row exists but is **inactive** (e.g. they were invited before and never accepted), we call `reinvite()` on the existing aggregate — updating name/role and re-emitting `StaffInvited`. This means:
- Only one row per tenant+email at all times (enforced by `UNIQUE(tenant_id, email)`)
- Re-inviting reuses the same `staffId` — the activation link is stable

### DeactivateStaffUseCase — race condition prevention

The last-manager guard is inside `txManager.run()`:

```typescript
await this.txManager.run(async () => {
  if (staff.role === 'MANAGER' && staff.isActive) {
    const activeManagers = await this.staffRepo.countActiveManagersByTenant(tenantId);
    if (activeManagers <= 1) throw new LastActiveManagerError();
  }
  staff.deactivate(deactivatedBy, correlationId);
  await this.staffRepo.save(staff);
});
```

Why is the count inside the transaction? Imagine two concurrent requests both trying to deactivate the last two active managers. If the count query runs outside the transaction, both requests see "2 managers" and proceed. By doing the count inside the transaction with a `SELECT ... FOR UPDATE`, the first committing transaction locks the rows, and the second sees the updated count.

Self-deactivation is checked **before** the transaction because it needs no DB state — the aggregate enforces it in `deactivate()`.

### ActivateStaffUseCase — the email match guard

When a staff member accepts their invitation via Google OAuth, the BFF calls `POST /internal/staff/:staffId/activate`. The use case validates that the Google account's email matches the invited email:

```typescript
if (staff.email.address !== dto.email.toLowerCase().trim()) throw new StaffEmailMismatchError();
```

This prevents someone from accepting an invitation intended for a different email address (e.g. if they have multiple Google accounts).

---

## 3. Repository Pattern

### Signature conventions

All repository methods follow:
- `findById(id, tenantId)` — always filtered by tenant
- `findByTenantAndEmail(tenantId, email)` — explicit tenant first
- `findAllByTenant(tenantId, limit, offset)` — paginated

The `tenantId` parameter is always present and always checked in the `WHERE` clause. This is enforced by architecture (the port interface defines the signatures) and by code review.

### Transaction awareness

The TypeORM repository's `save()` checks for an active transaction:

```typescript
async save(staff: Staff): Promise<void> {
  const manager = getActiveEntityManager();
  const entity = this.toEntity(staff);
  if (manager) {
    await manager.save(StaffEntity, entity);
  } else {
    await this.repo.save(entity);
  }
}
```

`getActiveEntityManager()` reads from `AsyncLocalStorage` — the `ITransactionManager.run()` implementation sets the active entity manager in the store before executing the callback. This means the repository transparently participates in transactions without the caller passing a connection around.

### toDomain / toEntity mappers

The TypeORM entity is a plain data class (no methods, no business logic). The repository is the boundary between the persistence model and the domain model:

```typescript
private toDomain(entity: StaffEntity): Staff {
  return Staff.reconstitute({
    ...
    email: Email.create(entity.email),  // string → VO
    role: entity.role as StaffRole,
  });
}

private toEntity(staff: Staff): StaffEntity {
  const entity = new StaffEntity();
  entity.email = staff.email.address;  // VO → string
  ...
  return entity;
}
```

---

## 4. HTTP Layer

### Two controllers, two purposes

`InternalStaffController` at `/internal/staff`:
- Auth-flow only: `GET /by-oauth`, `GET /by-email`, `POST /:staffId/activate`
- Called by the BFF during OAuth callback — not exposed publicly
- **No TenantContext** — TenantInterceptor skips all `/internal/*` paths
- Receives `tenantId` as an explicit query parameter

`StaffController` at `/staff`:
- Management: `GET /`, `GET /:id`, `POST /invite`, `PATCH /:id/deactivate`
- Requires JWT (from BFF's `X-Actor-*` headers via TenantInterceptor)
- `TenantContext` is populated — `tenantId` and `actorId` come from it
- `ManagerRoleGuard` on `invite` and `deactivate`

### The error mapper pattern

Every use case throws typed domain errors (`StaffNotFoundError`, `LastActiveManagerError`, etc.). The controller never checks error types — it just chains `.catch(mapStaffError)`:

```typescript
@Get(':id')
getById(@Param('id') id: string): Promise<GetStaffByIdUseCaseResult> {
  return this.getStaffById.execute(id, this.tenantContext.tenantId)
    .catch(mapStaffError);
}
```

`mapStaffError` is a pure function in `infrastructure/http/` that maps each domain error to the correct HTTP status + RFC 9457 Problem Detail body. This centralises all HTTP translation in one place; the use case has zero HTTP knowledge.

### ParseUUIDPipe on every UUID path param

Every path param that feeds a PostgreSQL UUID column uses `new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })`. Without it, a non-UUID string causes a `QueryFailedError` from PostgreSQL → unhandled → 500. With the pipe, it's a 400 before the use case is even called.

---

## 5. Event-Driven Integration: Staff ↔ Notification

### The full flow

```
POST /internal/tenants (M02-S05)
  → ProvisionTenantUseCase publishes TenantProvisioned
  → [Pub/Sub: ikaro-TenantProvisioned]
  → TenantProvisionedHandler (staff context)
  → CreateInitialManagerUseCase
    → saves Staff row (MANAGER, is_active=false)
    → publishes StaffInvited directly (no aggregate event)
  → [Pub/Sub: ikaro-StaffInvited]
  → StaffInvitedHandler (notification context)
  → SendStaffInvitationUseCase
    → checks notification_logs (idempotency)
    → queries staff email via INotificationStaffPort
    → queries tenant name via INotificationTenantPort
    → NotificationDispatcherAdapter.dispatch(OutboundMessage)
      → SmtpEmailAdapter.send(message)  [→ MailHog locally]
    → saves NotificationLog
```

The same `StaffInvited → email` path is triggered by both:
1. A MANAGER manually inviting a staff member (`InviteStaffUseCase`)
2. A new tenant being provisioned (`CreateInitialManagerUseCase`)

The notification handler doesn't need to distinguish — it just processes `StaffInvited` regardless of origin.

### Why the thin event pattern?

`StaffInvited` only carries `{ staffId: string }`. The notification use case queries staff data via a cross-context port. This is CLAUDE.md's thin event rule: if the data is persistently stored on the entity, the event carries only the ID.

The alternative (fat event with email/name/invitedBy) was rejected because:
- `InviteStaffUseCase` doesn't have tenant name — it would need its own cross-context call to embed it
- Denormalised data in events can become stale if the entity changes between publish and consume
- Thin events are easier to evolve (no schema coupling between producer and consumer)

### Cross-context port+adapter

The notification context needs staff data, but must not import directly from `staff/domain/`. The solution is a port+adapter:

```
notification/application/ports/notification-staff.port.ts
  → interface INotificationStaffPort { getStaffInfo(...) }

notification/infrastructure/cross-context/staff-info.adapter.ts
  → class StaffInfoAdapter implements INotificationStaffPort
  → injects GetStaffByIdUseCase (from StaffModule export)
  → catches any error → returns null (handler logs and skips)
```

`NotificationModule` imports `StaffModule` (which exports `GetStaffByIdUseCase`) so NestJS DI can wire the adapter. The notification context domain and application layers never import from `staff/`.

### Strategy pattern for delivery channels

The `IDeliveryChannel` interface is the open/closed design decision of M04:

```typescript
export interface IDeliveryChannel {
  readonly channelType: 'EMAIL' | 'WHATSAPP' | 'SMS';
  send(message: OutboundMessage): Promise<void>;
}
```

`NotificationDispatcherAdapter` holds `IDeliveryChannel[]` (all registered channels) and calls each:

```typescript
async dispatch(message: OutboundMessage): Promise<void> {
  await Promise.all(this.channels.map(c => c.send(message)));
}
```

Today only `SmtpEmailAdapter` is registered. Adding WhatsApp in a future milestone = create `WhatsAppDeliveryAdapter implements IDeliveryChannel`, add it to the factory in `NotificationModule` — zero changes to the dispatcher, use case, or handler.

The factory registration pattern in NestJS:
```typescript
{
  provide: DELIVERY_CHANNEL,
  useFactory: (smtp: SmtpEmailAdapter) => [smtp],
  inject: [SmtpEmailAdapter],
}
```

The `DELIVERY_CHANNEL` symbol is injected as an array (`IDeliveryChannel[]`).

### Idempotency via DB unique constraint

`SendStaffInvitationUseCase` checks the log before dispatching:

```typescript
const existing = await this.logRepo.findByEventAndChannel(
  dto.tenantId, dto.eventId, 'STAFF_INVITED', 'EMAIL'
);
if (existing) return { sent: false };
```

After dispatching, it saves a `NotificationLog` with `UNIQUE(tenant_id, event_id, notification_type, channel)`. If two concurrent deliveries race past the check, the DB constraint ensures only one log is saved — the second gets a unique constraint error, the Pub/Sub message is nacked, and Pub/Sub retries it. On retry, the first check finds the existing log and skips.

This is why you must never use an in-memory Set for Pub/Sub idempotency — the Set is lost on any restart or pod scale event.

---

## 6. SYSTEM_ACTOR_ID

When a platform action creates data without a human actor (provisioning, system jobs), the actor UUID is `SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'`. This is a valid UUID stored in `invited_by` on the Staff row. Downstream code checks:

```typescript
if (staff.invitedBy === SYSTEM_ACTOR_ID) {
  // don't try to look up the inviter's name
}
```

Using a nil UUID rather than `null` means the column is `NOT NULL` — simpler schema, simpler queries.

---

## 7. Testing Patterns Introduced in M04

### InMemoryNotificationDispatcher

Captures dispatched messages for assertions without a real SMTP server:

```typescript
const dispatcher = new InMemoryNotificationDispatcher();
// ... run use case ...
expect(dispatcher.dispatched[0].to).toBe('maria@lavacar.com.br');
```

### Integration tests with InMemory overrides

Controller-level integration specs override the `NOTIFICATION_DISPATCHER` token with an `InMemoryNotificationDispatcher`. This prevents the real `SmtpEmailAdapter` from trying to connect to MailHog during tests:

```typescript
.overrideProvider(NOTIFICATION_DISPATCHER)
.useValue(dispatcher)
```

Story-level integration specs (the full Pub/Sub chain) use this same override but connect to the real Pub/Sub emulator and DB, proving the end-to-end async flow works.

### Handler unit tests — call handle() directly

Handler specs don't go through `onModuleInit()` or Pub/Sub. They construct the handler with in-memory doubles and call `handler.handle(event)` directly:

```typescript
const handler = new StaffInvitedHandler(useCase, new InMemoryEventBus());
await handler.handle(makeEvent());
expect(dispatcher.dispatched).toHaveLength(1);
```

This tests the handler's delegation logic without any infrastructure.

---

## 8. Key Decisions and Rationale

| Decision | Rationale |
|---|---|
| `Staff.invite()` requires non-empty `name` | Staff without names cause UX problems in emails and dashboards. Better to reject at domain boundary. |
| `reinvite()` reuses existing row | Preserves `staffId` so activation links don't break if a MANAGER resends an invite. |
| Count + save in same transaction for deactivation | Prevents the race where two concurrent deactivations each see "2 managers" and both succeed, leaving 0 active managers. |
| `inviteFromProvisioning()` does not emit a domain event | The provisioning use case publishes `StaffInvited` directly with the `correlationId` from the outer `TenantProvisioned` event. Emitting from the aggregate would require passing `correlationId` as a parameter with no TenantContext available. |
| `IDeliveryChannel[]` strategy pattern | Open/Closed: adding WhatsApp/SMS = new class only, no changes to dispatcher or use case. Tested independently per channel. |
| `notification_logs` table for idempotency | In-memory Sets are lost on restart; DB unique constraint survives any number of pod restarts and replicas. |
| Cross-context port+adapter for staff/tenant data | CLAUDE.md hierarchy: events (async) preferred, BFF orchestration for reads, port+adapter as last resort sync. Notification handler is async server-side, so BFF isn't applicable — port+adapter is correct. |
| `SYSTEM_ACTOR_ID` as nil UUID not null | Allows `invited_by NOT NULL` — simpler queries and no null-checks in downstream code. |
