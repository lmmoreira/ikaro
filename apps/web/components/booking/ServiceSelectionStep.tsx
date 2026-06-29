'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import type { Address, HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import { formatDuration } from '@/lib/formatting/format-duration';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { isAddressFilled } from '@/lib/booking/personal-info';
import { AddressFields } from './AddressFields';
import { ErrorAlert } from './ErrorAlert';

interface ServiceSelectionStepProps {
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly onToggleService: (serviceId: string) => void;
  readonly requiresPickupAddress: boolean;
  readonly pickupAddress: Address;
  readonly onPickupAddressChange: (address: Address) => void;
  readonly addressSpec: HotsiteAddressSpec;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

function cardStyle(isSelected: boolean): React.CSSProperties {
  return {
    borderRadius: 'var(--ba-radius)',
    borderColor: isSelected ? 'var(--ba-primary)' : 'var(--ba-secondary)',
  };
}

export function ServiceSelectionStep({
  services,
  selectedServiceIds,
  onToggleService,
  requiresPickupAddress,
  pickupAddress,
  onPickupAddressChange,
  addressSpec,
  onNext,
  onBack,
}: ServiceSelectionStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const [error, setError] = useState<string | null>(null);

  const { formatMoney } = useFormatting();
  const selected = services.filter((service) => selectedServiceIds.includes(service.id));
  const totalAmount = selected.reduce((sum, service) => sum + service.price.amount, 0);
  const totalDuration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);
  const serviceWord =
    selected.length === 1 ? t('serviceSelection.singular') : t('serviceSelection.plural');

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
        {services.map((service) => {
          const isSelected = selectedServiceIds.includes(service.id);
          return (
            <li key={service.id}>
              <label
                className="flex cursor-pointer items-center gap-3 border p-4"
                style={cardStyle(isSelected)}
                data-testid="service-card"
                data-requires-pickup={service.requiresPickupAddress ? 'true' : 'false'}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleService(service.id)}
                />
                <div className="flex-1">
                  <p className="font-semibold" style={{ color: 'var(--ba-text)' }}>
                    {service.name}
                  </p>
                  {service.description && (
                    <p className="text-sm opacity-75">{service.description}</p>
                  )}
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold" style={{ color: 'var(--ba-primary)' }}>
                    {service.price.formatted}
                  </p>
                  <p className="opacity-75">{formatDuration(service.durationMinutes)}</p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {selected.length > 0 && (
        <p
          className="mt-4 font-semibold"
          style={{ color: 'var(--ba-text)' }}
          data-testid="selection-total"
        >
          {selected.length} {serviceWord} — {formatMoney(totalAmount)} —{' '}
          {formatDuration(totalDuration)}
        </p>
      )}

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
          disabled={selected.length === 0}
          onClick={handleNext}
          data-testid="step-next"
          style={btnStyle}
          className="cursor-pointer border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {tc('next')}
        </button>
      </div>
    </div>
  );
}
