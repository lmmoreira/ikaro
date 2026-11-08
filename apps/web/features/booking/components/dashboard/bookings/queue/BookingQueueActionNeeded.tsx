'use client';

import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem, StaffBookingCardResponse } from '@ikaro/types';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { BookingCard } from './BookingCard';
import { BookingQueueSection } from './BookingQueueSection';
import { RecurringScheduleCard } from '../recurring/RecurringScheduleCard';

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
        <div className="mb-6">
          <FeedbackMessage
            title={t('recurrencesLoadError')}
            onRetry={onRetryRecurrences}
            retryLabel={t('recurrencesRetry')}
            testId="recurrences-load-error"
          />
        </div>
      ) : null}
    </>
  );
}
