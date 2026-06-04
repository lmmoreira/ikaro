import { SendBookingRejectedNotificationDto } from '../../../contexts/notification/application/dtos/send-booking-rejected-notification.dto';

export class SendBookingRejectedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0002-4000-8000-000000000001';
  private eventId = 'cccccccc-0002-4000-8000-000000000001';
  private readonly correlationId = 'corr-rejected-1';
  private readonly contactEmail = 'joao@example.com';
  private readonly contactName = 'João Silva';
  private readonly reason = 'Horário indisponível para os serviços selecionados';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  build(): SendBookingRejectedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      reason: this.reason,
    };
  }
}
