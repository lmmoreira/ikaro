'use client';

import { useTranslations } from 'next-intl';
import { brandedFieldStyle } from '@/shared/components/hotsite/branded-field-style';
import { BrandedInput } from '@/shared/components/hotsite/branded-input';
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
        <BrandedInput
          id="contact-name"
          type="text"
          required
          data-testid="input-name"
          value={contactName}
          onChange={(e) => onContactNameChange(e.target.value)}
          ref={registerField?.('name')}
          className="w-full px-3 py-2"
          invalid={fieldError?.field === 'name'}
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
        <BrandedInput
          id="contact-email"
          type="email"
          required
          data-testid="input-email"
          value={contactEmail}
          onChange={(e) => onContactEmailChange(e.target.value)}
          ref={registerField?.('email')}
          className="w-full px-3 py-2"
          invalid={fieldError?.field === 'email'}
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
          <BrandedInput
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
            className="min-w-0 flex-1 px-3 py-2"
            style={{ borderRadius: '0 var(--ba-radius) var(--ba-radius) 0' }}
            invalid={fieldError?.field === 'phone'}
            aria-describedby={fieldError?.field === 'phone' ? describedBy : undefined}
          />
        </div>
      </div>
    </div>
  );
}
