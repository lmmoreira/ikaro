# M11 — Notifications & Cron Jobs

**Phase:** Local Development  
**Goal:** The Notification context is fully implemented: per-tenant email templates in pt-BR, complete NotificationLog audit trail, SendGrid adapter (with MailHog for local dev), event idempotency table, and all cron reminder jobs. Customers receive day-before and day-of reminders; admins receive a daily schedule digest; customers receive loyalty expiry warnings.  
**Depends on:** M10 (all booking events exist), M04-S05 (Notification bootstrap), M02-S06 (tenant settings)  
**Blocks:** M13 (dashboard notification history page), M15 (SendGrid API key in Secret Manager)

---

## Stories

---

### M11-S01 — NotificationTemplate aggregate domain + migration ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Notification context, `docs/13-DATABASE_SCHEMA.md` § notification schema

**Description:**  
Implement the `NotificationTemplate` aggregate, its database migration, and the `NotificationTemplateKey` enum. Templates are per-tenant (or global-default when `tenantId` is null) and hold the pt-BR subject and body for one `(triggerEvent, channel)` pair. All pt-BR copy lives in the DB — no hardcoded strings in use cases.

**`NotificationTemplateKey` enum (created first — other files depend on it):**

```typescript
// src/contexts/notification/domain/notification-template-key.enum.ts
export enum NotificationTemplateKey {
  BOOKING_REQUESTED_ADMIN         = 'booking-requested-admin',
  BOOKING_REQUESTED_CUSTOMER      = 'booking-requested-customer',
  BOOKING_APPROVED_CUSTOMER       = 'booking-approved-customer',
  BOOKING_REJECTED_CUSTOMER       = 'booking-rejected-customer',
  BOOKING_INFO_REQUESTED_CUSTOMER = 'booking-info-requested-customer',
  BOOKING_INFO_SUBMITTED_ADMIN    = 'booking-info-submitted-admin',
  BOOKING_CANCELLED_CUSTOMER      = 'booking-cancelled-customer',
  BOOKING_CANCELLED_ADMIN         = 'booking-cancelled-admin',
  BOOKING_RESCHEDULED_CUSTOMER    = 'booking-rescheduled-customer',
  BOOKING_RESCHEDULED_ADMIN       = 'booking-rescheduled-admin',
  BOOKING_REMINDER_DUE            = 'booking-reminder-due',
  BOOKING_REMINDER_DUE_TODAY      = 'booking-reminder-due-today',
  ADMIN_DAILY_SCHEDULE_REMINDER   = 'admin-daily-schedule-reminder',
  SERVICE_POINTS_EARNED           = 'service-points-earned',
  POINTS_EXPIRING_SOON            = 'points-expiring-soon',
  STAFF_INVITATION                = 'staff-invitation',
}
```

**Refactor existing use cases to use the enum:**  
All existing notification use cases (M04–M10) pass `templateKey` as a plain string to `dispatcher.dispatch()`. Replace every string literal with the matching `NotificationTemplateKey` enum value. Update the `OutboundMessage` interface so `templateKey: string` becomes `templateKey: NotificationTemplateKey`. This is in-scope for this story — it must be done before the migration is run so the enum values match the seeded rows.

**`NotificationTemplate` aggregate:**
- Properties: `id` (UUID v7), `tenantId` (`string | null` — null = global default), `triggerEvent` (`NotificationTemplateKey`), `channel` (`'EMAIL' | 'SMS' | 'WHATSAPP'`), `subject` (string), `body` (string), `updatedAt`
- Methods: `update(subject, body)`, `render(variables: Record<string, string>): { subject: string; body: string }`
- `render()` engine: replace every `{{key}}` with `variables[key] ?? ''` — missing variables become empty string, never an error
- Invariants: `subject` non-empty, `body` non-empty

**Migration: `notification.notification_templates`**
```sql
id            UUID PRIMARY KEY
tenant_id     UUID NULLABLE                    -- NULL = global default; FK platform.tenants(id) when set
trigger_event VARCHAR(100) NOT NULL            -- NotificationTemplateKey enum value
channel       VARCHAR(20)  NOT NULL DEFAULT 'EMAIL'
subject       VARCHAR(255) NOT NULL
body          TEXT NOT NULL
created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()

-- Two partial unique indexes (PostgreSQL NULLs are distinct in standard UNIQUE)
UNIQUE INDEX uq_notification_templates_global ON notification_templates (trigger_event, channel) WHERE tenant_id IS NULL
UNIQUE INDEX uq_notification_templates_tenant ON notification_templates (tenant_id, trigger_event, channel) WHERE tenant_id IS NOT NULL
INDEX ON notification_templates (tenant_id)
```

**Global default rows seeded by migration (`tenant_id = NULL`, `channel = 'EMAIL'`):**

| trigger_event | subject (pt-BR) |
|---|---|
| `booking-requested-admin` | `Novo agendamento recebido` |
| `booking-requested-customer` | `Solicitação de agendamento recebida` |
| `booking-approved-customer` | `Seu agendamento foi confirmado!` |
| `booking-rejected-customer` | `Agendamento não confirmado` |
| `booking-info-requested-customer` | `Precisamos de mais informações sobre seu agendamento` |
| `booking-info-submitted-admin` | `Cliente respondeu à solicitação de informações` |
| `booking-cancelled-customer` | `Seu agendamento foi cancelado` |
| `booking-cancelled-admin` | `Agendamento cancelado` |
| `booking-rescheduled-customer` | `Seu agendamento foi reagendado` |
| `booking-rescheduled-admin` | `Agendamento reagendado` |
| `booking-reminder-due` | `Lembrete: seu agendamento é amanhã!` |
| `booking-reminder-due-today` | `Lembrete: seu agendamento é hoje!` |
| `admin-daily-schedule-reminder` | `Agenda do dia — {{localDate}}` |
| `service-points-earned` | `Lavagem concluída! Você ganhou {{totalPointsEarned}} pontos` |
| `points-expiring-soon` | `Seus pontos de fidelidade estão prestes a expirar!` |
| `staff-invitation` | `Você foi convidado para a equipe {{tenantName}}` |

All `body` values must be pt-BR with `{{variableName}}` placeholders matching the variables each use case already passes to `dispatcher.dispatch()`.

**Seeding on new tenant creation:**  
A new `TenantProvisionedNotificationHandler` subscribes to the `TenantProvisioned` event. It runs `SeedDefaultTemplatesUseCase` which copies all rows where `tenant_id IS NULL` into new rows with `tenant_id = event.tenantId`. Every new tenant gets a full editable copy of the defaults.

