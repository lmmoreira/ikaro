'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { TenantSettingsResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { renameTenant, updateTenantSettings } from '@/features/platform/tenant-settings';
import {
  SETTINGS_TIMEZONES,
  WEEK_DAYS,
  toSettingsFormValues,
  validateSettingsForm,
  type DayHoursValue,
  type SettingsAddressValues,
  type SettingsFormErrors,
  type SettingsFormValues,
  type WeekDay,
} from '@/features/platform/settings-form';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

interface SettingsFormProps {
  readonly initial: TenantSettingsResponse;
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
      <CardContent className="space-y-4 p-5 lg:p-6">
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
          data-testid={`${id}-input`}
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
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly type?: 'text' | 'email' | 'tel';
  readonly onChange: (value: string) => void;
}

function TextField({
  id,
  label,
  value,
  error,
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
        data-testid={`${id}-input`}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={INPUT_CLASS}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

interface DayRowProps {
  readonly day: WeekDay;
  readonly label: string;
  readonly value: DayHoursValue;
  readonly closedLabel: string;
  readonly opensAtLabel: string;
  readonly closesAtLabel: string;
  readonly onChange: (patch: Partial<DayHoursValue>) => void;
}

function DayRow({
  day,
  label,
  value,
  closedLabel,
  opensAtLabel,
  closesAtLabel,
  onChange,
}: DayRowProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <span className="w-24 text-sm font-semibold text-gray-900">{label}</span>
      <input
        type="time"
        data-testid={`hours-${day}-open`}
        aria-label={`${opensAtLabel} — ${label}`}
        value={value.open}
        disabled={value.closed}
        onChange={(event) => onChange({ open: event.target.value })}
        className={`${INPUT_CLASS} w-28 disabled:bg-gray-100 disabled:text-gray-400`}
      />
      <span className="text-sm text-gray-400">–</span>
      <input
        type="time"
        data-testid={`hours-${day}-close`}
        aria-label={`${closesAtLabel} — ${label}`}
        value={value.close}
        disabled={value.closed}
        onChange={(event) => onChange({ close: event.target.value })}
        className={`${INPUT_CLASS} w-28 disabled:bg-gray-100 disabled:text-gray-400`}
      />
      <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          data-testid={`hours-${day}-closed`}
          checked={value.closed}
          onChange={(event) => onChange({ closed: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300"
        />
        {closedLabel}
      </label>
    </div>
  );
}

export function SettingsForm({ initial }: SettingsFormProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');
  const commonT = useTranslations('common');
  const [values, setValues] = useState<SettingsFormValues>(() => toSettingsFormValues(initial));
  const [currentName, setCurrentName] = useState(initial.name);
  const [fieldErrors, setFieldErrors] = useState<SettingsFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  function setField<K extends keyof SettingsFormValues>(
    key: K,
    value: SettingsFormValues[K],
  ): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setAddressField(key: keyof SettingsAddressValues, value: string): void {
    setValues((prev) => ({ ...prev, address: { ...prev.address, [key]: value } }));
  }

  function setDay(day: WeekDay, patch: Partial<DayHoursValue>): void {
    setValues((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: { ...prev.days[day], ...patch } },
    }));
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaved(false);

    const { errors, normalized } = validateSettingsForm(values, t);
    setFieldErrors(errors);
    if (!normalized) return;

    setIsSubmitting(true);
    try {
      await updateTenantSettings({ settings: normalized.settings });
      if (normalized.name !== currentName) {
        await renameTenant({ name: normalized.name });
        setCurrentName(normalized.name);
      }
      setSaved(true);
      globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
    } catch {
      setFieldErrors({ submit: t('errors.submitFailed') });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mx-auto max-w-3xl space-y-4 pb-10 lg:space-y-6"
    >
      {saved && (
        <div
          role="status"
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
        </div>
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
      </SectionCard>

      <SectionCard title={t('sections.loyalty')}>
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
            {SETTINGS_TIMEZONES.map((timezone) => (
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
              closedLabel={t('closedLabel')}
              opensAtLabel={t('opensAt')}
              closesAtLabel={t('closesAt')}
              onChange={(patch) => setDay(day, patch)}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('sections.contact')}>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="settings-phone"
            label={t('phoneLabel')}
            type="tel"
            value={values.phone}
            error={fieldErrors.phone}
            placeholder={t('phonePlaceholder')}
            onChange={(value) => setField('phone', value)}
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
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <TextField
              id="settings-address-street"
              label={t('address.street')}
              value={values.address.street}
              onChange={(value) => setAddressField('street', value)}
            />
            <TextField
              id="settings-address-number"
              label={t('address.number')}
              value={values.address.number}
              onChange={(value) => setAddressField('number', value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="settings-address-complement"
              label={t('address.complement')}
              value={values.address.complement}
              onChange={(value) => setAddressField('complement', value)}
            />
            <TextField
              id="settings-address-neighborhood"
              label={t('address.neighborhood')}
              value={values.address.neighborhood}
              onChange={(value) => setAddressField('neighborhood', value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
            <TextField
              id="settings-address-city"
              label={t('address.city')}
              value={values.address.city}
              onChange={(value) => setAddressField('city', value)}
            />
            <TextField
              id="settings-address-state"
              label={t('address.state')}
              maxLength={10}
              value={values.address.state}
              onChange={(value) => setAddressField('state', value)}
            />
            <TextField
              id="settings-address-zip"
              label={t('address.zipCode')}
              maxLength={20}
              value={values.address.zipCode}
              onChange={(value) => setAddressField('zipCode', value)}
            />
          </div>
        </fieldset>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          type="submit"
          data-testid="settings-submit"
          className="w-full sm:w-auto"
          disabled={isSubmitting}
        >
          {isSubmitting ? commonT('loading') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
