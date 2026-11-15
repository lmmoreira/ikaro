import { SendTenantUnavailableNoticeNotificationDto } from '../../../contexts/notification/application/dtos/send-tenant-unavailable-notice-notification.dto';

export class SendTenantUnavailableNoticeNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002801';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002801';
  private correlationId = 'corr-0000-4000-8000-000000002801';
  private customerId = 'cccccccc-0000-4000-8000-000000002801';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  build(): SendTenantUnavailableNoticeNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      customerId: this.customerId,
    };
  }
}
