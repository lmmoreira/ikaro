# M11 — Notifications & Cron Jobs

**Phase:** Local Development  
**Goal:** The Notification context is fully implemented: per-tenant email templates in pt-BR, complete NotificationLog audit trail, SendGrid adapter (with MailHog for local dev), event idempotency table, and all cron reminder jobs. Customers receive day-before and day-of reminders; admins receive a daily schedule digest; customers receive loyalty expiry warnings.  
**Depends on:** M10 (all booking events exist), M04-S05 (Notification bootstrap), M02-S06 (tenant settings)  
**Blocks:** M13 (dashboard notification history page), M15 (SendGrid API key in Secret Manager)

---

## Stories

---

### M11-S01 — NotificationTemplate aggregate domain + migration

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Notification context, `docs/13-DATABASE_SCHEMA.md` § notification schema

**Description:**  
Implement the `NotificationTemplate` aggregate and its database migration. Templates are per-tenant and contain the email subject and body for each event type. All templates must be in pt-BR. A default template set is seeded for every new tenant.

**Domain layer:**
- `NotificationTemplate` aggregate:
  - Properties: `id` (UUID v7), `tenantId`, `eventName` (e.g., `'BookingApproved'`), `subject`, `bodyHtml`, `updatedAt`
  - Methods: `update(subject, bodyHtml)`, `render(variables: Record<string, string>): RenderedEmail`
  - Template engine: Mustache-style `{{variableName}}` placeholders
  - Invariants: `subject` must be non-empty, `bodyHtml` must be non-empty

**Migration: `notification.notification_templates`**
```sql
id          UUID PRIMARY KEY
tenant_id   UUID NOT NULL
event_name  VARCHAR(100) NOT NULL
subject     VARCHAR(500) NOT NULL
body_html   TEXT NOT NULL
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE (tenant_id, event_name)
INDEX (tenant_id)
```

**Default templates to seed (on new tenant creation via UC-024):**
- `BookingRequested` — admin + customer variants
- `BookingApproved`, `BookingRejected`, `BookingInfoRequested`, `BookingInfoSubmitted`
- `BookingCancelled`, `BookingRescheduled`
- `BookingReminderDue`, `BookingReminderDueToday`
- `AdminDailyScheduleReminder`
- `ServicePointsEarned`, `PointsExpiringSoon`
- `StaffInvited`

All subjects and bodies must be in pt-BR with `{{variableName}}` placeholders.

**Acceptance criteria:**
- [ ] `UNIQUE (tenant_id, event_name)` constraint exists
- [ ] `template.render({ customerName: 'João' })` replaces `{{customerName}}` in subject and body
- [ ] `template.render({})` with a missing variable leaves `{{variableName}}` as empty string (not an error)
- [ ] Migration and revert run cleanly
- [ ] Default templates are seeded automatically in `UC-024 tenant:create` command
- [ ] All default template subjects are in pt-BR

**Dependencies:** M00-S07, M02-S05

---

### M11-S02 — NotificationLog aggregate domain + migration + idempotency table

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Notification context, `docs/13-DATABASE_SCHEMA.md` § notification schema

**Description:**  
Implement the `NotificationLog` aggregate (audit trail) and the `processed_events` idempotency table. Every email send attempt (success or failure) is logged. Event consumers check `processed_events` before processing to prevent duplicate sends on Pub/Sub redelivery.

**Domain layer:**
- `NotificationLog` aggregate:
  - Properties: `id` (UUID v7), `tenantId`, `eventId` (source event), `eventName`, `recipientEmail`, `subject`, `status` (`SENT | FAILED`), `errorMessage?`, `sentAt?`, `createdAt`
  - Methods: `recordSent(...)`, `recordFailed(..., errorMessage)`

**Migrations:**

`notification.notification_logs`:
```sql
id               UUID PRIMARY KEY
tenant_id        UUID NOT NULL
event_id         UUID NOT NULL      ← the source domain event's eventId
event_name       VARCHAR(100) NOT NULL
recipient_email  VARCHAR(255) NOT NULL
subject          VARCHAR(500) NOT NULL
status           VARCHAR(20) NOT NULL CHECK (status IN ('SENT','FAILED'))
error_message    TEXT
sent_at          TIMESTAMPTZ
created_at       TIMESTAMPTZ NOT NULL DEFAULT now()

INDEX (tenant_id)
INDEX (tenant_id, event_id)
INDEX (tenant_id, recipient_email)
```

