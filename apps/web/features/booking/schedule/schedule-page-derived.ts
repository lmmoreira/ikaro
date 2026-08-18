import type {
  CreateClosureRequest,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
  TenantDayHours,
} from '@ikaro/types';
import {
  getBookingDateKey,
  getBookingTimeKey,
} from '@/features/booking/schedule/schedule-timeline-events';
import {
  getDayHoursForDate,
  minutesToTime,
  overlaps,
  timeToMinutes,
} from '@/features/booking/schedule/date-utils';

export interface ScheduleWeekDayInfo {
  readonly dateKey: string;
  readonly opening: ScheduleOpening | null;
  readonly hours: TenantDayHours | null;
  readonly isClosed: boolean;
}

export function buildWeekDayInfo(
  weekDates: readonly string[],
  visibleOpenings: readonly ScheduleOpening[],
  businessHours: TenantBusinessHours,
): ScheduleWeekDayInfo[] {
  return weekDates.map((dateKey) => {
    const opening = visibleOpenings.find((item) => item.date === dateKey) ?? null;
    const hours = getDayHoursForDate(dateKey, businessHours);
    const isClosed = !hours && !opening;
    return { dateKey, opening, hours, isClosed };
  });
}

export function buildActiveDates(
  visibleBookings: readonly StaffBookingCardResponse[],
  visibleOpenings: readonly ScheduleOpening[],
  visibleClosures: readonly ScheduleClosure[],
  timezone: string,
): Set<string> {
  const dates = new Set<string>();
  for (const booking of visibleBookings) {
    dates.add(getBookingDateKey(booking, timezone));
  }
  for (const opening of visibleOpenings) {
    dates.add(opening.date);
  }
  for (const closure of visibleClosures) {
    dates.add(closure.date);
  }
  return dates;
}

export function buildDimmedDates(weekDayInfo: readonly ScheduleWeekDayInfo[]): Set<string> {
  return new Set(weekDayInfo.filter((day) => day.isClosed).map((day) => day.dateKey));
}

export function buildSlotLabels(
  slotCount: number,
  timelineStartMinutes: number,
  slotGranularityMinutes: number,
): string[] {
  return Array.from({ length: slotCount }, (_, index) =>
    minutesToTime(timelineStartMinutes + index * slotGranularityMinutes),
  );
}

export function resolveTimelineTitle(
  t: (key: 'statusRegularOpen' | 'specialOpeningBadge' | 'statusClosed') => string,
  selectedOpening: ScheduleOpening | null,
  selectedDayClosed: boolean,
): string {
  if (selectedOpening) return t('specialOpeningBadge');
  if (selectedDayClosed) return t('statusClosed');
  return t('statusRegularOpen');
}

export function countOverlappingBookings(
  visibleBookings: readonly StaffBookingCardResponse[],
  timezone: string,
  body: CreateClosureRequest,
  dayHours: TenantDayHours | null,
): number {
  return visibleBookings.filter((booking) => {
    if (getBookingDateKey(booking, timezone) !== body.date) return false;
    const { startTime, endTime } = getBookingTimeKey(booking, timezone);
    const bookingStart = timeToMinutes(startTime);
    const bookingEnd = timeToMinutes(endTime);
    const start = body.startTime ?? dayHours?.open ?? '00:00';
    const end = body.endTime ?? dayHours?.close ?? '23:59';
    return overlaps(bookingStart, bookingEnd, timeToMinutes(start), timeToMinutes(end));
  }).length;
}
