'use client';

import { useTranslations } from 'next-intl';
import { BRANDED_FIELD_INVALID_CLASS } from '@/shared/components/hotsite/branded-field-feedback';
import {
  BRANDED_FIELD_PLACEHOLDER_CLASS,
  brandedFieldStyle,
} from '@/shared/components/hotsite/branded-field-style';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';

export type ErrorField = 'name' | 'email' | 'phone';
export interface FieldError {
  readonly field: ErrorField;
  readonly message: string;
}

function inputClass(base: string, isInvalid: boolean): string {
  const withPlaceholder = `${base} ${BRANDED_FIELD_PLACEHOLDER_CLASS}`;
  return isInvalid ? `${withPlaceholder} ${BRANDED_FIELD_INVALID_CLASS}` : withPlaceholder;
}

interface ContactInfoFieldsProps {
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly phonePrefix: string;
  readonly fieldError: FieldError | null;
  /** The id of the message that explains the invalid field; announced with the input. */
  readonly describedBy?: string;
  /** Registers an input with the form so the first invalid one can be focused. */
  readonly registerField?: (name: ErrorField) => React.Ref<HTMLInputElement>;
  readonly onContactNameChange: (value: string) => void;
  readonly onContactEmailChange: (value: string) => void;
  readonly onContactPhoneChange: (value: string) => void;
}

// Extracted from PersonalInfoStep (TD37-S5A) — the name/email/phone contact block is a
// self-contained section wired only to fieldError, unrelated to the address/photo/summary
// sections around it.
export function ContactInfoFields({
  contactName,
  contactEmail,
  contactPhone,
  phonePrefix,
  fieldError,
  describedBy,
  registerField,
  onContactNameChange,
  onContactEmailChange,
  onContactPhoneChange,
}: ContactInfoFieldsProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label
          htmlFor="contact-name"
          className="mb-1 block text-sm font-medium"
          style={{ color: 'var(--ba-text)' }}
        >
          {t('personalInfo.nameLabel')}
        </label>
        <input
          id="contact-name"
          type="text"
          required
          data-testid="input-name"
          value={contactName}
          onChange={(e) => onContactNameChange(e.target.value)}
          ref={registerField?.('name')}
          className={inputClass('w-full border px-3 py-2', fieldError?.field === 'name')}
          style={brandedFieldStyle({ invalid: fieldError?.field === 'name' })}
          aria-invalid={fieldError?.field === 'name' ? true : undefined}
          aria-describedby={fieldError?.field === 'name' ? describedBy : undefined}
        />
      </div>

      <div>
        <label
          htmlFor="contact-email"
          className="mb-1 block text-sm font-medium"
          style={{ color: 'var(--ba-text)' }}
        >
          {t('personalInfo.emailLabel')}
        </label>
        <input
          id="contact-email"
          type="email"
          required
          data-testid="input-email"
          value={contactEmail}
          onChange={(e) => onContactEmailChange(e.target.value)}
          ref={registerField?.('email')}
          className={inputClass('w-full border px-3 py-2', fieldError?.field === 'email')}
          style={brandedFieldStyle({ invalid: fieldError?.field === 'email' })}
          aria-invalid={fieldError?.field === 'email' ? true : undefined}
          aria-describedby={fieldError?.field === 'email' ? describedBy : undefined}
        />
      </div>

      <div>
        <label
          htmlFor="contact-phone"
          className="mb-1 block text-sm font-medium"
          style={{ color: 'var(--ba-text)' }}
        >
          {t('personalInfo.phoneLabel')}
        </label>
        <div className="flex">
          <span
            data-testid="phone-prefix"
            className="flex items-center border border-r-0 px-3 text-sm font-medium"
            style={{
              ...brandedFieldStyle({ invalid: fieldError?.field === 'phone' }),
              borderRadius: 'var(--ba-radius) 0 0 var(--ba-radius)',
            }}
          >
            {phonePrefix}
          </span>
          <input
            id="contact-phone"
            type="tel"
            inputMode="numeric"
            required
            data-testid="input-phone"
            placeholder={phonePlaceholder(phonePrefix)}
            value={formatPhoneForDisplay(
              contactPhone.startsWith(phonePrefix)
                ? contactPhone.slice(phonePrefix.length)
                : contactPhone,
              phonePrefix,
            )}
            onChange={(e) => {
              const input = sanitizePhoneInput(e.target.value, phonePrefix);
              onContactPhoneChange(buildContactPhone(input, phonePrefix));
            }}
            ref={registerField?.('phone')}
            className={inputClass('min-w-0 flex-1 border px-3 py-2', fieldError?.field === 'phone')}
            style={{
              ...brandedFieldStyle({ invalid: fieldError?.field === 'phone' }),
              borderRadius: '0 var(--ba-radius) var(--ba-radius) 0',
            }}
            aria-invalid={fieldError?.field === 'phone' ? true : undefined}
            aria-describedby={fieldError?.field === 'phone' ? describedBy : undefined}
          />
        </div>
      </div>
    </div>
  );
}
