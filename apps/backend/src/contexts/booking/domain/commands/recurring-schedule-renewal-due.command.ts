import { Command } from '../../../../shared/domain/command';

interface RecurringScheduleRenewalDueData extends Record<string, unknown> {
  recurringScheduleId: string;
  customerId: string;
  serviceId: string;
  // The schedule's pattern, as the email describes it: weekday names, tenant-local HH:mm and the
  // YYYY-MM-DD term.
  daysOfWeek: string[];
  startTime: string;
  startsOn: string;
  endsOn: string;
}

// A Command, not a fact (TD24-S03): nothing changes state (the schedule stays ACTIVE) — it is an
// instruction to send a reminder, derived by a scheduled scan that a retried or overlapping cron
// tick can legitimately re-derive for the same schedule. dedupKey is keyed on the tenant-local date
// the job's run considered "today", computed once per tenant by RecurringScheduleRenewalReminderJob
// before its per-schedule loop — never recomputed here, so a run straddling midnight cannot mint
// two keys for one logical run. Carries ids, not the customer's email: the notification use case
// resolves the recipient, like every other recurring-schedule email (M23-S28).
export class RecurringScheduleRenewalDue extends Command<RecurringScheduleRenewalDueData> {
  readonly eventVersion = 1;
  readonly data: RecurringScheduleRenewalDueData;

  constructor(
    tenantId: string,
    correlationId: string,
    data: RecurringScheduleRenewalDueData,
    localDate: string,
  ) {
    super(
      tenantId,
      correlationId,
      `RecurringScheduleRenewalDue:${tenantId}:${data.recurringScheduleId}:${localDate}`,
    );
    this.data = data;
  }
}
