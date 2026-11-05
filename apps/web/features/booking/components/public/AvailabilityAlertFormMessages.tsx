'use client';

import { useTranslations } from 'next-intl';
import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';

interface AvailabilityAlertFormMessagesProps {
  readonly hasFieldErrors: boolean;
  readonly rejectedSubmits: number;
  readonly submitError: string | null;
}

// Under the buttons: what a refused submit or a failed save says. The summary is the form-level
// announcement of the field messages above it, and it remounts per refusal so the same errors are
// announced again.
export function AvailabilityAlertFormMessages({
  hasFieldErrors,
  rejectedSubmits,
  submitError,
}: AvailabilityAlertFormMessagesProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <>
      {hasFieldErrors && (
        <div data-testid="alert-validation-error">
          <BrandedFeedbackMessage
            key={rejectedSubmits}
            focusOnMount
            title={t('availabilityAlert.errors.validationSummary')}
          />
        </div>
      )}

      {submitError && (
        <div data-testid="alert-submit-error">
          <BrandedFeedbackMessage
            focusOnMount
            title={submitError}
            hint={t('availabilityAlert.errors.submitFailedHint')}
          />
        </div>
      )}
    </>
  );
}
