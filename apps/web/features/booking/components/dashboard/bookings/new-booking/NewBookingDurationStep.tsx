'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import type { StepError } from '@/features/booking/hooks/useBookingFlow';
import { useServiceRateText } from '@/features/booking/hooks/useServicePriceText';
import { useVariableDurationStep } from '@/features/booking/hooks/useVariableDurationStep';
import type { ChosenDuration } from '@/features/booking/model/basket-lines';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { Card, CardContent } from '@/shared/components/ui/card';
import { NewBookingErrorBanner } from './NewBookingErrorBanner';
import { NewBookingStepLayout } from './NewBookingStepLayout';
import { INPUT_CLASS, LABEL_CLASS } from './new-booking-styles';

interface NewBookingDurationStepProps {
  readonly slug: string;
  /** The basket's one customer-selected-duration service. */
  readonly service: HotsiteServiceResponse;
  readonly duration: ChosenDuration | null;
  readonly error: StepError | null;
  readonly onChooseDuration: (minutes: number) => void;
  readonly onQuoted: (minutes: number, amount: number) => void;
  readonly summary: React.ReactNode;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

// The duration is the only thing this step asks; the total is the server's quote — exactly what
// the booking persists — so the step fails closed (useVariableDurationStep).
export function NewBookingDurationStep({
  slug,
  service,
  duration,
  error,
  onChooseDuration,
  onQuoted,
  summary,
  onBack,
  onNext,
}: NewBookingDurationStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tn = useTranslations('dashboard.newBooking.steps');
  const { formatMoney } = useFormatting();
  const rate = useServiceRateText(service);
  const { options, quote, retryQuote, canContinue } = useVariableDurationStep({
    slug,
    service,
    duration,
    error,
    onChooseDuration,
    onQuoted,
  });
  const {
    durationMinMinutes: min,
    durationMaxMinutes: max,
    durationIncrementMinutes: step,
  } = service.bookingPolicy;

  return (
    <NewBookingStepLayout
      summary={summary}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!canContinue}
    >
      <div data-testid="step-variable-duration">
        <h2 className="text-xl font-bold text-gray-900">{t('duration.heading')}</h2>
        <p className="mt-1 text-sm text-gray-600">{service.name}</p>
      </div>

      {options.length === 0 ? (
        <NewBookingErrorBanner>{t('duration.unavailable')}</NewBookingErrorBanner>
      ) : (
        <Card>
          <CardContent className="p-4">
            <label htmlFor="booking-duration" className={LABEL_CLASS}>
              {t('duration.label')}
            </label>
            <select
              id="booking-duration"
              data-testid="duration-select"
              className={INPUT_CLASS}
              value={duration?.minutes ?? ''}
              onChange={(event) => onChooseDuration(Number(event.target.value))}
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
              <p className="mt-2 text-sm text-gray-600">
                {t('duration.rangeHint', {
                  min: formatDuration(min),
                  max: formatDuration(max),
                  step: formatDuration(step),
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {duration !== null && (
        <Card data-testid="duration-quote">
          <CardContent className="space-y-2 p-4 text-sm text-gray-600">
            {rate && (
              <p>
                {min === null ? rate : t('duration.rateHint', { rate, min: formatDuration(min) })}
              </p>
            )}
            {quote.status === 'loading' && (
              <output
                aria-busy="true"
                className="block h-6 w-40 animate-pulse rounded bg-gray-200"
              />
            )}
            {quote.status === 'error' && (
              <NewBookingErrorBanner
                testId="duration-quote-error"
                onRetry={retryQuote}
                retryLabel={tn('retry')}
              >
                {t('duration.quoteError')}
              </NewBookingErrorBanner>
            )}
            {quote.status === 'ready' && (
              <>
                <p className="text-lg font-bold text-gray-900" data-testid="duration-total">
                  {t('duration.total', { amount: formatMoney(quote.quote.price.amount) })}
                </p>
                <p>{t('duration.priceRecorded')}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <NewBookingErrorBanner focusOnMount testId="duration-error">
          {error.message}
        </NewBookingErrorBanner>
      )}
    </NewBookingStepLayout>
  );
}
