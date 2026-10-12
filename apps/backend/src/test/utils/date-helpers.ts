export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function futureDate(daysAhead = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export function pastDate(daysAgo = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Returns the next future date whose UTC day-of-week matches utcDayOfWeek (0=Sun…6=Sat).
// weeksAhead=1 (default) returns the very next occurrence; weeksAhead=2 returns the one after, etc.
// The result depends only on today and the requested weekday, so two calls for different weekdays
// are NOT guaranteed to be in weekday order (on a Monday, nextWeekday(2) is tomorrow while
// nextWeekday(1) is 7 days away). When a spec needs related dates ("the day after", "a week later"),
// derive them from one anchor with addDays() instead of calling nextWeekday() once per weekday.
export function nextWeekday(utcDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6, weeksAhead = 1): string {
  const d = new Date();
  const daysUntil = (utcDayOfWeek - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntil + (weeksAhead - 1) * 7);
  return d.toISOString().slice(0, 10);
}
