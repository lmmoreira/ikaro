'use client';

import type React from 'react';
import type { AvailableSlot, HotsiteServiceResponse } from '@ikaro/types';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { formatDuration } from '@/lib/hotsite/format-duration';

interface BookingSummaryCardProps {
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 'var(--ba-radius)',
  borderColor: 'var(--ba-secondary)',
  boxShadow: 'var(--ba-shadow)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  opacity: 0.65,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export function BookingSummaryCard({
  services,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
}: BookingSummaryCardProps) {
  const { formatMoney, formatDateLong, formatTime } = useFormatting();
  const selected = services.filter((service) => selectedServiceIds.includes(service.id));
  const totalAmount = selected.reduce((sum, service) => sum + service.price.amount, 0);
  const totalDuration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);
  const serviceLabel = selected.length === 1 ? 'Serviço' : 'Serviços';

  return (
    <div className="mt-6">
      <h3 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        Revisar pedido
      </h3>
      <div className="border p-4" style={cardStyle}>
        <p className="mb-2" style={labelStyle}>
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
          Data e horário
        </p>
        <p className="font-semibold" style={{ color: 'var(--ba-text)' }}>
          {formatDateLong(new Date(selectedDate + 'T00:00:00Z'))} às{' '}
          {formatTime(new Date(selectedSlot.startsAt))}
        </p>
      </div>
    </div>
  );
}
