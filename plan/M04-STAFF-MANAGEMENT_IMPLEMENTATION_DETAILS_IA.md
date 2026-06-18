# M04 — Staff Management: Implementation Details (AI Agent Reference)

**Milestone:** M04-STAFF-MANAGEMENT  
**Status:** ✅ All 6 stories done  
**Contexts touched:** `staff` (backend), `notification` (backend), `staff` (BFF)

---

## Artifacts Table

| Artifact | Path |
|---|---|
| Staff aggregate | `apps/backend/src/contexts/staff/domain/staff.aggregate.ts` |
| Staff domain errors | `apps/backend/src/contexts/staff/domain/errors/staff-domain.error.ts` |
| StaffInvited event | `apps/backend/src/contexts/staff/domain/events/staff-invited.event.ts` |
| StaffDeactivated event | `apps/backend/src/contexts/staff/domain/events/staff-deactivated.event.ts` |
| Staff repository port | `apps/backend/src/contexts/staff/application/ports/staff-repository.port.ts` |
| ActivateStaffUseCase | `apps/backend/src/contexts/staff/application/use-cases/activate-staff.use-case.ts` |
| InviteStaffUseCase | `apps/backend/src/contexts/staff/application/use-cases/invite-staff.use-case.ts` |
| DeactivateStaffUseCase | `apps/backend/src/contexts/staff/application/use-cases/deactivate-staff.use-case.ts` |
| ListStaffUseCase | `apps/backend/src/contexts/staff/application/use-cases/list-staff.use-case.ts` |
| GetStaffByIdUseCase | `apps/backend/src/contexts/staff/application/use-cases/get-staff-by-id.use-case.ts` |
| GetStaffByEmailUseCase | `apps/backend/src/contexts/staff/application/use-cases/get-staff-by-email.use-case.ts` |
| GetStaffByOAuthIdUseCase | `apps/backend/src/contexts/staff/application/use-cases/get-staff-by-oauth-id.use-case.ts` |
| CreateInitialManagerUseCase | `apps/backend/src/contexts/staff/application/use-cases/create-initial-manager.use-case.ts` |
| Internal staff controller | `apps/backend/src/contexts/staff/infrastructure/controllers/internal-staff.controller.ts` |
| Staff controller | `apps/backend/src/contexts/staff/infrastructure/controllers/staff.controller.ts` |
| Staff error mapper | `apps/backend/src/contexts/staff/infrastructure/http/staff-error.mapper.ts` |
| TenantProvisionedHandler | `apps/backend/src/contexts/staff/infrastructure/events/tenant-provisioned.handler.ts` |
| TypeORM staff repo | `apps/backend/src/contexts/staff/infrastructure/repositories/typeorm-staff.repository.ts` |
| StaffEntity | `apps/backend/src/contexts/staff/infrastructure/entities/staff.entity.ts` |
| Staff migrations | `apps/backend/src/contexts/staff/infrastructure/migrations/` (4 files) |
| StaffModule | `apps/backend/src/contexts/staff/staff.module.ts` |
| SYSTEM_ACTOR_ID | `apps/backend/src/shared/domain/system-actor.ts` |
| NotificationLog domain entity | `apps/backend/src/contexts/notification/domain/notification-log.entity.ts` |
| IDeliveryChannel port | `apps/backend/src/contexts/notification/application/ports/delivery-channel.port.ts` |
| INotificationDispatcher port | `apps/backend/src/contexts/notification/application/ports/notification-dispatcher.port.ts` |
| INotificationLogRepository port | `apps/backend/src/contexts/notification/application/ports/notification-log-repository.port.ts` |
| INotificationStaffPort | `apps/backend/src/contexts/notification/application/ports/notification-staff.port.ts` |
| INotificationTenantPort | `apps/backend/src/contexts/notification/application/ports/notification-tenant.port.ts` |
| SendStaffInvitationUseCase | `apps/backend/src/contexts/notification/application/use-cases/send-staff-invitation/send-staff-invitation.use-case.ts` |
| SmtpEmailAdapter | `apps/backend/src/contexts/notification/infrastructure/delivery/smtp-email.adapter.ts` |
| NotificationDispatcherAdapter | `apps/backend/src/contexts/notification/infrastructure/delivery/notification-dispatcher.adapter.ts` |
| StaffInfoAdapter | `apps/backend/src/contexts/notification/infrastructure/cross-context/staff-info.adapter.ts` |
| TenantInfoAdapter | `apps/backend/src/contexts/notification/infrastructure/cross-context/tenant-info.adapter.ts` |
| StaffInvitedHandler | `apps/backend/src/contexts/notification/infrastructure/events/staff-invited.handler.ts` |
| NotificationLogEntity | `apps/backend/src/contexts/notification/infrastructure/entities/notification-log.entity.ts` |
| TypeORM notification repo | `apps/backend/src/contexts/notification/infrastructure/repositories/typeorm-notification-log.repository.ts` |
| Notification migration | `apps/backend/src/contexts/notification/infrastructure/migrations/1748000000010-CreateNotificationLogs.ts` |
| NotificationModule | `apps/backend/src/contexts/notification/notification.module.ts` |
| BFF staff controller | `apps/bff/src/staff/staff.controller.ts` |
| BFF active-staff guard | `apps/bff/src/shared/guards/active-staff.guard.ts` |
| InMemoryNotificationDispatcher | `apps/backend/src/test/infrastructure/in-memory-notification-dispatcher.ts` |
| InMemoryNotificationLogRepository | `apps/backend/src/test/repositories/notification/in-memory-notification-log.repository.ts` |
| Staff entity builder | `apps/backend/src/test/builders/staff/` |

