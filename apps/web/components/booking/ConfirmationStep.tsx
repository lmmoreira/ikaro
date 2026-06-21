'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { AvailableSlot, HotsiteServiceResponse } from '@ikaro/types';
import { ErrorAlert } from './ErrorAlert';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { formatDuration } from '@/lib/formatting/format-duration';

export type BookingSubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';

interface ConfirmationStepProps {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
  readonly status: BookingSubmissionStatus;
  readonly errorMessage: string | null;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

export function ConfirmationStep({
  slug,
  services,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
  status,
  errorMessage,
  onSubmit,
  onBack,
}: ConfirmationStepProps) {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const { formatMoney, formatDateLong, formatTime } = useFormatting();
  const selected = services.filter((service) => selectedServiceIds.includes(service.id));
  const totalAmount = selected.reduce((sum, service) => sum + service.price.amount, 0);
  const totalDuration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);

  if (status === 'success') {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
          {t('confirmation.successHeading')}
        </h2>
        <p data-testid="booking-success">{t('confirmation.successBody')}</p>
        <a
          href={`/${slug}`}
          className="mt-6 inline-block border px-6 py-3"
          style={{
            borderRadius: 'var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        >
          {t('confirmation.backToSite')}
        </a>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('confirmation.heading')}
      </h2>

      <ul className="mb-4 flex flex-col gap-1">
        {selected.map((service) => (
          <li
            key={service.id}
            className="flex justify-between text-sm"
            style={{ color: 'var(--ba-text)' }}
          >
            <span>{service.name}</span>
            <span>{service.price.formatted}</span>
          </li>
        ))}
      </ul>

      <p className="mb-2 font-semibold" style={{ color: 'var(--ba-text)' }}>
        Total: {formatMoney(totalAmount)} — {formatDuration(totalDuration)}
      </p>

      <p data-testid="confirmation-datetime" style={{ color: 'var(--ba-text)' }}>
        {formatDateLong(new Date(selectedDate + 'T00:00:00Z'))} {t('summary.at')}{' '}
        {formatTime(new Date(selectedSlot.startsAt))}
      </p>

      {status === 'error' && errorMessage && (
        <div className="mt-4" data-testid="confirmation-error">
          <ErrorAlert>{errorMessage}</ErrorAlert>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={status === 'submitting'}
          className="border px-6 py-3 disabled:cursor-not-allowed disabled:opacity-40"
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
          onClick={onSubmit}
          disabled={status === 'submitting'}
          data-testid="step-confirm"
          style={btnStyle}
          className="border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'submitting' ? t('confirmation.sending') : t('confirmation.submit')}
        </button>
      </div>
    </div>
  );
}
