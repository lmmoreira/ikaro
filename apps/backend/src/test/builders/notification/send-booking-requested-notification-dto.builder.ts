import { SendBookingRequestedNotificationDto } from '../../../contexts/notification/application/dtos/send-booking-requested-notification.dto';

export class SendBookingRequestedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private eventId = 'cccccccc-0000-4000-8000-000000000001';
  private readonly correlationId = 'corr-1';
  private readonly contactEmail = 'joao@example.com';
  private readonly contactName = 'João Silva';
  private readonly scheduledAt = '2026-06-15T13:00:00.000Z';
  private readonly totalPrice = { amount: '150.00', currency: 'BRL' };
  private readonly lines = [
    { serviceNameAtBooking: 'Lavagem Completa' },
    { serviceNameAtBooking: 'Polimento' },
  ];
  private readonly pickupAddress = null;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  build(): SendBookingRequestedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      scheduledAt: this.scheduledAt,
      totalPrice: this.totalPrice,
      lines: this.lines,
      pickupAddress: this.pickupAddress,
    };
  }
}
