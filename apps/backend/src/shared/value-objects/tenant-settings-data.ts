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

// `knowledgeText` is the only field default()-written or tenant-editable via UC-026 (M19-S04).
// Every other field here is an Ikaro-only per-tenant override — absent unless Ikaro explicitly
// grants one for that tenant — resolved as `tenant.settings.chatbot?.X ?? DEFAULT_X` at read time,
// where DEFAULT_X lives in `contexts/platform/chatbot.constants.ts`
// (docs/21-TENANTS_SETTINGS_SCHEMA.md §7).
export interface ChatbotSettings {
  knowledgeText?: string;
  maxKnowledgeTextLength?: number;
  maxConversationsPerDay?: number;
  maxConversationsPerIpPerDay?: number;
  maxConcurrentConversations?: number;
  maxMessagesPerConversation?: number;
  maxMessageLengthChars?: number;
  maxHistoryMessagesSentToLlm?: number;
  maxOutputTokensPerResponse?: number;
  llmProvider?: string;
  llmModel?: string;
}

// Unlike `chatbot`, these are normal, tenant-editable settings rather than Ikaro-only overrides
// (docs/21-TENANTS_SETTINGS_SCHEMA.md §8). TenantSettings.reconstitute() supplies these defaults
// for rows created before M20-S03, so the domain contract can remain required.
export interface LeadFormSettings {
  retentionMonths: number;
  maxSubmissionsPerDay: number;
  maxSubmissionsPerIpPerDay: number;
}

export interface TenantSettingsData {
  loyalty: LoyaltySettings;
  booking: BookingSettings;
  businessHours: BusinessHours;
  localization: LocalizationSettings;
  notification?: NotificationSettings;
  businessInfo?: BusinessInfo;
  chatbot?: ChatbotSettings;
  leadForm: LeadFormSettings;
}
