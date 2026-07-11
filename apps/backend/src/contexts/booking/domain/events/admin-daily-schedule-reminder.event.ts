import { Command } from '../../../../shared/domain/command';

interface ReminderLine {
  serviceId: string;
  serviceName: string;
}

interface DigestBooking {
  bookingId: string;
  customerName: string;
  customerPhone: string | null;
  lines: ReminderLine[];
  appointmentSlot: { startTime: string; endTime: string };
  adminNotes: string | null;
}

interface AdminDailyScheduleReminderData extends Record<string, unknown> {
  localDate: string;
  bookingsToday: DigestBooking[];
  totalBookingsToday: number;
}

// A Command, not a fact (TD24-S03): no state change, one digest per tenant per tenant-local day.
// dedupKey derives from data.localDate (already computed by AdminScheduleReminderJob for its own
// query window) rather than a separate constructor param, since the date is already part of the
// payload every consumer sees.
export class AdminDailyScheduleReminder extends Command<AdminDailyScheduleReminderData> {
  readonly eventVersion = 1;
  readonly data: AdminDailyScheduleReminderData;

  constructor(tenantId: string, correlationId: string, data: AdminDailyScheduleReminderData) {
    super(tenantId, correlationId, `AdminDailyScheduleReminder:${tenantId}:${data.localDate}`);
    this.data = data;
  }
}
