export type RawDayHours = { open: string; close: string } | null;

export interface RawBusinessHours {
  timezone: string;
  monday: RawDayHours;
  tuesday: RawDayHours;
  wednesday: RawDayHours;
  thursday: RawDayHours;
  friday: RawDayHours;
  saturday: RawDayHours;
  sunday: RawDayHours;
}

export interface RawLoyaltySettings {
  expiry_days: number;
  enable_notifications: boolean;
  expiry_warning_days: number;
  notification_min_points: number;
  points_per_currency_unit: number;
}

export interface RawBookingSettings {
  cancellation_window_hours: number;
  auto_approve_enabled: boolean;
  min_booking_advance_hours: number;
  max_booking_advance_days: number;
  service_buffer_minutes: number;
  slot_granularity_minutes: 15 | 30 | 60;
}

export interface RawLocalizationSettings {
  country_code: string;
  currency: string;
  currency_symbol?: string;
  language: string;
  decimal_places: number;
}

export interface RawBusinessInfoAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface RawSocialLinks {
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface RawBusinessInfo {
  phone: string | null;
  email: string | null;
  address: RawBusinessInfoAddress | null;
  social_links: RawSocialLinks | null;
}

export interface RawNotificationSettings {
  from_email: string | null;
}

export interface RawTenantSettings {
  loyalty: RawLoyaltySettings;
  booking: RawBookingSettings;
  business_hours: RawBusinessHours;
  localization: RawLocalizationSettings;
  notification?: RawNotificationSettings;
  business_info?: RawBusinessInfo;
}

export interface RawTenantSettingsResponse {
  tenantId: string;
  name: string;
  slug: string;
  settings: RawTenantSettings;
}

export interface RawRenameTenantResponse {
  tenantId: string;
  name: string;
}
