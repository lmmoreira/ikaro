import { useTranslations } from 'next-intl';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingOutcomeLayout } from './BookingOutcomeLayout';

interface RescheduleSuccessViewProps {
  readonly booking: StaffBookingDetailResponse;
  readonly lastReschedule: { readonly from: string; readonly to: string };
  readonly backHref: string;
  readonly agendaHref: string;
}

// Extracted from RescheduleBookingPage (TD37-S5A) — the post-reschedule success screen is a
// fully self-contained view, unrelated to the form/availability logic in the default view.
export function RescheduleSuccessView({
  booking,
  lastReschedule,
  backHref,
  agendaHref,
}: RescheduleSuccessViewProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatDateLong, formatTime } = useFormatting();

  const oldStart = new Date(lastReschedule.from);
  const oldEnd = new Date(oldStart.getTime() + booking.totalDurationMins * 60_000);
  const newStart = new Date(lastReschedule.to);
  const newEnd = new Date(newStart.getTime() + booking.totalDurationMins * 60_000);

  return (
    <BookingOutcomeLayout
      booking={booking}
      tone="success"
      bannerTitle={t('rescheduledTitle')}
      bannerBody={
        <>
          <p data-testid="reschedule-body-email">
            {t('rescheduledBodyEmail', { name: booking.contactName })}
          </p>
          <p className="mt-2">{t('rescheduledBodyStatus')}</p>
        </>
      }
      asideBody={t('rescheduledAsideBody')}
      primaryAction={{ label: t('viewUpdatedBooking'), href: backHref }}
      secondaryAction={{ label: t('backToAgenda'), href: agendaHref }}
    >
      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('rescheduledSummaryLabel')}
        </p>
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
                {t('rescheduledFromLabel')}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {formatDateLong(oldStart)} · {formatTime(oldStart)}–{formatTime(oldEnd)}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
                {t('rescheduledToLabel')}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {formatDateLong(newStart)} · {formatTime(newStart)}–{formatTime(newEnd)}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </BookingOutcomeLayout>
  );
}
