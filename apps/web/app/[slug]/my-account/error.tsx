'use client';

import { useTranslations } from 'next-intl';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

interface MyAccountRouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function MyAccountRouteError({
  error: _error,
  reset,
}: MyAccountRouteErrorProps): React.JSX.Element {
  const t = useTranslations('customer.error');

  return (
    <section className="mx-auto w-full max-w-lg py-10">
      <FeedbackMessage
        title={t('title')}
        onRetry={reset}
        retryLabel={t('retry')}
        testId="my-account-route-error"
      >
        {t('body')}
      </FeedbackMessage>
    </section>
  );
}
