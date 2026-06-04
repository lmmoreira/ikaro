import { BaseContactNotificationDto } from './base-contact-notification.dto';

export interface SendBookingInfoRequestedNotificationDto extends BaseContactNotificationDto {
  bookingId: string;
  customerId: string | null;
  informationNeeded: string;
}
