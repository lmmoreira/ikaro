import { BookingApproved } from '../../../contexts/booking/domain/events/booking-approved.event';

export class BookingApprovedEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-approved-1';
  private readonly bookingId = 'dddddddd-0001-4000-8000-000000000001';
  private customerId: string | null = null;
  private contactEmail = 'joao@example.com';
  private readonly contactName = 'João Silva';
  private readonly approvedSlot = {
    startTime: '2026-06-15T16:00:00.000Z',
    endTime: '2026-06-15T17:00:00.000Z',
  };
  private readonly totalPrice = { amount: '150.00', currency: 'BRL' };
  private readonly lineSummary = [
    {
      serviceId: 'ffffffff-0001-4000-8000-000000000001',
      serviceNameAtBooking: 'Lavagem Completa',
      priceAtBooking: { amount: '150.00', currency: 'BRL' },
    },
  ];
  private readonly approvedBy = 'staffid-0000-4000-8000-000000000001';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withContactEmail(contactEmail: string): this {
    this.contactEmail = contactEmail;
    return this;
  }

  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }

  build(): BookingApproved {
    return new BookingApproved(this.tenantId, this.correlationId, {
      bookingId: this.bookingId,
      customerId: this.customerId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      approvedSlot: this.approvedSlot,
      totalPrice: this.totalPrice,
      lineSummary: this.lineSummary,
      approvedBy: this.approvedBy,
    });
  }
}
