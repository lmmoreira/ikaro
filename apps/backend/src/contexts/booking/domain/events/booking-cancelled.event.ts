import { DomainEvent } from '../../../../shared/domain/domain-event';

interface BookingCancelledLineSummary {
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: string; currency: string };
}

interface BookingCancelledData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  guestEmail: string;
  guestName: string;
  cancelledBy: string;
  isBusiness: boolean;
  reason: string | null;
  scheduledAt: string;
  lineSummary: BookingCancelledLineSummary[];
  totalPrice: { amount: string; currency: string };
}

export class BookingCancelled extends DomainEvent<BookingCancelledData> {
  readonly eventName = 'BookingCancelled';
  readonly eventVersion = 1;
  readonly data: BookingCancelledData;

  constructor(tenantId: string, correlationId: string, data: BookingCancelledData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
