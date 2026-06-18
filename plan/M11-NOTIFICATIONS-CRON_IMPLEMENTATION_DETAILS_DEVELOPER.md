# M11 — Notifications & Cron Jobs: Implementation Details (Developer Learning Guide)

> Detailed learning doc for the human developer. Explains every architectural decision with rationale, real code examples from this codebase, and enough context to understand NestJS, DDD, and the engineering patterns used here.

---

## What M11 Built

M11 completed the Notification context from end to end:

- **M11-S01:** `NotificationTemplate` aggregate + DB migration + 16 seeded pt-BR templates + `TenantProvisioned` handler that copies them to new tenants
- **M11-S02:** `NotificationLog` aggregate evolution + `processed_events` idempotency table + `BaseNotificationUseCase` refactor
- **M11-S03:** `IEmailSender` port + `MailhogEmailAdapter` (renamed from SMTP) + `SendGridEmailAdapter` + `EmailDeliveryChannelAdapter`
- **M11-S04:** `POST /cron/reminders` endpoint + UC-018/019/020 reminder jobs
- **M11-S05:** Three Notification consumers for reminder events
- **M11-S06:** `POST /cron/loyalty-expiry-warning` + `PointsExpiringSoonHandler`
- **M11-S07:** Full pipeline wiring — use cases load templates from DB, render them, dispatch pre-rendered messages
- **M11-S08:** Pub/Sub DLQ routing + `DeadLetterHandler`

---

## The Notification Pipeline (End-to-End)

Before M11-S07, notification use cases hardcoded subjects and passed a `templateKey` to the dispatcher, which did the rendering inside the email adapter. This was temporary scaffolding.

After M11-S07, the pipeline is clean:

```
Event arrives at Handler
  └── Handler calls UseCase.execute(dto)
        └── UseCase loads templates from DB:
              templateRepo.findAllByTriggerEvent(tenantId, NotificationTemplateKey.XYZ)
                └── returns [NotificationTemplate] — one per channel (EMAIL, SMS, etc.)
            For each template:
              template.render(variables)   → { subject: string, body: string }
              dispatcher.dispatch({ tenantId, to, subject, body, channel })
                └── NotificationDispatcherAdapter routes by channel:
                      EmailDeliveryChannelAdapter.send(message)
                        resolves "from" address (tenant override or EMAIL_FROM env)
                        calls IEmailSender.send({ to, from, subject, html: body })
                          └── MailhogEmailAdapter OR SendGridEmailAdapter
            saveLog() → notification_logs SENT row + processed_events row (in transaction)
        If delivery fails:
              saveFailedLog() → notification_logs FAILED row (no processed_events row → retry OK)
              throw err → handler rethrows → adapter nacks → Pub/Sub redelivers
```

**Key design insight:** The use case owns rendering, not the adapter. This means:
- Adding a new channel (SMS) requires only a new template row in DB + a new `IDeliveryChannel` adapter — no use case changes.
- Use cases are testable without a real email server.

---

## Domain Layer

### NotificationTemplateKey enum

```typescript
// domain/notification-template-key.enum.ts
export enum NotificationTemplateKey {
  BOOKING_REQUESTED_ADMIN         = 'booking-requested-admin',
  BOOKING_REQUESTED_CUSTOMER      = 'booking-requested-customer',
  BOOKING_APPROVED_CUSTOMER       = 'booking-approved-customer',
  // ... 16 values total
}
```

Values are lowercase-kebab strings. They are stored in the DB `trigger_event` column. The enum prevents typos and enables IDE autocomplete.

### NotificationTemplate aggregate

```typescript
// domain/notification-template.aggregate.ts
export class NotificationTemplate {
  // ...
  render(variables: Record<string, string>): { subject: string; body: string } {
    const interpolate = (template: string): string =>
      template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
    return { subject: interpolate(this._subject), body: interpolate(this._body) };
  }
}
```

`render()` replaces `{{variableName}}` placeholders. Missing variables become empty string — never an error. This is intentional: partial renders are better than thrown exceptions for email delivery.

**Note:** `NotificationTemplate` does not currently extend `AggregateRoot`. This is a naming inconsistency — the file is `.aggregate.ts` but the class has no domain events. It will be fixed in a future cleanup story (same pattern as `NotificationLog` which was fixed in M11).

### NotificationLog aggregate

Represents one send attempt. Status lifecycle: `PENDING → SENT | FAILED`.

