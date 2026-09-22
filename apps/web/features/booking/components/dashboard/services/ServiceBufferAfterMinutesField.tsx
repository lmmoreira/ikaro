'use client';

import { useTranslations } from 'next-intl';

interface ServiceBufferAfterMinutesFieldProps {
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

// Split out of ServiceResourceRequirementsPanel to stay under docs/CODE_STANDARDS.md's
// function-length limit. Stays visible (not removed) in legs mode, disabled with an explanatory
// hint — legged services use per-leg transitionGapAfterMinutes instead of a single buffer.
export function ServiceBufferAfterMinutesField({
  value,
  disabled,
  onChange,
}: ServiceBufferAfterMinutesFieldProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

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
        disabled={disabled}
        data-testid="resource-buffer-input"
        value={disabled ? '' : value}
        onChange={(event) => onChange(event.target.value)}
        className="w-32 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-gray-400"
      />
      <p className="mt-1 text-xs text-gray-500">
        {disabled ? t('recursosBufferDisabledHint') : t('recursosBufferHint')}
      </p>
    </div>
  );
}
