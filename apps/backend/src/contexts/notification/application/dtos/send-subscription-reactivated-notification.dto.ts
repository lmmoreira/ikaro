import { BaseNotificationDto } from './base-notification.dto';

export interface SendSubscriptionReactivatedNotificationDto extends BaseNotificationDto {
  exempt: boolean;
  recipientEmail: string | null;
}