**Acceptance criteria:**
- [ ] `NotificationTemplateKey` enum covers all 16 keys; every existing use case's `templateKey` string literal replaced with enum value; `OutboundMessage.templateKey` typed as `NotificationTemplateKey`
- [ ] Migration creates table with two partial UNIQUE indexes and seeds 16 global-default rows (`tenant_id = NULL`)
- [ ] Migration revert drops the table cleanly
- [ ] `template.render({ customerName: 'João' })` replaces `{{customerName}}` in subject and body
- [ ] `template.render({})` with a missing variable leaves the placeholder as empty string (not an error)
- [ ] `TenantProvisionedNotificationHandler` copies all 16 global-default rows to the new tenant on `TenantProvisioned`
- [ ] After provisioning, new tenant has exactly 16 rows in `notification_templates`
- [ ] Tenant isolation: querying templates for Tenant B returns only Tenant B's rows — not Tenant A's, not global defaults
- [ ] All default subjects and bodies are in pt-BR
- [ ] Unit tests cover `render()` happy path, missing variable, and empty variables map

**Dependencies:** M00-S07, M02-S05

---

### M11-S02 — NotificationLog aggregate domain + migration + idempotency table ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Notification context, `docs/13-DATABASE_SCHEMA.md` § notification schema

**Description:**  
Evolve the existing `NotificationLog` entity (bootstrapped in M04-S05 with minimal columns) into a full audit-trail aggregate, and add the `processed_events` idempotency table. Every send attempt (PENDING → SENT or FAILED) is logged. `BaseNotificationUseCase` idempotency check moves from querying `notification_logs` to querying `processed_events`, so `notification_logs` becomes a pure audit trail and the UNIQUE constraint on it is dropped.

**Domain layer — evolve existing `NotificationLog` entity:**
- Properties: `id` (UUID v7), `tenantId`, `eventId` (source domain event), `notificationType` (`NotificationTemplateKey`), `channel` (`'EMAIL' | 'SMS' | 'WHATSAPP'`), `recipientEmail`, `status` (`'PENDING' | 'SENT' | 'FAILED'`), `retryCount` (integer, default 0), `errorMessage?`, `sentAt?`, `createdAt`
- Methods:
  - `static create(props)` — creates with `status='PENDING'`, `retryCount=0`
  - `markSent()` — sets `status='SENT'`, `sentAt=now()`
  - `markFailed(errorMessage)` — sets `status='FAILED'`, increments `retryCount`, stores message

**Migration 1 — ALTER TABLE `notification.notification_logs`:**

The table already exists from M04-S05 with columns `(id, tenant_id, event_id, notification_type, channel, created_at)` and `UNIQUE(tenant_id, event_id, notification_type, channel)`. This migration adds the audit columns and drops the constraint (idempotency moves to `processed_events`):
```sql
ALTER TABLE "notification"."notification_logs"
  ADD COLUMN "recipient_email" VARCHAR(255)  NOT NULL DEFAULT '',
  ADD COLUMN "status"          VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                                 CHECK (status IN ('PENDING','SENT','FAILED')),
  ADD COLUMN "retry_count"     SMALLINT      NOT NULL DEFAULT 0,
  ADD COLUMN "error_message"   TEXT,
  ADD COLUMN "sent_at"         TIMESTAMPTZ;

ALTER TABLE "notification"."notification_logs"
  DROP CONSTRAINT "UQ_notification_logs_event_channel";

CREATE INDEX "IDX_notification_logs_tenant_status"
  ON "notification"."notification_logs" ("tenant_id", "status");

CREATE INDEX "IDX_notification_logs_tenant_recipient"
  ON "notification"."notification_logs" ("tenant_id", "recipient_email");
```

Revert removes the added columns, restores the constraint, and drops the new indexes.

**Migration 2 — CREATE TABLE `notification.processed_events`:**

```sql
event_id          UUID         NOT NULL
notification_type VARCHAR(100) NOT NULL   ← NotificationTemplateKey value
channel           VARCHAR(32)  NOT NULL   ← 'EMAIL' | 'SMS' | 'WHATSAPP'
processed_at      TIMESTAMPTZ  NOT NULL DEFAULT now()

PRIMARY KEY (event_id, notification_type, channel)
```

This allows the same domain event to produce notifications across multiple template keys (admin + customer) and multiple channels (EMAIL + SMS) without blocking each other.

**Additional scope (required in this story):**
1. **`IProcessedEventRepository` port** (`application/ports/processed-event-repository.port.ts`):
   ```typescript
   isDuplicate(eventId: string, notificationType: string, channel: string): Promise<boolean>;
   markProcessed(eventId: string, notificationType: string, channel: string): Promise<void>;
   ```
2. **`TypeOrmProcessedEventRepository`** adapter implementing the port
3. **`InMemoryProcessedEventRepository`** test double in `src/test/repositories/notification/`
4. **Update `BaseNotificationUseCase.isAlreadySent()`** to call `IProcessedEventRepository.isDuplicate()` instead of `INotificationLogRepository.findByEventAndChannel()`; update `saveLog()` to call `markProcessed()` via the new port
5. **Update `INotificationLogRepository`** — remove `findByEventAndChannel()` (no longer used for idempotency); add `save(log)` variant that upserts status (`markSent` / `markFailed` paths)
6. **Update `InMemoryNotificationLogRepository`** and **`NotificationLogEntityBuilder`** for the new props (`recipientEmail`, `status`, `retryCount`, `errorMessage`, `sentAt`)
7. **Update `NotificationLogEntity`** (TypeORM) to add the new columns

**Acceptance criteria:**
- [ ] `NotificationLog.create()` produces status `PENDING`, `retryCount=0`
- [ ] `markSent()` transitions to `SENT` and sets `sentAt`; `markFailed(msg)` transitions to `FAILED`, increments `retryCount`, stores `errorMessage`
- [ ] Migration 1 (ALTER TABLE) runs and reverts cleanly without data loss on the existing columns
- [ ] Migration 2 (CREATE TABLE `processed_events`) runs and reverts cleanly
- [ ] `BaseNotificationUseCase.isAlreadySent()` checks `processed_events` — not `notification_logs`
- [ ] `processed_events PRIMARY KEY (event_id, notification_type, channel)` allows the same `eventId` to be processed for `BOOKING_REQUESTED_ADMIN` and `BOOKING_REQUESTED_CUSTOMER` independently
- [ ] Integration test: deliver same event + same `notificationType` + same `channel` twice → `processed_events` has 1 row → `notification_logs` has 1 row
- [ ] Tenant isolation: `notification_logs` for Tenant A are not returned when querying for Tenant B
- [ ] All existing notification use case unit specs still pass after `BaseNotificationUseCase` change
- [ ] `NotificationLogEntityBuilder` updated — `withStatus()`, `withRetryCount()`, `withRecipientEmail()` fluent methods present

**Dependencies:** M00-S07

---

### M11-S03 — SendGrid adapter + MailHog local adapter ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § Notification context, `docs/21-TENANTS_SETTINGS_SCHEMA.md` § Notification Settings

