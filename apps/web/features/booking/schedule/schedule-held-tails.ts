import type { DayGridBlock, DayGridResponse, StaffBookingCardResponse } from '@ikaro/types';
import { getLocalTimeKey, timeToMinutes } from '@/features/booking/schedule/date-utils';
import {
  getBookingDateKey,
  getBookingTimeKey,
  type BufferTail,
} from '@/features/booking/schedule/schedule-timeline-events';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';

// M18-S10 — the time a booking keeps a resource held after it ends (service buffer or resource
// turnover), derived from the day-grid block (whose endsAt already includes it). Shared by the
// per-resource columns board and by the merged Day / Week timelines.

// The part of a day-grid block past the booking's own end. The block's endsAt is authoritative for
// the geometry; `gap` only supplies the label, so a gap/geometry disagreement never moves the
// segment. Null when there is no tail, or when it crosses midnight — the grid is business-hours-
// bound, so a tail past midnight is not drawn (the next day's column shows it as TD43's fixed
// "Ocupado até" banner instead).
export function resolveBufferTail(
  booking: StaffBookingCardResponse,
  block: DayGridBlock,
  resourceName: string,
  timezone: string,
): BufferTail | null {
  const blockEnd = new Date(block.endsAt);
  // A malformed block (no usable end) simply has no tail, rather than breaking the whole day.
  if (Number.isNaN(blockEnd.getTime())) return null;
  const { endTime: bookingEndTime } = getBookingTimeKey(booking, timezone);
  const bookingEnd = new Date(
    new Date(booking.scheduledAt).getTime() + booking.totalDurationMins * 60_000,
  );
  if (blockEnd <= bookingEnd) return null;
  const bookingDateKey = getBookingDateKey(booking, timezone);
  if (toISODateInTimezone(bookingEnd, timezone) !== bookingDateKey) return null;
  if (toISODateInTimezone(blockEnd, timezone) !== bookingDateKey) return null;

  const releasesAtLocalTime = getLocalTimeKey(blockEnd, timezone);
  return {
    bookingId: booking.bookingId,
    startMinutes: timeToMinutes(bookingEndTime),
    endMinutes: timeToMinutes(releasesAtLocalTime),
    resourceName,
    releasesAtLocalTime,
    gap: block.gap,
    serviceName: block.gap?.serviceName ?? booking.serviceNames.join(', '),
  };
}

// A multi-line booking on one resource yields several blocks with the same refId; the held tail is
// the longest one (the last line's gap), so keep a single tail per booking.
export function keepLongestTail(tails: Map<string, BufferTail>, tail: BufferTail | null): void {
  if (!tail) return;
  const existing = tails.get(tail.bookingId);
  if (!existing || tail.endMinutes > existing.endMinutes) tails.set(tail.bookingId, tail);
}

// One strip per booking from every resource's tail: it runs to the longest hold, names the
// resources held until then, and takes its cause from them — a service buffer wins a tie (it holds
// every resource of the booking), then any recorded turnover, else the origin is unknown.
function mergeResourceTails(tails: readonly BufferTail[]): BufferTail {
  const longest = Math.max(...tails.map((tail) => tail.endMinutes));
  const heldLongest = tails.filter((tail) => tail.endMinutes === longest);
  const recorded = heldLongest.filter((tail) => tail.gap !== null);
  const cause =
    recorded.find((tail) => tail.gap?.source === 'SERVICE_BUFFER') ?? recorded[0] ?? heldLongest[0];
  const names = [...new Set(heldLongest.map((tail) => tail.resourceName))].sort((a, b) =>
    a.localeCompare(b),
  );
  return { ...cause, resourceName: names.join(', ') };
}

interface HeldTailsInput {
  // The day's GET /schedule/day-grid response; undefined while it loads or for a non-manager.
  readonly dayGrid: DayGridResponse | undefined;
  // Already status-filtered: a booking missing from this list never gets a strip.
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly dateKey: string;
  readonly timezone: string;
  // Empty = every resource; otherwise only the checked ones are considered.
  readonly selectedResourceIdSet: ReadonlySet<string>;
}

// The merged Day timeline and Week day-cards have no per-resource columns, so each booking gets a
// single strip under it (see mergeResourceTails). Purely informational, built per day.
export function buildHeldTails(input: HeldTailsInput): BufferTail[] {
  const { dayGrid, bookings, dateKey, timezone, selectedResourceIdSet } = input;
  if (!dayGrid) return [];

  const bookingById = new Map(bookings.map((booking) => [booking.bookingId, booking]));
  const tailsByBooking = new Map<string, BufferTail[]>();
  for (const column of dayGrid.columns) {
    if (selectedResourceIdSet.size > 0 && !selectedResourceIdSet.has(column.resourceId)) continue;
    const perResource = new Map<string, BufferTail>();
    for (const block of column.blocks) {
      const booking = block.kind === 'BOOKING' ? bookingById.get(block.refId) : undefined;
      if (!booking || getBookingDateKey(booking, timezone) !== dateKey) continue;
      keepLongestTail(perResource, resolveBufferTail(booking, block, column.name, timezone));
    }
    for (const [bookingId, tail] of perResource) {
      tailsByBooking.set(bookingId, [...(tailsByBooking.get(bookingId) ?? []), tail]);
    }
  }
  return [...tailsByBooking.values()].map(mergeResourceTails);
}
