import type { TenantBusinessInfoAddress, TenantSettingsResponse } from '@ikaro/types';
import { countrySpec, type AddressSpec } from '@ikaro/i18n';
import { digitsOnly } from '@/shared/utils/digits-only';

// Validation logic (schema, address/phone/social-links validation, normalization) lives in the
// colocated settings-form-validation.ts — split out (TD37-S05) to keep this file under the
// documented file-length limit; re-exported here so existing importers are unaffected.
export { validateSettingsForm } from './settings-form-validation';

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
  readonly notificationFromEmail: string;
  readonly socialLinks: SettingsSocialLinksValues;
}

export interface SettingsFormErrors {
  name?: string;
  cancellationWindowHours?: string;
  serviceBufferMinutes?: string;
  minBookingAdvanceHours?: string;
  maxBookingAdvanceDays?: string;
  slotGranularityMinutes?: string;
  welcomeStaffScreenDays?: string;
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
  notificationFromEmail?: string;
  socialLinksWhatsapp?: string;
  submit?: string;
}

export interface NormalizedSettingsForm {
  readonly name: string;
  readonly settings: import('@ikaro/types').UpdateTenantSettingsRequest['settings'];
}

export type SettingsFormTranslator = (key: string) => string;

// Every screen that edits an address/phone must derive labels, masks, and validation from the
// tenant's own localization settings (countrySpec), never from hardcoded pt-BR/en copy or a
// fixed format — see docs/CODE_STANDARDS.md "Localization-driven fields" and the booking flow's
// AddressFields.tsx/PersonalInfoStep.tsx, which this form mirrors.
export interface SettingsLocalization {
  readonly addressSpec: AddressSpec;
  readonly phonePrefix: string;
  readonly timezones: readonly string[];
}

export function resolveSettingsLocalization(countryCode: string): SettingsLocalization {
  const spec = countrySpec(countryCode);
  return { addressSpec: spec.address, phonePrefix: spec.phonePrefix, timezones: spec.timezones };
}

const DEFAULT_DAY: DayHoursValue = { open: '09:00', close: '18:00', closed: true };

// The backend PhoneNumber VO requires full E.164 (+<prefix><local digits>) — the form only
// ever holds/edits the local part; the prefix is a fixed, country-derived adornment (see
// SettingsForm.tsx), same split used by the booking flow's contact-phone step.
function stripPhonePrefix(fullPhone: string, phonePrefix: string): string {
  const local = fullPhone.startsWith(phonePrefix) ? fullPhone.slice(phonePrefix.length) : fullPhone;
  return digitsOnly(local);
}

function toDayHoursRecord(
  businessHours: TenantSettingsResponse['settings']['businessHours'],
): Record<WeekDay, DayHoursValue> {
  return Object.fromEntries(
    WEEK_DAYS.map((day) => {
      const hours = businessHours[day];
      return [day, hours ? { open: hours.open, close: hours.close, closed: false } : DEFAULT_DAY];
    }),
  ) as Record<WeekDay, DayHoursValue>;
}

function toAddressValues(
  address: TenantBusinessInfoAddress | null | undefined,
): SettingsAddressValues {
  return {
    street: address?.street ?? '',
    number: address?.number ?? '',
    complement: address?.complement ?? '',
    neighborhood: address?.neighborhood ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    zipCode: address?.zipCode ?? '',
  };
}

export function toSettingsFormValues(tenant: TenantSettingsResponse): SettingsFormValues {
  const { settings } = tenant;
  const businessInfo = settings.businessInfo;
  const phonePrefix = countrySpec(settings.localization.countryCode).phonePrefix;
  const socialLinks = businessInfo?.socialLinks;

  return {
    name: tenant.name,
    cancellationWindowHours: String(settings.booking.cancellationWindowHours),
    serviceBufferMinutes: String(settings.booking.serviceBufferMinutes),
    autoApproveEnabled: settings.booking.autoApproveEnabled,
    minBookingAdvanceHours: String(settings.booking.minBookingAdvanceHours),
    maxBookingAdvanceDays: String(settings.booking.maxBookingAdvanceDays),
    slotGranularityMinutes: String(settings.booking.slotGranularityMinutes),
    welcomeStaffScreenDays: String(settings.booking.welcomeStaffScreenDays ?? 14),
    loyaltyExpiryDays: String(settings.loyalty.expiryDays),
    loyaltyExpiryWarningDays: String(settings.loyalty.expiryWarningDays),
    loyaltyEnableNotifications: settings.loyalty.enableNotifications,
    loyaltyNotificationMinPoints: String(settings.loyalty.notificationMinPoints),
    pointsPerCurrencyUnit: String(settings.loyalty.pointsPerCurrencyUnit),
    timezone: settings.businessHours.timezone,
    days: toDayHoursRecord(settings.businessHours),
    phone: businessInfo?.phone ? stripPhonePrefix(businessInfo.phone, phonePrefix) : '',
    email: businessInfo?.email ?? '',
    address: toAddressValues(businessInfo?.address),
    notificationFromEmail: settings.notification?.fromEmail ?? '',
    socialLinks: {
      whatsapp: socialLinks?.whatsapp ? stripPhonePrefix(socialLinks.whatsapp, phonePrefix) : '',
      instagram: socialLinks?.instagram ?? '',
      facebook: socialLinks?.facebook ?? '',
    },
  };
}
