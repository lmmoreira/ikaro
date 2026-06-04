import { SendBookingApprovedNotificationDto } from '../../../contexts/notification/application/dtos/send-booking-approved-notification.dto';

export class SendBookingApprovedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0001-4000-8000-000000000001';
  private eventId = 'cccccccc-0001-4000-8000-000000000001';
  private readonly correlationId = 'corr-approved-1';
  private contactEmail = 'joao@example.com';
  private readonly contactName = 'João Silva';
  private readonly approvedSlot = {
    startTime: '2026-06-15T16:00:00.000Z',
    endTime: '2026-06-15T17:00:00.000Z',
  };
  private readonly totalPrice = { amount: '150.00', currency: 'BRL' };
  private readonly lineSummary = [
    {
      serviceNameAtBooking: 'Lavagem Completa',
      priceAtBooking: { amount: '100.00', currency: 'BRL' },
    },
    { serviceNameAtBooking: 'Polimento', priceAtBooking: { amount: '50.00', currency: 'BRL' } },
  ];

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withContactEmail(contactEmail: string): this {
    this.contactEmail = contactEmail;
    return this;
  }

  build(): SendBookingApprovedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      approvedSlot: this.approvedSlot,
      totalPrice: this.totalPrice,
      lineSummary: this.lineSummary,
    };
  }
}
