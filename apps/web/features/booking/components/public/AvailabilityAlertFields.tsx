'use client';

import { useTranslations } from 'next-intl';
import type { AvailabilityAlertWeekday } from '@ikaro/types';
import {
  ALERT_DEFAULT_EXPIRY_DAYS,
  ALERT_EXPIRY_DAYS_OPTIONS,
  ALERT_WEEKDAYS,
} from '@/features/booking/model/availability-alert-form';
import { cn } from '@/shared/utils/cn';

// The small building blocks of the alert form — plain Tailwind plus inline --ba-* styles, the way
// the booking flow's own fields (ContactInfoFields) are built. No shadcn: it takes its colours from
// shadcn tokens, which do not exist under the hotsite tree.

export function fieldStyle(isInvalid: boolean): React.CSSProperties {
  return {
    borderRadius: 'var(--ba-radius)',
    borderColor: isInvalid ? '#dc2626' : 'var(--ba-secondary)',
    backgroundColor: 'var(--ba-secondary)',
    color: 'var(--ba-text)',
  };
}

const UNSELECTED_CHIP =
  'border-[var(--ba-secondary,rgb(191,219,254))] bg-[var(--ba-secondary,rgb(239,246,255))] text-[var(--ba-primary,#1d4ed8)] hover:bg-blue-50';
const SELECTED_CHIP = 'border-blue-600 bg-blue-600 text-white';

interface SummaryRowProps {
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
}

export function SummaryRow({ label, value, testId }: SummaryRowProps): React.JSX.Element {
  return (
    <div
      className="flex justify-between gap-4 border-b py-2"
      style={{ borderColor: 'var(--ba-secondary)' }}
      data-testid={testId}
    >
      <dt className="opacity-60">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export function FieldError({
  message,
}: {
  readonly message: string | null;
}): React.JSX.Element | null {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-red-600" data-testid="alert-field-error">
      {message}
    </p>
  );
}

interface CriteriaChoiceProps {
  readonly id: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  // A key under booking.availabilityAlert ("range" | "weekly"), resolved here so the <label> text is
  // a translation call the accessibility lint rule can see.
  readonly kind: 'range' | 'weekly';
  readonly onSelect: () => void;
}

export function CriteriaChoice({
  id,
  checked,
  disabled,
  kind,
  onSelect,
}: CriteriaChoiceProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <div
      className="mb-2 flex items-center gap-3 border p-3"
      style={{
        borderRadius: 'var(--ba-radius)',
        borderColor: checked ? 'var(--ba-primary)' : 'var(--ba-secondary)',
        borderWidth: checked ? 2 : 1,
      }}
    >
      <input
        id={id}
        type="radio"
        name="alert-criteria"
        data-testid={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <div>
        <label htmlFor={id} className="block cursor-pointer font-medium">
          {t(`availabilityAlert.${kind}.title`)}
        </label>
        <p id={`${id}-hint`} className="text-sm opacity-65">
          {t(`availabilityAlert.${kind}.hint`)}
        </p>
      </div>
    </div>
  );
}

interface LabeledInputProps {
  readonly id: string;
  // A key under booking.availabilityAlert (e.g. "range.from"), resolved here so the <label> text is
  // a translation call the accessibility lint rule can see.
  readonly labelKey: string;
  readonly type: 'datetime-local' | 'time';
  readonly value: string;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
}

export function LabeledInput({
  id,
  labelKey,
  type,
  value,
  disabled,
  error,
  onChange,
}: LabeledInputProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {t(`availabilityAlert.${labelKey}`)}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        aria-invalid={error !== null}
        data-testid={id}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border px-3 py-2"
        style={fieldStyle(error !== null)}
      />
      <FieldError message={error} />
    </div>
  );
}

interface WeekdayPickerProps {
  readonly selected: readonly AvailabilityAlertWeekday[];
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onToggle: (day: AvailabilityAlertWeekday) => void;
}

// One pill per weekday, Monday first. The testid is static and the day rides in `data-day`
// (docs/08-TESTING_STRATEGY.md § E2E Selector Strategy).
export function WeekdayPicker({
  selected,
  disabled,
  error,
  onToggle,
}: WeekdayPickerProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <div>
      <p className="mb-1 block text-sm font-medium">{t('availabilityAlert.weekly.weekdays')}</p>
      <div className="flex flex-wrap gap-2">
        {ALERT_WEEKDAYS.map((day) => {
          const isSelected = selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled}
              data-testid="alert-weekday"
              data-day={day}
              onClick={() => onToggle(day)}
              className={cn(
                'border px-3 py-2 text-sm font-medium transition-colors',
                isSelected ? SELECTED_CHIP : UNSELECTED_CHIP,
              )}
              style={{ borderRadius: 'var(--ba-radius)' }}
            >
              {t(`availabilityAlert.weekdays.${day}`)}
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
    </div>
  );
}

interface ExpirySelectProps {
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (days: number) => void;
}

function expiryOptionLabel(t: ReturnType<typeof useTranslations>, days: number): string {
  if (days === ALERT_DEFAULT_EXPIRY_DAYS)
    return t('availabilityAlert.expiry.daysDefault', { days });
  if (days === ALERT_EXPIRY_DAYS_OPTIONS.at(-1)) {
    return t('availabilityAlert.expiry.daysMax', { days });
  }
  return t('availabilityAlert.expiry.days', { days });
}

export function ExpirySelect({ value, disabled, onChange }: ExpirySelectProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <div>
      <label htmlFor="alert-expiry" className="mb-1 block text-sm font-medium">
        {t('availabilityAlert.expiry.label')}
      </label>
      <select
        id="alert-expiry"
        data-testid="alert-expiry"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border px-3 py-2"
        style={fieldStyle(false)}
      >
        {ALERT_EXPIRY_DAYS_OPTIONS.map((days) => (
          <option key={days} value={days}>
            {expiryOptionLabel(t, days)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs opacity-60">{t('availabilityAlert.expiry.hint')}</p>
    </div>
  );
}
