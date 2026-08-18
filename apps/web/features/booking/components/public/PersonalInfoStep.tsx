'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { z } from 'zod';
import type { AvailableSlot, HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import type { PersonalInfoValue } from '@/features/booking/model/personal-info';
import { AddressFields } from './AddressFields';
import { BookingSummaryCard } from './BookingSummaryCard';
import { ContactInfoFields, type ErrorField, type FieldError } from './ContactInfoFields';
import { ErrorAlert } from './ErrorAlert';
import { PhotoUpload } from './PhotoUpload';

interface PersonalInfoStepProps {
  readonly slug: string;
  readonly value: PersonalInfoValue;
  readonly onChange: (value: PersonalInfoValue) => void;
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
  readonly phonePrefix: string;
  readonly addressSpec: HotsiteAddressSpec;
  readonly hideContactFields?: boolean;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

const EMAIL_SCHEMA = z.email();

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

export function PersonalInfoStep({
  slug,
  value,
  onChange,
  services,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
  phonePrefix,
  addressSpec,
  hideContactFields = false,
  onNext,
  onBack,
}: PersonalInfoStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const [showContactAddress, setShowContactAddress] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);

  function validate(v: PersonalInfoValue): FieldError | null {
    if (hideContactFields) return null;
    if (!v.contactName.trim()) return { field: 'name', message: t('personalInfo.nameRequired') };
    if (!EMAIL_SCHEMA.safeParse(v.contactEmail).success)
      return { field: 'email', message: t('personalInfo.emailRequired') };
    if (!v.contactPhone.trim()) return { field: 'phone', message: t('personalInfo.phoneRequired') };
    return null;
  }

  function handleNext() {
    const result = validate(value);
    if (result) {
      setFieldError(result);
      return;
    }
    setFieldError(null);
    onNext();
  }

  function clearErrorFor(field: ErrorField) {
    if (fieldError?.field === field) setFieldError(null);
  }

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('personalInfo.heading')}
      </h2>

      {!hideContactFields && (
        <ContactInfoFields
          contactName={value.contactName}
          contactEmail={value.contactEmail}
          contactPhone={value.contactPhone}
          phonePrefix={phonePrefix}
          fieldError={fieldError}
          onContactNameChange={(contactName) => {
            onChange({ ...value, contactName });
            clearErrorFor('name');
          }}
          onContactEmailChange={(contactEmail) => {
            onChange({ ...value, contactEmail });
            clearErrorFor('email');
          }}
          onContactPhoneChange={(contactPhone) => {
            onChange({ ...value, contactPhone });
            clearErrorFor('phone');
          }}
        />
      )}

      {fieldError && (
        <div className="mt-4" data-testid="personal-info-error">
          <ErrorAlert>{fieldError.message}</ErrorAlert>
        </div>
      )}

      {!hideContactFields && (
        <div className="mt-6">
          <button
            type="button"
            data-testid="toggle-contact-address"
            onClick={() => setShowContactAddress((prev) => !prev)}
            className="text-sm font-medium underline"
            style={{ color: 'var(--ba-primary)' }}
            aria-expanded={showContactAddress}
          >
            {t('personalInfo.addressLabel')}
          </button>
          {showContactAddress && (
            <div className="mt-3">
              <AddressFields
                value={value.contactAddress}
                onChange={(address) => onChange({ ...value, contactAddress: address })}
                idPrefix="contact-address"
                addressSpec={addressSpec}
                required={false}
              />
            </div>
          )}
        </div>
      )}

      <BookingSummaryCard
        services={services}
        selectedServiceIds={selectedServiceIds}
        selectedDate={selectedDate}
        selectedSlot={selectedSlot}
      />

      <div className="mt-6">
        <PhotoUpload
          slug={slug}
          value={value.photoFilePaths}
          onChange={(photoFilePaths) => onChange({ ...value, photoFilePaths })}
        />
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          data-testid="step-back"
          onClick={onBack}
          className="cursor-pointer border px-6 py-3"
          style={{
            borderRadius: 'var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        >
          {tc('back')}
        </button>
        <button
          type="button"
          onClick={handleNext}
          data-testid="step-next"
          style={btnStyle}
          className="cursor-pointer border-2 px-8 py-3 font-semibold transition-all hover:opacity-90"
        >
          {tc('next')}
        </button>
      </div>
    </div>
  );
}