**Description:**  
Introduce `IEmailSender` as a thin email-only transport port, distinct from `IDeliveryChannel` (which covers all channels: EMAIL, SMS, WhatsApp). Implement `SendGridEmailAdapter` (production) and `MailhogEmailAdapter` (local dev, renamed from `SmtpEmailAdapter`) as pure-transport `IEmailSender` implementations — no rendering logic. Rename the existing `SmtpEmailAdapter` into `MailhogEmailAdapter` (transport) + a new `EmailDeliveryChannelAdapter` that bridges `IDeliveryChannel` → `IEmailSender`. The `EmailDeliveryChannelAdapter` retains the existing `render()` switch for now; M11-S07 moves rendering to use cases and removes it.

**Delivery chain (anticipating M11-S07 architecture):**
```
NotificationDispatcherAdapter (INotificationDispatcher)
  └── IDeliveryChannel[]
        └── EmailDeliveryChannelAdapter  (IDeliveryChannel, channelType=EMAIL)
              │  render() switch ← removed in M11-S07
              │  from = tenant settings.notification.from_email ?? EMAIL_FROM env
              └── IEmailSender  ← thin email-only transport
                    ├── MailhogEmailAdapter  (dev — renamed from SmtpEmailAdapter)
                    └── SendGridEmailAdapter  (prod)
```

**`IEmailSender` port** (`application/ports/email-sender.port.ts`):
```typescript
export interface EmailSendOptions {
  to: string;
  from: string;
  subject: string;
  html: string;
}
export const EMAIL_SENDER = Symbol('IEmailSender');
export interface IEmailSender {
  send(options: EmailSendOptions): Promise<void>;
}
```

**`MailhogEmailAdapter`** (rename of `SmtpEmailAdapter`):
- Implements `IEmailSender` — pure nodemailer SMTP transport, no rendering
- Reads `SMTP_HOST` (default `localhost`) and `SMTP_PORT` (default `1025`) from config
- Spec: update existing `smtp-email.adapter.spec.ts` → `mailhog-email.adapter.spec.ts`; tests assert `sendMail` called with correct `to`, `from`, `subject`, `html`

**`SendGridEmailAdapter`:**
- Implements `IEmailSender` — pure `@sendgrid/mail` transport, no rendering
- Reads `SENDGRID_API_KEY` from env (validated as always-required in `env.validation.ts`)
- `send(options)`: calls `sgMail.send({ to, from, subject, html: options.html })`; on non-2xx → throw `EmailDeliveryException`
- `SENDGRID_API_KEY` must never appear in logs or error messages

**`EmailDeliveryChannelAdapter`** (replaces `SmtpEmailAdapter` as the `IDeliveryChannel` adapter):
- Implements `IDeliveryChannel`, `channelType = 'EMAIL'`
- Injects `IEmailSender` and `INotificationTenantPort`
- `send(message: OutboundMessage)`:
  1. Render HTML via existing `private render(message)` switch (unchanged from current `SmtpEmailAdapter`)
  2. Resolve `from`: call `tenantPort.getTenantInfo(message.tenantId)` → use `tenantInfo.fromEmail` if set, else fall back to `config.get('EMAIL_FROM')`
  3. Call `this.emailSender.send({ to: message.to, from, subject: message.subject, html })`
- Spec: rename `smtp-email.adapter.spec.ts` tests that cover the render switch → `email-delivery-channel.adapter.spec.ts`; mock `IEmailSender` and assert it is called with the resolved `from`, correct `subject`, and rendered `html`

**`EmailDeliveryException`** (`domain/errors/notification-domain.error.ts`):
```typescript
export class NotificationDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export class EmailDeliveryException extends NotificationDomainError {
  constructor(cause: string) {
    super(`Email delivery failed: ${cause}`);
    this.name = 'EmailDeliveryException';
  }
}
```

**Per-tenant `from_email`:**
- `settings.notification.from_email` (nullable string) is defined in `docs/21-TENANTS_SETTINGS_SCHEMA.md` § Notification Settings
- `NotificationTenantInfo` gains `fromEmail: string | null`
- `TenantInfoAdapter.getTenantInfo()` reads `tenant.settings?.notification?.from_email ?? null`
- `EmailDeliveryChannelAdapter` resolves: `tenantInfo.fromEmail ?? config.get('EMAIL_FROM')`

**Environment variables (add to `env.validation.ts` and `.env.example`):**

| Var | Validation | Default | Notes |
|---|---|---|---|
| `SENDGRID_API_KEY` | `z.string().min(1)` (required only when `EMAIL_ADAPTER=sendgrid`) | — | Never log; never include in error messages |
| `EMAIL_FROM` | `z.string().email()` | — | Global sender fallback; per-tenant override via `settings.notification.from_email` |
| `EMAIL_ADAPTER` | `z.enum(['sendgrid', 'mailhog']).default('mailhog')` | `mailhog` | Selects active `IEmailSender` implementation |

**NestJS DI wiring (`NotificationModule`):**
```typescript
// Replace SmtpEmailAdapter provider with:
MailhogEmailAdapter,
SendGridEmailAdapter,
{
  provide: EMAIL_SENDER,
  useFactory: (mailhog: MailhogEmailAdapter, sendgrid: SendGridEmailAdapter, config: ConfigService) =>
    config.get('EMAIL_ADAPTER') === 'sendgrid' ? sendgrid : mailhog,
  inject: [MailhogEmailAdapter, SendGridEmailAdapter, ConfigService],
},
EmailDeliveryChannelAdapter,
{
  provide: DELIVERY_CHANNEL,
  useFactory: (email: EmailDeliveryChannelAdapter) => [email],
  inject: [EmailDeliveryChannelAdapter],
},
```

**Files to create / rename / delete:**

| Action | Path |
|---|---|
| NEW | `application/ports/email-sender.port.ts` |
| NEW | `domain/errors/notification-domain.error.ts` |
| NEW | `infrastructure/delivery/email-delivery-channel.adapter.ts` |
| NEW | `infrastructure/delivery/email-delivery-channel.adapter.spec.ts` |
| RENAME (from `smtp-email.adapter.ts`) | `infrastructure/delivery/mailhog-email.adapter.ts` |
| RENAME (from `smtp-email.adapter.spec.ts`) | `infrastructure/delivery/mailhog-email.adapter.spec.ts` |
| NEW | `infrastructure/delivery/sendgrid-email.adapter.ts` |
| NEW | `infrastructure/delivery/sendgrid-email.adapter.spec.ts` |
| EDIT | `notification.module.ts` |
| EDIT | `application/ports/notification-tenant.port.ts` (`fromEmail: string \| null`) |
| EDIT | `infrastructure/cross-context/tenant-info.adapter.ts` |
| EDIT | `infrastructure/cross-context/tenant-info.adapter.spec.ts` |
| EDIT | `apps/backend/src/config/env.validation.ts` |
| EDIT | `apps/backend/.env.example` |

