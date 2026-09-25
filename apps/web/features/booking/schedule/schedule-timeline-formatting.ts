import type { BookingStatus, ScheduleClosure } from '@ikaro/types';
import { SCHEDULE_BOOKING_STATUS_OPTIONS } from '@/features/booking/model/booking-status';
import { parseDateKey } from '@/features/booking/schedule/date-utils';

// Extracted from schedule-timeline.ts (TD44 Story 1) — re-exported there, so every existing
// consumer keeps importing from the same path; this split exists only to keep that file under the
// 250-line cap once Story 1's own resource-filter fields/logic landed there.
//
// Content-driven minimum block heights (TD44 Story 2, round 2 — established as the shared pattern
// for every board: Day view's single timeline, Day view's resource-columns board, and Week view's
// day-cards all pass one of these instead of the old blanket 18px floor). A booking block's height
// can never be shorter than one slot (buildBlockStyle floors event duration at
// slotGranularityMinutes via getEventMinutes), so the true minimum block height *is* getSlotHeight's
// own result — raising its floor here is what stops every board's shortest bookings from clipping
// their own title/subtitle/resource-line/time-range content under TimelineBlockShell's
// overflow-hidden. Desktop mode (larger fonts, Day view) needs more room than compact mode
// (smaller fonts, Week view); both are sized for the worst case — 4 content lines (title, subtitle,
// the divider+resource-summary line, the time range) — with headroom, not just the common 3-line
// case, so a board's row height stays uniform regardless of which bookings happen to have a
// resource match.
export const DESKTOP_MIN_BLOCK_HEIGHT_PX = 108;
export const COMPACT_MIN_BLOCK_HEIGHT_PX = 96;

export function getSlotHeight(slotGranularityMinutes: number, scale = 1, minHeightPx = 18): number {
  return Math.max(minHeightPx, Math.round((slotGranularityMinutes / 30) * 48 * scale));
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
