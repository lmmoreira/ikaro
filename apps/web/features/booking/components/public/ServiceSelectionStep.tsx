'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { BookingErrorCode } from '@ikaro/types';
import type { Address, HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { isAddressFilled } from '@/features/booking/model/personal-info';
import { summarizeSelection } from '@/features/booking/model/selection-totals';
import type { BookingFormDataStatus } from '@/features/booking/hooks/useBookingFormData';
import type { StepError } from '@/features/booking/hooks/useBookingFlow';
import { AddressFields } from './AddressFields';
import { ErrorAlert } from './ErrorAlert';
import { ServiceCard } from './ServiceCard';

interface ServiceSelectionStepProps {
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly onToggleService: (serviceId: string) => void;
  readonly requiresPickupAddress: boolean;
  readonly pickupAddress: Address;
  readonly onPickupAddressChange: (address: Address) => void;
  readonly addressSpec: HotsiteAddressSpec;
  /** State of the intake-schema and resource-options fetch that "Próximo" starts. */
  readonly formStatus: BookingFormDataStatus;
  readonly unavailableServiceIds: readonly string[];
  readonly submitError: StepError | null;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

function SelectionTotal({
  selected,
}: {
  readonly selected: readonly HotsiteServiceResponse[];
}): React.JSX.Element {
  const t = useTranslations('booking');
  const { formatMoney } = useFormatting();
  const { amount, durationMinutes, isFloor } = summarizeSelection(selected);
  const word =
    selected.length === 1 ? t('serviceSelection.singular') : t('serviceSelection.plural');
  return (
    <div className="mt-4" style={{ color: 'var(--ba-text)' }}>
      <p className="font-semibold" data-testid="selection-total">
        {isFloor
          ? t('serviceSelection.totalFrom', {
              count: selected.length,
              word,
              amount: formatMoney(amount),
            })
          : `${selected.length} ${word} — ${formatMoney(amount)} — ${formatDuration(durationMinutes)}`}
      </p>
      {isFloor && <p className="text-sm opacity-70">{t('serviceSelection.finalTotalHint')}</p>}
    </div>
  );
}

export function ServiceSelectionStep({
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
  onNext,
  onBack,
}: ServiceSelectionStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const [error, setError] = useState<string | null>(null);

  const selected = services.filter((service) => selectedServiceIds.includes(service.id));
  const hasUnavailable = selected.some((service) => unavailableServiceIds.includes(service.id));
  const isLoading = formStatus === 'loading';

  function handleNext() {
    if (selected.length === 0) return;
    if (requiresPickupAddress && !isAddressFilled(pickupAddress, addressSpec.requireNeighborhood)) {
      setError(t('serviceSelection.pickupAddressError'));
      return;
    }
    setError(null);
    onNext();
  }

  return (
    <div data-testid="step-service-selection">
      <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('serviceSelection.title')}
      </h2>

      <ul className="flex flex-col gap-3">
        {services.map((service) => (
          <li key={service.id}>
            <ServiceCard
              service={service}
              isSelected={selectedServiceIds.includes(service.id)}
              isUnavailable={unavailableServiceIds.includes(service.id)}
              onToggle={() => onToggleService(service.id)}
            />
          </li>
        ))}
      </ul>

      {selected.length > 0 && <SelectionTotal selected={selected} />}

      {requiresPickupAddress && (
        <div className="mt-6">
          <h3 className="mb-2 text-lg font-semibold" style={{ color: 'var(--ba-text)' }}>
            {t('serviceSelection.pickupAddressHeading')}
          </h3>
          <AddressFields
            value={pickupAddress}
            onChange={(address) => {
              onPickupAddressChange(address);
              setError(null);
            }}
            idPrefix="pickup-address"
            addressSpec={addressSpec}
            hasError={!!error}
          />
        </div>
      )}

      {error && (
        <div className="mt-4" data-testid="step1-error">
          <ErrorAlert>{error}</ErrorAlert>
        </div>
      )}

      {submitError && (
        <div className="mt-4" data-testid="step1-submit-error">
          <ErrorAlert
            focusOnMount
            hint={
              submitError.code === BookingErrorCode.INVALID_MULTIPLE_VARIABLE_SERVICES
                ? t('serviceSelection.multipleVariableHint')
                : undefined
            }
          >
            {submitError.message}
          </ErrorAlert>
        </div>
      )}

      {formStatus === 'error' && (
        <div className="mt-4" data-testid="step1-form-error">
          <ErrorAlert
            focusOnMount
            hint={t('serviceSelection.formLoadError')}
            onRetry={handleNext}
            retryLabel={t('errors.tryAgain')}
          >
            {t('serviceSelection.formLoadErrorTitle')}
          </ErrorAlert>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
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
          disabled={selected.length === 0 || isLoading || hasUnavailable}
          onClick={handleNext}
          data-testid="step-next"
          style={btnStyle}
          className="cursor-pointer border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? tc('loading') : tc('next')}
        </button>
      </div>
    </div>
  );
}