**Pre-requisite before staging:**
SendGrid requires the sender email to be verified before any email sends. One-time manual step in the SendGrid dashboard (Settings → Sender Authentication → Single Sender Verification). Without this, all calls return `403 Forbidden` even with a valid API key.

**Integration tests:** No MailHog Testcontainer needed. Unit tests with mocked nodemailer / `@sendgrid/mail` SDK are sufficient. Existing notification integration tests (which override `NOTIFICATION_DISPATCHER` with `InMemoryNotificationDispatcher`) are unchanged.

**Acceptance criteria:**
- [ ] `IEmailSender` port exists with `EMAIL_SENDER` symbol; no context outside `notification/` imports the concrete classes directly
- [ ] `MailhogEmailAdapter` implements `IEmailSender`; unit test asserts `sendMail` called with `{ to, from, subject, html }`; no `render()` method
- [ ] `SendGridEmailAdapter` implements `IEmailSender`; unit test asserts `sgMail.send` called with correct args; throws `EmailDeliveryException` on non-2xx; `SENDGRID_API_KEY` never appears in logs or error messages
- [ ] `EmailDeliveryChannelAdapter` implements `IDeliveryChannel` (`channelType = 'EMAIL'`); injects `IEmailSender`; unit test mocks `IEmailSender` and asserts `send()` called with resolved `from`, correct `subject`, rendered `html`
- [ ] Per-tenant from: when `settings.notification.from_email` is set, `EmailDeliveryChannelAdapter` passes it as `from`; when null, falls back to `EMAIL_FROM` env
- [ ] `EMAIL_ADAPTER=sendgrid` → `SendGridEmailAdapter` is injected; `EMAIL_ADAPTER=mailhog` (or absent) → `MailhogEmailAdapter`
- [ ] `SENDGRID_API_KEY` missing with `EMAIL_ADAPTER=sendgrid` → app fails to start with a clear env-validation error; missing with `EMAIL_ADAPTER=mailhog` → app starts normally
- [ ] `EMAIL_FROM` and `EMAIL_ADAPTER` documented in `.env.example`; `EMAIL_FROM` note: "must be verified in SendGrid dashboard before staging emails will work"
- [ ] `smtp-email.adapter.ts` and `smtp-email.adapter.spec.ts` deleted; all existing render-switch tests migrated to `email-delivery-channel.adapter.spec.ts`
- [ ] Local dev: running `docker-compose up` + `EMAIL_ADAPTER=mailhog` delivers email to MailHog (`http://localhost:8025`) — verified manually

**Dependencies:** M11-S01, M11-S02, M04-S05

---

### M11-S04 — Cron endpoint + UC-018/019/020: Reminder jobs ✅ Done

**Agent:** `backend-ts`  
**Complexity:** L  
**Docs to load:** `docs/04-USE_CASES.md` § UC-018, UC-019, UC-020, `docs/23-INFRASTRUCTURE_SETUP.md` § Cloud Scheduler cron jobs

**Description:**  
Implement the `POST /cron/reminders` endpoint. GCP Cloud Scheduler fires it every 30 minutes; the handler checks which tenants have local time between 06:00–06:29 and emits reminder events for those tenants. The endpoint only raises events — all email logic lives in the Notification context consumers (M11-S05). Handles UC-018 (admin daily digest), UC-019 (customer day-before reminder), and UC-020 (customer day-of reminder).

**Module:** Booking context (`src/contexts/booking/`). Same pattern as M10's `CronLoyaltyController` — the context that publishes the events owns the controller and job classes.

**New files to create:**

| File | Purpose |
|---|---|
| `booking/domain/events/booking-reminder-due.event.ts` | Event class for day-before reminder (one per booking) |
| `booking/domain/events/booking-reminder-due-today.event.ts` | Event class for day-of reminder (one per booking) |
| `booking/domain/events/admin-daily-schedule-reminder.event.ts` | Event class for admin digest (one per tenant) |
| `booking/application/ports/reminder-tenant.port.ts` | `IReminderTenantPort` — cross-context port for tenant listing |
| `booking/application/jobs/booking-reminder.job.ts` | UC-019 + UC-020 logic |
| `booking/application/jobs/admin-schedule-reminder.job.ts` | UC-018 logic |
| `booking/infrastructure/cross-context/reminder-tenant.adapter.ts` | Adapter — injects `TypeOrmTenantRepository` directly |
| `booking/infrastructure/controllers/cron-booking.controller.ts` | `POST /cron/reminders` |
| `apps/backend/http/booking/cron-reminders.http` | REST Client file for the endpoint |

**`IReminderTenantPort`** (`booking/application/ports/reminder-tenant.port.ts`):
```typescript
export const REMINDER_TENANT_PORT = Symbol('IReminderTenantPort');
export interface ActiveTenantInfo {
  id: string;
  timezone: string;  // IANA timezone from settings.business_hours.timezone
}
export interface IReminderTenantPort {
  findAllActive(): Promise<ActiveTenantInfo[]>;
}
```

**Algorithm:**
1. `IReminderTenantPort.findAllActive()` → all active tenants with timezone
2. For each tenant, `utcDateToLocalHHMM(now, timezone)` → tenant local HH:MM
3. If local time is between `'06:00'` and `'06:29'` (string comparison on HH:MM is safe within one hour):
   a. **UC-019:** `IBookingRepository.findAllByTenant(tenantId, { status: 'APPROVED', scheduledAfter: startOfTomorrow, scheduledBefore: endOfTomorrow })` → emit `BookingReminderDue` per booking
   b. **UC-020:** same query for today's date range → emit `BookingReminderDueToday` per booking
   c. **UC-018:** reuse today's bookings result → build digest → emit `AdminDailyScheduleReminder`
4. `correlationId`: fresh `uuidv7()` per tenant loop iteration
5. Idempotent — re-running within the window emits duplicate events but Notification handlers deduplicate via `processed_events`

**Endpoint security:** No auth guard in MVP — backend is not publicly reachable (BFF-only path). M115-S03 adds `CronAuthGuard` (OIDC token from GCP Cloud Scheduler, same design as `docs/23-INFRASTRUCTURE_SETUP.md § Authentication`).

**`cron-booking.controller.ts`:**
```typescript
// MVP: no auth guard — M115-S03 adds CronAuthGuard (OIDC, see docs/23-INFRASTRUCTURE_SETUP.md)
@Controller('cron')
export class CronBookingController {
  constructor(
    private readonly bookingReminderJob: BookingReminderJob,
    private readonly adminScheduleReminderJob: AdminScheduleReminderJob,
  ) {}

  @Post('reminders')
  @HttpCode(HttpStatus.OK)
  async reminders(): Promise<{ ok: boolean }> {
    await this.bookingReminderJob.run();
    await this.adminScheduleReminderJob.run();
    return { ok: true };
  }
}
```

