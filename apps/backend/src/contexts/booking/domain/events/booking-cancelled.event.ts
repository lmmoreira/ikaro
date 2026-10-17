import { DomainEvent } from '../../../../shared/domain/domain-event';

interface BookingCancelledLineSummary {
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: string; currency: string };
}

interface BookingCancelledData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  contactEmail: string;
  contactName: string;
  // Null when the system cancelled it (an unanswered manual-approval request, TD51).
  cancelledBy: string | null;
  isBusiness: boolean;
  reason: string | null;
  scheduledAt: string;
  lineSummary: BookingCancelledLineSummary[];
  totalPrice: { amount: string; currency: string };
  // True only for the occurrences cancelled when a recurring schedule is ended (M23-S28): the
  // schedule's own RecurringBookingScheduleEnded email replaces one cancellation email each.
  cancelledByScheduleEnd: boolean;
  // True only when a PENDING manual-approval booking's hold ran out unanswered (TD51): a dedicated
  // customer email replaces the generic one and managers get none.
  cancelledByHoldExpiry: boolean;
}

export class BookingCancelled extends DomainEvent<BookingCancelledData> {
  readonly eventVersion = 1;
  readonly data: BookingCancelledData;

  constructor(tenantId: string, correlationId: string, data: BookingCancelledData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
