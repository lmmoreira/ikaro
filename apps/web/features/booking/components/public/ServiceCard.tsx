'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { useServicePriceText } from '@/features/booking/hooks/useServicePriceText';

interface ServiceCardProps {
  readonly service: HotsiteServiceResponse;
  readonly isSelected: boolean;
  /** Its CUSTOMER_CHOICE requirement has no active resource: it cannot be booked right now. */
  readonly isUnavailable: boolean;
  readonly onToggle: () => void;
}

function cardBorderColor(isSelected: boolean, isUnavailable: boolean): string {
  if (isUnavailable) return '#b91c1c';
  return isSelected ? 'var(--ba-primary)' : 'var(--ba-secondary)';
}

function cardStyle(isSelected: boolean, isUnavailable: boolean): React.CSSProperties {
  return {
    borderRadius: 'var(--ba-radius)',
    borderColor: cardBorderColor(isSelected, isUnavailable),
  };
}

function PriceAndDuration({
  service,
}: {
  readonly service: HotsiteServiceResponse;
}): React.JSX.Element {
  const text = useServicePriceText(service);

  if (text.kind === 'fixed') {
    return (
      <>
        <p className="font-semibold" style={{ color: 'var(--ba-primary)' }}>
          {text.price}
        </p>
        <p className="opacity-75">{text.duration}</p>
      </>
    );
  }
  return (
    <>
      <p
        className="font-semibold"
        style={{ color: 'var(--ba-primary)' }}
        data-testid="service-rate"
      >
        {text.rate}
      </p>
      {text.durationRange && (
        <p className="opacity-75" data-testid="service-duration-range">
          {text.durationRange}
        </p>
      )}
    </>
  );
}

export function ServiceCard({
  service,
  isSelected,
  isUnavailable,
  onToggle,
}: ServiceCardProps): React.JSX.Element {
  const t = useTranslations('booking');
  return (
    <>
      <label
        className="flex cursor-pointer items-center gap-3 border p-4"
        style={cardStyle(isSelected, isUnavailable)}
        data-testid="service-card"
        data-service-id={service.id}
        data-requires-pickup={service.requiresPickupAddress ? 'true' : 'false'}
      >
        <input type="checkbox" checked={isSelected} onChange={onToggle} />
        <div className="flex-1">
          <p className="font-semibold" style={{ color: 'var(--ba-text)' }}>
            {service.name}
          </p>
          {service.description && <p className="text-sm opacity-75">{service.description}</p>}
        </div>
        <div className="text-right text-sm">
          <PriceAndDuration service={service} />
        </div>
      </label>
      {isUnavailable && (
        <div
          role="alert"
          className="mt-2 p-3 text-sm"
          style={{ backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: 'var(--ba-radius)' }}
          data-testid="service-unavailable"
        >
          <strong>{t('serviceSelection.unavailable')}</strong>
          <br />
          {t('serviceSelection.unavailableHint', { name: service.name })}
        </div>
      )}
    </>
  );
}
