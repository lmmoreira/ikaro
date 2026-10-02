import { DomainEvent } from '../../../../shared/domain/domain-event';

// UC-074 — an appointment was recorded as a no-show after its scheduled end time. Loyalty does
// NOT consume this event (no points for a no-show). M23-S09 ships an audit-log-only consumer; the
// customer email (and the contact fields it needs) arrives with M23-S25. A manager's correction of
// a no-show publishes BookingCompleted, never a second BookingNoShow.
interface BookingNoShowData extends Record<string, unknown> {
  bookingId: string;
  actorId: string;
  reason: string | null;
  occurredAt: string;
}

export class BookingNoShow extends DomainEvent<BookingNoShowData> {
  readonly eventVersion = 1;
  readonly data: BookingNoShowData;

  constructor(tenantId: string, correlationId: string, data: BookingNoShowData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
