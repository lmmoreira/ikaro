import { DomainEvent } from '../../../../shared/domain/domain-event';

interface BookingApprovedData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  contactEmail: string;
  contactName: string;
  approvedSlot: { startTime: string; endTime: string };
  totalPrice: { amount: string; currency: string };
  lineSummary: {
    serviceId: string;
    serviceNameAtBooking: string;
    priceAtBooking: { amount: string; currency: string };
  }[];
  approvedBy: string;
}

export class BookingApproved extends DomainEvent<BookingApprovedData> {
  readonly eventName = 'BookingApproved';
  readonly eventVersion = 1;
  readonly data: BookingApprovedData;

  constructor(tenantId: string, correlationId: string, data: BookingApprovedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
