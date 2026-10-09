'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { RecurrenceRule, RecurringBookingScheduleListItem } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { dateKeyToDate, recurrenceEndTime, sortedWeekdays } from '../../recurring-schedule-model';

type WeekdayKey = RecurrenceRule['daysOfWeek'][number];

const EVERY_KEY = {
  monday: 'everyMonday',
  tuesday: 'everyTuesday',
  wednesday: 'everyWednesday',
  thursday: 'everyThursday',
  friday: 'everyFriday',
  saturday: 'everySaturday',
  sunday: 'everySunday',
} as const satisfies Record<WeekdayKey, string>;

const SHORT_KEY = {
  monday: 'shortMonday',
  tuesday: 'shortTuesday',
  wednesday: 'shortWednesday',
  thursday: 'shortThursday',
  friday: 'shortFriday',
  saturday: 'shortSaturday',
  sunday: 'shortSunday',
} as const satisfies Record<WeekdayKey, string>;

interface RecurrenceText {
  /** "Toda terça · 10:00–12:00", or "Toda semana: seg, qua · 10:00–12:00" for several weekdays. */
  readonly recurrenceLine: (recurrence: RecurrenceRule) => string;
  /** "até 11/11/2026" while it runs, "02/06/2026 → 25/08/2026" otherwise. */
  readonly termText: (schedule: RecurringBookingScheduleListItem) => string;
  readonly formatDateKey: (dateKey: string) => string;
}

export function useRecurrenceText(): RecurrenceText {
  const t = useTranslations('customer.recurringSchedules');
  const locale = useLocale();
  const { formatDate } = useFormatting();

  const formatDateKey = (dateKey: string): string => formatDate(dateKeyToDate(dateKey));

  const daysText = (recurrence: RecurrenceRule): string => {
    const days = sortedWeekdays(recurrence.daysOfWeek);
    const [only] = days;
    if (days.length === 1 && only !== undefined) return t(EVERY_KEY[only]);
    const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
      days.map((day) => t(SHORT_KEY[day])),
    );
    return t('weeklyOn', { days: list });
  };

  return {
    formatDateKey,
    recurrenceLine: (recurrence) =>
      t('recurrenceLine', {
        days: daysText(recurrence),
        from: recurrence.startTime,
        to: recurrenceEndTime(recurrence),
      }),
    termText: (schedule) =>
      schedule.status === 'ACTIVE'
        ? t('termUntil', { date: formatDateKey(schedule.endsOn) })
        : t('termRange', {
            start: formatDateKey(schedule.startsOn),
            end: formatDateKey(schedule.endsOn),
          }),
  };
}
