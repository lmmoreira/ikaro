import { BaseNotificationDto } from './base-notification.dto';

export interface SendPlanChangedNotificationDto extends BaseNotificationDto {
  newTotalMinor: number;
  currency: string;
  recipientEmail: string | null;
}
