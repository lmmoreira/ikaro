import type { ScheduleClosure, StaffBookingCardResponse } from '@ikaro/types';
import {
  assignLanes,
  buildBookingTimelineEvent,
  buildBufferTimelineEvent,
  buildClosureTimelineEvent,
  getBookingDateKey,
  type BufferTail,
  type TimelineEvent,
} from '@/features/booking/schedule/schedule-timeline-events';
import {
  buildOpeningTimelineEvents,
  type ActiveTimelineHours,
} from '@/features/booking/schedule/schedule-timeline-window';
import { isBookingVisibleForResourceFilter } from '@/features/booking/schedule/schedule-week-resource-bookings';

// Moved from schedule-timeline.ts (TD44 Story 3) to stay under that file's 250-line cap once this
// story's shared-window plumbing landed there — turning the day's resolved active window plus raw
// bookings/closures/openings into the flat, sorted TimelineEvent[] the grid renders is a
// self-contained concern, independent of the window-resolution/day-data-shaping schedule-timeline.ts
// still owns.

interface FilteredBookingEventsInput {
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly timezone: string;
  readonly selectedDateKey: string;
  readonly selectedDayClosures: readonly ScheduleClosure[];
  readonly activeStartTime: string;
  readonly activeEndTime: string;
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly bookingResourceNamesById: ReadonlyMap<string, readonly string[]>;
}

// Extracted from buildAllTimelineEvents below purely to stay under the 40-line function cap once
// TD44 Story 1's resource-filter/badge params landed there — same booking-building logic, no
// behavior change. Takes a single input object (SonarCloud S107 — max 7 positional params) rather
// than 8 individual arguments.
function buildFilteredBookingEvents(input: FilteredBookingEventsInput) {
  const {
    bookings,
    timezone,
    selectedDateKey,
    selectedDayClosures,
    activeStartTime,
    activeEndTime,
    selectedResourceIdSet,
    bookingResourceNamesById,
  } = input;

  return assignLanes(
    bookings
      .filter((booking) => getBookingDateKey(booking, timezone) === selectedDateKey)
      .filter((booking) =>
        isBookingVisibleForResourceFilter(
          booking.bookingId,
          selectedResourceIdSet,
          bookingResourceNamesById,
        ),
      )
      .map((booking) =>
        buildBookingTimelineEvent(
          booking,
          timezone,
          selectedDayClosures,
          activeStartTime,
          activeEndTime,
        ),
      ),
  );
}

export interface AllTimelineEventsInput {
  readonly selectedDateKey: string;
  readonly timezone: string;
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly active: ActiveTimelineHours;
  readonly resourceNameById: ReadonlyMap<string, string>;
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly bookingResourceNamesById: ReadonlyMap<string, readonly string[]>;
  readonly bufferTails: readonly BufferTail[];
}

export function buildAllTimelineEvents(input: AllTimelineEventsInput): TimelineEvent[] {
  const {
    selectedDateKey,
    timezone,
    bookings,
    active,
    resourceNameById,
    selectedResourceIdSet,
    bookingResourceNamesById,
    bufferTails,
  } = input;
  const { dayOpenings, selectedDayClosures, activeStartTime, activeEndTime } = active;

  const bookingEvents = buildFilteredBookingEvents({
    bookings,
    timezone,
    selectedDateKey,
    selectedDayClosures,
    activeStartTime,
    activeEndTime,
    selectedResourceIdSet,
    bookingResourceNamesById,
  });

  // Lane-split same-kind closures that overlap in time (e.g. two different resources each
  // blocked over the same window) — mirrors bookings' own overlap handling above.
  const closureEvents = assignLanes(
    selectedDayClosures.map((closure) =>
      buildClosureTimelineEvent(closure, activeStartTime, activeEndTime, resourceNameById),
    ),
  );

  const openingEvents = buildOpeningTimelineEvents(dayOpenings, resourceNameById);

  // Built after (and outside) lane assignment on purpose — a held tail must never push a booking
  // into a narrower lane.
  const bufferEvents = bufferTails.map(buildBufferTimelineEvent);

  return [...closureEvents, ...openingEvents, ...bufferEvents, ...bookingEvents].sort(
    (left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes,
  );
}
