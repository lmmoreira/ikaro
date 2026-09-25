import type {
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantDayHours,
  TenantBusinessHours,
} from '@ikaro/types';
import { getDayHoursForDate, timeToMinutes } from '@/features/booking/schedule/date-utils';
import {
  assignLanes,
  buildBookingTimelineEvent,
  buildClosureTimelineEvent,
  getBookingDateKey,
  type TimelineEvent,
} from '@/features/booking/schedule/schedule-timeline-events';
import {
  buildOpeningTimelineEvents,
  findTenantWideOpening,
  resolveActiveTimelineHours,
  type ActiveTimelineHours,
} from '@/features/booking/schedule/schedule-timeline-window';
import { isBookingVisibleForResourceFilter } from '@/features/booking/schedule/schedule-week-resource-bookings';
import {
  getEventMinutes,
  getSlotHeight,
} from '@/features/booking/schedule/schedule-timeline-formatting';

export type {
  BookingTimelineEvent,
  ClosureTimelineEvent,
  OpeningTimelineEvent,
  TimelineEvent,
} from '@/features/booking/schedule/schedule-timeline-events';
export {
  getBookingDateKey,
  getBookingTimeKey,
} from '@/features/booking/schedule/schedule-timeline-events';
export {
  getSlotHeight,
  getEventMinutes,
  buildWeekShift,
  toLocalDate,
  formatEventRange,
  getClosureReasonLabel,
  normalizeScheduleStatuses,
  buildScheduleReturnTo,
  DESKTOP_MIN_BLOCK_HEIGHT_PX,
  COMPACT_MIN_BLOCK_HEIGHT_PX,
} from '@/features/booking/schedule/schedule-timeline-formatting';

export interface TimelineDayData {
  readonly selectedOpening: ScheduleOpening | null;
  readonly selectedDayHours: TenantDayHours | null;
  readonly selectedDayClosed: boolean;
  readonly timelineStartMinutes: number;
  readonly timelineEndMinutes: number;
  readonly slotCount: number;
  readonly slotHeight: number;
  readonly events: TimelineEvent[];
}

export interface TimelineLayoutInput {
  readonly selectedDateKey: string;
  readonly timezone: string;
  readonly slotGranularityMinutes: number;
  readonly businessHours: TenantBusinessHours;
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly closures: readonly ScheduleClosure[];
  readonly openings: readonly ScheduleOpening[];
  readonly slotHeightScale?: number;
  // Content-driven floor for a single slot's rendered height (TD44 Story 2, round 2) — see
  // DESKTOP_MIN_BLOCK_HEIGHT_PX/COMPACT_MIN_BLOCK_HEIGHT_PX in schedule-timeline-formatting.ts.
  // Every caller passes one explicitly; falls back to the old bare-minimum 18px only if omitted.
  readonly minSlotHeightPx?: number;
  // Resolves a closure's/opening's resourceId to its display name (MANAGER-only — see
  // schedule-page-core-data.ts). Omitted (STAFF, or the fetch hasn't resolved yet) means every
  // event renders with resourceName: null, same as a tenant-wide item.
  readonly resourceNameById?: ReadonlyMap<string, string>;
  // Week view's own booking *visibility* filter (TD44 Story 1, schedule-week-resource-bookings.ts)
  // — omitted/empty by every other caller (Day view never filters bookings at this layer). Despite
  // the field name, only presence (.has(bookingId)) is ever checked — the values are the raw
  // checked-resource-matched resourceIds from the day-grid lookup, unrelated to badge naming
  // (BookingTimelineEvent.resourceNames sources from booking.assignedResources directly as of
  // TD44-S2 round 3, not from this map).
  readonly selectedResourceIdSet?: ReadonlySet<string>;
  readonly bookingResourceNamesById?: ReadonlyMap<string, readonly string[]>;
}

const EMPTY_SELECTED_RESOURCE_IDS: ReadonlySet<string> = new Set();
const EMPTY_BOOKING_RESOURCE_NAMES_BY_ID: ReadonlyMap<string, readonly string[]> = new Map();

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