---

## Critical Gotchas

### Staff aggregate

- `email` prop is typed as `Email` VO — not `string`. Getters return the VO. `staff.email.address` to get the string.
- `Staff.invite()` requires `name` (non-empty) — throws `StaffDomainError` if blank.
- `Staff.inviteFromProvisioning(tenantId, email, correlationId)` sets `name = null`, `invitedBy = SYSTEM_ACTOR_ID`, and records `StaffInvited` via `addDomainEvent()` — same aggregate-driven pattern as `Staff.invite()`. The `correlationId` is passed in from the handler (sourced from the outer `TenantProvisioned` event). Use case flushes via `clearDomainEvents()` after the transaction.
- `Staff.reconstitute()` skips all validation — for DB reads only.
- `reinvite()` re-issues `StaffInvited` event. Used when re-inviting an existing inactive row.
- **UNIQUE(tenant_id, email)** at DB level — `InviteStaffUseCase` detects existing rows and calls `reinvite()` instead of creating a duplicate.
- `deactivate()` throws `StaffSelfDeactivationError` if `staff.id === deactivatedBy`. This check is in the aggregate, not just the use case.

### DeactivateStaffUseCase — last-manager guard race condition

The `countActiveManagersByTenant` call and `save()` are **inside the same `txManager.run()`**. This is intentional — without it, two concurrent deactivations of the last two managers could both pass the count check before either commits. The count query uses `SELECT ... FOR UPDATE` on the rows to acquire locks.

### /internal routes skip TenantInterceptor

`InternalStaffController` lives at `/internal/staff`. The `TenantInterceptor` calls `next.handle()` early for any path starting with `/internal`, so `TenantContext` is **never populated** for these routes. Do not inject `TenantContext` into `InternalStaffController`. It receives `tenantId` explicitly as query params (`?tenantId=...`).

`StaffController` at `/staff` is on a normal path — `TenantContext` is populated normally. `StaffModule` imports `TenantModule` to enable this.

### StaffInvited event is thin

`StaffInvited.data` only has `{ staffId: string }`. Per CLAUDE.md thin/fat rule: email/role/invitedBy are stored on the entity, so the subscriber queries for them. The notification context uses `INotificationStaffPort` (port+adapter) to read staff data when processing the event.

### Notification context — cross-context ports

`NotificationModule` imports `StaffModule` and `PlatformModule` to inject `GetStaffByIdUseCase` and `GetTenantByIdUseCase` via port adapters. Both modules export those use cases. Direct imports from another context's domain/application layers are only in the `infrastructure/cross-context/` adapters.

