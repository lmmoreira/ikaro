import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import type {
  BookingSettings,
  BusinessInfo,
  ChatbotSettings,
  LoyaltySettings,
  NotificationSettings,
} from '../../../../shared/value-objects/tenant-settings-data';

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  expiryDays: 180,
  enableNotifications: true,
  expiryWarningDays: 7,
  notificationMinPoints: 50,
  pointsPerCurrencyUnit: 0,
};

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  cancellationWindowHours: 48,
  autoApproveEnabled: false,
  minBookingAdvanceHours: 0,
  maxBookingAdvanceDays: 90,
  serviceBufferMinutes: 60,
  slotGranularityMinutes: 30,
  welcomeStaffScreenDays: 14,
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { fromEmail: null };

export const DEFAULT_BUSINESS_INFO_SETTINGS: BusinessInfo = {
  phone: null,
  email: null,
  address: null,
  socialLinks: null,
};

export const DEFAULT_CHATBOT_SETTINGS: ChatbotSettings = { knowledgeText: '' };

export function buildDefaultBusinessHours(timezone: string): BusinessHours {
  return {
    timezone,
    monday: { open: '09:00', close: '18:00' },
    tuesday: { open: '09:00', close: '18:00' },
    wednesday: { open: '09:00', close: '18:00' },
    thursday: { open: '09:00', close: '18:00' },
    friday: { open: '09:00', close: '18:00' },
    saturday: { open: '09:00', close: '17:00' },
    sunday: null,
  };
}
