'use client';

import { useTranslations } from 'next-intl';
import type { ContactField } from '@/features/booking/model/contact-validation';
import type { StaffGuestContact } from '@/features/booking/hooks/useStaffGuestContact';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';
import { ERROR_TEXT_CLASS, INPUT_CLASS, LABEL_CLASS } from './new-booking/new-booking-styles';

interface GuestContactFormProps {
  readonly value: StaffGuestContact;
  readonly phonePrefix: string;
  readonly errorField: ContactField | null;
  readonly onChange: (value: StaffGuestContact) => void;
}

// "Novo contato": a person who is not in the system is booked as a guest — name, phone and e-mail,
// all required (UC-001 contact rules). The phone is kept in E.164, like the hotsite's.
export function GuestContactForm({
  value,
  phonePrefix,
  errorField,
  onChange,
}: GuestContactFormProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.chooser');
  const localPhone = value.contactPhone.startsWith(phonePrefix)
    ? value.contactPhone.slice(phonePrefix.length)
    : value.contactPhone;

  return (
    <div className="space-y-4" data-testid="guest-contact-form">
      <div>
        <label htmlFor="guest-name" className={LABEL_CLASS}>
          {t('guestName')}
        </label>
        <input
          id="guest-name"
          data-testid="guest-name"
          className={INPUT_CLASS}
          value={value.contactName}
          maxLength={255}
          aria-invalid={errorField === 'name' ? true : undefined}
          onChange={(event) => onChange({ ...value, contactName: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor="guest-phone" className={LABEL_CLASS}>
          {t('guestPhone')}
        </label>
        <div className="flex">
          <span className="flex items-center rounded-l-md border border-r-0 border-border bg-gray-50 px-3 text-sm font-medium text-gray-700">
            {phonePrefix}
          </span>
          <input
            id="guest-phone"
            type="tel"
            inputMode="numeric"
            data-testid="guest-phone"
            className={`${INPUT_CLASS} rounded-l-none`}
            placeholder={phonePlaceholder(phonePrefix)}
            value={formatPhoneForDisplay(localPhone, phonePrefix)}
            aria-invalid={errorField === 'phone' ? true : undefined}
            onChange={(event) => {
              const input = sanitizePhoneInput(event.target.value, phonePrefix);
              onChange({ ...value, contactPhone: buildContactPhone(input, phonePrefix) });
            }}
          />
        </div>
      </div>
      <div>
        <label htmlFor="guest-email" className={LABEL_CLASS}>
          {t('guestEmail')}
        </label>
        <input
          id="guest-email"
          type="email"
          data-testid="guest-email"
          className={INPUT_CLASS}
          value={value.contactEmail}
          aria-invalid={errorField === 'email' ? true : undefined}
          onChange={(event) => onChange({ ...value, contactEmail: event.target.value })}
        />
      </div>
      {errorField && (
        <p role="alert" className={ERROR_TEXT_CLASS} data-testid="guest-error">
          {t('guestRequired')}
        </p>
      )}
      <p className="text-sm text-gray-600">{t('guestNote')}</p>
    </div>
  );
}
