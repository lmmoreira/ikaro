import { SendBookingCancelledNotificationDto } from '../../../contexts/notification/application/dtos/send-booking-cancelled-notification.dto';

export class SendBookingCancelledNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private eventId = 'cccccccc-0001-4000-8000-000000000001';
  private readonly correlationId = 'corr-cancelled-1';
  private contactEmail = 'joao@example.com';
  private readonly contactName = 'João Silva';
  private cancelledBy = 'staffid-0000-4000-8000-000000000001';
  private isBusiness = true;
  private readonly reason: string | null = 'Unavailability';
  private readonly scheduledAt = '2026-07-01T13:00:00.000Z';
  private readonly lineSummary = [
    {
      serviceNameAtBooking: 'Lavagem Completa',
      priceAtBooking: { amount: '150.00', currency: 'BRL' },
    },
  ];
  private readonly totalPrice = { amount: '150.00', currency: 'BRL' };

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withIsBusiness(isBusiness: boolean): this {
    this.isBusiness = isBusiness;
    return this;
  }

  withCancelledBy(cancelledBy: string): this {
    this.cancelledBy = cancelledBy;
    return this;
  }

  withContactEmail(contactEmail: string): this {
    this.contactEmail = contactEmail;
    return this;
  }

  build(): SendBookingCancelledNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      cancelledBy: this.cancelledBy,
      isBusiness: this.isBusiness,
      reason: this.reason,
      scheduledAt: this.scheduledAt,
      lineSummary: this.lineSummary,
      totalPrice: this.totalPrice,
    };
  }
}
