import type {
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantDayHours,
  TenantBusinessHours,
} from '@ikaro/types';
import { getDayHoursForDate, timeToMinutes } from '@/features/booking/schedule/date-utils';
import type { TimelineEvent } from '@/features/booking/schedule/schedule-timeline-events';
import {
  findTenantWideOpening,
  resolveActiveTimelineHours,
  type ActiveTimelineHours,
} from '@/features/booking/schedule/schedule-timeline-window';
import { buildAllTimelineEvents } from '@/features/booking/schedule/schedule-timeline-event-list';
import {
  getSlotHeight,
  resolveSlotCount,
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
  getBlockMinHeightPx,
  buildBlockStyle,
  buildWeekShift,
  toLocalDate,
  formatEventRange,
  getClosureReasonLabel,
  normalizeScheduleStatuses,
  buildScheduleReturnTo,
  buildBookingDetailHref,
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
  // TD44 Story 3 — propagated from ActiveTimelineHours (schedule-timeline-window.ts). true when
  // this window was resolved from an exceptional opening rather than regular business hours — the
  // opt-out signal resolveSharedTimelineWindow (schedule-shared-timeline-window.ts) reads directly
  // off this type, since it's the one every board component actually consumes.
  readonly isOverriddenByOpening: boolean;
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
const EMPTY_RESOURCE_NAME_BY_ID: ReadonlyMap<string, string> = new Map();

interface TimelineWindow {
  readonly timelineStartMinutes: number;
  readonly timelineEndMinutes: number;
  readonly slotCount: number;
  readonly slotHeight: number;
  readonly events: TimelineEvent[];
  readonly isOverriddenByOpening: boolean;
}

interface TimelineWindowFromActiveInput {
  readonly active: ActiveTimelineHours;
  readonly selectedDateKey: string;
  readonly timezone: string;
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly slotGranularityMinutes: number;
  readonly slotHeight: number;
  readonly resourceNameById: ReadonlyMap<string, string>;
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly bookingResourceNamesById: ReadonlyMap<string, readonly string[]>;
}

// Extracted from buildTimelineEvents below purely to stay under the 40-line function cap once
// TD44 Story 3's isOverriddenByOpening propagation landed there — same window-resolution logic,
// no behavior change. Takes a single input object (SonarCloud S107 — max 7 positional params)
// rather than 9 individual arguments.
function buildTimelineWindowFromActive(input: TimelineWindowFromActiveInput): TimelineWindow {
  const {
    active,
    selectedDateKey,
    timezone,
    bookings,
    slotGranularityMinutes,
    slotHeight,
    resourceNameById,
    selectedResourceIdSet,
    bookingResourceNamesById,
  } = input;

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

  return {
    timelineStartMinutes,
    timelineEndMinutes,
    slotCount,
    slotHeight,
    events,
    isOverriddenByOpening: active.isOverriddenByOpening,
  };
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
  resourceNameById = EMPTY_RESOURCE_NAME_BY_ID,
  selectedResourceIdSet = EMPTY_SELECTED_RESOURCE_IDS,
  bookingResourceNamesById = EMPTY_BOOKING_RESOURCE_NAMES_BY_ID,
}: TimelineLayoutInput): TimelineWindow {
  const active = resolveActiveTimelineHours(selectedDateKey, businessHours, closures, openings);
  const slotHeight = getSlotHeight(slotGranularityMinutes, slotHeightScale);

  if (!active) {
    return {
      timelineStartMinutes: 0,
      timelineEndMinutes: 0,
      slotCount: 0,
      slotHeight,
      events: [],
      isOverriddenByOpening: false,
    };
  }

  return buildTimelineWindowFromActive({
    active,
    selectedDateKey,
    timezone,
    bookings,
    slotGranularityMinutes,
    slotHeight,
    resourceNameById,
    selectedResourceIdSet,
    bookingResourceNamesById,
  });
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
    isOverriddenByOpening: timeline.isOverriddenByOpening,
  };
}
