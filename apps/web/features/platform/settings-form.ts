import { z } from 'zod';
import type { TenantSettingsResponse, UpdateTenantSettingsRequest } from '@ikaro/types';
import { countrySpec, type AddressSpec } from '@ikaro/i18n';
import { digitsOnly } from '@/shared/utils/digits-only';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import { maxPhoneDigits, phonePlaceholder } from '@/shared/utils/phone-format';

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
  readonly settings: UpdateTenantSettingsRequest['settings'];
}

// Mirrors the BFF's UpdateTenantSettingsBodySchema ranges exactly
// (apps/bff/src/features/platform/tenant-settings.controller.ts).
// pointsPerCurrencyUnit additionally enforces int, per the story spec.
export const SettingsFormSchema = z.object({
  name: z.string().trim().min(1),
  cancellationWindowHours: z.number().int().min(0).max(720),
  serviceBufferMinutes: z.number().int().min(0).max(120),
  minBookingAdvanceHours: z.number().int().min(0),
  maxBookingAdvanceDays: z.number().int().min(1),
  slotGranularityMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  welcomeStaffScreenDays: z.number().int().min(1).max(90),
  loyaltyExpiryDays: z.number().int().min(1).max(3650),
  loyaltyExpiryWarningDays: z.number().int().min(1).max(90),
  loyaltyNotificationMinPoints: z.number().int().min(0).max(10000),
  pointsPerCurrencyUnit: z.number().int().min(0).max(10000),
  email: z.email().nullable(),
  notificationFromEmail: z.email().nullable(),
});

type SchemaField = keyof z.infer<typeof SettingsFormSchema>;

const FIELD_ERROR_KEYS: Record<SchemaField, string> = {
  name: 'errors.nameRequired',
  cancellationWindowHours: 'errors.cancellationWindowMax',
  serviceBufferMinutes: 'errors.bufferMax',
  minBookingAdvanceHours: 'errors.minBookingAdvanceHoursInvalid',
  maxBookingAdvanceDays: 'errors.maxBookingAdvanceDaysInvalid',
  slotGranularityMinutes: 'errors.slotGranularityInvalid',
  welcomeStaffScreenDays: 'errors.welcomeStaffScreenDaysRange',
  loyaltyExpiryDays: 'errors.expiryRange',
  loyaltyExpiryWarningDays: 'errors.expiryWarningRange',
  loyaltyNotificationMinPoints: 'errors.notificationMinPointsMax',
  pointsPerCurrencyUnit: 'errors.pointsMax',
  email: 'errors.emailInvalid',
  notificationFromEmail: 'errors.notificationFromEmailInvalid',
};

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

export function toSettingsFormValues(tenant: TenantSettingsResponse): SettingsFormValues {
  const { settings } = tenant;
  const businessInfo = settings.businessInfo;
  const address = businessInfo?.address;
  const phonePrefix = countrySpec(settings.localization.countryCode).phonePrefix;
  const days = Object.fromEntries(
    WEEK_DAYS.map((day) => {
      const hours = settings.businessHours[day];
      return [day, hours ? { open: hours.open, close: hours.close, closed: false } : DEFAULT_DAY];
    }),
  ) as Record<WeekDay, DayHoursValue>;

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
    days,
    phone: businessInfo?.phone ? stripPhonePrefix(businessInfo.phone, phonePrefix) : '',
    email: businessInfo?.email ?? '',
    address: {
      street: address?.street ?? '',
      number: address?.number ?? '',
      complement: address?.complement ?? '',
      neighborhood: address?.neighborhood ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      zipCode: address?.zipCode ?? '',
    },
    notificationFromEmail: settings.notification?.fromEmail ?? '',
    socialLinks: {
      whatsapp: socialLinks?.whatsapp ? stripPhonePrefix(socialLinks.whatsapp, phonePrefix) : '',
      instagram: socialLinks?.instagram ?? '',
      facebook: socialLinks?.facebook ?? '',
    },
  };
}