`notification.processed_events`:
```sql
event_id    UUID PRIMARY KEY         ← dedup key
event_name  VARCHAR(100) NOT NULL
processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Acceptance criteria:**
- [ ] Every email attempt (via `IEmailSender`) is followed by a `NotificationLog` insert (SENT or FAILED)
- [ ] Failed email attempt logs `error_message` from the exception
- [ ] `processed_events.event_id` PRIMARY KEY prevents duplicate processing across all handlers
- [ ] Migration and revert run cleanly
- [ ] Integration test: deliver same event twice → `processed_events` has 1 row → `notification_logs` has 1 row

**Dependencies:** M00-S07

---

### M11-S03 — SendGrid adapter + MailHog local adapter

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § email, `docs/05-BOUNDED_CONTEXTS.md` § Notification context

**Description:**  
Implement the production `SendGridEmailAdapter` and the local dev `MailhogEmailAdapter`, both implementing the `IEmailSender` port. The active adapter is selected via `NODE_ENV` / `EMAIL_ADAPTER` environment variable — no conditional logic in business code.

**`SendGridEmailAdapter`:**
- Uses `@sendgrid/mail` SDK
- Reads `SENDGRID_API_KEY` from env
- Reads `EMAIL_FROM` (sender address) from env
- `send(to, template, data)`:
  1. Render template via `NotificationTemplate.render(data)`
  2. Call SendGrid `sgMail.send({ to, from, subject, html })`
  3. On non-2xx response → throw `EmailDeliveryException`

**`MailhogEmailAdapter`:**
- Uses `nodemailer` SMTP transport
- Host: `localhost`, Port: `1025` (MailHog)
- Same interface as SendGrid adapter

**NestJS DI wiring:**
- `NotificationModule` uses a factory provider:
  - `NODE_ENV === 'production'` → `SendGridEmailAdapter`
  - Otherwise → `MailhogEmailAdapter`
- `IEmailSender` token is exported — no context imports the concrete class directly

**Pre-requisite before this story can be tested in staging:**
SendGrid requires the sender email address (`EMAIL_FROM`) to be verified before any email will send. This is a one-time manual step in the SendGrid dashboard (Settings → Sender Authentication → Single Sender Verification). Use the same email as the first tenant's admin email. Without this, all `send()` calls will return `403 Forbidden` from SendGrid even with a valid API key.

**Acceptance criteria:**
- [ ] Local dev: `send()` delivers email to MailHog (visible at `http://localhost:8025`)
- [ ] `SENDGRID_API_KEY` not set in production → application fails to start with clear error
- [ ] `SendGridEmailAdapter` throws `EmailDeliveryException` on 4xx/5xx response from SendGrid
- [ ] Switching `EMAIL_ADAPTER=mailhog` in env uses MailHog adapter without code changes
- [ ] Unit test: mock `IEmailSender` and assert `send()` is called with correct `to`, `subject`, `html`
- [ ] `SENDGRID_API_KEY` is never logged or included in error messages
- [ ] `EMAIL_FROM` value is documented in `apps/backend/.env.example` with a note: "must be verified in SendGrid dashboard before staging emails will work"

**Dependencies:** M11-S01, M04-S05

---

### M11-S04 — Cron endpoint + UC-018/019/020: Reminder jobs

**Agent:** `backend-ts`  
**Complexity:** L  
**Docs to load:** `docs/04-USE_CASES.md` § UC-018, UC-019, UC-020, `docs/23-INFRASTRUCTURE_SETUP.md` § Cloud Scheduler cron jobs

**Description:**  
Implement the `POST /cron/reminders` endpoint that runs every 30 minutes and processes reminder emails for tenants whose local time is currently 06:00. This single endpoint handles UC-018 (admin daily digest), UC-019 (customer day-before reminder), and UC-020 (customer day-of reminder).

**Algorithm:**
1. Load all active tenants with their `timezone` setting
2. For each tenant, convert `now()` to tenant local time
3. If tenant local time is between 06:00 and 06:29 (within the 30-min window):
   a. **UC-018 (Admin digest):** Find all APPROVED bookings for today → emit `AdminDailyScheduleReminder`
   b. **UC-019 (Day-before):** Find APPROVED bookings for tomorrow → emit `BookingReminderDue` per booking
   c. **UC-020 (Day-of):** Find APPROVED bookings for today → emit `BookingReminderDueToday` per booking
4. Process is idempotent — re-running within the same 30-min window emits events but handlers deduplicate on `eventId`

**Endpoint security:** Protected by a shared secret (`CRON_SECRET` header) — not authenticated via JWT.

**Acceptance criteria:**
- [ ] Endpoint processes only tenants whose local time is 06:00–06:29
- [ ] A tenant with `timezone=America/Sao_Paulo` at local 06:00 is processed; at 07:00 it is not
- [ ] `AdminDailyScheduleReminder` is emitted once per eligible tenant
- [ ] `BookingReminderDue` is emitted once per APPROVED booking scheduled for tomorrow
- [ ] `BookingReminderDueToday` is emitted once per APPROVED booking scheduled for today
- [ ] Request without `CRON_SECRET` header returns `401`
- [ ] Integration test: create tenant + booking → mock clock to 06:00 tenant local → call endpoint → assert events emitted

**Dependencies:** M07-S03, M02-S03

---

### M11-S05 — Notification consumers for reminder events

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § BookingReminderDue, BookingReminderDueToday, AdminDailyScheduleReminder

**Description:**  
Implement the 3 Notification context consumers for reminder events. All emails in pt-BR.

**`BookingReminderDueHandler`** (day-before):
- Recipient: customer email
- Subject: `"Lembrete: seu agendamento é amanhã!"`
- Body: service names, date, time (tenant timezone), address if applicable

