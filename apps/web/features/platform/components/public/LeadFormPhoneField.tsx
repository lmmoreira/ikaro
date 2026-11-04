import { BrandedFieldFeedback } from '@/shared/components/hotsite/branded-field-feedback';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';
import { leadFormControlClass, type LeadFormFieldBinding } from './lead-form-field-binding';

interface LeadFormPhoneFieldProps {
  readonly label: string;
  readonly value: string;
  readonly phonePrefix: string;
  readonly error?: string;
  /** The id the input's `aria-describedby` points to; the message renders with it. */
  readonly errorId: string;
  /** Focus registration and the invalid attributes from the form's feedback hook. */
  readonly binding?: LeadFormFieldBinding;
  readonly onChange: (value: string) => void;
}

// UC-039/UC-040's phone field must derive its prefix/mask/E.164 conversion from the tenant's
// own localization, never a hardcoded pt-BR assumption — same shared pipeline the booking flow's
// ContactInfoFields already uses (docs/CODE_STANDARDS.md § localization-driven fields). `value`
// stays full E.164 in the parent's state; this component only owns the display formatting.
export function LeadFormPhoneField({
  label,
  value,
  phonePrefix,
  error,
  errorId,
  binding,
  onChange,
}: LeadFormPhoneFieldProps): React.JSX.Element {
  return (
    <div className="mb-5">
      <label className="mb-2 block font-medium" htmlFor="lead-form-phone">
        {label} <span className="text-red-600">*</span>
      </label>
      <div className="flex">
        <span
          data-testid="lead-form-phone-prefix"
          className="flex items-center border border-r-0 px-3 text-sm font-medium"
          style={{ borderRadius: 'var(--ba-radius) 0 0 var(--ba-radius)' }}
        >
          {phonePrefix}
        </span>
        <input
          id="lead-form-phone"
          type="tel"
          inputMode="numeric"
          data-testid="lead-form-phone"
          className={leadFormControlClass('min-w-0 flex-1 border px-3 py-2', binding)}
          style={{ borderRadius: '0 var(--ba-radius) var(--ba-radius) 0' }}
          placeholder={phonePlaceholder(phonePrefix)}
          value={formatPhoneForDisplay(
            value.startsWith(phonePrefix) ? value.slice(phonePrefix.length) : value,
            phonePrefix,
          )}
          onChange={(e) => {
            const input = sanitizePhoneInput(e.target.value, phonePrefix);
            onChange(buildContactPhone(input, phonePrefix));
          }}
          {...binding}
        />
      </div>
      {error && (
        <div data-testid="lead-form-phone-error">
          <BrandedFieldFeedback id={errorId}>{error}</BrandedFieldFeedback>
        </div>
      )}
    </div>
  );
}
