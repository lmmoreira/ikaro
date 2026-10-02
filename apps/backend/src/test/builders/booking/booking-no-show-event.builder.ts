import { BookingNoShow } from '../../../contexts/booking/domain/events/booking-no-show.event';

export class BookingNoShowEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-no-show-1';
  private readonly bookingId = 'dddddddd-0003-4000-8000-000000000001';
  private readonly actorId = 'staffid-0000-4000-8000-000000000001';
  private reason: string | null = null;
  private readonly occurredAt = '2026-06-01T14:00:00.000Z';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withReason(reason: string | null): this {
    this.reason = reason;
    return this;
  }

  build(): BookingNoShow {
    return new BookingNoShow(this.tenantId, this.correlationId, {
      bookingId: this.bookingId,
      actorId: this.actorId,
      reason: this.reason,
      occurredAt: this.occurredAt,
    });
  }
}