```typescript
const log = NotificationLog.create({ tenantId, eventId, notificationType, channel, recipientEmail });
log.markSent();    // sets status=SENT, sentAt=now()
log.markFailed('SMTP timeout');  // sets status=FAILED, increments retryCount, stores errorMessage
```

After M11 cleanup, `NotificationLog extends AggregateRoot` — it has `addDomainEvent()` available if domain events are needed in future. `reconstitute()` skips validation (used by repository mapper).

---

## Idempotency: Two Tables With Different Responsibilities

This was the most subtle design decision in M11-S02.

### Why not use `notification_logs` for dedup?

The old design had `UNIQUE(tenant_id, event_id, notification_type, channel)` on `notification_logs` and used it as the idempotency check. Problem: a `FAILED` row would block retries. You'd send once, fail, and never retry — because the row already exists.

### The solution: separate the concerns

**`processed_events`** — idempotency gate:
```sql
PRIMARY KEY (event_id, notification_type, channel)
```
A row is only written on **success** (`markProcessed()` inside `saveLog()`). A failed delivery leaves no row here, so the next Pub/Sub redeliver finds no row and retries.

**`notification_logs`** — audit trail:
- Written on every attempt (PENDING → SENT or FAILED)
- Has its own `UNIQUE(tenant_id, event_id, notification_type, channel)` for the upsert
- `retry_count` increments at DB level: `CASE WHEN EXCLUDED.status = 'FAILED' THEN retry_count + 1 ELSE retry_count END`

So after 5 retries and then a success, `notification_logs` shows one row with `status=SENT`, `retry_count=5`. The `processed_events` row exists (written on success). Clean.

### Why the composite PK on processed_events allows admin + customer emails?

```
event_id = "abc-123"
notification_type = "booking-requested-admin"   → one row in processed_events
notification_type = "booking-requested-customer" → different row in processed_events
```

The same domain event (`BookingRequested`) produces two separate notification use case calls — one for admin, one for customer. They must dedup independently. A single-column `event_id` PK would block the second notification once the first is processed.

---

## BaseNotificationUseCase Pattern

Every notification use case extends `BaseNotificationUseCase`. It provides:

```typescript
// Shared by all use cases:
protected async dispatchTemplates(
  templates: NotificationTemplate[],
  dto: { tenantId: string; eventId: string },
  to: string,
  variables: Record<string, string>,
): Promise<boolean>
```

The pattern for any new use case:

```typescript
async execute(dto: SendXxxNotificationDto): Promise<void> {
  const templates = await this.templateRepo.findAllByTriggerEvent(
    dto.tenantId,
    NotificationTemplateKey.XXX,
  );
  if (templates.length === 0) {
    this.logger.warn('No template found — skipping', { tenantId: dto.tenantId });
    return;
  }
  // Fetch any cross-context data you need (customer name, tenant info, etc.)
  await this.dispatchTemplates(templates, dto, recipientEmail, {
    customerName: '...',
    localDate: '...',
    // variables matching {{placeholders}} in the template body
  });
}
```

`dispatchTemplates()` handles: idempotency check → render → dispatch → log (all in one call). If dispatch throws, it writes a FAILED log and rethrows — the handler above catches and rethrows to Pub/Sub for retry.

### Reminder use cases: BaseBookingReminderNotificationUseCase

Day-before and day-of reminders share the same logic (load template, format date/time, dispatch). They differ only in which template key they use:

```typescript
// base-booking-reminder-notification.use-case.ts
export abstract class BaseBookingReminderNotificationUseCase extends BaseNotificationUseCase {
  protected abstract readonly reminderTemplateKey: NotificationTemplateKey;
  // base execute() calls findAllByTriggerEvent(tenantId, this.reminderTemplateKey)
}

// Concrete subclass — only declares the key:
export class SendBookingReminderDueNotificationUseCase extends BaseBookingReminderNotificationUseCase {
  protected readonly reminderTemplateKey = NotificationTemplateKey.BOOKING_REMINDER_DUE;
}
```

This is the **Template Method** pattern: the base class defines the algorithm skeleton, subclasses provide only the varying parts.

---

## Email Adapter Architecture (IEmailSender vs IDeliveryChannel)

Two separate ports serve different responsibilities:

**`IDeliveryChannel`** — channel-level abstraction (`channelType: 'EMAIL' | 'SMS' | 'WHATSAPP'`). Receives a pre-rendered `OutboundMessage`. One implementation per channel. Knows about tenant `from` address resolution.

**`IEmailSender`** — pure transport abstraction. Just sends bytes. No rendering, no tenant logic.

