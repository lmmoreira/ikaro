import { SendBookingInfoRequestedNotificationDto } from '../../../contexts/notification/application/dtos/send-booking-info-requested-notification.dto';

export class SendBookingInfoRequestedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0003-4000-8000-000000000001';
  private eventId = 'cccccccc-0003-4000-8000-000000000001';
  private readonly correlationId = 'corr-info-req-1';
  private bookingId = 'bbbbbbbb-0003-4000-8000-000000000001';
  private customerId: string | null = null;
  private readonly contactEmail = 'joao@example.com';
  private readonly contactName = 'João Silva';
  private readonly informationNeeded = 'Por favor envie fotos melhores do veículo';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withBookingId(bookingId: string): this {
    this.bookingId = bookingId;
    return this;
  }

  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }

  build(): SendBookingInfoRequestedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      bookingId: this.bookingId,
      customerId: this.customerId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      informationNeeded: this.informationNeeded,
    };
  }
}