**`BookingReminderDue` event payload** (one per booking):
```typescript
{
  bookingId:       string
  customerId:      string | null
  recipientEmail:  string          // booking.guestEmail for guests; ICustomerProfilePort.findById().email for authenticated
  customerName:    string
  scheduledAt:     string          // ISO8601
  appointmentSlot: { startTime: string; endTime: string }
  lines:           { serviceId: string; serviceName: string }[]
}
```

**`BookingReminderDueToday` event payload** — identical shape to `BookingReminderDue`.

**`AdminDailyScheduleReminder` event payload** (one per tenant):
```typescript
{
  localDate:          string   // YYYY-MM-DD in tenant timezone — used in email subject
  bookingsToday:      {
    bookingId:        string
    customerName:     string
    customerPhone:    string | null  // booking.guestPhone for guests; ICustomerProfilePort.findById().phone for authenticated (may be null if customer hasn't set one)
    lines:            { serviceId: string; serviceName: string }[]
    appointmentSlot:  { startTime: string; endTime: string }
    adminNotes:       string | null
  }[]
  totalBookingsToday: number
}
```

**`ICustomerProfilePort`** — the job needs to resolve `recipientEmail` (and `phone` for `AdminDailyScheduleReminder`) for authenticated-customer bookings. Reuse the existing `ICustomerProfilePort` from M07 (`booking/application/ports/customer-profile.port.ts`) — it already has `{ email, name, phone: string | null }`. For guest bookings use `booking.guestEmail` / `booking.guestPhone` directly.