function parseIntStrict(value: string): number {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function buildBusinessHours(
  timezone: string,
  days: Record<WeekDay, DayHoursValue>,
): NonNullable<UpdateTenantSettingsRequest['settings']['businessHours']> {
  return {
    timezone,
    ...(Object.fromEntries(
      WEEK_DAYS.map((day) => {
        const value = days[day];
        return [day, value.closed ? null : { open: value.open, close: value.close }];
      }),
    ) as Record<WeekDay, { open: string; close: string } | null>),
  };
}

type NormalizedAddress = NonNullable<
  NonNullable<UpdateTenantSettingsRequest['settings']['businessInfo']>['address']
>;

interface AddressValidationResult {
  readonly errors: SettingsFormErrors;
  // undefined = validation failed (see errors); null = no address to send (all fields blank);
  // otherwise the normalized address to submit.
  readonly address: NormalizedAddress | null | undefined;
}

// The backend only skips address validation when `address` is `null` — once any field is
// present it requires street/number/city/state/zipCode (+ neighborhood for BR) and validates
// zipCode/state against the tenant's country spec (tenant-settings.vo.ts `validateBusinessAddress`).
// Sending a non-null address with blank fields (the old bug here) fails that check even when
// the admin never intended to fill in an address at all.
function validateBusinessAddress(
  address: SettingsAddressValues,
  countryCode: string,
  t: SettingsFormTranslator,
): AddressValidationResult {
  const trimmed = {
    street: address.street.trim(),
    number: address.number.trim(),
    complement: address.complement.trim(),
    neighborhood: address.neighborhood.trim(),
    city: address.city.trim(),
    state: address.state.trim().toUpperCase(),
    zipCode: address.zipCode.trim(),
  };

  const isBlank = Object.values(trimmed).every((value) => value === '');
  if (isBlank) return { errors: {}, address: null };

  const spec = countrySpec(countryCode).address;
  const errors: SettingsFormErrors = {};

  if (!trimmed.street) errors.addressStreet = t('errors.addressStreetRequired');
  if (!trimmed.number) errors.addressNumber = t('errors.addressNumberRequired');
  if (spec.requireNeighborhood && !trimmed.neighborhood) {
    errors.addressNeighborhood = t('errors.addressNeighborhoodRequired');
  }
  if (!trimmed.city) errors.addressCity = t('errors.addressCityRequired');

  if (!trimmed.state) {
    errors.addressState = t('errors.addressStateRequired');
  } else if (spec.statePattern && !spec.statePattern.test(trimmed.state)) {
    errors.addressState = t('errors.addressStateInvalid');
  }

  if (!trimmed.zipCode) {
    errors.addressZipCode = t('errors.addressZipCodeRequired');
  } else if (spec.postalRegex && !spec.postalRegex.test(trimmed.zipCode)) {
    errors.addressZipCode = t('errors.addressZipCodeInvalid');
  }

  if (Object.keys(errors).length > 0) return { errors, address: undefined };

  return {
    errors: {},
    address: {
      street: trimmed.street,
      number: trimmed.number,
      // `complement` is optional (not nullable) in the BFF schema — omit when empty
      ...(trimmed.complement === '' ? {} : { complement: trimmed.complement }),
      neighborhood: trimmed.neighborhood,
      city: trimmed.city,
      state: trimmed.state,
      zipCode: trimmed.zipCode,
    },
  };
}

interface PhoneValidationResult {
  readonly error?: string;
  // undefined = validation failed; null = left blank (optional field); otherwise full E.164.
  readonly phone: string | null | undefined;
}

// Builds the full E.164 value the backend's PhoneNumber VO requires (E164_PATTERN,
// apps/backend/src/shared/value-objects/phone-number.vo.ts) from the local digits the form
// edits. A prefix with no known mask (phonePlaceholder returns '') is validated loosely —
// same generous fallback maxPhoneDigits() already documents. Shared by businessInfo.phone
// and businessInfo.socialLinks.whatsapp — both go through the same PhoneNumber VO backend-side.
function validatePhoneField(
  localDigits: string,
  phonePrefix: string,
  errorKey: string,
  t: SettingsFormTranslator,
): PhoneValidationResult {
  const digits = digitsOnly(localDigits);
  if (digits === '') return { phone: null };

  const isKnownPrefix = phonePlaceholder(phonePrefix) !== '';
  const min = isKnownPrefix ? 10 : 6;
  const max = maxPhoneDigits(phonePrefix);
  if (digits.length < min || digits.length > max) {
    return { error: t(errorKey), phone: undefined };
  }

  return { phone: buildContactPhone(digits, phonePrefix) };
}

interface NormalizedSocialLinks {
  readonly whatsapp: string | null;
  readonly instagram: string | null;
  readonly facebook: string | null;
}

interface SocialLinksValidationResult {
  readonly errors: SettingsFormErrors;
  readonly socialLinks: NormalizedSocialLinks | null | undefined;
}

function validateSocialLinks(
  values: SettingsSocialLinksValues,
  phonePrefix: string,
  t: SettingsFormTranslator,
): SocialLinksValidationResult {
  const instagram = trimmedOrNull(values.instagram);
  const facebook = trimmedOrNull(values.facebook);
  const whatsappResult = validatePhoneField(
    values.whatsapp,
    phonePrefix,
    'errors.socialLinksWhatsappInvalid',
    t,
  );

  if (whatsappResult.phone === undefined) {
    return { errors: { socialLinksWhatsapp: whatsappResult.error }, socialLinks: undefined };
  }

  if (whatsappResult.phone === null && instagram === null && facebook === null) {
    return { errors: {}, socialLinks: null };
  }

  return {
    errors: {},
    socialLinks: { whatsapp: whatsappResult.phone, instagram, facebook },
  };
}

function buildBusinessInfo(
  phone: string | null,
  email: string | null,
  address: NormalizedAddress | null,
  socialLinks: NormalizedSocialLinks | null,
): NonNullable<UpdateTenantSettingsRequest['settings']['businessInfo']> {
  return { phone, email, address, socialLinks };
}

export function validateSettingsForm(
  values: SettingsFormValues,
  countryCode: string,
  t: SettingsFormTranslator,
): {
  readonly errors: SettingsFormErrors;
  readonly normalized: NormalizedSettingsForm | null;
} {
  const candidate = {
    name: values.name,
    cancellationWindowHours: parseIntStrict(values.cancellationWindowHours),
    serviceBufferMinutes: parseIntStrict(values.serviceBufferMinutes),
    minBookingAdvanceHours: parseIntStrict(values.minBookingAdvanceHours),
    maxBookingAdvanceDays: parseIntStrict(values.maxBookingAdvanceDays),
    slotGranularityMinutes: parseIntStrict(values.slotGranularityMinutes),
    welcomeStaffScreenDays: parseIntStrict(values.welcomeStaffScreenDays),
    loyaltyExpiryDays: parseIntStrict(values.loyaltyExpiryDays),
    loyaltyExpiryWarningDays: parseIntStrict(values.loyaltyExpiryWarningDays),
    loyaltyNotificationMinPoints: parseIntStrict(values.loyaltyNotificationMinPoints),
    pointsPerCurrencyUnit: parseIntStrict(values.pointsPerCurrencyUnit),
    email: trimmedOrNull(values.email),
    notificationFromEmail: trimmedOrNull(values.notificationFromEmail),
  };

  const result = SettingsFormSchema.safeParse(candidate);
  const { phonePrefix, timezones } = resolveSettingsLocalization(countryCode);
  const phoneResult = validatePhoneField(values.phone, phonePrefix, 'errors.phoneInvalid', t);
  const addressResult = validateBusinessAddress(values.address, countryCode, t);
  const socialLinksResult = validateSocialLinks(values.socialLinks, phonePrefix, t);
  // Valid timezones are country-specific (resolveSettingsLocalization), so this can't live in
  // the static SettingsFormSchema — validated the same way as phone/address above.
  const timezoneValid = timezones.includes(values.timezone);

  const errors: SettingsFormErrors = { ...addressResult.errors, ...socialLinksResult.errors };
  if (phoneResult.error) errors.phone = phoneResult.error;
  if (!timezoneValid) errors.timezone = t('errors.timezoneInvalid');
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as SchemaField;
      errors[field] ??= t(FIELD_ERROR_KEYS[field]);
    }
  }
  if (result.success && result.data.loyaltyExpiryWarningDays >= result.data.loyaltyExpiryDays) {
    errors.loyaltyExpiryWarningDays = t('errors.expiryWarningMustBeLessThanExpiry');
  }

  if (
    !result.success ||
    !timezoneValid ||
    errors.loyaltyExpiryWarningDays ||
    addressResult.address === undefined ||
    phoneResult.phone === undefined ||
    socialLinksResult.socialLinks === undefined
  ) {
    return { errors, normalized: null };
  }

  const parsed = result.data;
  return {
    errors: {},
    normalized: {
      name: parsed.name,
      settings: {
        booking: {
          cancellationWindowHours: parsed.cancellationWindowHours,
          serviceBufferMinutes: parsed.serviceBufferMinutes,
          autoApproveEnabled: values.autoApproveEnabled,
          minBookingAdvanceHours: parsed.minBookingAdvanceHours,
          maxBookingAdvanceDays: parsed.maxBookingAdvanceDays,
          slotGranularityMinutes: parsed.slotGranularityMinutes,
          welcomeStaffScreenDays: parsed.welcomeStaffScreenDays,
        },
        loyalty: {
          expiryDays: parsed.loyaltyExpiryDays,
          expiryWarningDays: parsed.loyaltyExpiryWarningDays,
          enableNotifications: values.loyaltyEnableNotifications,
          notificationMinPoints: parsed.loyaltyNotificationMinPoints,
          pointsPerCurrencyUnit: parsed.pointsPerCurrencyUnit,
        },
        businessHours: buildBusinessHours(values.timezone, values.days),
        businessInfo: buildBusinessInfo(
          phoneResult.phone,
          parsed.email,
          addressResult.address,
          socialLinksResult.socialLinks,
        ),
        notification: { fromEmail: parsed.notificationFromEmail },
      },
    },
  };
}
