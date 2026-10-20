export const WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeekDay = (typeof WEEK_DAYS)[number];

export interface DayHoursValue {
  readonly open: string;
  readonly close: string;
  readonly closed: boolean;
}

export interface SettingsAddressValues {
  readonly street: string;
  readonly number: string;
  readonly complement: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  readonly zipCode: string;
}

export const SLOT_GRANULARITY_OPTIONS = [15, 30, 60] as const;
export type SlotGranularityMinutes = (typeof SLOT_GRANULARITY_OPTIONS)[number];

export interface SettingsSocialLinksValues {
  readonly whatsapp: string;
  readonly instagram: string;
  readonly facebook: string;
}

export interface SettingsFormValues {
  readonly name: string;
  readonly cancellationWindowHours: string;
  readonly serviceBufferMinutes: string;
  readonly autoApproveEnabled: boolean;
  readonly minBookingAdvanceHours: string;
  readonly maxBookingAdvanceDays: string;
  readonly slotGranularityMinutes: string;
  readonly welcomeStaffScreenDays: string;
  readonly recurringRenewalReminderDays: string;
  readonly loyaltyExpiryDays: string;
  readonly loyaltyExpiryWarningDays: string;
  readonly loyaltyEnableNotifications: boolean;
  readonly loyaltyNotificationMinPoints: string;
  readonly pointsPerCurrencyUnit: string;
  readonly timezone: string;
  readonly days: Record<WeekDay, DayHoursValue>;
  readonly phone: string;
  readonly email: string;
  readonly address: SettingsAddressValues;
  readonly socialLinks: SettingsSocialLinksValues;
  readonly knowledgeText: string;
  readonly retentionMonths: string;
  readonly maxSubmissionsPerDay: string;
  readonly maxSubmissionsPerIpPerDay: string;
}

export interface SettingsFormErrors {
  name?: string;
  cancellationWindowHours?: string;
  serviceBufferMinutes?: string;
  minBookingAdvanceHours?: string;
  maxBookingAdvanceDays?: string;
  slotGranularityMinutes?: string;
  welcomeStaffScreenDays?: string;
  recurringRenewalReminderDays?: string;
  loyaltyExpiryDays?: string;
  loyaltyExpiryWarningDays?: string;
  loyaltyNotificationMinPoints?: string;
  pointsPerCurrencyUnit?: string;
  timezone?: string;
  phone?: string;
  email?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressZipCode?: string;
  socialLinksWhatsapp?: string;
  knowledgeText?: string;
  retentionMonths?: string;
  maxSubmissionsPerDay?: string;
  maxSubmissionsPerIpPerDay?: string;
  submit?: string;
}

export interface NormalizedSettingsForm {
  readonly name: string;
  readonly settings: import('@ikaro/types').UpdateTenantSettingsRequest['settings'];
}

export type SettingsFormTranslator = (key: string) => string;
