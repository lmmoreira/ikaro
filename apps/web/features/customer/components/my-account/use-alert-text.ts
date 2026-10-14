'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { AvailabilityAlertResponse, AvailabilityAlertWeekday } from '@ikaro/types';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { sortedWeekdays } from '../../recurring-schedule-model';

const SHORT_KEY = {
  monday: 'shortMonday',
  tuesday: 'shortTuesday',
  wednesday: 'shortWednesday',
  thursday: 'shortThursday',
  friday: 'shortFriday',
  saturday: 'shortSaturday',
  sunday: 'shortSunday',
} as const satisfies Record<AvailabilityAlertWeekday, string>;

interface AlertText {
  /** "20 out 09:00" — a date and a time in the tenant's zone. */
  readonly dateTime: (iso: string) => string;
  /** "20/10 09:00 – 27/10 18:00" for a range, "Toda ter e qui, 09:00–12:00" for a weekly alert. */
  readonly criteriaLine: (alert: AvailabilityAlertResponse) => string;
  /** The weekday list alone, "ter e qui". */
  readonly weekdaysText: (alert: AvailabilityAlertResponse) => string;
  /** "60 min · 2 pessoas" — only the parts the alert carries; empty when it carries neither. */
  readonly durationAndPeople: (alert: AvailabilityAlertResponse) => string;
  /** The alert's service, with its preferred resource when it has one. */
  readonly title: (alert: AvailabilityAlertResponse) => string;
  /** The last meta line of a row: how long it stays active, or what happened to it. */
  readonly statusLine: (alert: AvailabilityAlertResponse) => string;
  /** "Horário de Brasília" — the alert's own zone, spelled out in the customer's language. */
  readonly timezoneName: (alert: AvailabilityAlertResponse) => string;
}

type AlertTranslator = ReturnType<typeof useTranslations<'customer.alerts'>>;

/** Weekday lists, dates and the zone name: everything that depends on the customer's locale. */
function useAlertFormatters(
  t: AlertTranslator,
): Pick<AlertText, 'dateTime' | 'weekdaysText' | 'timezoneName'> {
  const locale = useLocale();
  const { formatDate, formatTime } = useFormatting();

  return {
    dateTime: (iso) => {
      const date = new Date(iso);
      return t('dateTime', { date: formatDate(date), time: formatTime(date) });
    },
    weekdaysText: (alert) =>
      new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
        sortedWeekdays(alert.weekdays ?? []).map((day) => t(SHORT_KEY[day])),
      ),
    timezoneName: (alert) =>
      new Intl.DateTimeFormat(locale, { timeZone: alert.timezone, timeZoneName: 'longGeneric' })
        .formatToParts(new Date(alert.createdAt))
        .find((part) => part.type === 'timeZoneName')?.value ?? alert.timezone,
  };
}

/** The last meta line of a row: how long it stays active, or what happened to it. */
function useAlertStatusLine(t: AlertTranslator): AlertText['statusLine'] {
  const { formatDate } = useFormatting();

  return (alert) => {
    if (alert.status === 'ACTIVE') {
      return t('activeUntil', { date: formatDate(new Date(alert.expiresAt)) });
    }
    if (alert.status === 'NOTIFIED') {
      return alert.notifiedAt === null
        ? t('notified')
        : t('notifiedOn', { date: formatDate(new Date(alert.notifiedAt)) });
    }
    return t('expiredOn', { date: formatDate(new Date(alert.expiresAt)) });
  };
}

export function useAlertText(): AlertText {
  const t = useTranslations('customer.alerts');
  const formatters = useAlertFormatters(t);
  const statusLine = useAlertStatusLine(t);

  return {
    ...formatters,
    statusLine,
    criteriaLine: (alert) => {
      if (
        alert.criteriaType === 'ONE_TIME_RANGE' &&
        alert.acceptableStartAt &&
        alert.acceptableEndAt
      ) {
        return t('rangeLine', {
          start: formatters.dateTime(alert.acceptableStartAt),
          end: formatters.dateTime(alert.acceptableEndAt),
        });
      }
      return t('weeklyLine', {
        days: formatters.weekdaysText(alert),
        from: alert.localStartTime ?? '',
        to: alert.localEndTime ?? '',
      });
    },
    durationAndPeople: (alert) =>
      [
        alert.durationMinutes === null ? null : formatDuration(alert.durationMinutes),
        alert.participantCount === null
          ? null
          : t('peopleCount', { count: alert.participantCount }),
      ]
        .filter((part): part is string => part !== null)
        .join(' · '),
    title: (alert) =>
      alert.preferredResourceName === null
        ? alert.serviceName
        : `${alert.serviceName} · ${alert.preferredResourceName}`,
  };
}
