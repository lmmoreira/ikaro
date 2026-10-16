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

// Deliberately pins UTC (unlike dayCarouselLabel() in date-utils.ts, which uses local time)
// and upper-cases the first letter — match both when asserting this in tests.
export function formatDateLong(date: Date, locale: string): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatMonthName(date: Date, locale: string): string {
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(date);
  return month.charAt(0).toUpperCase() + month.slice(1);
}

export function formatMonthYear(date: Date, locale: string): string {
  return `${formatMonthName(date, locale)} ${date.getFullYear()}`;
}

// Label for a visible period: "Outubro 2026", "Outubro – Novembro 2026" or
// "Dezembro 2026 – Janeiro 2027" depending on how many months/years it spans.
export function formatMonthYearRange(start: Date, end: Date, locale: string): string {
  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatMonthYear(start, locale)} – ${formatMonthYear(end, locale)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${formatMonthName(start, locale)} – ${formatMonthYear(end, locale)}`;
  }
  return formatMonthYear(start, locale);
}
