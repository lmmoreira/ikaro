import { SendBookingReminderDueNotificationDto } from '../../../contexts/notification/application/dtos/send-booking-reminder-due-notification.dto';

export class SendBookingReminderDueNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private eventId = 'eeeeeeee-0010-4000-8000-000000000001';
  private readonly correlationId = 'corr-reminder-due-1';
  private recipientEmail = 'joao@example.com';
  private customerName = 'João Silva';
  private scheduledAt = '2026-07-02T13:00:00.000Z';
  private readonly appointmentSlot = {
    startTime: '2026-07-02T13:00:00.000Z',
    endTime: '2026-07-02T14:00:00.000Z',
  };
  private readonly lines = [{ serviceId: 'ssss-0001', serviceName: 'Lavagem Completa' }];

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withRecipientEmail(email: string): this {
    this.recipientEmail = email;
    return this;
  }

  withCustomerName(name: string): this {
    this.customerName = name;
    return this;
  }

  withScheduledAt(scheduledAt: string): this {
    this.scheduledAt = scheduledAt;
    return this;
  }

  build(): SendBookingReminderDueNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      recipientEmail: this.recipientEmail,
      customerName: this.customerName,
      scheduledAt: this.scheduledAt,
      appointmentSlot: this.appointmentSlot,
      lines: this.lines,
    };
  }
}
