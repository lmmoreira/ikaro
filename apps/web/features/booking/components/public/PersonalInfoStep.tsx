'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import type {
  AvailableSlot,
  HotsiteAddressSpec,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import type { StepError } from '@/features/booking/hooks/useBookingFlow';
import type { ChosenDuration } from '@/features/booking/model/basket-lines';
import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { findContactError } from '@/features/booking/model/contact-validation';
import type { PersonalInfoValue } from '@/features/booking/model/personal-info';
import { AddressFields } from './AddressFields';
import { BookingSummaryCard } from './BookingSummaryCard';
import { ContactInfoFields, type ErrorField, type FieldError } from './ContactInfoFields';
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
  /** Feed the summary card: the customer's picks, the options they were picked from, the duration. */
  readonly picks?: readonly ResourceSelectionItem[];
  readonly requirements?: readonly HotsiteServiceResourceOptionsRequirement[];
  readonly duration?: ChosenDuration | null;
  /** The server's rejection of this step; a `contactAddress` field marks the address. */
  readonly submitError?: StepError | null;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

const CONTACT_FIELDS: readonly ErrorField[] = ['name', 'email', 'phone'];
const CONTACT_ADDRESS_FIELD = 'contactAddress';

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
  picks,
  requirements,
  duration,
  submitError = null,
  onNext,
  onBack,
}: PersonalInfoStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  // The step is remounted when a server rejection of the contact address sends the customer back
  // to it, so the section starts open then and the effect below only marks and focuses it.
  const [showContactAddress, setShowContactAddress] = useState(
    submitError?.field === CONTACT_ADDRESS_FIELD,
  );
  const feedback = useFormFeedback();
  const invalidField = CONTACT_FIELDS.find((field) => feedback.fieldErrors[field]);
  const fieldError: FieldError | null = invalidField
    ? { field: invalidField, message: feedback.fieldErrors[invalidField] }
    : null;

  const { setFieldErrors } = feedback;
  const serverMarksAddress = submitError?.field === CONTACT_ADDRESS_FIELD;

  useEffect(() => {
    if (!serverMarksAddress || !submitError) return;
    setFieldErrors({ [CONTACT_ADDRESS_FIELD]: submitError.message });
  }, [serverMarksAddress, submitError, setFieldErrors]);

  function validate(v: PersonalInfoValue): FieldError | null {
    if (hideContactFields) return null;
    const field = findContactError(v);
    if (field === 'name') return { field, message: t('personalInfo.nameRequired') };
    if (field === 'email') return { field, message: t('personalInfo.emailRequired') };
    if (field === 'phone') return { field, message: t('personalInfo.phoneRequired') };
    return null;
  }

  function handleNext() {
    const result = validate(value);
    if (result) {
      feedback.setError(result.message);
      feedback.setFieldErrors({ [result.field]: result.message });
      return;
    }
    feedback.clear();
    onNext();
  }

  function clearErrorFor(field: ErrorField) {
    if (fieldError?.field === field) feedback.clear();
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
          describedBy={invalidField ? feedback.fieldErrorId(invalidField) : undefined}
          registerField={feedback.registerField}
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
                onChange={(address) => {
                  onChange({ ...value, contactAddress: address });
                  if (serverMarksAddress) feedback.clear();
                }}
                idPrefix="contact-address"
                addressSpec={addressSpec}
                required={false}
                hasError={!!feedback.fieldErrors[CONTACT_ADDRESS_FIELD]}
                describedBy={feedback.fieldErrorId(CONTACT_ADDRESS_FIELD)}
                firstFieldRef={feedback.registerField(CONTACT_ADDRESS_FIELD)}
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
        picks={picks}
        requirements={requirements}
        duration={duration}
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

      {submitError && (
        <div
          id={serverMarksAddress ? feedback.fieldErrorId(CONTACT_ADDRESS_FIELD) : undefined}
          className="mt-4"
          data-testid="step3-submit-error"
        >
          <BrandedFeedbackMessage focusOnMount={!serverMarksAddress} title={submitError.message} />
        </div>
      )}

      {fieldError && (
        <div
          id={feedback.fieldErrorId(fieldError.field)}
          className="mt-4"
          data-testid="personal-info-error"
        >
          <BrandedFeedbackMessage title={fieldError.message} />
        </div>
      )}
    </div>
  );
}