**Code change required before implementation (not part of this story's branch — raise on main or in a prep commit):**
- `platform/application/ports/tenant-repository.port.ts` — add `findAllActive(): Promise<Tenant[]>` to `ITenantRepository`
- `platform/infrastructure/repositories/typeorm-tenant.repository.ts` — implement the method (queries `WHERE active = true` or equivalent active-tenant filter)

**Acceptance criteria:**
- [ ] `POST /cron/reminders` returns `{ ok: true }` with HTTP 200
- [ ] `BookingReminderDue` emitted once per APPROVED booking scheduled for tomorrow (per eligible tenant)
- [ ] `BookingReminderDueToday` emitted once per APPROVED booking scheduled for today (per eligible tenant)
- [ ] `AdminDailyScheduleReminder` emitted once per eligible tenant; `bookingsToday` contains all today's APPROVED bookings
- [ ] A tenant whose local time is outside 06:00–06:29 receives no events
- [ ] If a tenant has no APPROVED bookings today, `AdminDailyScheduleReminder` is still emitted with `totalBookingsToday = 0` and empty `bookingsToday`
- [ ] Integration test: seed tenant + APPROVED booking for tomorrow → call endpoint with that tenant's timezone set so local time is in 06:00–06:29 → assert `BookingReminderDue` published for that booking
- [ ] Integration test: tenant with timezone placing it outside the window → call endpoint → assert no events published for that tenant
- [ ] Tenant isolation: Tenant A's bookings do not appear in events emitted for Tenant B
- [ ] `correlationId` is a fresh `uuidv7()` per tenant loop iteration (not shared across tenants)
- [ ] `cron-reminders.http` file present with `POST /cron/reminders` call
- [ ] `CronBookingController` registered in `BookingModule`; `IReminderTenantPort` wired to `ReminderTenantAdapter`

**Dependencies:** M07-S03, M02-S03

---

### M11-S05 — Notification consumers for reminder events ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § BookingReminderDue, BookingReminderDueToday, AdminDailyScheduleReminder

**Description:**  
Implement the 3 Notification context consumers for reminder events. All emails in pt-BR.

**`BookingReminderDueHandler`** (day-before):
- Recipient: `event.data.recipientEmail`
- Subject: `"Lembrete: seu agendamento é amanhã!"`
- Dispatch: `templateKey = BOOKING_REMINDER_DUE`, `data = { customerName, localDate, localTime, serviceNames }` — `localDate`/`localTime` derived from `event.data.scheduledAt` + tenant timezone via `utcDateToLocalDate` / `utcDateToLocalHHMM`
- Note: render switch stub (`<p>subject</p>`) remains — proper HTML body is added in M11-S07

**`BookingReminderDueTodayHandler`** (day-of):
- Recipient: `event.data.recipientEmail`
- Subject: `"Lembrete: seu agendamento é hoje!"`
- Dispatch: `templateKey = BOOKING_REMINDER_DUE_TODAY`, `data = { customerName, localDate, localTime, serviceNames }` — same shape as above
- Note: render switch stub (`<p>subject</p>`) remains — proper HTML body is added in M11-S07

**`AdminDailyScheduleReminderHandler`**:
- Recipient: all MANAGER emails via `INotificationStaffPort.getManagerEmails(tenantId)` — same multi-recipient `Promise.all()` pattern as `SendBookingRequestedNotificationUseCase`; `saveLog` uses `managerEmails[0]` as canonical recipient
- Subject: `"Agenda do dia — {{localDate}}"` where `localDate = event.data.localDate`
- Dispatch: `templateKey = ADMIN_DAILY_SCHEDULE_REMINDER`, `data = { localDate, totalBookingsToday, bookingsHtml }` — `bookingsHtml` is a simple HTML table built in the use case from `event.data.bookingsToday`; duration per booking is computed as `(endTime − startTime)` in minutes from `appointmentSlot`
- Empty digest: when `totalBookingsToday === 0`, `bookingsHtml = "<p>Nenhum agendamento para hoje</p>"`
- Note: render switch stub (`<p>subject</p>`) remains — proper HTML body is added in M11-S07

**Acceptance criteria:**
- [ ] `BookingReminderDueHandler` subscribes to `'BookingReminderDue'` with consumer name `'notification'`; dispatches to `event.data.recipientEmail` with `templateKey = BOOKING_REMINDER_DUE`
- [ ] `BookingReminderDueTodayHandler` subscribes to `'BookingReminderDueToday'` with consumer name `'notification'`; dispatches to `event.data.recipientEmail` with `templateKey = BOOKING_REMINDER_DUE_TODAY`
- [ ] `AdminDailyScheduleReminderHandler` subscribes to `'AdminDailyScheduleReminder'` with consumer name `'notification'`; dispatches one email per manager via `getManagerEmails()`
- [ ] `data.localDate` and `data.localTime` passed to dispatcher are in tenant timezone (not UTC) — derived from `scheduledAt` using `utcDateToLocalDate` / `utcDateToLocalHHMM`
- [ ] All 3 handlers are idempotent on `eventId` — second publish of same event → `isAlreadySent()` returns true → no dispatch, no duplicate `notification_logs` row
- [ ] If `getManagerEmails()` returns empty list, `AdminDailyScheduleReminderHandler` dispatches nothing and does not throw
- [ ] Admin digest: when `totalBookingsToday === 0`, dispatched `data.bookingsHtml` contains `"Nenhum agendamento para hoje"`
- [ ] Unit test: `BookingReminderDueHandler.handle(event)` → asserts `dispatcher.dispatched[0].to === event.data.recipientEmail` and `dispatcher.dispatched[0].templateKey === BOOKING_REMINDER_DUE`
- [ ] Unit test: `AdminDailyScheduleReminderHandler.handle(event)` with 2 managers → asserts `dispatcher.dispatched` has 2 entries, each with correct `templateKey` and `to`
- [ ] Integration test (using `createNotificationIntegrationApp` + `InMemoryNotificationDispatcher`): publish `BookingReminderDue` event via `eventBus` → `waitFor` → assert `dispatcher.dispatched[0].subject === "Lembrete: seu agendamento é amanhã!"`
- [ ] Integration test: publish `BookingReminderDueToday` → assert `dispatcher.dispatched[0].subject === "Lembrete: seu agendamento é hoje!"`
- [ ] Integration test: publish `AdminDailyScheduleReminder` with 1 booking and 2 managers → assert `dispatcher.dispatched` has 2 entries both with `templateKey === ADMIN_DAILY_SCHEDULE_REMINDER`
- [ ] Tenant-isolation: `AdminDailyScheduleReminder` emitted for Tenant A does not trigger dispatch for Tenant B's managers — verified by seeding 2 tenants and asserting `dispatcher.dispatched` count after one event

**Dependencies:** M11-S04, M11-S03

---

### M11-S06 — PointsExpiringSoon cron + notification consumer ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-016b, `docs/03-DOMAIN_EVENTS.md` § PointsExpiringSoon

**Description:**  
Implement the weekly loyalty expiry warning: GCP Cloud Scheduler fires `POST /cron/loyalty-expiry-warning` once a week (Mondays 06:00 UTC). Find all customers with loyalty points expiring within the configured window (`settings.loyalty.expiry_warning_days`, default 7) and send them a warning email.

**Cron endpoint:** `POST /cron/loyalty-expiry-warning`
- MVP: no auth guard (consistent with existing cron endpoints; M115-S03 adds CronAuthGuard)
- Algorithm (all-tenant single-pass, same pattern as `ExpirePointsUseCase`):
  1. Fetch all `LoyaltyEntry` rows where `expires_at BETWEEN now() AND now() + DEFAULT_WARNING_DAYS` across all tenants via `ILoyaltyEntryRepository.findExpiringSoon(from, to)`
  2. Group by `(tenant_id, customer_id)`
  3. For each group: compute `pointsExpiringSoon` (sum) and `earliestExpiresAt` (min)
  4. Emit one `PointsExpiringSoon` event per customer

**Pre-requisite code changes (implement on the feature branch before writing the use case):**
- `ILoyaltyTenantSettingsPort` / `LoyaltyTenantSettings`: add `expiryWarningDays: number`
- `LoyaltyTenantSettingsAdapter`: read `settings.loyalty.expiry_warning_days`; add `DEFAULT_EXPIRY_WARNING_DAYS = 7`
- `ILoyaltyEntryRepository`: add `findExpiringSoon(from: Date, to: Date): Promise<LoyaltyEntry[]>`
- `loyalty/domain/events/points-expiring-soon.event.ts`: new event class with payload `{ customerId, pointsExpiringSoon, earliestExpiresAt }`

**`PointsExpiringSoonHandler`** (Notification consumer):
- Recipient: customer email (via `INotificationCustomerPort`)
- Template key: `POINTS_EXPIRING_SOON`
- Variables: `{ customerName, pointsExpiringSoon, earliestExpiresAt }`
- Idempotency: `BaseNotificationUseCase.isAlreadySent(eventId, 'points-expiring-soon', 'EMAIL')`

**Acceptance criteria:**
- [ ] `POST /cron/loyalty-expiry-warning` emits one `PointsExpiringSoon` per customer with expiring entries
- [ ] `expiry_warning_days` is read from `tenants.settings.loyalty.expiry_warning_days` (default 7)
- [ ] Customer with 0 expiring points in the window is NOT emailed
- [ ] `PointsExpiringSoon` event payload contains `{ customerId, pointsExpiringSoon, earliestExpiresAt }`
- [ ] Email appears in MailHog with subject `"Seus pontos de fidelidade estão prestes a expirar!"`
- [ ] Handler is idempotent on `eventId` (duplicate event → no second email)
- [ ] Tenant isolation: Tenant A's expiring entries do not trigger emails for Tenant B customers

**Dependencies:** M10-S03, M11-S03, M11-S04

---

### M11-S07 — Refactor all notification handlers to use full template + log system ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § Notification context

**Description:**  
Upgrade all existing notification use cases (from M04-S05, M07-S06, M08-S05, M09-S04, M10-S06) to load and render templates from the DB, route dispatches through the correct channel, and log every send attempt. This story wires together the `NotificationTemplate` aggregate (M11-S01), the `NotificationLog` (M11-S02), and the `IEmailSender` adapter (M11-S03) into a complete, database-driven notification pipeline.

**Architecture locked in by M11-S01 design session:**

The current `OutboundMessage` interface carries `templateKey` + `data` and delegates rendering to the `SmtpEmailAdapter`. This is temporary scaffolding. M11-S07 replaces it with a clean separation:

- **Rendering belongs to the use case** (via `NotificationTemplate.render(variables)`) — not the adapter.
- **The adapter is a pure transport layer** — it receives `{ subject, body, channel }` and sends; no switch/render logic.
- **The dispatcher routes to the correct channel** (strategy pattern) — not broadcast to all adapters.

**`OutboundMessage` — redesigned (remove `templateKey`/`data`, add `body`/`channel`):**
```typescript
export interface OutboundMessage {
  tenantId: string;
  to: string;
  subject: string;           // already rendered
  body: string;              // already rendered (HTML for EMAIL, plain text for SMS)
  channel: NotificationChannel;  // EMAIL | SMS | WHATSAPP
}
```

**`INotificationTemplateRepository` — add new method:**
```typescript
findAllByTriggerEvent(
  tenantId: string,
  triggerEvent: NotificationTemplateKey,
): Promise<NotificationTemplate[]>;
```
Returns all channel variants for one event (e.g. both EMAIL and SMS rows). Use case iterates and dispatches one message per template.

**`NotificationDispatcherAdapter` — strategy routing (not broadcast):**
```typescript
async dispatch(message: OutboundMessage): Promise<void> {
  const adapter = this.channels.find(c => c.channelType === message.channel);
  if (!adapter) {
    this.logger.warn(`No adapter for channel ${message.channel} — skipping`);
    return;
  }
  await adapter.send(message);
}
```

**`EmailDeliveryChannelAdapter` — pure transport after refactor, no `render()` method:**
```typescript
async send(message: OutboundMessage): Promise<void> {
  const tenantInfo = await this.tenantPort.getTenantInfo(message.tenantId);
  const from = tenantInfo?.fromEmail ?? this.config.get<string>('EMAIL_FROM', 'noreply@beloauto.com.br');
  await this.emailSender.send({
    to: message.to,
    from,
    subject: message.subject,
    html: message.body,   // already rendered upstream by the use case
  });
}
```
The entire `private render(message)` switch block is deleted from `EmailDeliveryChannelAdapter` in this story.
`MailhogEmailAdapter` and `SendGridEmailAdapter` (pure `IEmailSender` transports) are unchanged — they already receive a pre-rendered `html` string.

**Use case pattern per handler (replaces all hardcoded subjects + templateKey strings):**
```typescript
// 1. Load all templates for this event (one per channel in DB)
const templates = await this.templateRepo.findAllByTriggerEvent(
  tenantId,
  NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
);
if (templates.length === 0) {
  this.logger.warn('No template found — skipping', { tenantId, triggerEvent });
  return;
}

// 2. Render and dispatch one message per channel template
for (const template of templates) {
  const { subject, body } = template.render({
    customerName: customer.name,
    localDate,
    localTime,
    // ... event-specific variables
  });
  await this.dispatcher.dispatch({
    tenantId,
    to: recipient,
    subject,
    body,
    channel: template.channel,  // determined by the DB row, not hardcoded
  });
}
```

Adding a new channel (SMS, WhatsApp) requires only:
1. A new template row in the DB with `channel = 'SMS'`
2. A new adapter class implementing `IDeliveryChannel`

No use case changes needed.

**Changes required in this story:**
1. Redesign `OutboundMessage` — add `body: string`, `channel: NotificationChannel`; remove `templateKey`, `data`
2. Add `findAllByTriggerEvent()` to `INotificationTemplateRepository` port + `TypeOrmNotificationTemplateRepository` + `InMemoryNotificationTemplateRepository`
3. Update `NotificationDispatcherAdapter` — route by `message.channel` instead of broadcasting
4. Delete `EmailDeliveryChannelAdapter`'s `private render()` method; `send()` uses `message.subject` + `message.body` directly (see updated snippet above)
5. Update every use case (9 handlers from M04–M10 + 3 new reminder handlers from M11-S05 + 1 from M11-S06) to:
   - Inject `INotificationTemplateRepository`
   - Call `findAllByTriggerEvent()` + `template.render(variables)`
   - Pass rendered `{ subject, body, channel }` to dispatcher
   - For `BaseBookingReminderNotificationUseCase`: drop the `abstract reminderSubject` property; inject `INotificationTemplateRepository` at the base level alongside `INotificationTenantPort`; call `findAllByTriggerEvent(tenantId, this.reminderTemplateKey)` from base `execute()`; concrete subclasses provide only `reminderTemplateKey`
6. Update all use case unit specs that assert `dispatcher.dispatched[x].templateKey` → assert `subject` and `body` instead; seed a template row in `beforeEach` via `InMemoryNotificationTemplateRepository.seed(NotificationTemplate.create({ tenantId, triggerEvent: NotificationTemplateKey.XYZ, channel: 'EMAIL', subject: 'expected subject', body: 'expected body' }))` so `findAllByTriggerEvent()` returns a result
7. Update `email-delivery-channel.adapter.spec.ts` — remove template-key-based describe blocks; assert only transport behaviour (`emailSender.send` called with correct `to`, `from`, `subject`, `html: message.body`)

**Acceptance criteria:**
- [ ] `OutboundMessage` has `body: string` and `channel: NotificationChannel`; `templateKey` and `data` are removed
- [ ] `NotificationDispatcherAdapter` routes to the single adapter matching `message.channel`; skips with log when no adapter found
- [ ] `EmailDeliveryChannelAdapter.send()` uses `message.subject` + `message.body`; no `private render()` method exists
- [ ] All 13 use cases (9 from M04–M10 + 3 reminder from M11-S05 + 1 from M11-S06) load templates from DB via `findAllByTriggerEvent()`; no hardcoded `subject` strings or `templateKey` values remain
- [ ] `BaseBookingReminderNotificationUseCase` has no `abstract reminderSubject`; `INotificationTemplateRepository` injected at base level; concrete subclasses provide only `reminderTemplateKey`
- [ ] If no template found for `(tenantId, triggerEvent)` → log warning + return without throwing
- [ ] Every email attempt produces a `notification_logs` row (via `NotificationLog` from M11-S02)
- [ ] `processed_events` prevents duplicate handling across all handlers
- [ ] All use case specs updated — assert on `subject`/`body` content, not `templateKey`
- [ ] Adding a second channel template row for an event causes the use case to dispatch a second message — no code change needed
- [ ] Existing integration tests from M04, M07, M08, M09, M10 still pass after refactor

**Dependencies:** M11-S01, M11-S02, M11-S03

---

### M11-S08 — Dead letter queue handling for Pub/Sub ✅ Done

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § Communication Patterns, `docs/09-CI_CD_PIPELINE.md` § Event Reliability

**Description:**  
Implement dead-letter queue (DLQ) handling for Pub/Sub. After `PUBSUB_MAX_DELIVERY_ATTEMPTS` failed nacks (default 5), the `GcpPubSubEventBusAdapter` programmatically routes the original message to the `beloauto-dead-letter` topic and ACKs it, preventing Pub/Sub from retrying indefinitely. `DeadLetterHandler` subscribes to that topic and logs the event at ERROR level so ops can investigate without silent data loss.

**Why programmatic routing (not native Pub/Sub dead-letter policy):**  
The Pub/Sub emulator does not support native dead-letter policies, so integration tests cannot trigger DLQ routing via infrastructure config. Routing in the adapter (`GcpPubSubEventBusAdapter.dispatch()`) works identically in local dev, CI, and production. In staging/production Terraform (`infrastructure/terraform/pubsub.tf`) creates the `beloauto-dead-letter` topic and the `beloauto-dead-letter-monitor` subscription — the adapter creates them on the emulator only (auto-creation is suppressed in staging/prod via the `PUBSUB_AUTO_CREATE` guard introduced in this story).

**Why no new `NotificationLog` row for DLQ:**  
Each failed delivery attempt already creates a `NotificationLog` row with `status=FAILED` via `BaseNotificationUseCase.saveFailedLog()`. By the time a message reaches the DLQ, 5 FAILED rows are already present for that `eventId`. Adding a 6th DLQ row with `channel='UNKNOWN'` adds noise without actionable data. DLQ detection is an observability concern — ERROR-level structured logs routed to Loki/Grafana are the correct signal.

**Changes to `GcpPubSubEventBusAdapter`:**

Add `PUBSUB_MAX_DELIVERY_ATTEMPTS` (default 5) and `PUBSUB_AUTO_CREATE` (default `true`) to `env.validation.ts`. In `dispatch()`:

```typescript
private async dispatch(message, eventName, handler): Promise<void> {
  try {
    const event = JSON.parse(message.data.toString()) as DomainEvent;
    await handler(event);
    message.ack();
  } catch (err) {
    const attempt = message.deliveryAttempt ?? 1;
    const max = this.config.get<number>('PUBSUB_MAX_DELIVERY_ATTEMPTS', 5);
    if (attempt >= max) {
      await this.publishToDlq(message, eventName, err);
      message.ack();   // stop retrying — permanently routed to DLQ
    } else {
      message.nack();  // normal retry
    }
  }
}

private async publishToDlq(message: Message, eventName: string, err: unknown): Promise<void> {
  const dlqTopic = 'beloauto-dead-letter';
  await this.ensureTopicOnce(dlqTopic);
  const enrichedData = {
    ...(JSON.parse(message.data.toString()) as Record<string, unknown>),
    deadLetterReason: err instanceof Error ? err.message : String(err),
    deliveryAttempt: message.deliveryAttempt ?? 1,
  };
  await this.pubsub.topic(dlqTopic).publishMessage({
    data: Buffer.from(JSON.stringify(enrichedData)),
    attributes: {
      ...message.attributes,
      originalEventName: eventName,
    },
  });
}
```

Guard auto-creation in `ensureTopicOnce()` and `ensureSubscription()` behind `PUBSUB_AUTO_CREATE`:

```typescript
private async ensureTopicOnce(topicName: string): Promise<void> {
  if (!this.config.get<boolean>('PUBSUB_AUTO_CREATE', true)) return;
  // ... existing logic
}
```

**`DeadLetterHandler`** (`notification/infrastructure/events/dead-letter.handler.ts`):

```typescript
@Injectable()
export class DeadLetterHandler implements OnModuleInit {
  private readonly logger = new AppLogger(DeadLetterHandler.name);

  constructor(@Inject(EVENT_BUS) private readonly eventBus: IEventBus) {}

  onModuleInit(): void {
    this.eventBus.subscribe<DomainEvent>(
      'dead-letter',
      (event) => this.handle(event),
      'monitor',
    );
  }

  async handle(event: DomainEvent): Promise<void> {
    this.logger.error('Dead-letter message received — requires human investigation', undefined, {
      eventId: event.eventId,
      eventName: event.eventName,
      tenantId: event.tenantId,
      deliveryAttempt: (event as Record<string, unknown>)['deliveryAttempt'],
      deadLetterReason: (event as Record<string, unknown>)['deadLetterReason'],
    });
    // Does NOT throw — adapter must ACK to prevent infinite DLQ redelivery
  }
}
```

Subscription created by the adapter: `beloauto-dead-letter-monitor` (matches `pubsub.tf`).

**Unparseable messages (JSON.parse fails in `dispatch()`):**  
Catch the parse error separately, log raw bytes at ERROR level, and ACK. No handler invoked. A malformed payload cannot be retried meaningfully.

```typescript
// in dispatch(), before calling handler:
let event: DomainEvent;
try {
  event = JSON.parse(message.data.toString()) as DomainEvent;
} catch {
  this.logger.error('[pubsub] unparseable message — ACKing to prevent retry loop', undefined, {
    eventName,
    rawBytes: message.data.toString().slice(0, 200),
  });
  message.ack();
  return;
}
```

**Environment variables (add to `env.validation.ts` and `.env.example`):**

| Var | Validation | Default | Notes |
|---|---|---|---|
| `PUBSUB_MAX_DELIVERY_ATTEMPTS` | `z.coerce.number().int().min(1).default(5)` | `5` | After this many nacks, adapter routes to DLQ |
| `PUBSUB_AUTO_CREATE` | `z.coerce.boolean().default(true)` | `true` | Default `true` (local dev only). Set `false` in staging/prod — Terraform owns all Pub/Sub resources there |

**Files to create / edit:**

| Action | Path |
|---|---|
| EDIT | `src/shared/infrastructure/gcp-pubsub-event-bus.adapter.ts` |
| EDIT | `src/shared/infrastructure/gcp-pubsub-event-bus.adapter.spec.ts` |
| NEW | `src/contexts/notification/infrastructure/events/dead-letter.handler.ts` |
| NEW | `src/contexts/notification/infrastructure/events/dead-letter.handler.spec.ts` |
| EDIT | `src/contexts/notification/notification.module.ts` |
| EDIT | `apps/backend/src/config/env.validation.ts` |
| EDIT | `apps/backend/.env.example` |

**Acceptance criteria:**
- [ ] `GcpPubSubEventBusAdapter.dispatch()` routes to `beloauto-dead-letter` topic and ACKs after `PUBSUB_MAX_DELIVERY_ATTEMPTS` failed nacks; unit test asserts `publishToDlq` called and `message.ack()` called (not `nack()`) on the Nth failure
- [ ] `GcpPubSubEventBusAdapter.dispatch()` calls `message.nack()` (not ACK) on attempts below the threshold; unit test asserts retry behaviour
- [ ] Unparseable message (invalid JSON): adapter logs at ERROR with raw bytes (truncated to 200 chars), calls `message.ack()`, does not invoke handler; unit test asserts this path
- [ ] `PUBSUB_AUTO_CREATE=false`: `ensureTopicOnce()` and `ensureSubscription()` are no-ops — topics/subscriptions are not created; unit test asserts
- [ ] `DeadLetterHandler` subscribes to `'dead-letter'` with consumer name `'monitor'` → subscription `beloauto-dead-letter-monitor`
- [ ] `DeadLetterHandler.handle()` logs at ERROR level with `eventId`, `eventName`, `tenantId`, `deliveryAttempt`, `deadLetterReason`
- [ ] `DeadLetterHandler.handle()` does NOT throw — adapter always ACKs DLQ messages
- [ ] `DeadLetterHandler` registered in `NotificationModule`
- [ ] `PUBSUB_MAX_DELIVERY_ATTEMPTS` and `PUBSUB_AUTO_CREATE` documented in `.env.example` with note: "Set PUBSUB_AUTO_CREATE=false in staging/prod — Terraform owns all Pub/Sub resources"
- [ ] Unit test: `DeadLetterHandler.handle(event)` → asserts `logger.error` called with all required context fields
- [ ] Integration test: call `deadLetterHandler.handle(event)` directly (no emulator DLQ routing needed) → assert no throw
- [ ] No tenant-isolation test required — `DeadLetterHandler` is infrastructure-only and does not query tenant data; logging only

**Dependencies:** M11-S02, M11-S07
