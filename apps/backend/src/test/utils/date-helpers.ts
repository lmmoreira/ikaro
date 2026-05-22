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
export function nextWeekday(utcDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6, weeksAhead = 1): string {
  const d = new Date();
  const daysUntil = (utcDayOfWeek - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntil + (weeksAhead - 1) * 7);
  return d.toISOString().slice(0, 10);
}
