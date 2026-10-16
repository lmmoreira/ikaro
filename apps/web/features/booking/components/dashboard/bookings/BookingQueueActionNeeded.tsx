'use client';

import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem, StaffBookingCardResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { BookingCard } from './BookingCard';
import { BookingQueueSection } from './BookingQueueSection';
import { RecurringScheduleCard } from './RecurringScheduleCard';

type QueueTranslator = (key: string, values?: Record<string, string | number>) => string;

// "4 agendamentos · 1 recorrência": only the kinds that are shown and not empty are counted, so a
// queue without recurrences keeps the plain "N agendamentos" it always had.
function buildCountLabel(t: QueueTranslator, bookings: number, recurrences: number): string | null {
  const bookingsLabel = bookings > 0 ? t('bookingCount', { count: bookings }) : null;
  const recurrencesLabel = recurrences > 0 ? t('recurrenceCount', { count: recurrences }) : null;
  if (bookingsLabel && recurrencesLabel) {
    return t('countJoin', { bookings: bookingsLabel, recurrences: recurrencesLabel });
  }
  return bookingsLabel ?? recurrencesLabel;
}

interface BookingQueueActionNeededProps {
  readonly bookings: readonly StaffBookingCardResponse[];
  // Already sorted, closest decision deadline first.
  readonly recurrences: readonly RecurringBookingScheduleListItem[];
  readonly showBookings: boolean;
  readonly showRecurrences: boolean;
  readonly recurrencesFailed: boolean;
  readonly onRetryRecurrences: () => void;
  readonly onApprove: (bookingId: string) => void | Promise<void>;
  readonly isApproving: boolean;
}

// The Agenda's "Precisa de ação" block (M23-S13): recurrence requests pinned above the bookings that
// need a decision, both subject to the "Filtrar agenda" balloon. Recurrence cards never have a quick
// approve — one decision creates a whole term, so it always goes through the detail screen.
export function BookingQueueActionNeeded({
  bookings,
  recurrences,
  showBookings,
  showRecurrences,
  recurrencesFailed,
  onRetryRecurrences,
  onApprove,
  isApproving,
}: BookingQueueActionNeededProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingQueue');
  const shownBookings = showBookings ? bookings.length : 0;
  const shownRecurrences = showRecurrences ? recurrences.length : 0;

  return (
    <>
      {showBookings || showRecurrences ? (
        <BookingQueueSection
          title={t('actionNeededTitle')}
          countLabel={buildCountLabel(t, shownBookings, shownRecurrences)}
          hasItems={shownBookings + shownRecurrences > 0}
          emptyMessage={t('emptyActionNeeded')}
        >
          {showRecurrences
            ? recurrences.map((schedule) => (
                <RecurringScheduleCard key={schedule.id} schedule={schedule} />
              ))
            : null}
          {showBookings
            ? bookings.map((b) => (
                <BookingCard
                  key={b.bookingId}
                  booking={b}
                  variant="action-needed"
                  onApprove={() => onApprove(b.bookingId)}
                  isApproving={isApproving}
                />
              ))
            : null}
        </BookingQueueSection>
      ) : null}

      {showRecurrences && recurrencesFailed ? (
        <Card className="mb-6 border-red-200 bg-red-50/80" data-testid="recurrences-load-error">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-red-700">
            <span>{t('recurrencesLoadError')}</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetryRecurrences}>
              {t('recurrencesRetry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
