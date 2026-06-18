# TD02 — Localization: Remove Hardcoded pt-BR Strings from Code

**Status:** Open  
**Priority:** Low (MVP is pt-BR only — no user-visible regressions today)  
**Effort estimate:** Medium (2–3 stories)  
**Affects:** `apps/backend/`, `packages/` (new)

---

## Problem

pt-BR user-visible strings are hardcoded directly in TypeScript source files: a migration SQL script, a use-case constant, and dozens of test assertions. This means:

- Changing any copy requires a code change (and a new migration for template bodies).
- Tests assert against raw pt-BR literals, making them brittle if wording changes.
- Adding a second locale (e.g. `en-US`) would require forking every hardcoded site.

---

## Inventory of Hardcoded Sites

### 1. Notification templates — migration SQL

**File:** `apps/backend/src/contexts/notification/infrastructure/migrations/1748100000010-CreateNotificationTemplates.ts`

All 12 default templates have their `subject` and `body` hardcoded inline in the `INSERT` statement. Examples:

| `trigger_event` | Hardcoded `subject` |
|---|---|
| `BookingRequested` (admin) | `'Novo agendamento recebido'` |
| `BookingRequested` (customer) | `'Solicitação de agendamento recebida'` |
| `BookingApproved` | `'Seu agendamento foi confirmado!'` |
| `BookingRejected` | `'Seu agendamento foi rejeitado'` |
| `BookingInfoRequested` | `'Precisamos de mais informações sobre seu agendamento'` |
| `BookingInfoSubmitted` | `'Cliente respondeu à solicitação de informações'` |
| `BookingCancelled` (customer) | `'Seu agendamento foi cancelado'` |
| `BookingCancelled` (admin) | `'Agendamento cancelado'` |
| `BookingRescheduled` (customer) | `'Seu agendamento foi reagendado'` |
| `BookingRescheduled` (admin) | `'Agendamento reagendado'` |
| `BookingReminderDue` | `'Lembrete: seu agendamento é amanhã!'` |
| `BookingReminderDueToday` | `'Lembrete: seu agendamento é hoje!'` |
| `AdminDailyScheduleReminder` | `'Agenda do dia'` |
| `ServicePointsEarned` | `'Você ganhou pontos de fidelidade!'` |
| `PointsExpiringSoon` | `'Seus pontos estão prestes a expirar'` |
| `StaffInvited` | `'Convite para equipe Ikaro'` |

HTML bodies contain inline pt-BR copy (`Olá,`, `Aguardamos sua visita!`, `Clique aqui para responder`, etc.).

### 2. Admin schedule table headers — use-case constant

**File:** `apps/backend/src/contexts/notification/application/use-cases/send-admin-daily-schedule-reminder-notification/send-admin-daily-schedule-reminder-notification.use-case.ts` line 109

```ts
return `<table><thead><tr>
  <th>Horário</th><th>Cliente</th><th>Telefone</th>
  <th>Serviços</th><th>Duração</th><th>Notas</th>
</tr></thead><tbody>${rows}</tbody></table>`;
```

### 3. `money-format.ts` — hardcoded locale + currency

**File:** `apps/backend/src/shared/utils/money-format.ts`

```ts
return Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
```

Locale and currency are hardcoded; should derive from tenant settings (`settings.language`, `settings.currency`).

### 4. `tenant-settings.vo.ts` — default language literal

**File:** `apps/backend/src/contexts/platform/domain/value-objects/tenant-settings.vo.ts` line 113

```ts
language: 'pt-BR',
```

This is an acceptable default value, not a user-visible string — low priority to change.

### 5. Notification unit specs — assertions on raw pt-BR subjects

All notification use-case specs assert literal subjects. Representative files:

