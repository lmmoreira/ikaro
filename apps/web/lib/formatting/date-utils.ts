export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
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
