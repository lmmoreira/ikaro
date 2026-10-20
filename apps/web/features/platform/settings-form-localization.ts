import { countrySpec, type AddressSpec } from '@ikaro/i18n';

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
