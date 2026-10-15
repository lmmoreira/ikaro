'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { CancelSheet } from '@/features/booking/components/dashboard/scheduling-exceptions/CancelSheet';
import { ReassignSheet } from '@/features/booking/components/dashboard/scheduling-exceptions/ReassignSheet';
import { useBookingDecision } from '@/features/booking/hooks/useBookingDecision';
import { appendReturnTo } from '@/features/booking/model/booking-navigation';

const SECONDARY_BUTTON = 'w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50';

interface BookingDecisionPanelProps {
  readonly booking: StaffBookingDetailResponse;
  // The booking as the server has it after a resolve; the page replaces its own copy with it.
  readonly onBookingRefreshed: (fresh: StaffBookingDetailResponse) => void;
}

// What replaces the panel when a resolve succeeded but the booking could not be reloaded.
function RefreshFailedPanel(): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  return (
    <div className="space-y-2" data-testid="booking-decision-panel">
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-orange-700">
        {t('decisionPanelTitle')}
      </p>
      <Card className="border-orange-200">
        <CardContent className="p-4">
          <p role="alert" className="text-sm text-red-700">
            {t('decisionRefreshError')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// M23-S46 (MANAGER only) — what the booking detail offers instead of its normal actions while the
// booking has an open "Reservas a resolver" entry: the worklist's own three actions, for this one
// booking. Reatribuir is per entry (a target is valid for one source resource only), Cancelar and
// Reagendar are for the booking.
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

  return (
    <div className="space-y-2" data-testid="booking-decision-panel">
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-orange-700">
        {t('decisionPanelTitle')}
      </p>
      <Card className="border-orange-200">
        <CardContent className="space-y-3 p-4">
          {decision.isLoading && (
            <div aria-busy="true" className="h-24 animate-pulse rounded-md bg-gray-100" />
          )}

          {decision.isError && (
            <div className="space-y-2">
              <p className="text-sm text-red-700">{tx('loadError')}</p>
              <Button type="button" className={SECONDARY_BUTTON} onClick={decision.retryLoad}>
                {tx('retry')}
              </Button>
            </div>
          )}

          {entries.map((entry, index) => {
            const noAlternative = entry.alternatives.length === 0;
            return (
              <div key={entry.id}>
                <Button
                  type="button"
                  className={index === 0 ? 'w-full' : SECONDARY_BUTTON}
                  disabled={noAlternative || decision.isSubmitting}
                  aria-describedby={noAlternative ? `no-alternative-${entry.id}` : undefined}
                  onClick={() => decision.openSheet('reassign', [entry.id])}
                >
                  {severalEntries
                    ? t('decisionPanelReassignNamed', {
                        resource: entry.booking?.resourceName ?? '',
                      })
                    : tx('reassign')}
                </Button>
                {noAlternative && (
                  <p id={`no-alternative-${entry.id}`} className="mt-1.5 text-xs text-gray-500">
                    {tx('noAlternative')}
                  </p>
                )}
              </div>
            );
          })}

          {entries.length > 0 && booking.status === BOOKING_STATUS.APPROVED && (
            <Button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={decision.isSubmitting}
              onClick={reschedule}
            >
              {t('rescheduleAction')}
            </Button>
          )}

          {entries.length > 0 && (
            <Button
              type="button"
              className={SECONDARY_BUTTON}
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
        </CardContent>
      </Card>

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
    </div>
  );
}
