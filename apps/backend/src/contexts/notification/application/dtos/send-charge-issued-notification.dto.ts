import { BaseNotificationDto } from './base-notification.dto';

export interface SendChargeIssuedNotificationDto extends BaseNotificationDto {
  kind: 'PERIOD' | 'RECOVERY';
  dueDate: string;
  amountMinor: number;
  currency: string;
  paymentUrl: string;
  recipientEmail: string | null;
}
