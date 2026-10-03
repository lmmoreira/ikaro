'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { AvailableSlot, HotsiteServiceResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { summarizeSelection } from '@/features/booking/model/selection-totals';

interface BookingSummaryCardProps {
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
}

const labelStyle: React.CSSProperties = { color: 'var(--ba-text)', opacity: 0.7 };

export function BookingSummaryCard({
  services,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
}: BookingSummaryCardProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { formatMoney, formatDateLong, formatTime } = useFormatting();
  const selected = services.filter((service) => selectedServiceIds.includes(service.id));
  const { amount, durationMinutes, isFloor } = summarizeSelection(selected);
  const serviceLabel =
    selected.length === 1 ? t('summary.serviceSingular') : t('summary.servicePlural');

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
        {selected.map((service) => (
          <p key={service.id} className="font-semibold" style={{ color: 'var(--ba-text)' }}>
            {service.name}
          </p>
        ))}
        <p className="mt-0.5 text-sm" style={{ color: 'var(--ba-primary)' }}>
          {isFloor
            ? `${t('summary.fromAmount', { amount: formatMoney(amount) })} — ${t('summary.durationToChoose')}`
            : `${formatMoney(amount)} — ${formatDuration(durationMinutes)}`}
        </p>

        <hr className="my-3.5" style={{ borderColor: 'var(--ba-secondary)' }} />

        <p className="mb-1" style={labelStyle}>
          {t('summary.dateTimeLabel')}
        </p>
        <p className="font-semibold" style={{ color: 'var(--ba-text)' }}>
          {formatDateLong(new Date(selectedDate + 'T00:00:00Z'))} {t('summary.at')}{' '}
          {formatTime(new Date(selectedSlot.startsAt))}
        </p>
      </div>
    </div>
  );
}
