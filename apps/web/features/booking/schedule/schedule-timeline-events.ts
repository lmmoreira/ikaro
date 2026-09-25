import type { ScheduleClosure, ScheduleOpening, StaffBookingCardResponse } from '@ikaro/types';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { getLocalTimeKey, overlaps, timeToMinutes } from '@/features/booking/schedule/date-utils';
import { compareResourceAssignmentsByTypePriority } from '@/features/booking/schedule/schedule-resource-priority';

export interface TimelineEventBase {
  readonly id: string;
  readonly startMinutes: number;
  readonly endMinutes: number;
  readonly title: string;
  readonly subtitle: string;
  // Column position among overlapping events of the same kind (see assignLanes below) — always
  // 0/1 (full width) until lane assignment runs on a same-kind group.
  readonly laneIndex: number;
  readonly laneCount: number;
}

export interface BookingTimelineEvent extends TimelineEventBase {
  readonly kind: 'booking';
  readonly booking: StaffBookingCardResponse;
  readonly warning: boolean;
  // Every resource this booking is actually assigned to (type-prioritized, STAFF > ROOM >
  // EQUIPMENT) — sourced directly from booking.assignedResources, always populated regardless of
  // any resource-filter check state, in every view (Day merged timeline, Day resource-columns
  // board, Week day-cards). Unrelated to the *filtering* rule (which bookings are visible at all
  // when 1+ resources are checked — see isBookingVisibleForResourceFilter), which is Week-view
  // only and still keyed off the checked-resource set. TD44-S2 round 3 (was Week-view-only,
  // checked-resources-only, day-grid-derived through TD44-S1/round 2).
  readonly resourceNames: readonly string[];
}

export interface ClosureTimelineEvent extends TimelineEventBase {
  readonly kind: 'closure';
  readonly closure: ScheduleClosure;
  // Resolved from closure.resourceId via the resourceNameById map passed into
  // buildClosureTimelineEvent — null for a tenant-wide closure (resourceId unset) or when the
  // resource's own name isn't in the (MANAGER-only) fetched list yet.
  readonly resourceName: string | null;
}

export interface OpeningTimelineEvent extends TimelineEventBase {
  readonly kind: 'opening';
  readonly opening: ScheduleOpening;
  readonly resourceName: string | null;
}

export type TimelineEvent = BookingTimelineEvent | ClosureTimelineEvent | OpeningTimelineEvent;

export function getBookingTimeKey(
  booking: StaffBookingCardResponse,
  timezone: string,
): {
  readonly startTime: string;
  readonly endTime: string;
} {
  const start = new Date(booking.scheduledAt);
  const end = new Date(start.getTime() + booking.totalDurationMins * 60_000);
  return {
    startTime: getLocalTimeKey(start, timezone),
    endTime: getLocalTimeKey(end, timezone),
  };
}

export function getBookingDateKey(booking: StaffBookingCardResponse, timezone: string): string {
  return toISODateInTimezone(new Date(booking.scheduledAt), timezone);
}

function resolveResourceName(
  resourceId: string | null,
  resourceNameById: ReadonlyMap<string, string>,
): string | null {
  return resourceId ? (resourceNameById.get(resourceId) ?? null) : null;
}

export function buildBookingTimelineEvent(
  booking: StaffBookingCardResponse,
  timezone: string,
  selectedDayClosures: readonly ScheduleClosure[],
  activeStartTime: string,
  activeEndTime: string,
): BookingTimelineEvent {
  const { startTime, endTime } = getBookingTimeKey(booking, timezone);
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const warning = selectedDayClosures.some((closure) => {
    const closureStart = closure.startTime ?? activeStartTime;
    const closureEnd = closure.endTime ?? activeEndTime;
    return overlaps(
      startMinutes,
      endMinutes,
      timeToMinutes(closureStart),
      timeToMinutes(closureEnd),
    );
  });
  // Always sourced from the booking's own assigned resources — present on every booking
  // regardless of any resource-filter check state (TD44-S2 round 3). Type-prioritized
  // (STAFF > ROOM > EQUIPMENT), alphabetical tiebreak within the same type. Falls back to an
  // empty array defensively — the field is required at the type level, but this guards against a
  // stale cached response from before it existed.
  const resourceNames = [...(booking.assignedResources ?? [])]
    .sort(compareResourceAssignmentsByTypePriority)
    .map((r) => r.resourceName);

  return {
    kind: 'booking',
    id: booking.bookingId,
    startMinutes,
    endMinutes,
    title: booking.contactName,
    subtitle: booking.serviceNames.join(', '),
    booking,
    warning,
    resourceNames,
    laneIndex: 0,
    laneCount: 1,
  };
}

