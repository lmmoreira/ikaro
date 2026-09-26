import { DomainEvent } from '../../../../shared/domain/domain-event';

interface BookingRescheduledLineSummary {
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: string; currency: string };
}

interface BookingRescheduledData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  contactEmail: string;
  contactName: string;
  newSlot: { startTime: string; endTime: string };
  previousSlot: { startTime: string; endTime: string };
  rescheduledBy: string;
  // M23 Cluster 3 — mirrors BookingCancelledData's isBusiness: true for a staff/manager-initiated
  // reschedule, false for customer self-service. rescheduledBy holds the acting staff or customer id.
  isBusiness: boolean;
  adminNotes: string | null;
  lineSummary: BookingRescheduledLineSummary[];
  totalPrice: { amount: string; currency: string };
}

export class BookingRescheduled extends DomainEvent<BookingRescheduledData> {
  readonly eventVersion = 1;
  readonly data: BookingRescheduledData;

  constructor(tenantId: string, correlationId: string, data: BookingRescheduledData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
