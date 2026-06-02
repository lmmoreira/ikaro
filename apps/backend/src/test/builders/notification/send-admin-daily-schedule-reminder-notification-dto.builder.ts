import { SendAdminDailyScheduleReminderNotificationDto } from '../../../contexts/notification/application/dtos/send-admin-daily-schedule-reminder-notification.dto';

export class SendAdminDailyScheduleReminderNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private eventId = 'eeeeeeee-0011-4000-8000-000000000001';
  private readonly correlationId = 'corr-admin-schedule-1';
  private localDate = '2026-07-02';
  private bookingsToday: SendAdminDailyScheduleReminderNotificationDto['bookingsToday'] = [
    {
      bookingId: 'bbbbbbbb-0001-4000-8000-000000000001',
      customerName: 'João Silva',
      customerPhone: '+5531999990000',
      lines: [{ serviceId: 'ssss-0001', serviceName: 'Lavagem Completa' }],
      appointmentSlot: {
        startTime: '2026-07-02T13:00:00.000Z',
        endTime: '2026-07-02T14:00:00.000Z',
      },
      adminNotes: null,
    },
  ];

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withLocalDate(localDate: string): this {
    this.localDate = localDate;
    return this;
  }

  withBookingsToday(
    bookings: SendAdminDailyScheduleReminderNotificationDto['bookingsToday'],
  ): this {
    this.bookingsToday = bookings;
    return this;
  }

  withNoBookings(): this {
    this.bookingsToday = [];
    return this;
  }

  build(): SendAdminDailyScheduleReminderNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      localDate: this.localDate,
      bookingsToday: this.bookingsToday,
      totalBookingsToday: this.bookingsToday.length,
    };
  }
}
