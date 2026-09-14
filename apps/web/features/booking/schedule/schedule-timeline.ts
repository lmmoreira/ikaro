import type {
  BookingStatus,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantDayHours,
  TenantBusinessHours,
} from '@ikaro/types';
import { SCHEDULE_BOOKING_STATUS_OPTIONS } from '@/features/booking/model/booking-status';
import {
  getDayHoursForDate,
  parseDateKey,
  timeToMinutes,
} from '@/features/booking/schedule/date-utils';
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
  // Resolves a closure's/opening's resourceId to its display name (MANAGER-only — see
  // schedule-page-core-data.ts). Omitted (STAFF, or the fetch hasn't resolved yet) means every
  // event renders with resourceName: null, same as a tenant-wide item.
  readonly resourceNameById?: ReadonlyMap<string, string>;
}

export function getSlotHeight(slotGranularityMinutes: number, scale = 1): number {
  return Math.max(18, Math.round((slotGranularityMinutes / 30) * 48 * scale));
}

export function getEventMinutes(
  startMinutes: number,
  endMinutes: number,
  slotMinutes: number,
): number {
  return Math.max(slotMinutes, endMinutes - startMinutes);
}

export function buildWeekShift(weekStartKey: string, deltaDays: number): string {
  const next = new Date(parseDateKey(weekStartKey));
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

export function toLocalDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

export function formatEventRange(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}

function buildAllTimelineEvents(
  selectedDateKey: string,
  timezone: string,
  bookings: readonly StaffBookingCardResponse[],
  active: ActiveTimelineHours,
  resourceNameById: ReadonlyMap<string, string>,
): TimelineEvent[] {
  const { dayOpenings, selectedDayClosures, activeStartTime, activeEndTime } = active;

  const bookingEvents = assignLanes(
    bookings
      .filter((booking) => getBookingDateKey(booking, timezone) === selectedDateKey)
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
}: TimelineLayoutInput): {
  readonly timelineStartMinutes: number;
  readonly timelineEndMinutes: number;
  readonly slotCount: number;
  readonly slotHeight: number;
  readonly events: TimelineEvent[];
} {
  const active = resolveActiveTimelineHours(selectedDateKey, businessHours, closures, openings);
  const slotHeight = getSlotHeight(slotGranularityMinutes, slotHeightScale);

  if (!active) {
    return { timelineStartMinutes: 0, timelineEndMinutes: 0, slotCount: 0, slotHeight, events: [] };
  }

  const timelineStartMinutes = timeToMinutes(active.activeStartTime);
  const timelineEndMinutes = timeToMinutes(active.activeEndTime);
  const slotCount = Math.max(
    1,
    Math.ceil((timelineEndMinutes - timelineStartMinutes) / slotGranularityMinutes),
  );
  const events = buildAllTimelineEvents(
    selectedDateKey,
    timezone,
    bookings,
    active,
    resourceNameById,
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

export function getClosureReasonLabel(
  t: (key: 'reasonDayOff' | 'reasonMaintenance' | 'reasonHoliday') => string,
  reason: ScheduleClosure['reason'],
): string {
  if (reason === 'MAINTENANCE') return t('reasonMaintenance');
  if (reason === 'HOLIDAY') return t('reasonHoliday');
  return t('reasonDayOff');
}

export function normalizeScheduleStatuses(
  statuses: readonly BookingStatus[],
): readonly BookingStatus[] {
  const selected = new Set(statuses);
  return SCHEDULE_BOOKING_STATUS_OPTIONS.filter((status) => selected.has(status));
}

export function buildScheduleReturnTo(weekStartKey: string, selectedDateKey: string): string {
  return `/dashboard/schedule?weekStart=${encodeURIComponent(
    weekStartKey,
  )}&date=${encodeURIComponent(selectedDateKey)}`;
}
