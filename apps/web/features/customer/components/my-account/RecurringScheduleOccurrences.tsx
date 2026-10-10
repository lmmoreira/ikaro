'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerBookingListItem } from '@ikaro/types';
import { buildBookingStatusLabels } from '@/features/booking/model/booking-status';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { appendReturnTo } from '../../booking-navigation';
import { recurringScheduleDetailPath, totalOccurrencePages } from '../../recurring-schedule-model';
import { OccurrencePager } from './OccurrencePager';

interface RecurringScheduleOccurrencesProps {
  readonly bookings: readonly CustomerBookingListItem[];
  /** `upcoming` while the schedule runs (skip / reschedule links); `history` once it is over. */
  readonly mode: 'upcoming' | 'history';
  readonly tenantSlug: string;
  readonly scheduleId: string;
  readonly page: number;
  readonly total: number;
  readonly limit: number;
}

/**
 * The schedule's occurrences — each one is a booking (M23-S08), so "Pular" and "Reagendar" are just
 * links to that booking's ordinary cancel and reschedule pages. This component holds no cancel or
 * reschedule logic; it only remembers where the customer should land afterwards (`returnTo`).
 */
export function RecurringScheduleOccurrences({
  bookings,
  mode,
  tenantSlug,
  scheduleId,
  page,
  total,
  limit,
}: RecurringScheduleOccurrencesProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const statusT = useTranslations('customer.bookingItem');
  const { formatDateLong, formatTime, formatMoney } = useFormatting();
  const statusLabels = buildBookingStatusLabels(statusT);

  const here = recurringScheduleDetailPath(tenantSlug, scheduleId, page);
  const bookingPath = (bookingId: string): string =>
    `/${tenantSlug}/my-account/bookings/${bookingId}`;
  const title = mode === 'upcoming' ? t('upcomingTitle') : t('periodBookingsTitle');

  return (
    <section data-testid="recurring-occurrences">
      <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
        {title}
      </p>
      {bookings.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
          {mode === 'upcoming' ? t('noUpcoming') : t('noPeriodBookings')}
        </p>
      ) : (
        <ul className="rounded-xl border border-gray-100 bg-white px-4">
          {bookings.map((booking) => {
            const startsAt = new Date(booking.scheduledAt);
            const minutes = booking.lines.reduce(
              (sum, line) => sum + line.durationMinsAtBooking,
              0,
            );
            return (
              <li
                key={booking.bookingId}
                data-testid="recurring-occurrence"
                className="border-b border-gray-100 py-3 last:border-b-0"
              >
                {mode === 'history' ? (
                  <Link
                    href={bookingPath(booking.bookingId)}
                    className="text-sm font-semibold text-gray-900 hover:underline"
                  >
                    {formatDateLong(startsAt)}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-gray-900">{formatDateLong(startsAt)}</p>
                )}
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatTime(startsAt)} · {statusLabels[booking.status]}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t('perReservation', {
                    duration: formatDuration(minutes),
                    price: formatMoney(booking.totalPrice.amount),
                  })}
                </p>
                {mode === 'upcoming' && (
                  <div className="mt-1.5 flex items-center gap-3 text-xs font-medium">
                    <Link
                      href={appendReturnTo(`${bookingPath(booking.bookingId)}/cancel`, here)}
                      data-testid="occurrence-skip"
                      className="text-red-600 hover:underline"
                    >
                      {t('skipOccurrence')}
                    </Link>
                    <Link
                      href={appendReturnTo(`${bookingPath(booking.bookingId)}/reschedule`, here)}
                      data-testid="occurrence-reschedule"
                      className="text-blue-600 hover:underline"
                    >
                      {t('rescheduleOccurrence')}
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <OccurrencePager
        page={page}
        totalPages={totalOccurrencePages(total, limit)}
        hrefForPage={(target) => recurringScheduleDetailPath(tenantSlug, scheduleId, target)}
      />
    </section>
  );
}
