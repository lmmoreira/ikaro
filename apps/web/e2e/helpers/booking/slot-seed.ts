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

// Every open start of the `daysAhead`-th weekday, each exactly once, beginning at a slot picked by
// `seed` and wrapping round. A caller that retries on a 409 walks this list instead of re-drawing
// from the seed: a draw repeats slots (twelve draws from twelve slots cover about two thirds of
// them), so a day with a single free slot was reported as full.
export function daySlotCandidates(daysAhead: number, seed: string): string[] {
  const first = new Date(parseDayOffset(daysAhead, seed));
  const day = new Date(first);
  const start = hashSeed(seed) % SLOT_COUNT;
  return Array.from({ length: SLOT_COUNT }, (_, offset) =>
    slotAt(day, (start + offset) % SLOT_COUNT).toISOString(),
  );
}
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
// picked from EVERY open one inside the window, across days, never only from the first day that has
// one: late in the afternoon (UTC) a single slot is left today, and a fixture whose twelve retry
// seeds all land on that one slot fails with a 409 as soon as another spec has taken it. There may
// be no slot at all (a Saturday afternoon has few), in which case this throws rather than hand back
// a start that makes the scenario assert nothing.
export function parseSoonestSlot(seed: string, options: SoonestSlotOptions = {}): string {
  const slots = openSoonestSlots(options);
  return slots[hashSeed(seed) % slots.length].toISOString();
}

// Every open slot `parseSoonestSlot` chooses from, each once, beginning at the one `seed` picks and
// wrapping round: the list a retry on a 409 walks, so no slot is skipped or tried twice.
export function soonestSlotCandidates(seed: string, options: SoonestSlotOptions = {}): string[] {
  const slots = openSoonestSlots(options);
  const start = hashSeed(seed) % slots.length;
  return slots.map((_, offset) => slots[(start + offset) % slots.length].toISOString());
}

function openSoonestSlots(options: SoonestSlotOptions): Date[] {
  const { withinHours = DEFAULT_WITHIN_HOURS, now = new Date() } = options;
  const earliest = now.getTime() + SOONEST_LEAD_MS;
  const latest = now.getTime() + withinHours * HOUR_MS;

  const slots = Array.from({ length: LOOKAHEAD_DAYS }, (_, dayIndex) => {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() + dayIndex);
    return openSlotsBetween(day, earliest, latest);
  }).flat();
  if (slots.length === 0) {
    throw new Error(`no open slot within ${withinHours}h of ${now.toISOString()}`);
  }
  return slots;
}
