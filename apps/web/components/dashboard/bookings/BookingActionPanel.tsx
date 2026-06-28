'use client';

import { BOOKING_STATUS } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
};

type BookingActionPanelProps = {
  readonly isSubmitting: boolean;
  readonly className?: string;
} & (PendingActionPanelProps | ApprovedActionPanelProps);

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
