'use client';

import { useTranslations } from 'next-intl';
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

function errorBorderStyle(isInvalid: boolean): React.CSSProperties {
  return {
    borderRadius: 'var(--ba-radius)',
    borderColor: isInvalid ? '#dc2626' : 'var(--ba-secondary)',
    backgroundColor: 'var(--ba-secondary)',
    color: 'var(--ba-text)',
  };
}

interface ContactInfoFieldsProps {
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly phonePrefix: string;
  readonly fieldError: FieldError | null;
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
          className="w-full border px-3 py-2"
          style={errorBorderStyle(fieldError?.field === 'name')}
          aria-invalid={fieldError?.field === 'name' ? true : undefined}
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
          className="w-full border px-3 py-2"
          style={errorBorderStyle(fieldError?.field === 'email')}
          aria-invalid={fieldError?.field === 'email' ? true : undefined}
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
              borderRadius: 'var(--ba-radius) 0 0 var(--ba-radius)',
              borderColor: fieldError?.field === 'phone' ? '#dc2626' : 'var(--ba-secondary)',
              backgroundColor: 'var(--ba-secondary)',
              color: 'var(--ba-text)',
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
            className="min-w-0 flex-1 border px-3 py-2"
            style={{
              borderRadius: '0 var(--ba-radius) var(--ba-radius) 0',
              borderColor: fieldError?.field === 'phone' ? '#dc2626' : 'var(--ba-secondary)',
              backgroundColor: 'var(--ba-secondary)',
              color: 'var(--ba-text)',
            }}
            aria-invalid={fieldError?.field === 'phone' ? true : undefined}
          />
        </div>
      </div>
    </div>
  );
}