export function buildClosureTimelineEvent(
  closure: ScheduleClosure,
  activeStartTime: string,
  activeEndTime: string,
  resourceNameById: ReadonlyMap<string, string>,
): ClosureTimelineEvent {
  const startTime = closure.startTime ?? activeStartTime;
  const endTime = closure.endTime ?? activeEndTime;

  return {
    kind: 'closure',
    id: closure.id,
    startMinutes: timeToMinutes(startTime),
    endMinutes: timeToMinutes(endTime),
    title: closure.reason,
    subtitle: closure.notes ?? '',
    closure,
    resourceName: resolveResourceName(closure.resourceId, resourceNameById),
    laneIndex: 0,
    laneCount: 1,
  };
}

export function buildOpeningTimelineEvent(
  selectedOpening: ScheduleOpening | null,
  resourceNameById: ReadonlyMap<string, string>,
): OpeningTimelineEvent | null {
  if (!selectedOpening) return null;

  return {
    kind: 'opening',
    id: selectedOpening.id,
    startMinutes: timeToMinutes(selectedOpening.startTime),
    endMinutes: timeToMinutes(selectedOpening.endTime),
    title: selectedOpening.notes ?? '',
    subtitle: '',
    opening: selectedOpening,
    resourceName: resolveResourceName(selectedOpening.resourceId, resourceNameById),
    laneIndex: 0,
    laneCount: 1,
  };
}

// Generic overlap/lane-splitting algorithm — originally booking-only, generalized (M21-S05
// live-testing follow-up) to also split overlapping same-kind closures side-by-side, since
// multiple resources' blocks landing on the same time window otherwise render fully stacked on
// top of each other with no way to tell them apart. Openings never call this today (see
// buildOpeningTimelineEvent's own note), but it works identically for any TimelineEventBase kind.
export function groupOverlappingEvents<T extends TimelineEventBase>(events: readonly T[]): T[][] {
  const grouped: T[][] = [];
  let currentGroup: T[] = [];
  let currentGroupEnd = -Infinity;

  for (const event of [...events].sort(
    (left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes,
  )) {
    const startsNewGroup = currentGroup.length === 0 || event.startMinutes >= currentGroupEnd;
    if (startsNewGroup) {
      if (currentGroup.length > 0) grouped.push(currentGroup);
      currentGroup = [event];
      currentGroupEnd = event.endMinutes;
      continue;
    }

    currentGroup.push(event);
    currentGroupEnd = Math.max(currentGroupEnd, event.endMinutes);
  }

  if (currentGroup.length > 0) grouped.push(currentGroup);
  return grouped;
}

export function assignLanesToEventGroup<T extends TimelineEventBase>(group: readonly T[]): T[] {
  const laneEnds: number[] = [];
  const laneAssignments = new Map<string, number>();

  for (const event of group) {
    const laneIndex = laneEnds.findIndex((endMinutes) => endMinutes <= event.startMinutes);
    const resolvedLaneIndex = laneIndex === -1 ? laneEnds.length : laneIndex;
    laneEnds[resolvedLaneIndex] = event.endMinutes;
    laneAssignments.set(event.id, resolvedLaneIndex);
  }

  const laneCount = laneEnds.length;
  return group.map((event) => ({
    ...event,
    laneIndex: laneAssignments.get(event.id) ?? 0,
    laneCount,
  }));
}

export function assignLanes<T extends TimelineEventBase>(events: readonly T[]): T[] {
  if (events.length === 0) return [];
  return groupOverlappingEvents(events).flatMap(assignLanesToEventGroup);
}
