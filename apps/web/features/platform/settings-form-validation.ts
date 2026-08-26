import { z } from 'zod';
import {
  resolveSettingsLocalization,
  type NormalizedSettingsForm,
  type SettingsFormErrors,
  type SettingsFormTranslator,
  type SettingsFormValues,
} from './settings-form';
import {
  validateBusinessAddress,
  type AddressValidationResult,
  type NormalizedAddress,
} from './settings-form-address-validation';
import {
  buildBusinessInfo,
  validatePhoneField,
  validateSocialLinks,
  type NormalizedSocialLinks,
  type PhoneValidationResult,
  type SocialLinksValidationResult,
} from './settings-form-contact-validation';
import { buildBusinessHours, parseIntStrict, trimmedOrNull } from './settings-form-shared';

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
  retentionMonths: z.number().int().min(1).max(24),
  maxSubmissionsPerDay: z.number().int().min(1).max(1000),
  maxSubmissionsPerIpPerDay: z.number().int().min(1).max(100),
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
  retentionMonths: 'errors.leadFormRetentionMonthsInvalid',
  maxSubmissionsPerDay: 'errors.leadFormMaxSubmissionsPerDayInvalid',
  maxSubmissionsPerIpPerDay: 'errors.leadFormMaxSubmissionsPerIpPerDayInvalid',
};

function buildValidationCandidate(values: SettingsFormValues) {
  return {
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
    retentionMonths: parseIntStrict(values.retentionMonths),
    maxSubmissionsPerDay: parseIntStrict(values.maxSubmissionsPerDay),
    maxSubmissionsPerIpPerDay: parseIntStrict(values.maxSubmissionsPerIpPerDay),
  };
}

function collectSchemaErrors(
  result: z.ZodSafeParseResult<z.infer<typeof SettingsFormSchema>>,
  errors: SettingsFormErrors,
  t: SettingsFormTranslator,
): void {
  if (result.success) return;
  for (const issue of result.error.issues) {
    const field = issue.path[0] as SchemaField;
    errors[field] ??= t(FIELD_ERROR_KEYS[field]);
  }
}

function buildNormalizedSettings(
  parsed: z.infer<typeof SettingsFormSchema>,
  values: SettingsFormValues,
  phone: string | null,
  address: NormalizedAddress | null,
  socialLinks: NormalizedSocialLinks | null,
): NormalizedSettingsForm {
  return {
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
      businessInfo: buildBusinessInfo(phone, parsed.email, address, socialLinks),
      notification: { fromEmail: parsed.notificationFromEmail },
      chatbot: { knowledgeText: values.knowledgeText },
      leadForm: {
        retentionMonths: parsed.retentionMonths,
        maxSubmissionsPerDay: parsed.maxSubmissionsPerDay,
        maxSubmissionsPerIpPerDay: parsed.maxSubmissionsPerIpPerDay,
      },
    },
  };
}

// Excludes the `!result.success` check on purpose — callers must check that inline (not via this
// helper) so TypeScript's control-flow narrowing can discriminate `result.data` afterward; a
// boolean-returning helper call can't carry that narrowing back to the caller.
function hasOtherBlockingFailure(
  timezoneValid: boolean,
  errors: SettingsFormErrors,
  addressResult: AddressValidationResult,
  phoneResult: PhoneValidationResult,
  socialLinksResult: SocialLinksValidationResult,
): boolean {
  return (
    !timezoneValid ||
    Boolean(errors.loyaltyExpiryWarningDays) ||
    addressResult.address === undefined ||
    phoneResult.phone === undefined ||
    socialLinksResult.socialLinks === undefined
  );
}

function runFieldValidations(
  values: SettingsFormValues,
  countryCode: string,
  t: SettingsFormTranslator,
) {
  const candidate = buildValidationCandidate(values);
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
  collectSchemaErrors(result, errors, t);
  if (result.success && result.data.loyaltyExpiryWarningDays >= result.data.loyaltyExpiryDays) {
    errors.loyaltyExpiryWarningDays = t('errors.expiryWarningMustBeLessThanExpiry');
  }

  return { result, phoneResult, addressResult, socialLinksResult, timezoneValid, errors };
}

export function validateSettingsForm(
  values: SettingsFormValues,
  countryCode: string,
  t: SettingsFormTranslator,
): {
  readonly errors: SettingsFormErrors;
  readonly normalized: NormalizedSettingsForm | null;
} {
  const { result, phoneResult, addressResult, socialLinksResult, timezoneValid, errors } =
    runFieldValidations(values, countryCode, t);

  if (
    !result.success ||
    hasOtherBlockingFailure(timezoneValid, errors, addressResult, phoneResult, socialLinksResult)
  ) {
    return { errors, normalized: null };
  }

  // hasOtherBlockingFailure already ruled out phone/address/socialLinks being undefined above —
  // asserted here because that check happens through a function call, which TypeScript's
  // control-flow narrowing can't see through back to these call-site expressions.
  return {
    errors: {},
    normalized: buildNormalizedSettings(
      result.data,
      values,
      phoneResult.phone!,
      addressResult.address!,
      socialLinksResult.socialLinks!,
    ),
  };
}
