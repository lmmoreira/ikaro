import { BaseNotificationDto } from './base-notification.dto';

export interface SendSubscriptionCancelledNotificationDto extends BaseNotificationDto {
  immediate: boolean;
  cancelAt: string;
  recipientEmail: string | null;
}
