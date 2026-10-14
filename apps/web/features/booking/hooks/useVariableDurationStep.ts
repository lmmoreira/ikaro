'use client';

import { useEffect } from 'react';
import type { HotsiteServiceResponse } from '@ikaro/types';
import type { ChosenDuration } from '@/features/booking/model/basket-lines';
import { durationOptions } from '@/features/booking/model/duration-options';
import type { StepError } from './useBookingFlow';
import { useServiceQuote, type ServiceQuoteState } from './useServiceQuote';

interface UseVariableDurationStepParams {
  readonly slug: string;
  /** The basket's one customer-selected-duration service. */
  readonly service: HotsiteServiceResponse;
  readonly duration: ChosenDuration | null;
  readonly error: StepError | null;
  readonly onChooseDuration: (minutes: number) => void;
  readonly onQuoted: (minutes: number, amount: number) => void;
}

export interface VariableDurationStepState {
  readonly options: readonly number[];
  readonly quote: ServiceQuoteState;
  readonly retryQuote: () => void;
  readonly canContinue: boolean;
}

// The behaviour of the duration step, shared by the hotsite's and the dashboard's views. The duration
// is the only thing the step asks: date and time come from the availability step that follows
// (re-fetched with the chosen duration). The total is the server's quote — exactly what booking
// creation persists — so the step fails closed: a duration without a resolved quote can never be
// submitted.
export function useVariableDurationStep({
  slug,
  service,
  duration,
  error,
  onChooseDuration,
  onQuoted,
}: UseVariableDurationStepParams): VariableDurationStepState {
  const options = durationOptions(service);
  const { state, retry } = useServiceQuote(slug, service.id, duration?.minutes ?? null);
  const first = options[0];

  // The step opens already valid on the minimum — unless it was reopened by an error, which must
  // be answered with a deliberate new choice, never silently replaced.
  useEffect(() => {
    if (duration === null && error === null && first !== undefined) onChooseDuration(first);
  }, [duration, error, first, onChooseDuration]);

  useEffect(() => {
    if (
      duration &&
      state.status === 'ready' &&
      state.quote.durationMinutes === duration.minutes &&
      duration.quotedAmount !== state.quote.price.amount
    ) {
      onQuoted(duration.minutes, state.quote.price.amount);
    }
  }, [duration, state, onQuoted]);

  const canContinue =
    duration !== null &&
    duration.quotedAmount !== null &&
    state.status === 'ready' &&
    state.quote.durationMinutes === duration.minutes;

  return { options, quote: state, retryQuote: retry, canContinue };
}
