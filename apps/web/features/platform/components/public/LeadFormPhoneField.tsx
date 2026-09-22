import { buildContactPhone } from '@/shared/utils/contact-phone';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';

interface LeadFormPhoneFieldProps {
  readonly label: string;
  readonly value: string;
  readonly phonePrefix: string;
  readonly error?: string;
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
          className="min-w-0 flex-1 border px-3 py-2"
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
        />
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-red-600" data-testid="lead-form-phone-error">
          {error}
        </p>
      )}
    </div>
  );
}
