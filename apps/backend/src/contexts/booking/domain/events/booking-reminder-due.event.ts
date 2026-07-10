import { DomainEvent } from '../../../../shared/domain/domain-event';

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

export class BookingReminderDue extends DomainEvent<BookingReminderDueData> {
  readonly eventVersion = 1;
  readonly data: BookingReminderDueData;

  constructor(tenantId: string, correlationId: string, data: BookingReminderDueData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
