'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type {
  AvailableSlot,
  BookingResponse,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { composeBasket, type ChosenDuration } from '@/features/booking/model/basket-lines';
import { BasketLines, useBasketTotalText } from './BasketLines';
import { BookingSubmittedDetails } from './BookingSubmittedDetails';
import { ErrorAlert } from './ErrorAlert';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

export type BookingSubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';

interface ConfirmationStepProps {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
  readonly status: BookingSubmissionStatus;
  readonly errorMessage: string | null;
  readonly booking: BookingResponse | null;
  readonly picks: readonly ResourceSelectionItem[];
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
  /** The customer-selected duration (with its quote), when the basket has such a service. */
  readonly duration?: ChosenDuration | null;
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
  booking,
  picks,
  requirements,
  duration = null,
  onSubmit,
  onBack,
}: ConfirmationStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
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

  if (status === 'success') {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
          {t('confirmation.successHeading')}
        </h2>
        <p data-testid="booking-success">{t('confirmation.successBody')}</p>
        {booking && (
          <BookingSubmittedDetails
            services={services}
            booking={booking}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            picks={picks}
            requirements={requirements}
          />
        )}
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
        {basket.hasJourney ? t('legs.confirmHeading') : t('confirmation.heading')}
      </h2>

      <BasketLines basket={basket} variant="confirmation" />

      <p
        className="mb-2 font-semibold"
        style={{ color: 'var(--ba-text)' }}
        data-testid="confirmation-total"
      >
        Total: {totalText}
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
          className="cursor-pointer border px-6 py-3 disabled:cursor-not-allowed disabled:opacity-40"
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
          className="cursor-pointer border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'submitting' ? t('confirmation.sending') : t('confirmation.submit')}
        </button>
      </div>
    </div>
  );
}
