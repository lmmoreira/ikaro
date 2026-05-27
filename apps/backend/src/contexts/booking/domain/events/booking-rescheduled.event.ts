import { DomainEvent } from '../../../../shared/domain/domain-event';

interface BookingRescheduledLineSummary {
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: string; currency: string };
}

interface BookingRescheduledData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  guestEmail: string;
  guestName: string;
  newSlot: { startTime: string; endTime: string };
  previousSlot: { startTime: string; endTime: string };
  rescheduledBy: string;
  adminNotes: string | null;
  lineSummary: BookingRescheduledLineSummary[];
  totalPrice: { amount: string; currency: string };
}

export class BookingRescheduled extends DomainEvent<BookingRescheduledData> {
  readonly eventName = 'BookingRescheduled';
  readonly eventVersion = 1;
  readonly data: BookingRescheduledData;

  constructor(tenantId: string, correlationId: string, data: BookingRescheduledData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
