import { BookingRescheduled } from '../../../contexts/booking/domain/events/booking-rescheduled.event';

export class BookingRescheduledEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-rescheduled-1';
  private readonly bookingId = 'dddddddd-0003-4000-8000-000000000001';
  private customerId: string | null = null;
  private contactEmail = 'joao@example.com';
  private readonly contactName = 'João Silva';
  private readonly lineSummary = [
    {
      serviceId: 'ffffffff-0001-4000-8000-000000000001',
      serviceNameAtBooking: 'Lavagem Completa',
      priceAtBooking: { amount: '150.00', currency: 'BRL' },
    },
  ];
  private readonly totalPrice = { amount: '150.00', currency: 'BRL' };
  private readonly previousSlot = {
    startTime: '2026-07-01T10:00:00.000Z',
    endTime: '2026-07-01T11:00:00.000Z',
  };
  private readonly newSlot = {
    startTime: '2026-07-07T10:00:00.000Z',
    endTime: '2026-07-07T11:00:00.000Z',
  };
  private readonly rescheduledBy = 'staffid-0000-4000-8000-000000000001';
  private adminNotes: string | null = null;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withAdminNotes(adminNotes: string | null): this {
    this.adminNotes = adminNotes;
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

  build(): BookingRescheduled {
    return new BookingRescheduled(this.tenantId, this.correlationId, {
      bookingId: this.bookingId,
      customerId: this.customerId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      previousSlot: this.previousSlot,
      newSlot: this.newSlot,
      rescheduledBy: this.rescheduledBy,
      adminNotes: this.adminNotes,
      lineSummary: this.lineSummary,
      totalPrice: this.totalPrice,
    });
  }
}