**`BookingReminderDueTodayHandler`** (day-of):
- Recipient: customer email
- Subject: `"Lembrete: seu agendamento é hoje!"`
- Body: service names, time (tenant timezone), "estamos esperando você"

**`AdminDailyScheduleReminderHandler`**:
- Recipient: all MANAGER emails for the tenant
- Subject: `"Agenda do dia — [date in pt-BR format]"`
- Body: table of today's APPROVED bookings (time, customer name, services, duration)

**Acceptance criteria:**
- [ ] Each event triggers the correct email to the correct recipient
- [ ] Admin digest email lists all of today's approved bookings in chronological order
- [ ] Times displayed in tenant timezone (not UTC)
- [ ] All 3 handlers are idempotent on `eventId`
- [ ] If tenant has no bookings today, admin digest email says `"Nenhum agendamento para hoje"` (not a blank email)
- [ ] MailHog shows the correct email for each handler in integration tests

**Dependencies:** M11-S04, M11-S03

---

### M11-S06 — PointsExpiringSoon cron + notification consumer

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § loyalty expiry warning, `docs/03-DOMAIN_EVENTS.md` § PointsExpiringSoon

**Description:**  
Implement the weekly loyalty expiry warning: every Monday at 06:00 UTC, find customers who have loyalty points expiring within the next 7 days (configurable via `settings.loyalty.expiry_warning_days`) and send them a warning email.

**Cron endpoint:** `POST /cron/loyalty-expiry`
- Protected by `CRON_SECRET` header
- Algorithm:
  1. For each active tenant:
     - Load `expiry_warning_days` from tenant settings (default 7)
     - Find all `LoyaltyEntry` rows where `expires_at BETWEEN now() AND now() + expiry_warning_days days`
     - Group by `customer_id`
     - For each customer with expiring points → emit `PointsExpiringSoon`

**`PointsExpiringSoonHandler`** (Notification consumer):
- Recipient: customer email
- Subject: `"Seus pontos de fidelidade estão prestes a expirar!"`
- Body: points amount + expiry date + "utilize em seu próximo agendamento"

**Acceptance criteria:**
- [ ] Endpoint processes all tenants with expiring loyalty entries
- [ ] `expiry_warning_days` is read from `tenants.settings.loyalty.expiry_warning_days` (default 7)
- [ ] Customer with 0 expiring points is NOT emailed
- [ ] `PointsExpiringSoon` event payload contains `pointsExpiringSoon`, `earliestExpiresAt`, `customerId`
- [ ] Email appears in MailHog with correct subject in pt-BR
- [ ] Handler is idempotent on `eventId`

**Dependencies:** M10-S03, M11-S03, M11-S04

---

### M11-S07 — Refactor all notification handlers to use full template + log system

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § Notification context

**Description:**  
Upgrade all existing notification handlers (from M04-S05, M07-S06, M08-S05, M09-S04, M10-S06) to use the full `NotificationTemplate` system from M11-S01 and the `NotificationLog` from M11-S02. The temporary hardcoded pt-BR strings from earlier milestones must be replaced with rendered templates from the DB.

**Changes per handler:**
1. Load `NotificationTemplate` by `(tenantId, eventName)`
2. Call `template.render(variables)` to get `{ subject, html }`
3. Call `IEmailSender.send(to, { subject, html })`
4. Persist `NotificationLog.recordSent()` or `NotificationLog.recordFailed()`
5. Persist `processed_events` row for idempotency

**Acceptance criteria:**
- [ ] All notification handlers use `NotificationTemplate` (no hardcoded subject strings)
- [ ] If a template is not found for a `(tenantId, eventName)` pair → log warning + skip email (do not throw)
- [ ] Every email attempt (success or failure) produces a `notification_logs` row
- [ ] `processed_events` prevents duplicate handling across all handlers
- [ ] Existing integration tests from M04, M07, M08, M09, M10 still pass after refactor

**Dependencies:** M11-S01, M11-S02, M11-S03

---

### M11-S08 — Dead letter queue handling for Pub/Sub

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § event bus, `docs/09-CI_CD_PIPELINE.md` § event reliability

**Description:**  
Implement the dead-letter queue (DLQ) handler for Pub/Sub. When a message fails processing more than 5 times (configurable), Pub/Sub delivers it to the DLQ subscription. A handler logs these failed messages as CRITICAL alerts so they can be investigated without being silently lost.

**What to create:**
- `DeadLetterHandler` — subscribes to the `beloauto-events-dead-letter` subscription
- Logs each DLQ message at ERROR level with full context: `eventId`, `eventName`, `tenantId`, `deliveryAttempt`
- Persists a `NotificationLog` record with `status=FAILED`, `errorMessage=<dlq reason>`
- Does NOT retry — DLQ messages require human investigation

**Acceptance criteria:**
- [ ] A message that fails 5 times is routed to the DLQ subscription (configured in Pub/Sub emulator)
- [ ] `DeadLetterHandler` logs the event at ERROR level with all required context fields
- [ ] A `NotificationLog` row with `status=FAILED` is created for DLQ messages
- [ ] DLQ messages are ACKed after logging (to prevent infinite DLQ redelivery)
