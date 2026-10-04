'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type {
  AvailableSlot,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { composeBasket, type ChosenDuration } from '@/features/booking/model/basket-lines';
import { BasketLines, useBasketTotalText } from './BasketLines';

interface BookingSummaryCardProps {
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
  readonly picks?: readonly ResourceSelectionItem[];
  readonly requirements?: readonly HotsiteServiceResourceOptionsRequirement[];
  /** The customer-selected duration (with its quote): the total follows it once quoted. */
  readonly duration?: ChosenDuration | null;
}

const labelStyle: React.CSSProperties = { color: 'var(--ba-text)', opacity: 0.7 };

export function BookingSummaryCard({
  services,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
  picks = [],
  requirements = [],
  duration = null,
}: BookingSummaryCardProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { formatDateLong, formatTime } = useFormatting();
  const basket = composeBasket({
    services,
    serviceIds: selectedServiceIds,
    picks,
    requirements,
    duration,
    slotStart: new Date(selectedSlot.startsAt),
  });
  const totalText = useBasketTotalText(basket);
  const serviceLabel =
    basket.lines.length === 1 ? t('summary.serviceSingular') : t('summary.servicePlural');
  const date = formatDateLong(new Date(selectedDate + 'T00:00:00Z'));

  return (
    <div className="mt-6">
      <h3 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('summary.heading')}
      </h3>
      <div
        className="border p-4"
        style={{ borderRadius: 'var(--ba-radius)', borderColor: 'var(--ba-secondary)' }}
      >
        <p className="mb-1 text-sm font-medium" style={labelStyle}>
          {serviceLabel}
        </p>
        {basket.hasJourney ? (
          <BasketLines basket={basket} variant="summary" />
        ) : (
          basket.lines.map((line) => (
            <p key={line.serviceId} className="font-semibold" style={{ color: 'var(--ba-text)' }}>
              {line.name}
            </p>
          ))
        )}
        {!basket.hasJourney && (
          <p className="mt-0.5 text-sm" style={{ color: 'var(--ba-primary)' }}>
            {totalText}
          </p>
        )}

        <hr className="my-3.5" style={{ borderColor: 'var(--ba-secondary)' }} />

        <p className="mb-1" style={labelStyle}>
          {t('summary.dateTimeLabel')}
        </p>
        <p className="font-semibold" style={{ color: 'var(--ba-text)' }}>
          {basket.hasJourney && basket.endsAt
            ? `${date} · ${formatTime(new Date(selectedSlot.startsAt))} – ${formatTime(basket.endsAt)}`
            : `${date} ${t('summary.at')} ${formatTime(new Date(selectedSlot.startsAt))}`}
        </p>
        {basket.hasJourney && (
          <p className="mt-2 font-semibold" style={{ color: 'var(--ba-text)' }}>
            Total: {totalText}
          </p>
        )}
      </div>
    </div>
  );
}
