import { Command } from '../../../../shared/domain/command';

interface ReminderLine {
  serviceId: string;
  serviceName: string;
}

interface BookingReminderDueTodayData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  recipientEmail: string;
  customerName: string;
  scheduledAt: string;
  appointmentSlot: { startTime: string; endTime: string };
  lines: ReminderLine[];
}

// A Command, not a fact — see booking-reminder-due.command.ts for the full rationale (same shape,
// one calendar day earlier: "today" instead of "tomorrow").
export class BookingReminderDueToday extends Command<BookingReminderDueTodayData> {
  readonly eventVersion = 1;
  readonly data: BookingReminderDueTodayData;

  constructor(
    tenantId: string,
    correlationId: string,
    data: BookingReminderDueTodayData,
    localDate: string,
  ) {
    super(
      tenantId,
      correlationId,
      `BookingReminderDueToday:${tenantId}:${data.bookingId}:${localDate}`,
    );
    this.data = data;
  }
}
