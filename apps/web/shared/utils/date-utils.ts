export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD for the given date as seen in the specified IANA timezone. */
export function toDateKeyInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
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
