'use client';

import { memo, useCallback, useRef, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { TenantSettingsResponse } from '@ikaro/types';
import type { AddressSpec } from '@ikaro/i18n';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { SwitchField } from '@/shared/components/ui/switch-field';
import { TimePicker } from '@/shared/components/ui/time-picker';
import { renameTenant, updateTenantSettings } from '@/features/platform/tenant-settings';
import { digitsOnly } from '@/shared/utils/digits-only';
import { formatPostalCodeForDisplay } from '@/shared/utils/postal-code-format';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import type { AddressLookup } from '@/shared/lib/address/address-lookup.port';
import { viaCepAddressLookup } from '@/shared/lib/address/viacep-address-lookup.adapter';
import {
  SLOT_GRANULARITY_OPTIONS,
  WEEK_DAYS,
  resolveSettingsLocalization,
  toSettingsFormValues,
  validateSettingsForm,
  type DayHoursValue,
  type SettingsAddressValues,
  type SettingsFormErrors,
  type SettingsFormValues,
  type SettingsSocialLinksValues,
  type WeekDay,
} from '@/features/platform/settings-form';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

const COPYABLE_WEEKDAYS = [
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const satisfies readonly WeekDay[];

interface SettingsFormProps {
  readonly initial: TenantSettingsResponse;
  // Injectable for tests — defaults to the real ViaCEP adapter, same pattern as the
  // booking flow's AddressFields.tsx.
  readonly addressLookup?: AddressLookup;
}

interface FieldErrorProps {
  readonly id: string;
  readonly message?: string;
}

function FieldError({ id, message }: FieldErrorProps): React.JSX.Element | null {
  if (!message) return null;
  return (
    <p id={id} data-testid={id} className="mt-1.5 text-sm text-red-600">
      {message}
    </p>
  );
}

interface SectionCardProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function SectionCard({ title, children }: SectionCardProps): React.JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-5 p-5 lg:p-6">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

interface SuffixNumberFieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly suffix: string;
  readonly value: string;
  readonly error?: string;
  readonly onChange: (value: string) => void;
}

function SuffixNumberField({
  id,
  label,
  hint,
  suffix,
  value,
  error,
  onChange,
}: SuffixNumberFieldProps): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <div className="relative max-w-56">
        <input
          id={id}
          data-testid={id}
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${INPUT_CLASS} pr-16`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
          {suffix}
        </span>
      </div>
      {hint && !error && <p className="mt-1.5 text-sm text-gray-500">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly error?: string;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly type?: 'text' | 'email' | 'tel' | 'url';
  readonly onChange: (value: string) => void;
}

function TextField({
  id,
  label,
  value,
  error,
  hint,
  placeholder,
  maxLength,
  type = 'text',
  onChange,
}: TextFieldProps): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <input
        id={id}
        data-testid={id}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={INPUT_CLASS}
      />
      {hint && !error && <p className="mt-1.5 text-sm text-gray-500">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

interface SelectFieldProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly error?: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
}

function SelectField({
  id,
  label,
  hint,
  value,
  error,
  options,
  onChange,
}: SelectFieldProps): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <select
        id={id}
        data-testid={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${INPUT_CLASS} max-w-56`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error && <p className="mt-1.5 text-sm text-gray-500">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

interface ReadOnlyFieldProps {
  readonly testId: string;
  readonly label: string;
  readonly value: string;
}

function ReadOnlyField({ testId, label, value }: ReadOnlyFieldProps): React.JSX.Element {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-gray-900">{label}</span>
      <p
        data-testid={testId}
        className="rounded-md border border-border bg-gray-50 px-3 py-2.5 text-sm text-gray-600"
      >
        {value}
      </p>
    </div>
  );
}

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
function PhoneField({
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

function PostalCodeField({
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
const DayRow = memo(function DayRow({
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

function addressSpecFieldLabel(
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

export function SettingsForm({
  initial,
  addressLookup = viaCepAddressLookup,
}: SettingsFormProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');
  const commonT = useTranslations('common');
  const { timeFormat } = useFormatting();
  const { addressSpec, phonePrefix, timezones } = resolveSettingsLocalization(
    initial.settings.localization.countryCode,
  );
  const [values, setValues] = useState<SettingsFormValues>(() => toSettingsFormValues(initial));
  const [currentName, setCurrentName] = useState(initial.name);
  const [fieldErrors, setFieldErrors] = useState<SettingsFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLookingUpZip, setIsLookingUpZip] = useState(false);
  const [zipLookupFailed, setZipLookupFailed] = useState(false);
  const zipLookupSeqRef = useRef(0);

  const setField = useCallback(
    <K extends keyof SettingsFormValues>(key: K, value: SettingsFormValues[K]): void => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [],
  );

  const setAddressField = useCallback((key: keyof SettingsAddressValues, value: string): void => {
    setValues((prev) => ({ ...prev, address: { ...prev.address, [key]: value } }));
    setSaved(false);
  }, []);

  const setSocialLinksField = useCallback(
    (key: keyof SettingsSocialLinksValues, value: string): void => {
      setValues((prev) => ({ ...prev, socialLinks: { ...prev.socialLinks, [key]: value } }));
      setSaved(false);
    },
    [],
  );

  // Stable reference — passed directly as DayRow's onChange prop so memoization holds.
  const setDay = useCallback((day: WeekDay, patch: Partial<DayHoursValue>): void => {
    setValues((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: { ...prev.days[day], ...patch } },
    }));
    setSaved(false);
  }, []);

  const handleCopyMondayToWeekdays = useCallback((): void => {
    setValues((prev) => {
      const { open, close } = prev.days.monday;
      const days = { ...prev.days };
      for (const day of COPYABLE_WEEKDAYS) {
        days[day] = { ...days[day], open, close };
      }
      return { ...prev, days };
    });
    setSaved(false);
  }, []);

  async function handleZipCodeChange(rawValue: string): Promise<void> {
    const formatted = formatPostalCodeForDisplay(rawValue, addressSpec.postalPlaceholder);
    setAddressField('zipCode', formatted);
    setZipLookupFailed(false);

    if (addressSpec.lookupService !== 'viacep') return;
    const digits = digitsOnly(formatted);
    if (digits.length !== 8) return;

    const seq = ++zipLookupSeqRef.current;
    setIsLookingUpZip(true);

    try {
      const result = await addressLookup.lookup(digits);
      if (seq !== zipLookupSeqRef.current) return;

      if (!result) {
        setZipLookupFailed(true);
        return;
      }

      setValues((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          zipCode: formatted,
          street: result.street,
          neighborhood: result.neighborhood,
          city: result.city,
          state: result.state,
        },
      }));
    } catch {
      if (seq === zipLookupSeqRef.current) setZipLookupFailed(true);
    } finally {
      if (seq === zipLookupSeqRef.current) setIsLookingUpZip(false);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaved(false);

    const { errors, normalized } = validateSettingsForm(
      values,
      initial.settings.localization.countryCode,
      t,
    );
    setFieldErrors(errors);
    if (!normalized) return;

    setIsSubmitting(true);
    try {
      await updateTenantSettings({ settings: normalized.settings });
    } catch {
      setFieldErrors({ submit: t('errors.submitFailed') });
      setIsSubmitting(false);
      return;
    }

    // Settings and the tenant rename are two separate backend calls — if the rename fails
    // after settings already saved, the user must be told the truth (partial success), not
    // a blanket "nothing was saved" message.
    if (normalized.name !== currentName) {
      try {
        await renameTenant({ name: normalized.name });
        setCurrentName(normalized.name);
      } catch {
        setSaved(true);
        setFieldErrors({ submit: t('errors.renamePartialFailure') });
        globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
        setIsSubmitting(false);
        return;
      }
    }

    setSaved(true);
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      {saved && (
        <output
          data-testid="settings-saved-banner"
          className="flex items-start gap-3.5 rounded-xl border border-green-300 bg-green-50 p-4"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
          >
            ✓
          </span>
          <span>
            <span className="block text-sm font-bold text-green-800">{t('successTitle')}</span>
            <span className="mt-0.5 block text-sm text-green-700">{t('successBody')}</span>
          </span>
        </output>
      )}

      {fieldErrors.submit && (
        <div
          role="alert"
          data-testid="settings-submit-error"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700"
        >
          {fieldErrors.submit}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4 lg:space-y-6">
          <SectionCard title={t('sections.general')}>
            <TextField
              id="settings-name"
              label={t('nameLabel')}
              value={values.name}
              error={fieldErrors.name}
              maxLength={100}
              onChange={(value) => setField('name', value)}
            />
            <div>
              <label
                htmlFor="settings-slug"
                className="mb-1.5 block text-sm font-semibold text-gray-900"
              >
                {t('slugLabel')}
              </label>
              <input
                id="settings-slug"
                data-testid="settings-slug-input"
                type="text"
                value={initial.slug}
                disabled
                className={`${INPUT_CLASS} bg-gray-100 text-gray-500`}
              />
              <p className="mt-1.5 text-sm text-gray-500">{t('slugHint')}</p>
            </div>
          </SectionCard>

          <SectionCard title={t('sections.booking')}>
            <div className="grid gap-4 md:grid-cols-2">
              <SuffixNumberField
                id="settings-cancellation-window"
                label={t('cancellationLabel')}
                hint={t('cancellationHint')}
                suffix={t('hoursSuffix')}
                value={values.cancellationWindowHours}
                error={fieldErrors.cancellationWindowHours}
                onChange={(value) => setField('cancellationWindowHours', value)}
              />
              <SuffixNumberField
                id="settings-service-buffer"
                label={t('bufferLabel')}
                hint={t('bufferHint')}
                suffix={t('minutesSuffix')}
                value={values.serviceBufferMinutes}
                error={fieldErrors.serviceBufferMinutes}
                onChange={(value) => setField('serviceBufferMinutes', value)}
              />
            </div>
            <SwitchField
              testId="settings-auto-approve-switch"
              checked={values.autoApproveEnabled}
              onChange={(checked) => setField('autoApproveEnabled', checked)}
              label={t('autoApproveLabel')}
              hint={t('autoApproveHint')}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <SuffixNumberField
                id="settings-min-advance-hours"
                label={t('minBookingAdvanceLabel')}
                hint={t('minBookingAdvanceHint')}
                suffix={t('hoursSuffix')}
                value={values.minBookingAdvanceHours}
                error={fieldErrors.minBookingAdvanceHours}
                onChange={(value) => setField('minBookingAdvanceHours', value)}
              />
              <SuffixNumberField
                id="settings-max-advance-days"
                label={t('maxBookingAdvanceLabel')}
                hint={t('maxBookingAdvanceHint')}
                suffix={t('daysSuffix')}
                value={values.maxBookingAdvanceDays}
                error={fieldErrors.maxBookingAdvanceDays}
                onChange={(value) => setField('maxBookingAdvanceDays', value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                id="settings-slot-granularity"
                label={t('slotGranularityLabel')}
                hint={t('slotGranularityHint')}
                value={values.slotGranularityMinutes}
                error={fieldErrors.slotGranularityMinutes}
                options={SLOT_GRANULARITY_OPTIONS.map((minutes) => ({
                  value: String(minutes),
                  label: t('minutesValue', { minutes }),
                }))}
                onChange={(value) => setField('slotGranularityMinutes', value)}
              />
              <SuffixNumberField
                id="settings-welcome-staff-screen-days"
                label={t('welcomeStaffScreenLabel')}
                hint={t('welcomeStaffScreenHint')}
                suffix={t('daysSuffix')}
                value={values.welcomeStaffScreenDays}
                error={fieldErrors.welcomeStaffScreenDays}
                onChange={(value) => setField('welcomeStaffScreenDays', value)}
              />
            </div>
          </SectionCard>

          <SectionCard title={t('sections.loyalty')}>
            <div className="grid gap-4 md:grid-cols-2">
              <SuffixNumberField
                id="settings-loyalty-expiry"
                label={t('expiryLabel')}
                hint={t('expiryHint')}
                suffix={t('daysSuffix')}
                value={values.loyaltyExpiryDays}
                error={fieldErrors.loyaltyExpiryDays}
                onChange={(value) => setField('loyaltyExpiryDays', value)}
              />
              <div>
                <label
                  htmlFor="settings-points-per-unit"
                  className="mb-1.5 block text-sm font-semibold text-gray-900"
                >
                  {t('pointsLabel')}
                </label>
                <input
                  id="settings-points-per-unit"
                  data-testid="settings-points-per-unit-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10000}
                  value={values.pointsPerCurrencyUnit}
                  onChange={(event) => setField('pointsPerCurrencyUnit', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.pointsPerCurrencyUnit)}
                  aria-describedby={
                    fieldErrors.pointsPerCurrencyUnit ? 'settings-points-per-unit-error' : undefined
                  }
                  className={`${INPUT_CLASS} max-w-56`}
                />
                {!fieldErrors.pointsPerCurrencyUnit && (
                  <p className="mt-1.5 text-sm text-gray-500">{t('pointsHint')}</p>
                )}
                <FieldError
                  id="settings-points-per-unit-error"
                  message={fieldErrors.pointsPerCurrencyUnit}
                />
              </div>
            </div>
            <SwitchField
              testId="settings-loyalty-notifications-switch"
              checked={values.loyaltyEnableNotifications}
              onChange={(checked) => setField('loyaltyEnableNotifications', checked)}
              label={t('loyaltyEnableNotificationsLabel')}
              hint={t('loyaltyEnableNotificationsHint')}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <SuffixNumberField
                id="settings-loyalty-expiry-warning"
                label={t('expiryWarningLabel')}
                hint={t('expiryWarningHint')}
                suffix={t('daysSuffix')}
                value={values.loyaltyExpiryWarningDays}
                error={fieldErrors.loyaltyExpiryWarningDays}
                onChange={(value) => setField('loyaltyExpiryWarningDays', value)}
              />
              <div>
                <label
                  htmlFor="settings-loyalty-notification-min-points"
                  className="mb-1.5 block text-sm font-semibold text-gray-900"
                >
                  {t('notificationMinPointsLabel')}
                </label>
                <input
                  id="settings-loyalty-notification-min-points"
                  data-testid="settings-loyalty-notification-min-points-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10000}
                  value={values.loyaltyNotificationMinPoints}
                  onChange={(event) => setField('loyaltyNotificationMinPoints', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.loyaltyNotificationMinPoints)}
                  aria-describedby={
                    fieldErrors.loyaltyNotificationMinPoints
                      ? 'settings-loyalty-notification-min-points-error'
                      : undefined
                  }
                  className={`${INPUT_CLASS} max-w-56`}
                />
                {!fieldErrors.loyaltyNotificationMinPoints && (
                  <p className="mt-1.5 text-sm text-gray-500">{t('notificationMinPointsHint')}</p>
                )}
                <FieldError
                  id="settings-loyalty-notification-min-points-error"
                  message={fieldErrors.loyaltyNotificationMinPoints}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('sections.notification')}>
            <TextField
              id="settings-notification-from-email"
              label={t('notificationFromEmailLabel')}
              hint={t('notificationFromEmailHint')}
              type="email"
              value={values.notificationFromEmail}
              error={fieldErrors.notificationFromEmail}
              placeholder={t('emailPlaceholder')}
              onChange={(value) => setField('notificationFromEmail', value)}
            />
          </SectionCard>

          <SectionCard title={t('sections.hours')}>
            <div>
              <label
                htmlFor="settings-timezone"
                className="mb-1.5 block text-sm font-semibold text-gray-900"
              >
                {t('timezoneLabel')}
              </label>
              <select
                id="settings-timezone"
                data-testid="settings-timezone-select"
                value={values.timezone}
                onChange={(event) => setField('timezone', event.target.value)}
                aria-invalid={Boolean(fieldErrors.timezone)}
                className={`${INPUT_CLASS} max-w-md`}
              >
                {timezones.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone === 'America/Sao_Paulo' ? t('timezoneBrasilia') : timezone}
                  </option>
                ))}
              </select>
              <FieldError id="settings-timezone-error" message={fieldErrors.timezone} />
            </div>
            <div>
              {WEEK_DAYS.map((day) => (
                <DayRow
                  key={day}
                  day={day}
                  label={t(`daysOfWeek.${day}`)}
                  value={values.days[day]}
                  timeFormat={timeFormat}
                  closedLabel={t('closedLabel')}
                  opensAtLabel={t('opensAt')}
                  closesAtLabel={t('closesAt')}
                  hourLabel={t('hourLabel')}
                  minuteLabel={t('minuteLabel')}
                  periodLabel={t('periodLabel')}
                  copyToWeekdaysLabel={day === 'monday' ? t('copyToWeekdays') : undefined}
                  onChange={setDay}
                  onCopyToWeekdays={day === 'monday' ? handleCopyMondayToWeekdays : undefined}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title={t('sections.contact')}>
            <div className="grid gap-4 md:grid-cols-2">
              <PhoneField
                id="settings-phone"
                prefixTestId="settings-phone-prefix"
                label={t('phoneLabel')}
                value={values.phone}
                phonePrefix={phonePrefix}
                error={fieldErrors.phone}
                onChange={(localDigits) => setField('phone', localDigits)}
              />
              <TextField
                id="settings-email"
                label={t('emailLabel')}
                type="email"
                value={values.email}
                error={fieldErrors.email}
                placeholder={t('emailPlaceholder')}
                onChange={(value) => setField('email', value)}
              />
            </div>
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-gray-900">{t('addressLegend')}</legend>
              <p className="text-sm text-gray-500">{t('addressHint')}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <PostalCodeField
                  label={addressSpec.postalLabel}
                  value={values.address.zipCode}
                  postalPlaceholder={addressSpec.postalPlaceholder}
                  error={fieldErrors.addressZipCode}
                  isLookingUp={isLookingUpZip}
                  lookupFailed={zipLookupFailed}
                  searchingLabel={t('addressZipSearching')}
                  notFoundLabel={t('addressZipNotFound')}
                  onChange={(raw) => {
                    void handleZipCodeChange(raw);
                  }}
                />
                <TextField
                  id="settings-address-number"
                  label={addressSpecFieldLabel(addressSpec, 'number')}
                  value={values.address.number}
                  error={fieldErrors.addressNumber}
                  onChange={(value) => setAddressField('number', value)}
                />
              </div>
              <TextField
                id="settings-address-street"
                label={addressSpecFieldLabel(addressSpec, 'street')}
                value={values.address.street}
                error={fieldErrors.addressStreet}
                onChange={(value) => setAddressField('street', value)}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  id="settings-address-complement"
                  label={addressSpecFieldLabel(addressSpec, 'complement')}
                  value={values.address.complement}
                  onChange={(value) => setAddressField('complement', value)}
                />
                {addressSpec.requireNeighborhood && (
                  <TextField
                    id="settings-address-neighborhood"
                    label={addressSpecFieldLabel(addressSpec, 'neighborhood')}
                    value={values.address.neighborhood}
                    error={fieldErrors.addressNeighborhood}
                    onChange={(value) => setAddressField('neighborhood', value)}
                  />
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  id="settings-address-city"
                  label={addressSpecFieldLabel(addressSpec, 'city')}
                  value={values.address.city}
                  error={fieldErrors.addressCity}
                  onChange={(value) => setAddressField('city', value)}
                />
                <TextField
                  id="settings-address-state"
                  label={addressSpecFieldLabel(addressSpec, 'state')}
                  maxLength={addressSpec.stateMaxLen ?? undefined}
                  value={values.address.state}
                  error={fieldErrors.addressState}
                  onChange={(value) => setAddressField('state', value)}
                />
              </div>
            </fieldset>
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-gray-900">
                {t('socialLinksLegend')}
              </legend>
              <div className="grid gap-4 md:grid-cols-3">
                <PhoneField
                  id="settings-social-whatsapp"
                  prefixTestId="settings-social-whatsapp-prefix"
                  label={t('socialLinksWhatsappLabel')}
                  value={values.socialLinks.whatsapp}
                  phonePrefix={phonePrefix}
                  error={fieldErrors.socialLinksWhatsapp}
                  onChange={(localDigits) => setSocialLinksField('whatsapp', localDigits)}
                />
                <TextField
                  id="settings-social-instagram"
                  label={t('socialLinksInstagramLabel')}
                  type="url"
                  value={values.socialLinks.instagram}
                  placeholder="https://instagram.com/..."
                  onChange={(value) => setSocialLinksField('instagram', value)}
                />
                <TextField
                  id="settings-social-facebook"
                  label={t('socialLinksFacebookLabel')}
                  type="url"
                  value={values.socialLinks.facebook}
                  placeholder="https://facebook.com/..."
                  onChange={(value) => setSocialLinksField('facebook', value)}
                />
              </div>
            </fieldset>
          </SectionCard>

          <SectionCard title={t('sections.localization')}>
            <div className="grid grid-cols-3 gap-4">
              <ReadOnlyField
                testId="settings-country-code"
                label={t('localization.countryCode')}
                value={initial.settings.localization.countryCode}
              />
              <ReadOnlyField
                testId="settings-currency"
                label={t('localization.currency')}
                value={initial.settings.localization.currency}
              />
              <ReadOnlyField
                testId="settings-language"
                label={t('localization.language')}
                value={initial.settings.localization.language}
              />
            </div>
            <p className="text-sm text-gray-500">{t('localization.hint')}</p>
          </SectionCard>
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <Button
                type="submit"
                data-testid="settings-submit-desktop"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? commonT('loading') : t('submit')}
              </Button>
              <hr className="border-t border-gray-200" />
              <p className="text-sm leading-6 text-gray-500">{t('actionHint')}</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <Button
          type="submit"
          data-testid="settings-submit-mobile"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? commonT('loading') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
