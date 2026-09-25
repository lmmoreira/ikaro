import type { BookingStatus, ScheduleClosure } from '@ikaro/types';
import { SCHEDULE_BOOKING_STATUS_OPTIONS } from '@/features/booking/model/booking-status';
import { parseDateKey } from '@/features/booking/schedule/date-utils';

// Extracted from schedule-timeline.ts (TD44 Story 1) — re-exported there, so every existing
// consumer keeps importing from the same path; this split exists only to keep that file under the
// 250-line cap once Story 1's own resource-filter fields/logic landed there.
//
// Grid coordinate unit vs. per-block content-fit floor (TD44 Story 4 — decoupled; previously TD44
// Story 2 round 2 fed a single conflated `minHeightPx` into getSlotHeight, which raised the *whole
// grid's* base unit along with each block's own floor, since slotCount * slotHeight is also the
// board's total scroll height). getSlotHeight below is now purely the grid's pixels-per-slot
// coordinate unit — no floor argument — restoring the pre-Story-2 density (48px per 30-min slot,
// the value this formula already produced whenever a slot's duration reached 30+ minutes; the old
// bare 18px floor never won against it). DESKTOP_MIN_BLOCK_HEIGHT_PX/COMPACT_MIN_BLOCK_HEIGHT_PX
// (unchanged values) are applied separately, per block, as a CSS min-height on that block's own
// rendered box (TimelineBlockShell's style prop) — never fed back into slotHeight/buildBlockStyle,
// so a block whose content needs more room than its true duration-based height simply renders
// visually taller than its own slot, the same way Google Calendar renders a short event, with zero
// effect on sibling positioning or the day's total height. Desktop mode (larger fonts, Day view)
// needs more room than compact mode (smaller fonts, Week view); both are sized for the worst case —
// 4 content lines (title, subtitle, the divider+resource-summary line, the time range) — with
// headroom, not just the common 3-line case, so a board's row height stays uniform regardless of
// which bookings happen to have a resource match.
export const DESKTOP_MIN_BLOCK_HEIGHT_PX = 108;
export const COMPACT_MIN_BLOCK_HEIGHT_PX = 96;

export function getSlotHeight(slotGranularityMinutes: number, scale = 1): number {
  return Math.round((slotGranularityMinutes / 30) * 48 * scale);
}

// The per-block content-fit floor (TD44 Story 4) — resolves which of the two constants above
// applies to a given board, so callers don't repeat the compact/desktop ternary at each of the 3
// render sites (booking/opening/closure blocks all need the same floor within one board).
export function getBlockMinHeightPx(compact: boolean): number {
  return compact ? COMPACT_MIN_BLOCK_HEIGHT_PX : DESKTOP_MIN_BLOCK_HEIGHT_PX;
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
