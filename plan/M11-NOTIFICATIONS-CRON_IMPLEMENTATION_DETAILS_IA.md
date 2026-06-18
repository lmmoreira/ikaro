# M11 — Notifications & Cron Jobs: Implementation Details (AI Agent Reference)

> Token-efficient reference. No prose. Load only when working on M12+ tasks that touch the Notification context, Pub/Sub retry/DLQ, email delivery, cron jobs, or notification test infrastructure.

---

## Artifacts Table

| Artifact | Path |
|---|---|
| `NotificationTemplate` aggregate | `contexts/notification/domain/notification-template.aggregate.ts` |
| `NotificationLog` aggregate | `contexts/notification/domain/notification-log.aggregate.ts` |
| `NotificationTemplateKey` enum | `contexts/notification/domain/notification-template-key.enum.ts` |
| `NotificationDomainError` / `EmailDeliveryException` | `contexts/notification/domain/errors/notification-domain.error.ts` |
| `BaseNotificationUseCase` | `contexts/notification/application/use-cases/base-notification.use-case.ts` |
| `BaseBookingReminderNotificationUseCase` | `contexts/notification/application/use-cases/base-booking-reminder-notification.use-case.ts` |
| `IEmailSender` port | `contexts/notification/application/ports/email-sender.port.ts` |
| `INotificationTemplateRepository` port | `contexts/notification/application/ports/notification-template-repository.port.ts` |
| `INotificationLogRepository` port | `contexts/notification/application/ports/notification-log-repository.port.ts` |
| `INotificationProcessedEventRepository` port | `contexts/notification/application/ports/processed-event-repository.port.ts` |
| `EmailDeliveryChannelAdapter` | `contexts/notification/infrastructure/delivery/email-delivery-channel.adapter.ts` |
| `MailhogEmailAdapter` | `contexts/notification/infrastructure/delivery/mailhog-email.adapter.ts` |
| `SendGridEmailAdapter` | `contexts/notification/infrastructure/delivery/sendgrid-email.adapter.ts` |
| `NotificationDispatcherAdapter` | `contexts/notification/infrastructure/delivery/notification-dispatcher.adapter.ts` |
| `DeadLetterHandler` | `contexts/notification/infrastructure/events/dead-letter.handler.ts` |
| `TenantProvisionedNotificationHandler` | `contexts/notification/infrastructure/events/tenant-provisioned.handler.ts` |
| `SeedDefaultTemplatesUseCase` | `contexts/notification/application/use-cases/seed-default-templates/seed-default-templates.use-case.ts` |
| `TypeOrmNotificationLogRepository` | `contexts/notification/infrastructure/repositories/typeorm-notification-log.repository.ts` |
| `TypeOrmNotificationTemplateRepository` | `contexts/notification/infrastructure/repositories/typeorm-notification-template.repository.ts` |
| `TypeOrmProcessedEventRepository` | `contexts/notification/infrastructure/repositories/typeorm-processed-event.repository.ts` |
| `createNotificationIntegrationApp()` | `src/test/utils/notification-integration-app.ts` |
| `InMemoryNotificationDispatcher` | `src/test/infrastructure/in-memory-notification-dispatcher.ts` |
| `InMemoryNotificationTemplateRepository` | `src/test/repositories/notification/in-memory-notification-template.repository.ts` |
| `InMemoryNotificationLogRepository` | `src/test/repositories/notification/in-memory-notification-log.repository.ts` |

---

## Migrations (in order)

| Timestamp | File | What |
|---|---|---|
| `1748000000010` | `CreateNotificationLogs` | Initial `notification_logs` table (M04 bootstrap) |
| `1748100000010` | `CreateNotificationTemplates` | `notification_templates` + 16 seeded global-default rows (`tenant_id=NULL`) |
| `1748200000010` | `AlterNotificationLogs` | Adds `recipient_email`, `status`, `retry_count`, `error_message`, `sent_at`; drops old UNIQUE constraint |
| `1748200000020` | `CreateNotificationProcessedEvents` | `processed_events` idempotency table |
| `1748300000010` | `AddNotificationLogUniqueConstraint` | Adds `UNIQUE(tenant_id, event_id, notification_type, channel)` for upsert |

---

## Email Adapter Chain

```
NotificationDispatcherAdapter (INotificationDispatcher)
  └── route by message.channel → find matching IDeliveryChannel
        └── EmailDeliveryChannelAdapter  (channelType = 'EMAIL')
              │  resolves from: tenantInfo.fromEmail ?? EMAIL_FROM env
              └── IEmailSender  (pure transport — no rendering)
                    ├── MailhogEmailAdapter   (EMAIL_ADAPTER=mailhog — local dev default)
                    └── SendGridEmailAdapter  (EMAIL_ADAPTER=sendgrid)
```

`OutboundMessage` shape (post M11-S07 refactor):
```typescript
{ tenantId, to, subject: string, body: string, channel: NotificationChannel }
```
`subject` and `body` are **already rendered** by the use case before reaching the dispatcher. No rendering in adapters.

---

## BaseNotificationUseCase — Key Methods

