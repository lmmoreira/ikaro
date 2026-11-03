'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';

type SheetToOpen = 'no-show' | 'correct-no-show';

// What the booking detail reports under the buttons of its action pane (TD57-S12): the failure of
// the action the user just took, never a card at the top of the page.
//  - `setInlineError` is the page's channel for an action that failed (approve, reject, cancel...);
//  - a network/5xx failure of the no-show or of its correction (UC-074) reports in the pane with a
//    retry, while the 409 "already closed" stays a banner because it is a state of the booking.
export function useBookingPaneFeedback(
  actionState: string,
  openSheet: (sheet: SheetToOpen) => void,
) {
  const t = useTranslations('dashboard.bookingDetail');
  const form = useFormFeedback();
  const { setError, clear } = form;

  const setInlineError = useCallback(
    (message: string | null) => {
      if (message === null) clear();
      else setError(message);
    },
    [clear, setError],
  );

  let noShowFailure: FeedbackModel | null = null;
  if (actionState === 'no-show-error') {
    noShowFailure = {
      variant: 'error',
      title: t('noShowErrorTitle'),
      hint: t('noShowErrorBody'),
      onRetry: () => openSheet('no-show'),
      retryLabel: t('noShowRetry'),
      testId: 'booking-no-show-error',
    };
  } else if (actionState === 'correct-error') {
    noShowFailure = {
      variant: 'error',
      title: t('correctErrorTitle'),
      hint: t('correctErrorBody'),
      onRetry: () => openSheet('correct-no-show'),
      retryLabel: t('noShowRetry'),
      testId: 'booking-no-show-correct-error',
    };
  }

  return { paneFeedback: form.feedback ?? noShowFailure, setInlineError };
}