### Notification delivery — Strategy pattern

`IDeliveryChannel[]` is injected via the `DELIVERY_CHANNEL` token using a factory provider:
```typescript
{
  provide: DELIVERY_CHANNEL,
  useFactory: (smtp: SmtpEmailAdapter) => [smtp],
  inject: [SmtpEmailAdapter],
}
```
Adding a new channel: create `XxxDeliveryAdapter implements IDeliveryChannel`, add it to the factory array — no other changes needed.

### Idempotency in notification

`UNIQUE(tenant_id, event_id, notification_type, channel)` on `notification.notification_logs`. Use case checks for existing log **before** dispatching. If the DB save fails after dispatch (concurrent delivery), the unique constraint blocks the duplicate insert — the Pub/Sub message will be nacked and retried, but the second call will find the existing log and skip dispatch.

### SYSTEM_ACTOR_ID

`'00000000-0000-0000-0000-000000000000'` — sentinel UUID used wherever no human actor exists (e.g., provisioning flow). Defined at `src/shared/domain/system-actor.ts`. Do not use `null` or a random UUID for platform-initiated actions.

### Pub/Sub subscription names

| Event | Topic | Subscription |
|---|---|---|
| `TenantProvisioned` | `ikaro-TenantProvisioned` | `ikaro-TenantProvisioned-staff` |
| `StaffInvited` | `ikaro-StaffInvited` | `ikaro-StaffInvited-notification` |
| `StaffDeactivated` | `ikaro-StaffDeactivated` | _(no consumer yet — M11)_ |

### Migration timestamps

| Migration | Timestamp |
|---|---|
| CreateStaffStaff | `1716600000002` |
| AddNameToStaff | `1716600000003` |
| AddUniqueEmailPerTenant | `1716600000004` |
| AddInvitedByDeactivatedByToStaff | `1748000000001` |
| CreateNotificationLogs | `1748000000010` |

### Integration test global setup

`src/test/integration-global-setup.ts` lists all migrations explicitly. When adding a new migration, it must be added there AND to `test-datasource.ts` entities list.

### BFF — staff endpoints all require MANAGER role

The BFF `StaffController` is decorated `@Roles('MANAGER')` at class level. All 4 endpoints (invite, list, getById, deactivate) require the MANAGER role. The `RolesGuard` reads the role from the JWT `role` claim.

---

## DB Schema

```sql
-- Staff schema
CREATE TABLE staff.staff (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  google_oauth_id VARCHAR(255),          -- null until first OAuth login
  name            VARCHAR(255),          -- null for provisioning-created rows
  email           VARCHAR(255) NOT NULL,
  role            VARCHAR(20)  NOT NULL, -- 'MANAGER' | 'STAFF'
  is_active       BOOLEAN      NOT NULL DEFAULT false,
  invited_by      UUID,                  -- staffId or SYSTEM_ACTOR_ID
  deactivated_by  UUID,
  created_at      TIMESTAMPTZ  NOT NULL,
  updated_at      TIMESTAMPTZ  NOT NULL
);
-- Indexes: tenant_id, (tenant_id, email), (tenant_id, google_oauth_id)
-- Unique: (tenant_id, email), google_oauth_id WHERE NOT NULL

-- Notification schema
CREATE TABLE notification.notification_logs (
  id                UUID PRIMARY KEY,
  tenant_id         UUID        NOT NULL,
  event_id          UUID        NOT NULL,
  notification_type VARCHAR(64) NOT NULL,
  channel           VARCHAR(32) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL
);
-- Unique: (tenant_id, event_id, notification_type, channel)
```

---

## SMTP env vars (added in M04-S05)

| Var | Default | Purpose |
|---|---|---|
| `SMTP_HOST` | `localhost` | MailHog host |
| `SMTP_PORT` | `1025` | MailHog SMTP port |
| `SMTP_FROM` | `noreply@<ikaro-domain>` | Sender address |
| `FRONTEND_URL` | `http://localhost:3000` | Activation link base URL |
