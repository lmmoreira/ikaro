import { DomainEvent } from '../../../../shared/domain/domain-event';

// UC-074 — an appointment was recorded as a no-show after its scheduled end time. Loyalty does
// NOT consume this event (no points for a no-show). Notification emails the customer from the
// booking's own contact snapshot (M23-S25), never showing `reason`, which is an internal note. A
// manager's correction of a no-show publishes BookingCompleted, never a second BookingNoShow.
interface BookingNoShowLineSummary {
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: string; currency: string };
}

interface BookingNoShowData extends Record<string, unknown> {
  bookingId: string;
  actorId: string;
  reason: string | null;
  occurredAt: string;
  customerId: string | null;
  contactEmail: string;
  contactName: string;
  scheduledAt: string;
  lineSummary: BookingNoShowLineSummary[];
}

export class BookingNoShow extends DomainEvent<BookingNoShowData> {
  readonly eventVersion = 1;
  readonly data: BookingNoShowData;

  constructor(tenantId: string, correlationId: string, data: BookingNoShowData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
