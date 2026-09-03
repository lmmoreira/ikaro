import type { AddressSpec } from '@ikaro/i18n';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';
import type { SettingsAddressValues } from '@/features/platform/settings-form';
import { FieldError, INPUT_CLASS } from './SettingsFormFields';

interface PhoneFieldProps {
  readonly id: string;
  readonly prefixTestId: string;
  readonly label: string;
  readonly value: string;
  readonly phonePrefix: string;
  readonly error?: string;
  readonly hint?: string;
  readonly onChange: (localDigits: string) => void;
}

// Mirrors the booking flow's PersonalInfoStep phone field: a fixed, country-derived prefix
// adornment (never typed by the user) + a masked local-digits input. The prefix always comes
// from the tenant's own localization settings — never hardcoded — see settings-form.ts. Reused
// for both businessInfo.phone and businessInfo.socialLinks.whatsapp.
export function PhoneField({
  id,
  prefixTestId,
  label,
  value,
  phonePrefix,
  error,
  hint,
  onChange,
}: PhoneFieldProps): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <div className="flex">
        <span
          data-testid={prefixTestId}
          className="flex items-center rounded-l-md border border-r-0 border-border bg-gray-50 px-3 text-sm font-medium text-gray-600"
        >
          {phonePrefix}
        </span>
        <input
          id={id}
          data-testid={id}
          type="tel"
          inputMode="numeric"
          placeholder={phonePlaceholder(phonePrefix)}
          value={formatPhoneForDisplay(value, phonePrefix)}
          onChange={(event) => onChange(sanitizePhoneInput(event.target.value, phonePrefix))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${INPUT_CLASS} rounded-l-none`}
        />
      </div>
      {hint && !error && <p className="mt-1.5 text-sm text-gray-500">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

interface PostalCodeFieldProps {
  readonly label: string;
  readonly value: string;
  readonly postalPlaceholder: string;
  readonly error?: string;
  readonly isLookingUp: boolean;
  readonly lookupFailed: boolean;
  readonly searchingLabel: string;
  readonly notFoundLabel: string;
  readonly onChange: (rawValue: string) => void;
}

export function PostalCodeField({
  label,
  value,
  postalPlaceholder,
  error,
  isLookingUp,
  lookupFailed,
  searchingLabel,
  notFoundLabel,
  onChange,
}: PostalCodeFieldProps): React.JSX.Element {
  return (
    <div>
      <label
        htmlFor="settings-address-zip"
        className="mb-1.5 block text-sm font-semibold text-gray-900"
      >
        {label}
      </label>
      <input
        id="settings-address-zip"
        data-testid="settings-address-zip"
        type="text"
        inputMode="numeric"
        placeholder={postalPlaceholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'settings-address-zip-error' : undefined}
        className={`${INPUT_CLASS} max-w-56`}
      />
      {isLookingUp && (
        <p data-testid="settings-address-zip-loading" className="mt-1.5 text-sm text-gray-500">
          {searchingLabel}
        </p>
      )}
      {lookupFailed && (
        <p data-testid="settings-address-zip-not-found" className="mt-1.5 text-sm text-gray-500">
          {notFoundLabel}
        </p>
      )}
      <FieldError id="settings-address-zip-error" message={error} />
    </div>
  );
}

export function addressSpecFieldLabel(
  addressSpec: AddressSpec,
  field: keyof SettingsAddressValues,
): string {
  switch (field) {
    case 'street':
      return addressSpec.streetLabel;
    case 'number':
      return addressSpec.numberLabel;
    case 'complement':
      return addressSpec.complementLabel;
    case 'neighborhood':
      return addressSpec.neighborhoodLabel ?? '';
    case 'city':
      return addressSpec.cityLabel;
    case 'state':
      return addressSpec.stateLabel;
    case 'zipCode':
      return addressSpec.postalLabel;
    default:
      return '';
  }
}