function buildAllTimelineEvents(
  selectedDateKey: string,
  timezone: string,
  bookings: readonly StaffBookingCardResponse[],
  active: ActiveTimelineHours,
  resourceNameById: ReadonlyMap<string, string>,
  selectedResourceIdSet: ReadonlySet<string>,
  bookingResourceNamesById: ReadonlyMap<string, readonly string[]>,
): TimelineEvent[] {
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

  return [...closureEvents, ...openingEvents, ...bookingEvents].sort(
    (left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes,
  );
}

const EMPTY_RESOURCE_NAME_BY_ID: ReadonlyMap<string, string> = new Map();

function resolveSlotCount(
  timelineStartMinutes: number,
  timelineEndMinutes: number,
  slotGranularityMinutes: number,
): number {
  return Math.max(
    1,
    Math.ceil((timelineEndMinutes - timelineStartMinutes) / slotGranularityMinutes),
  );
}

interface TimelineWindow {
  readonly timelineStartMinutes: number;
  readonly timelineEndMinutes: number;
  readonly slotCount: number;
  readonly slotHeight: number;
  readonly events: TimelineEvent[];
}

export function buildTimelineEvents({
  selectedDateKey,
  timezone,
  slotGranularityMinutes,
  businessHours,
  bookings,
  closures,
  openings,
  slotHeightScale = 1,
  minSlotHeightPx = 18,
  resourceNameById = EMPTY_RESOURCE_NAME_BY_ID,
  selectedResourceIdSet = EMPTY_SELECTED_RESOURCE_IDS,
  bookingResourceNamesById = EMPTY_BOOKING_RESOURCE_NAMES_BY_ID,
}: TimelineLayoutInput): TimelineWindow {
  const active = resolveActiveTimelineHours(selectedDateKey, businessHours, closures, openings);
  const slotHeight = getSlotHeight(slotGranularityMinutes, slotHeightScale, minSlotHeightPx);

  if (!active) {
    return { timelineStartMinutes: 0, timelineEndMinutes: 0, slotCount: 0, slotHeight, events: [] };
  }

  const timelineStartMinutes = timeToMinutes(active.activeStartTime);
  const timelineEndMinutes = timeToMinutes(active.activeEndTime);
  const slotCount = resolveSlotCount(
    timelineStartMinutes,
    timelineEndMinutes,
    slotGranularityMinutes,
  );
  const events = buildAllTimelineEvents(
    selectedDateKey,
    timezone,
    bookings,
    active,
    resourceNameById,
    selectedResourceIdSet,
    bookingResourceNamesById,
  );

  return { timelineStartMinutes, timelineEndMinutes, slotCount, slotHeight, events };
}

export function buildTimelineDayData(layout: TimelineLayoutInput): TimelineDayData {
  const { selectedDateKey, openings, businessHours } = layout;
  const dayOpenings = openings.filter((opening) => opening.date === selectedDateKey);
  // Prefers the tenant-wide opening (see findTenantWideOpening's own note); falls back to any
  // resource-scoped one so `selectedOpening`/`selectedDayClosed` stay correct even in the
  // shouldn't-normally-happen case of one with no tenant-wide sibling.
  const selectedOpening = findTenantWideOpening(dayOpenings) ?? dayOpenings[0] ?? null;
  const selectedDayHours = getDayHoursForDate(selectedDateKey, businessHours);
  const selectedDayClosed = !selectedDayHours && !selectedOpening;
  const timeline = buildTimelineEvents(layout);

  return {
    selectedOpening,
    selectedDayHours,
    selectedDayClosed,
    timelineStartMinutes: timeline.timelineStartMinutes,
    timelineEndMinutes: timeline.timelineEndMinutes,
    slotCount: timeline.slotCount,
    slotHeight: timeline.slotHeight,
    events: timeline.events,
  };
}

export function buildBlockStyle(
  startMinutes: number,
  endMinutes: number,
  timelineStartMinutes: number,
  timelineEndMinutes: number,
  slotGranularityMinutes: number,
  slotHeight: number,
): { top: string; height: string } {
  const clampedStart = Math.max(startMinutes, timelineStartMinutes);
  const clampedEnd = Math.min(
    timelineEndMinutes,
    Math.max(clampedStart + slotGranularityMinutes, endMinutes),
  );
  const top = ((clampedStart - timelineStartMinutes) / slotGranularityMinutes) * slotHeight;
  const height =
    getEventMinutes(clampedStart, clampedEnd, slotGranularityMinutes) / slotGranularityMinutes;

  return {
    top: `${top}px`,
    height: `${height * slotHeight}px`,
  };
}
