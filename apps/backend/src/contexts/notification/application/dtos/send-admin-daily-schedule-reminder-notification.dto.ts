import { BaseNotificationDto } from './base-notification.dto';

interface DigestBooking {
  bookingId: string;
  customerName: string;
  customerPhone: string | null;
  lines: { serviceId: string; serviceName: string }[];
  appointmentSlot: { startTime: string; endTime: string };
  adminNotes: string | null;
}

export interface SendAdminDailyScheduleReminderNotificationDto extends BaseNotificationDto {
  localDate: string;
  bookingsToday: DigestBooking[];
  totalBookingsToday: number;
}
