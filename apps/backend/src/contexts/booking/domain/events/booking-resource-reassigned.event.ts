import { DomainEvent } from '../../../../shared/domain/domain-event';

interface BookingResourceReassignedLineSummary {
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: string; currency: string };
}

interface BookingResourceReassignedData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  contactEmail: string;
  contactName: string;
  slot: { startTime: string; endTime: string };
  lineSummary: BookingResourceReassignedLineSummary[];
  reassignedBy: string;
  // Set only when every affected line's requirement discloses the resource to the customer
  // (CUSTOMER_CHOICE, AUTO_ANY — UC-062/063); null otherwise. There is deliberately no `reason`:
  // the manager's note is internal and never reaches the customer (M23-S23).
  newResourceName: string | null;
}

// UC-077 REASSIGN — a manager moved a booking to another resource at the same time. The time,
// price and status are unchanged, so no BookingRescheduled is published; Notification emails the
// customer from the booking's own contact snapshot.
export class BookingResourceReassigned extends DomainEvent<BookingResourceReassignedData> {
  readonly eventVersion = 1;
  readonly data: BookingResourceReassignedData;

  constructor(tenantId: string, correlationId: string, data: BookingResourceReassignedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
