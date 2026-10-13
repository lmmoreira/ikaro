'use client';

import { useState } from 'react';
import type { AvailableSlot, BookingResponse } from '@ikaro/types';
import {
  resolveBookingSubmitErrorRoute,
  resolveErrorStep,
  type BookingStepId,
  type ResolvedErrorStep,
} from '@/features/booking/model/booking-steps';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';
import type { BookingSubmissionStatus } from '../components/public/ConfirmationStep';

export interface BookingSubmitRunnerParams {
  readonly selectedSlot: AvailableSlot | null;
  readonly locale: SupportedLocale;
  readonly steps: readonly BookingStepId[];
  /** Re-fetches the options and returns the first picker step whose pick is missing or stale. */
  readonly resolveInvalidPickerStep: () => Promise<BookingStepId | null>;
  readonly onRoute: (resolved: ResolvedErrorStep) => void;
  readonly onSubmitStart: () => void;
}

export interface BookingSubmitRunner {
  readonly status: BookingSubmissionStatus;
  readonly booking: BookingResponse | null;
  /** Runs one submit; a failure is routed to the step the error belongs to (booking-steps.ts). */
  readonly run: (submit: (slot: AvailableSlot) => Promise<BookingResponse>) => Promise<void>;
}

async function routeSubmitError(
  err: unknown,
  params: BookingSubmitRunnerParams,
): Promise<boolean> {
  const route = resolveBookingSubmitErrorRoute(err, params.locale);
  const invalidPicker = route.target === 'picker' ? await params.resolveInvalidPickerStep() : null;
  const resolved = resolveErrorStep(route, params.steps, params.locale, invalidPicker);
  params.onRoute(resolved);
  return resolved.kind === 'step' && resolved.stepId === 'confirmation';
}

// The submit lifecycle both booking flows share (the hotsite's and the staff one): the status it
// drives, the booking it returns and where a failure lands. Only the request itself differs, so
// each flow passes it to `run()`.
export function useBookingSubmitRunner(params: BookingSubmitRunnerParams): BookingSubmitRunner {
  const [status, setStatus] = useState<BookingSubmissionStatus>('idle');
  const [booking, setBooking] = useState<BookingResponse | null>(null);

  async function run(submit: (slot: AvailableSlot) => Promise<BookingResponse>): Promise<void> {
    if (!params.selectedSlot) return;
    setStatus('submitting');
    params.onSubmitStart();
    try {
      setBooking(await submit(params.selectedSlot));
      setStatus('success');
    } catch (err) {
      setStatus((await routeSubmitError(err, params)) ? 'error' : 'idle');
    }
  }

  return { status, booking, run };
}
