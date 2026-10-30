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
  return slotAt(date, hashSeed(seed) % SLOT_COUNT).toISOString();
}

const SLOT_COUNT = 12;
const FIRST_SLOT_HOUR_UTC = 13;
// São Paulo closes at 14:00 on Saturday (17:00Z); the last half hour that still leaves room for the
// 90-minute booking is 15:30Z, the sixth of the twelve slots.
const LAST_SATURDAY_SLOT_INDEX = 5;
// The backend refuses a start in the past, so a slot too close to now is not offered either.
const SOONEST_LEAD_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 14;
// The seeded tenants' cancellation and reschedule window is 48 hours; an hour of margin keeps a
// slot clear of the boundary while the request is in flight.
const DEFAULT_WITHIN_HOURS = 47;

function slotAt(day: Date, slotIndex: number): Date {
  const slot = new Date(day);
  slot.setUTCHours(FIRST_SLOT_HOUR_UTC + Math.floor(slotIndex / 2), (slotIndex % 2) * 30, 0, 0);
  return slot;
}

function openSlotsBetween(day: Date, earliest: number, latest: number): Date[] {
  if (day.getUTCDay() === SUNDAY) return [];
  const lastIndex = day.getUTCDay() === SATURDAY ? LAST_SATURDAY_SLOT_INDEX : SLOT_COUNT - 1;
  return Array.from({ length: lastIndex + 1 }, (_, index) => slotAt(day, index)).filter(
    (slot) => slot.getTime() > earliest && slot.getTime() <= latest,
  );
}

interface SoonestSlotOptions {
  readonly withinHours?: number;
  readonly now?: Date;
}

// A start for the São Paulo e2e tenant (lavacar-beloauto) that is open and no further than
// `withinHours` away, for a spec that needs a booking inside a window measured in hours. It is open
// Monday–Friday and Saturday until 14:00 and closed on Sunday, so "the next weekday" is not close
// enough: from a Friday it is Monday, 60+ hours away, while a Saturday slot is not. The slot is
// picked from the open ones inside the window; there may be none (a Saturday afternoon has few),
// in which case this throws rather than hand back a start that makes the scenario assert nothing.
export function parseSoonestSlot(seed: string, options: SoonestSlotOptions = {}): string {
  const { withinHours = DEFAULT_WITHIN_HOURS, now = new Date() } = options;
  const earliest = now.getTime() + SOONEST_LEAD_MS;
  const latest = now.getTime() + withinHours * HOUR_MS;

  for (let dayIndex = 0; dayIndex < LOOKAHEAD_DAYS; dayIndex += 1) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() + dayIndex);
    const slots = openSlotsBetween(day, earliest, latest);
    if (slots.length > 0) return slots[hashSeed(seed) % slots.length].toISOString();
  }
  throw new Error(`no open slot within ${withinHours}h of ${now.toISOString()}`);
}
