'use client';

import type { PillSelectOption } from './pill-select';

interface PillMultiSelectProps<T extends string> {
  readonly label: string;
  readonly values: readonly T[];
  readonly options: readonly PillSelectOption<T>[];
  readonly onChange: (values: T[]) => void;
  readonly testId?: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
}

// The multiple-choice sibling of PillSelect: each pill is an independent toggle (aria-pressed),
// the group keeps the options' own order in the value it reports.
export function PillMultiSelect<T extends string>({
  label,
  values,
  options,
  onChange,
  testId,
  invalid = false,
  describedBy,
}: PillMultiSelectProps<T>): React.JSX.Element {
  function toggle(value: T): void {
    const next = new Set(values);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(options.map((option) => option.value).filter((candidate) => next.has(candidate)));
  }

  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0"
      data-invalid={invalid || undefined}
      aria-describedby={describedBy}
    >
      <legend className="mb-1.5 block p-0 text-sm font-semibold text-gray-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={option.disabled}
              data-testid={testId}
              data-value={option.value}
              onClick={() => toggle(option.value)}
              className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
                selected
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              } ${invalid && !selected ? 'border-red-300' : ''} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
