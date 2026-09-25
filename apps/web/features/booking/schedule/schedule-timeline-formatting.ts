import type { BookingStatus, ScheduleClosure } from '@ikaro/types';
import { SCHEDULE_BOOKING_STATUS_OPTIONS } from '@/features/booking/model/booking-status';
import { parseDateKey } from '@/features/booking/schedule/date-utils';

// Extracted from schedule-timeline.ts (TD44 Story 1) — re-exported there, so every existing
// consumer keeps importing from the same path; this split exists only to keep that file under the
// 250-line cap once Story 1's own resource-filter fields/logic landed there.
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
