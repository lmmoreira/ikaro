'use client';

import { useCallback, useMemo, useState } from 'react';
import type { HotsiteServiceResponse } from '@ikaro/types';
import {
  DEFAULT_BOOKING_STEPS,
  resolveBookingSteps,
  type BookingStepId,
} from '@/features/booking/model/booking-steps';

interface UseBookingFlowParams {
  readonly selectedServices: readonly HotsiteServiceResponse[];
  /** False until the customer has left Step 1: the list is the default four steps until then. */
  readonly resolved: boolean;
  readonly hasIntake: boolean;
}

export interface StepError {
  readonly message: string;
  readonly code?: string;
}

export interface BookingFlow {
  readonly steps: readonly BookingStepId[];
  readonly stepId: BookingStepId;
  readonly position: number;
  readonly total: number;
  readonly goNext: () => void;
  readonly goBack: () => void;
  readonly goTo: (stepId: BookingStepId) => void;
  readonly errors: Readonly<Partial<Record<BookingStepId, StepError>>>;
  readonly setError: (stepId: BookingStepId, error: StepError | null) => void;
  readonly clearErrors: () => void;
}

function useStepErrors() {
  const [errors, setErrors] = useState<Partial<Record<BookingStepId, StepError>>>({});

  const setError = useCallback((id: BookingStepId, error: StepError | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (error === null) delete next[id];
      else next[id] = error;
      return next;
    });
  }, []);

  const clearErrors = useCallback(() => setErrors({}), []);

  return { errors, setError, clearErrors };
}

// Symbolic step ids replace the former `Step = 1|2|3|4`: the list is built from data, so a story
// that adds a step only extends resolveBookingSteps(), never this hook.
export function useBookingFlow({
  selectedServices,
  resolved,
  hasIntake,
}: UseBookingFlowParams): BookingFlow {
  const steps = useMemo<readonly BookingStepId[]>(
    () =>
      resolved
        ? resolveBookingSteps({ services: selectedServices, hasIntake })
        : DEFAULT_BOOKING_STEPS,
    [resolved, selectedServices, hasIntake],
  );
  const [stepId, setStepId] = useState<BookingStepId>('services');
  const { errors, setError, clearErrors } = useStepErrors();

  const move = useCallback(
    (offset: number) => {
      const next = steps[steps.indexOf(stepId) + offset];
      if (next) setStepId(next);
    },
    [steps, stepId],
  );

  return {
    steps,
    stepId,
    position: Math.max(steps.indexOf(stepId), 0) + 1,
    total: steps.length,
    goNext: () => move(1),
    goBack: () => move(-1),
    goTo: setStepId,
    errors,
    setError,
    clearErrors,
  };
}
