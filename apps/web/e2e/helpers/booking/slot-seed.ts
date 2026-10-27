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
// Saturday, so a weekend day moves to the Monday after it, and the start is one of twelve half
// hours from 13:00Z to 18:30Z — 10:00–15:30 in São Paulo and 08:00/09:00–14:30/13:30 in New York
// — which leaves room for a 90-minute booking (30 minutes plus the default 60-minute buffer) before
// either tenant closes. The twelve slots are still the retry space for a 409 on a taken slot.
export function parseDayOffset(daysAhead: number, seed: string): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  while (date.getUTCDay() === SUNDAY || date.getUTCDay() === SATURDAY) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  const slotIndex = hashSeed(seed) % 12;
  date.setUTCHours(13 + Math.floor(slotIndex / 2), (slotIndex % 2) * 30, 0, 0);
  return date.toISOString();
}
