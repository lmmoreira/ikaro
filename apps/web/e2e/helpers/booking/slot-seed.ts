export function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

const SUNDAY = 0;
const SATURDAY = 6;

// A start the e2e tenants are open for, whatever today is and whatever the runner's timezone: the
// backend refuses a booking on a closed day or outside the tenant's hours. The seeded tenants work
// Monday–Friday 08:00–18:00 (São Paulo, and New York in the second tenant) and only part of
// Saturday, so `daysAhead` counts WEEKDAYS from today: each step moves to the next Monday–Friday,
// and a weekend start (`0`, or any step taken from one) lands on the Monday after it. Counting
// weekdays rather than calendar days keeps two different `daysAhead` values on two different days
// whatever weekday the run starts on — rolling a weekend date forward to Monday instead made
// several offsets share one Monday on a Thursday or Friday run, ran out of slots and failed the
// same specs every time (the failure depended on the weekday, not on the code under test). The
// start is one of twelve half hours from 13:00Z to 18:30Z — 10:00–15:30 in São Paulo and
// 08:00/09:00–14:30/13:30 in New York — which leaves room for a 90-minute booking (30 minutes
// plus the default 60-minute buffer) before either tenant closes. The twelve slots are still the
// retry space for a 409 on a taken slot.
function isWeekend(date: Date): boolean {
  return date.getUTCDay() === SUNDAY || date.getUTCDay() === SATURDAY;
}

export function parseDayOffset(daysAhead: number, seed: string): string {
  const date = new Date();
  for (let step = 0; step < daysAhead; step += 1) {
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while (isWeekend(date));
  }
  while (isWeekend(date)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  const slotIndex = hashSeed(seed) % 12;
  date.setUTCHours(13 + Math.floor(slotIndex / 2), (slotIndex % 2) * 30, 0, 0);
  return date.toISOString();
}
