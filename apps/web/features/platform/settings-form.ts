import type { TenantBusinessInfoAddress, TenantSettingsResponse } from '@ikaro/types';
import { countrySpec } from '@ikaro/i18n';
import { digitsOnly } from '@/shared/utils/digits-only';

// Validation logic (schema, address/phone/social-links validation, normalization) lives in the
// colocated settings-form-validation.ts — split out to keep this file under the documented
// file-length limit; re-exported here so existing importers are unaffected.
export { validateSettingsForm } from './settings-form-validation';
export * from './settings-form-types';
export * from './settings-form-localization';
import {
  WEEK_DAYS,
  type DayHoursValue,
  type SettingsAddressValues,
  type SettingsFormValues,
  type WeekDay,
} from './settings-form-types';

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
    recurringRenewalReminderDays: String(settings.booking.recurringRenewalReminderDays ?? 7),
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
    socialLinks: {
      whatsapp: socialLinks?.whatsapp ? stripPhonePrefix(socialLinks.whatsapp, phonePrefix) : '',
      instagram: socialLinks?.instagram ?? '',
      facebook: socialLinks?.facebook ?? '',
    },
    knowledgeText: settings.chatbot.knowledgeText,
    retentionMonths: String(settings.leadForm.retentionMonths),
    maxSubmissionsPerDay: String(settings.leadForm.maxSubmissionsPerDay),
    maxSubmissionsPerIpPerDay: String(settings.leadForm.maxSubmissionsPerIpPerDay),
  };
}
