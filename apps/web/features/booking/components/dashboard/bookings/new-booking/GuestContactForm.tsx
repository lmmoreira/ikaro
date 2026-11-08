'use client';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useTranslations } from 'next-intl';
import type { ContactField } from '@/features/booking/model/contact-validation';
import type { StaffGuestContact } from '@/features/booking/hooks/useStaffGuestContact';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import { cn } from '@/shared/utils/cn';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';
import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';

type GuestFormFeedback = Pick<
  ReturnType<typeof useFormFeedback>,
  'fieldErrors' | 'fieldProps' | 'fieldErrorId'
>;

interface GuestContactFormProps {
  readonly value: StaffGuestContact;
  readonly phonePrefix: string;
  /** The owner's `useFormFeedback()`: marks and focuses the invalid input, names its message. */
  readonly feedback: GuestFormFeedback;
  readonly onChange: (value: StaffGuestContact) => void;
}

// "Novo contato": a person who is not in the system is booked as a guest — name, phone and e-mail,
// all required (UC-001 contact rules). The phone is kept in E.164, like the hotsite's.
export function GuestContactForm({
  value,
  phonePrefix,
  feedback,
  onChange,
}: GuestContactFormProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.chooser');
  const localPhone = value.contactPhone.startsWith(phonePrefix)
    ? value.contactPhone.slice(phonePrefix.length)
    : value.contactPhone;
  const { fieldErrors, fieldProps, fieldErrorId } = feedback;
  const inputClass = (field: ContactField, base?: string): string =>
    cn(base, fieldErrors[field] && FIELD_INVALID_CLASS);
  const message = (field: ContactField): React.JSX.Element | null =>
    fieldErrors[field] ? (
      <div data-testid="guest-error">
        <FieldFeedback id={fieldErrorId(field)}>{fieldErrors[field]}</FieldFeedback>
      </div>
    ) : null;

  return (
    <div className="space-y-4" data-testid="guest-contact-form">
      <div>
        <Label htmlFor="guest-name">{t('guestName')}</Label>
        <Input
          id="guest-name"
          data-testid="guest-name"
          className={inputClass('name')}
          value={value.contactName}
          maxLength={255}
          {...fieldProps('name')}
          onChange={(event) => onChange({ ...value, contactName: event.target.value })}
        />
        {message('name')}
      </div>
      <div>
        <Label htmlFor="guest-phone">{t('guestPhone')}</Label>
        <div className="flex">
          <span className="flex items-center rounded-l-md border border-r-0 border-border bg-gray-50 px-3 text-sm font-medium text-gray-700">
            {phonePrefix}
          </span>
          <Input
            id="guest-phone"
            type="tel"
            inputMode="numeric"
            data-testid="guest-phone"
            className={inputClass('phone', 'rounded-l-none')}
            placeholder={phonePlaceholder(phonePrefix)}
            value={formatPhoneForDisplay(localPhone, phonePrefix)}
            {...fieldProps('phone')}
            onChange={(event) => {
              const input = sanitizePhoneInput(event.target.value, phonePrefix);
              onChange({ ...value, contactPhone: buildContactPhone(input, phonePrefix) });
            }}
          />
        </div>
        {message('phone')}
      </div>
      <div>
        <Label htmlFor="guest-email">{t('guestEmail')}</Label>
        <Input
          id="guest-email"
          type="email"
          data-testid="guest-email"
          className={inputClass('email')}
          value={value.contactEmail}
          {...fieldProps('email')}
          onChange={(event) => onChange({ ...value, contactEmail: event.target.value })}
        />
        {message('email')}
      </div>
      <p className="text-sm text-gray-600">{t('guestNote')}</p>
    </div>
  );
}
