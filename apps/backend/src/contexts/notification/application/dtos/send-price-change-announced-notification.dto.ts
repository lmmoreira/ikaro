import { BaseNotificationDto } from './base-notification.dto';

export interface PriceChangeLine {
  featureKey: string;
  tier: string;
  oldAmountMinor: number;
  newAmountMinor: number;
}

export interface SendPriceChangeAnnouncedNotificationDto extends BaseNotificationDto {
  changes: PriceChangeLine[];
  currency: string;
  effectiveFrom: string;
  newMonthlyTotalMinor: number;
  recipientEmail: string | null;
}
