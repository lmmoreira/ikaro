import { countrySpec } from '@ikaro/i18n';
import type { UpdateTenantSettingsRequest } from '@ikaro/types';
import type {
  SettingsAddressValues,
  SettingsFormErrors,
  SettingsFormTranslator,
} from './settings-form';

export type NormalizedAddress = NonNullable<
  NonNullable<UpdateTenantSettingsRequest['settings']['businessInfo']>['address']
>;

export interface AddressValidationResult {
  readonly errors: SettingsFormErrors;
  // undefined = validation failed (see errors); null = no address to send (all fields blank);
  // otherwise the normalized address to submit.
  readonly address: NormalizedAddress | null | undefined;
}

function buildAddressFieldErrors(
  trimmed: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  },
  spec: ReturnType<typeof countrySpec>['address'],
  t: SettingsFormTranslator,
): SettingsFormErrors {
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

  return errors;
}

// The backend only skips address validation when `address` is `null` — once any field is
// present it requires street/number/city/state/zipCode (+ neighborhood for BR) and validates
// zipCode/state against the tenant's country spec (tenant-settings.vo.ts `validateBusinessAddress`).
// Sending a non-null address with blank fields (the old bug here) fails that check even when
// the admin never intended to fill in an address at all.
export function validateBusinessAddress(
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
  const errors = buildAddressFieldErrors(trimmed, spec, t);
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
