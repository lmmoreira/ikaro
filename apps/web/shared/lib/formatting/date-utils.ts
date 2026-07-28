export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD for the given date as seen in the specified IANA timezone. */
export function toISODateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function inWindow(date: Date, windowStart: Date, windowEnd: Date): boolean {
  return date >= windowStart && date <= windowEnd;
}

// dayNumber/dayCarouselLabel deliberately parse and format in the runtime's local
// timezone (no explicit UTC) — unlike formatDateLong() in format-time.ts, which pins UTC.
// Match this convention in tests; don't "fix" them to be UTC-consistent with each other.
export function dayNumber(isoDate: string): string {
  return String(new Date(`${isoDate}T00:00:00`).getDate());
}

export function dayCarouselLabel(
  isoDate: string,
  index: number,
  locale: string,
  todayLabel: string,
): string {
  if (index === 0) return todayLabel;
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
    new Date(`${isoDate}T00:00:00`),
  );
}
