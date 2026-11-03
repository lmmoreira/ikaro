'use client';

import { useTranslations } from 'next-intl';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

/** `07c` — the route's loading UI while the alerts are read. */
export function AvailabilityAlertListSkeleton(): React.JSX.Element {
  const t = useTranslations('customer.alerts');

  return (
    <div className="w-full" data-testid="alerts-loading">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
      <output className="mt-6 block text-sm text-gray-500">{t('loading')}</output>
    </div>
  );
}

interface AvailabilityAlertListErrorProps {
  readonly onRetry: () => void;
}

/** `07d` — the alerts read failed; the route's error boundary offers a retry. */
export function AvailabilityAlertListError({
  onRetry,
}: AvailabilityAlertListErrorProps): React.JSX.Element {
  const t = useTranslations('customer.alerts');

  return (
    <div className="w-full" data-testid="alerts-load-error">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
      <div className="mt-6">
        <FeedbackMessage title={t('loadErrorTitle')} onRetry={onRetry} retryLabel={t('retry')}>
          {t('loadErrorBody')}
        </FeedbackMessage>
      </div>
    </div>
  );
}
