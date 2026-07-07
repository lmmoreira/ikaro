'use client';

export interface PillSelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface PillSelectProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly PillSelectOption<T>[];
  readonly onChange: (value: T) => void;
  readonly testId?: string;
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
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
              option.value === value
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
