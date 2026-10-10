import { BookingNoShow } from '../../../contexts/booking/domain/events/booking-no-show.event';

export class BookingNoShowEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-no-show-1';
  private readonly bookingId = 'dddddddd-0003-4000-8000-000000000001';
  private readonly actorId = 'staffid-0000-4000-8000-000000000001';
  private reason: string | null = null;
  private readonly occurredAt = '2026-06-01T14:00:00.000Z';
  private customerId: string | null = 'cccccccc-0000-4000-8000-000000000001';
  private contactEmail = 'maria@example.com';
  private contactName = 'Maria Souza';
  private scheduledAt = '2026-06-01T12:00:00.000Z';
  private serviceNames = ['Lavagem completa'];

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

  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }

  withContactEmail(contactEmail: string): this {
    this.contactEmail = contactEmail;
    return this;
  }

  withContactName(contactName: string): this {
    this.contactName = contactName;
    return this;
  }

  withScheduledAt(scheduledAt: string): this {
    this.scheduledAt = scheduledAt;
    return this;
  }

  withServiceNames(serviceNames: string[]): this {
    this.serviceNames = serviceNames;
    return this;
  }

  build(): BookingNoShow {
    return new BookingNoShow(this.tenantId, this.correlationId, {
      bookingId: this.bookingId,
      actorId: this.actorId,
      reason: this.reason,
      occurredAt: this.occurredAt,
      customerId: this.customerId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      scheduledAt: this.scheduledAt,
      lineSummary: this.serviceNames.map((serviceNameAtBooking, i) => ({
        serviceId: `eeeeeeee-0000-4000-8000-00000000000${i + 1}`,
        serviceNameAtBooking,
        priceAtBooking: { amount: '50.00', currency: 'BRL' },
      })),
    });
  }
}
