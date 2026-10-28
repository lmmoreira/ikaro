'use client';

import { useTranslations } from 'next-intl';

interface ServiceBufferAfterMinutesFieldProps {
  // '' = no override: the service inherits the business default (saved as null).
  readonly value: string;
  readonly disabled: boolean;
  // The business's current default, shown while the field is blank. null where a buffer does not
  // apply (legs mode is `disabled`).
  readonly tenantDefaultMinutes: number | null;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
}

// Split out of ServiceResourceRequirementsPanel to stay under docs/CODE_STANDARDS.md's
// function-length limit. Stays visible (not removed) in legs mode, disabled with an explanatory
// hint — legged services use per-leg transitionGapAfterMinutes instead of a single buffer.
// Blank is "use the business default", never zero: 0 is an explicit "no prep time" override.
export function ServiceBufferAfterMinutesField({
  value,
  disabled,
  tenantDefaultMinutes,
  invalid,
  onChange,
}: ServiceBufferAfterMinutesFieldProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const inherits = !disabled && value === '' && tenantDefaultMinutes !== null;

  let hint = t('recursosBufferHint');
  if (disabled) hint = t('recursosBufferDisabledHint');
  else if (inherits) hint = t('recursosBufferInheritHint', { minutes: tenantDefaultMinutes });

  return (
    <div>
      <label
        htmlFor="resource-buffer-input"
        className="mb-1 block text-sm font-semibold text-gray-900"
      >
        {t('recursosBufferLabel')}
      </label>
      <input
        id="resource-buffer-input"
        type="number"
        min={0}
        step={1}
        disabled={disabled}
        data-testid="resource-buffer-input"
        value={disabled ? '' : value}
        placeholder={
          inherits ? t('recursosBufferPlaceholder', { minutes: tenantDefaultMinutes }) : undefined
        }
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-48 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-gray-400"
      />
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
      {invalid && (
        <p role="alert" data-testid="resource-buffer-invalid" className="mt-1 text-xs text-red-600">
          {t('recursosBufferInvalid')}
        </p>
      )}
    </div>
  );
}
