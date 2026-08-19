// Extracted from SettingsForm (TD37-S5A) — the reusable field primitives (label + input + hint +
// error, in various shapes) are a self-contained, fully generic concern, unrelated to the
// section-by-section form layout that consumes them. Split into this file for basic fields and
// SettingsFormAdvancedFields.tsx for the more specialized ones (phone, postal code, day row).
export const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

interface FieldErrorProps {
  readonly id: string;
  readonly message?: string;
}

export function FieldError({ id, message }: FieldErrorProps): React.JSX.Element | null {
  if (!message) return null;
  return (
    <p id={id} data-testid={id} className="mt-1.5 text-sm text-red-600">
      {message}
    </p>
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

export function SuffixNumberField({
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

export function TextField({
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

interface TextareaFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly error?: string;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}

export function TextareaField({
  id,
  label,
  value,
  error,
  hint,
  placeholder,
  onChange,
}: TextareaFieldProps): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <textarea
        id={id}
        data-testid={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        rows={5}
        className={`${INPUT_CLASS} min-h-32 resize-y`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-gray-500">
          {hint}
        </p>
      )}
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

export function SelectField({
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

export function ReadOnlyField({ testId, label, value }: ReadOnlyFieldProps): React.JSX.Element {
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
