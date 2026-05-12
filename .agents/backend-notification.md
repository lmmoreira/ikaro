# Backend Agent — Notification Context

You implement domain logic and use cases for the Notification bounded context.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/notification/
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/04-USE_CASES.md` — UC-018, UC-019, UC-020
- `docs/02-DOMAIN_MODEL.md` — NotificationTemplate, NotificationLog
- `docs/03-DOMAIN_EVENTS.md` — events this context subscribes to

---

## Folder Structure You Must Follow

```
apps/backend/src/contexts/notification/
├── domain/
│   ├── entities/           # NotificationTemplate, NotificationLog
│   └── services/           # NotificationDomainService
├── application/
│   ├── use-cases/          # SendEmailUseCase
│   ├── ports/              # IEmailSender, INotificationTemplateRepository
│   └── dtos/
└── infrastructure/
    ├── persistence/         # TypeOrmNotificationRepository
    ├── adapters/            # SendGridEmailSender (implements IEmailSender)
    └── event-handlers/      # All event handlers live here
```

---

## Events This Context Subscribes To

| Event | Triggers |
|---|---|
| `BookingApproved` | Confirmation email to customer |
| `BookingRejected` | Rejection email to customer |
| `BookingCancelled` | Cancellation email to customer |
| `BookingRescheduled` | Reschedule email to customer |
| `BookingInfoRequested` | Info request email to customer |
| `BookingReminderDue` | Day-before reminder email (UC-019) |
| `BookingReminderDueToday` | Day-of reminder email (UC-020) |
| `AdminDailyScheduleReminder` | Daily schedule email to admin (UC-018) |
| `StaffInvited` | Invite email to new staff member |
| `ServicePointsEarned` | Points earned notification to customer |
| `PointsExpiringSoon` | Points expiry warning to customer |

---

## Critical Rules

### Language
All customer-facing email templates must be in **pt-BR**.
No English copy in any template body. No exceptions.

### Template ownership
Templates are per-tenant aggregates (`NotificationTemplate`).
Never use the same template body for all tenants — each tenant has their own copy.

### Email adapter
Use the `IEmailSender` port. The production adapter is `SendGridEmailSender`.
Never call SendGrid directly from use cases or event handlers — always through the port.

### Logging
Every sent or failed email must produce a `NotificationLog` entry.
Events published: `EmailSent`, `EmailFailed`.

### Idempotency
Event handlers must be idempotent. Use the `eventId` from the incoming event
to deduplicate. If a `NotificationLog` already exists for that `eventId`, skip.

---

## Email Adapter Pattern

```typescript
// Port (application layer — never changes)
export interface IEmailSender {
  send(params: SendEmailParams): Promise<void>;
}

// Adapter (infrastructure layer — swappable)
@Injectable()
export class SendGridEmailSender implements IEmailSender {
  async send(params: SendEmailParams): Promise<void> {
    // Call SendGrid API
  }
}
```

---

## Money Display

If any email template shows a price:
- Format: `R$ 1.234,56` (BRL, pt-BR locale)
- Never display as a plain number

---

## Invariants (non-negotiable)

- Every query filters by `tenant_id`
- All copy in pt-BR — no English in customer-facing templates
- Templates are per-tenant — never shared across tenants
- Every email send/fail logged as `NotificationLog`
- Idempotency via `eventId` deduplication
- `IEmailSender` port only — no direct SendGrid calls in use cases
- No synchronous cross-context calls — subscribe to events
- No import from other context paths
- No `any`, no `@ts-ignore`

---

## Self-Check Before Opening PR

```
□ Every repository query filters by tenant_id
□ All template copy is in pt-BR
□ Templates are per-tenant (not global/shared)
□ Every send attempt creates a NotificationLog entry
□ Event handlers deduplicate via eventId
□ IEmailSender port used — no direct SendGrid calls in application layer
□ Money displayed as R$ 1.234,56 if shown
□ No imports from other context paths
□ Functions ≤ 20 lines, classes ≤ 200 lines
□ No 'any', no @ts-ignore
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (backend-notification)`
