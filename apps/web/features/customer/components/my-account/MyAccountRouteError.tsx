'use client';

import { useTranslations } from 'next-intl';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

interface MyAccountRouteErrorProps {
  readonly onRetry: () => void;
}

/** The customer account's route error boundary (`17`): a page-level message with a retry. */
export function MyAccountRouteError({ onRetry }: MyAccountRouteErrorProps): React.JSX.Element {
  const t = useTranslations('customer.error');

  return (
    <section className="mx-auto w-full max-w-lg py-10">
      <FeedbackMessage
        title={t('title')}
        onRetry={onRetry}
        retryLabel={t('retry')}
        testId="my-account-route-error"
      >
        {t('body')}
      </FeedbackMessage>
    </section>
  );
}
