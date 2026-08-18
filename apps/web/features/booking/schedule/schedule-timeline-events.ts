import type { ScheduleClosure, ScheduleOpening, StaffBookingCardResponse } from '@ikaro/types';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { getLocalTimeKey, overlaps, timeToMinutes } from '@/features/booking/schedule/date-utils';

export interface TimelineEventBase {
  readonly id: string;
  readonly startMinutes: number;
  readonly endMinutes: number;
  readonly title: string;
  readonly subtitle: string;
}

export interface BookingTimelineEvent extends TimelineEventBase {
  readonly kind: 'booking';
  readonly booking: StaffBookingCardResponse;
  readonly warning: boolean;
  readonly laneIndex: number;
  readonly laneCount: number;
}

export interface ClosureTimelineEvent extends TimelineEventBase {
  readonly kind: 'closure';
  readonly closure: ScheduleClosure;
}

export interface OpeningTimelineEvent extends TimelineEventBase {
  readonly kind: 'opening';
  readonly opening: ScheduleOpening;
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

  return {
    kind: 'booking',
    id: booking.bookingId,
    startMinutes,
    endMinutes,
    title: booking.contactName,
    subtitle: booking.serviceNames.join(', '),
    booking,
    warning,
    laneIndex: 0,
    laneCount: 1,
  };
}

export function buildClosureTimelineEvent(
  closure: ScheduleClosure,
  activeStartTime: string,
  activeEndTime: string,
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
  };
}

export function buildOpeningTimelineEvent(
  selectedOpening: ScheduleOpening | null,
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
  };
}

export function groupOverlappingBookings(
  bookings: readonly BookingTimelineEvent[],
): BookingTimelineEvent[][] {
  const grouped: BookingTimelineEvent[][] = [];
  let currentGroup: BookingTimelineEvent[] = [];
  let currentGroupEnd = -Infinity;

  for (const booking of [...bookings].sort(
    (left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes,
  )) {
    const startsNewGroup = currentGroup.length === 0 || booking.startMinutes >= currentGroupEnd;
    if (startsNewGroup) {
      if (currentGroup.length > 0) grouped.push(currentGroup);
      currentGroup = [booking];
      currentGroupEnd = booking.endMinutes;
      continue;
    }

    currentGroup.push(booking);
    currentGroupEnd = Math.max(currentGroupEnd, booking.endMinutes);
  }

  if (currentGroup.length > 0) grouped.push(currentGroup);
  return grouped;
}

export function assignLanesToBookingGroup(
  group: readonly BookingTimelineEvent[],
): BookingTimelineEvent[] {
  const laneEnds: number[] = [];
  const laneAssignments = new Map<string, number>();

  for (const booking of group) {
    const laneIndex = laneEnds.findIndex((endMinutes) => endMinutes <= booking.startMinutes);
    const resolvedLaneIndex = laneIndex === -1 ? laneEnds.length : laneIndex;
    laneEnds[resolvedLaneIndex] = booking.endMinutes;
    laneAssignments.set(booking.id, resolvedLaneIndex);
  }

  const laneCount = laneEnds.length;
  return group.map((booking) => ({
    ...booking,
    laneIndex: laneAssignments.get(booking.id) ?? 0,
    laneCount,
  }));
}

export function assignBookingLanes(
  bookings: readonly BookingTimelineEvent[],
): BookingTimelineEvent[] {
  if (bookings.length === 0) return [];
  return groupOverlappingBookings(bookings).flatMap(assignLanesToBookingGroup);
}
