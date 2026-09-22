interface ContactFieldProps {
  readonly htmlId: string;
  readonly testId: string;
  readonly errorTestId: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly error?: string;
  readonly type?: string;
  readonly onChange: (value: string) => void;
}

// testId/errorTestId are passed as literal strings from each call site (one per fixed contact
// field), never derived by template literal — E2E-3 requires a static data-testid, with any
// per-instance data encoded in a separate data-* attribute instead.
export function ContactField({
  htmlId,
  testId,
  errorTestId,
  label,
  placeholder,
  value,
  error,
  type,
  onChange,
}: ContactFieldProps): React.JSX.Element {
  return (
    <div className="mb-5">
      <label className="mb-2 block font-medium" htmlFor={htmlId}>
        {label} <span className="text-red-600">*</span>
      </label>
      <input
        id={htmlId}
        type={type ?? 'text'}
        data-testid={testId}
        className="w-full border px-3 py-2"
        style={{ borderRadius: 'var(--ba-radius)' }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p className="mt-1.5 text-sm text-red-600" data-testid={errorTestId}>
          {error}
        </p>
      )}
    </div>
  );
}
