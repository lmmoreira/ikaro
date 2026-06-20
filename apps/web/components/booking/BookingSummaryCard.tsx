'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { AvailableSlot, HotsiteServiceResponse } from '@ikaro/types';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { formatDuration } from '@/lib/formatting/format-duration';

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
}: BookingSummaryCardProps) {
  const t = useTranslations('booking');
  const { formatMoney, formatDateLong, formatTime } = useFormatting();
  const selected = services.filter((service) => selectedServiceIds.includes(service.id));
  const totalAmount = selected.reduce((sum, service) => sum + service.price.amount, 0);
  const totalDuration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);
  const serviceLabel =
    selected.length === 1 ? t('summary.serviceSingular') : t('summary.servicePlural');

  return (
    <div className="mt-6">
      <h3 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('summary.heading')}
      </h3>
      <div className="rounded border p-4" style={{ borderColor: 'var(--ba-secondary)' }}>
        <p className="mb-1 text-sm font-medium" style={labelStyle}>
          {serviceLabel}
        </p>
        {selected.map((service) => (
          <p key={service.id} className="font-semibold" style={{ color: 'var(--ba-text)' }}>
            {service.name}
          </p>
        ))}
        <p className="mt-0.5 text-sm" style={{ color: 'var(--ba-primary)' }}>
          {formatMoney(totalAmount)} — {formatDuration(totalDuration)}
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
