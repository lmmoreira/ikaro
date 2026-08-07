'use client';

export interface PillSelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

interface PillSelectProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly PillSelectOption<T>[];
  readonly onChange: (value: T) => void;
  readonly testId?: string;
}

// A selected-but-disabled option (e.g. a saved layout: 'featured' choice that becomes disabled
// once its image count drops below the minimum) still needs to read as "this is your current
// pick," not just "unavailable" — a plain disabled style alone loses that signal. Extracted out
// of the JSX as its own statement (Sonar S3358 — no nested ternary), not just for the lint rule:
// a 4th combined disabled+selected style needs its own branch, which a ternary chain can't add
// without nesting further.
function pillButtonClassName(selected: boolean, disabled: boolean | undefined): string {
  if (disabled && selected) {
    return 'cursor-not-allowed border-blue-200 bg-blue-50 text-blue-400';
  }
  if (disabled) {
    return 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400';
  }
  if (selected) {
    return 'border-blue-600 bg-blue-600 text-white';
  }
  return 'border-gray-200 bg-white text-gray-700 hover:border-gray-300';
}

export function PillSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: PillSelectProps<T>): React.JSX.Element {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-gray-900">{label}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            disabled={option.disabled}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${pillButtonClassName(option.value === value, option.disabled)}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
