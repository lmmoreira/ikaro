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
  welcomeStaffScreenDays?: number;
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

// The only chatbot field exposed through this wire contract — the 8 volume/cost caps and
// llmProvider/llmModel are Ikaro-only overrides, never accepted or returned via this form
// (docs/21-TENANTS_SETTINGS_SCHEMA.md §7).
export interface TenantChatbotSettings {
  knowledgeText: string;
}

export interface TenantSettings {
  loyalty: TenantLoyaltySettings;
  booking: TenantBookingSettings;
  businessHours: TenantBusinessHours;
  localization: TenantLocalizationSettings;
  notification?: TenantNotificationSettings;
  businessInfo?: TenantBusinessInfo;
  // Required, unlike notification/businessInfo above: those two are optional because their
  // presence merely mirrors whatever TenantSettings.toJSON() happens to contain for a given
  // tenant. chatbot is different — get-tenant-by-id.use-case.ts and
  // update-tenant-settings.use-case.ts both override toJSON()'s raw value with the chatbot
  // getter's result, which always resolves knowledgeText (defaulting to '' for any tenant whose
  // stored settings predate M19-S04). The response genuinely can never omit this field.
  chatbot: TenantChatbotSettings;
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
    notification?: Partial<TenantNotificationSettings>;
    businessInfo?: {
      phone?: string | null;
      email?: string | null;
      address?: Partial<TenantBusinessInfoAddress> | null;
      socialLinks?: Partial<TenantSocialLinks> | null;
    };
    chatbot?: Partial<TenantChatbotSettings>;
  };
}

export interface RenameTenantRequest {
  name: string;
}

export interface RenameTenantResponse {
  tenantId: string;
  name: string;
}
