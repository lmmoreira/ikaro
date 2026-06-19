export interface TenantInfoResponse {
  id: string;
  name: string;
  slug: string;
}

export interface BusinessHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  closed: boolean;
}

export interface TenantLocalizationSettings {
  countryCode: string;
  currency: string;
  language: string;
  decimalPlaces: number;
}

export interface TenantSettings {
  timezone: string;
  booking: {
    cancellationWindowHours: number;
    maxAdvanceBookingDays: number;
  };
  loyalty: {
    expiryDays: number;
  };
  businessHours: {
    monday: BusinessHours;
    tuesday: BusinessHours;
    wednesday: BusinessHours;
    thursday: BusinessHours;
    friday: BusinessHours;
    saturday: BusinessHours;
    sunday: BusinessHours;
  };
  localization: TenantLocalizationSettings;
}

export interface UpdateTenantSettingsRequest {
  settings: Partial<TenantSettings>;
}
