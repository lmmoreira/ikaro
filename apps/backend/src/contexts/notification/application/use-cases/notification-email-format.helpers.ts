import type { DateFormat, TimeFormat } from '@ikaro/i18n';
import {
  addDaysUTC,
  utcDateToLocalDate,
  utcDateToLocalHHMM,
} from '../../../../shared/utils/calendar-date';
import { escapeHtml } from '../../../../shared/utils/escape-html';

// How every notification email writes dates, times and user-typed text (M23-S37). One module so
// the use cases never carry their own copy of a format and never print a raw `YYYY-MM-DD` or ISO
// timestamp: the tenant's own `dateFormat`/`timeFormat` (from its country, the same the dashboard
// uses) decide, in the tenant's timezone.

export interface TenantEmailFormats {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

// A calendar date has no timezone: anchor it at UTC midnight so Intl cannot shift the day.
function utcDateOf(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

// 'YYYY-MM-DD' → the tenant's date format.
export function formatEmailDate(date: string, dateFormat: DateFormat): string {
  const [year, month, day] = date.split('-') as [string, string, string];
  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
  }
}

// 'HH:mm' (tenant-local, 24h) → the tenant's time format.
export function formatEmailTime(hhmm: string, timeFormat: TimeFormat): string {
  if (timeFormat === '24h') return hhmm;
  const [hours, minutes] = hhmm.split(':') as [string, string];
  const hour = Number(hours);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minutes} ${hour < 12 ? 'AM' : 'PM'}`;
}

// A UTC instant → the tenant-local date and time, each in the tenant's format.
export function formatEmailInstant(
  isoInstant: string,
  timezone: string,
  formats: TenantEmailFormats,
): { date: string; time: string } {
  const instant = new Date(isoInstant);
  return {
    date: formatEmailDate(utcDateToLocalDate(instant, timezone), formats.dateFormat),
    time: formatEmailTime(utcDateToLocalHHMM(instant, timezone), formats.timeFormat),
  };
}

// A UTC instant → "<date> <time>" in the tenant's formats and timezone.
export function formatEmailDateTime(
  isoInstant: string,
  timezone: string,
  formats: TenantEmailFormats,
): string {
  const { date, time } = formatEmailInstant(isoInstant, timezone, formats);
  return `${date} ${time}`;
}

// A Monday: stepping from it with the shared addDaysUTC() gives a date for each weekday, which
// Intl then names in the tenant's language.
const REFERENCE_MONDAY = '2024-01-01';
const WEEKDAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export function formatWeekdays(daysOfWeek: string[], locale: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const names = WEEKDAY_ORDER.filter((day) => daysOfWeek.includes(day)).map((day) =>
    weekday.format(utcDateOf(addDaysUTC(REFERENCE_MONDAY, WEEKDAY_ORDER.indexOf(day)))),
  );
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
}

// '<p><strong>label</strong> value</p>' with both parts escaped, or '' when there is no value:
// a labelled line that must not appear empty (a missing reason, a booking with no pickup address).
export function labelledLine(label: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return '';
  return `<p><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</p>`;
}

// A sentence from the label catalog as a paragraph body: escaped.
export function sentence(text: string): string {
  return escapeHtml(text);
}
