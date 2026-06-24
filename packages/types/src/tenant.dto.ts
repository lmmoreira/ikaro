export interface TenantInfoResponse {
  id: string;
  name: string;
  slug: string;
}

export interface TenantDayHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export interface TenantBusinessHours {
  timezone: string;
  monday: TenantDayHours | null;
  tuesday: TenantDayHours | null;
  wednesday: TenantDayHours | null;
  thursday: TenantDayHours | null;
  friday: TenantDayHours | null;
  saturday: TenantDayHours | null;
  sunday: TenantDayHours | null;
}

export interface TenantLoyaltySettings {
  expiryDays: number;
  enableNotifications: boolean;
  expiryWarningDays: number;
  notificationMinPoints: number;
  pointsPerCurrencyUnit: number;
}

export interface TenantBookingSettings {
  cancellationWindowHours: number;
  autoApproveEnabled: boolean;
  minBookingAdvanceHours: number;
  maxBookingAdvanceDays: number;
  serviceBufferMinutes: number;
  slotGranularityMinutes: 15 | 30 | 60;
}

export interface TenantLocalizationSettings {
  countryCode: string;
  currency: string;
  currencySymbol?: string;
  language: string;
  decimalPlaces: number;
}

export interface TenantBusinessInfoAddress {
  street: string | null;
  number: string | null;
  complement?: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export interface TenantSocialLinks {
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface TenantBusinessInfo {
  phone: string | null;
  email: string | null;
  address: TenantBusinessInfoAddress | null;
  socialLinks: TenantSocialLinks | null;
}

export interface TenantNotificationSettings {
  fromEmail: string | null;
}

export interface TenantSettings {
  loyalty: TenantLoyaltySettings;
  booking: TenantBookingSettings;
  businessHours: TenantBusinessHours;
  localization: TenantLocalizationSettings;
  notification?: TenantNotificationSettings;
  businessInfo?: TenantBusinessInfo;
}

export interface TenantSettingsResponse {
  tenantId: string;
  name: string;
  slug: string;
  settings: TenantSettings;
}

export interface UpdateTenantSettingsRequest {
  settings: {
    loyalty?: Partial<TenantLoyaltySettings>;
    booking?: Partial<TenantBookingSettings>;
    businessHours?: Partial<TenantBusinessHours>;
    localization?: Partial<TenantLocalizationSettings>;
    businessInfo?: {
      phone?: string | null;
      email?: string | null;
      address?: Partial<TenantBusinessInfoAddress> | null;
      socialLinks?: Partial<TenantSocialLinks> | null;
    };
  };
}

export interface RenameTenantRequest {
  name: string;
}

export interface RenameTenantResponse {
  tenantId: string;
  name: string;
}