| File | Asserted literal |
|---|---|
| `send-booking-rescheduled-notification.use-case.spec.ts` | `'Seu agendamento foi reagendado'`, `'Agendamento reagendado'` |
| `send-booking-cancelled-notification.use-case.spec.ts` | `'Seu agendamento foi cancelado'` |
| `send-booking-approved-notification.use-case.spec.ts` | `'Seu agendamento foi confirmado!'` |
| `send-booking-rejected-notification.use-case.spec.ts` | `'Seu agendamento foi rejeitado'` |
| `send-booking-requested-notification.use-case.spec.ts` | `'Novo agendamento recebido'` |
| `send-booking-info-submitted-notification.use-case.spec.ts` | `'Cliente respondeu à solicitação de informações'` |
| `send-booking-info-requested-notification.use-case.spec.ts` | `'Precisamos de mais informações...'` |
| `send-booking-reminder-due-notification.use-case.spec.ts` | `'Lembrete: seu agendamento é amanhã!'` |
| `send-booking-reminder-due-today-notification.use-case.spec.ts` | `'Lembrete: seu agendamento é hoje!'` |
| `send-admin-daily-schedule-reminder-notification.use-case.spec.ts` | `'Agenda do dia'`, `'Horário'`, `'Cliente'` |
| `send-staff-invitation.use-case.spec.ts` | `'Convite para equipe Ikaro'` |
| `seed-default-templates.use-case.spec.ts` | All subjects above |

### 6. Integration spec — partial subject matching

**File:** `apps/backend/src/contexts/notification/infrastructure/events/booking-full-workflow.handler.integration.spec.ts`

Uses `m.subject.includes('respondeu')`, `includes('cancelado')`, `includes('reagendado')` — brittle substring matches against pt-BR literals.

---

## Proposed Solution

### Package: `packages/i18n/`

Create a new pnpm workspace package containing locale JSON files:

```
packages/i18n/
├── locales/
│   └── pt-BR/
│       ├── notification-templates.json   # subject + body for every trigger_event × recipient
│       ├── email-table-headers.json      # admin schedule table column headers
│       └── common.json                   # shared phrases used across templates
└── index.ts                              # re-exports typed locale keys
```

### Port: `ILocalizationPort`

Add to `apps/backend/src/contexts/notification/application/ports/`:

```ts
export interface ILocalizationPort {
  getNotificationTemplate(event: string, recipient: 'customer' | 'admin', locale: string): { subject: string; body: string };
  getTableHeaders(tableKey: string, locale: string): Record<string, string>;
}
```

### Adapter: `JsonLocalizationAdapter`

Reads from `packages/i18n/locales/` at startup. Injected into notification use cases that currently hardcode strings.

### Migration default templates

The migration keeps the INSERT but reads subjects and bodies from the locale file at migration-run time (via a shared helper), rather than inlining the strings. This way the locale file is the single source of truth and the migration stays reproducible.

### Tests

Specs switch from asserting literal pt-BR strings to asserting locale keys or using the same `ILocalizationPort` test double, so a copy change doesn't break tests.

---

## What is NOT in scope

- Frontend copy (handled separately by Next.js `next-intl` or similar).
- Domain error messages — these are English-only by project rule (see CLAUDE.md §7).
- Currency formatting beyond what `money-format.ts` already encapsulates — that function is the right boundary; it just needs to accept locale/currency as params from tenant settings instead of hardcoding them.
- Multi-locale runtime switching — MVP stays pt-BR; the goal is extractability, not i18n routing.

---

## Acceptance Criteria (when stories are implemented)

- [ ] No pt-BR string literals in `.ts` files outside `packages/i18n/locales/`.
- [ ] `packages/i18n/pt-BR/notification-templates.json` is the single source for all default template subjects and bodies.
- [ ] Notification use-case unit specs assert against locale keys (or a test double that returns predictable strings), not raw pt-BR copy.
- [ ] `money-format.ts` accepts `locale` and `currency` params; callers pass values from `tenantSettings`.
- [ ] `send-admin-daily-schedule-reminder` table headers read from locale file.
- [ ] All CI gates pass.
