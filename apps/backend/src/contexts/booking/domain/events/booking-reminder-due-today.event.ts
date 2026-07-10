import { DomainEvent } from '../../../../shared/domain/domain-event';

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

export class BookingReminderDueToday extends DomainEvent<BookingReminderDueTodayData> {
  readonly eventVersion = 1;
  readonly data: BookingReminderDueTodayData;

  constructor(tenantId: string, correlationId: string, data: BookingReminderDueTodayData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
