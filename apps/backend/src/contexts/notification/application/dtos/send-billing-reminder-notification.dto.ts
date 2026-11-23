import { BaseNotificationDto } from './base-notification.dto';

export interface SendBillingReminderNotificationDto extends BaseNotificationDto {
  kind:
    | 'PLAN_CONFIRMATION'
    | 'TRIAL_ENDING'
    | 'CHARGE_DUE_SOON'
    | 'CHARGE_OVERDUE'
    | 'RECOVERY_CHARGE_OPEN';
  dueDate: string | null;
  trialEndsOn: string | null;
  suspendsOn: string | null;
  amountMinor: number | null;
  currency: string | null;
  recipientEmail: string | null;
}
