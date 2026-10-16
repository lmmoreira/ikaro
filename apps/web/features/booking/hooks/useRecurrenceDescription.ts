'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { RecurrenceRule } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  dateKeyToDate,
  recurrenceEndTime,
  sortedWeekdays,
} from '@/features/booking/model/recurring-schedule-display';

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

interface RecurrenceDescription {
  /** "Toda terça · 10:00–12:00", or "Toda semana: seg e qui · 09:00–10:00" for several weekdays. */
  readonly patternLine: (recurrence: RecurrenceRule) => string;
  /** A `YYYY-MM-DD` key in the tenant's date format. */
  readonly formatDateKey: (dateKey: string) => string;
}

/**
 * How the staff screens word a recurring schedule's pattern and dates. The words are the staff
 * screens' own (`dashboard.recurringApproval`), so the booking slice does not read the customer
 * shell's copy; the weekday order and time arithmetic are the booking slice's shared helpers.
 */
export function useRecurrenceDescription(): RecurrenceDescription {
  const t = useTranslations('dashboard.recurringApproval');
  const locale = useLocale();
  const { formatDate } = useFormatting();

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
    formatDateKey: (dateKey) => formatDate(dateKeyToDate(dateKey)),
    patternLine: (recurrence) =>
      t('patternLine', {
        days: daysText(recurrence),
        from: recurrence.startTime,
        to: recurrenceEndTime(recurrence),
      }),
  };
}
