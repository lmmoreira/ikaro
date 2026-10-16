'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';

// The action panel sits in a fixed bar at the bottom of the screen on mobile and in the right column
// on desktop — the same shape as the booking detail's panels.
const ACTION_BAR_CLASSES =
  'fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0';

interface RecurringApprovalActionsProps {
  readonly backHref: string;
  // The request can still be decided: show the decision buttons (otherwise only the way back).
  readonly canDecide: boolean;
  // "Aprovar" is offered (it is not when approving can no longer work, e.g. every date has passed).
  readonly canApprove: boolean;
  // A previous approval attempt failed: the button reads "Tentar aprovar de novo".
  readonly isRetry: boolean;
  readonly isSubmitting: boolean;
  // What to say instead of buttons when nothing can be decided any more.
  readonly settledNote: string;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}

export function RecurringApprovalActions({
  backHref,
  canDecide,
  canApprove,
  isRetry,
  isSubmitting,
  settledNote,
  onApprove,
  onReject,
}: RecurringApprovalActionsProps): React.JSX.Element {
  const t = useTranslations('dashboard.recurringApproval');

  return (
    <div className={ACTION_BAR_CLASSES}>
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('actionsSection')}
        </p>
        <Card>
          <CardContent className="space-y-3 p-4">
            {canDecide ? (
              <>
                {canApprove ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={onApprove}
                  >
                    {isRetry ? t('retryApprove') : t('approveButton')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-red-200 text-red-700 hover:bg-red-50"
                  disabled={isSubmitting}
                  onClick={onReject}
                >
                  {t('rejectButton')}
                </Button>
                <p className="text-xs leading-5 text-gray-500">{t('actionsHint')}</p>
              </>
            ) : (
              <p className="text-xs leading-5 text-gray-500" data-testid="recurring-settled-note">
                {settledNote}
              </p>
            )}
            <Button asChild variant={canDecide ? 'ghost' : 'default'} className="w-full">
              <Link href={backHref}>{t('backToAgenda')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
