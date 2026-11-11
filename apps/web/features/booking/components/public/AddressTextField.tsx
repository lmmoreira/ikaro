import type React from 'react';
import { BrandedInput } from '@/shared/components/hotsite/branded-input';

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
  /** The id of the message that explains the error; announced with the input when invalid. */
  readonly describedBy?: string;
  /** Lets a form focus this input when it is the first invalid one. */
  readonly inputRef?: React.Ref<HTMLInputElement>;
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
  describedBy,
  inputRef,
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
      <BrandedInput
        id={id}
        type="text"
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        ref={inputRef}
        className="w-full px-3 py-2"
        invalid={!!hasError}
        aria-describedby={hasError ? describedBy : undefined}
      />
    </div>
  );
}
