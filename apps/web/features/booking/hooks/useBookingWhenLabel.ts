import { useTranslations } from 'next-intl';
import { addDays, toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

// The queue card's date line: "Hoje · 10:00", "Amanhã · 09:00", or the long date + time. Shared by
// BookingCard (the Agenda queue) and SchedulingExceptionRow ("Reservas a resolver") so both read
// the same.
export function useBookingWhenLabel(): (scheduledAt: Date) => string {
  const t = useTranslations('dashboard.bookingCard');
  const { formatTime, formatDateLong, timezone } = useFormatting();

  return (scheduledAt) => {
    const now = new Date();
    const todayKey = toISODateInTimezone(now, timezone);
    const tomorrowKey = toISODateInTimezone(addDays(now, 1), timezone);
    const scheduledKey = toISODateInTimezone(scheduledAt, timezone);

    let prefix = formatDateLong(scheduledAt);
    if (scheduledKey === todayKey) prefix = t('today');
    if (scheduledKey === tomorrowKey) prefix = t('tomorrow');

    return `${prefix} · ${formatTime(scheduledAt)}`;
  };
}
