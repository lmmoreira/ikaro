'use client';

import { useTranslations } from 'next-intl';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

interface CustomerLoyaltyRouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function CustomerLoyaltyRouteError({
  error: _error,
  reset,
}: CustomerLoyaltyRouteErrorProps): React.JSX.Element {
  const t = useTranslations('dashboard.loyaltyPage');
  const bookingT = useTranslations('booking');

  return (
    <section className="mx-auto w-full max-w-lg py-10">
      <FeedbackMessage
        title={t('routeErrorTitle')}
        onRetry={reset}
        retryLabel={bookingT('errors.tryAgain')}
        testId="page-feedback"
      >
        {t('routeErrorBody')}
      </FeedbackMessage>
    </section>
  );
}
