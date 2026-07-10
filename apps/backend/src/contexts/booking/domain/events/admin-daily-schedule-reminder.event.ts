import { DomainEvent } from '../../../../shared/domain/domain-event';

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

export class AdminDailyScheduleReminder extends DomainEvent<AdminDailyScheduleReminderData> {
  readonly eventVersion = 1;
  readonly data: AdminDailyScheduleReminderData;

  constructor(tenantId: string, correlationId: string, data: AdminDailyScheduleReminderData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