```typescript
// IEmailSender — the narrowest possible interface
export interface IEmailSender {
  send(options: { to: string; from: string; subject: string; html: string }): Promise<void>;
}
```

The split means:
- `EmailDeliveryChannelAdapter` is testable without a real SMTP server (mock `IEmailSender`)
- `MailhogEmailAdapter` and `SendGridEmailAdapter` are testable without a `NotificationTemplate` (just assert `nodemailer.sendMail` was called)
- Adding a new transport (AWS SES) means implementing `IEmailSender` only — no changes to the channel layer

**Adapter selection at runtime:**
```typescript
// In NotificationModule:
{
  provide: EMAIL_SENDER,
  useFactory: (mailhog, sendgrid, config) =>
    config.get('EMAIL_ADAPTER') === 'sendgrid' ? sendgrid : mailhog,
  inject: [MailhogEmailAdapter, SendGridEmailAdapter, ConfigService],
}
```

Both adapters are instantiated; one is selected by the factory. This is safe because `SendGridEmailAdapter` does not make any API calls at construction time.

---

## Cron Job Design (UC-018, 019, 020)

`POST /cron/reminders` is fired by GCP Cloud Scheduler every 30 minutes. The endpoint is owned by the **Booking context** (it publishes booking-domain events) not the Notification context.

The time-window check:
```typescript
const localTime = utcDateToLocalHHMM(now, tenant.timezone);
if (localTime >= '06:00' && localTime <= '06:29') {
  // emit reminders for this tenant
}
```

String comparison on HH:MM is safe within a single hour range. `utcDateToLocalHHMM` returns `"HH:MM"` format.

Why 30-minute polling instead of a scheduled-at-exactly-6am trigger? Cloud Run can have cold starts. Firing every 30 minutes with a local-time window check means: even if the 6:00 run is delayed, the 6:30 run will still be within the 06:00–06:29 window in timezones where local time is 6:30 at that UTC moment. Robust to cold starts.

The job is **idempotent by design**: re-running within the window emits duplicate events, but `processed_events` deduplicates at the notification layer. No double-emails.

---

## Dead Letter Queue (DLQ)

### Why programmatic routing instead of native Pub/Sub DLQ?

Native Pub/Sub dead-letter policies are configured in Terraform (`infrastructure/terraform/pubsub.tf`). They work in staging and production. But the **Pub/Sub emulator does not support native DLQ policies**. This means integration tests running against the emulator cannot trigger DLQ routing via infrastructure config.

Solution: handle DLQ routing in the adapter code (`GcpPubSubEventBusAdapter.dispatch()`). This works identically in local dev, CI, and production. Terraform still creates the `ikaro-dead-letter` topic and `ikaro-dead-letter-monitor` subscription in staging/prod; the adapter uses auto-creation only on the emulator.

### Retry → DLQ flow

```
Message arrives
  └── handler called
        ├── success → message.ack()
        └── failure → check message.deliveryAttempt
              ├── attempt < PUBSUB_MAX_DELIVERY_ATTEMPTS (default 5)
              │     └── message.nack() → Pub/Sub redelivers with backoff
              └── attempt >= max
                    └── publishToDlq() → publish to "ikaro-dead-letter"
                        message.ack()  → Pub/Sub stops retrying this message
```

`message.deliveryAttempt` is maintained by Pub/Sub, not our code. We only read it.

### PUBSUB_AUTO_CREATE flag

```typescript
private async ensureTopicOnce(topicName: string): Promise<void> {
  if (!this.config.get<boolean>('PUBSUB_AUTO_CREATE', true)) return;
  // ... create topic if not exists
}
```

In staging/prod, `PUBSUB_AUTO_CREATE=false`. All topics and subscriptions are declared in Terraform. The adapter never tries to create them. This prevents race conditions and ensures Terraform is the single source of truth for infrastructure.

### DeadLetterHandler

```typescript
async handle(event: DomainEvent): Promise<void> {
  this.logger.error('Dead-letter message received — requires human investigation', undefined, {
    eventId: event.eventId,
    tenantId: event.tenantId,
    deadLetterReason: (event as Record<string, unknown>)['deadLetterReason'],
    deliveryAttempt: (event as Record<string, unknown>)['deliveryAttempt'],
  });
  // Does NOT throw — if this throws, the adapter would nack, leading to infinite DLQ redelivery
}
```

The handler never throws. By the time a message reaches the DLQ, 5 FAILED `notification_logs` rows already exist for that `eventId`. The DLQ is an observability signal — ops investigates via Loki/Grafana, not code.

---

## Template Override: Per-Tenant Copy Pattern

