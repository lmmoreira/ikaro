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
// coordinate unit — no floor argument.
//
// Base value raised 48 -> 72 (TD44 Story 5): Story 5 reverted Story 4's minimum-granularity
// special case (the time-range line now always renders), which raised a minimum-granularity
// booking's footer back to 1-2 lines every time instead of 0-1. At the pre-Story-5 base (48px per
// 30-min slot), a minimum-granularity block's content-fit floor (84px with no resource-summary
// line — just the always-shown time range — or 108px with one) visibly overhung its own true slot
// height, most noticeably in Day view. 72 was picked via a live comparison against the running app
// (60/64/72 candidates, Day + Week view, TD44 Story 5 story-discovery) as the value that most
// narrows that gap across every duration without reopening TD44-S4's original "grid too tall"
// problem — an 18-slot (9-hour) business day now renders at 18 * 72 = 1296px, comfortably
// navigable with scroll-to-now (TD44 Story 4) already in place, and Week view's compact scale
// (0.85) applies on top automatically.
//
// The per-block content-fit floor is now content-aware (TD44 Story 4): a single fixed floor per
// board — even after decoupling it from the grid unit — still forced every block to the *worst
// case* (4 lines: title, subtitle, resource-summary, time-range),
// which visibly overflowed a short booking's own true time span once the grid itself became
// correctly proportional again (a 30-min booking rendering ~4.4x taller than its real slot, per a
// live report against the shipped build). getBlockMinHeightPx below instead scales with how many
// *optional* footer lines a given block actually renders — 0 for closures/openings (no footer at
// all), 0–2 for a booking depending on whether its resource-summary and/or time-range lines show.
// DESKTOP_MIN_BLOCK_HEIGHT_PX/COMPACT_MIN_BLOCK_HEIGHT_PX (values unchanged) remain the *worst-case*
// ceiling for a 4-line booking — CONTENT_LINE_HEIGHT_PX is derived so that
// base + 2*lineHeight reproduces each exactly, so the worst case (which is what TD44 Story 2 round 2
// was originally sized for) is unaffected by this change.
export const DESKTOP_MIN_BLOCK_HEIGHT_PX = 108;
export const COMPACT_MIN_BLOCK_HEIGHT_PX = 96;
const DESKTOP_BASE_MIN_HEIGHT_PX = 60;
const COMPACT_BASE_MIN_HEIGHT_PX = 48;
const CONTENT_LINE_HEIGHT_PX = 24;

export function getSlotHeight(slotGranularityMinutes: number, scale = 1): number {
  return Math.round((slotGranularityMinutes / 30) * 72 * scale);
}

// The per-block content-fit floor (TD44 Story 4) — `extraLineCount` is the number of *optional*
// footer lines this specific block renders beyond its always-present title/subtitle row (0, 1, or
// 2): a closure/opening block (no footer) always passes 0; a booking block passes the count of its
// resource-summary/time-range lines that actually render for it.
export function getBlockMinHeightPx(compact: boolean, extraLineCount: number): number {
  const base = compact ? COMPACT_BASE_MIN_HEIGHT_PX : DESKTOP_BASE_MIN_HEIGHT_PX;
  return base + extraLineCount * CONTENT_LINE_HEIGHT_PX;
}

export function getEventMinutes(
  startMinutes: number,
  endMinutes: number,
  slotMinutes: number,
): number {
  return Math.max(slotMinutes, endMinutes - startMinutes);
}

// Moved from schedule-timeline.ts (TD44 Story 3) to stay under that file's 250-line cap.
// Re-exported for schedule-shared-timeline-window.ts — applySharedTimelineWindow needs to
// recompute a shared-group member's slotCount against the union range, using the exact same
// formula the grid itself is built from.
export function resolveSlotCount(
  timelineStartMinutes: number,
  timelineEndMinutes: number,
  slotGranularityMinutes: number,
): number {
  return Math.max(
    1,
    Math.ceil((timelineEndMinutes - timelineStartMinutes) / slotGranularityMinutes),
  );
}

// Moved from schedule-timeline.ts (TD44 Story 3) to stay under that file's 250-line cap once this
// story's shared-window plumbing landed there — pure coordinate math, no dependency on
// TimelineEvent/domain types, fits this file's existing purpose exactly.
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

// Shared by every schedule surface that links to a booking's detail page (the merged timeline's
// own blocks, TD43's spillover banner) — a single source for this URL shape.
export function buildBookingDetailHref(bookingId: string, scheduleReturnTo: string): string {
  return `/dashboard/bookings/${bookingId}?returnTo=${encodeURIComponent(scheduleReturnTo)}`;
}
