import type { UpdateTenantSettingsRequest } from '@ikaro/types';
import { digitsOnly } from '@/shared/utils/digits-only';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import { maxPhoneDigits, phonePlaceholder } from '@/shared/utils/phone-format';
import type {
  SettingsFormErrors,
  SettingsFormTranslator,
  SettingsSocialLinksValues,
} from './settings-form';
import type { NormalizedAddress } from './settings-form-address-validation';
import { trimmedOrNull } from './settings-form-shared';

export interface PhoneValidationResult {
  readonly error?: string;
  // undefined = validation failed; null = left blank (optional field); otherwise full E.164.
  readonly phone: string | null | undefined;
}

// Builds the full E.164 value the backend's PhoneNumber VO requires (E164_PATTERN,
// apps/backend/src/shared/value-objects/phone-number.vo.ts) from the local digits the form
// edits. A prefix with no known mask (phonePlaceholder returns '') is validated loosely —
// same generous fallback maxPhoneDigits() already documents. Shared by businessInfo.phone
// and businessInfo.socialLinks.whatsapp — both go through the same PhoneNumber VO backend-side.
export function validatePhoneField(
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

export interface NormalizedSocialLinks {
  readonly whatsapp: string | null;
  readonly instagram: string | null;
  readonly facebook: string | null;
}

export interface SocialLinksValidationResult {
  readonly errors: SettingsFormErrors;
  readonly socialLinks: NormalizedSocialLinks | null | undefined;
}

export function validateSocialLinks(
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

export function buildBusinessInfo(
  phone: string | null,
  email: string | null,
  address: NormalizedAddress | null,
  socialLinks: NormalizedSocialLinks | null,
): NonNullable<UpdateTenantSettingsRequest['settings']['businessInfo']> {
  return { phone, email, address, socialLinks };
}
