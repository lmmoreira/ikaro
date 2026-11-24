import { BaseNotificationDto } from './base-notification.dto';

export interface SendSubscriptionSuspendedNotificationDto extends BaseNotificationDto {
  reason: 'NON_PAYMENT' | 'CANCELED' | 'PAYMENT_REVERSED' | 'OPERATOR';
  purgeAt: string;
  recipientEmail: string | null;
}
