import { BrandedFieldFeedback } from '@/shared/components/hotsite/branded-field-feedback';
import { leadFormControlClass, type LeadFormFieldBinding } from './lead-form-field-binding';

interface ContactFieldProps {
  readonly htmlId: string;
  readonly testId: string;
  readonly errorTestId: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly error?: string;
  /** The id the field's `aria-describedby` points to; the message renders with it. */
  readonly errorId: string;
  /** Focus registration and the invalid attributes from the form's feedback hook. */
  readonly binding?: LeadFormFieldBinding;
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
  errorId,
  binding,
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
        className={leadFormControlClass('w-full border px-3 py-2', binding)}
        style={{ borderRadius: 'var(--ba-radius)' }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...binding}
      />
      {error && (
        <div data-testid={errorTestId}>
          <BrandedFieldFeedback id={errorId}>{error}</BrandedFieldFeedback>
        </div>
      )}
    </div>
  );
}
