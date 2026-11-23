import { BaseNotificationDto } from './base-notification.dto';

export interface SendSubscriptionPastDueNotificationDto extends BaseNotificationDto {
  suspendsAt: string;
  recipientEmail: string | null;
}
