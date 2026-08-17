import type React from 'react';

interface AddressTextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly inputMode?: 'text' | 'numeric';
  readonly placeholder?: string;
  readonly hasError?: boolean;
}

function fieldBorderStyle(hasError: boolean): React.CSSProperties {
  return {
    borderRadius: 'var(--ba-radius)',
    borderColor: hasError ? '#dc2626' : 'var(--ba-secondary)',
    backgroundColor: 'var(--ba-secondary)',
    color: 'var(--ba-text)',
  };
}

export function AddressTextField({
  id,
  label,
  value,
  onChange,
  required,
  maxLength,
  inputMode,
  placeholder,
  hasError,
}: AddressTextFieldProps): React.JSX.Element {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium"
        style={{ color: 'var(--ba-text)' }}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border px-3 py-2"
        style={fieldBorderStyle(!!hasError)}
        aria-invalid={hasError ? true : undefined}
      />
    </div>
  );
}
