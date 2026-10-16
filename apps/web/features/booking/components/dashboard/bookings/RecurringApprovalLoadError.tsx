'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { ApiError } from '@/shared/lib/api/errors';

interface RecurringApprovalLoadErrorProps {
  readonly error: unknown;
  readonly onRetry: () => void;
}

// The approval screen when the request itself could not be read: "not found" for a 404 (no retry,
// it will not appear), a generic failure with a retry for anything else.
export function RecurringApprovalLoadError({
  error,
  onRetry,
}: RecurringApprovalLoadErrorProps): React.JSX.Element {
  const t = useTranslations('dashboard.recurringApproval');
  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <div className="space-y-3 p-4" data-testid="recurring-approval-error">
      <p className="text-sm text-red-700">{notFound ? t('notFound') : t('loadError')}</p>
      <div className="flex gap-2">
        {notFound ? null : (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t('retry')}
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href="/dashboard/bookings">{t('backToAgenda')}</Link>
        </Button>
      </div>
    </div>
  );
}
