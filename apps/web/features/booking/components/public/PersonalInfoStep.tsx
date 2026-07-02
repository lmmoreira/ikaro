'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { z } from 'zod';
import type { AvailableSlot, HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import type { PersonalInfoValue } from '@/features/booking/model/personal-info';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';
import { AddressFields } from './AddressFields';
import { BookingSummaryCard } from './BookingSummaryCard';
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

type ErrorField = 'name' | 'email' | 'phone';
interface FieldError {
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
              value={value.contactName}
              onChange={(e) => {
                onChange({ ...value, contactName: e.target.value });
                clearErrorFor('name');
              }}
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
              value={value.contactEmail}
              onChange={(e) => {
                onChange({ ...value, contactEmail: e.target.value });
                clearErrorFor('email');
              }}
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
                  value.contactPhone.startsWith(phonePrefix)
                    ? value.contactPhone.slice(phonePrefix.length)
                    : value.contactPhone,
                  phonePrefix,
                )}
                onChange={(e) => {
                  const input = sanitizePhoneInput(e.target.value, phonePrefix);
                  onChange({
                    ...value,
                    contactPhone: buildContactPhone(input, phonePrefix),
                  });
                  clearErrorFor('phone');
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
