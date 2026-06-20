import type { DateFormat } from '@ikaro/i18n';

export type { DateFormat };

export function formatTime(
  date: Date,
  locale: string,
  timezone: string,
  format: '24h' | '12h',
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
    hour12: format === '12h',
  }).format(date);
}

export function formatDate(date: Date, timezone: string, dateFormat: DateFormat): string {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const { year, month, day } = parts;

  if (dateFormat === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
  if (dateFormat === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`; // DD/MM/YYYY default
}

export function formatDateLong(date: Date, locale: string): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
