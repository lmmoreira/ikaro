'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import type { BookingSubmissionStatus } from '@/features/booking/components/public/ConfirmationStep';
import { NewBookingStepLayout } from './NewBookingStepLayout';

interface NewBookingConfirmStepProps {
  readonly status: BookingSubmissionStatus;
  /** The recap of the whole booking — shown here because mobile has no side summary. */
  readonly summary: React.ReactNode;
  readonly onBack: () => void;
  readonly onSubmit: () => void;
}

// The last step: what is about to be created and what happens next. The booking is created
// directly APPROVED (UC-108) — staff are the approver — so there is no waiting state to explain.
export function NewBookingConfirmStep({
  status,
  summary,
  onBack,
  onSubmit,
}: NewBookingConfirmStepProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.confirm');
  const submitting = status === 'submitting';

  return (
    <NewBookingStepLayout
      summary={null}
      onBack={submitting ? null : onBack}
      onNext={onSubmit}
      nextDisabled={submitting}
      nextLabel={submitting ? t('creating') : t('create')}
    >
      <div data-testid="step-confirmation">
        <h2 className="text-xl font-bold text-gray-900">{t('heading')}</h2>
      </div>
      {summary}
      <Card>
        <CardContent className="space-y-1 p-4 text-sm text-gray-600">
          <p className="font-semibold text-gray-900">{t('whatHappens')}</p>
          <p>{t('whatHappensBody')}</p>
        </CardContent>
      </Card>
    </NewBookingStepLayout>
  );
}
