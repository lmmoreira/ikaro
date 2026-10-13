import { BookingResourceReassigned } from '../../../contexts/booking/domain/events/booking-resource-reassigned.event';

export class BookingResourceReassignedEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-reassigned-1';
  private readonly bookingId = 'dddddddd-0003-4000-8000-000000000001';
  private customerId: string | null = 'cccccccc-0000-4000-8000-000000000001';
  private contactEmail = 'maria@example.com';
  private contactName = 'Maria Souza';
  private readonly slot = {
    startTime: '2026-07-07T13:00:00.000Z',
    endTime: '2026-07-07T14:00:00.000Z',
  };
  private serviceNames = ['Lavagem completa'];
  private readonly reassignedBy = 'staffid-0000-4000-8000-000000000001';
  private newResourceName: string | null = 'Sala 2';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
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

  withServiceNames(serviceNames: string[]): this {
    this.serviceNames = serviceNames;
    return this;
  }

  withNewResourceName(newResourceName: string | null): this {
    this.newResourceName = newResourceName;
    return this;
  }

  build(): BookingResourceReassigned {
    return new BookingResourceReassigned(this.tenantId, this.correlationId, {
      bookingId: this.bookingId,
      customerId: this.customerId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      slot: this.slot,
      lineSummary: this.serviceNames.map((serviceNameAtBooking, i) => ({
        serviceId: `eeeeeeee-0000-4000-8000-00000000000${i + 1}`,
        serviceNameAtBooking,
        priceAtBooking: { amount: '50.00', currency: 'BRL' },
      })),
      reassignedBy: this.reassignedBy,
      newResourceName: this.newResourceName,
    });
  }
}
