import { BaseNotificationDto } from './base-notification.dto';

export interface BaseContactNotificationDto extends BaseNotificationDto {
  contactEmail: string;
  contactName: string;
}
