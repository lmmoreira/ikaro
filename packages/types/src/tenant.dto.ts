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

export interface TenantLeadFormSettings {
  retentionMonths: number;
  maxSubmissionsPerDay: number;
  maxSubmissionsPerIpPerDay: number;
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
  leadForm: TenantLeadFormSettings;
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
    leadForm?: Partial<TenantLeadFormSettings>;
  };
}

export interface RenameTenantRequest {
  name: string;
}

export interface RenameTenantResponse {
  tenantId: string;
  name: string;
}

// UC-027 A5 — powers the CHATBOT module config screen's own red banner. Deliberately narrow:
// only the daily-cap condition, not concurrency/spend/balance (docs/14-API_CONTRACTS.md §
// Chatbot Cap Status).
export interface ChatbotCapStatusResponse {
  dailyCapReachedToday: boolean;
}

// M20-S01 — consolidated admin config for the LEAD_FORM hotsite module (UC-037,
// docs/14-API_CONTRACTS.md § Lead Form Admin Config). Teaser fields (HotsiteConfig's layout[]
// entry) and audienceMode/questions (LeadFormConfig) are merged into one response/request shape
// — see docs/02-DOMAIN_MODEL.md § LeadFormConfig "Cross-aggregate save" for why they're saved
// atomically despite living in two separate aggregates.
export type LeadFormAudienceMode = 'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY';
export type LeadFormQuestionType = 'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';

export interface LeadFormQuestion {
  id: string;
  label: string;
  type: LeadFormQuestionType;
  required: boolean;
  options?: string[];
  order: number;
}

export interface LeadFormConfigResponse {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;
  variant?: 'centered' | 'left-aligned';
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: 'left' | 'center' | 'right';
  bgStyle?: 'primary' | 'background';
  audienceMode: LeadFormAudienceMode;
  questions: LeadFormQuestion[];
}

export type UpdateLeadFormConfigRequest = Partial<LeadFormConfigResponse>;

// UC-041 (Trigger) — nav-gating read powering the dashboard's gated "Leads" sidebar item.
export interface LeadFormStatusResponse {
  enabled: boolean;
}

// M20-S06 — UC-041 main flow steps 1-2/6 (docs/14-API_CONTRACTS.md § Leads Submissions (Admin)).
// search/filters/submittedFrom/submittedTo (M20-S12/S13) are out of this story's scope.
export interface LeadFormSubmissionListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  submittedAt: string;
}

export interface LeadFormSubmissionsListResponse {
  items: LeadFormSubmissionListItem[];
  page: number;
  pageSize: number;
  total: number;
}

// answerValue is a snapshot, not a live lookup — see docs/02-DOMAIN_MODEL.md § LeadFormSubmission.
export interface LeadFormSubmissionAnswer {
  questionLabel: string;
  questionType: LeadFormQuestionType;
  answerValue: string | string[];
}

export interface LeadFormSubmissionDetailResponse {
  id: string;
  name: string;
  email: string;
  phone: string;
  answers: LeadFormSubmissionAnswer[];
  submittedAt: string;
}
