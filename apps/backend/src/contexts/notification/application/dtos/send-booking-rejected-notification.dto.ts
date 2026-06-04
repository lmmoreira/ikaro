import { BaseContactNotificationDto } from './base-contact-notification.dto';

export interface SendBookingRejectedNotificationDto extends BaseContactNotificationDto {
  reason: string;
}
