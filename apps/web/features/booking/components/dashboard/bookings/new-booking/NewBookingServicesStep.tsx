'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookingErrorCode } from '@ikaro/types';
import type { Address, HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import type { StepError } from '@/features/booking/hooks/useBookingFlow';
import type { BookingFormDataStatus } from '@/features/booking/hooks/useBookingFormData';
import { isAddressFilled } from '@/features/booking/model/personal-info';
import { NewBookingAddressFields } from './NewBookingAddressFields';
import { NewBookingServiceCard } from './NewBookingServiceCard';
import { NewBookingStepLayout } from './NewBookingStepLayout';
import { SECTION_LABEL_CLASS } from './new-booking-styles';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

interface NewBookingServicesStepProps {
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly onToggleService: (serviceId: string) => void;
  readonly requiresPickupAddress: boolean;
  readonly pickupAddress: Address;
  readonly onPickupAddressChange: (address: Address) => void;
  readonly addressSpec: HotsiteAddressSpec;
  /** State of the intake-schema and resource-options fetch that "Continuar" starts. */
  readonly formStatus: BookingFormDataStatus;
  readonly unavailableServiceIds: readonly string[];
  readonly submitError: StepError | null;
  readonly summary: React.ReactNode;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

// Step 1 of the staff flow: the services of the basket and, when one needs it, the pickup address.
// The same choices and checks as the hotsite's first step (the shared selection hook decides what a
// change invalidates); only the markup is the dashboard's.
export function NewBookingServicesStep({
  services,
  selectedServiceIds,
  onToggleService,
  requiresPickupAddress,
  pickupAddress,
  onPickupAddressChange,
  addressSpec,
  formStatus,
  unavailableServiceIds,
  submitError,
  summary,
  onNext,
  onBack,
}: NewBookingServicesStepProps): React.JSX.Element {
  const t = useTranslations('booking.serviceSelection');
  const tc = useTranslations('common');
  const tn = useTranslations('dashboard.newBooking.steps');
  const [error, setError] = useState<string | null>(null);

  const selected = services.filter((service) => selectedServiceIds.includes(service.id));
  const hasUnavailable = selected.some((service) => unavailableServiceIds.includes(service.id));

  function handleNext(): void {
    if (selected.length === 0) return;
    if (requiresPickupAddress && !isAddressFilled(pickupAddress, addressSpec.requireNeighborhood)) {
      setError(t('pickupAddressError'));
      return;
    }
    setError(null);
    onNext();
  }

  return (
    <NewBookingStepLayout
      summary={summary}
      onBack={onBack}
      onNext={handleNext}
      nextDisabled={selected.length === 0 || formStatus === 'loading' || hasUnavailable}
      nextLabel={formStatus === 'loading' ? tc('loading') : undefined}
    >
      <div data-testid="step-service-selection">
        <h2 className="text-xl font-bold text-gray-900">{t('title')}</h2>
        <p className="mt-1 text-sm text-gray-600">{tn('servicesHint')}</p>
      </div>

      <ul className="space-y-3">
        {services.map((service) => (
          <li key={service.id}>
            <NewBookingServiceCard
              service={service}
              isSelected={selectedServiceIds.includes(service.id)}
              isUnavailable={unavailableServiceIds.includes(service.id)}
              onToggle={() => onToggleService(service.id)}
            />
          </li>
        ))}
      </ul>

      {requiresPickupAddress && (
        <section>
          <p className={SECTION_LABEL_CLASS}>{t('pickupAddressHeading')}</p>
          <NewBookingAddressFields
            value={pickupAddress}
            onChange={(address) => {
              onPickupAddressChange(address);
              setError(null);
            }}
            addressSpec={addressSpec}
            hasError={error !== null}
          />
        </section>
      )}

      {error && <FeedbackMessage testId="step1-error" title={error} />}

      {submitError && (
        <FeedbackMessage
          focusOnMount
          testId="step1-submit-error"
          title={submitError.message}
          hint={
            submitError.code === BookingErrorCode.INVALID_MULTIPLE_VARIABLE_SERVICES
              ? t('multipleVariableHint')
              : undefined
          }
        />
      )}

      {formStatus === 'error' && (
        <FeedbackMessage
          focusOnMount
          testId="step1-form-error"
          title={t('formLoadErrorTitle')}
          hint={t('formLoadError')}
          onRetry={handleNext}
          retryLabel={tn('retry')}
        />
      )}
    </NewBookingStepLayout>
  );
}
