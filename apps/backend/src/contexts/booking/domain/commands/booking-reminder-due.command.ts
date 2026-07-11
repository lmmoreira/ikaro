import { Command } from '../../../../shared/domain/command';

interface ReminderLine {
  serviceId: string;
  serviceName: string;
}

interface BookingReminderDueData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  recipientEmail: string;
  customerName: string;
  scheduledAt: string;
  appointmentSlot: { startTime: string; endTime: string };
  lines: ReminderLine[];
}

// A Command, not a fact (TD24-S03): no state change results from this (the booking stays
// APPROVED) — it's an instruction to send a reminder, derived by a scheduled scan that a
// retried/overlapping cron tick can legitimately re-derive for the same booking. dedupKey is
// keyed on the tenant-local calendar date the job's run considered "tomorrow" for this booking
// (localDate), computed once per tenant by BookingReminderJob before its per-booking loop — never
// recomputed independently here, so a run straddling midnight can't mint two keys for one
// logical run.
export class BookingReminderDue extends Command<BookingReminderDueData> {
  readonly eventVersion = 1;
  readonly data: BookingReminderDueData;

  constructor(
    tenantId: string,
    correlationId: string,
    data: BookingReminderDueData,
    localDate: string,
  ) {
    super(tenantId, correlationId, `BookingReminderDue:${tenantId}:${data.bookingId}:${localDate}`);
    this.data = data;
  }
}
