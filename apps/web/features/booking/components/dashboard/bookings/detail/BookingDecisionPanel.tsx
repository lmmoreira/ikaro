'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { CancelSheet } from '@/features/booking/components/dashboard/scheduling-exceptions/CancelSheet';
import { ReassignSheet } from '@/features/booking/components/dashboard/scheduling-exceptions/ReassignSheet';
import { useBookingDecision } from '@/features/booking/hooks/useBookingDecision';
import { appendReturnTo } from '@/features/booking/model/booking-navigation';

interface BookingDecisionPanelProps {
  readonly booking: StaffBookingDetailResponse;
  // The booking as the server has it after a resolve; the page replaces its own copy with it.
  readonly onBookingRefreshed: (fresh: StaffBookingDetailResponse) => void;
}

function DecisionHeading(): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return <p className="text-sm font-semibold text-orange-700">{t('decisionPanelTitle')}</p>;
}

// What replaces the panel when a resolve succeeded but the booking could not be reloaded.
function RefreshFailedPanel(): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const body = (
    <div className="space-y-3">
      <DecisionHeading />
      <FeedbackMessage title={t('decisionRefreshError')} />
    </div>
  );

  return (
    <ActionPane
      actions={<div data-testid="booking-decision-panel">{body}</div>}
      mobileActions={body}
    />
  );
}

// M23-S46 (MANAGER only) — what the booking detail offers instead of its normal actions while the
// booking has an open "Reservas a resolver" entry: the worklist's own three actions, for this one
// booking. Reatribuir is per entry (a target is valid for one source resource only), Cancelar and
// Reagendar are for the booking. It renders through the shared `ActionPane` (sticky card on desktop,
// fixed bar on mobile), like every other action state of the booking detail (TD57-S12).
export function BookingDecisionPanel({
  booking,
  onBookingRefreshed,
}: BookingDecisionPanelProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const tx = useTranslations('dashboard.schedulingExceptionsPage');
  const router = useRouter();
  const decision = useBookingDecision({ bookingId: booking.bookingId, onBookingRefreshed });
  const { entries, sheet } = decision;

  // The resolve went through but the booking could not be reloaded: every entry shown here is
  // stale, so no action is offered (a second click would act on state that no longer exists).
  if (decision.refreshFailed) return <RefreshFailedPanel />;

  // Nothing matches (resolved elsewhere a moment ago): there is nothing left to decide here.
  if (!decision.isLoading && !decision.isError && entries.length === 0) return null;

  const severalEntries = entries.length > 1;
  const reschedule = () =>
    router.push(
      appendReturnTo(
        `/dashboard/scheduling-exceptions/${entries[0].id}/reschedule`,
        `/dashboard/bookings/${booking.bookingId}`,
      ),
    );

  // Both the desktop card and the mobile bar render the controls (CSS shows one), so ids are suffixed.
  const renderBody = (idSuffix: string) => (
    <div className="space-y-3">
      <DecisionHeading />

      {decision.isLoading && (
        <div aria-busy="true" className="h-24 animate-pulse rounded-md bg-gray-100" />
      )}

      {decision.isError && (
        <FeedbackMessage
          title={tx('loadError')}
          onRetry={decision.retryLoad}
          retryLabel={tx('retry')}
        />
      )}

      {entries.map((entry, index) => {
        const noAlternative = entry.alternatives.length === 0;
        const hintId = `no-alternative-${entry.id}${idSuffix}`;
        return (
          <div key={entry.id}>
            <Button
              type="button"
              variant={index === 0 ? 'default' : 'surface'}
              className="w-full"
              disabled={noAlternative || decision.isSubmitting}
              aria-describedby={noAlternative ? hintId : undefined}
              onClick={() => decision.openSheet('reassign', [entry.id])}
            >
              {severalEntries
                ? t('decisionPanelReassignNamed', {
                    resource: entry.booking?.resourceName ?? '',
                  })
                : tx('reassign')}
            </Button>
            {noAlternative && (
              <p id={hintId} className="mt-1.5 text-xs text-gray-500">
                {tx('noAlternative')}
              </p>
            )}
          </div>
        );
      })}

      {entries.length > 0 && booking.status === BOOKING_STATUS.APPROVED && (
        <Button
          type="button"
          variant="surface"
          className="w-full"
          disabled={decision.isSubmitting}
          onClick={reschedule}
        >
          {t('rescheduleAction')}
        </Button>
      )}

      {entries.length > 0 && (
        <Button
          type="button"
          variant="surface"
          className="w-full"
          disabled={decision.isSubmitting}
          onClick={() =>
            decision.openSheet(
              'cancel',
              entries.map((e) => e.id),
            )
          }
        >
          {t('cancelBookingAction')}
        </Button>
      )}

      <p className="text-xs leading-5 text-gray-500">{t('decisionPanelHint')}</p>
    </div>
  );

  return (
    <>
      <ActionPane
        actions={<div data-testid="booking-decision-panel">{renderBody('')}</div>}
        mobileActions={renderBody('-mobile')}
      />

      {sheet && (
        <>
          <ReassignSheet
            key={`reassign-${sheet.nonce}`}
            open={sheet.kind === 'reassign'}
            items={entries.filter((e) => sheet.ids.includes(e.id))}
            isSubmitting={decision.isSubmitting}
            error={decision.sheetError}
            onClose={decision.closeSheet}
            onSubmit={decision.submitReassign}
          />
          <CancelSheet
            key={`cancel-${sheet.nonce}`}
            open={sheet.kind === 'cancel'}
            count={sheet.ids.length}
            isSubmitting={decision.isSubmitting}
            error={decision.sheetError}
            onClose={decision.closeSheet}
            onSubmit={decision.submitCancel}
          />
        </>
      )}
    </>
  );
}
