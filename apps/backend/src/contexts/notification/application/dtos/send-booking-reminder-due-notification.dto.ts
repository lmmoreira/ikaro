import { BaseNotificationDto } from './base-notification.dto';

export interface SendBookingReminderDueNotificationDto extends BaseNotificationDto {
  recipientEmail: string;
  customerName: string;
  scheduledAt: string;
  appointmentSlot: { startTime: string; endTime: string };
  lines: { serviceId: string; serviceName: string }[];
}