Every new tenant gets their own copy of the 16 default templates:

1. Migration seeds 16 rows with `tenant_id = NULL` (global defaults)
2. `TenantProvisionedNotificationHandler` subscribes to `TenantProvisioned`
3. On receipt, runs `SeedDefaultTemplatesUseCase` → copies all `tenant_id=NULL` rows to new rows with `tenant_id = event.tenantId`
4. New tenant has 16 editable rows independent of the global defaults

`findAllByTriggerEvent(tenantId, key)` returns tenant-specific rows. If the tenant has none for that key (e.g. after a `NotificationTemplateKey` is added in a future milestone), it falls back to global defaults.

This means: adding a new `NotificationTemplateKey` requires either:
- A new migration that backfills the new key for all existing tenants, OR
- Relying on the global-default fallback until tenants are seeded

For MVP, global-default fallback is acceptable.

---

## Testing Patterns

### Unit specs — always seed a template

Unit specs for notification use cases must seed a template because `findAllByTriggerEvent()` returns empty by default. Without a template, the use case logs a warning and returns — `dispatcher.dispatched` will be empty and the test will appear to pass while actually not testing the send path.

```typescript
// In beforeEach:
templateRepo.seed(
  NotificationTemplate.create({
    tenantId: TENANT_ID,
    triggerEvent: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
    channel: 'EMAIL',
    subject: 'Confirmado',
    body: 'Olá {{customerName}}',
  }),
);
```

Assert on rendered content:
```typescript
expect(dispatcher.dispatched[0].subject).toBe('Confirmado');
expect(dispatcher.dispatched[0].body).toContain('João');
```

### Integration specs — PUBSUB_SUBSCRIPTION_SUFFIX

Each integration test run uses a unique Pub/Sub subscription suffix:
```typescript
// In createNotificationIntegrationApp():
process.env.PUBSUB_SUBSCRIPTION_SUFFIX = `-test-${Date.now()}`;
```

This prevents stale messages from a previous test run (which may still be in the emulator's subscription queue) from being delivered to a new test's handler.

### Handler integration tests

Use `createNotificationIntegrationApp()` + real `EventBusModule` + `waitFor()`:
```typescript
await eventBus.publish(bookingApprovedEvent);
await waitFor(() => dispatcher.dispatched.some(m => m.to === customerEmail), 5000);
expect(dispatcher.dispatched[0].subject).toContain('confirmado');
```

`waitFor()` polls until the condition is true or the timeout expires. This accounts for the async Pub/Sub → handler → use case flow.

---

## Technical Debt Registered in M11

| Item | Location |
|---|---|
| Hardcoded pt-BR strings in migrations and test assertions | `td/TD02-LOCALIZATION.md` |
| `NotificationTemplate` does not extend `AggregateRoot` despite being named `.aggregate.ts` | To be fixed in a cleanup story |
| `retry_count` on `notification_logs` incremented but never read in production | Low priority; column exists for future observability use |

---

## Files Added/Modified Summary

**New domain files:**
- `domain/notification-template.aggregate.ts`
- `domain/notification-log.aggregate.ts` (renamed from `.entity.ts` + now extends `AggregateRoot`)
- `domain/notification-template-key.enum.ts`
- `domain/errors/notification-domain.error.ts`

**New application layer:**
- `application/ports/email-sender.port.ts`
- `application/ports/notification-template-repository.port.ts`
- `application/ports/processed-event-repository.port.ts`
- `application/use-cases/base-notification.use-case.ts`
- `application/use-cases/base-booking-reminder-notification.use-case.ts`
- `application/use-cases/seed-default-templates/`
- 13 use cases under `application/use-cases/send-*/`

**New infrastructure:**
- `infrastructure/delivery/email-delivery-channel.adapter.ts`
- `infrastructure/delivery/mailhog-email.adapter.ts` (renamed from smtp)
- `infrastructure/delivery/sendgrid-email.adapter.ts`
- `infrastructure/events/dead-letter.handler.ts`
- `infrastructure/events/tenant-provisioned.handler.ts`
- 5 migrations
- 3 TypeORM repositories

**New test infrastructure:**
- `src/test/utils/notification-integration-app.ts`
- `src/test/infrastructure/in-memory-notification-dispatcher.ts`
- `src/test/repositories/notification/in-memory-notification-template.repository.ts`
- `src/test/repositories/notification/in-memory-notification-log.repository.ts`
- `src/test/repositories/notification/in-memory-processed-event.repository.ts`
- Builder classes for all notification aggregates and DTOs
