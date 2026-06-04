import { SendBookingRescheduledNotificationDto } from '../../../contexts/notification/application/dtos/send-booking-rescheduled-notification.dto';

export class SendBookingRescheduledNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private eventId = 'cccccccc-0002-4000-8000-000000000001';
  private readonly correlationId = 'corr-rescheduled-1';
  private readonly contactEmail = 'joao@example.com';
  private readonly contactName = 'João Silva';
  private readonly previousSlot = {
    startTime: '2026-07-01T13:00:00.000Z',
    endTime: '2026-07-01T14:00:00.000Z',
  };
  private readonly newSlot = {
    startTime: '2026-07-07T13:00:00.000Z',
    endTime: '2026-07-07T14:00:00.000Z',
  };
  private readonly rescheduledBy = 'staffid-0000-4000-8000-000000000001';
  private readonly adminNotes: string | null = null;
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

  build(): SendBookingRescheduledNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      previousSlot: this.previousSlot,
      newSlot: this.newSlot,
      rescheduledBy: this.rescheduledBy,
      adminNotes: this.adminNotes,
      lineSummary: this.lineSummary,
      totalPrice: this.totalPrice,
    };
  }
}
