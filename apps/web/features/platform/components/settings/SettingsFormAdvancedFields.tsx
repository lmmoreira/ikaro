import { memo } from 'react';
import type { AddressSpec } from '@ikaro/i18n';
import { TimePicker } from '@/shared/components/ui/time-picker';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';
import type {
  DayHoursValue,
  SettingsAddressValues,
  WeekDay,
} from '@/features/platform/settings-form';
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

interface DayRowProps {
  readonly day: WeekDay;
  readonly label: string;
  readonly value: DayHoursValue;
  readonly timeFormat: '24h' | '12h';
  readonly closedLabel: string;
  readonly opensAtLabel: string;
  readonly closesAtLabel: string;
  readonly hourLabel: string;
  readonly minuteLabel: string;
  readonly periodLabel: string;
  readonly copyToWeekdaysLabel?: string;
  readonly onChange: (day: WeekDay, patch: Partial<DayHoursValue>) => void;
  readonly onCopyToWeekdays?: () => void;
}

// Memoized + fed a stable `onChange` (setDay) so typing in an unrelated field doesn't
// re-render all 7 day rows (14 TimePickers / 28 Radix Selects) on every keystroke.
export const DayRow = memo(function DayRow({
  day,
  label,
  value,
  timeFormat,
  closedLabel,
  opensAtLabel,
  closesAtLabel,
  hourLabel,
  minuteLabel,
  periodLabel,
  copyToWeekdaysLabel,
  onChange,
  onCopyToWeekdays,
}: DayRowProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 py-3 last:border-b-0">
      <span className="w-24 shrink-0 text-sm font-semibold text-gray-900">{label}</span>

      <TimePicker
        value={value.open}
        onChange={(open) => onChange(day, { open })}
        timeFormat={timeFormat}
        disabled={value.closed}
        hourAriaLabel={`${opensAtLabel} — ${hourLabel} — ${label}`}
        minuteAriaLabel={`${opensAtLabel} — ${minuteLabel} — ${label}`}
        periodAriaLabel={`${opensAtLabel} — ${periodLabel} — ${label}`}
        hourTestId="settings-day-open-hour"
        minuteTestId="settings-day-open-minute"
        periodTestId="settings-day-open-period"
        dataRowKey={day}
      />
      <span aria-hidden="true" className="text-sm text-gray-400">
        –
      </span>
      <TimePicker
        value={value.close}
        onChange={(close) => onChange(day, { close })}
        timeFormat={timeFormat}
        disabled={value.closed}
        hourAriaLabel={`${closesAtLabel} — ${hourLabel} — ${label}`}
        minuteAriaLabel={`${closesAtLabel} — ${minuteLabel} — ${label}`}
        periodAriaLabel={`${closesAtLabel} — ${periodLabel} — ${label}`}
        hourTestId="settings-day-close-hour"
        minuteTestId="settings-day-close-minute"
        periodTestId="settings-day-close-period"
        dataRowKey={day}
      />

      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          aria-label={`${closedLabel} — ${label}`}
          checked={value.closed}
          onChange={(event) => onChange(day, { closed: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300"
        />
        {closedLabel}
      </label>

      {onCopyToWeekdays && copyToWeekdaysLabel && (
        <button
          type="button"
          data-testid="day-copy-monday"
          onClick={onCopyToWeekdays}
          className="ml-auto text-sm font-semibold text-blue-600 hover:underline"
        >
          {copyToWeekdaysLabel}
        </button>
      )}
    </div>
  );
});

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
