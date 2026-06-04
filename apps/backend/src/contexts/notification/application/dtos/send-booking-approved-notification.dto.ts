import { BaseContactNotificationDto } from './base-contact-notification.dto';

export interface SendBookingApprovedNotificationDto extends BaseContactNotificationDto {
  approvedSlot: { startTime: string; endTime: string };
  totalPrice: { amount: string; currency: string };
  lineSummary: Array<{
    serviceNameAtBooking: string;
    priceAtBooking: { amount: string; currency: string };
  }>;
}