| Method | Purpose |
|---|---|
| `dispatchTemplates(templates, dto, to, variables)` | Render + dispatch to single recipient; writes log; throws on delivery failure |
| `dispatchTemplatesToMany(templates, dto, emails[], variables)` | Same but fan-out to multiple emails (admin digest); `saveLog` uses `emails[0]` as canonical |
| `isAlreadySent(eventId, notificationType, channel)` | Checks `processed_events` — not `notification_logs` |
| `saveLog(...)` | Writes SENT `NotificationLog` + `markProcessed()` inside `txManager.run()` |
| `saveFailedLog(...)` | Writes FAILED `NotificationLog` only — does NOT mark processed → retry is allowed |

`BaseBookingReminderNotificationUseCase` adds:
- `abstract reminderTemplateKey: NotificationTemplateKey` — subclass provides only this
- `INotificationTemplateRepository` injected at base level; `findAllByTriggerEvent()` called from base `execute()`

---

## Template Lookup: Fallback Chain

`findAllByTriggerEvent(tenantId, triggerEvent)` returns tenant-specific rows first; if none, falls back to global defaults (`tenant_id = NULL`). Every new tenant gets their own editable copy via `TenantProvisionedNotificationHandler` → `SeedDefaultTemplatesUseCase`.

---

## Idempotency Design

| Table | PK / UNIQUE | Purpose |
|---|---|---|
| `processed_events` | `(event_id, notification_type, channel)` | Dedup check before dispatch — allows same eventId for admin + customer independently |
| `notification_logs` | `UNIQUE(tenant_id, event_id, notification_type, channel)` | Upsert audit trail — FAILED rows overwritten by SENT on retry |

`notification_logs` upsert rule: `retry_count` increments at DB level only when `EXCLUDED.status = 'FAILED'`. Domain object always passes `retryCount: 0`; DB CASE WHEN handles increment.

---

## DLQ Routing

- `PUBSUB_MAX_DELIVERY_ATTEMPTS` (default 5): after N nacks, `GcpPubSubEventBusAdapter` publishes to `ikaro-dead-letter` topic + ACKs (stops retrying).
- `PUBSUB_AUTO_CREATE` (default `true`): set `false` in staging/prod — Terraform owns all topics/subscriptions there.
- `DeadLetterHandler`: subscribes to `'dead-letter'` with consumer `'monitor'` → subscription `ikaro-dead-letter-monitor`. Does NOT throw (adapter always ACKs DLQ messages).
- Programmatic routing (not native Pub/Sub DLQ policy) because the Pub/Sub emulator does not support native dead-letter policies.
- Unparseable JSON messages: ACKed immediately with ERROR log; no handler invoked.

---

## Environment Variables Added in M11

| Var | Default | Notes |
|---|---|---|
| `EMAIL_ADAPTER` | `mailhog` | `sendgrid` in staging/prod |
| `EMAIL_FROM` | — | Global sender fallback; per-tenant override via `settings.notification.from_email` |
| `SENDGRID_API_KEY` | — | Required only when `EMAIL_ADAPTER=sendgrid`; never log |
| `PUBSUB_MAX_DELIVERY_ATTEMPTS` | `5` | Nack threshold before DLQ routing |
| `PUBSUB_AUTO_CREATE` | `true` | Set `false` in staging/prod |

---

## Test Infrastructure

**Unit specs:** seed template in `beforeEach` so `findAllByTriggerEvent()` returns a result:
```typescript
templateRepo.seed(
  NotificationTemplate.create({ tenantId, triggerEvent: NotificationTemplateKey.XYZ, channel: 'EMAIL', subject: 'subject', body: 'body' })
);
```
Assert on `dispatcher.dispatched[0].subject` + `.body` — never on `templateKey` (removed from `OutboundMessage`).

**Integration specs:** use `createNotificationIntegrationApp()` — wires real DB + `InMemoryNotificationDispatcher` override. Suppress unrelated handlers. Drain provisioning noise before recording idempotency baseline.

**Integration test isolation:** `PUBSUB_SUBSCRIPTION_SUFFIX` env var appended to subscription names — prevents cross-test interference in the emulator.

---

## Gotchas

1. **`NotificationTemplate` does not extend `AggregateRoot`** — naming inconsistency; file is `.aggregate.ts` but class has no `addDomainEvent()`. `NotificationLog` was fixed in M11 cleanup to extend `AggregateRoot`. `NotificationTemplate` is pending.
2. **`retry_count` on `notification_logs` is dead telemetry** — incremented at DB level, never read in production code. Tracked in `td/TD02-LOCALIZATION.md` (pending cleanup story).
3. **Template lookup is tenant-first then global-fallback** — if a tenant has zero templates for an event (e.g. after a new `NotificationTemplateKey` is added), `SeedDefaultTemplatesUseCase` must be re-run or a new migration must backfill.
4. **`BaseBookingReminderNotificationUseCase` uses abstract property pattern** — `reminderTemplateKey` is an abstract property, not a constructor param. Subclasses declare `protected readonly reminderTemplateKey = NotificationTemplateKey.XYZ`.
5. **`SENDGRID_API_KEY` conditional validation** — env.validation allows it to be absent when `EMAIL_ADAPTER=mailhog`; the factory in `NotificationModule` selects the adapter at runtime.
6. **All pt-BR strings live in migration seed data** — tracked in `td/TD02-LOCALIZATION.md`. Do not add new hardcoded pt-BR strings to TypeScript source.
7. **`PUBSUB_SUBSCRIPTION_SUFFIX` integration test pattern** — each test run uses a unique suffix; handlers re-register on `onModuleInit` with the suffixed name. Required to avoid stale messages from a previous test bleeding into the current one.
