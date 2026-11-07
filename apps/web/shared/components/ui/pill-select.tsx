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
  readonly invalid?: boolean;
  /** The id of the message that explains `invalid`, rendered by the caller (`FieldFeedback`). */
  readonly describedBy?: string;
}

// A selected-but-disabled option (e.g. a saved layout: 'featured' choice that becomes disabled
// once its image count drops below the minimum) still needs to read as "this is your current
// pick," not just "unavailable" — a plain disabled style alone loses that signal. Extracted out
// of the JSX as its own statement (Sonar S3358 — no nested ternary), not just for the lint rule:
// a 4th combined disabled+selected style needs its own branch, which a ternary chain can't add
// without nesting further.
function pillButtonClassName(
  selected: boolean,
  disabled: boolean | undefined,
  invalid: boolean,
): string {
  if (disabled && selected) {
    return 'cursor-not-allowed border-primary bg-primary text-primary-foreground opacity-50';
  }
  if (disabled) {
    return 'cursor-not-allowed border-border bg-muted text-subtle-foreground';
  }
  if (selected) {
    return 'border-primary bg-primary text-primary-foreground';
  }
  if (invalid) {
    return 'border-destructive bg-destructive-tint/40 text-foreground';
  }
  return 'border-input bg-background text-foreground hover:border-border-strong';
}

export function PillSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  invalid = false,
  describedBy,
}: PillSelectProps<T>): React.JSX.Element {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-foreground">{label}</span>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            disabled={option.disabled}
            data-testid={testId}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${pillButtonClassName(option.value === value, option.disabled, invalid)}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
