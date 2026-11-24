import { BaseNotificationDto } from './base-notification.dto';

export interface SendChargePaidNotificationDto extends BaseNotificationDto {
  amountMinor: number;
  currency: string;
  paidAt: string;
  recipientEmail: string | null;
}
