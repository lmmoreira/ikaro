import { BaseContactNotificationDto } from './base-contact-notification.dto';

export interface SendBookingCancelledNotificationDto extends BaseContactNotificationDto {
  cancelledBy: string;
  isBusiness: boolean;
  reason: string | null;
  scheduledAt: string;
  lineSummary: Array<{
    serviceNameAtBooking: string;
    priceAtBooking: { amount: string; currency: string };
  }>;
  totalPrice: { amount: string; currency: string };
}
