import type { AddressProps } from './address';
import type { BusinessHours } from './business-hours.vo';

export interface NotificationSettings {
  fromEmail: string | null;
}

export interface LoyaltySettings {
  expiryDays: number;
  enableNotifications: boolean;
  expiryWarningDays: number;
  notificationMinPoints: number;
  pointsPerCurrencyUnit: number;
}

export interface BookingSettings {
  cancellationWindowHours: number;
  autoApproveEnabled: boolean;
  minBookingAdvanceHours: number;
  maxBookingAdvanceDays: number;
  serviceBufferMinutes: number;
  slotGranularityMinutes: 15 | 30 | 60;
  welcomeStaffScreenDays: number;
}

export interface LocalizationSettings {
  countryCode: string;
  currency: string;
  currencySymbol?: string;
  language: string;
  decimalPlaces: number;
}

export interface ResolvedLocalization {
  countryCode: string;
  language: string;
  currency: string;
  decimalPlaces: number;
  phonePrefix: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
  numberFormat: string;
  firstDayOfWeek: 0 | 1;
  address: import('@ikaro/i18n').AddressSpec;
}

export interface SocialLinks {
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface BusinessInfo {
  phone: string | null;
  email: string | null;
  address: AddressProps | null;
  socialLinks: SocialLinks | null;
}

// M19-S02: type only for now — knowledgeText/default()/validation land in S04. llmProvider/llmModel
// are never written by default() for any tenant; they exist only as a manual per-tenant override
// (docs/discovery/CHATBOT/CHATBOT.md §5), resolved as `tenant.settings.chatbot?.llmProvider ?? DEFAULT`.
export interface ChatbotSettings {
  knowledgeText?: string;
  llmProvider?: string;
  llmModel?: string;
}

export interface TenantSettingsData {
  loyalty: LoyaltySettings;
  booking: BookingSettings;
  businessHours: BusinessHours;
  localization: LocalizationSettings;
  notification?: NotificationSettings;
  businessInfo?: BusinessInfo;
  chatbot?: ChatbotSettings;
}
