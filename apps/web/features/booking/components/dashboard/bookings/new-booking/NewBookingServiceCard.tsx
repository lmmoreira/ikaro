'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { useServicePriceText } from '@/features/booking/hooks/useServicePriceText';

interface NewBookingServiceCardProps {
  readonly service: HotsiteServiceResponse;
  readonly isSelected: boolean;
  /** Its CUSTOMER_CHOICE requirement has no active resource: it cannot be booked right now. */
  readonly isUnavailable: boolean;
  readonly onToggle: () => void;
}

export function NewBookingServiceCard({
  service,
  isSelected,
  isUnavailable,
  onToggle,
}: NewBookingServiceCardProps): React.JSX.Element {
  const t = useTranslations('booking.serviceSelection');
  const text = useServicePriceText(service);
  let border = 'border-gray-200 bg-white hover:bg-gray-50';
  if (isUnavailable) border = 'border-red-300 bg-red-50/50';
  else if (isSelected) border = 'border-blue-500 bg-blue-50/60';

  return (
    <>
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${border}`}
        data-testid="service-card"
        data-service-id={service.id}
        data-requires-pickup={service.requiresPickupAddress ? 'true' : 'false'}
      >
        <input type="checkbox" checked={isSelected} onChange={onToggle} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">{service.name}</span>
          {service.description && (
            <span className="block text-sm text-gray-500">{service.description}</span>
          )}
        </span>
        <span className="text-right text-sm">
          {text.kind === 'fixed' ? (
            <>
              <span className="block font-semibold text-gray-900">{text.price}</span>
              <span className="block text-gray-500">{text.duration}</span>
            </>
          ) : (
            <>
              <span className="block font-semibold text-gray-900" data-testid="service-rate">
                {text.rate}
              </span>
              {text.durationRange && (
                <span className="block text-gray-500" data-testid="service-duration-range">
                  {text.durationRange}
                </span>
              )}
            </>
          )}
        </span>
      </label>
      {isUnavailable && (
        <p role="alert" className="mt-2 text-sm text-red-700" data-testid="service-unavailable">
          <strong>{t('unavailable')}</strong> {t('unavailableHint', { name: service.name })}
        </p>
      )}
    </>
  );
}
