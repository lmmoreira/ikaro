'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';

interface MarkCompleteActionRailProps {
  readonly error: string | null;
  readonly isSubmitting: boolean;
  readonly backHref: string;
}

// Extracted from MarkCompleteBookingPage (TD37-S5A) — the submit/cancel action rail is a
// self-contained section, unrelated to the form fields beside it. A failed submit reports under the
// buttons in the shared action pane (TD57-S12).
export function MarkCompleteActionRail({
  error,
  isSubmitting,
  backHref,
}: MarkCompleteActionRailProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const commonT = useTranslations('common');

  return (
    <ActionPane
      feedback={error ? { variant: 'error', title: error, testId: 'mark-complete-error' } : null}
      actions={
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">{t('actionsSection')}</p>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {t('submitComplete')}
          </Button>
          <Button
            asChild
            className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
          >
            <Link href={backHref}>{commonT('cancel')}</Link>
          </Button>
        </div>
      }
    />
  );
}
