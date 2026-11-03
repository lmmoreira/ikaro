'use client';

import { BOOKING_STATUS } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';

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
  // The copy rendered in the fixed mobile bar: no heading, and ids/test ids that do not repeat the
  // desktop pane's (both copies are in the DOM; CSS shows one).
  readonly compact?: boolean;
} & (PendingActionPanelProps | ApprovedActionPanelProps | NoShowActionPanelProps);

const SECONDARY_BUTTON_CLASS = 'w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50';

function PaneHeading(): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return <p className="text-sm font-semibold text-gray-900">{t('actionsSection')}</p>;
}

// The buttons of the booking detail action pane. `BookingDetailAsideCard` puts them inside the shared
// `ActionPane`, which supplies the card, the sticky desktop placement, the fixed mobile bar and the
// feedback card under the buttons (TD57-S12).
export function BookingActionPanel({
  bookingStatus,
  isSubmitting,
  compact = false,
  ...actions
}: BookingActionPanelProps): React.JSX.Element {
  if (bookingStatus === BOOKING_STATUS.NO_SHOW) {
    return (
      <NoShowActions
        compact={compact}
        isSubmitting={isSubmitting}
        {...(actions as NoShowActionPanelProps)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {!compact && <PaneHeading />}
      {bookingStatus === BOOKING_STATUS.APPROVED ? (
        <ApprovedActions
          compact={compact}
          isSubmitting={isSubmitting}
          {...(actions as ApprovedActionPanelProps)}
        />
      ) : (
        <TriageActions
          isInfoRequested={bookingStatus === BOOKING_STATUS.INFO_REQUESTED}
          isSubmitting={isSubmitting}
          {...(actions as PendingActionPanelProps)}
        />
      )}
    </div>
  );
}

function ApprovedActions({
  compact,
  isSubmitting,
  onOpenComplete,
  onOpenReschedule,
  onOpenCancel,
  onOpenNoShow,
  noShowAvailableAt,
}: Omit<ApprovedActionPanelProps, 'bookingStatus'> & {
  readonly compact: boolean;
  readonly isSubmitting: boolean;
}): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const hintId = compact ? 'no-show-hint-mobile' : 'no-show-hint';

  return (
    <>
      <Button type="button" className="w-full" onClick={onOpenComplete} disabled={isSubmitting}>
        {t('markCompleted')}
      </Button>
      <Button
        type="button"
        className={SECONDARY_BUTTON_CLASS}
        onClick={onOpenReschedule}
        disabled={isSubmitting}
      >
        {t('rescheduleAction')}
      </Button>
      <div>
        <Button
          type="button"
          className={SECONDARY_BUTTON_CLASS}
          onClick={onOpenNoShow}
          disabled={isSubmitting || noShowAvailableAt !== null}
          aria-describedby={noShowAvailableAt === null ? undefined : hintId}
        >
          {t('markNoShowAction')}
        </Button>
        {noShowAvailableAt !== null && (
          <p id={hintId} data-testid={hintId} className="mt-1.5 text-xs text-gray-500">
            {t('noShowAvailableAfter', { time: noShowAvailableAt })}
          </p>
        )}
      </div>
      <Button
        type="button"
        className={SECONDARY_BUTTON_CLASS}
        onClick={onOpenCancel}
        disabled={isSubmitting}
      >
        {t('cancelBookingAction')}
      </Button>
    </>
  );
}

function TriageActions({
  isInfoRequested,
  isSubmitting,
  onApprove,
  onOpenReject,
  onOpenRequestInfo,
}: Omit<PendingActionPanelProps, 'bookingStatus'> & {
  readonly isInfoRequested: boolean;
  readonly isSubmitting: boolean;
}): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <>
      <Button type="button" className="w-full" onClick={onApprove} disabled={isSubmitting}>
        {t('approveAction')}
      </Button>
      <div
        className={
          isInfoRequested ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3 lg:grid-cols-1'
        }
      >
        <Button
          type="button"
          className={SECONDARY_BUTTON_CLASS}
          onClick={onOpenReject}
          disabled={isSubmitting}
        >
          {t('rejectAction')}
        </Button>
        {!isInfoRequested && (
          <Button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={onOpenRequestInfo}
            disabled={isSubmitting}
          >
            {t('requestInfoAction')}
          </Button>
        )}
      </div>
    </>
  );
}

function NoShowActions({
  canCorrect,
  compact,
  isSubmitting,
  onOpenCorrect,
}: Omit<NoShowActionPanelProps, 'bookingStatus'> & {
  readonly compact: boolean;
  readonly isSubmitting: boolean;
}): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <div className="space-y-3">
      {!compact && <PaneHeading />}
      {canCorrect ? (
        <>
          <Button type="button" className="w-full" onClick={onOpenCorrect} disabled={isSubmitting}>
            {t('correctNoShowAction')}
          </Button>
          <p className="text-xs leading-5 text-gray-500">{t('correctNoShowNote')}</p>
        </>
      ) : (
        <p
          data-testid={compact ? 'no-show-read-only-note-mobile' : 'no-show-read-only-note'}
          className="text-sm text-gray-600"
        >
          {t('noShowReadOnlyNote')}
        </p>
      )}
    </div>
  );
}
