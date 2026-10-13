'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { useServiceRateText } from '@/features/booking/hooks/useServicePriceText';
import { useVariableDurationStep } from '@/features/booking/hooks/useVariableDurationStep';
import type { StepError } from '@/features/booking/hooks/useBookingFlow';
import type { ChosenDuration } from '@/features/booking/model/basket-lines';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { ErrorAlert } from './ErrorAlert';

interface VariableDurationStepProps {
  readonly slug: string;
  /** The basket's one customer-selected-duration service. */
  readonly service: HotsiteServiceResponse;
  readonly duration: ChosenDuration | null;
  readonly error: StepError | null;
  readonly onChooseDuration: (minutes: number) => void;
  readonly onQuoted: (minutes: number, amount: number) => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

const cardStyle: React.CSSProperties = {
  borderRadius: 'var(--ba-radius)',
  borderColor: 'var(--ba-secondary)',
};

function RateHint({
  service,
}: {
  readonly service: HotsiteServiceResponse;
}): React.JSX.Element | null {
  const t = useTranslations('booking');
  const perUnit = useServiceRateText(service);
  const { bookingPolicy: policy } = service;
  if (perUnit === null) return null;

  return (
    <p className="text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
      {policy.durationMinMinutes === null
        ? perUnit
        : t('duration.rateHint', { rate: perUnit, min: formatDuration(policy.durationMinMinutes) })}
    </p>
  );
}

// The duration is the only thing this step asks: date and time come from the availability step
// that follows (re-fetched with the chosen duration), and there is no participant input here. The
// total is the server's quote — exactly what booking creation persists — so the step fails closed:
// a duration without a resolved quote can never be submitted.
export function VariableDurationStep({
  slug,
  service,
  duration,
  error,
  onChooseDuration,
  onQuoted,
  onBack,
  onNext,
}: VariableDurationStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const { formatMoney } = useFormatting();
  const {
    durationMinMinutes: min,
    durationMaxMinutes: max,
    durationIncrementMinutes: step,
  } = service.bookingPolicy;
  const {
    options,
    quote: state,
    retryQuote: retry,
    canContinue,
  } = useVariableDurationStep({ slug, service, duration, error, onChooseDuration, onQuoted });

  return (
    <div data-testid="step-variable-duration">
      <h2 className="mb-1.5 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('duration.heading')}
      </h2>
      <p className="mb-5 text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
        {service.name}
      </p>

      {options.length === 0 ? (
        <ErrorAlert>{t('duration.unavailable')}</ErrorAlert>
      ) : (
        <div className="border p-4" style={cardStyle}>
          <label
            htmlFor="booking-duration"
            className="mb-1.5 block text-sm font-semibold"
            style={{ color: 'var(--ba-text)' }}
          >
            {t('duration.label')}
          </label>
          <select
            id="booking-duration"
            data-testid="duration-select"
            value={duration?.minutes ?? ''}
            onChange={(event) => onChooseDuration(Number(event.target.value))}
            className="w-full border px-3 py-2.5"
            style={{
              ...cardStyle,
              backgroundColor: 'var(--ba-background)',
              color: 'var(--ba-text)',
            }}
          >
            {duration === null && (
              <option value="" disabled>
                {t('duration.choose')}
              </option>
            )}
            {options.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDuration(minutes)}
              </option>
            ))}
          </select>
          {min !== null && max !== null && step !== null && (
            <p className="mt-2 text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
              {t('duration.rangeHint', {
                min: formatDuration(min),
                max: formatDuration(max),
                step: formatDuration(step),
              })}
            </p>
          )}
        </div>
      )}

      {duration !== null && (
        <div className="mt-4 border p-4" style={cardStyle} data-testid="duration-quote">
          <RateHint service={service} />
          {state.status === 'loading' && (
            <output
              aria-busy="true"
              aria-label={t('duration.quoteLoading')}
              data-testid="duration-quote-loading"
              className="mt-2 block h-7 w-40 animate-pulse rounded"
              style={{ backgroundColor: 'var(--ba-secondary)' }}
            />
          )}
          {state.status === 'error' && (
            <div className="mt-2" data-testid="duration-quote-error">
              <ErrorAlert onRetry={retry} retryLabel={t('errors.tryAgain')}>
                {t('duration.quoteError')}
              </ErrorAlert>
            </div>
          )}
          {state.status === 'ready' && (
            <>
              <p
                className="mt-2 text-xl font-bold"
                style={{ color: 'var(--ba-text)' }}
                data-testid="duration-total"
              >
                {t('duration.total', { amount: formatMoney(state.quote.price.amount) })}
              </p>
              <p className="text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
                {t('duration.priceRecorded')}
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4" data-testid="duration-error">
          <ErrorAlert focusOnMount>{error.message}</ErrorAlert>
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
          disabled={!canContinue}
          onClick={onNext}
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
