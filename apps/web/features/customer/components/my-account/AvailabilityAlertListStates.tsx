'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';

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
      <div
        role="alert"
        className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
      >
        <p className="text-sm font-semibold">{t('loadErrorTitle')}</p>
        <p className="mt-1 text-sm">{t('loadErrorBody')}</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          {t('retry')}
        </Button>
      </div>
    </div>
  );
}
