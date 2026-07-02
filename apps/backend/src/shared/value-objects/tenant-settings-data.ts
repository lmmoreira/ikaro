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

export interface BusinessInfoAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface SocialLinks {
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface BusinessInfo {
  phone: string | null;
  email: string | null;
  address: BusinessInfoAddress | null;
  socialLinks: SocialLinks | null;
}

export interface TenantSettingsData {
  loyalty: LoyaltySettings;
  booking: BookingSettings;
  businessHours: BusinessHours;
  localization: LocalizationSettings;
  notification?: NotificationSettings;
  businessInfo?: BusinessInfo;
}
