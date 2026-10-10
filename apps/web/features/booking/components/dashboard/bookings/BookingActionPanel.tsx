'use client';

import { BOOKING_STATUS } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { cn } from '@/shared/utils/cn';

type PendingActionPanelProps = {
  readonly bookingStatus: typeof BOOKING_STATUS.PENDING | typeof BOOKING_STATUS.INFO_REQUESTED;
  readonly onApprove: () => void;
  readonly onOpenReject: () => void;
  readonly onOpenRequestInfo: () => void;
};

type ApprovedActionPanelProps = {
  readonly bookingStatus: typeof BOOKING_STATUS.APPROVED;
  readonly onOpenComplete: () => void;
  readonly onOpenReschedule: () => void;
  readonly onOpenCancel: () => void;
  readonly onOpenNoShow: () => void;
  // The appointment's end time in the tenant timezone; null once it has passed (the no-show
  // action is then enabled). While it is set the action is disabled and shows the hint (UC-074).
  readonly noShowAvailableAt: string | null;
};

type NoShowActionPanelProps = {
  readonly bookingStatus: typeof BOOKING_STATUS.NO_SHOW;
  // Only a manager can correct a no-show; for staff the button is hidden, not disabled.
  readonly canCorrect: boolean;
  readonly onOpenCorrect: () => void;
};

type BookingActionPanelProps = {
  readonly isSubmitting: boolean;
  readonly className?: string;
} & (PendingActionPanelProps | ApprovedActionPanelProps | NoShowActionPanelProps);

export function BookingActionPanel({
  bookingStatus,
  isSubmitting,
  className,
  ...actions
}: BookingActionPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const isApproved = bookingStatus === BOOKING_STATUS.APPROVED;
  const isInfoRequested = bookingStatus === BOOKING_STATUS.INFO_REQUESTED;
  const approvedActions = actions as ApprovedActionPanelProps;
  const pendingActions = actions as PendingActionPanelProps;

  if (bookingStatus === BOOKING_STATUS.NO_SHOW) {
    return (
      <NoShowActionPanel
        className={className}
        isSubmitting={isSubmitting}
        {...(actions as NoShowActionPanelProps)}
      />
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('actionsSection')}
      </p>
      <Card>
        <CardContent className="space-y-3 p-4">
          {isApproved ? (
            <>
              <Button
                type="button"
                className="w-full"
                onClick={approvedActions.onOpenComplete}
                disabled={isSubmitting}
              >
                {t('markCompleted')}
              </Button>
              <Button
                type="button"
                className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                onClick={approvedActions.onOpenReschedule}
                disabled={isSubmitting}
              >
                {t('rescheduleAction')}
              </Button>
              <div>
                <Button
                  type="button"
                  className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                  onClick={approvedActions.onOpenNoShow}
                  disabled={isSubmitting || approvedActions.noShowAvailableAt !== null}
                  aria-describedby={
                    approvedActions.noShowAvailableAt === null ? undefined : 'no-show-hint'
                  }
                >
                  {t('markNoShowAction')}
                </Button>
                {approvedActions.noShowAvailableAt !== null && (
                  <p
                    id="no-show-hint"
                    data-testid="no-show-hint"
                    className="mt-1.5 text-xs text-gray-500"
                  >
                    {t('noShowAvailableAfter', { time: approvedActions.noShowAvailableAt })}
                  </p>
                )}
              </div>
              <Button
                type="button"
                className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                onClick={approvedActions.onOpenCancel}
                disabled={isSubmitting}
              >
                {t('cancelBookingAction')}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                className="w-full"
                onClick={pendingActions.onApprove}
                disabled={isSubmitting}
              >
                {t('approveAction')}
              </Button>
              <div
                className={
                  isInfoRequested
                    ? 'grid grid-cols-1 gap-3'
                    : 'grid grid-cols-2 gap-3 lg:grid-cols-1'
                }
              >
                <Button
                  type="button"
                  className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                  onClick={pendingActions.onOpenReject}
                  disabled={isSubmitting}
                >
                  {t('rejectAction')}
                </Button>
                {!isInfoRequested && (
                  <Button
                    type="button"
                    className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                    onClick={pendingActions.onOpenRequestInfo}
                    disabled={isSubmitting}
                  >
                    {t('requestInfoAction')}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NoShowActionPanel({
  canCorrect,
  isSubmitting,
  onOpenCorrect,
  className,
}: NoShowActionPanelProps & {
  readonly isSubmitting: boolean;
  readonly className?: string;
}): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('actionsSection')}
      </p>
      <Card>
        <CardContent className="space-y-3 p-4">
          {canCorrect ? (
            <>
              <Button
                type="button"
                className="w-full"
                onClick={onOpenCorrect}
                disabled={isSubmitting}
              >
                {t('correctNoShowAction')}
              </Button>
              <p className="text-xs leading-5 text-gray-500">{t('correctNoShowNote')}</p>
            </>
          ) : (
            <p data-testid="no-show-read-only-note" className="text-sm text-gray-600">
              {t('noShowReadOnlyNote')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
